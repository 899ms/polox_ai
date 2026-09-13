import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findSkillsDir, loadAgentSkills } from '../server/agent/skills.ts'

const root = await mkdtemp(join(tmpdir(), 'polox-skills-'))
try {
  const source = join(root, 'server/agent/skills')
  const bundle = join(root, '.nuxt/dev/agent-skills')
  for (const folder of [source, bundle]) {
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'single-generator.md'), '# Test')
  }
  const moduleUrl = pathToFileURL(join(root, '.nuxt/dev/index.mjs')).href
  assert.equal(findSkillsDir(moduleUrl, root, false), source, 'Dev must prefer live source over stale copied skills')
  assert.equal(findSkillsDir(moduleUrl, root, true), bundle, 'Production must use its packaged skills')
  await rm(source, { recursive: true })
  assert.equal(findSkillsDir(moduleUrl, root, false), bundle, 'Bundle fallback must work without source')
  const skill = loadAgentSkills().find(text => text.startsWith('# Product Hunt gallery'))
  assert.ok(skill.includes('model_gpt_image_2_5_flare_image_to_image'))
  assert.ok(skill.includes('9:16 portrait is already decided'))
  assert.ok(skill.includes('gallery_brand_confirmation'))
  console.log('Skill loading passed: live dev source, production bundle, fallback, and current gallery settings.')
}
finally {
  await rm(root, { recursive: true, force: true })
}
