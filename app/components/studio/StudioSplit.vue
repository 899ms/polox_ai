<script setup lang="ts">
import { GripHorizontal, GripVertical } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  storageKey?: string
  /** When true, hide the right pane and expand left full-width (animated). */
  collapsedRight?: boolean
}>(), {
  storageKey: 'polox-studio-split',
  collapsedRight: false,
})

const DEFAULT_WIDTH = 448
const MIN_WIDTH = 280
const MAX_RATIO = 0.8
const STEP = 16
const HANDLE_SIZE = 16
const DEFAULT_BOTTOM_RATIO = 0.7

const container = ref<HTMLElement | null>(null)
const leftWidth = ref(DEFAULT_WIDTH)
const bottomRatio = ref(DEFAULT_BOTTOM_RATIO)
const bottomHeight = ref(320)
const bottomMax = ref(0)
const dragging = ref(false)

const mobileStorageKey = computed(() => `${props.storageKey}-bottom-ratio`)

function paneMax() {
  return Math.max(0, (container.value?.clientHeight || 0) - HANDLE_SIZE)
}

function clampWidth(width: number) {
  const max = Math.max(MIN_WIDTH, Math.floor((container.value?.clientWidth || 1280) * MAX_RATIO))
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)))
}

function setBottomHeight(height: number) {
  const max = paneMax()
  bottomMax.value = max
  const next = Math.min(max, Math.max(0, Math.round(height)))
  bottomHeight.value = next
  bottomRatio.value = max > 0 ? next / max : DEFAULT_BOTTOM_RATIO
}

function syncBottomFromRatio() {
  const max = paneMax()
  if (!max)
    return
  setBottomHeight(max * bottomRatio.value)
}

function persistWidth() {
  if (!import.meta.client)
    return
  localStorage.setItem(props.storageKey, String(leftWidth.value))
}

function persistBottom() {
  if (!import.meta.client)
    return
  localStorage.setItem(mobileStorageKey.value, String(bottomRatio.value))
}

onMounted(() => {
  const savedWidth = Number(localStorage.getItem(props.storageKey))
  const preferred = Number.isFinite(savedWidth) && savedWidth >= MIN_WIDTH ? savedWidth : DEFAULT_WIDTH
  // Soft-cap a previously maximized panel so the chat does not reopen at ~80% empty.
  const softMax = Math.floor((container.value?.clientWidth || 1280) * 0.55)
  leftWidth.value = clampWidth(Math.min(preferred, Math.max(DEFAULT_WIDTH, softMax)))

  const savedRatio = Number(localStorage.getItem(mobileStorageKey.value))
  if (Number.isFinite(savedRatio) && savedRatio >= 0 && savedRatio <= 1)
    bottomRatio.value = Math.min(savedRatio, 0.7)
  syncBottomFromRatio()
})

useEventListener('resize', () => {
  leftWidth.value = clampWidth(leftWidth.value)
  syncBottomFromRatio()
})

function bindDrag(handle: HTMLElement, pointerId: number, onMove: (event: PointerEvent) => void, onDone: () => void) {
  handle.setPointerCapture(pointerId)
  dragging.value = true

  function move(event: PointerEvent) {
    onMove(event)
  }

  function up(event: PointerEvent) {
    handle.releasePointerCapture(event.pointerId)
    dragging.value = false
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
    onDone()
  }

  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
}

function onHorizontalPointerDown(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  const startX = event.clientX
  const startWidth = leftWidth.value
  bindDrag(handle, event.pointerId, (moveEvent) => {
    leftWidth.value = clampWidth(startWidth + moveEvent.clientX - startX)
  }, persistWidth)
}

function onVerticalPointerDown(event: PointerEvent) {
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  const startY = event.clientY
  const startHeight = bottomHeight.value
  bindDrag(handle, event.pointerId, (moveEvent) => {
    setBottomHeight(startHeight + startY - moveEvent.clientY)
  }, persistBottom)
}

function onHorizontalKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    leftWidth.value = clampWidth(leftWidth.value - STEP)
    persistWidth()
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    leftWidth.value = clampWidth(leftWidth.value + STEP)
    persistWidth()
  }
}

function onVerticalKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    setBottomHeight(bottomHeight.value + STEP)
    persistBottom()
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    setBottomHeight(bottomHeight.value - STEP)
    persistBottom()
  }
}

function maximizeAgent() {
  // Comfortable focus width for editor cards — not the drag handle max (80%).
  const focus = clampWidth(Math.min(680, Math.floor((container.value?.clientWidth || 1280) * 0.48)))
  leftWidth.value = focus
  persistWidth()
  setBottomHeight(Math.floor(paneMax() * 0.55))
  persistBottom()
}

defineExpose({ maximizeAgent })
</script>

<template>
  <div
    ref="container"
    class="flex min-h-0 flex-1 flex-col lg:flex-row"
    :class="dragging ? 'select-none' : ''"
    :style="{
      '--studio-left-width': `${leftWidth}px`,
      '--studio-bottom-height': `${bottomHeight}px`,
    }"
  >
    <div
      class="flex min-h-0 min-w-0 w-full flex-col overflow-hidden bg-sidebar transition-[width,flex-grow,flex-basis] duration-300 ease-out"
      :class="collapsedRight
        ? 'flex-1 lg:w-full lg:flex-1'
        : 'flex-1 lg:w-[var(--studio-left-width)] lg:flex-none'"
    >
      <slot name="left" />
    </div>

    <div
      class="group relative z-10 flex shrink-0 cursor-row-resize touch-none items-center justify-center transition-[height,opacity] duration-300 ease-out lg:hidden"
      :class="collapsedRight ? 'pointer-events-none h-0 overflow-hidden opacity-0' : 'h-4 opacity-100'"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize canvas panel"
      :aria-hidden="collapsedRight"
      :aria-valuenow="bottomHeight"
      :aria-valuemin="0"
      :aria-valuemax="bottomMax"
      tabindex="0"
      @pointerdown="onVerticalPointerDown"
      @keydown="onVerticalKeydown"
    >
      <span class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors duration-150 group-hover:bg-foreground/40 group-focus-visible:bg-ring" />
      <span
        class="relative z-10 flex h-4 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 group-hover:bg-accent group-hover:text-foreground group-focus-visible:border-ring"
        :class="dragging ? 'border-border bg-accent text-foreground' : ''"
        aria-hidden="true"
      >
        <GripHorizontal class="size-3.5" />
      </span>
    </div>

    <div
      class="group relative z-10 hidden shrink-0 cursor-col-resize touch-none items-center justify-center transition-[width,opacity] duration-300 ease-out lg:flex"
      :class="collapsedRight ? 'pointer-events-none w-0 overflow-hidden opacity-0' : 'w-3 opacity-100'"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize generator panel"
      :aria-hidden="collapsedRight"
      :aria-valuenow="leftWidth"
      :aria-valuemin="MIN_WIDTH"
      tabindex="0"
      @pointerdown="onHorizontalPointerDown"
      @keydown="onHorizontalKeydown"
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

    <div
      class="relative isolate z-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-background transition-[flex-grow,opacity,max-width,height] duration-300 ease-out max-lg:shrink-0 lg:min-h-0"
      :class="collapsedRight
        ? 'pointer-events-none max-h-0 max-w-0 flex-none opacity-0 max-lg:h-0 lg:max-w-0'
        : 'opacity-100 max-lg:h-[var(--studio-bottom-height)] lg:flex-1'"
      :aria-hidden="collapsedRight"
    >
      <slot name="right" />
    </div>
  </div>
</template>
