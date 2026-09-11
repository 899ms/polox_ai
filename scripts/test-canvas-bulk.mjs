import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

const file = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
const source = ts.createSourceFile('page.ts', parse(file).descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
function extract(name) {
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  return ts.transpile(node.getText(source), { target: ts.ScriptTarget.ES2022 })
}
test('bulk actions wait for confirmation and retain only failed tasks for retries', async () => {
  const calls = []
  const removed = []
  const state = { images: { value: [] }, bulkAction: { value: null }, bulkTaskIds: { value: [] }, bulkPending: { value: false }, items: { value: [{ taskId: 'a' }, { taskId: 'b' }] }, total: { value: 2 }, toast: { error: () => {} }, removeAgentResult: id => removed.push(id), loadJobs: async () => {}, loadProjects: async () => {}, $fetch: async (url, options) => {
    calls.push([url, options.method]); if (url.endsWith('/b'))
      throw new Error('network')
  } }
  vm.createContext(state)
  vm.runInContext(extract('requestBulk') + extract('deleteCanvasResult') + extract('confirmBulk'), state)
  state.requestBulk('delete', ['a', 'b', 'a'])
  assert.equal(calls.length, 0)
  await state.confirmBulk()
  assert.deepEqual(removed, ['a'])
  assert.equal(state.bulkTaskIds.value.join(','), 'b')
  assert.equal(state.bulkAction.value, 'delete')
  assert.equal(state.bulkPending.value, false)
  state.$fetch = async (url, options) => calls.push([url, options.method])
  await state.confirmBulk()
  assert.equal(state.bulkAction.value, null)
  assert.equal(calls.filter(([url]) => url.endsWith('/a')).length, 1)
})

test('mixed deletion removes uploads through canvas persistence and counts only generation jobs', async () => {
  const hidden = []
  const deleted = []
  const state = {
    bulkAction: { value: 'delete' },
    bulkTaskIds: { value: ['agent_upload:0', 'job'] },
    bulkPending: { value: false },
    images: { value: [] },
    allImages: { value: [{ id: 'upload', kind: 'upload' }] },
    items: { value: [{ taskId: 'job' }] },
    total: { value: 1 },
    canvas: { value: { hideAsset: async id => hidden.push(id) } },
    toast: { error: message => assert.fail(message) },
    removeAgentResult: () => {},
    loadJobs: async () => {},
    loadProjects: async () => {},
    $fetch: async url => deleted.push(url),
  }
  vm.createContext(state)
  vm.runInContext(extract('deleteCanvasResult') + extract('confirmBulk'), state)
  await state.confirmBulk()
  assert.deepEqual(hidden, ['agent_upload:0'])
  assert.deepEqual(deleted, ['/api/ai/jobs/job'])
  assert.equal(state.total.value, 0)
  assert.equal(state.bulkAction.value, null)
})

test('confirming deletion of a failed result from another agent hides the canvas node', async () => {
  const hidden = []
  const state = {
    images: { value: [] },
    allImages: { value: [{ id: 'failed_other_agent', status: 'fail', url: '' }] },
    items: { value: [] },
    total: { value: 0 },
    pendingDeleteTaskId: { value: '' },
    deletingTaskId: { value: null },
    deleteConfirmOpen: { value: false },
    canvas: { value: { hideAsset: async id => hidden.push(id) } },
    $fetch: async () => assert.fail('Agent-only failures must not call the generation deletion API'),
  }
  vm.createContext(state)
  vm.runInContext(extract('requestDelete') + extract('deleteCanvasResult') + extract('confirmDelete'), state)
  state.requestDelete('agent_failed_other_agent:0')
  assert.equal(state.deleteConfirmOpen.value, true)
  assert.equal(hidden.length, 0)
  await state.confirmDelete()
  assert.deepEqual(hidden, ['agent_failed_other_agent:0'])
  assert.equal(state.deleteConfirmOpen.value, false)
  assert.equal(state.pendingDeleteTaskId.value, '')
  assert.equal(state.deletingTaskId.value, null)
  assert.equal(state.total.value, 0)
})
