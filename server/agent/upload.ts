import { saveMediaFile } from '../utils/localMedia'

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
}

const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
}

const VIDEO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const AUDIO_MAX_BYTES = 15 * 1024 * 1024
const VIDEO_MAX_BYTES = 200 * 1024 * 1024

export type AgentMediaKind = 'image' | 'audio' | 'video'

export function agentMediaKindForMime(mime: string): AgentMediaKind | null {
  if (IMAGE_EXTENSIONS[mime])
    return 'image'
  if (AUDIO_EXTENSIONS[mime])
    return 'audio'
  if (VIDEO_EXTENSIONS[mime])
    return 'video'
  return null
}

function extensionForKind(kind: AgentMediaKind, mime: string) {
  if (kind === 'image')
    return IMAGE_EXTENSIONS[mime]
  if (kind === 'audio')
    return AUDIO_EXTENSIONS[mime]
  return VIDEO_EXTENSIONS[mime]
}

function maxBytesForKind(kind: AgentMediaKind) {
  if (kind === 'image')
    return IMAGE_MAX_BYTES
  if (kind === 'audio')
    return AUDIO_MAX_BYTES
  return VIDEO_MAX_BYTES
}

function sizeErrorForKind(kind: AgentMediaKind) {
  if (kind === 'image')
    return 'Each image must be between 1 byte and 10MB'
  if (kind === 'audio')
    return 'Each audio file must be between 1 byte and 15MB'
  return 'Each video must be between 1 byte and 200MB'
}

export async function uploadAgentMedia(sessionId: string, file: { bytes: Uint8Array, mime: string }) {
  const kind = agentMediaKindForMime(file.mime)
  if (!kind)
    throw new Error('This media type is not supported')
  const extension = extensionForKind(kind, file.mime)
  const maxBytes = maxBytesForKind(kind)
  if (!file.bytes.byteLength || file.bytes.byteLength > maxBytes)
    throw new Error(sizeErrorForKind(kind))
  if (!sessionId)
    throw new Error('A session is required')
  const key = `agent-lab/${encodeURIComponent(sessionId)}/${crypto.randomUUID()}.${extension}`
  const url = await saveMediaFile(key, file.bytes, file.mime)
  return { url, kind }
}

/** @deprecated Prefer uploadAgentMedia — kept for image-only callers. */
export async function uploadAgentImage(sessionId: string, file: { bytes: Uint8Array, mime: string }) {
  const result = await uploadAgentMedia(sessionId, file)
  if (result.kind !== 'image')
    throw new Error('This image type is not supported')
  return result.url
}
