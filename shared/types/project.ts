export const DEFAULT_PROJECT_NAME = 'Default'
export const DEFAULT_SKILL_PROJECT_NAME = 'New skill'
export type ProjectKind = 'studio' | 'skill'
export const DEFAULT_NEW_PROJECT_NAME = 'Untitled'
export const PROJECT_NAME_MAX = 60
export const PROJECT_DESCRIPTION_MAX = 280
export const PROJECT_DELETE_CONFIRMATION = 'DELETE'


export function nextSkillProjectTitle(existingNames: string[]) {
  const names = new Set(existingNames.map(name => name.trim()).filter(Boolean))
  if (!names.has(DEFAULT_SKILL_PROJECT_NAME))
    return DEFAULT_SKILL_PROJECT_NAME

  let index = 2
  while (names.has(`${DEFAULT_SKILL_PROJECT_NAME} ${index}`))
    index += 1
  return `${DEFAULT_SKILL_PROJECT_NAME} ${index}`
}

export function nextProjectTitle(existingNames: string[]) {
  const names = new Set(existingNames.map(name => name.trim()).filter(Boolean))
  if (!names.has(DEFAULT_NEW_PROJECT_NAME))
    return DEFAULT_NEW_PROJECT_NAME

  let index = 2
  while (names.has(`${DEFAULT_NEW_PROJECT_NAME} ${index}`))
    index += 1
  return `${DEFAULT_NEW_PROJECT_NAME} ${index}`
}

export interface GenerationProjectPublic {
  id: string
  name: string
  description: string
  isDefault: boolean
  kind: ProjectKind
  /** Bound skill id when kind is skill (empty until first save). */
  skillId: string
  jobCount: number
  assetCount: number
  activeJobCount: number
  coverUrl: string
  createdAt: string
  updatedAt: string
}

export interface GenerationProjectList {
  items: GenerationProjectPublic[]
}
