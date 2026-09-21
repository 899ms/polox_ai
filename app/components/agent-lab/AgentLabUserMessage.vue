<script setup lang="ts">
import type { AiModelConfig } from '~~/shared/types/aiModel'
import { AGENT_MODELS, displayModelMentions } from '~~/shared/utils/agentModels'
import { mergeAgentSkillCatalog, PUBLIC_AGENT_SKILLS, type CatalogAgentSkill } from '~~/shared/utils/agentSkills'
import { publicAgentChatText } from '~~/shared/utils/agentChatVisibility'
import { toolAgentMessage } from '~/utils/toolAgentRequest'

const props = defineProps<{ content: string, omitSkillIds?: string[] }>()

const { data: skillsApi } = useFetch<{ catalog?: CatalogAgentSkill[], userSkills?: CatalogAgentSkill[] }>('/api/skills', {
  key: 'agent-skills-catalog',
  default: () => ({ catalog: [], userSkills: [] }),
})

const skillsById = computed(() => {
  const map = new Map<string, CatalogAgentSkill>()
  for (const skill of PUBLIC_AGENT_SKILLS)
    map.set(skill.id, skill)
  const catalog = skillsApi.value?.catalog
  if (Array.isArray(catalog)) {
    for (const skill of catalog) {
      if (skill?.id)
        map.set(skill.id, skill)
    }
  }
  else {
    for (const skill of mergeAgentSkillCatalog(Array.isArray(skillsApi.value?.userSkills) ? skillsApi.value!.userSkills! : []))
      map.set(skill.id, skill)
  }
  // Include disabled / draft user skills so Test messages still resolve to chips.
  const userRows = skillsApi.value?.userSkills
  if (Array.isArray(userRows)) {
    for (const skill of userRows) {
      if (!skill?.id)
        continue
      const existing = map.get(skill.id)
      if (!existing) {
        map.set(skill.id, {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          keywords: skill.keywords,
          icon: skill.icon || 'lucide:sparkles',
          cover: skill.cover,
          coverAlt: skill.coverAlt,
          source: skill.source || 'user',
          enabled: skill.enabled,
        })
        continue
      }
      if (!existing.cover && skill.cover)
        map.set(skill.id, { ...existing, cover: skill.cover, coverAlt: skill.coverAlt || existing.coverAlt })
    }
  }
  return map
})

const toolInput = computed(() => toolAgentMessage(props.content))
const shownContent = computed(() => publicAgentChatText(toolInput.value?.content ?? props.content))
const { open } = useMediaLightbox()

type MessagePart = {
  text: string
  model?: AiModelConfig
  skill?: CatalogAgentSkill
}

const omitSkillIdSet = computed(() => new Set((props.omitSkillIds || []).filter(Boolean)))

const parts = computed(() => {
  const result: MessagePart[] = []
  let cursor = 0
  const source = shownContent.value
  const omit = omitSkillIdSet.value
  for (const match of source.matchAll(/@\[[^\]]+\]\(model:([^\s)]+)\)|(?<!\S)\/([a-z0-9-]+)(?=\s|$)/g)) {
    if (match.index! > cursor)
      result.push({ text: source.slice(cursor, match.index!) })
    const model = match[1] ? AGENT_MODELS.find(item => item.id === match[1]) : undefined
    const skillId = match[2]
    // Locked Test/Edit skills stay in the composer chip; do not repeat the trigger in every bubble.
    if (skillId && omit.has(skillId)) {
      cursor = match.index! + match[0].length
      continue
    }
    const skill = skillId ? skillsById.value.get(skillId) : undefined
    result.push({
      text: displayModelMentions(match[0]),
      model,
      skill,
    })
    cursor = match.index! + match[0].length
  }
  if (cursor < source.length)
    result.push({ text: source.slice(cursor) })
  return result.filter(part => part.model || part.skill || part.text.trim().length > 0)
})
</script>

<template>
  <p class="whitespace-pre-wrap [overflow-wrap:anywhere]">
    <template v-for="(part, index) in parts" :key="index">
      <AgentLabModelBadge v-if="part.model" :model="part.model" />
      <AgentLabSkillBadge v-else-if="part.skill" :skill="part.skill" />
      <template v-else>
        {{ part.text }}
      </template>
    </template>
  </p>
  <div v-if="toolInput?.attachments.length" class="mt-2 flex flex-wrap justify-end gap-2">
    <template v-for="attachment in toolInput.attachments" :key="attachment.url">
      <audio v-if="attachment.kind === 'audio'" :src="attachment.url" controls preload="none" class="max-w-full" />
      <button
        v-else
        type="button"
        class="overflow-hidden rounded-xl border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="attachment.kind === 'video' ? 'View reference video' : 'View reference image'"
        @click="open({ url: attachment.url, kind: attachment.kind, alt: 'Reference attachment' })"
      >
        <video v-if="attachment.kind === 'video'" :src="attachment.url" muted playsinline preload="metadata" class="size-20 object-cover" />
        <img v-else :src="attachment.url" alt="Reference image" loading="lazy" class="size-20 object-cover">
      </button>
    </template>
  </div>
</template>
