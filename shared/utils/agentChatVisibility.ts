/** Patterns for agent-protocol text that must not appear in the chat UI. */

const INSPECT_STILLS_MARKER = 'Inspect these generated stills from the last tool results'
const ATTACHED_STILLS_MARKER = '\n\nAttached stills:'
const ATTACHED_VIDEO_MARKER = '\n\nAttached video references:'
const ATTACHED_VOICE_MARKER = '\n\nAttached voice references:'
const TOOL_URL_HINT_MARKER = 'Use these URLs as generate_image input_urls'
const TOOL_VIDEO_HINT_MARKER = 'Use these URLs as generate_video reference_videos'
const TOOL_AUDIO_HINT_MARKER = 'Use these URLs as generate_video reference_audios'
const ATTACH_ONLY_FALLBACKS = new Set([
  'Use the attached still(s).',
  'Use the attached video reference(s).',
  'Use the attached voice reference(s).',
  'Use the attached media.',
])
const INTERNAL_EDIT_MARKER = 'INTERNAL_EDIT_CONTEXT'
/** Trailing sentinel appended to Skill Creator edit briefs (LLM-only). */
export const INTERNAL_EDIT_CONTEXT_END = '<<<END_INTERNAL_EDIT_CONTEXT>>>'

function earliestMarkerIndex(value: string, markers: string[]) {
  let best = -1
  for (const marker of markers) {
    const at = value.indexOf(marker)
    if (at < 0)
      continue
    if (best < 0 || at < best)
      best = at
  }
  return best
}

export function isInternalAgentChatText(text: string) {
  const value = String(text || '').trim()
  if (!value)
    return false
  if (value.startsWith(INSPECT_STILLS_MARKER) || value.includes(INSPECT_STILLS_MARKER))
    return true
  // Entire turn is only the attach protocol (no human prompt left after strip).
  const publicText = publicAgentChatText(value)
  if (!publicText && (
    value.includes('Attached stills:')
    || value.includes('Attached video references:')
    || value.includes('Attached voice references:')
    || value.includes(TOOL_URL_HINT_MARKER)
    || value.includes(TOOL_VIDEO_HINT_MARKER)
    || value.includes(TOOL_AUDIO_HINT_MARKER)
  ))
    return true
  // Skill Creator edit brief with no remaining human prompt.
  if (!publicText && value.includes(INTERNAL_EDIT_MARKER))
    return true
  return false
}

function stripInternalEditContext(text: string) {
  let value = String(text || '')
  const markerAt = value.indexOf(INTERNAL_EDIT_MARKER)
  if (markerAt < 0)
    return value

  // Preferred: explicit end sentinel we append to every edit brief.
  const endAt = value.indexOf(INTERNAL_EDIT_CONTEXT_END, markerAt)
  if (endAt >= 0) {
    value = `${value.slice(0, markerAt)}${value.slice(endAt + INTERNAL_EDIT_CONTEXT_END.length)}`
    return value.replace(/^\s+/, '')
  }

  // Legacy briefs (before the sentinel): drop through "Do not dump the full SKILL.md…".
  const legacyEnd = /Do not dump the full SKILL\.md into chat[^\n]*/i.exec(value.slice(markerAt))
  if (legacyEnd && legacyEnd.index != null) {
    const absoluteEnd = markerAt + legacyEnd.index + legacyEnd[0].length
    value = `${value.slice(0, markerAt)}${value.slice(absoluteEnd)}`
    return value.replace(/^\s+/, '')
  }

  // Fallback: drop from the marker through the closing markdown fence.
  const fromMarker = value.slice(markerAt)
  const fenceClose = fromMarker.search(/\n```(?:\s*\n|$)/)
  if (fenceClose >= 0) {
    const afterFence = fromMarker.slice(fenceClose).replace(/^\n```\s*/, '')
    value = `${value.slice(0, markerAt)}${afterFence}`
    return value.replace(/^\s+/, '')
  }

  return value.slice(0, markerAt).trim()
}

/** Strip LLM-only attachment protocol from a user turn, keeping the human prompt. */
export function publicAgentChatText(text: string) {
  let value = stripInternalEditContext(String(text || ''))
  const attachedAt = earliestMarkerIndex(value, [
    ATTACHED_STILLS_MARKER,
    ATTACHED_VIDEO_MARKER,
    ATTACHED_VOICE_MARKER,
  ])
  if (attachedAt >= 0)
    value = value.slice(0, attachedAt)
  else {
    // Protocol without the blank-line prefix (hydrated / legacy shapes).
    const looseAt = earliestMarkerIndex(value, [
      '\nAttached stills:',
      '\nAttached video references:',
      '\nAttached voice references:',
      TOOL_URL_HINT_MARKER,
      TOOL_VIDEO_HINT_MARKER,
      TOOL_AUDIO_HINT_MARKER,
    ])
    if (looseAt >= 0)
      value = value.slice(0, looseAt)
  }
  // Drop a leading "Attached …" block when the whole turn is protocol.
  value = value
    .replace(/^Attached (?:stills|video references|voice references):[\s\S]*$/i, '')
    .replace(/\n+Attached (?:stills|video references|voice references):\s*(?:\d+\.\s*)?(?:https?:\/\/\S+\s*)*$/i, '')
  const trimmed = value.trim()
  if (ATTACH_ONLY_FALLBACKS.has(trimmed))
    return ''
  return trimmed
}
