import type { IGenerationJob } from '../models/generationJob'
import { basename } from 'node:path'
import { WAVESPEED_MEDIA_FIELDS, wavespeedEndpoint } from '../../shared/utils/wavespeedSchema'
import { mergeSourceUrls } from './generationResults'
import { readStoredMedia } from './localMedia'
import { readServiceSettings } from './serviceSettings'
import { sanitizeWavespeedInput } from './wavespeedInput'

const API = 'https://api.wavespeed.ai/api/v3'
async function request(path: string, body?: unknown) {
  const key = readServiceSettings().wavespeedKey
  if (!key)
    throw createError({ statusCode: 503, statusMessage: 'Configure your WaveSpeed API key first.' })
  const response = await fetch(`${API}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  })
  const payload = await response.json()
  if (!response.ok || (payload.code !== undefined && payload.code !== 200))
    throw createError({ statusCode: response.ok ? 502 : response.status, statusMessage: String(payload.message || 'WaveSpeed request failed') })
  if (!payload.data || typeof payload.data !== 'object')
    throw createError({ statusCode: 502, statusMessage: 'WaveSpeed returned an invalid response' })
  return payload.data
}
export async function uploadWavespeedFile(bytes: Uint8Array, mime: string, filename: string) {
  if (!bytes.byteLength || bytes.byteLength > 200 * 1024 * 1024)
    throw createError({ statusCode: 413, statusMessage: 'Upload must contain 1 byte to 200 MiB' })
  const ticket = await request('media/uploads', { filename: basename(filename), size: bytes.byteLength, content_type: mime })
  if (ticket.upload?.method !== 'PUT' || !String(ticket.upload.url).startsWith('https://') || !String(ticket.download_url).startsWith('https://'))
    throw new Error('WaveSpeed returned an invalid upload ticket')
  const response = await fetch(ticket.upload.url, {
    method: 'PUT',
    headers: ticket.upload.headers,
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(300000),
  })
  if (!response.ok)
    throw new Error(`WaveSpeed file upload failed (${response.status})`)
  return String(ticket.download_url)
}
async function prepareFiles(input: Record<string, unknown>) {
  const result = { ...input }
  for (const key of WAVESPEED_MEDIA_FIELDS) {
    if (result[key] === undefined)
      continue
    const upload = async (url: string) => {
      if (url.startsWith('data:'))
        return url
      const local = await readStoredMedia(url, 200 * 1024 * 1024)
      return local ? uploadWavespeedFile(local.bytes, local.mime, new URL(url).pathname.split('/').pop() || 'input.bin') : url
    }
    result[key] = Array.isArray(result[key]) ? await Promise.all(result[key].map(upload)) : await upload(String(result[key]))
  }
  return result
}
export async function createWavespeedTask(model: string, raw: Record<string, unknown>) {
  const endpoint = wavespeedEndpoint(model)
  if (!endpoint)
    throw new Error('Unknown WaveSpeed model')
  const input = await prepareFiles(sanitizeWavespeedInput(model, raw))
  const result = await request(endpoint, input)
  if (typeof result.id !== 'string' || !result.id)
    throw new Error('WaveSpeed returned no prediction ID')
  return { requestId: result.id }
}
export function readWavespeedTask(id: string) {
  return request(`predictions/${encodeURIComponent(id)}/result`)
}
export function wavespeedResultUrls(result: Record<string, any>): string[] {
  return (Array.isArray(result.outputs) ? result.outputs : []).filter((url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
}
export async function syncJobFromWavespeed<T extends IGenerationJob & { save: () => Promise<unknown> }>(job: T): Promise<T> {
  if (!job.providerTaskId || ['queued', 'fail', 'archiving', 'moderating', 'success'].includes(job.state))
    return job
  try {
    const result = await readWavespeedTask(job.providerTaskId)
    job.lastSyncAt = new Date()
    if (['failed', 'cancelled', 'timeout', 'deleted'].includes(result.status)) {
      job.state = 'fail'
      job.failMsg = String(result.error || `WaveSpeed generation ${result.status}`)
    }
    else if (result.status === 'completed') {
      const urls = wavespeedResultUrls(result)
      if (!urls.length) {
        job.state = 'fail'
        job.failMsg = 'WaveSpeed returned no result URL'
      }
      else {
        mergeSourceUrls(job, urls)
        job.resultJson = JSON.stringify({ resultUrls: urls, ...(job.model === 'image-layer-splitter' ? { layers: urls.map((url, index) => ({ image: { url }, z_index: index, name: index === 0 ? 'Base' : `Layer ${index}` })) } : {}) })
        job.state = 'archiving'
        job.failMsg = ''
        job.failCode = ''
      }
    }
    else {
      job.state = result.status === 'processing' ? 'generating' : 'queuing'
    }
  }
  catch (error) {
    const code = Number((error as { statusCode?: number }).statusCode || 0)
    if ([400, 401, 402, 403, 404, 422].includes(code)) {
      job.state = 'fail'
      job.failMsg = error instanceof Error ? error.message : 'WaveSpeed generation failed'
    }
    job.lastSyncAt = new Date()
  }
  await job.save()
  return job
}
