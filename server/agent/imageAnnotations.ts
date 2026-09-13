import type { ImageAnnotationEdit } from '~~/shared/utils/imageAnnotations'
import type { AgentSession } from './session'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { annotationMarkersSvg } from '~~/shared/utils/imageAnnotations'
import { uploadAgentImage } from './upload'

export async function renderAnnotationImage(edit: ImageAnnotationEdit, sessionId: string, signal?: AbortSignal) {
  const response = await fetch(edit.imageUrl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
  if (!response.ok || !response.body)
    throw new Error('Could not load the source image. Please try again.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > 30 * 1024 * 1024)
        throw new Error('Source images must be 30MB or smaller.')
      chunks.push(value)
    }
  }
  finally {
    await reader.cancel()
  }
  const { data, info } = await sharp(Buffer.concat(chunks), { limitInputPixels: 64_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
  const bytes = await sharp(data).composite([{ input: Buffer.from(annotationMarkersSvg(edit.points, info.width, info.height)) }]).png().toBuffer()
  return uploadAgentImage(sessionId, { bytes, mime: 'image/png' })
}

export function confirmedAnnotationEdit(session: AgentSession): ImageAnnotationEdit | null {
  for (const message of [...session.messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      break
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    try {
      const result = JSON.parse(message.content)
      const answer = result.ok && result.answers?.find((item: { questionId: string, optionId?: string }) => item.questionId === 'image_edit_method' && item.optionId === 'annotate')
      if (answer?.annotationEdit?.annotatedImageUrl)
        return answer.annotationEdit
    }
    catch { /* Unrelated tool output. */ }
  }
  return null
}
