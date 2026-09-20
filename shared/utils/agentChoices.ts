interface CustomChoiceOption {
  id: string
  label: string
  description?: string
  custom?: boolean
}

/** Also used by restored cards so older sessions can accept custom answers. */
export function withCustomChoiceOption<T extends CustomChoiceOption>(options: T[]): Array<T | CustomChoiceOption> {
  if (options.some(option => option.custom))
    return options
  const ids = new Set(options.map(option => option.id))
  let id = 'other'
  for (let suffix = 2; ids.has(id); suffix++)
    id = `other_${suffix}`
  return [...options, {
    id,
    label: 'Other',
    description: 'Type your own answer.',
    custom: true,
  }]
}

const STANDALONE_METHOD_IDS = new Set(['image_edit_method', 'object_removal_method'])

/** Method selection is a standalone checkpoint, including restored cards. */
export function standaloneImageEditQuestions<T extends { id: string, recommendedId?: string }>(questions: T[]): T[] {
  const method = questions.find(question => STANDALONE_METHOD_IDS.has(question.id))
  return method ? [{ ...method, recommendedId: 'annotate' }] : questions
}
