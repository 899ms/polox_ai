import type { ChatMessage, ToolCall } from './types'
import { readStoredMedia } from '../utils/localMedia'
import { uploadWavespeedFile } from '../utils/wavespeed'
import { agentEnv } from './env'

/** Strip layer-selection bbox coordinates before the LLM sees tool results. Server session keeps full regions. */
function messagesForLlm(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({ historyId: _historyId, internal: _internal, ...message }) => {
    if (message.role !== 'tool' || typeof message.content !== 'string')
      return message
    try {
      const parsed = JSON.parse(message.content) as {
        ok?: boolean
        answers?: Array<Record<string, unknown>>
        [key: string]: unknown
      }
      if (!Array.isArray(parsed.answers))
        return message
      let changed = false
      const answers = parsed.answers.map((answer) => {
        if (answer.questionId !== 'layer_selection_method' || answer.optionId !== 'draw_boxes')
          return answer
        const next: Record<string, unknown> = { ...answer }
        if ('regions' in next) {
          const regions = Array.isArray(next.regions) ? next.regions : []
          next.boxCount = regions.length
          delete next.regions
          changed = true
        }
        if (Array.isArray(next.imageSelections)) {
          next.imageSelections = (next.imageSelections as Array<Record<string, unknown>>).map((selection) => {
            const row: Record<string, unknown> = {
              imageUrl: selection.imageUrl,
              boxCount: Array.isArray(selection.regions) ? selection.regions.length : (selection.boxCount || 0),
            }
            if (typeof selection.boxedImageUrl === 'string' && selection.boxedImageUrl)
              row.boxedImageUrl = selection.boxedImageUrl
            changed = true
            return row
          })
        }
        return next
      })
      if (!changed)
        return message
      return {
        ...message,
        content: JSON.stringify({ ...parsed, answers }),
      }
    }
    catch {
      return message
    }
  })
}

const WAVESPEED_URL = 'https://llm.wavespeed.ai/v1/chat/completions'

export interface StreamDelta {
  content?: string
  reasoning?: string
  toolCalls?: Array<{
    index: number
    id?: string
    name?: string
    arguments?: string
  }>
  finishReason?: string | null
}

interface WaveSpeedChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

async function providerMessages(messages: ChatMessage[]) {
  const imageUrls = new Map<string, Promise<string>>()
  const providerImageUrl = (source: string) => {
    let pending = imageUrls.get(source)
    if (!pending) {
      pending = (async () => {
        const local = await readStoredMedia(source, 200 * 1024 * 1024)
        return local ? uploadWavespeedFile(local.bytes, local.mime, new URL(source).pathname.split('/').pop() || 'image.png') : source
      })()
      imageUrls.set(source, pending)
    }
    return pending
  }
  // Older sessions may contain synthetic results for uploads, which have no tool call.
  const pendingCalls = new Set<string>()
  const pairedMessages = messages.filter((message) => {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls || [])
        pendingCalls.add(call.id)
    }
    if (message.role === 'tool') {
      if (!message.tool_call_id || !pendingCalls.delete(message.tool_call_id))
        return false
    }
    return true
  })
  return Promise.all(pairedMessages.map(async ({ historyId: _historyId, internal: _internal, ...message }) => {
    if (!Array.isArray(message.content))
      return message
    const content = await Promise.all(message.content.map(async (part) => {
      if (part.type !== 'image_url')
        return part
      if (agentEnv.model === 'deepseek/deepseek-v4-flash' || agentEnv.model === 'deepseek/deepseek-v4.1-flash')
        throw new Error('DeepSeek V4 Flash does not support image input. Send a text-only message or choose a vision-capable model in Service connection.')
      const url = await providerImageUrl(part.image_url.url)
      return { ...part, image_url: { ...part.image_url, url } }
    }))
    return { ...message, content }
  }))
}

export async function completeText(options: {
  signal?: AbortSignal
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}) {
  const response = await fetch(WAVESPEED_URL, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Authorization': `Bearer ${agentEnv.wavespeedApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: agentEnv.model,
      temperature: options.temperature ?? 0.2,
      stream: false,
      max_tokens: options.maxTokens ?? 32,
      messages: await providerMessages(messagesForLlm(options.messages)),
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `WaveSpeed request failed (${response.status})`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
    error?: { message?: string }
  }
  if (payload.error?.message)
    throw new Error(payload.error.message)
  return String(payload.choices?.[0]?.message?.content || '').trim()
}

export async function streamChat(options: {
  messages: ChatMessage[]
  tools: unknown[]
  requiredTool?: string
  disableTools?: boolean
  signal?: AbortSignal
  onDelta: (delta: StreamDelta) => void
}) {
  const response = await fetch(WAVESPEED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${agentEnv.wavespeedApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: agentEnv.model,
      temperature: 0.4,
      stream: true,
      messages: await providerMessages(messagesForLlm(options.messages)),
      tools: options.tools,
      tool_choice: options.disableTools ? 'none' : options.requiredTool ? { type: 'function', function: { name: options.requiredTool } } : 'auto',
      parallel_tool_calls: !options.requiredTool,
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `WaveSpeed request failed (${response.status})`)
  }

  if (!response.body)
    throw new Error('WaveSpeed returned an empty stream')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() || ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:'))
        continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]')
        continue
      let chunk: WaveSpeedChunk
      try {
        chunk = JSON.parse(data) as WaveSpeedChunk
      }
      catch {
        continue
      }
      if (chunk.error?.message)
        throw new Error(chunk.error.message)
      const choice = chunk.choices?.[0]
      if (!choice)
        continue
      const delta = choice.delta || {}
      options.onDelta({
        content: delta.content || undefined,
        reasoning: delta.reasoning || delta.reasoning_content || undefined,
        toolCalls: (delta.tool_calls || []).map(item => ({
          index: item.index ?? 0,
          id: item.id,
          name: item.function?.name,
          arguments: item.function?.arguments,
        })),
        finishReason: choice.finish_reason,
      })
    }
  }
}

export function assembleToolCalls(parts: Array<{ index: number, id?: string, name?: string, arguments?: string }>): ToolCall[] {
  const byIndex = new Map<number, { id: string, name: string, arguments: string }>()
  for (const part of parts) {
    const current = byIndex.get(part.index) || { id: '', name: '', arguments: '' }
    if (part.id)
      current.id = part.id
    if (part.name)
      current.name = part.name
    if (part.arguments)
      current.arguments += part.arguments
    byIndex.set(part.index, current)
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => ({
      id: value.id || crypto.randomUUID(),
      type: 'function' as const,
      function: {
        name: value.name,
        arguments: value.arguments || '{}',
      },
    }))
}
