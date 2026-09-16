import type { ChatMessage } from './types'

export function hasLayerSourceImage(messages: ChatMessage[], images: { id: string, url?: string, kind?: string, status: string }[]) {
  const available = images.filter(image => image.status === 'success' && image.url && image.kind !== 'video')
  return messages.some((message) => {
    if (message.role !== 'user' || message.internal)
      return false
    if (Array.isArray(message.content) && message.content.some(part => part.type === 'image_url' && available.some(image => image.url === part.image_url.url)))
      return true
    const text = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
    return available.some(image => text.includes(image.url!))
  })
}

export function needsLayerDescriptionCard(messages: ChatMessage[]) {
  const calls = new Map(messages.flatMap(message => message.tool_calls || []).map(call => [call.id, call]))
  for (const message of [...messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      return false
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    const call = calls.get(message.tool_call_id || '')
    if (call?.function.name !== 'ask_user')
      continue
    try {
      const result = JSON.parse(message.content)
      if (!result.ok)
        continue
      const args = JSON.parse(call.function.arguments)
      if (args.questions?.some((question: { id: string }) => question.id === 'layer_split_plan' || question.id === 'layer_split_confirm'))
        return false
      const method = result.answers?.find((answer: { questionId: string }) => answer.questionId === 'layer_selection_method')
      if (method)
        return !method.skipped && method.optionId === 'describe_layers'
    }
    catch { /* Ignore incomplete tool responses. */ }
  }
  return false
}

export function confirmedLayerSelections(messages: ChatMessage[]) {
  const selections = new Map<string, { imageUrl: string, regions: number[][], boxedImageUrl?: string }>()
  for (const message of [...messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      break
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    try {
      const result = JSON.parse(message.content)
      if (result.ok !== true || !Array.isArray(result.answers))
        continue
      for (const answer of result.answers) {
        if (answer.questionId !== 'layer_selection_method' || answer.optionId !== 'draw_boxes' || answer.skipped)
          continue
        for (const selection of answer.imageSelections || [answer]) {
          if (typeof selection.imageUrl === 'string' && selection.regions?.length && !selections.has(selection.imageUrl)) {
            const boxedImageUrl = typeof selection.boxedImageUrl === 'string' ? selection.boxedImageUrl as string : undefined
            selections.set(selection.imageUrl, {
              imageUrl: selection.imageUrl,
              regions: selection.regions as number[][],
              ...(boxedImageUrl ? { boxedImageUrl } : {}),
            })
          }
        }
      }
    }
    catch { /* Only structured choice results contain user selections. */ }
  }
  return [...selections.values()]
}

export function confirmedLayerSelection(messages: ChatMessage[], imageUrl?: string) {
  const selections = confirmedLayerSelections(messages)
  return (imageUrl ? selections.find(selection => selection.imageUrl === imageUrl) : selections[0]) || null
}


export function describeLayersSelected(messages: ChatMessage[]) {
  const calls = new Map(messages.flatMap(message => message.tool_calls || []).map(call => [call.id, call]))
  for (const message of [...messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      return false
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    const call = calls.get(message.tool_call_id || '')
    if (call?.function.name !== 'ask_user')
      continue
    try {
      const result = JSON.parse(message.content)
      if (!result.ok)
        continue
      const method = result.answers?.find((answer: { questionId: string }) => answer.questionId === 'layer_selection_method')
      if (method)
        return !method.skipped && method.optionId === 'describe_layers'
    }
    catch { /* Ignore incomplete tool responses. */ }
  }
  return false
}

function isLayerConfirmQuestion(id: string) {
  return id === 'layer_split_confirm' || id === 'layer_split_plan'
}

function isLayerConfirmOption(optionId: string) {
  return ['confirm', 'correct_plan', 'looks_good'].includes(optionId)
}

function isLayerAdjustOption(optionId: string) {
  return ['adjust', 'correct', 'revise'].includes(optionId)
}

/** Index of the latest draw-boxes / describe-layers method answer that established the current selection. */
function latestLayerSelectionIndex(messages: ChatMessage[]) {
  const calls = new Map(messages.flatMap(message => message.tool_calls || []).map(call => [call.id, call]))
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role === 'user' && !message.internal)
      return -1
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    const call = calls.get(message.tool_call_id || '')
    if (call?.function.name !== 'ask_user')
      continue
    try {
      const result = JSON.parse(message.content)
      if (!result.ok || !Array.isArray(result.answers))
        continue
      const method = result.answers.find((answer: { questionId: string }) => answer.questionId === 'layer_selection_method')
      if (!method || method.skipped)
        continue
      if (method.optionId === 'describe_layers')
        return index
      if (method.optionId === 'draw_boxes') {
        const selections = method.imageSelections || (method.imageUrl && method.regions?.length ? [method] : [])
        if (selections?.length)
          return index
      }
    }
    catch { /* Ignore incomplete tool responses. */ }
  }
  return -1
}

function latestLayerSplitConfirmAfterSelection(messages: ChatMessage[]) {
  const selectionIndex = latestLayerSelectionIndex(messages)
  if (selectionIndex < 0 && !confirmedLayerSelection(messages) && !describeLayersSelected(messages))
    return null
  const calls = new Map(messages.flatMap(message => message.tool_calls || []).map(call => [call.id, call]))
  const start = selectionIndex >= 0 ? selectionIndex + 1 : 0
  for (let index = messages.length - 1; index >= start; index--) {
    const message = messages[index]!
    if (message.role === 'user' && !message.internal)
      continue
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    const call = calls.get(message.tool_call_id || '')
    if (call?.function.name !== 'ask_user')
      continue
    try {
      const result = JSON.parse(message.content)
      if (!result.ok || !Array.isArray(result.answers))
        continue
      const args = JSON.parse(call.function.arguments)
      if (!args.questions?.some((question: { id: string }) => isLayerConfirmQuestion(question.id)))
        continue
      const answer = result.answers.find((item: { questionId: string }) => isLayerConfirmQuestion(item.questionId))
      if (answer)
        return { result, answer, skipped: result.skipped === true || answer.skipped === true, index }
    }
    catch { /* Ignore incomplete tool responses. */ }
  }
  return null
}

/** After boxes or Describe the layers, require an inspect-and-confirm card before splitting. */
export function layerSplitNeedsConfirm(messages: ChatMessage[]) {
  const hasBoxes = Boolean(confirmedLayerSelection(messages))
  const describe = describeLayersSelected(messages)
  if (!hasBoxes && !describe)
    return false

  const confirm = latestLayerSplitConfirmAfterSelection(messages)
  if (!confirm)
    return true

  const optionId = String(confirm.answer.optionId || '')
  if (isLayerAdjustOption(optionId))
    return false
  if (confirm.skipped)
    return false
  if (isLayerConfirmOption(optionId))
    return false
  // Legacy layer_split_plan: picking a concrete plan (or custom text) counts as confirmation.
  if (confirm.answer.questionId === 'layer_split_plan' && (optionId || confirm.answer.text))
    return false
  if (confirm.answer.text)
    return false
  return true
}

/** True while the user asked to correct/supplement and has not yet provided a new selection. */
export function layerSplitAwaitingAdjust(messages: ChatMessage[]) {
  const confirm = latestLayerSplitConfirmAfterSelection(messages)
  if (!confirm)
    return false
  const optionId = String(confirm.answer.optionId || '')
  if (!isLayerAdjustOption(optionId))
    return false
  for (let index = confirm.index + 1; index < messages.length; index++) {
    const message = messages[index]!
    if (message.role === 'user' && !message.internal)
      return false
  }
  return true
}

export function layerSplitBlocksGeneration(messages: ChatMessage[]) {
  return layerSplitNeedsPlan(messages) || layerSplitNeedsConfirm(messages) || layerSplitAwaitingAdjust(messages)
}

// Bare mentions and upload-only follow-ups do not identify extraction targets.
export function layerSplitNeedsPlan(messages: ChatMessage[]) {
  if (confirmedLayerSelection(messages))
    return false
  let start = -1
  const textOf = (message: ChatMessage) => typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content) ? message.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role === 'user' && !message.internal && (textOf(message).includes('(model:image-layer-splitter)') || /(?:^|\s)\/image-layer-splitter(?=\s|$)/.test(textOf(message)))) {
      start = index
      break
    }
  }
  if (start < 0)
    return false
  const pendingPlans = new Set<string>()
  for (const message of messages.slice(start)) {
    if (message.role === 'user' && !message.internal) {
      const text = textOf(message).split('\n\nAttached stills:')[0]!
        .replace(/@\[[^\]]+\]\(model:[^\s)]+\)/g, '')
        .replace(/(?:^|\s)\/image-layer-splitter(?=\s|$)/g, '')
        .replace('Use the attached still(s).', '')
        .trim()
      if (text)
        return false
    }
    for (const call of message.tool_calls || []) {
      if (call.function.name !== 'ask_user')
        continue
      try {
        const args = JSON.parse(call.function.arguments)
        if (args.questions?.some((question: { id: string }) => question.id === 'layer_split_plan'))
          pendingPlans.add(call.id)
      }
      catch { /* Invalid calls cannot establish a plan. */ }
    }
    if (message.role === 'tool' && pendingPlans.has(message.tool_call_id || '')) {
      try {
        const result = JSON.parse(textOf(message))
        if (result.ok === true && (result.skipped === true || result.answers?.some((answer: { questionId: string, optionId?: string, text?: string }) => answer.questionId === 'layer_split_plan' && (answer.optionId || answer.text))))
          return false
      }
      catch { /* Invalid results cannot confirm a plan. */ }
    }
  }
  return true
}

// Once an actual splitting batch has run, continuation may report results but must not split again.
// A new user request starts a new turn and can explicitly authorize another attempt.
export function layerSplitNeedsSummary(messages: ChatMessage[], images: { id: string, modelId?: string }[]) {
  const results = new Set<string>()
  for (const message of [...messages].reverse()) {
    if (message.role === 'user' && !message.internal)
      return false
    if (message.role === 'tool' && message.tool_call_id)
      results.add(message.tool_call_id)
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const calls = message.tool_calls
      return calls.every(call => call.function.name === 'model_image_layer_splitter' && results.has(call.id))
        && calls.some(call => images.some(image => image.id === call.id && image.modelId === 'image-layer-splitter'))
    }
  }
  return false
}
