<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { Hand, Maximize, ZoomIn, ZoomOut } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  markers?: { x: number, y: number }[]
  activeIndex?: number
}>(), {
  alt: 'Original image',
  markers: () => [],
  activeIndex: -1,
})
const emit = defineEmits<{ load: [], error: [], select: [index: number] }>()
const viewport = ref<HTMLElement>()
const image = ref<HTMLImageElement>()
const loaded = ref(false)
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const dragging = ref(false)
const natural = ref({ width: 1, height: 1 })
const { width: viewportWidth, height: viewportHeight } = useElementSize(viewport)
let drag: { id: number, x: number, y: number, left: number, top: number } | null = null

const fitted = computed(() => {
  const maxW = Math.max(1, viewportWidth.value - 32)
  const maxH = Math.max(1, viewportHeight.value - 32)
  const scale = Math.min(maxW / natural.value.width, maxH / natural.value.height, 1)
  return {
    width: Math.max(1, natural.value.width * scale),
    height: Math.max(1, natural.value.height * scale),
  }
})

const stageStyle = computed(() => ({
  width: `${fitted.value.width}px`,
  height: `${fitted.value.height}px`,
  transform: `translate(-50%, -50%) translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value})`,
}))

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

function onLoad() {
  if (!image.value?.naturalWidth)
    return
  natural.value = { width: image.value.naturalWidth, height: image.value.naturalHeight }
  loaded.value = true
  emit('load')
}

onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth)
    onLoad()
})

function endDrag() {
  const id = drag?.id
  drag = null
  dragging.value = false
  if (id !== undefined && viewport.value?.hasPointerCapture(id))
    viewport.value.releasePointerCapture(id)
}

function setZoom(value: number, anchor = { x: 0, y: 0 }) {
  if (!loaded.value)
    return
  endDrag()
  const next = Math.min(5, Math.max(0.5, value))
  const ratio = next / zoom.value
  offset.value = {
    x: anchor.x - (anchor.x - offset.value.x) * ratio,
    y: anchor.y - (anchor.y - offset.value.y) * ratio,
  }
  zoom.value = next
}

function fit() {
  endDrag()
  zoom.value = 1
  offset.value = { x: 0, y: 0 }
}

function onWheel(event: WheelEvent) {
  if (!loaded.value || !viewport.value)
    return
  event.preventDefault()
  event.stopPropagation()
  const rect = viewport.value.getBoundingClientRect()
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
  const delta = Math.max(-100, Math.min(100, event.deltaY * unit))
  setZoom(zoom.value * Math.exp(-delta * 0.002), {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  })
}

function beginDrag(event: PointerEvent) {
  if (!loaded.value || !event.isPrimary || event.button !== 0 || drag)
    return
  event.preventDefault()
  viewport.value?.focus({ preventScroll: true })
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: offset.value.x, top: offset.value.y }
  dragging.value = true
  viewport.value?.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId)
    return
  offset.value = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y }
}

function onKeydown(event: KeyboardEvent) {
  if (!loaded.value || event.ctrlKey || event.metaKey || event.altKey)
    return
  switch (event.key) {
    case '+': case '=': setZoom(zoom.value + 0.25); break
    case '-': setZoom(zoom.value - 0.25); break
    case '0': case 'Home': fit(); break
    case 'ArrowLeft': offset.value.x -= 40; break
    case 'ArrowRight': offset.value.x += 40; break
    case 'ArrowUp': offset.value.y -= 40; break
    case 'ArrowDown': offset.value.y += 40; break
    default: return
  }
  event.preventDefault()
  event.stopPropagation()
}

function onMarkerPointerDown(event: PointerEvent, index: number) {
  event.stopPropagation()
  event.preventDefault()
  emit('select', index)
}

onBeforeUnmount(endDrag)
</script>

<template>
  <div class="min-w-0 bg-muted/20">
    <div class="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
      <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><Hand class="size-3.5" />Drag to pan</span>
      <div class="flex items-center gap-1" role="group" aria-label="Image zoom controls">
        <button type="button" class="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Zoom out" title="Zoom out" :disabled="!loaded || zoom <= 0.5" @click="setZoom(zoom - 0.25)">
          <ZoomOut class="size-4" />
        </button>
        <span class="w-10 text-center text-xs tabular-nums" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Zoom in" title="Zoom in" :disabled="!loaded || zoom >= 5" @click="setZoom(zoom + 0.25)">
          <ZoomIn class="size-4" />
        </button>
        <button type="button" class="ml-1 inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Fit image" title="Fit image (0)" :disabled="!loaded" @click="fit">
          <Maximize class="size-4" />
        </button>
      </div>
    </div>
    <div
      ref="viewport"
      class="relative h-[340px] touch-none overflow-hidden overscroll-contain select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-[436px]"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      tabindex="0"
      role="region"
      aria-label="Original image canvas. Scroll to zoom, drag to pan. Use plus or minus to zoom, arrow keys to pan, and 0 to fit."
      @wheel.prevent="onWheel"
      @pointerdown.stop="beginDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @dblclick.prevent="fit"
      @keydown="onKeydown"
    >
      <div
        class="absolute top-1/2 left-1/2"
        :style="stageStyle"
      >
        <div class="relative size-full">
          <img
            ref="image"
            :src="src"
            :alt="alt"
            draggable="false"
            class="pointer-events-none block size-full max-w-none"
            @load="onLoad"
            @error="loaded = false; fit(); emit('error')"
          >
          <button
            v-for="(marker, index) in markers"
            :key="index"
            type="button"
            class="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-md border border-zinc-950 text-xs font-semibold text-zinc-950 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="activeIndex === index ? 'ring-2 ring-white/60' : 'cursor-pointer'"
            :style="{ backgroundColor: objectColor(index), left: `clamp(14px, ${marker.x / 10}%, calc(100% - 14px))`, top: `clamp(14px, ${marker.y / 10}%, calc(100% - 14px))` }"
            :aria-label="`Text line marker ${index + 1}`"
            :aria-pressed="activeIndex === index"
            @pointerdown="onMarkerPointerDown($event, index)"
          >
            {{ index + 1 }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
