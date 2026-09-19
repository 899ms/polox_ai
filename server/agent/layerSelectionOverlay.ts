import type { ImageLayerRegion } from '~~/shared/utils/imageLayerSplitter'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { layerSelectionOverlaySvg } from '~~/shared/utils/agentLayerSelection'
import { uploadAgentImage } from './upload'

async function fetchImageBytes(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
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
  return Buffer.concat(chunks)
}

/** Render colored numbered boxes onto a source image and upload via local agent media. */
export async function renderLayerSelectionOverlay(
  imageUrl: string,
  regions: ImageLayerRegion[],
  sessionId: string,
  signal?: AbortSignal,
  options?: { color?: string },
) {
  const source = await fetchImageBytes(imageUrl, signal)
  const { data, info } = await sharp(source, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true })
  const overlay = Buffer.from(layerSelectionOverlaySvg(regions, info.width, info.height, options?.color ? { color: options.color } : undefined))
  const bytes = await sharp(data).composite([{ input: overlay }]).png().toBuffer()
  return uploadAgentImage(sessionId, { bytes, mime: 'image/png' })
}
