import { AGENT_MODELS } from './agentModels'
import { PUBLIC_AGENT_SKILLS } from './agentSkills'

// The last explicit selection wins, including in pasted or restored drafts.
export function normalizeComposerSelection(text: string) {
  const selections = [...text.matchAll(/@\[[^\]]+\]\(model:([^\s)]+)\)|(?<!\S)\/([a-z0-9-]+)(?=\s|$)/g)]
    .filter(match => match[1]
      ? AGENT_MODELS.some(model => model.id === match[1])
      : PUBLIC_AGENT_SKILLS.some(skill => skill.id === match[2]))
  for (const match of selections.slice(0, -1).reverse()) {
    const start = match.index!
    text = text.slice(0, start) + text.slice(start + match[0].length).replace(/^[ \t]+/, '')
  }
  return text
}
