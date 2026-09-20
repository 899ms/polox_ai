import type { ObjectRemovalEdit } from '~~/shared/utils/imageObjectRemoval'
import type { AgentSession } from './session'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { objectRemovalOverlaySvg } from '~~/shared/utils/imageObjectRemoval'
import { probeImageDimensions } from './imageDimensions'
import { uploadAgentImage } from './upload'

export async function renderObjectRemovalOverlay(edit: ObjectRemovalEdit, sessionId: string, signal?: AbortSignal) {
  const { bytes: source } = await probeImageDimensions(edit.imageUrl, signal)
  const { data, info } = await sharp(source, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true })
  const overlay = Buffer.from(objectRemovalOverlaySvg(edit.targets, info.width, info.height))
  const bytes = await sharp(data).composite([{ input: overlay }]).png().toBuffer()
  return uploadAgentImage(sessionId, { bytes, mime: 'image/png' })
}

export function confirmedObjectRemovalEdit(session: AgentSession): ObjectRemovalEdit | null {
  for (const message of [...session.messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      break
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    try {
      const result = JSON.parse(message.content)
      const answer = result.ok && result.answers?.find((item: { questionId: string, optionId?: string }) => item.questionId === 'object_removal_method' && item.optionId === 'annotate')
      if (answer?.objectRemovalEdit?.annotatedImageUrl)
        return answer.objectRemovalEdit
    }
    catch { /* Unrelated tool output. */ }
  }
  return null
}
