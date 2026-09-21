import { defineCollection } from '../utils/sqlite'

export interface IProject {
  name: string
  description: string
  isDefault: boolean
  kind: 'studio' | 'skill'
  /** When kind=skill, the bound user skill id (1:1). */
  skillId?: string
  createdAt: Date
  updatedAt: Date
}
export const Project = defineCollection<IProject>('projects', () => ({
  description: '',
  isDefault: false,
  kind: 'studio',
}), [
  { fields: ['isDefault'], where: 'json_extract(body, \'$.isDefault\') = 1' },
  { fields: ['kind', 'skillId'], where: "json_extract(body, \'$.kind\') = \'skill\' AND COALESCE(json_extract(body, \'$.skillId\'), \'\') <> \'\'" },
])
