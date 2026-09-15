import { GenerationJob } from '../models/generationJob'
import { falEndpoint } from '../utils/falInput'
import { createWavespeedTask, readWavespeedTask, wavespeedResultUrls } from '../utils/wavespeed'
import { agentEnv } from './env'

export const IMAGE_TIMEOUT_MS = 8 * 60 * 1000
export const VIDEO_TIMEOUT_MS = 30 * 60 * 1000
export const VIDEO_25_TIMEOUT_MS = 40 * 60 * 1000
export type OnProviderCreated = (providerTaskId: string) => void | Promise<void>

export async function pollFalTask(taskId: string, options: { timeoutMs: number, failLabel: string, endpoint?: string, statusUrl?: string, responseUrl?: string }) {
  const job = options.endpoint ? null : await GenerationJob.findOne({ providerTaskId: taskId })
  if (job?.provider === 'wavespeed')
    return pollWavespeedTask(taskId, options.timeoutMs)
  const endpoint = options.endpoint || falEndpoint(String(job?.requestBody?.model || job?.model || ''), job?.input || {})
  if (!endpoint)
    throw new Error('Cannot recover generation without its model endpoint')
  const queue = `https://queue.fal.run/${endpoint.split('/').slice(0, 2).join('/')}/requests/${encodeURIComponent(taskId)}`
  const statusUrl = options.statusUrl || String(job?.requestBody?.statusUrl || '') || `${queue}/status`
  const responseUrl = options.responseUrl || String(job?.requestBody?.responseUrl || '') || queue
  if ((job?.provider && job.provider !== 'fal') || [statusUrl, responseUrl].some(url => new URL(url).origin !== 'https://queue.fal.run'))
    throw new Error('Cannot resume a retired provider task. Please generate again.')
  const headers = { Authorization: `Key ${agentEnv.falApiKey}` }
  const deadline = Date.now() + options.timeoutMs
  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(30_000) })
    const status = await response.json() as Record<string, any>
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }
      throw new Error(String(status.detail || status.message || options.failLabel))
    }
    if (status.error || ['FAILED', 'CANCELED'].includes(status.status))
      throw new Error(String(status.error || options.failLabel))
    if (status.status === 'COMPLETED') {
      const response = await fetch(responseUrl, { headers, signal: AbortSignal.timeout(30_000) })
      const result = await response.json() as Record<string, any>
      if (!response.ok)
        throw new Error(typeof result.detail === 'string' ? result.detail : options.failLabel)
      const urls = (Array.isArray(result.images) ? result.images : [result.video || result.image]).map((file: any) => file?.url).filter((url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
      if (!urls.length)
        throw new Error('Fal returned no result URLs')
      return { taskId, urls }
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error(`${options.failLabel} timed out`)
}
export async function generateGptImage2(input: { prompt: string, aspect_ratio: string, resolution: string, input_urls?: string[] }, signal?: AbortSignal, onCreated?: OnProviderCreated) {
  signal?.throwIfAborted()
  // Image edits use GPT Image 2.5 Sunburst; text-to-image keeps GPT Image 2.
  const model = input.input_urls?.length ? 'gpt-image-2-5-sunburst-image-to-image' : 'gpt-image-2-text-to-image'
  const payload = {
    prompt: input.prompt,
    resolution: input.resolution.toLowerCase(),
    ...(input.aspect_ratio && !['auto', 'adaptive'].includes(input.aspect_ratio) ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(input.input_urls?.length ? { images: input.input_urls } : {}),
  }
  const task = await createWavespeedTask(model, payload)
  await onCreated?.(task.requestId)
  return pollWavespeedTask(task.requestId, IMAGE_TIMEOUT_MS, signal)
}
interface VideoInput { prompt: string, aspect_ratio: string, resolution: string, duration: number, generate_audio: boolean, first_frame_url?: string, last_frame_url?: string, reference_image_urls?: string[], reference_video_urls?: string[] }
function videoModel(prefix: string, input: VideoInput) {
  return `${prefix}-${input.reference_image_urls?.length || input.reference_video_urls?.length ? 'reference-to-video' : input.first_frame_url ? 'image-to-video' : 'text-to-video'}`
}
export async function generateSeedance2(input: VideoInput, signal?: AbortSignal, onCreated?: OnProviderCreated) {
  signal?.throwIfAborted()
  if ((input.reference_video_urls?.length || 0) > 1)
    throw new Error('Seedance 2.0 video edit accepts one source video. Choose one video to edit.')
  const model = videoModel('bytedance/seedance-2', input)
  const payload = {
    prompt: input.prompt,
    resolution: input.resolution.toLowerCase(),
    duration: input.duration,
    generate_audio: input.generate_audio,
    ...(input.aspect_ratio && !['adaptive', 'auto'].includes(input.aspect_ratio) ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(model.endsWith('reference-to-video') ? { video: input.reference_video_urls?.[0], reference_images: input.reference_image_urls || [] } : model.endsWith('image-to-video') ? { image: input.first_frame_url, last_image: input.last_frame_url } : {}),
  }
  const task = await createWavespeedTask(model, payload)
  await onCreated?.(task.requestId)
  return pollWavespeedTask(task.requestId, VIDEO_TIMEOUT_MS, signal)
}
export async function generateSeedance25(input: VideoInput, signal?: AbortSignal, onCreated?: OnProviderCreated) {
  signal?.throwIfAborted()
  if ((input.reference_video_urls?.length || 0) > 1)
    throw new Error('Seedance 2.5 video edit accepts one source video. Choose one video to edit.')
  const model = videoModel('bytedance/seedance-2-5', input)
  const reference = model.endsWith('reference-to-video')
  const image = model.endsWith('image-to-video')
  const payload = {
    prompt: input.prompt,
    resolution: input.resolution.toLowerCase(),
    generate_audio: input.generate_audio,
    ...(!reference ? { duration: input.duration } : {}),
    ...(!reference && !image && input.aspect_ratio && !['adaptive', 'auto'].includes(input.aspect_ratio) ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(reference ? { video: input.reference_video_urls?.[0], reference_images: input.reference_image_urls || [] } : image ? { image: input.first_frame_url, last_image: input.last_frame_url } : {}),
  }
  const task = await createWavespeedTask(model, payload)
  await onCreated?.(task.requestId)
  return pollWavespeedTask(task.requestId, VIDEO_25_TIMEOUT_MS, signal)
}
export function generateWan30(input: VideoInput, signal?: AbortSignal, onCreated?: OnProviderCreated) {
  return generateWan30Task(input, signal, onCreated)
}

async function generateWan30Task(input: VideoInput, signal?: AbortSignal, onCreated?: OnProviderCreated) {
  signal?.throwIfAborted()
  const model = videoModel('wan/3-0-video', input)
  const payload = {
    prompt: input.prompt,
    resolution: input.resolution.toLowerCase(),
    duration: input.duration,
    enable_audio: input.generate_audio,
    ...(input.aspect_ratio && input.aspect_ratio !== 'adaptive' ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(model.endsWith('reference-to-video') ? { reference_images: input.reference_image_urls || [], reference_videos: input.reference_video_urls || [] } : model.endsWith('image-to-video') ? { image: input.first_frame_url, last_image: input.last_frame_url } : {}),
  }
  const task = await createWavespeedTask(model, payload)
  await onCreated?.(task.requestId)
  return pollWavespeedTask(task.requestId, VIDEO_TIMEOUT_MS, signal)
}
export async function pollWavespeedTask(taskId: string, timeoutMs: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    const result = await readWavespeedTask(taskId)
    if (['failed', 'cancelled', 'timeout', 'deleted'].includes(result.status))
      throw new Error(String(result.error || 'WaveSpeed generation failed'))
    if (result.status === 'completed') {
      const urls = wavespeedResultUrls(result)
      if (!urls.length)
        throw new Error('WaveSpeed returned no result URL')
      return { taskId, urls }
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('WaveSpeed generation continues in the background')
}
