// Explicit public catalog: internal operating skills stay out of the picker.
export const PUBLIC_AGENT_SKILLS = [
  {
    id: 'product-hunt-gallery',
    icon: 'lucide:gallery-horizontal-end',
    name: 'Product Hunt gallery',
    description: 'Create consistent Product Hunt launch images from your website or product details.',
    keywords: 'product hunt gallery launch exhibition brand marketing',
  },
  {
    id: 'sketch-to-image',
    icon: 'lucide:pencil-ruler',
    name: 'Sketch to Image',
    description: 'Draw a sketch, add text, and turn your idea into a finished image.',
    keywords: 'sketch drawing image 草图 绘画',
  },
  {
    id: 'image-text-editor',
    icon: 'lucide:text-cursor-input',
    name: 'Image Text Editor',
    description: 'Edit text in images while preserving the original fonts and image details.',
    keywords: 'image text editor typography 图片 文字 编辑',
  },
  {
    id: 'image-annotation-edit',
    icon: 'lucide:map-pin',
    name: 'Annotated Image Edit',
    description: 'Mark points on an image and describe each change to edit precisely.',
    keywords: 'annotate annotation image edit point pin 标注 编辑',
  },
  {
    id: 'image-layer-splitter',
    icon: 'lucide:layers',
    name: 'Image Layer Splitter',
    description: 'Draw boxes around objects to extract them as separate transparent PNG layers.',
    keywords: 'image layer splitter transparent png 图层 拆分',
  },
  {
    id: 'long-form-video',
    icon: 'lucide:clapperboard',
    name: 'Long-form video',
    description: 'Plan a storyboard and produce a multi-shot film from stills, clips, and concat.',
    keywords: 'long-form video film storyboard short film 长视频 短片 分镜',
  },
] as const

export function searchAgentSkills(query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return PUBLIC_AGENT_SKILLS.filter(skill => terms.every(term => `${skill.id} ${skill.name} ${skill.description} ${skill.keywords}`.toLowerCase().includes(term)))
}

export function findComposerCommand(text: string, caret: number) {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)([@/])([^@/\n]*)$/.exec(before)
  if (match?.[1] === '/' && PUBLIC_AGENT_SKILLS.some(skill => match[2]?.startsWith(`${skill.id} `)))
    return null
  return match ? { start: caret - match[2]!.length - 1, end: caret, query: match[2]!, trigger: match[1] as '@' | '/' } : null
}

export function readSkillCommands(text: string) {
  const ids = new Set([...text.matchAll(/(?:^|\s)\/([a-z0-9-]+)(?=\s|$)/g)].map(match => match[1]))
  return PUBLIC_AGENT_SKILLS.filter(skill => ids.has(skill.id))
}

export function stripSkillCommands(text: string) {
  return text.replace(/(?<!\S)\/([a-z0-9-]+)(?=\s|$)[ \t]*/g, (match, id) =>
    PUBLIC_AGENT_SKILLS.some(skill => skill.id === id) ? '' : match)
}
