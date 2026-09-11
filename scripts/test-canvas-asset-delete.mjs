import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { reactive, ref, shallowRef } from 'vue'
import { CANVAS_BATCH_SIZE, canvasCameraSchema, canvasPatchSchema, canvasRectSchema } from '../shared/types/canvas.ts'

const source = ts.createSourceFile('layout.ts', readFileSync(new URL('../app/composables/useCanvasLayout.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useCanvasLayout')
const code = ts.transpile(fn.getText(source).replace(/^export /, ''), { target: ts.ScriptTarget.ES2022 })

test('upload deletion survives layout reload and rolls back when persistence fails', async () => {
  const nodes = new Map()
  const cleanups = []
  let fail = false
  let version = 1
  const state = {
    reactive,
    ref,
    shallowRef,
    CANVAS_BATCH_SIZE,
    canvasCameraSchema,
    canvasRectSchema,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null },
    window: { removeEventListener: () => {} },
    onMounted: () => {},
    onBeforeUnmount: fn => cleanups.push(fn),
    $fetch: async (url, options) => {
      if (url.endsWith('/read'))
        return { nodes: options.body.ids.flatMap(id => nodes.has(id) ? [nodes.get(id)] : []), camera: { x: 40, y: 50, zoom: 0.85 }, nextSlot: 1, version }
      if (fail)
        throw new Error('offline')
      const patch = canvasPatchSchema.parse(options.body)
      version = patch.version
      for (const node of patch.nodes) nodes.set(node.id, node)
      return { ok: true }
    },
  }
  vm.createContext(state)
  vm.runInContext(code, state)
  try {
    const layout = state.useCanvasLayout('project')
    await layout.ensure(['agent_upload:0'])
    layout.positions.value = new Map([['agent_upload:0', { x: 0, y: 0, width: 280, height: 310 }]])
    await layout.hideNode('agent_upload:0')
    assert.equal(nodes.get('agent_upload:0').hidden, true)
    const reloaded = state.useCanvasLayout('project')
    await reloaded.ensure(['agent_upload:0'])
    assert.equal(reloaded.positions.value.get('agent_upload:0').hidden, true)

    layout.positions.value = new Map(layout.positions.value).set('agent_second:0', { x: 320, y: 0, width: 280, height: 310 })
    fail = true
    await assert.rejects(layout.hideNode('agent_second:0'), /Could not delete/)
    assert.equal(layout.positions.value.get('agent_second:0').hidden, undefined)
    assert.equal(nodes.has('agent_second:0'), false)
    fail = false
    await layout.flush()
  }
  finally {
    cleanups.forEach(cleanup => cleanup())
  }
})
