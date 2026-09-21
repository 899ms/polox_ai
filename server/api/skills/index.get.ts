import { BUILTIN_PUBLIC_AGENT_SKILLS } from '../../../shared/utils/agentSkills'
import { listBuiltinSkillDocuments } from '../../agent/skills'
import { ensureUserSkillsReady, listUserSkillRecords, toPublicUserSkill } from '../../utils/userSkills'

export default defineEventHandler(async () => {
  ensureUserSkillsReady()
  const userRows = await listUserSkillRecords()
  const userSkills = userRows.map(row => toPublicUserSkill(row))
  const builtinMeta = listBuiltinSkillDocuments().map(doc => ({
    id: doc.id,
    name: doc.frontmatter.name,
    description: doc.frontmatter.description,
    visibility: doc.frontmatter.visibility,
    triggers: doc.frontmatter.triggers,
    source: 'builtin' as const,
  }))
  return {
    builtinCatalog: BUILTIN_PUBLIC_AGENT_SKILLS,
    builtinMeta,
    userSkills,
    catalog: [
      ...BUILTIN_PUBLIC_AGENT_SKILLS.map(skill => ({ ...skill, source: 'builtin' as const, enabled: true })),
      ...userSkills.filter(skill => skill.enabled).map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        keywords: skill.keywords || '',
        icon: 'lucide:sparkles',
        source: 'user' as const,
        enabled: true,
      })),
    ],
    registeredAt: new Date().toISOString(),
  }
})
