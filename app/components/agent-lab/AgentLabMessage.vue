<script setup lang="ts">
import type { AgentImage } from '~/composables/useAgentLab'
import { publicAgentChatText } from '~~/shared/utils/agentChatVisibility'
import { displayModelMentions } from '~~/shared/utils/agentModels'

const props = defineProps<{
  message: { role: 'user' | 'assistant', content: string, kind?: string, streaming?: boolean }
  images: AgentImage[]
  lazy?: boolean
  omitSkillIds?: string[]
}>()

const hasVisibleUserText = computed(() => {
  // Strip LLM-only attachment protocol before deciding whether to show the bubble.
  let content = publicAgentChatText(String(props.message.content || ''))
  if (props.message.role !== 'user')
    return Boolean(String(props.message.content || '').trim())
  const omit = new Set((props.omitSkillIds || []).filter(Boolean))
  if (omit.size) {
    content = content
      .replace(/(?<!\S)\/([a-z][a-z0-9-]{0,63})(?=\s|$)/g, (match, id: string) => omit.has(id) ? '' : match)
      .replace(/\s+/g, ' ')
      .trim()
  }
  return Boolean(content.trim())
})

const showTextBubble = computed(() => {
  if (props.message.kind === 'error')
    return false
  if (!props.message.content)
    return false
  if (props.message.role === 'user')
    return hasVisibleUserText.value
  return true
})
</script>

<template>
  <p v-if="message.kind === 'error'" class="min-w-0 max-w-full text-xs text-destructive [overflow-wrap:anywhere]" role="alert">
    {{ displayModelMentions(message.content) }}
  </p>
  <article v-else-if="showTextBubble" class="flex min-w-0 max-w-full" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
    <div
      class="min-w-0 max-w-[92%] rounded-xl px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]"
      :class="message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground'"
    >
      <AgentLabUserMessage
        v-if="message.role === 'user'"
        :content="message.content"
        :omit-skill-ids="omitSkillIds"
      />
      <AgentLabMarkdown v-else :source="message.content" :streaming="message.streaming" :media-urls="images.map(image => image.url)" />
    </div>
  </article>
  <div v-if="$slots.default || images.length" class="flex min-w-0 max-w-full flex-col gap-1.5 [overflow-wrap:anywhere]">
    <slot />
    <div v-if="images.length" class="flex flex-wrap gap-2" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
      <AgentLabChatThumb v-for="image in images" :key="image.id" :image="image" :lazy="lazy" />
    </div>
  </div>
</template>
