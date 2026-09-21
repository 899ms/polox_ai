import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cwd as processCwd } from 'node:process'
import { fileURLToPath } from 'node:url'

export type SkillSource = 'builtin' | 'user' | 'imported'
export type SkillVisibility = 'catalog' | 'hidden'

export interface SkillFrontmatter {
  id: string
  name: string
  description: string
  version: string
  source: SkillSource
  visibility: SkillVisibility
  triggers: string[]
  requires: string[]
  inputs: string[]
  safety: {
    maxGenerationsPerRun: number
    allowSpend: boolean
  }
}

export interface SkillDocument {
  id: string
  path: string
  source: SkillSource
  frontmatter: SkillFrontmatter
  body: string
  raw: string
  contentHash: string
}

/** Core operating skills — always injected in full into the system prompt. */
export const CORE_SKILL_IDS = [
  'model-planning',
  'reference-analysis',
  'prompt-rewrite',
  'single-generator',
  'result-evaluation',
  'long-form-video',
] as const

/** Specialty builtins kept as dedicated workflows; full markdown loads on demand. */
export const SPECIALTY_BUILTIN_IDS = [
  'product-hunt-gallery',
  'app-store-graphics',
  'sketch-to-image',
  'image-text-editor',
  'image-annotation-edit',
  'image-object-removal',
  'image-layer-splitter',
  'image-editing',
  'skill-creator',
] as const

const SKILL_ID_RE = /^[a-z][a-z0-9-]{1,63}$/

export function findSkillsDir(moduleUrl = import.meta.url, workingDirectory = processCwd(), production = globalThis.process?.env?.NODE_ENV === 'production') {
  // Nitro dev can contain a copied skill bundle from an earlier build. Read the
  // source on each turn in development so edits do not require a rebuild.
  if (!production) {
    const source = resolve(workingDirectory, 'server/agent/skills')
    if (existsSync(resolve(source, 'single-generator.md')))
      return source
  }
  let directory = dirname(fileURLToPath(moduleUrl))
  for (let depth = 0; depth < 6; depth++) {
    for (const folder of ['skills', 'agent-skills']) {
      const candidate = resolve(directory, folder)
      if (existsSync(resolve(candidate, 'single-generator.md')))
        return candidate
    }
    const parent = dirname(directory)
    if (parent === directory)
      break
    directory = parent
  }
  return resolve(workingDirectory, 'server/agent/skills')
}

export function userSkillsDir(workingDirectory = processCwd()) {
  return resolve(workingDirectory, '.data/user-skills')
}

function hashContent(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

function stripQuotes(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)
  return trimmed
}

function parseScalar(value: string): string | number | boolean {
  const trimmed = stripQuotes(value)
  if (trimmed === 'true')
    return true
  if (trimmed === 'false')
    return false
  if (/^\d+(\.\d+)?$/.test(trimmed))
    return Number(trimmed)
  return trimmed
}

/** Minimal YAML-ish frontmatter parser for skill documents (no external deps). */
export function parseSkillMarkdown(raw: string, fallbackId: string, source: SkillSource = 'builtin'): SkillDocument {
  const trimmed = raw.replace(/^\uFEFF/, '')
  let frontmatterText = ''
  let body = trimmed
  if (trimmed.startsWith('---')) {
    const end = trimmed.indexOf('\n---', 3)
    if (end >= 0) {
      frontmatterText = trimmed.slice(3, end).trim()
      body = trimmed.slice(end + 4).replace(/^\r?\n/, '')
    }
  }

  const data: Record<string, unknown> = {}
  let listKey: string | null = null
  let objectKey: string | null = null
  for (const line of frontmatterText.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#'))
      continue
    const listItem = /^(\s*)-\s+(.+)$/.exec(line)
    if (listItem && listKey) {
      const list = Array.isArray(data[listKey]) ? data[listKey] as unknown[] : []
      list.push(parseScalar(listItem[2]!))
      data[listKey] = list
      continue
    }
    const nested = /^(\s+)([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (nested && objectKey && nested[1]!.length >= 2) {
      const object = (data[objectKey] && typeof data[objectKey] === 'object' && !Array.isArray(data[objectKey])
        ? data[objectKey]
        : {}) as Record<string, unknown>
      object[nested[2]!] = nested[3]!.trim() === '' ? {} : parseScalar(nested[3]!)
      data[objectKey] = object
      listKey = null
      continue
    }
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!match)
      continue
    const key = match[1]!
    const value = match[2]!.trim()
    if (value === '' || value === '[]' || value === '{}') {
      data[key] = value === '[]' ? [] : {}
      listKey = value === '[]' || value === '' ? key : null
      objectKey = value === '{}' || value === '' ? key : null
      continue
    }
    data[key] = parseScalar(value)
    listKey = null
    objectKey = null
  }

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || fallbackId
  const paragraph = body.replace(/^#\s+.+?\r?\n/, '').trim().split(/\r?\n\r?\n/).find(block => block.trim() && !block.trim().startsWith('#')) || ''
  const description = String(data.description || paragraph.replace(/\s+/g, ' ').slice(0, 200) || heading)
  const safetyRaw = (data.safety && typeof data.safety === 'object' ? data.safety : {}) as Record<string, unknown>
  const triggers = Array.isArray(data.triggers)
    ? data.triggers.map(String)
    : [`/${fallbackId}`]
  const requires = Array.isArray(data.requires) ? data.requires.map(String) : []
  const inputs = Array.isArray(data.inputs) ? data.inputs.map(String) : []

  const frontmatter: SkillFrontmatter = {
    id: String(data.id || fallbackId),
    name: String(data.name || heading),
    description,
    version: String(data.version || '1.0.0'),
    source: (data.source as SkillSource) || source,
    visibility: (data.visibility as SkillVisibility) || (CORE_SKILL_IDS.includes(fallbackId as typeof CORE_SKILL_IDS[number]) ? 'hidden' : 'catalog'),
    triggers,
    requires,
    inputs,
    safety: {
      maxGenerationsPerRun: Number(safetyRaw.maxGenerationsPerRun ?? data.maxGenerationsPerRun ?? 3) || 3,
      allowSpend: safetyRaw.allowSpend === undefined && data.allowSpend === undefined
        ? true
        : Boolean(safetyRaw.allowSpend ?? data.allowSpend),
    },
  }

  return {
    id: frontmatter.id,
    path: '',
    source: frontmatter.source,
    frontmatter,
    body: body.trim(),
    raw: trimmed.trim(),
    contentHash: hashContent(trimmed.trim()),
  }
}

function readSkillFile(filePath: string, id: string, source: SkillSource): SkillDocument | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const doc = parseSkillMarkdown(raw, id, source)
    doc.path = filePath
    if (source === 'builtin')
      doc.id = id
    return doc
  }
  catch {
    return null
  }
}

export function listBuiltinSkillDocuments(): SkillDocument[] {
  const skillsDir = findSkillsDir()
  const docs: SkillDocument[] = []
  try {
    for (const file of readdirSync(skillsDir).filter(name => name.endsWith('.md')).sort()) {
      const id = file.replace(/\.md$/, '')
      const doc = readSkillFile(resolve(skillsDir, file), id, 'builtin')
      if (doc)
        docs.push(doc)
    }
  }
  catch {
    // No skills directory.
  }
  return docs
}

export function getBuiltinSkillIds(): string[] {
  return listBuiltinSkillDocuments().map(doc => doc.id)
}

export function isBuiltinSkillId(id: string) {
  return getBuiltinSkillIds().includes(id) || CORE_SKILL_IDS.includes(id as typeof CORE_SKILL_IDS[number])
}

export function isValidSkillId(id: string) {
  return SKILL_ID_RE.test(id)
}

export function loadBuiltinSkill(id: string): SkillDocument | null {
  return readSkillFile(resolve(findSkillsDir(), `${id}.md`), id, 'builtin')
}

export function loadUserSkillFile(id: string, workingDirectory = processCwd()): SkillDocument | null {
  return readSkillFile(resolve(userSkillsDir(workingDirectory), id, 'SKILL.md'), id, 'user')
}

export function loadSkillDocument(id: string, preferUser = false): SkillDocument | null {
  if (preferUser) {
    const user = loadUserSkillFile(id)
    if (user)
      return user
  }
  const builtin = loadBuiltinSkill(id)
  if (builtin)
    return builtin
  return preferUser ? null : loadUserSkillFile(id)
}

export function parseSkillSlashIds(text: string): string[] {
  const ids = [...text.matchAll(/(?:^|\s)\/([a-z][a-z0-9-]{1,63})(?=\s|$)/g)].map(match => match[1]!)
  return [...new Set(ids)]
}

function catalogLine(doc: SkillDocument) {
  const when = doc.frontmatter.triggers[0] ? `Trigger ${doc.frontmatter.triggers[0]}.` : `Trigger /${doc.id}.`
  return `- \`/${doc.id}\` — ${doc.frontmatter.name}: ${doc.frontmatter.description} ${when} Call load_skill({ id: "${doc.id}" }) before following its full instructions.`
}

export interface SkillsPromptOptions {
  loadedSkillIds?: string[]
  /** Extra catalog rows for enabled user skills (id/name/description/triggers). */
  userCatalog?: Array<Pick<SkillFrontmatter, 'id' | 'name' | 'description' | 'triggers' | 'visibility'>>
}

export function skillsPromptBlock(options: SkillsPromptOptions = {}) {
  const builtins = listBuiltinSkillDocuments()
  const byId = new Map(builtins.map(doc => [doc.id, doc]))
  const coreBlocks: string[] = []
  for (const id of CORE_SKILL_IDS) {
    const doc = byId.get(id)
    if (doc?.body)
      coreBlocks.push(doc.body)
  }

  const catalogDocs = builtins.filter(doc =>
    !CORE_SKILL_IDS.includes(doc.id as typeof CORE_SKILL_IDS[number])
    || doc.id === 'long-form-video',
  )
  const catalogLines = [
    ...catalogDocs.map(catalogLine),
    ...(options.userCatalog || [])
      .filter(skill => skill.visibility !== 'hidden')
      .map(skill => `- \`/${skill.id}\` — ${skill.name}: ${skill.description} Trigger ${(skill.triggers[0] || `/${skill.id}`)}. Call load_skill({ id: "${skill.id}" }) before following its full instructions.`),
  ]

  const loadedIds = [...new Set(options.loadedSkillIds || [])]
    .filter(id => !CORE_SKILL_IDS.includes(id as typeof CORE_SKILL_IDS[number]))
  const loadedBlocks: string[] = []
  for (const id of loadedIds) {
    const doc = loadSkillDocument(id, true) || byId.get(id)
    if (doc?.body)
      loadedBlocks.push(`### Loaded skill: ${doc.frontmatter.name} (\`/${doc.id}\`)\n\n${doc.body}`)
  }

  const parts = [
    '## Skills',
    'These operating notes shape how you think. They do not spend money. Only tools spend money.',
    'Core skills below are always available. Specialty and user skills appear in the catalog as short summaries — load a full body with load_skill({ id }) or when the user types /id. Generation tools still require confirmation per confirmPolicy.',
    '',
    '### Core operating skills',
    coreBlocks.join('\n\n'),
  ]
  if (catalogLines.length)
    parts.push('', '### Skill catalog (summaries only)', ...catalogLines)
  if (loadedBlocks.length)
    parts.push('', '### On-demand skill bodies', ...loadedBlocks)
  parts.push(
    '',
    '### Skill loading rules',
    '- Prefer explicit `/user-skill-id` when a user skill and a builtin specialty share intent; otherwise builtin specialty workflows win.',
    '- L1 user skills may only orchestrate registered tools (ask_user, generate_*, model_*, concat_videos, inspect_website, export_zip, load_skill, save_user_skill). They cannot invent custom UI cards (box/mask/coord editors). Compose existing specialty skills or ask the user to open an Issue for new UI.',
    '- load_skill is free and read-only. save_user_skill validates and persists user skills; never overwrite builtin ids.',
  )
  return `\n\n${parts.join('\n')}`
}

/** @deprecated Prefer skillsPromptBlock with on-demand loading. */
export function loadAgentSkills() {
  const blocks: string[] = []
  for (const id of CORE_SKILL_IDS) {
    const doc = loadBuiltinSkill(id)
    if (doc?.body)
      blocks.push(doc.body)
  }
  return blocks
}
