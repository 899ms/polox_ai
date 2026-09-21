import { createError } from 'h3'
import { isBuiltinSkillId } from '../../agent/skills'
import { ensureUserSkillsReady, persistUserSkill, setUserSkillEnabled, toPublicUserSkill } from '../../utils/userSkills'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing skill id' })
  if (isBuiltinSkillId(id))
    throw createError({ statusCode: 403, statusMessage: 'Builtin skills cannot be modified' })

  ensureUserSkillsReady()
  const body = await readBody<{
    enabled?: boolean
    markdown?: string
    keywords?: string
    cover?: string
  }>(event)

  if (typeof body?.enabled === 'boolean' && !body.markdown) {
    const row = await setUserSkillEnabled(id, body.enabled)
    if (!row)
      throw createError({ statusCode: 404, statusMessage: 'User skill not found' })
    return { ok: true, skill: toPublicUserSkill(row) }
  }

  if (!body?.markdown?.trim())
    throw createError({ statusCode: 400, statusMessage: 'markdown or enabled is required' })

  const result = await persistUserSkill({
    markdown: body.markdown,
    enabled: body.enabled,
    keywords: body.keywords,
    cover: body.cover,
    source: 'user',
  })
  if (!result.ok)
    throw createError({ statusCode: 400, statusMessage: 'Skill validation failed', data: { issues: result.issues } })
  if (result.skill.skillId !== id)
    throw createError({ statusCode: 400, statusMessage: 'Skill id in markdown must match URL id' })
  return { ok: true, skill: toPublicUserSkill(result.skill, true) }
})
