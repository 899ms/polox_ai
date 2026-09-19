<script setup lang="ts">
import type { ImageTextEdit } from '~~/shared/utils/imageTextEditor'
import type { ChoiceAnswer } from '~/composables/useAgentLab'
import { GripVertical } from 'lucide-vue-next'
import { validateTextEditAnswers } from '~~/shared/utils/imageTextEditor'

const props = defineProps<{ edit?: ImageTextEdit, edits?: ImageTextEdit[], pending?: boolean, state?: string, answers?: ChoiceAnswer[] }>()
const emit = defineEmits<{ submit: [answers: ChoiceAnswer[]], skip: [] }>()
const sources = props.edits || (props.edit ? [props.edit] : [])
const drafts = ref(sources.map(edit => ({ ...edit, lines: edit.lines.map(line => ({ ...line })) })))
const activeIndex = ref(0)
const activeLineIndex = ref(-1)
const canvas = ref<{ focusMarker: (index: number, zoomTo?: number) => void } | null>(null)
const activeEdit = computed(() => drafts.value[activeIndex.value])
const componentId = useId()
const failedImages = reactive<Record<string, boolean>>({})
const saved = computed(() => props.state === 'answered' || props.state === 'skipped')
const changedEdits = computed(() => drafts.value.filter(edit => !edit.detectionError && edit.lines.some(line => line.original !== line.text)))
const changed = computed(() => changedEdits.value.reduce((total, edit) => total + edit.lines.filter(line => line.original !== line.text).length, 0))
const validationError = computed(() => {
  if (!changedEdits.value.length)
    return ''
  try {
    validateTextEditAnswers(sources, changedEdits.value, sources.map(edit => edit.imageUrl))
    return ''
  }
  catch (error) { return error instanceof Error ? error.message : 'Check the replacement text.' }
})
const valid = computed(() => !validationError.value && changed.value > 0 && changedEdits.value.every(edit => !failedImages[edit.imageUrl]))
const activeMarkers = computed(() => (activeEdit.value?.lines || []).map(line => ({ x: line.x, y: line.y })))

const SPLIT_KEY = 'polox-image-text-editor-split'
const MIN_RATIO = 0.3
const MAX_RATIO = 0.75
const STEP = 0.02
const pane = ref<HTMLElement>()
const leftRatio = ref(0.55)
const dragging = ref(false)

const objectColors = [
  '#67e8f9',
  '#fdba74',
  '#c4b5fd',
  '#86efac',
  '#f9a8d4',
  '#fde047',
  '#93c5fd',
  '#fca5a5',
  '#5eead4',
  '#d8b4fe',
  '#bef264',
  '#fcd34d',
  '#a5b4fc',
  '#fda4af',
  '#a7f3d0',
  '#f0abfc',
]

function objectColor(index: number) {
  return objectColors[index % objectColors.length]!
}

function clampRatio(value: number) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

function persistSplit() {
  if (!import.meta.client)
    return
  localStorage.setItem(SPLIT_KEY, String(leftRatio.value))
}

onMounted(() => {
  const savedRatio = Number(localStorage.getItem(SPLIT_KEY))
  if (Number.isFinite(savedRatio))
    leftRatio.value = clampRatio(savedRatio)
})

function onSplitPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || !pane.value)
    return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  dragging.value = true
  const box = pane.value.getBoundingClientRect()
  function move(moveEvent: PointerEvent) {
    leftRatio.value = clampRatio((moveEvent.clientX - box.left) / Math.max(1, box.width))
  }
  function up(upEvent: PointerEvent) {
    dragging.value = false
    handle.releasePointerCapture(upEvent.pointerId)
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
    handle.removeEventListener('pointercancel', up)
    persistSplit()
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
  handle.addEventListener('pointercancel', up)
}

function onSplitKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    leftRatio.value = clampRatio(leftRatio.value - STEP)
    persistSplit()
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    leftRatio.value = clampRatio(leftRatio.value + STEP)
    persistSplit()
  }
}

watch(() => props.answers, (answers) => {
  const answer = answers?.find(answer => answer.questionId === 'image_text_editor')
  const stored = answer?.textEdits || (answer?.textLines && props.edit ? [{ imageUrl: props.edit.imageUrl, lines: answer.textLines }] : [])
  for (const edit of stored) {
    const draft = drafts.value.find(item => item.imageUrl === edit.imageUrl)
    if (draft)
      draft.lines = edit.lines.map(line => ({ ...line }))
  }
}, { immediate: true })

watch(activeIndex, () => { activeLineIndex.value = -1 })

function focusLine(index: number) {
  activeLineIndex.value = index
  canvas.value?.focusMarker(index)
  nextTick(() => {
    const el = document.getElementById(`text-line-${componentId}-${activeIndex.value}-${index}`) as HTMLTextAreaElement | null
    el?.focus()
  })
}

function submit() {
  if (!valid.value || props.pending || saved.value)
    return
  const edits = changedEdits.value.map(edit => ({ imageUrl: edit.imageUrl, lines: edit.lines.map(line => ({ ...line })) }))
  emit('submit', [{ questionId: 'image_text_editor', ...(props.edits ? { textEdits: edits } : { textLines: edits[0]!.lines }) }])
}
</script>

<template>
  <Card class="relative w-full gap-4 rounded-2xl border-blue-500/70 py-4 shadow-none">
    <AgentLabCardBorder v-if="!saved" tone="attention" />
    <CardHeader class="px-4">
      <CardTitle class="text-sm">
        Image text editor
      </CardTitle>
      <CardDescription>{{ saved ? (state === 'skipped' ? 'Cancelled' : 'Edits saved') : 'Edit the text you want to change. Leave other lines unchanged.' }}</CardDescription>
    </CardHeader>
    <CardContent v-if="saved" class="grid min-w-0 gap-2 px-4">
      <p class="text-sm text-muted-foreground">
        {{ state === 'skipped' ? 'Cancelled — no edits were submitted.' : `Saved ${changed} changed ${changed === 1 ? 'line' : 'lines'}${drafts.length > 1 ? ` across ${changedEdits.length} ${changedEdits.length === 1 ? 'image' : 'images'}` : ''}.` }}
      </p>
    </CardContent>
    <CardContent v-else class="grid min-w-0 gap-4 px-4">
      <div v-if="drafts.length > 1" class="flex flex-wrap gap-2" aria-label="Source image">
        <button v-for="(draft, index) in drafts" :key="draft.imageUrl" type="button" class="rounded-lg border p-1" :class="activeIndex === index ? 'border-primary' : 'border-border'" :aria-pressed="activeIndex === index" :aria-label="`Image ${index + 1}`" :disabled="pending" @click="activeIndex = index">
          <img :src="draft.imageUrl" :alt="`Image ${index + 1}`" class="size-16 object-contain">
          <span class="block text-xs">{{ index + 1 }} · {{ draft.detectionError ? 'Detection failed' : `${draft.lines.filter(line => line.original !== line.text).length} edited` }}</span>
        </button>
      </div>
      <div
        v-if="activeEdit"
        ref="pane"
        class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border lg:flex-row"
        :class="dragging ? 'select-none' : ''"
      >
        <div
          class="min-w-0 w-full lg:w-[var(--text-editor-left)] lg:shrink-0"
          :style="{ '--text-editor-left': `${leftRatio * 100}%` }"
        >
          <ToolsImageTextCanvas
            ref="canvas"
            :key="activeEdit.imageUrl"
            :src="activeEdit.imageUrl"
            :markers="activeEdit.detectionError ? [] : activeMarkers"
            :active-index="activeLineIndex"
            @load="failedImages[activeEdit.imageUrl] = false"
            @error="failedImages[activeEdit.imageUrl] = true"
            @select="focusLine"
          />
        </div>
        <div
          class="group relative z-10 hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center lg:flex"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize image and text panels"
          :aria-valuenow="Math.round(leftRatio * 100)"
          :aria-valuemin="Math.round(MIN_RATIO * 100)"
          :aria-valuemax="Math.round(MAX_RATIO * 100)"
          tabindex="0"
          @pointerdown="onSplitPointerDown"
          @keydown="onSplitKeydown"
        >
          <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors duration-150 group-hover:bg-foreground/40 group-focus-visible:bg-ring" />
          <span
            class="relative z-10 flex h-8 w-4 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 group-hover:bg-accent group-hover:text-foreground group-focus-visible:border-ring"
            :class="dragging ? 'border-border bg-accent text-foreground' : ''"
            aria-hidden="true"
          >
            <GripVertical class="size-3.5" />
          </span>
        </div>
        <div v-if="activeEdit.detectionError" role="status" class="min-w-0 flex-1 border-t border-border p-3 text-sm text-muted-foreground lg:border-t-0">
          {{ activeEdit.detectionError }}
        </div>
        <ol v-else :key="activeEdit.imageUrl" class="max-h-[480px] min-w-0 flex-1 space-y-2 overflow-y-auto border-t border-border p-3 lg:border-t-0" aria-label="Detected text">
          <li
            v-for="(line, index) in activeEdit.lines"
            :key="index"
            class="flex items-start gap-3 rounded-lg border p-2"
            :class="activeLineIndex === index ? 'border-primary bg-accent/40' : 'border-border'"
          >
            <button
              type="button"
              class="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-950 text-xs font-semibold tabular-nums text-zinc-950"
              :style="{ backgroundColor: objectColor(index) }"
              :aria-label="`Focus text line ${index + 1}`"
              :aria-pressed="activeLineIndex === index"
              :disabled="pending || saved"
              @click="focusLine(index)"
            >
              {{ index + 1 }}
            </button>
            <label :for="`text-line-${componentId}-${activeIndex}-${index}`" class="sr-only">Replacement text {{ index + 1 }}: {{ line.original }}</label>
            <textarea
              :id="`text-line-${componentId}-${activeIndex}-${index}`"
              v-model="line.text"
              :disabled="pending || saved"
              rows="2"
              maxlength="2000"
              class="min-w-0 w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm focus-visible:border-border focus-visible:bg-background focus-visible:outline-none"
              @focus="activeLineIndex = index"
            />
          </li>
        </ol>
      </div>
      <p v-if="activeEdit && failedImages[activeEdit.imageUrl]" role="alert" class="text-sm text-destructive">
        The source image could not be loaded. Reopen the editor or upload the image again.
      </p>
      <p v-if="validationError" role="alert" class="text-xs text-destructive">
        {{ validationError }}
      </p>
    </CardContent>
    <CardFooter v-if="!saved" class="justify-end gap-2 border-t px-4 pt-3">
      <Button variant="outline" size="sm" :disabled="pending" @click="emit('skip')">
        Cancel
      </Button>
      <Button size="sm" :disabled="pending || !valid" @click="submit">
        <Spinner v-if="pending" />Generate · {{ drafts.length > 1 ? `${changedEdits.length} ${changedEdits.length === 1 ? 'image' : 'images'}` : `${changed} ${changed === 1 ? 'line' : 'lines'}` }}
      </Button>
    </CardFooter>
  </Card>
</template>
