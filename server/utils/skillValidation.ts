import type { SkillDocument } from '../agent/skills'
import { isBuiltinSkillId, isValidSkillId, parseSkillMarkdown } from '../agent/skills'
import { isRegisteredToolName } from './registeredTools'

export const MAX_SKILL_BODY_CHARS = 50_000
export const MAX_SKILL_REQUIRES = 24
export const MAX_SKILL_STEPS_HINT = 40
export const MAX_GENERATIONS_PER_RUN = 20

export interface SkillValidationIssue {
  path: string
  message: string
}

export interface SkillValidationResult {
  ok: boolean
  issues: SkillValidationIssue[]
  document?: SkillDocument
}

export function validateUserSkillMarkdown(raw: string, options?: { allowUpdateId?: string }): SkillValidationResult {
  const issues: SkillValidationIssue[] = []
  if (!raw?.trim())
    return { ok: false, issues: [{ path: 'markdown', message: 'Skill markdown is required.' }] }
  if (raw.length > MAX_SKILL_BODY_CHARS)
    issues.push({ path: 'markdown', message: `Skill markdown exceeds ${MAX_SKILL_BODY_CHARS} characters.` })

  let document: SkillDocument
  try {
    document = parseSkillMarkdown(raw, 'draft-skill', 'user')
  }
  catch (error) {
    return { ok: false, issues: [{ path: 'markdown', message: error instanceof Error ? error.message : 'Invalid skill markdown.' }] }
  }

  const id = document.frontmatter.id
  if (!isValidSkillId(id))
    issues.push({ path: 'id', message: 'Skill id must match /^[a-z][a-z0-9-]{1,63}$/.' })
  if (isBuiltinSkillId(id) && options?.allowUpdateId !== id)
    issues.push({ path: 'id', message: `Skill id "${id}" is reserved by a builtin skill and cannot be overwritten.` })
  if (options?.allowUpdateId && options.allowUpdateId !== id)
    issues.push({ path: 'id', message: 'Skill id cannot change on update; delete and recreate instead.' })

  const triggers = document.frontmatter.triggers
  if (!triggers.length)
    issues.push({ path: 'triggers', message: 'At least one trigger is required (e.g. /my-skill).' })
  for (const trigger of triggers) {
    if (!/^\/[a-z][a-z0-9-]{1,63}$/.test(trigger))
      issues.push({ path: 'triggers', message: `Illegal trigger "${trigger}". Use /kebab-case matching the skill id.` })
  }
  if (triggers.length && !triggers.includes(`/${id}`))
    issues.push({ path: 'triggers', message: `Triggers must include /${id}.` })

  const requires = document.frontmatter.requires
  if (requires.length > MAX_SKILL_REQUIRES)
    issues.push({ path: 'requires', message: `At most ${MAX_SKILL_REQUIRES} tools may be listed in requires.` })
  for (const tool of requires) {
    if (!isRegisteredToolName(tool))
      issues.push({ path: 'requires', message: `Unregistered tool "${tool}". L1 skills may only use registered tools.` })
  }

  const generations = document.frontmatter.safety.maxGenerationsPerRun
  if (!Number.isFinite(generations) || generations < 1 || generations > MAX_GENERATIONS_PER_RUN)
    issues.push({ path: 'safety.maxGenerationsPerRun', message: `maxGenerationsPerRun must be between 1 and ${MAX_GENERATIONS_PER_RUN}.` })

  const stepHints = (document.body.match(/^\s*[-*]\s+/gm) || []).length
  if (stepHints > MAX_SKILL_STEPS_HINT)
    issues.push({ path: 'body', message: `Skill body has too many list steps (max ${MAX_SKILL_STEPS_HINT}).` })

  if (!document.frontmatter.name.trim())
    issues.push({ path: 'name', message: 'Skill name is required.' })
  if (!document.frontmatter.description.trim())
    issues.push({ path: 'description', message: 'Skill description is required.' })

  return { ok: issues.length === 0, issues, document }
}
