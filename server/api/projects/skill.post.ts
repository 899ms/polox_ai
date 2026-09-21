import { ensureSkillProject, projectStats, toPublicProjectWithStats } from '../../utils/projects'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ skillId?: string, name?: string, description?: string, projectId?: string }>(event)
  const project = await ensureSkillProject({
    skillId: body?.skillId,
    name: body?.name,
    description: body?.description,
    projectId: body?.projectId,
  })
  const stats = await projectStats()
  return toPublicProjectWithStats(project, stats)
})
