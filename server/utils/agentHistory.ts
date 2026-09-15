import type { AgentHistoryImage, AgentHistoryMessage, AgentHistoryPage } from '../../shared/types/agentHistory'
import { AGENT_TRANSIENT_ERROR_RE, isAgentTransientMessage } from '../../shared/utils/agentHistoryVisibility'
import { AgentChat } from '../models/agentChat'
import { AgentHistory } from '../models/agentHistory'
import { connectDatabase } from './sqlite'

const PAGE_SIZE = 30
const historyContent = (content: string) => content.replace(/<\/?think(?:ing)?\s*>/gi, '')
const pendingArchives = new Map<string, Promise<void>>()
export function archiveAgentHistory(sessionId: string, messages: AgentHistoryMessage[], images: AgentHistoryImage[]) {
  return withArchiveLock(sessionId, () => archiveBatch(sessionId, messages, images))
}
async function withArchiveLock(sessionId: string, work: () => Promise<void>) {
  const key = sessionId
  const previous = pendingArchives.get(key) || Promise.resolve()
  const task = previous.catch(() => { }).then(work)
  pendingArchives.set(key, task)
  try {
    await task
  }
  finally {
    if (pendingArchives.get(key) === task)
      pendingArchives.delete(key)
  }
}
/** Archive public turns separately from the bounded LLM context and UI cache. */
async function archiveBatch(sessionId: string, messages: AgentHistoryMessage[], images: AgentHistoryImage[]) {
  if (!messages.length)
    return
  await connectDatabase()
  // Preserve the part of an old browser snapshot preceding the runtime transcript.
  const exists = await AgentHistory.exists({ sessionId })
  if (!exists) {
    const legacy = await AgentChat.findOne({ sessionId }).select('messages images')
    if (legacy?.messages?.length) {
      const overlap = legacy.messages.findIndex(row => messages.some(item => item.role === row.role && historyContent(item.content) === historyContent(row.content) && row.content))
      const storedMessages = legacy.toObject().messages
      const older = overlap >= 0 ? storedMessages.slice(0, overlap) : storedMessages
      await writeHistory(sessionId, older, legacy.toObject().images)
    }
  }
  const legacyRows = await AgentHistory.find({ sessionId, 'messageId': { $not: /^history:/ }, 'message.kind': { $ne: 'error' } }).sort({ _id: 1 }).limit(120)
  let cursor = 0
  for (const message of messages) {
    if (!message.id.startsWith('history:'))
      continue
    const index = legacyRows.findIndex((row, i) => i >= cursor && row.message.role === message.role && historyContent(row.message.content) === historyContent(message.content) && message.content)
    if (index < 0)
      continue
    const row = legacyRows[index]!
    if (!await AgentHistory.exists({ sessionId, messageId: message.id }))
      await AgentHistory.updateOne({ _id: row._id, messageId: row.messageId }, { $set: { messageId: message.id } })
    else
      await AgentHistory.deleteOne({ _id: row._id, sessionId })
    cursor = index + 1
  }
  await writeHistory(sessionId, messages, images)
}
/** Retain browser-only cards/errors as well as richer metadata for recovered turns. */
export async function archiveAgentUiHistory(sessionId: string, messages: AgentHistoryMessage[], images: AgentHistoryImage[]) {
  return withArchiveLock(sessionId, async () => {
    await connectDatabase()
    const canonical = await AgentHistory.find({
      sessionId,
      'messageId': /^history:/,
      'message.content': { $in: messages.filter(message => message.content && !message.kind).flatMap(message => [message.content, historyContent(message.content), `<think>${historyContent(message.content)}</think>`]) },
    }).sort({ _id: 1 }).lean()
    const rows = messages.map((message) => {
      const match = !message.kind && !message.id.startsWith('history:')
        ? canonical.findIndex(row => row.message.role === message.role && historyContent(row.message.content) === historyContent(message.content))
        : -1
      const existing = (match >= 0 ? canonical.splice(match, 1)[0] : canonical.find(row => row.messageId === message.id)) as {
        messageId: string
        message: AgentHistoryMessage
      } | undefined
      const canonicalId = existing?.messageId
      // Plain service snapshots must not erase cards saved by the browser.
      const metadata = Object.fromEntries(['confirmation', 'resolvedParams', 'confirmationState', 'confirmationReason', 'confirmationCredits', 'choice', 'choiceState', 'choiceAnswers'].map((key) => {
        const value = message[key as keyof AgentHistoryMessage]
        const present = value !== undefined && value !== null && value !== '' && value !== 0 && (!Array.isArray(value) || value.length > 0)
        return [key, present ? value : existing?.message[key as keyof AgentHistoryMessage]]
      }))
      return {
        ...message,
        ...metadata,
        content: existing && /^<think(?:ing)?>/i.test(existing.message.content) && historyContent(existing.message.content) === historyContent(message.content)
          ? existing.message.content
          : message.content,
        id: canonicalId || (message.id.startsWith('history:') || message.id.startsWith('ui:') ? message.id : `ui:${message.id}`),
      }
    })
    await archiveBatch(sessionId, rows, images)
  })
}
function historyCardPresent(value: unknown) {
  if (value === undefined || value === null || value === '')
    return false
  if (Array.isArray(value))
    return value.length > 0
  return true
}
function linkHistoryImages(message: AgentHistoryMessage, images: AgentHistoryImage[]) {
  const byId = new Map(images.map(image => [image.id, image]))
  const ids = new Set<string>(message.imageIds || [])
  const jobs = (message.confirmation as { jobs?: Array<{ id?: string }> } | null | undefined)?.jobs || []
  for (const job of jobs) {
    const jobId = String(job?.id || '')
    if (!jobId)
      continue
    for (const image of images) {
      if (image.id === jobId || (image.id.startsWith(`${jobId}_`) && /^\d+$/.test(image.id.slice(jobId.length + 1))))
        ids.add(image.id)
    }
  }
  const fromIds = [...ids].flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
  const fromUrls = images.filter(image => image.url && message.content.includes(image.url))
  const seen = new Set<string>()
  return [...fromIds, ...fromUrls].filter((image) => {
    const key = image.url || image.id
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  }).slice(0, 16)
}
async function writeHistory(sessionId: string, messages: AgentHistoryMessage[], images: AgentHistoryImage[]) {
  if (!messages.length)
    return
  const cardKeys = new Set(['confirmation', 'resolvedParams', 'confirmationState', 'confirmationReason', 'confirmationCredits', 'choice', 'choiceState', 'choiceAnswers'])
  const existingRows = await AgentHistory.find({
    sessionId,
    messageId: { $in: messages.map(message => message.id) },
  }).select('messageId message images').lean()
  const existingById = new Map(existingRows.map(row => [row.messageId, row]))
  const operations = messages.filter(message => !isAgentTransientMessage(message)).map((message) => {
    const existing = existingById.get(message.id)
    const linked = linkHistoryImages(message, images)
    // Never replace a richer archived media set with a thinner service snapshot.
    const nextImages = linked.length
      ? [...new Map([...(existing?.images || []), ...linked].map(image => [image.id, image])).values()].slice(0, 16)
      : (existing?.images || [])
    const fields: Record<string, unknown> = {
      ...message,
      imageIds: nextImages.length ? nextImages.map(image => image.id) : (message.imageIds || existing?.message?.imageIds || []),
    }
    for (const key of cardKeys) {
      if (!historyCardPresent(fields[key]))
        delete fields[key]
    }
    return {
      updateOne: {
        filter: { sessionId, messageId: message.id },
        update: {
          $set: {
            ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [`message.${key}`, value])),
            images: nextImages,
          },
          $setOnInsert: { sessionId, messageId: message.id },
        },
        upsert: true,
      },
    }
  })
  if (operations.length)
    await AgentHistory.bulkWrite(operations, { ordered: true })
}
export async function readAgentHistory(sessionId: string, query: {
  before?: unknown
  after?: unknown
  beforeId?: unknown
}): Promise<AgentHistoryPage> {
  let before = String(query.before || '')
  const after = String(query.after || '')
  if ((before && !/^[a-f\d]{24}$/i.test(before)) || (after && !/^[a-f\d]{24}$/i.test(after)) || (before && after))
    throw createError({ statusCode: 400, statusMessage: 'Invalid history cursor' })
  await connectDatabase()
  // Lazily import surviving legacy snapshots; never replace an existing archive.
  if (!await AgentHistory.exists({ sessionId })) {
    await withArchiveLock(sessionId, async () => {
      if (await AgentHistory.exists({ sessionId }))
        return
      const chat = await AgentChat.findOne({ sessionId }).select('messages images')
      if (chat?.messages?.length)
        await writeHistory(sessionId, chat.toObject().messages, chat.toObject().images)
    })
  }
  if (!before && !after && query.beforeId) {
    const anchor = await AgentHistory.findOne({ sessionId, messageId: { $in: [String(query.beforeId).slice(0, 120), `ui:${String(query.beforeId).slice(0, 120)}`] } }).select('_id')
    // An unknown live boundary must not replay the latest history page.
    if (!anchor)
      return { messages: [], images: [], olderCursor: null, newerCursor: null }
    before = String(anchor._id)
  }
  const visible = { sessionId, $nor: [{ 'message.kind': 'error', 'message.content': AGENT_TRANSIENT_ERROR_RE }] }
  const filter = {
    ...visible,
    ...(before ? { _id: { $lt: before } } : {}),
    ...(after ? { _id: { $gt: after } } : {}),
  }
  const rows = await AgentHistory.find(filter).sort({ _id: after ? 1 : -1 }).limit(PAGE_SIZE).lean()
  if (!after)
    rows.reverse()
  const first = rows[0]?._id
  const last = rows.at(-1)?._id
  const [older, newer] = await Promise.all([
    first ? AgentHistory.exists({ ...visible, _id: { $lt: first } }) : null,
    last ? AgentHistory.exists({ ...visible, _id: { $gt: last } }) : null,
  ])
  const media = new Map<string, AgentHistoryImage>()
  for (const row of rows) {
    for (const image of row.images as AgentHistoryImage[])
      media.set(image.id, image)
  }
  return {
    messages: rows.map(row => ({ ...row.message, id: row.messageId }) as AgentHistoryMessage),
    images: [...media.values()],
    olderCursor: older ? String(first) : null,
    newerCursor: newer ? String(last) : null,
  }
}
