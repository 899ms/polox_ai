import { createError } from 'h3'
import { isBuiltinSkillId } from '../../agent/skills'
import { deleteUserSkill, ensureUserSkillsReady } from '../../utils/userSkills'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing skill id' })
  if (isBuiltinSkillId(id))
    throw createError({ statusCode: 403, statusMessage: 'Builtin skills cannot be deleted' })
  ensureUserSkillsReady()
  const deleted = await deleteUserSkill(id)
  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'User skill not found' })
  return { ok: true, id }
})
