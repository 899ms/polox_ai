import type { GenerationProjectPublic } from '../../shared/types/project'
import type { IProject } from '../models/project'
import { GENERATION_ACTIVE_STATES } from '../../shared/types/generation'
import { DEFAULT_PROJECT_NAME, nextProjectTitle, nextSkillProjectTitle, PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, type ProjectKind } from '../../shared/types/project'
import { AgentChat } from '../models/agentChat'
import { AgentHistory } from '../models/agentHistory'
import { GenerationJob } from '../models/generationJob'
import { Project } from '../models/project'
import { isDocumentId } from './sqlite'

export function isProjectId(id: string) {
  return isDocumentId(id)
}
function toIso(value?: Date) {
  return value ? value.toISOString() : ''
}
export interface ProjectStats {
  countById: Map<string, number>
  assetCountById: Map<string, number>
  coverById: Map<string, string>
  activeById: Map<string, number>
}
export function toPublicProject(project: IProject & {
  _id: string
}, extras?: {
  jobCount?: number
  assetCount?: number
  coverUrl?: string
  activeJobCount?: number
}): GenerationProjectPublic {
  return {
    id: String(project._id),
    name: project.name,
    description: project.description || '',
    isDefault: Boolean(project.isDefault),
    kind: (project.kind === 'skill' ? 'skill' : 'studio') as ProjectKind,
    skillId: project.kind === 'skill' ? String(project.skillId || '').trim() : '',
    jobCount: extras?.jobCount || 0,
    assetCount: extras?.assetCount || 0,
    activeJobCount: extras?.activeJobCount || 0,
    coverUrl: extras?.coverUrl || '',
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
  }
}
export function toPublicProjectWithStats(project: IProject & {
  _id: string
}, stats: ProjectStats): GenerationProjectPublic {
  const id = String(project._id)
  return toPublicProject(project, {
    jobCount: stats.countById.get(id) || 0,
    assetCount: stats.assetCountById.get(id) || 0,
    coverUrl: stats.coverById.get(id) || '',
    activeJobCount: stats.activeById.get(id) || 0,
  })
}
function foldUnassignedCounts(countById: Map<string, number>, defaultId: string) {
  let unassignedCount = 0
  for (const [id, count] of [...countById.entries()]) {
    if (id && id !== 'null' && id !== 'undefined')
      continue
    unassignedCount += count
    countById.delete(id)
  }
  if (unassignedCount)
    countById.set(defaultId, (countById.get(defaultId) || 0) + unassignedCount)
}
function unassignedJobFilter() {
  return {
    $or: [
      { projectId: { $exists: false } },
      { projectId: '' },
      { projectId: null },
    ],
  }
}
async function backfillUnassignedJobs(projectId: string) {
  await GenerationJob.updateMany(unassignedJobFilter(), { $set: { projectId } })
}
function scheduleBackfill(projectId: string) {
  void backfillUnassignedJobs(projectId).catch((error) => {
    console.error('[projects] Failed to backfill unassigned jobs', error)
  })
}
export async function ensureDefaultProject() {
  const existing = await Project.findOne({ isDefault: true })
  if (existing) {
    scheduleBackfill(String(existing._id))
    return existing
  }
  try {
    const created = await Project.create({
      name: DEFAULT_PROJECT_NAME,
      description: '',
      isDefault: true,
      kind: 'studio',
    })
    scheduleBackfill(String(created._id))
    return created
  }
  catch (error) {
    const raced = await Project.findOne({ isDefault: true })
    if (!raced) {
      console.error('[projects] Could not create the default project', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not create the default project',
      })
    }
    scheduleBackfill(String(raced._id))
    return raced
  }
}
export async function resolveProject(projectId?: string) {
  const id = String(projectId || '').trim()
  if (id) {
    if (!isProjectId(id)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid project',
      })
    }
    const project = await Project.findOne({ _id: id })
    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found',
      })
    }
    return project
  }
  return ensureDefaultProject()
}
export async function moveJobToProject(taskId: string, projectId: string) {
  const id = String(taskId || '').trim()
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'taskId is required',
    })
  }
  const destination = await resolveProject(projectId)
  const destinationId = String(destination._id)
  const job = await GenerationJob.findOneAndUpdate({
    taskId: id,
    deleted: { $ne: true },
  }, {
    $set: { projectId: destinationId },
    $inc: { __v: 1 },
  }, { new: true })
  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Generation job not found',
    })
  }
  return job
}
export function sanitizeProjectFields(input: {
  name?: string
  description?: string
}, existingNames: string[]) {
  const name = String(input.name || '').trim().slice(0, PROJECT_NAME_MAX) || nextProjectTitle(existingNames)
  const description = String(input.description || '').trim().slice(0, PROJECT_DESCRIPTION_MAX)
  return { name, description }
}
export async function createProject(input: {
  name?: string
  description?: string
  kind?: ProjectKind
  skillId?: string
}) {
  await ensureDefaultProject()
  const kind: ProjectKind = input.kind === 'skill' ? 'skill' : 'studio'
  const skillId = kind === 'skill' ? String(input.skillId || '').trim().toLowerCase() : ''
  if (skillId) {
    const bound = await Project.findOne({ kind: 'skill', skillId })
    if (bound)
      return bound
  }
  const existing = await Project.find({}).select('name')
  const names = existing.map(project => project.name)
  const fields = kind === 'skill'
    ? { name: String(input.name || '').trim().slice(0, PROJECT_NAME_MAX) || nextSkillProjectTitle(names), description: String(input.description || '').trim().slice(0, PROJECT_DESCRIPTION_MAX) }
    : sanitizeProjectFields(input, names)
  return Project.create({
    name: fields.name,
    description: fields.description,
    isDefault: false,
    kind,
    skillId: skillId || undefined,
  })
}
export async function updateProject(projectId: string, input: {
  name?: string
  description?: string
}) {
  const project = await resolveProject(projectId)
  if (project.isDefault) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The default project cannot be edited',
    })
  }
  const name = String(input.name || '').trim().slice(0, PROJECT_NAME_MAX)
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required',
    })
  }
  project.name = name
  project.description = String(input.description || '').trim().slice(0, PROJECT_DESCRIPTION_MAX)
  await project.save()
  return project
}
export async function deleteProject(projectId: string) {
  const project = await resolveProject(projectId)
  if (project.isDefault) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The default project cannot be deleted',
    })
  }
  const destination = await ensureDefaultProject()
  await GenerationJob.updateMany({ projectId: String(project._id) }, { $set: { projectId: String(destination._id) } })
  await project.deleteOne()
  return destination
}
export async function migrateDefaultProjects() {
  await ensureDefaultProject()
}
export async function projectStats(): Promise<ProjectStats> {
  const match = {
    deleted: { $ne: true },
    hiddenFromUser: { $ne: true },
  }
  const defaultProject = await Project.findOne({ isDefault: true }).select('_id')
  const defaultId = defaultProject ? String(defaultProject._id) : ''
  const uploadMatch = { 'images.kind': 'upload', 'images.status': 'success', 'images.url': { $type: 'string', $ne: '' } }
  const [counts, covers, actives, assets] = await Promise.all([
    GenerationJob.aggregate<{
      _id: string
      count: number
    }>([
      { $match: match },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]),
    GenerationJob.aggregate<{
      _id: string
      coverUrl: string
    }>([
      { $match: { ...match, 'state': 'success', 'resultUrls.0': { $exists: true } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$projectId', coverUrl: { $first: { $arrayElemAt: ['$resultUrls', 0] } } } },
    ]),
    GenerationJob.aggregate<{
      _id: string
      count: number
    }>([
      { $match: { ...match, state: { $in: [...GENERATION_ACTIVE_STATES] } } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]),
    GenerationJob.aggregate<{
      _id: string
      count: number
    }>([
      { $match: { ...match, state: 'success' } },
      { $unwind: '$resultUrls' },
      { $match: { resultUrls: { $type: 'string', $ne: '' } } },
      { $project: { projectId: 1, url: '$resultUrls' } },
      { $unionWith: {
        coll: AgentChat.collection.name,
        pipeline: [
          { $match: {} },
          { $unwind: '$images' },
          { $match: uploadMatch },
          { $project: { projectId: 1, url: '$images.url' } },
        ],
      } },
      // Older uploads may have left the bounded chat snapshot.
      { $unionWith: {
        coll: AgentHistory.collection.name,
        pipeline: [
          { $match: {} },
          { $unwind: '$images' },
          { $match: uploadMatch },
          { $lookup: {
            from: AgentChat.collection.name,
            localField: 'sessionId',
            foreignField: 'sessionId',
            pipeline: [{ $match: {} }, { $project: { projectId: 1 } }],
            as: 'chat',
          } },
          { $unwind: '$chat' },
          { $project: { projectId: '$chat.projectId', url: '$images.url' } },
        ],
      } },
      { $set: { projectId: { $cond: [{ $in: [{ $ifNull: ['$projectId', ''] }, ['', 'null', 'undefined']] }, defaultId, '$projectId'] } } },
      // A file referenced in multiple chats or also present as a result counts once.
      { $group: { _id: { projectId: '$projectId', url: '$url' } } },
      { $group: { _id: '$_id.projectId', count: { $sum: 1 } } },
    ]),
  ])
  const countById = new Map(counts.map(row => [String(row._id || ''), row.count]))
  const coverById = new Map(covers.map(row => [String(row._id || ''), row.coverUrl || '']))
  const activeById = new Map(actives.map(row => [String(row._id || ''), row.count]))
  const assetCountById = new Map(assets.map(row => [String(row._id || ''), row.count]))
  if (defaultProject) {
    const defaultId = String(defaultProject._id)
    foldUnassignedCounts(countById, defaultId)
    foldUnassignedCounts(activeById, defaultId)
    if (!coverById.get(defaultId)) {
      const fallback = coverById.get('') || coverById.get('null') || ''
      if (fallback)
        coverById.set(defaultId, fallback)
    }
  }
  return { countById, assetCountById, coverById, activeById }
}


/** After save_user_skill: bind this session project ↔ skill (1:1), renaming in place so chat history stays. */
export async function bindSkillProject(skillId: string, projectId: string, skillName?: string) {
  const id = String(skillId || '').trim().toLowerCase()
  const pid = String(projectId || '').trim()
  if (!id || !pid || !isProjectId(pid))
    return null

  const project = await Project.findOne({ _id: pid })
  if (!project)
    return null

  if (project.kind !== 'skill') {
    // Do not convert a studio project — create/bind a dedicated skill project instead.
    return ensureSkillProject({ skillId: id, name: skillName || id })
  }

  const previousId = String(project.skillId || '').trim().toLowerCase()
  const nextName = String(skillName || '').trim().slice(0, PROJECT_NAME_MAX)

  // Rename / claim this workspace — never spawn a second project (that swaps chat history).
  project.skillId = id
  if (nextName)
    project.name = nextName
  await project.save()

  // Drop the previous draft row when the id changed (untitled-* → final id).
  if (previousId && previousId !== id) {
    const { deleteUserSkill } = await import('./userSkills')
    await deleteUserSkill(previousId)
    // Detach any other skill project that still claimed the new id.
    await Project.updateMany(
      { kind: 'skill', skillId: id, _id: { $ne: project._id } },
      { $set: { skillId: '' } },
    )
  }

  const { UserSkill } = await import('../models/userSkill')
  const row = await UserSkill.findOne({ skillId: id })
  if (row) {
    if (row.projectId !== pid)
      row.projectId = pid
    // Always refresh name on the skill row when provided (even if id unchanged).
    if (nextName && row.name !== nextName)
      row.name = nextName
    row.updatedAt = new Date()
    await row.save()
  }
  return project
}

export async function ensureSkillProject(input: { skillId?: string, name?: string, description?: string, projectId?: string } = {}) {
  const skillId = String(input.skillId || '').trim().toLowerCase()
  let project = null as Awaited<ReturnType<typeof Project.findOne>>

  const projectId = String(input.projectId || '').trim()
  if (projectId && isProjectId(projectId)) {
    project = await Project.findOne({ _id: projectId, kind: 'skill' })
  }

  if (!project && skillId) {
    const skillRow = await (await import('../models/userSkill')).UserSkill.findOne({ skillId })
    const fromSkill = String(skillRow?.projectId || '').trim()
    if (fromSkill && isProjectId(fromSkill)) {
      const bound = await Project.findOne({ _id: fromSkill, kind: 'skill' })
      if (bound) {
        if (bound.skillId !== skillId) {
          bound.skillId = skillId
          await bound.save()
        }
        project = bound
      }
    }
  }

  if (!project && skillId) {
    project = await Project.findOne({ kind: 'skill', skillId })
  }

  if (!project) {
    project = await createProject({
      kind: 'skill',
      skillId: skillId || undefined,
      name: input.name,
      description: input.description || (skillId ? `Workspace for /${skillId}` : 'Skill Creator workspace'),
    })
  }

  if (skillId) {
    const { UserSkill } = await import('../models/userSkill')
    const row = await UserSkill.findOne({ skillId })
    if (row && row.projectId !== String(project._id)) {
      row.projectId = String(project._id)
      await row.save()
    }
    if (project.skillId !== skillId) {
      project.skillId = skillId
      if (input.name)
        project.name = String(input.name).trim().slice(0, PROJECT_NAME_MAX) || project.name
      await project.save()
    }
  }

  return project
}
