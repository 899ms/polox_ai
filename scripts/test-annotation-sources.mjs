import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { messageMedia } from '../app/utils/agentMessageMedia.ts'

const file = 'app/components/agent-lab/AgentLabChat.vue'
const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'layerSourceImages')
function sources(messages) {
  const images = ['old', 'generated', 'current', 'second', 'later'].map(id => ({ id, url: `https://example.com/${id}.png`, status: 'success', kind: 'still' }))
  const card = { id: 'card', choice: { questions: [{ id: 'image_edit_method' }] } }
  const context = vm.createContext({ props: { messages: [...messages, card, { id: 'future', role: 'assistant', imageIds: ['later'] }], images }, messageMedia, isMediaVideoUrl: () => false })
  vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return Array.from(context.layerSourceImages(card), image => image.id)
}
const history = [{ id: 'old-request', role: 'user', imageIds: ['old'] }, { id: 'output', role: 'assistant', imageIds: ['generated'] }]
test('one current attachment excludes all prior conversation images', () => {
  assert.deepEqual(sources([...history, { id: 'current-request', role: 'user', imageIds: ['current'] }]), ['current'])
})
test('multiple current attachments preserve their order', () => {
  assert.deepEqual(sources([...history, { id: 'current-request', role: 'user', imageIds: ['current', 'second'] }]), ['current', 'second'])
})
test('attachment-free follow-up uses the nearest result rather than all history', () => {
  assert.deepEqual(sources([...history, { id: 'followup', role: 'user', content: 'Edit it' }]), ['generated'])
})
test('unavailable explicit attachment does not substitute an older image', () => {
  assert.deepEqual(sources([...history, { id: 'missing', role: 'user', imageIds: ['missing'] }]), [])
})
