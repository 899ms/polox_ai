<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'
import { splitAgentThinking } from '~~/shared/utils/agentThinking'

const props = defineProps<{
  source: string
  streaming?: boolean
  mediaUrls?: string[]
}>()
const navigateToMedia = useCanvasMediaNavigation()

function onLinkClick(event: MouseEvent) {
  const anchor = (event.target as Element).closest('a')
  const href = anchor?.getAttribute('href')
  if (!navigateToMedia || !href || !props.mediaUrls?.includes(href))
    return
  event.preventDefault()
  void navigateToMedia(href)
}

const parts = computed(() => splitAgentThinking(props.source))
// Until the turn completes, prose can still become a tool-planning preamble.
const thinking = computed(() => [parts.value.thinking, props.streaming ? parts.value.answer : ''].filter(Boolean).join('\n\n'))
const thinkingExpanded = ref(false)
const thinkingBody = ref<HTMLElement | null>(null)
const thinkingNeedsExpand = ref(false)

function measureThinkingOverflow() {
  const el = thinkingBody.value
  if (!el || thinkingExpanded.value) {
    thinkingNeedsExpand.value = Boolean(thinking.value.trim()) && (thinking.value.trim().length > 80 || thinking.value.includes('\n'))
    return
  }
  // Collapsed box is 2 lines of leading-5 (2.5rem); any scroll means more content.
  thinkingNeedsExpand.value = el.scrollHeight > el.clientHeight + 1
}

watch(() => props.source, () => { thinkingExpanded.value = false })
watch([thinking, thinkingExpanded], async () => {
  await nextTick()
  requestAnimationFrame(measureThinkingOverflow)
})
onMounted(() => {
  requestAnimationFrame(measureThinkingOverflow)
})

const html = computed(() => {
  const raw = marked.parse(props.streaming ? '' : parts.value.answer, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div class="agent-lab-md text-sm leading-6" @click="onLinkClick" @auxclick="onLinkClick">
    <div v-if="thinking" class="mb-1 text-muted-foreground">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <span class="text-xs font-medium">Thinking</span>
          <div class="relative mt-1">
            <div
              ref="thinkingBody"
              class="whitespace-pre-wrap text-xs leading-5"
              :class="!thinkingExpanded ? 'max-h-[2.5rem] overflow-hidden' : ''"
            >
              {{ thinking }}
            </div>
            <button
              v-if="!thinkingExpanded && thinkingNeedsExpand"
              type="button"
              class="absolute inset-x-0 bottom-0 h-[1.25rem] bg-gradient-to-t from-card from-40% to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Expand thinking"
              @click="thinkingExpanded = true"
            />
          </div>
        </div>
        <button
          v-if="thinkingNeedsExpand || thinkingExpanded"
          type="button"
          class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-expanded="thinkingExpanded"
          :aria-label="thinkingExpanded ? 'Collapse thinking' : 'Expand thinking'"
          @click="thinkingExpanded = !thinkingExpanded"
        >
          <Icon
            name="lucide:chevron-down"
            class="size-3.5 transition-transform"
            :class="thinkingExpanded ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
    <div v-if="html" v-html="html" />
    <span v-if="streaming" class="ms-0.5 inline-block size-1.5 rounded-full bg-current align-middle opacity-70" />
  </div>
</template>

<style scoped>
.agent-lab-md {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.agent-lab-md :deep(img),
.agent-lab-md :deep(video) {
  max-width: 100%;
  height: auto;
}

.agent-lab-md :deep(table) {
  width: 100%;
  table-layout: fixed;
}

.agent-lab-md :deep(p) {
  margin: 0;
}

.agent-lab-md :deep(p + p),
.agent-lab-md :deep(p + ol),
.agent-lab-md :deep(p + ul),
.agent-lab-md :deep(ol + p),
.agent-lab-md :deep(ul + p) {
  margin-top: 0.5rem;
}

.agent-lab-md :deep(strong) {
  font-weight: 600;
}

.agent-lab-md :deep(ol),
.agent-lab-md :deep(ul) {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}

.agent-lab-md :deep(ol) {
  list-style: decimal;
}

.agent-lab-md :deep(ul) {
  list-style: disc;
}

.agent-lab-md :deep(li + li) {
  margin-top: 0.25rem;
}

.agent-lab-md :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.agent-lab-md :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.8125em;
}

.agent-lab-md :deep(pre) {
  margin-top: 0.5rem;
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--muted);
}
</style>
