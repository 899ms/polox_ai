import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import sharp from 'sharp'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
function load(relative, mocks = {}, globals = {}) {
  const cache = new Map()
  function moduleAt(file) {
    if (cache.has(file))
      return cache.get(file)
    const module = { exports: {} }
    cache.set(file, module.exports)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, {
      module,
      Error,
      exports: module.exports,
      fetch,
      AbortSignal,
      setTimeout,
      structuredClone,
      createError: details => Object.assign(new Error(details.statusMessage), details),
      ...globals,
      require: (id) => {
        if (id.endsWith('/serviceSettings')) return { readServiceSettings: () => ({ falKey: 'test-key', openRouterKey: 'test-key' }) }
        if (id in mocks)
          return mocks[id]
        if (id.startsWith('.') || id.startsWith('~~/')) {
          const target = id.startsWith('~~/') ? resolve(root, id.slice(3)) : resolve(dirname(file), id)
          return target.endsWith('.json') ? JSON.parse(readFileSync(target, 'utf8')) : moduleAt(`${target}.ts`)
        }
        return require(id)
      },
    }, { filename: file })
    return module.exports
  }
  return moduleAt(resolve(root, relative))
}
const annotations = load('shared/utils/imageAnnotations.ts')
const choices = load('shared/utils/agentChoices.ts')
const sourceUrl = 'https://example.com/source.png'
const edit = { imageUrl: sourceUrl, points: [{ x: 250, y: 750, text: 'Make the coat red' }, { x: 900, y: 50, text: 'Remove the sign' }] }
const context = vm.createContext({ ...annotations, ...choices })
for (const [file, name] of [['server/agent/router.ts', 'parseChoiceBody'], ['server/agent/loop.ts', 'formatChoiceResult']]) {
  const ast = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
}
const payload = { questions: [{ id: 'image_edit_method', options: [{ id: 'annotate', label: 'Annotate' }, { id: 'describe', label: 'Text description' }] }] }

test('choice parser preserves exact point edits and strips untrusted annotation URLs', () => {
  const body = context.parseChoiceBody({ choiceId: 'choice', action: 'submit', answers: [{ questionId: 'image_edit_method', optionId: 'annotate', annotationEdit: { ...edit, annotatedImageUrl: 'https://untrusted.example/guide.png' } }] })
  const result = JSON.parse(context.formatChoiceResult(payload, body, [sourceUrl]))
  assert.deepEqual(result.answers[0].annotationEdit, edit)
})

test('annotation validation rejects missing descriptions, invalid coordinates, foreign sources and excessive points', () => {
  for (const invalid of [
    { ...edit, imageUrl: 'https://foreign.example/a.png' },
    { ...edit, points: [] },
    { ...edit, points: Array.from({ length: 17 }).fill(edit.points[0]) },
    { ...edit, points: [{ x: -1, y: 5, text: 'test' }] },
    { ...edit, points: [{ x: 1001, y: 5, text: 'test' }] },
    { ...edit, points: [{ x: 1.5, y: 5, text: 'test' }] },
    { ...edit, points: [{ x: 1, y: 5, text: ' ' }] },
    { ...edit, points: [{ x: 1, y: 5, text: 'x'.repeat(1001) }] },
  ]) assert.throws(() => annotations.validateImageAnnotationEdit(invalid, [sourceUrl]))
})

test('text mode and skip do not submit stale point edits', () => {
  for (const body of [
    { action: 'skip' },
    { action: 'submit', answers: [{ questionId: 'image_edit_method', optionId: 'describe', annotationEdit: edit }] },
  ]) assert.ok(!context.formatChoiceResult(payload, body, [sourceUrl]).includes('annotationEdit'))
})

test('renderer produces a separate PNG with numbered markers and preserves dimensions', async () => {
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).png().toBuffer()
  let uploaded
  const renderer = load('server/agent/imageAnnotations.ts', { './upload': { uploadAgentImage: async (session, file) => {
    assert.equal(session, 'session')
    uploaded = file
    return 'https://example.com/guide.png'
  } } }, {
    fetch: async (url) => { assert.equal(url, sourceUrl); return new Response(original) },
  })
  assert.equal(await renderer.renderAnnotationImage(edit, 'session'), 'https://example.com/guide.png')
  const { width, height } = await sharp(uploaded.bytes).metadata()
  assert.equal(width, 800)
  assert.equal(height, 600)
  assert.equal(uploaded.mime, 'image/png')
  assert.notDeepEqual(uploaded.bytes, original)
  const pixels = await sharp(uploaded.bytes).removeAlpha().raw().toBuffer()
  const offset = (450 * 800 + 205) * 3
  assert.ok(pixels[offset] > pixels[offset + 1], 'Marker region should contain rose-red pixels')
})

const confirmed = { ...edit, annotatedImageUrl: 'https://example.com/guide.png' }
const session = { id: 'session', ownerUserId: 'owner', images: [{ id: 'source', url: sourceUrl, status: 'success', kind: 'upload' }], messages: [{ role: 'user', content: 'Edit this image' }, { role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'image_edit_method', optionId: 'annotate', annotationEdit: confirmed }] }) }] }
const api = load('server/agent/models.ts', {
  './httpError': { toUpstreamApiError: error => error },
  './session': {},
  './slots': {},
  '../models/generationJob': {},
  '../utils/generationPipeline': {},
  '../utils/videoDuration': { referenceVideoDurationLimits: () => ({ minEach: 1, maxEach: 30, maxTotal: 30 }) },
}, { console })
const registry = load('shared/utils/agentModels.ts')
for (const id of ['gpt-image-2-image-to-image', 'nano-banana-2-image-to-image']) {
  test(`${id}: source and guide are submitted in order with the LLM prompt`, async () => {
    const args = await api.prepareModelGeneration(registry.agentModelToolName(id), JSON.stringify({ prompt: 'Edit image 1 following points on image 2. Point 1: red coat. Point 2: remove sign. Return no annotation marks.' }), session)
    const field = ['images', 'input_urls', 'image_urls', 'image_input'].find(key => args.input[key])
    assert.deepEqual(Array.from(args.input[field]), [sourceUrl, confirmed.annotatedImageUrl])
    assert.match(args.input.prompt, /Point 1: red coat/)
    assert.equal(args.modelId, id)
  })
}

test('annotation confirmation renders before continuing, and failures keep the card retryable', async () => {
  const file = 'server/agent/loop.ts'
  const ast = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleChoice')
  for (const fail of [true, false]) {
    const pending = { payload: { ...payload, id: 'card' }, items: [{ toolCallId: 'ask' }] }
    const current = { id: 'session', images: session.images, messages: [], busy: false, pendingChoice: pending }
    const outputs = []
    let continued = false
    const ctx = vm.createContext({
      requireLoadedSession: async () => current,
      emitSessionCatchUp: () => {},
      choiceAlreadyAnswered: () => false,
      touch: () => {},
      formatChoiceResult: context.formatChoiceResult,
      validateAnnotationReferences: async () => {},
      sketchBrief: () => null,
      renderAnnotationImage: async () => {
        assert.equal(current.busy, true)
        assert.equal(current.pendingChoice, pending)
        if (fail)
          throw new Error('Image could not be loaded')
        return 'https://example.com/guide.png'
      },
      modelPreferenceFromChoice: () => null,
      appendToolResult: (_session, _call, result) => outputs.push(JSON.parse(result)),
      sessionWantsStop: () => false,
      runAgentLoop: async () => { continued = true },
    })
    vm.runInContext(ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
    const run = ctx.handleChoice('session', { choiceId: 'card', action: 'submit', answers: [{ questionId: 'image_edit_method', optionId: 'annotate', annotationEdit: edit }] }, () => {})
    if (fail) {
      await assert.rejects(run, /could not be loaded/)
      assert.equal(current.pendingChoice, pending)
      assert.equal(outputs.length, 0)
      assert.equal(continued, false)
    }
    else {
      await run
      assert.equal(current.pendingChoice, null)
      assert.equal(outputs[0].answers[0].annotationEdit.annotatedImageUrl, 'https://example.com/guide.png')
      assert.equal(continued, true)
    }
    assert.equal(current.busy, false)
  }
})

test('bundled skill loader discovers the copied editing skill outside the source tree', () => {
  const folder = mkdtempSync(resolve(tmpdir(), 'polox-skills-'))
  try {
    const destination = resolve(folder, 'server/agent-skills')
    mkdirSync(destination, { recursive: true })
    cpSync(resolve(root, 'server/agent/skills'), destination, { recursive: true })
    const bundledUrl = pathToFileURL(resolve(folder, 'server/chunks/runtime/skills.mjs')).href
    const source = readFileSync(resolve(root, 'server/agent/skills.ts'), 'utf8').replaceAll('import.meta.url', JSON.stringify(bundledUrl))
    const module = { exports: {} }
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module,
      exports: module.exports,
      require,
    })
    assert.ok(module.exports.loadAgentSkills().some(skill => skill.startsWith('# Image editing')))
  }
  finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('thumbnail references survive validation without filenames in the description', () => {
  const reference = { name: 'the-dog-img.png', url: 'https://example.com/dog.png' }
  const annotated = { ...edit, points: [{ x: 1, y: 2, text: 'Add the dog here', references: [reference] }] }
  assert.equal(annotations.validateImageAnnotationEdit(annotated, [sourceUrl]).points[0].references[0].url, reference.url)
  for (const references of [[{ ...reference, url: 'file:///secret' }], [{ ...reference, name: '' }], Array.from({ length: 15 }).fill(reference), 'bad'])
    assert.throws(() => annotations.validateImageAnnotationEdit({ ...annotated, points: [{ ...annotated.points[0], references }] }, [sourceUrl]))
})

test('project reference validation is scoped to owner/project and rejects inaccessible files', async () => {
  const dog = 'https://example.com/dog.png'
  const queryScopes = []
  const mockedQuery = rows => ({ find: (query) => {
    queryScopes.push(query)
    return { select: () => ({ lean: async () => rows }) }
  } })
  const resolver = load('server/agent/annotationReferences.ts', {
    '../models/agentChat': { AgentChat: mockedQuery([]) },
    '../models/generationJob': { GenerationJob: mockedQuery([{ resultUrls: [dog] }]) },
    '../utils/mongo': { connectMongo: async () => {} },
  })
  const referenced = { ...edit, points: [{ ...edit.points[0], references: [{ name: 'dog', url: dog }] }] }
  await resolver.validateAnnotationReferences(referenced, { ...session, projectId: 'project' })
  assert.ok(queryScopes.every(query => query.projectId === 'project' && !('userId' in query)))
  await assert.rejects(resolver.validateAnnotationReferences(referenced, session), /belong to this project/)
  await assert.rejects(resolver.validateAnnotationReferences({ ...referenced, points: [{ ...referenced.points[0], references: [{ name: 'foreign', url: 'https://foreign.example/image.png' }] }] }, { ...session, projectId: 'project' }), /no longer available/)
})

test('reference images follow source/guide, deduplicate across points and preserve prompt', async () => {
  const dog = { name: 'the-dog-img.png', url: 'https://example.com/dog.png' }
  const tree = { name: 'tree.png', url: 'https://example.com/tree.png' }
  const annotated = { ...confirmed, points: [{ ...edit.points[0], references: [dog] }, { ...edit.points[1], references: [dog, tree] }] }
  const current = { ...session, messages: [{ role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'image_edit_method', optionId: 'annotate', annotationEdit: annotated }] }) }] }
  const args = await api.prepareModelGeneration(registry.agentModelToolName('gpt-image-2-image-to-image'), JSON.stringify({ prompt: 'At point 1, add the dog from image 3.', images: [tree.url, dog.url, sourceUrl] }), current)
  assert.deepEqual(Array.from(args.input.images), [sourceUrl, confirmed.annotatedImageUrl, dog.url, tree.url])
  assert.equal(args.input.prompt, 'At point 1, add the dog from image 3.')
})

test('annotation uploads save to the active project chat without adding composer attachments', async () => {
  const file = 'app/composables/useAgentLab.ts'
  const ast = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true)
  let fn
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'uploadAnnotationImage')
      fn = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const images = { value: [] }
  const uploaded = { id: 'uploaded-dog', name: 'the-dog-img.png', kind: 'upload', status: 'success', url: 'https://example.com/dog.png' }
  let persisted = false
  const ctx = vm.createContext({
    requireLogin: () => true,
    ensureSession: async () => 'active-session',
    baseUrl: '/api/agent',
    FormData,
    crypto,
    images,
    labHeaders: () => ({}),
    fetch: async (url, request) => {
      assert.equal(url, '/api/agent/v1/uploads?sessionId=active-session')
      assert.equal(request.body.get('file').name, 'the-dog-img.png')
      return { ok: true, json: async () => ({ image: uploaded }) }
    },
    persistChat: async () => { assert.equal(images.value[0], uploaded); persisted = true },
  })
  vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  const result = await ctx.uploadAnnotationImage(new File(['image'], 'the-dog-img.png', { type: 'image/png' }))
  assert.equal(result.url, uploaded.url)
  assert.equal(persisted, true)
  await assert.rejects(ctx.uploadAnnotationImage(new File(['text'], 'notes.txt', { type: 'text/plain' })), /JPEG/)
})

test('editing method cards discard extra goal questions regardless of their labels', () => {
  const extra = { id: 'edit_content', title: '修改内容', prompt: 'What should change?', options: [{ id: 'clothes', label: 'Change clothes' }] }
  const mixed = { questions: [extra, ...payload.questions] }
  const questions = choices.standaloneImageEditQuestions(mixed.questions)
  assert.equal(questions.length, 1)
  assert.equal(questions[0].id, 'image_edit_method')
  const result = JSON.parse(context.formatChoiceResult(mixed, { action: 'submit', answers: [
    { questionId: 'image_edit_method', optionId: 'describe' },
    { questionId: 'edit_content', optionId: 'clothes' },
  ] }))
  assert.equal(result.answers.length, 1)
  assert.equal(result.answers[0].questionId, 'image_edit_method')
  assert.equal(choices.standaloneImageEditQuestions([extra])[0], extra)
})


test('editing method always recommends annotations while preserving both options', () => {
  const original = { ...payload.questions[0], recommendedId: 'describe' }
  const [method] = choices.standaloneImageEditQuestions([original])
  assert.equal(method.recommendedId, 'annotate')
  assert.equal(original.recommendedId, 'describe')
  assert.equal(method.options, original.options)
})
