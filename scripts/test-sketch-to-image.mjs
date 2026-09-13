import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, nextTick, ref, watch } from 'vue'
import { parse } from 'vue/compiler-sfc'

const source = readFileSync(new URL('../shared/utils/sketchToImage.ts', import.meta.url), 'utf8')
const shared = { exports: {} }
vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS }), shared)

function canvasHarness(deferredModel = false) {
  const drawing = ref([])
  const props = {}
  const commands = []
  const ctx = new Proxy({}, {
    set(target, key, value) {
      commands.push([key, value])
      target[key] = value
      return true
    },
    get(target, key) {
      if (key === 'measureText')
        return text => ({ width: text.length * Number.parseFloat(target.font) * 0.6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * Number.parseFloat(target.font) * 0.6, actualBoundingBoxAscent: Number.parseFloat(target.font) * 0.8, actualBoundingBoxDescent: Number.parseFloat(target.font) * 0.2 })
      return target[key] || ((...args) => commands.push([key, ...args]))
    },
  })
  let capture
  let exported
  const state = {
    ...shared.exports,
    exports: {},
    ref,
    computed,
    onMounted: callback => callback(),
    watch,
    nextTick,
    File,
    Blob,
    defineModel: () => deferredModel
      ? computed({
          get: () => drawing.value,
          set: (value) => { void nextTick(() => { drawing.value = value }) },
        })
      : drawing,
    defineProps: () => props,
    defineEmits: () => () => {},
    defineExpose: () => {},
    useTemplateRef: name => ({ value: name === 'surface'
      ? {
          getBoundingClientRect: () => ({ left: 20, top: 40, width: 300, height: 200 }),
          setPointerCapture: id => capture = id,
          hasPointerCapture: id => capture === id,
          releasePointerCapture: () => capture = undefined,
        }
      : { focus() {} } }),
    document: { createElement: () => {
      const canvas = {
        getContext: () => ctx,
        toBlob: (callback) => {
          exported = canvas
          callback(new Blob(['png'], { type: 'image/png' }))
        },
      }
      return canvas
    } },
  }
  const component = parse(readFileSync(new URL('../app/components/tools/SketchCanvas.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content.replace(/^import .*\n/gm, '')
  vm.runInNewContext(ts.transpile(`${component}\nObject.assign(exports, { start, move, finish, undo, redo, clear, startText, textDraft, exportFile, selectElement, removeElement, updateElementText, updateElementColor, updateElementSize, pickElement, cancelPointer, cancelGesture, dragging, rotating, activeIndex, elements, selection, boundsFor, elementTransform, updateElementRotation, startRotation });`, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), state)
  return { ...state.exports, drawing, commands, props, exported: () => exported }
}

test('drawing coordinates stay aligned on mobile and clamp strokes leaving the board', () => {
  const point = shared.exports.sketchPoint(170, 140, { left: 20, top: 40, width: 300, height: 200 })
  assert.equal(point.x, 600)
  assert.equal(point.y, 400)
  const outside = shared.exports.sketchPoint(-10, 300, { left: 20, top: 40, width: 300, height: 200 })
  assert.equal(outside.x, 0)
  assert.equal(outside.y, 800)
})

test('pointer drawing ignores a second finger and survives cancellation, undo and redo', () => {
  const h = canvasHarness()
  const down = { pointerId: 1, button: 0, clientX: 20, clientY: 40, preventDefault() {} }
  h.start(down)
  h.start({ ...down, pointerId: 2 })
  h.move({ ...down, clientX: 170, clientY: 140 })
  h.finish({ pointerId: 2 })
  assert.equal(h.drawing.value.length, 0)
  h.finish({ pointerId: 1 })
  assert.equal(h.drawing.value.length, 1)
  assert.equal(h.drawing.value[0].points.at(-1).x, 600)
  h.undo()
  assert.equal(h.drawing.value.length, 0)
  h.redo()
  assert.equal(h.drawing.value.length, 1)
  h.clear()
  assert.equal(h.drawing.value.length, 0)
  h.undo()
  assert.equal(h.drawing.value.length, 1, 'Clearing a sketch is reversible')
})

test('PNG export rejects a blank board and includes pending Unicode text over white', async () => {
  const h = canvasHarness()
  await assert.rejects(h.exportFile(), /Draw a line or add text/)
  await h.startText({ x: 100, y: 100 })
  h.textDraft.value = '湖边小屋'
  const file = await h.exportFile()
  assert.equal(file.name, 'sketch.png')
  assert.equal(file.type, 'image/png')
  assert.ok(file.size > 0)
  assert.equal(h.exported().width, 1200)
  assert.equal(h.exported().height, 800)
  assert.deepEqual(h.commands.find(command => command[0] === 'fillStyle'), ['fillStyle', '#ffffff'])
  assert.deepEqual(h.commands.find(command => command[0] === 'fillText'), ['fillText', '湖边小屋', 100, 100])
  assert.equal(h.drawing.value[0].text, '湖边小屋', 'Export commits pending text before capture')
})

test('element list edits and deletes affect the exported drawing and remain undoable', async () => {
  const h = canvasHarness()
  h.drawing.value = [
    { kind: 'stroke', color: '#20242c', width: 5, points: [{ x: 20, y: 30 }, { x: 200, y: 300 }] },
    { kind: 'text', color: '#20242c', size: 36, x: 100, y: 100, text: 'Cabin' },
  ]
  h.selectElement(1)
  h.updateElementText(1, '湖边小屋')
  h.updateElementColor(1, '#367bea')
  h.removeElement(0)
  assert.equal(h.activeIndex.value, 0)
  assert.equal(h.drawing.value.length, 1)
  assert.equal(h.drawing.value[0].text, '湖边小屋')
  h.undo()
  assert.equal(h.drawing.value.length, 2)
  await h.exportFile()
  assert.deepEqual(h.commands.find(command => command[0] === 'fillText'), ['fillText', '湖边小屋', 100, 100])
  assert.ok(h.commands.some(command => command[0] === 'fillStyle' && command[1] === '#367bea'))
  assert.equal(h.commands.filter(command => command[0] === 'stroke').length, 1, 'Selection highlights are not exported as strokes')
})

test('export waits for the parent v-model update before capturing newly added text', async () => {
  const h = canvasHarness(true)
  await h.startText({ x: 100, y: 100 })
  h.textDraft.value = 'Latest text'
  await h.exportFile()
  assert.equal(h.activeIndex.value, 0, 'Select the newly added element even before parent props refresh')
  assert.deepEqual(h.commands.find(command => command[0] === 'fillText'), ['fillText', 'Latest text', 100, 100])
})

function dragEvent(x, y, pointerId = 1) {
  return {
    pointerId,
    button: 0,
    clientX: x,
    clientY: y,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { getBBox: () => ({ x: 20, y: 30, width: 180, height: 270 }) },
  }
}

test('dragging previews a stroke without mutating it, then commits one undoable move', async () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'stroke', color: '#20242c', width: 5, points: [{ x: 20, y: 30 }, { x: 200, y: 300 }] }]
  h.selectElement(0)
  h.pickElement(dragEvent(100, 120), 0)
  h.move(dragEvent(110, 130))
  h.move(dragEvent(125, 145))
  assert.equal(h.drawing.value[0].points[0].x, 20)
  assert.equal(h.dragging.value.dx, 100)
  h.finish(dragEvent(125, 145))
  assert.equal(h.drawing.value[0].points[0].x, 120)
  assert.equal(h.drawing.value[0].points[0].y, 130)
  h.undo()
  assert.equal(h.drawing.value[0].points[0].x, 20)
  h.redo()
  assert.equal(h.drawing.value[0].points[0].x, 120)
  await h.exportFile()
  assert.deepEqual(h.commands.find(command => command[0] === 'moveTo'), ['moveTo', 120, 130])
})

test('dragging is constrained to the board and browser cancellation preserves the final visible position', () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'stroke', color: '#20242c', width: 5, points: [{ x: 20, y: 30 }, { x: 200, y: 300 }] }]
  h.selectElement(0)
  h.pickElement(dragEvent(20, 40), 0)
  h.move(dragEvent(900, 900))
  assert.equal(h.dragging.value.dx, 997.5)
  assert.equal(h.dragging.value.dy, 497.5)
  h.cancelPointer(dragEvent(900, 900, 2))
  assert.ok(h.dragging.value, 'Ignore a second finger')
  h.cancelPointer(dragEvent(900, 900))
  assert.equal(h.dragging.value, null)
  assert.equal(h.drawing.value[0].points[0].x, 1017.5)
  h.undo()
  assert.equal(h.drawing.value[0].points[0].x, 20)
})

test('text movement and font enlargement reach PNG export and support undo', async () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'text', color: '#20242c', size: 36, x: 100, y: 100, text: 'Cabin' }]
  h.selectElement(0)
  h.pickElement(dragEvent(100, 120), 0)
  h.move(dragEvent(125, 145))
  h.finish(dragEvent(125, 145))
  h.updateElementSize(0, 96)
  await h.exportFile()
  assert.deepEqual(h.commands.find(command => command[0] === 'fillText'), ['fillText', 'Cabin', 200, 200])
  assert.deepEqual(h.commands.findLast(command => command[0] === 'font'), ['font', '96px Arial, sans-serif'])
  h.undo()
  assert.equal(h.drawing.value[0].size, 36)
  h.updateElementSize(0, Number.NaN)
  assert.equal(h.drawing.value[0].size, 36)
  h.updateElementSize(0, 900)
  assert.equal(h.drawing.value[0].size, 240)
})

test('lost capture commits once, and delayed parent updates cannot rewind consecutive drags', async () => {
  const h = canvasHarness(true)
  h.drawing.value = [{ kind: 'text', color: '#20242c', size: 36, x: 100, y: 100, text: 'Cabin' }]
  h.selectElement(0)
  h.pickElement(dragEvent(100, 100), 0)
  h.move(dragEvent(110, 110))
  h.cancelPointer({ ...dragEvent(110, 110), type: 'lostpointercapture' })
  assert.equal(h.elements.value[0].x, 140, 'Local state commits before the parent rerenders')
  h.cancelPointer({ ...dragEvent(110, 110), type: 'lostpointercapture' })
  h.pickElement(dragEvent(110, 110), 0)
  h.finish({ ...dragEvent(120, 120), type: 'pointerup' })
  assert.equal(h.elements.value[0].x, 180, 'Use the latest pointerup coordinates and committed origin')
  await nextTick()
  assert.equal(h.drawing.value[0].x, 180)
  h.undo()
  assert.equal(h.elements.value[0].x, 140)
  h.undo()
  assert.equal(h.elements.value[0].x, 100, 'Duplicate capture loss does not create an undo entry')
})

test('Escape explicitly discards a gesture without changing the saved element', () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'text', color: '#20242c', size: 36, x: 100, y: 100, text: 'Cabin' }]
  h.selectElement(0)
  h.pickElement(dragEvent(100, 100), 0)
  h.move(dragEvent(140, 140))
  h.cancelGesture({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(h.drawing.value[0].x, 100)
  assert.equal(h.dragging.value, null)
})

test('text and strokes rotate around their own bounds and preserve rotation in PNG and history', async () => {
  const h = canvasHarness()
  h.drawing.value = [
    { kind: 'stroke', color: '#20242c', width: 5, points: [{ x: 100, y: 100 }, { x: 300, y: 200 }] },
    { kind: 'text', color: '#20242c', size: 36, x: 500, y: 300, text: 'Cabin' },
  ]
  h.updateElementRotation(0, 90)
  h.updateElementRotation(1, -45)
  assert.equal(h.drawing.value[0].rotation, 90)
  assert.equal(h.drawing.value[1].rotation, 315)
  await h.exportFile()
  assert.deepEqual(h.commands.filter(command => command[0] === 'rotate').map(command => command[1]), [Math.PI / 2, 315 * Math.PI / 180])
  assert.equal(h.commands.filter(command => command[0] === 'save').length, 2)
  assert.equal(h.commands.filter(command => command[0] === 'restore').length, 2)
  h.undo()
  assert.equal(h.drawing.value[1].rotation, undefined)
  h.redo()
  assert.equal(h.drawing.value[1].rotation, 315)
  h.selectElement(0)
  h.pickElement(dragEvent(100, 100), 0)
  h.finish({ ...dragEvent(125, 125), type: 'pointerup' })
  assert.equal(h.drawing.value[0].rotation, 90)
  assert.match(h.elementTransform(h.drawing.value[0], 0), /rotate\(90 300 250\)/)
})

test('rotation handle previews with Shift snapping, commits on release and cancels with Escape', () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'stroke', color: '#20242c', width: 4, points: [{ x: 100, y: 100 }, { x: 300, y: 200 }] }]
  h.selectElement(0)
  // Board coordinates: center (200,150), top handle (200,56).
  h.startRotation(dragEvent(70, 54))
  h.move({ ...dragEvent(95, 76), shiftKey: true })
  assert.equal(h.rotating.value.angle, 90)
  assert.equal(h.drawing.value[0].rotation, undefined)
  h.finish({ ...dragEvent(95, 76), shiftKey: true, type: 'pointerup' })
  assert.equal(h.drawing.value[0].rotation, 90)
  h.startRotation(dragEvent(95, 76))
  h.move(dragEvent(60, 110))
  h.cancelGesture({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(h.drawing.value[0].rotation, 90)
  h.undo()
  assert.equal(h.drawing.value[0].rotation, undefined)
})

test('saving commits an in-progress rotation even after the composer locks editing', async () => {
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'stroke', color: '#20242c', width: 4, points: [{ x: 100, y: 100 }, { x: 300, y: 200 }] }]
  h.selectElement(0)
  h.startRotation(dragEvent(70, 54))
  h.move({ ...dragEvent(95, 76), shiftKey: true })
  h.props.disabled = true
  await h.exportFile()
  assert.equal(h.drawing.value[0].rotation, 90)
  assert.ok(h.commands.some(command => command[0] === 'rotate' && command[1] === Math.PI / 2))
})

test('selection bounds account for glyph extents and rotated drag limits', () => {
  const bounds = shared.exports.sketchElementBounds({ kind: 'text', x: 100, y: 200, size: 40, text: 'glyph', color: 'black' }, { width: 90, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 92, actualBoundingBoxAscent: 31, actualBoundingBoxDescent: 9 })
  assert.equal(bounds.x, 97)
  assert.equal(bounds.y, 169)
  assert.equal(bounds.width, 95)
  assert.equal(bounds.height, 40)
  const rotated = shared.exports.sketchRotatedBounds({ x: 100, y: 100, width: 200, height: 100 }, 90)
  assert.ok(Math.abs(rotated.width - 100) < 1e-8)
  assert.equal(rotated.height, 200)
  const h = canvasHarness()
  h.drawing.value = [{ kind: 'stroke', color: '#20242c', width: 4, rotation: 90, points: [{ x: 100, y: 100 }, { x: 300, y: 200 }] }]
  h.selectElement(0)
  h.pickElement(dragEvent(50, 60), 0)
  h.move(dragEvent(1000, 1000))
  h.finish()
  const end = shared.exports.sketchRotatedBounds(h.boundsFor(h.drawing.value[0]), 90)
  assert.ok(end.x + end.width <= 1200)
  assert.ok(end.y + end.height <= 800)
})

function sendHarness(upload) {
  const attachments = ref([])
  const uploads = ref(false)
  const calls = []
  const state = {
    exports: {},
    requireLogin: () => true,
    pending: ref(false),
    waitingForUser: ref(false),
    creditShortage: ref(null),
    waitingForUserChoice: ref(false),
    waitingForUserConfirm: ref(false),
    status: ref('idle'),
    activeAgentId: ref('agent-1'),
    uploadingSketch: uploads,
    attaching: computed(() => uploads.value),
    attachments,
    uploadAnnotationImage: upload,
    attachUrls: items => attachments.value.push(...items.map(item => ({ ...item, id: 'sketch-attachment', imageId: 'drawing', status: 'ready' }))),
    removeAttachment: id => attachments.value = attachments.value.filter(item => item.id !== id),
    draft: ref('@[Sketch to Image](model:sketch-to-image) watercolor'),
    readyAttachments: computed(() => attachments.value.filter(item => item.status === 'ready')),
    confirmation: ref(null),
    sessionId: ref('session'),
    hydrateServer: async () => {},
    clearLabError() {},
    clearComposerDraft() {},
    revokePreview() {},
    writeStore() {},
    messages: ref([]),
    stopping: ref(false),
    streamEpoch: 0,
    crypto,
    runAgentTurn: (...args) => calls.push(args),
  }
  const file = readFileSync(new URL('../app/composables/useAgentLab.ts', import.meta.url), 'utf8')
  const code = file.slice(file.indexOf('  async function sendMessage('), file.indexOf('  async function stopAgent('))
  vm.runInNewContext(ts.transpile(`${code}\nexports.sendMessage = sendMessage`, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), state)
  return { state, calls, send: state.exports.sendMessage }
}

test('sending waits for the sketch upload and submits its real URL before other references', async () => {
  let finishUpload
  const h = sendHarness(() => new Promise(resolve => finishUpload = resolve))
  h.state.attachments.value = [{ id: 'reference', imageId: 'ref', url: 'https://example.com/reference.png', status: 'ready' }]
  const sending = h.send({ sketchFile: new File(['png'], 'sketch.png', { type: 'image/png' }) })
  assert.equal(h.calls.length, 0)
  assert.equal(h.state.uploadingSketch.value, true)
  finishUpload({ name: 'sketch.png', url: 'https://example.com/sketch.png' })
  assert.equal(await sending, true)
  assert.deepEqual(Array.from(h.calls[0][3]), ['https://example.com/sketch.png', 'https://example.com/reference.png'])
  assert.equal(h.state.uploadingSketch.value, false)
  assert.equal(h.state.draft.value, '')
})

test('an upload failure keeps the draft, unlocks the composer, and never starts generation', async () => {
  const h = sendHarness(async () => { throw new Error('Upload failed') })
  await assert.rejects(h.send({ sketchFile: {} }), /Upload failed/)
  assert.match(h.state.draft.value, /watercolor/)
  assert.equal(h.state.uploadingSketch.value, false)
  assert.equal(h.calls.length, 0)
  assert.equal(h.state.attachments.value.length, 0)
})

test('an unsuccessful send removes its temporary sketch attachment so retries cannot accumulate sources', async () => {
  const h = sendHarness(async () => ({ name: 'sketch.png', url: 'https://example.com/sketch.png' }))
  h.state.hydrateServer = async () => { h.state.pending.value = true }
  assert.equal(await h.send({ sketchFile: {} }), false)
  assert.equal(h.calls.length, 0)
  assert.match(h.state.draft.value, /watercolor/)
  assert.equal(h.state.attachments.value.length, 0)
})

function homeSketchHarness(loggedIn = true) {
  const file = readFileSync(new URL('../app/components/home/HomeAgentComposer.vue', import.meta.url), 'utf8')
  const script = parse(file).descriptor.scriptSetup.content
  const ast = ts.createSourceFile('home.ts', script, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'openSketchInProject')
  const calls = []
  const state = {
    exports: {},
    openingSketch: ref(false),
    hasSketch: ref(true),
    loggedIn: ref(loggedIn),
    draft: ref('/sketch-to-image watercolor cottage'),
    attachments: ref([{ id: 'reference', imageId: 'ref-image', status: 'ready', url: 'https://example.com/reference.png' }]),
    images: ref([{ id: 'old-result' }, { id: 'ref-image', url: 'https://example.com/reference.png' }]),
    canCreateAgent: ref(true),
    activeAgentId: ref('old-agent'),
    createAgent: () => {
      calls.push('create-agent')
      assert.equal(state.attachments.value.length, 0)
      state.activeAgentId.value = 'new-agent'
      state.draft.value = ''
      state.images.value = []
    },
    qualityPreference: ref('hobby'),
    stashGuestDraft: () => calls.push('save-guest'),
    showLoginDialog: () => calls.push('login'),
    resolveTargetProjectId: async () => { calls.push('resolve-project'); return 'selected-project' },
    ensureHydrated: async () => { calls.push('hydrate'); state.draft.value = 'Stored project draft' },
    navigateTo: async path => calls.push({ path, draft: state.draft.value, agentId: state.activeAgentId.value }),
    toast: { error: message => calls.push({ error: message }) },
    readErrorMessage: error => error.message,
  }
  vm.runInNewContext(ts.transpile(`${fn.getText(ast)}\nexports.open = openSketchInProject`, { target: ts.ScriptTarget.ES2022 }), state)
  return { state, calls, open: state.exports.open }
}

test('selecting Sketch on the home page creates a fresh agent after hydration and carries only the input', async () => {
  const h = homeSketchHarness()
  const draft = h.state.draft.value
  await h.open()
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [
    'resolve-project',
    'hydrate',
    'create-agent',
    { path: '/projects/selected-project?mode=agent', draft, agentId: 'new-agent' },
  ])
  assert.deepEqual(h.state.images.value.map(image => image.id), ['ref-image'])
  assert.equal(h.state.attachments.value[0].id, 'reference')
  assert.equal(h.state.qualityPreference.value, 'custom')
  assert.equal(h.state.openingSketch.value, false)
})

test('home submission requests a project handoff without exporting or generating a sketch', async () => {
  const file = readFileSync(new URL('../app/components/agent-lab/AgentLabChat.vue', import.meta.url), 'utf8')
  const script = parse(file).descriptor.scriptSetup.content
  const ast = ts.createSourceFile('chat.ts', script, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'submitMessage')
  const visible = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'sketchVisible'))
  const events = []
  const state = { exports: {}, computed, canSend: ref(true), sketchSelected: ref(true), props: { sketchInProjectOnly: true }, emit: event => events.push(event) }
  vm.runInNewContext(ts.transpile(`${visible.getText(ast)}\n${fn.getText(ast)}\nObject.assign(exports, { submitMessage, sketchVisible });`, { target: ts.ScriptTarget.ES2022 }), state)
  assert.equal(state.exports.sketchVisible.value, false)
  await state.exports.submitMessage()
  assert.deepEqual(events, ['openSketch'])
  state.props.sketchInProjectOnly = false
  // A fresh evaluation verifies the project instance's default behavior.
  const projectState = { ...state, exports: {} }
  vm.runInNewContext(ts.transpile(`${visible.getText(ast)}\nexports.sketchVisible = sketchVisible`, { target: ts.ScriptTarget.ES2022 }), projectState)
  assert.equal(projectState.exports.sketchVisible.value, true)
})

test('a blocked sketch handoff never opens the old agent and keeps the input', async () => {
  const h = homeSketchHarness()
  h.state.canCreateAgent.value = false
  const draft = h.state.draft.value
  await h.open()
  assert.equal(h.state.activeAgentId.value, 'old-agent')
  assert.equal(h.state.draft.value, draft)
  assert.equal(h.calls.some(call => call?.path), false)
  assert.match(h.calls.at(-1).error, /Cannot open a new sketch agent/)
  assert.equal(h.state.openingSketch.value, false)
})
