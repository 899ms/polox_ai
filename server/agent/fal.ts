import { createWavespeedTask } from '../utils/wavespeed'
import { pollWavespeedTask } from './modelGeneration'

export async function removeBackground(imageUrl: string, signal?: AbortSignal, onCreated?: (requestId: string) => void | Promise<void>) {
  signal?.throwIfAborted()
  const task = await createWavespeedTask('bria/remove-background', { image: imageUrl })
  await onCreated?.(task.requestId)
  const result = await pollWavespeedTask(task.requestId, 4 * 60 * 1000, signal)
  return { requestId: task.requestId, urls: result.urls }
}
