import type { ImageAnnotationEdit } from '~~/shared/utils/imageAnnotations'
import type { AgentSession } from './session'
import { AgentChat } from '../models/agentChat'
import { GenerationJob } from '../models/generationJob'

export async function validateAnnotationReferences(edit: ImageAnnotationEdit, session: AgentSession) {
  const references = [...new Set(edit.points.flatMap(point => (point.references || []).map(reference => reference.url)))]
  return validateProjectImageReferences(references, session)
}

export async function validateProjectImageReferences(references: string[], session: AgentSession) {
  const allowed = new Set(session.images.filter(image => image.status === 'success' && image.kind !== 'video').map(image => image.url))
  const missing = references.filter(url => !allowed.has(url))
  if (!missing.length)
    return
  if (!session.projectId)
    throw new Error('Reference images must belong to this project.')
  const scope = { projectId: session.projectId }
  const [jobs, chats] = await Promise.all([
    GenerationJob.find({ ...scope, deleted: { $ne: true }, category: { $ne: 'Video' }, resultUrls: { $in: missing } }).select('resultUrls').lean(),
    AgentChat.find({ ...scope, 'images.url': { $in: missing } }).select('images').lean(),
  ])
  for (const job of jobs)
    job.resultUrls.forEach(url => allowed.add(url))
  for (const chat of chats)
    chat.images.filter(image => image.status === 'success' && image.kind !== 'video').forEach(image => allowed.add(image.url))
  if (references.some(url => !allowed.has(url)))
    throw new Error('A reference image is no longer available in this project. Select it again.')
}
