import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')

function load(relative, mocks = {}) {
  const cache = new Map()
  function moduleAt(file) {
    if (cache.has(file))
      return cache.get(file)
    const module = { exports: {} }
    cache.set(file, module.exports)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      Buffer,
      console,
      JSON,
      Math,
      Map,
      Set,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      URL,
      require: (id) => {
        if (id in mocks)
          return mocks[id]
        if (id.startsWith('.') || id.startsWith('~~/')) {
          const target = id.startsWith('~~/') ? resolve(root, id.slice(3)) : resolve(dirname(file), id)
          const resolved = target.endsWith('.json') ? target : (target.endsWith('.ts') ? target : `${target}.ts`)
          return resolved.endsWith('.json') ? JSON.parse(readFileSync(resolved, 'utf8')) : moduleAt(resolved)
        }
        return require(id)
      },
    }, { filename: file })
    return module.exports
  }
  return moduleAt(resolve(root, relative))
}

const {
  confirmedLayerSelection,
  hasLayerSourceImage,
  isLayerSplitterRequest,
  layerSplitAwaitingAdjust,
  layerSplitBlocksGeneration,
  layerSplitNeedsConfirm,
  layerSplitNeedsPlan,
  layerSplitNeedsSummary,
  needsLayerDescriptionCard,
  textMentionsLayerSplitter,
} = load('server/agent/layerSplitBrief.ts')
const { validateLayerSelection } = load('shared/utils/agentLayerSelection.ts')
const sketchSchema = { components: { schemas: { Input: { properties: {}, required: [] } } } }
const { readModelMentions, publicAgentModels, AGENT_MODELS } = load('shared/utils/agentModels.ts', {
  '../constants/aiModels': {
    AI_MODELS: [{ id: 'sketch-model', name: 'Sketch', category: 'Tools', task: 'Sketch', icon: 'x', schema: sketchSchema }],
    COMPANY_LOGOS: {},
    MODEL_COMPANIES: {},
  },
  './agentSkills': { readSkillCommands: (text) => /(?:^|\s)\/image-layer-splitter(?:-lite)?(?=\s|$)/.test(text) ? [{ id: 'image-layer-splitter' }] : [] },
  './falSchema': { falInputSchema: () => undefined },
  './wavespeedSchema': { wavespeedInputSchema: () => undefined, wavespeedFormSchema: () => undefined },
  './sketchToImage': { SKETCH_TO_IMAGE_MODEL: 'sketch-model', SKETCH_TO_IMAGE_TOOL: 'sketch-to-image' },
  'ajv': function Ajv() { return { compile() { return () => true }, errorsText() { return '' } } },
})

const mention = { role: 'user', content: '@[Image Layer Splitter](model:image-layer-splitter)' }
const upload = { role: 'user', content: [{ type: 'text', text: 'Use the attached still(s).\n\nAttached stills:\n1. https://example.com/image.png' }, { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] }

const image = { id: 'source', url: 'https://example.com/image.png', status: 'success' }

test('layer cards require an available image actually supplied by the user', () => {
  const image = { id: 'source', url: 'https://example.com/image.png', status: 'success' }
  assert.equal(hasLayerSourceImage([mention], []), false)
  assert.equal(hasLayerSourceImage([mention], [image]), false)
  assert.equal(hasLayerSourceImage([mention, upload], [image]), true)
  assert.equal(hasLayerSourceImage([mention, upload], [{ ...image, status: 'fail' }]), false)
  assert.equal(hasLayerSourceImage([mention, upload], [{ ...image, kind: 'video' }]), false)
  assert.equal(hasLayerSourceImage([mention, { ...upload, role: 'assistant' }], [image]), false)
})

test('description method requires a second card even after a text-only reply', () => {
  const call = { role: 'assistant', tool_calls: [{ id: 'method', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_selection_method' }] }) } }] }
  const answer = { role: 'tool', tool_call_id: 'method', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'describe_layers' }] }) }
  const messages = [mention, upload, call, answer]
  assert.equal(needsLayerDescriptionCard(messages), true)
  assert.equal(needsLayerDescriptionCard([...messages, { role: 'assistant', content: 'Tell me which layers.' }]), true)
  const plan = { role: 'assistant', tool_calls: [{ id: 'plan', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_split_plan' }] }) } }] }
  assert.equal(needsLayerDescriptionCard([...messages, plan, { role: 'tool', tool_call_id: 'plan', content: JSON.stringify({ ok: true, skipped: true }) }]), false)
  assert.equal(needsLayerDescriptionCard([...messages, { role: 'user', content: 'Cancel and do something else.' }]), false)
  assert.equal(needsLayerDescriptionCard([mention, upload, call, { ...answer, content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes' }] }) }]), false)
})

test('drawn boxes are validated and unblock the exact selection', () => {
  const selection = validateLayerSelection('image', [[10, 20, 400, 800]], ['image'])
  const result = { role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', ...selection }] }) }
  assert.equal(layerSplitNeedsPlan([mention, upload, result]), false)
  assert.deepEqual(JSON.parse(JSON.stringify(confirmedLayerSelection([mention, upload, result]))), JSON.parse(JSON.stringify(selection)))
  assert.equal(confirmedLayerSelection([mention, upload, result, { role: 'user', content: 'Now extract a different object.' }]), null)
})

test('invalid boxes and unrelated image URLs cannot be submitted', () => {
  for (const regions of [[], [[0, 0, 0, 10]], [[0, 0, 1001, 100]], [[10, 10, 2, 2]], [[0, 0, 1.5, 10]], Array.from({ length: 17 }, () => [0, 0, 50, 50])])
    assert.throws(() => validateLayerSelection('image', regions, ['image']))
  assert.throws(() => validateLayerSelection('other', [[0, 0, 100, 100]], ['image']))
})

test('upload-only follow-up cannot authorize inferred layers', () => {
  const withUpload = [mention, { role: 'assistant', content: 'Please upload an image.' }, upload]
  assert.equal(layerSplitNeedsPlan(withUpload), true)
  assert.equal(layerSplitNeedsPlan([{ ...upload, content: [{ type: 'text', text: mention.content }, upload.content[1]] }]), true)
})

test('method answer alone does not confirm an extraction plan', () => {
  assert.equal(layerSplitNeedsPlan([mention, upload, { role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'describe_layers' }] }) }]), true)
})

test('answered plan proceeds; unconfirmed proposal remains blocked', () => {
  const call = { role: 'assistant', tool_calls: [{ id: 'plan', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_split_plan' }] }) } }] }
  const base = [mention, upload]
  assert.equal(layerSplitNeedsPlan([...base, call]), true)
  for (const result of [{ ok: true, answers: [{ questionId: 'layer_split_plan', optionId: 'subjects' }] }, { ok: true, skipped: true }])
    assert.equal(layerSplitNeedsPlan([...base, call, { role: 'tool', tool_call_id: 'plan', content: JSON.stringify(result) }]), false)
})

test('explicit user targets and unrelated tasks remain unchanged', () => {
  assert.equal(layerSplitNeedsPlan([mention, upload, { role: 'user', content: 'Extract the person on the left.' }]), false)
  assert.equal(layerSplitNeedsPlan([{ role: 'user', content: 'Remove the background.' }, upload]), false)
})

test('image-specific lookup retains earlier images and uses the latest boxes for each image', () => {
  const answer = (imageUrl, regions) => ({ role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageUrl, regions }] }) })
  const original = [[0, 0, 100, 100]]
  const revised = [[100, 100, 500, 500]]
  const messages = [mention, answer('first', original), answer('second', original), answer('second', revised)]
  assert.deepEqual(JSON.parse(JSON.stringify(confirmedLayerSelection(messages, 'first'))), { imageUrl: 'first', regions: original })
  assert.deepEqual(JSON.parse(JSON.stringify(confirmedLayerSelection(messages, 'second'))), { imageUrl: 'second', regions: revised })
  assert.equal(confirmedLayerSelection(messages, 'missing'), null)
  assert.equal(confirmedLayerSelection([...messages, { role: 'user', content: 'Start a new split.' }], 'first'), null)
})

test('layer summary guard survives internal inspection and restoration but resets for a new user request', () => {
  const calls = ['one', 'two'].map(id => ({ id, type: 'function', function: { name: 'model_image_layer_splitter', arguments: '{}' } }))
  const images = [{ id: 'one', modelId: 'image-layer-splitter' }, { id: 'two', modelId: 'image-layer-splitter' }]
  const messages = [mention, { role: 'assistant', tool_calls: calls }, ...calls.map(call => ({ role: 'tool', tool_call_id: call.id, content: '{"ok":true}' }))]
  assert.equal(layerSplitNeedsSummary(messages, images), true)
  assert.equal(layerSplitNeedsSummary(JSON.parse(JSON.stringify(messages)), images), true)
  assert.equal(layerSplitNeedsSummary([...messages, { role: 'user', internal: true, content: 'Inspect these images and retry.' }], images), true)
  assert.equal(layerSplitNeedsSummary([...messages, { role: 'user', content: 'Retry only the failed image.' }], images), false)
  assert.equal(layerSplitNeedsSummary(messages.slice(0, -1), images), false)
  assert.equal(layerSplitNeedsSummary(messages, []), false, 'Parameter validation errors must still allow clarification')
})

test('obsolete lite slash/mention enter the Quality splitter flow without a value branch', () => {
  const liteMention = { role: 'user', content: '@[Image Layer Splitter Lite](model:image-layer-splitter-lite)' }
  const liteSlash = { role: 'user', content: '/image-layer-splitter-lite' }
  assert.equal(textMentionsLayerSplitter(liteMention.content), true)
  assert.equal(textMentionsLayerSplitter(liteSlash.content), true)
  assert.equal(isLayerSplitterRequest([liteMention, upload]), true)
  assert.equal(isLayerSplitterRequest([liteSlash, upload]), true)
  assert.equal(layerSplitNeedsPlan([liteMention, upload]), true)
  assert.equal(layerSplitNeedsPlan([liteMention, upload, { role: 'user', content: 'Extract the red car only.' }]), false)
  // Full-splitter substring must not treat an unrelated model id that merely contains the prefix.
  assert.equal(layerSplitNeedsPlan([{ role: 'user', content: '@[Other](model:image-layer-splitter-extra)' }, upload]), false)
  assert.equal(textMentionsLayerSplitter('@[Other](model:image-layer-splitter-extra)'), false)
  assert.equal(JSON.stringify(readModelMentions('/image-layer-splitter-lite', true)), JSON.stringify(['image-layer-splitter']))
  assert.equal(JSON.stringify(readModelMentions('@[Lite](model:image-layer-splitter-lite)', true)), JSON.stringify(['image-layer-splitter']))
  assert.equal(AGENT_MODELS.some(model => model.id === 'image-layer-splitter-lite'), false)
  assert.equal(publicAgentModels().some(model => model.id === 'image-layer-splitter-lite'), false)
})

test('drawn boxes require inspect-and-confirm before generation', () => {
  const selection = validateLayerSelection('image', [[10, 20, 400, 800]], ['image'])
  const boxes = { role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', ...selection, boxedImageUrl: 'https://example.com/boxed.png' }] }) }
  const base = [mention, upload, boxes]
  assert.equal(layerSplitNeedsPlan(base), false)
  assert.equal(layerSplitNeedsConfirm(base), true)
  assert.equal(layerSplitBlocksGeneration(base), true)
  assert.equal(confirmedLayerSelection(base)?.boxedImageUrl, 'https://example.com/boxed.png')

  const confirmCall = { role: 'assistant', tool_calls: [{ id: 'confirm', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_split_confirm' }] }) } }] }
  const confirmed = { role: 'tool', tool_call_id: 'confirm', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_split_confirm', optionId: 'confirm' }] }) }
  assert.equal(layerSplitNeedsConfirm([...base, confirmCall, confirmed]), false)
  assert.equal(layerSplitBlocksGeneration([...base, confirmCall, confirmed]), false)

  const adjust = { role: 'tool', tool_call_id: 'confirm', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_split_confirm', optionId: 'adjust' }] }) }
  assert.equal(layerSplitNeedsConfirm([...base, confirmCall, adjust]), false)
  assert.equal(layerSplitAwaitingAdjust([...base, confirmCall, adjust]), true)
  assert.equal(layerSplitBlocksGeneration([...base, confirmCall, adjust]), true)
})

test('describe path also requires layer_split_confirm (or legacy plan)', () => {
  const methodCall = { role: 'assistant', tool_calls: [{ id: 'method', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_selection_method' }] }) } }] }
  const methodAnswer = { role: 'tool', tool_call_id: 'method', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'describe_layers' }] }) }
  const base = [mention, upload, methodCall, methodAnswer]
  assert.equal(needsLayerDescriptionCard(base), true)
  assert.equal(layerSplitNeedsConfirm(base), true)
  assert.equal(layerSplitBlocksGeneration(base), true)

  const confirmCall = { role: 'assistant', tool_calls: [{ id: 'confirm', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_split_confirm' }] }) } }] }
  const confirmed = { role: 'tool', tool_call_id: 'confirm', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_split_confirm', optionId: 'confirm' }] }) }
  assert.equal(needsLayerDescriptionCard([...base, confirmCall, confirmed]), false)
  assert.equal(layerSplitNeedsConfirm([...base, confirmCall, confirmed]), false)
  assert.equal(layerSplitNeedsPlan([...base, confirmCall, confirmed]), false)
  assert.equal(layerSplitBlocksGeneration([...base, confirmCall, confirmed]), false)
})

test('quality requires confirm after boxes', () => {
  const selection = validateLayerSelection('image', [[10, 20, 400, 800]], ['image'])
  const boxes = { role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', ...selection }] }) }
  const base = [mention, upload, boxes]
  assert.equal(layerSplitNeedsConfirm(base), true)
  assert.equal(layerSplitBlocksGeneration(base), true)
})

test('after adjust, a new draw-boxes submission clears awaiting and requires confirm again', () => {
  const base = [
    { role: 'user', content: '/image-layer-splitter' },
    { role: 'assistant', tool_calls: [{ id: 'method', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_selection_method', options: [{ id: 'draw_boxes' }, { id: 'describe_layers' }] }] }) } }] },
    { role: 'tool', tool_call_id: 'method', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageSelections: [{ imageUrl: 'https://example.com/a.png', regions: [[10, 10, 100, 100]] }] }] }) },
  ]
  const confirmCall = { role: 'assistant', tool_calls: [{ id: 'confirm', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_split_confirm', options: [{ id: 'confirm' }, { id: 'adjust' }] }] }) } }] }
  const adjust = { role: 'tool', tool_call_id: 'confirm', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_split_confirm', optionId: 'adjust' }] }) }
  assert.equal(layerSplitAwaitingAdjust([...base, confirmCall, adjust]), true)
  assert.equal(layerSplitNeedsConfirm([...base, confirmCall, adjust]), false)
  const method2 = { role: 'assistant', tool_calls: [{ id: 'method2', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'layer_selection_method', options: [{ id: 'draw_boxes' }, { id: 'describe_layers' }] }] }) } }] }
  const redraw = { role: 'tool', tool_call_id: 'method2', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageSelections: [{ imageUrl: 'https://example.com/a.png', regions: [[20, 20, 200, 200]] }] }] }) }
  const afterRedraw = [...base, confirmCall, adjust, method2, redraw]
  assert.equal(layerSplitAwaitingAdjust(afterRedraw), false)
  assert.equal(layerSplitNeedsConfirm(afterRedraw), true)
})
