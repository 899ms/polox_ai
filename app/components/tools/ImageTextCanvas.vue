<script setup lang="ts">
import { Hand, Maximize, ZoomIn, ZoomOut } from 'lucide-vue-next'

defineProps<{ src: string }>()
const emit = defineEmits<{ load: [], error: [] }>()
const viewport = ref<HTMLElement>()
const image = ref<HTMLImageElement>()
const loaded = ref(false)
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const dragging = ref(false)
let drag: { id: number, x: number, y: number, left: number, top: number } | null = null
const imageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value})`,
}))

function onLoad() {
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
      @wheel="onWheel"
      @pointerdown.stop="beginDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @dblclick.prevent="fit"
      @keydown="onKeydown"
    >
      <img
        ref="image"
        :src="src"
        alt="Original image"
        draggable="false"
        class="pointer-events-none absolute top-1/2 left-1/2 max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain"
        :style="imageStyle"
        @load="onLoad"
        @error="loaded = false; fit(); emit('error')"
      >
    </div>
  </div>
</template>
