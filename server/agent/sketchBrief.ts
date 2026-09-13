import type { AgentImage, ChatMessage, ChoiceAnswer, ChoiceQuestion } from './types'
import { SKETCH_TO_IMAGE_MODEL } from '~~/shared/utils/sketchToImage'

export const SKETCH_QUESTIONS = ['sketch_references', 'sketch_understanding', 'sketch_notes', 'sketch_prompt']

export function sketchBrief(messages: ChatMessage[]) {
  const start = messages.findLastIndex(message => message.role === 'user' && !message.internal)
  const request = messages[start]
  const text = typeof request?.content === 'string' ? request.content : request?.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') || ''
  if (!text.includes('(model:sketch-to-image)') && !/(?:^|\s)\/sketch-to-image(?=\s|$)/.test(text))
    return null
  const inputUrls = Array.isArray(request?.content) ? request.content.flatMap(part => part.type === 'image_url' ? [part.image_url.url] : []) : []
  let referencesDone = false
  let understandingDone = false
  let confirmedUnderstanding = ''
  let cancelled = false
  let references: { url: string, name: string }[] = []
  const calls = new Map<string, ChoiceQuestion[]>()
  for (const message of messages.slice(start + 1)) {
    for (const call of message.tool_calls || []) {
      if (call.function.name !== 'ask_user')
        continue
      try { calls.set(call.id, JSON.parse(call.function.arguments).questions || []) }
      catch { /* Unrelated malformed call. */ }
    }
    if (message.role !== 'tool' || typeof message.content !== 'string')
      continue
    const questions = calls.get(message.tool_call_id || '')
    if (questions?.length !== 1)
      continue
    const question = questions[0]!
    try {
      const result = JSON.parse(message.content)
      if (!result.ok)
        continue
      const answer = (result.answers as ChoiceAnswer[] | undefined)?.find(item => item.questionId === question.id)
      const skipped = result.skipped || answer?.skipped
      if (question.id === 'sketch_references' && (skipped || ['yes', 'no'].includes(answer?.optionId || ''))) {
        referencesDone = true
        references = answer?.optionId === 'yes' ? answer.referenceImages || [] : []
        understandingDone = false
        confirmedUnderstanding = ''
      }
      if (question.id === 'sketch_understanding' && referencesDone) {
        understandingDone = !skipped && answer?.optionId === 'correct'
        confirmedUnderstanding = understandingDone ? String(result.confirmedUnderstanding || question.prompt || '') : ''
      }
      // Preserve cancellation and edits from cards saved before the shortened workflow.
      if (question.id === 'sketch_prompt' && referencesDone && understandingDone) {
        cancelled = Boolean(skipped || answer?.optionId === 'cancel')
        if (cancelled || answer?.optionId === 'adjust') {
          understandingDone = false
          confirmedUnderstanding = ''
        }
      }
    }
    catch { /* Unrelated tool output. */ }
  }
  return { inputUrls: [...new Set([...inputUrls, ...references.map(image => image.url)])], referencesDone, understandingDone, confirmedUnderstanding, cancelled }
}

export function sketchGenerationSubmitted(messages: ChatMessage[], images: AgentImage[]) {
  const start = messages.findLastIndex(message => message.role === 'user' && !message.internal)
  return messages.slice(start + 1).some(message => message.tool_calls?.some(call =>
    ['model_sketch_to_image', `model_${SKETCH_TO_IMAGE_MODEL.replaceAll('-', '_')}`].includes(call.function.name)
    && images.some(image => image.id === call.id && image.modelId === SKETCH_TO_IMAGE_MODEL),
  ))
}

export function assertSketchQuestion(messages: ChatMessage[], questions: ChoiceQuestion[]) {
  const brief = sketchBrief(messages)
  if (!brief)
    return
  if (!brief.inputUrls.length)
    throw new Error('Save the sketch in the project before asking questions.')
  if (brief.cancelled)
    throw new Error('The sketch workflow was cancelled. Wait for a new user request.')
  if (brief.understandingDone)
    throw new Error('The user confirmed the understanding. Compose the generation prompt and call model_sketch_to_image now; do not ask for further confirmation or instructions.')
  const next = !brief.referencesDone ? 'sketch_references' : 'sketch_understanding'
  if (questions.length !== 1 || questions[0]?.id !== next)
    throw new Error(`Follow the sketch-to-image skill: call ask_user with exactly one ${next} question and wait.`)
  const required = next === 'sketch_understanding' ? ['correct', 'adjust'] : ['yes', 'no']
  if (required.some(id => !questions[0]!.options.some(option => option.id === id)))
    throw new Error(`The ${next} card must include ${required.join(', ')} options.`)
}

export function validateSketchReferences(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 8)
    throw new Error('Choose between 1 and 8 reference images, or select No.')
  const result: { url: string, name: string }[] = []
  for (const item of value) {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url))
      throw new Error('Choose a valid uploaded or project image.')
    if (!result.some(image => image.url === item.url))
      result.push({ url: item.url, name: String(item.name || 'Reference image').slice(0, 100) })
  }
  return result
}
