import { Buffer } from 'node:buffer'
import sharp from 'sharp'

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

/** Read oriented pixel size for resolution tier selection. */
export async function probeImageDimensions(url: string, signal?: AbortSignal) {
  const source = await fetchImageBytes(url, signal)
  const metadata = await sharp(source, { limitInputPixels: 64_000_000 }).rotate().metadata()
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0
  if (!width || !height)
    throw new Error('Could not read image dimensions.')
  return { width, height, bytes: source }
}
