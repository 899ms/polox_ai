<script setup lang="ts">
import type { ImageLayerHandle, ImageLayerRegion } from '~~/shared/utils/imageLayerSplitter'
import type { ObjectRemovalStroke, ObjectRemovalTarget } from '~~/shared/utils/imageObjectRemoval'
import { useElementSize } from '@vueuse/core'
import { Eraser, Hand, MousePointer2, Paintbrush, SquareDashed, Trash2, ZoomIn, ZoomOut, Maximize } from 'lucide-vue-next'
import { OBJECT_REMOVAL_MASK_ALPHA, OBJECT_REMOVAL_MASK_COLOR, OBJECT_REMOVAL_MAX_TARGETS } from '~~/shared/utils/imageObjectRemoval'
import { imageLayerRegionFromPoints, transformImageLayerRegion } from '~~/shared/utils/imageLayerSplitter'

const props = defineProps<{ src: string, disabled?: boolean }>()
const emit = defineEmits<{ selecting: [value: boolean], load: [], error: [] }>()
const targets = defineModel<ObjectRemovalTarget[]>({ default: () => [] })

const imageRef = ref<HTMLImageElement>()
const maskCanvasRef = ref<HTMLCanvasElement>()
const viewportRef = ref<HTMLDivElement>()
const loaded = ref(false)
const { width: viewportWidth, height: viewportHeight } = useElementSize(viewportRef)
const naturalSize = ref({ width: 1, height: 1 })
const zoom = ref(1)
const activeIndex = ref(-1)
const brushSize = ref(28)
type CanvasTool = 'box' | 'brush' | 'eraser' | 'select' | 'pan'
const activeTool = ref<CanvasTool>('box')
const isPanning = ref(false)
const draft = ref<ImageLayerRegion | null>(null)

const fittedScale = computed(() => Math.min(Math.max(1, viewportWidth.value - 32) / naturalSize.value.width, Math.max(1, viewportHeight.value - 32) / naturalSize.value.height, 1))
const imageWidth = computed(() => naturalSize.value.width * fittedScale.value * zoom.value)
const imageHeight = computed(() => naturalSize.value.height * fittedScale.value * zoom.value)
const canvasCursor = computed(() => {
  if (props.disabled)
    return 'cursor-wait'
  if (activeTool.value === 'pan')
    return isPanning.value ? 'cursor-grabbing' : 'cursor-grab'
  if (activeTool.value === 'brush' || activeTool.value === 'eraser')
    return 'cursor-none'
  if (activeTool.value === 'box')
    return 'cursor-crosshair'
  return 'cursor-default'
})

const brushCursor = ref<{ x: number, y: number } | null>(null)
const brushCursorVisible = computed(() => Boolean(
  brushCursor.value
  && loaded.value
  && !props.disabled
  && (activeTool.value === 'brush' || activeTool.value === 'eraser'),
))
const brushCursorDiameter = computed(() => {
  const span = Math.min(imageWidth.value, imageHeight.value)
  return Math.max(8, (brushSize.value / 1000) * span * 2)
})

function updateBrushCursor(event: PointerEvent) {
  if (activeTool.value !== 'brush' && activeTool.value !== 'eraser') {
    brushCursor.value = null
    return
  }
  const img = imageRef.value
  if (!img || !loaded.value)
    return
  const rect = img.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    brushCursor.value = null
    return
  }
  if (
    event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom
  ) {
    brushCursor.value = null
    return
  }
  // Same 0–1000 space as paint points so zoom/scroll never desync the preview.
  brushCursor.value = {
    x: (event.clientX - rect.left) / rect.width * 1000,
    y: (event.clientY - rect.top) / rect.height * 1000,
  }
}

function clearBrushCursor() {
  brushCursor.value = null
}

const BOX_COLORS = ['#e11d48', '#2563eb', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#db2777', '#4f46e5']
function objectColor(index: number) {
  return targets.value[index]?.kind === 'mask' ? OBJECT_REMOVAL_MASK_COLOR : BOX_COLORS[index % BOX_COLORS.length]!
}

function onImageLoad() {
  naturalSize.value = { width: imageRef.value!.naturalWidth, height: imageRef.value!.naturalHeight }
  loaded.value = true
  emit('load')
  void nextTick(redrawMasks)
}

onMounted(() => {
  if (imageRef.value?.complete && imageRef.value.naturalWidth)
    onImageLoad()
})

watch([targets, imageWidth, imageHeight, loaded], () => { void nextTick(redrawMasks) }, { deep: true })

function redrawMasks() {
  const canvas = maskCanvasRef.value
  if (!canvas || !loaded.value)
    return
  canvas.width = Math.max(1, Math.round(imageWidth.value))
  canvas.height = Math.max(1, Math.round(imageHeight.value))
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  targets.value.forEach((target) => {
    if (target.kind !== 'mask' || !target.strokes?.length)
      return
    const layer = document.createElement('canvas')
    layer.width = canvas.width
    layer.height = canvas.height
    const brush = layer.getContext('2d')
    if (!brush)
      return
    for (const stroke of target.strokes) {
      if (!stroke.points.length)
        continue
      const radius = Math.max(1, stroke.size / 1000 * Math.min(canvas.width, canvas.height))
      brush.lineCap = 'round'
      brush.lineJoin = 'round'
      brush.lineWidth = radius * 2
      brush.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over'
      brush.strokeStyle = stroke.mode === 'erase' ? 'rgba(0,0,0,1)' : OBJECT_REMOVAL_MASK_COLOR
      brush.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point[0] / 1000 * canvas.width
        const y = point[1] / 1000 * canvas.height
        if (index === 0)
          brush.moveTo(x, y)
        else
          brush.lineTo(x, y)
      })
      brush.stroke()
      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0]!
        brush.beginPath()
        brush.arc(x / 1000 * canvas.width, y / 1000 * canvas.height, radius, 0, Math.PI * 2)
        brush.fillStyle = stroke.mode === 'erase' ? 'rgba(0,0,0,1)' : OBJECT_REMOVAL_MASK_COLOR
        brush.fill()
      }
    }
    ctx.save()
    ctx.globalAlpha = OBJECT_REMOVAL_MASK_ALPHA
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
  })
}

async function setZoom(value: number, focus?: { clientX: number, clientY: number }) {
  cancel()
  const viewport = viewportRef.value
  const img = imageRef.value
  const next = Math.min(4, Math.max(0.5, Math.round(value * 100) / 100))
  if (next === zoom.value)
    return
  let relX = 0.5
  let relY = 0.5
  if (viewport && img && focus && loaded.value) {
    const ir = img.getBoundingClientRect()
    if (ir.width > 0 && ir.height > 0) {
      relX = (focus.clientX - ir.left) / ir.width
      relY = (focus.clientY - ir.top) / ir.height
    }
  }
  zoom.value = next
  await nextTick()
  if (!viewport)
    return
  if (focus && img) {
    const ir = img.getBoundingClientRect()
    viewport.scrollTo(
      viewport.scrollLeft + (ir.left + relX * ir.width - focus.clientX),
      viewport.scrollTop + (ir.top + relY * ir.height - focus.clientY),
    )
    return
  }
  viewport.scrollTo((viewport.scrollWidth - viewport.clientWidth) / 2, (viewport.scrollHeight - viewport.clientHeight) / 2)
}

function onWheel(event: WheelEvent) {
  if (!loaded.value || props.disabled || !viewportRef.value)
    return
  event.preventDefault()
  event.stopPropagation()
  const rect = viewportRef.value.getBoundingClientRect()
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
  const delta = Math.max(-100, Math.min(100, event.deltaY * unit))
  void setZoom(zoom.value * Math.exp(-delta * 0.002), { clientX: event.clientX, clientY: event.clientY })
}

function setTool(tool: CanvasTool) {
  clearBrushCursor()
  cancel()
  activeTool.value = tool
}

function selectObject(index: number) {
  setTool('select')
  activeIndex.value = index
}

function removeObject(index: number) {
  if (props.disabled)
    return
  const remaining = targets.value.filter((_, i) => i !== index)
  activeIndex.value = Math.min(activeIndex.value > index ? activeIndex.value - 1 : activeIndex.value, remaining.length - 1)
  targets.value = remaining
}

function updateLabel(index: number, label: string) {
  if (props.disabled)
    return
  targets.value = targets.value.map((target, i) => i === index ? { ...target, label } : target)
}

function point(event: PointerEvent) {
  const rect = imageRef.value!.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)),
    y: Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)),
  }
}

let start: { x: number, y: number } | null = null
let pointerId: number | null = null
let captureTarget: HTMLElement | null = null
let panStart: { x: number, y: number, left: number, top: number } | null = null
let editing: { index: number, box: ImageLayerRegion, origin: { x: number, y: number }, handle?: ImageLayerHandle } | null = null
let painting: { index: number, mode: 'paint' | 'erase', size: number, points: Array<[number, number]> } | null = null

const handles: { id: ImageLayerHandle, x: number, y: number, cursor: string, label: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize', label: 'top left' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize', label: 'top' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize', label: 'top right' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize', label: 'right' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize', label: 'bottom right' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize', label: 'bottom' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize', label: 'bottom left' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize', label: 'left' },
]


function maskNearPoint(target: ObjectRemovalTarget, position: { x: number, y: number }, brush: number) {
  if (target.kind !== 'mask' || !target.strokes?.length)
    return false
  const threshold = Math.max(brush * 2.5, 70)
  return target.strokes.some(stroke => stroke.points.some(pt => Math.hypot(pt[0] - position.x, pt[1] - position.y) < threshold + stroke.size))
}

function nearestMaskIndex(position: { x: number, y: number }) {
  let best = -1
  let bestDist = Infinity
  targets.value.forEach((target, index) => {
    if (target.kind !== 'mask' || !target.strokes?.length)
      return
    for (const stroke of target.strokes) {
      for (const pt of stroke.points) {
        const dist = Math.hypot(pt[0] - position.x, pt[1] - position.y) - stroke.size
        if (dist < bestDist) {
          bestDist = dist
          best = index
        }
      }
    }
  })
  return bestDist < 80 ? best : -1
}

function beginResize(event: PointerEvent, handle: ImageLayerHandle) {
  const target = targets.value[activeIndex.value]
  if (props.disabled || !loaded.value || !target?.bbox || !event.isPrimary || event.button !== 0 || pointerId !== null)
    return
  event.preventDefault()
  const el = event.currentTarget as HTMLElement
  el.focus({ preventScroll: true })
  editing = { index: activeIndex.value, box: [...target.bbox], origin: point(event), handle }
  pointerId = event.pointerId
  captureTarget = el
  el.setPointerCapture(event.pointerId)
  emit('selecting', true)
}

function begin(event: PointerEvent) {
  if (props.disabled || !loaded.value || !event.isPrimary || event.button !== 0 || pointerId !== null)
    return
  const el = event.currentTarget as HTMLElement
  event.preventDefault()
  el.focus({ preventScroll: true })
  if (activeTool.value === 'pan') {
    panStart = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop }
    isPanning.value = true
  }
  else {
    const position = point(event)
    const inside = position.x >= 0 && position.x <= 1000 && position.y >= 0 && position.y <= 1000
    if (!inside && activeTool.value !== 'select')
      return
    if (activeTool.value === 'box') {
      if (targets.value.length >= OBJECT_REMOVAL_MAX_TARGETS)
        return
      start = position
      draft.value = imageLayerRegionFromPoints(start, start)
      emit('selecting', true)
    }
    else if (activeTool.value === 'brush' || activeTool.value === 'eraser') {
      const mode = activeTool.value === 'eraser' ? 'erase' : 'paint'
      let index = activeIndex.value
      if (mode === 'paint') {
        const active = index >= 0 ? targets.value[index] : undefined
        const nearActive = active?.kind === 'mask' && maskNearPoint(active, position, brushSize.value)
        // Far from the active mask → new object (avoids merging distant strokes into one list item).
        if (!nearActive) {
          if (targets.value.length >= OBJECT_REMOVAL_MAX_TARGETS)
            return
          index = targets.value.length
          targets.value = [...targets.value, { kind: 'mask', label: '', strokes: [] }]
          activeIndex.value = index
        }
      }
      else if (index < 0 || targets.value[index]?.kind !== 'mask') {
        // Eraser: prefer the nearest mask under the pointer when none is selected.
        index = nearestMaskIndex(position)
        if (index < 0)
          return
        activeIndex.value = index
      }
      painting = { index, mode, size: brushSize.value, points: [[Math.round(position.x), Math.round(position.y)]] }
      emit('selecting', true)
    }
    else {
      activeIndex.value = -1
      for (let index = targets.value.length - 1; index >= 0; index--) {
        const target = targets.value[index]!
        if (target.kind === 'bbox' && target.bbox) {
          const box = target.bbox
          if (position.x >= box[0] && position.x <= box[2] && position.y >= box[1] && position.y <= box[3]) {
            activeIndex.value = index
            editing = { index, box: [...box], origin: position }
            emit('selecting', true)
            break
          }
        }
        else if (target.kind === 'mask' && target.strokes?.some(stroke => stroke.points.some(pt => Math.hypot(pt[0] - position.x, pt[1] - position.y) < (stroke.size + 12)))) {
          activeIndex.value = index
          break
        }
      }
      if (!editing && activeIndex.value < 0)
        return
    }
  }
  pointerId = event.pointerId
  captureTarget = el
  el.setPointerCapture(event.pointerId)
}

function onViewportPointerMove(event: PointerEvent) {
  updateBrushCursor(event)
  move(event)
}

function move(event: PointerEvent) {
  if (pointerId !== event.pointerId)
    return
  if (panStart && viewportRef.value) {
    viewportRef.value.scrollLeft = panStart.left - (event.clientX - panStart.x)
    viewportRef.value.scrollTop = panStart.top - (event.clientY - panStart.y)
  }
  else if (editing) {
    const position = point(event)
    const updated = transformImageLayerRegion(editing.box, position.x - editing.origin.x, position.y - editing.origin.y, editing.handle)
    targets.value = targets.value.map((target, index) => index === editing!.index ? { ...target, bbox: updated } : target)
  }
  else if (painting) {
    const position = point(event)
    const next: [number, number] = [Math.round(position.x), Math.round(position.y)]
    const last = painting.points[painting.points.length - 1]
    if (!last || Math.hypot(last[0] - next[0], last[1] - next[1]) >= 2) {
      painting.points.push(next)
      const stroke: ObjectRemovalStroke = { mode: painting.mode, size: painting.size, points: [...painting.points] }
      targets.value = targets.value.map((target, index) => {
        if (index !== painting!.index || target.kind !== 'mask')
          return target
        const strokes = [...(target.strokes || [])]
        const lastStroke = strokes[strokes.length - 1]
        if (lastStroke && lastStroke.mode === painting!.mode && lastStroke.size === painting!.size && lastStroke.points[0]?.[0] === painting!.points[0]![0] && lastStroke.points[0]?.[1] === painting!.points[0]![1])
          strokes[strokes.length - 1] = stroke
        else
          strokes.push(stroke)
        return { ...target, strokes }
      })
    }
  }
  else if (start) {
    draft.value = imageLayerRegionFromPoints(start, point(event))
  }
}

function cancel() {
  const target = captureTarget
  const capturedId = pointerId
  start = null
  pointerId = null
  captureTarget = null
  panStart = null
  editing = null
  painting = null
  isPanning.value = false
  draft.value = null
  emit('selecting', false)
  if (capturedId !== null && target?.hasPointerCapture(capturedId))
    target.releasePointerCapture(capturedId)
}

function finish(event: PointerEvent) {
  if (pointerId !== event.pointerId)
    return
  move(event)
  if (draft.value && draft.value[2] - draft.value[0] >= 5 && draft.value[3] - draft.value[1] >= 5) {
    activeIndex.value = targets.value.length
    targets.value = [...targets.value, { kind: 'bbox', label: '', bbox: draft.value }]
  }
  cancel()
}

watch(() => props.disabled, (disabled) => {
  if (disabled)
    cancel()
})
watch(() => props.src, () => {
  loaded.value = false
  targets.value = []
  activeIndex.value = -1
})
onBeforeUnmount(cancel)

const regions = computed(() => targets.value.map((target, index) => ({
  index,
  box: target.bbox,
  kind: target.kind,
})).filter(item => item.box) as Array<{ index: number, box: ImageLayerRegion, kind: string }>)
</script>

<template>
  <div class="grid min-w-0 overflow-hidden rounded-xl border border-border lg:grid-cols-[minmax(0,1fr)_240px]">
    <div class="min-w-0 bg-muted/20">
      <div class="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
        <div class="flex shrink-0 items-center gap-1" role="group" aria-label="Canvas tools">
          <button
            v-for="tool in ([
              { id: 'box', label: 'Draw box', icon: SquareDashed },
              { id: 'brush', label: 'Mask brush', icon: Paintbrush },
              { id: 'eraser', label: 'Eraser', icon: Eraser },
              { id: 'select', label: 'Select object', icon: MousePointer2 },
              { id: 'pan', label: 'Pan canvas', icon: Hand },
            ] as const)"
            :key="tool.id"
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-md border transition-colors disabled:opacity-30"
            :class="activeTool === tool.id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'"
            :aria-label="tool.label"
            :aria-pressed="activeTool === tool.id"
            :title="tool.label"
            :disabled="!loaded || disabled"
            @click="setTool(tool.id)"
          >
            <component :is="tool.icon" class="size-4" />
          </button>
          <label v-if="activeTool === 'brush' || activeTool === 'eraser'" class="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            Size
            <input v-model.number="brushSize" type="range" min="8" max="80" step="2" class="w-16" :disabled="disabled">
          </label>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" class="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Zoom out" :disabled="!loaded || disabled || zoom <= 0.5" @click="setZoom(zoom - 0.25)">
            <ZoomOut class="size-4" />
          </button>
          <span class="w-10 text-center text-xs tabular-nums" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
          <button type="button" class="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Zoom in" :disabled="!loaded || disabled || zoom >= 4" @click="setZoom(zoom + 0.25)">
            <ZoomIn class="size-4" />
          </button>
          <button type="button" class="ml-1 inline-flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" aria-label="Fit image" :disabled="!loaded || disabled" @click="setZoom(1)">
            <Maximize class="size-4" />
          </button>
        </div>
      </div>
      <div
        ref="viewportRef"
        class="relative h-[340px] overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-[480px]"
        :class="src ? [canvasCursor, 'touch-none select-none'] : ''"
        :tabindex="src ? 0 : -1"
        aria-label="Object removal canvas"
        @wheel.prevent="onWheel"
        @pointerdown="begin"
        @pointermove="onViewportPointerMove"
        @pointerup="finish"
        @pointercancel="cancel"
        @lostpointercapture="cancel"
        @pointerleave="clearBrushCursor"
      >
        <div class="grid place-items-center" :style="{ width: `${Math.max(viewportWidth, imageWidth + 32)}px`, height: `${Math.max(viewportHeight, imageHeight + 32)}px` }">
          <div
            class="relative touch-none select-none outline-none"
            :class="canvasCursor"
            :style="{ width: `${imageWidth}px`, height: `${imageHeight}px` }"
            role="group"
            aria-label="Image object removal canvas"
          >
            <div
              v-if="brushCursorVisible && brushCursor"
              class="pointer-events-none absolute z-30 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              :class="activeTool === 'eraser' ? 'border-white bg-white/25' : 'border-primary bg-primary/25'"
              :style="{
                width: `${brushCursorDiameter}px`,
                height: `${brushCursorDiameter}px`,
                left: `${brushCursor.x / 10}%`,
                top: `${brushCursor.y / 10}%`,
                transform: 'translate(-50%, -50%)',
              }"
              aria-hidden="true"
            />
            <img ref="imageRef" :src="src" alt="Image for object removal" draggable="false" class="block size-full max-w-none" @load="onImageLoad" @error="loaded = false; emit('error')">
            <canvas ref="maskCanvasRef" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />
            <svg v-if="loaded" class="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              <g v-for="item in [...regions.map(r => ({ ...r, draft: false })), ...(draft ? [{ index: targets.length, box: draft, kind: 'bbox', draft: true }] : [])]" :key="`${item.index}-${item.draft}`">
                <rect :x="item.box[0]" :y="item.box[1]" :width="item.box[2] - item.box[0]" :height="item.box[3] - item.box[1]" :fill="`${objectColor(item.index)}${item.index === activeIndex ? '26' : '0a'}`" stroke="#111827" stroke-width="1" vector-effect="non-scaling-stroke" />
                <rect :x="item.box[0]" :y="item.box[1]" :width="item.box[2] - item.box[0]" :height="item.box[3] - item.box[1]" fill="none" :stroke="objectColor(item.index)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
              </g>
            </svg>
            <span
              v-for="(target, index) in targets"
              :key="`label-${index}`"
              class="pointer-events-none absolute flex size-5 items-center justify-center text-xs font-semibold text-zinc-950"
              :style="{
                left: target.kind === 'bbox' && target.bbox ? `${target.bbox[0] / 10}%` : `${(target.strokes?.[0]?.points?.[0]?.[0] || 20) / 10}%`,
                top: target.kind === 'bbox' && target.bbox ? `${target.bbox[1] / 10}%` : `${(target.strokes?.[0]?.points?.[0]?.[1] || 20) / 10}%`,
                backgroundColor: objectColor(index),
              }"
              aria-hidden="true"
            >{{ index + 1 }}</span>
            <template v-if="targets[activeIndex]?.bbox && activeTool !== 'pan'">
              <button
                v-for="handle in handles"
                :key="handle.id"
                type="button"
                class="absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :style="{ left: `${(targets[activeIndex]!.bbox![0] + (targets[activeIndex]!.bbox![2] - targets[activeIndex]!.bbox![0]) * handle.x) / 10}%`, top: `${(targets[activeIndex]!.bbox![1] + (targets[activeIndex]!.bbox![3] - targets[activeIndex]!.bbox![1]) * handle.y) / 10}%`, cursor: handle.cursor }"
                :aria-label="`Resize object ${activeIndex + 1} ${handle.label}`"
                :disabled="disabled"
                @pointerdown.stop="beginResize($event, handle.id)"
                @pointermove.stop="move"
                @pointerup.stop="finish"
                @pointercancel.stop="cancel"
                @lostpointercapture.stop="cancel"
              >
                <span class="size-2.5 border border-zinc-950 bg-white" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
    <aside class="flex min-w-0 flex-col border-t border-border bg-card lg:h-[calc(480px+2.75rem)] lg:border-t-0 lg:border-l" aria-label="Objects to remove">
      <div class="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <h3 class="text-sm font-medium">
          Objects <span class="ml-1 text-xs text-muted-foreground" role="status">{{ targets.length }}/{{ OBJECT_REMOVAL_MAX_TARGETS }}</span>
        </h3>
      </div>
      <div v-if="!targets.length" class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center text-muted-foreground">
        <SquareDashed class="size-6" />
        <p class="text-xs leading-relaxed">
          Draw a box or paint a green mask on each object to remove. Use the eraser to tidy mask edges.
        </p>
      </div>
      <ol v-else class="max-h-[300px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 lg:max-h-[480px]">
        <li v-for="(target, index) in targets" :key="index" class="min-w-0 rounded-lg border p-2" :class="index === activeIndex ? 'border-border bg-accent' : 'border-transparent'">
          <div class="mb-2 flex items-center justify-between gap-2">
            <button type="button" :disabled="disabled" :aria-pressed="index === activeIndex" class="flex min-w-0 items-center gap-2 text-sm" @click="selectObject(index)">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-zinc-950" :style="{ backgroundColor: objectColor(index) }">{{ index + 1 }}</span>
              <span class="truncate">{{ target.kind === 'bbox' ? 'Box' : 'Mask' }} {{ index + 1 }}</span>
            </button>
            <button type="button" :disabled="disabled" :aria-label="`Remove object ${index + 1}`" class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground" @click="removeObject(index)">
              <Trash2 class="size-3.5" />
            </button>
          </div>
          <Input
            :model-value="target.label"
            :disabled="disabled"
            class="h-9 rounded-lg bg-input/30 shadow-none"
            :placeholder="target.kind === 'bbox' ? 'Optional: what is in this box?' : 'Optional: what is under this mask?'"
            :aria-label="`Notes for object ${index + 1}`"
            @update:model-value="updateLabel(index, String($event))"
          />
        </li>
      </ol>
    </aside>
  </div>
</template>
