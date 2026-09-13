<script setup lang="ts">
import type { SketchBounds, SketchElement, SketchPoint } from '~~/shared/utils/sketchToImage'
import { Layers, MousePointer2, Pencil, Redo2, Trash2, Type, Undo2 } from 'lucide-vue-next'
import { SKETCH_HEIGHT, SKETCH_WIDTH, sketchElementBounds, sketchPoint, sketchRotatedBounds, sketchRotation } from '~~/shared/utils/sketchToImage'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ editing: [hasText: boolean] }>()
const model = defineModel<SketchElement[]>({ default: () => [] })
// Keep gesture commits visible immediately, while the parent v-model catches up.
const elements = ref<SketchElement[]>(model.value)
watch(model, (value) => { elements.value = value }, { flush: 'sync' })
function setElements(value: SketchElement[]) {
  elements.value = value
  model.value = value
}
const mode = ref<'pen' | 'text' | 'select'>('pen')
const activeIndex = ref(-1)
const color = ref('#20242c')
const width = ref(5)
const textSize = ref(36)
const svg = useTemplateRef('surface')
const textInput = useTemplateRef('textInput')
const activeStroke = ref<Extract<SketchElement, { kind: 'stroke' }> | null>(null)
const textPosition = ref<SketchPoint | null>(null)
const textDraft = ref('')
const dragging = ref<{ index: number, origin: SketchPoint, element: SketchElement, bounds: { x: number, y: number, width: number, height: number }, dx: number, dy: number } | null>(null)
const rotating = ref<{ index: number, element: SketchElement, bounds: SketchBounds, origin: number, angle: number } | null>(null)
const undoStack = ref<SketchElement[][]>([])
const redoStack = ref<SketchElement[][]>([])
let pointerId: number | null = null
watch(textDraft, text => emit('editing', Boolean(text.trim())), { flush: 'sync' })

function change(next: SketchElement[]) {
  undoStack.value = [...undoStack.value.slice(-49), elements.value]
  redoStack.value = []
  setElements(next)
}

function commitText() {
  if (textPosition.value && textDraft.value.trim()) {
    const index = elements.value.length
    change([...elements.value, {
      kind: 'text',
      color: color.value,
      size: textSize.value,
      ...textPosition.value,
      text: textDraft.value.trim(),
    }])
    activeIndex.value = index
  }
  textPosition.value = null
  textDraft.value = ''
}

function cancelText() {
  textPosition.value = null
  textDraft.value = ''
}

function setMode(value: 'pen' | 'text' | 'select') {
  commitText()
  mode.value = value
  if (value === 'text')
    void startText({ x: 60, y: 70 })
}

function selectElement(index: number) {
  if (props.disabled)
    return
  commitText()
  activeIndex.value = index
  mode.value = 'select'
}

function removeElement(index: number) {
  if (props.disabled)
    return
  commitText()
  const remaining = elements.value.filter((_, i) => i !== index)
  change(remaining)
  activeIndex.value = Math.min(activeIndex.value > index ? activeIndex.value - 1 : activeIndex.value, remaining.length - 1)
}

function updateElementText(index: number, text: string) {
  if (props.disabled)
    return
  change(elements.value.map((element, i) => i === index && element.kind === 'text' ? { ...element, text } : element))
}

function updateElementColor(index: number, value: string) {
  if (!props.disabled)
    change(elements.value.map((element, i) => i === index ? { ...element, color: value } : element))
}

function updateElementSize(index: number, value: number) {
  if (props.disabled || !Number.isFinite(value))
    return
  const size = Math.min(240, Math.max(12, Math.round(value)))
  const selected = elements.value[index]
  if (selected?.kind !== 'text' || selected.size === size)
    return
  change(elements.value.map((element, i) => i === index && element.kind === 'text' ? { ...element, size } : element))
}

function onSizeInput(index: number, event: Event) {
  const size = (event.target as HTMLInputElement).valueAsNumber
  if (size >= 12 && size <= 240)
    updateElementSize(index, size)
}

const mounted = ref(false)
onMounted(() => { mounted.value = true })
let measureContext: CanvasRenderingContext2D | null = null
const measuredBounds = new WeakMap<SketchElement, SketchBounds>()
function boundsFor(element: SketchElement) {
  if (!mounted.value)
    return sketchElementBounds(element)
  const cached = measuredBounds.get(element)
  if (cached)
    return cached
  let metrics: TextMetrics | undefined
  if (element.kind === 'text' && typeof document !== 'undefined') {
    measureContext ||= document.createElement('canvas').getContext('2d')
    if (measureContext) {
      measureContext.font = `${element.size}px Arial, sans-serif`
      metrics = measureContext.measureText(element.text)
    }
  }
  const bounds = sketchElementBounds(element, metrics)
  measuredBounds.set(element, bounds)
  return bounds
}
function elementTransform(element: SketchElement, index: number) {
  const bounds = boundsFor(element)
  const drag = dragging.value?.index === index ? dragging.value : null
  const angle = rotating.value?.index === index ? rotating.value.angle : element.rotation || 0
  return `translate(${drag?.dx || 0} ${drag?.dy || 0}) rotate(${angle} ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2})`
}
const selection = computed(() => {
  const element = elements.value[activeIndex.value]
  if (!element)
    return null
  const bounds = boundsFor(element)
  return { element, bounds, transform: elementTransform(element, activeIndex.value) }
})
function updateElementRotation(index: number, value: number) {
  const element = elements.value[index]
  if (props.disabled || !element || !Number.isFinite(value))
    return
  const rotation = sketchRotation(value)
  if (rotation !== (element.rotation || 0))
    change(elements.value.map((item, i) => i === index ? { ...item, rotation } : item))
}
function rotationAngle(point: SketchPoint, bounds: SketchBounds) {
  return Math.atan2(point.y - bounds.y - bounds.height / 2, point.x - bounds.x - bounds.width / 2) * 180 / Math.PI
}
function startRotation(event: PointerEvent) {
  const selected = selection.value
  if (props.disabled || !selected || pointerId !== null || event.button !== 0)
    return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as SVGElement
  target.focus?.({ preventScroll: true })
  mode.value = 'select'
  const { element, bounds } = selected
  rotating.value = { index: activeIndex.value, element, bounds, origin: rotationAngle(rawPoint(event), bounds), angle: element.rotation || 0 }
  pointerId = event.pointerId
  svg.value?.setPointerCapture(event.pointerId)
}

function translatedElement(element: SketchElement, dx: number, dy: number): SketchElement {
  return element.kind === 'text'
    ? { ...element, x: element.x + dx, y: element.y + dy }
    : { ...element, points: element.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
}

function boundedOffset(bounds: { x: number, y: number, width: number, height: number }, dx: number, dy: number) {
  return {
    dx: Math.max(Math.min(0, -bounds.x), Math.min(Math.max(0, SKETCH_WIDTH - bounds.x - bounds.width), dx)),
    dy: Math.max(Math.min(0, -bounds.y), Math.min(Math.max(0, SKETCH_HEIGHT - bounds.y - bounds.height), dy)),
  }
}

function pickElement(event: PointerEvent, index: number) {
  if (props.disabled || mode.value !== 'select' || event.button !== 0 || pointerId !== null)
    return
  event.stopPropagation()
  event.preventDefault()
  const target = event.currentTarget as SVGElement
  target.focus?.({ preventScroll: true })
  selectElement(index)
  const element = elements.value[index]
  if (!element)
    return
  const bounds = sketchRotatedBounds(boundsFor(element), element.rotation)
  dragging.value = { index, origin: point(event), element, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, dx: 0, dy: 0 }
  pointerId = event.pointerId
  svg.value?.setPointerCapture(event.pointerId)
}

function onElementKeydown(event: KeyboardEvent, index: number) {
  if (props.disabled || mode.value !== 'select' || dragging.value || rotating.value || event.isComposing)
    return
  const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const delta = deltas[event.key]
  const element = elements.value[index]
  if (!delta || !element)
    return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 1
  const { dx, dy } = boundedOffset(sketchRotatedBounds(boundsFor(element), element.rotation), delta[0] * step, delta[1] * step)
  if (dx || dy)
    change(elements.value.map((item, i) => i === index ? translatedElement(element, dx, dy) : item))
}

async function startText(point: SketchPoint) {
  textPosition.value = { x: Math.min(point.x, SKETCH_WIDTH - 220), y: Math.max(45, Math.min(point.y, SKETCH_HEIGHT - 10)) }
  await nextTick()
  textInput.value?.focus({ preventScroll: true })
}

function rawPoint(event: PointerEvent) {
  const bounds = svg.value!.getBoundingClientRect()
  return { x: (event.clientX - bounds.left) / bounds.width * SKETCH_WIDTH, y: (event.clientY - bounds.top) / bounds.height * SKETCH_HEIGHT }
}

function point(event: PointerEvent) {
  return sketchPoint(event.clientX, event.clientY, svg.value!.getBoundingClientRect())
}

function start(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || pointerId !== null)
    return
  commitText()
  if (mode.value === 'select') {
    activeIndex.value = -1
    return
  }
  if (mode.value === 'text') {
    void startText(point(event))
    return
  }
  event.preventDefault()
  pointerId = event.pointerId
  svg.value?.setPointerCapture(event.pointerId)
  const first = point(event)
  activeStroke.value = { kind: 'stroke', color: color.value, width: width.value, points: [first, { ...first, x: first.x + 0.01 }] }
}

function move(event: PointerEvent) {
  if (pointerId !== event.pointerId)
    return
  if (rotating.value) {
    const state = rotating.value
    const angle = (state.element.rotation || 0) + rotationAngle(rawPoint(event), state.bounds) - state.origin
    state.angle = sketchRotation(event.shiftKey ? Math.round(angle / 15) * 15 : angle)
    return
  }
  if (dragging.value) {
    const current = rawPoint(event)
    Object.assign(dragging.value, boundedOffset(dragging.value.bounds, current.x - dragging.value.origin.x, current.y - dragging.value.origin.y))
    return
  }
  if (!activeStroke.value)
    return
  const samples = event.getCoalescedEvents?.() || []
  activeStroke.value.points.push(...(samples.length ? samples : [event]).map(point))
}

function finish(event?: PointerEvent) {
  if (event && pointerId !== event.pointerId)
    return
  // pointerup may carry a newer position than the final pointermove.
  if (event?.type === 'pointerup')
    move(event)
  const id = pointerId
  pointerId = null
  if (rotating.value) {
    const { index, element, angle } = rotating.value
    if (angle !== (element.rotation || 0))
      change(elements.value.map((item, i) => i === index ? { ...item, rotation: angle } : item))
    rotating.value = null
  }
  if (dragging.value) {
    const { index, element, dx, dy } = dragging.value
    if (dx || dy)
      change(elements.value.map((item, i) => i === index ? translatedElement(element, dx, dy) : item))
    dragging.value = null
  }
  if (activeStroke.value) {
    const index = elements.value.length
    change([...elements.value, activeStroke.value])
    activeIndex.value = index
  }
  activeStroke.value = null
  if (id !== null && svg.value?.hasPointerCapture(id))
    svg.value.releasePointerCapture(id)
}

function cancelPointer(event: PointerEvent) {
  if (pointerId !== event.pointerId)
    return
  // Browser cancellation / capture loss must preserve the last visible position.
  finish(event)
}

function cancelGesture(event: KeyboardEvent) {
  if (event.key !== 'Escape' || pointerId === null)
    return
  event.preventDefault()
  event.stopPropagation()
  dragging.value = null
  rotating.value = null
  activeStroke.value = null
  finish()
}

function undo() {
  commitText()
  const previous = undoStack.value.at(-1)
  if (!previous)
    return
  redoStack.value = [...redoStack.value, elements.value]
  undoStack.value = undoStack.value.slice(0, -1)
  setElements(previous)
  activeIndex.value = Math.min(activeIndex.value, previous.length - 1)
}

function redo() {
  const next = redoStack.value.at(-1)
  if (!next)
    return
  undoStack.value = [...undoStack.value, elements.value]
  redoStack.value = redoStack.value.slice(0, -1)
  setElements(next)
  activeIndex.value = Math.min(activeIndex.value, next.length - 1)
}

function clear() {
  cancelText()
  change([])
  activeIndex.value = -1
}

async function saveDraft() {
  commitText()
  finish()
  await nextTick()
}

async function exportFile() {
  await saveDraft()
  if (!elements.value.some(element => element.kind === 'stroke' || element.text.trim()))
    throw new Error('Draw a line or add text before sending.')
  const canvas = document.createElement('canvas')
  canvas.width = SKETCH_WIDTH
  canvas.height = SKETCH_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('Could not export your sketch. Please try again.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const element of elements.value) {
    ctx.save()
    if (element.rotation) {
      const bounds = boundsFor(element)
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      ctx.translate(x, y)
      ctx.rotate(element.rotation * Math.PI / 180)
      ctx.translate(-x, -y)
    }
    if (element.kind === 'text') {
      ctx.fillStyle = element.color
      ctx.font = `${element.size}px Arial, sans-serif`
      ctx.fillText(element.text, element.x, element.y)
    }
    else {
      ctx.strokeStyle = element.color
      ctx.lineWidth = element.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      element.points.forEach((p, index) => index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
      ctx.stroke()
    }
    ctx.restore()
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not export your sketch. Please try again.')), 'image/png'))
  return new File([blob], 'sketch.png', { type: 'image/png' })
}

defineExpose({ exportFile, saveDraft })
</script>

<template>
  <div class="@container/sketch w-full min-w-0 px-3 pt-3" data-sketch-canvas @keydown="cancelGesture">
    <div class="grid min-w-0 overflow-hidden rounded-xl border border-border lg:grid-cols-[minmax(0,1fr)_240px]">
      <div class="min-w-0 bg-muted/20">
        <div class="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
          <div class="flex shrink-0 items-center gap-1" role="toolbar" aria-label="Sketch tools">
            <Popover>
              <PopoverTrigger as-child>
                <button type="button" class="inline-flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30" :class="mode === 'pen' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'" aria-label="Pen" title="Pen · width" :aria-pressed="mode === 'pen'" :disabled="disabled" @click="setMode('pen')">
                  <Pencil class="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" class="w-56 p-3">
                <label class="flex items-center justify-between gap-3 text-xs whitespace-nowrap">
                  Pen width
                  <select v-model.number="width" aria-label="Pen width" class="h-8 rounded-md border border-border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" :disabled="disabled">
                    <option :value="3">Thin</option>
                    <option :value="5">Medium</option>
                    <option :value="10">Thick</option>
                  </select>
                </label>
              </PopoverContent>
            </Popover>
            <button
              v-for="tool in ([{ id: 'text', label: 'Text', icon: Type }, { id: 'select', label: 'Select element', icon: MousePointer2 }] as const)"
              :key="tool.id" type="button"
              class="inline-flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
              :class="mode === tool.id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'"
              :aria-label="tool.label" :title="tool.label" :aria-pressed="mode === tool.id" :disabled="disabled" @click="setMode(tool.id)"
            >
              <component :is="tool.icon" class="size-4" />
            </button>
            <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            <input
              v-model="color"
              type="color"
              aria-label="Ink color"
              title="Ink color"
              :disabled="disabled"
              class="size-7 cursor-pointer rounded-md border border-border bg-background p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30"
            >
          </div>
          <div class="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Undo sketch" title="Undo" :disabled="disabled || (!undoStack.length && !textDraft.trim())" @click="undo">
              <Undo2 class="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Redo sketch" title="Redo" :disabled="disabled || !redoStack.length" @click="redo">
              <Redo2 class="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Clear sketch" title="Clear sketch" :disabled="disabled || (!elements.length && !textDraft.trim())" @click="clear">
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
        <div class="flex h-[280px] items-center justify-center overflow-hidden p-4 @min-[800px]/sketch:h-[480px]">
          <div class="relative aspect-[3/2] w-full max-w-[372px] bg-white ring-1 ring-black/10 @min-[800px]/sketch:max-w-[672px]" :class="disabled ? 'opacity-60' : ''">
            <svg ref="surface" :viewBox="`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`" class="block size-full touch-none select-none" :class="mode === 'pen' ? 'cursor-crosshair' : mode === 'text' ? 'cursor-text' : 'cursor-default'" role="img" aria-label="Sketch drawing board" @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer">
              <g v-for="(element, index) in elements" :key="index" :transform="elementTransform(element, index)" :class="mode === 'select' ? dragging?.index === index ? 'cursor-grabbing' : 'cursor-grab' : ''" :tabindex="mode === 'select' && !disabled ? 0 : undefined" :aria-label="`Move ${element.kind === 'text' ? 'text' : 'stroke'} ${index + 1}`" @pointerdown="pickElement($event, index)" @keydown="onElementKeydown($event, index)">
                <template v-if="element.kind === 'stroke'">
                  <polyline :points="element.points.map(p => `${p.x},${p.y}`).join(' ')" fill="none" stroke="transparent" :stroke-width="element.width + 16" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline :points="element.points.map(p => `${p.x},${p.y}`).join(' ')" fill="none" :stroke="element.color" :stroke-width="element.width" stroke-linecap="round" stroke-linejoin="round" />
                </template>
                <text v-else :x="element.x" :y="element.y" :fill="element.color" :font-size="element.size" font-family="Arial, sans-serif" xml:space="preserve">{{ element.text }}</text>
              </g>
              <polyline v-if="activeStroke" :points="activeStroke.points.map(p => `${p.x},${p.y}`).join(' ')" fill="none" :stroke="activeStroke.color" :stroke-width="activeStroke.width" stroke-linecap="round" stroke-linejoin="round" />
              <g v-if="selection" :transform="selection.transform" data-sketch-selection>
                <rect :x="selection.bounds.x - 10" :y="selection.bounds.y - 10" :width="selection.bounds.width + 20" :height="selection.bounds.height + 20" fill="none" stroke="#367bea" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" pointer-events="none" />
                <rect v-if="mode === 'select'" :x="selection.bounds.x - 10" :y="selection.bounds.y - 10" :width="selection.bounds.width + 20" :height="selection.bounds.height + 20" fill="transparent" class="cursor-grab outline-none" tabindex="0" aria-label="Move selected element" @pointerdown="pickElement($event, activeIndex)" @keydown="onElementKeydown($event, activeIndex)" />
                <g v-if="!disabled" role="button" tabindex="0" aria-label="Rotate selected element" class="cursor-crosshair outline-none" @pointerdown="startRotation" @keydown.left.prevent="updateElementRotation(activeIndex, (selection.element.rotation || 0) - 15)" @keydown.right.prevent="updateElementRotation(activeIndex, (selection.element.rotation || 0) + 15)">
                  <title>Drag to rotate · Shift for 15° steps</title>
                  <line :x1="selection.bounds.x + selection.bounds.width / 2" :x2="selection.bounds.x + selection.bounds.width / 2" :y1="selection.bounds.y - 10" :y2="selection.bounds.y - 42" stroke="#367bea" vector-effect="non-scaling-stroke" pointer-events="none" />
                  <circle :cx="selection.bounds.x + selection.bounds.width / 2" :cy="selection.bounds.y - 42" r="18" fill="transparent" />
                  <circle :cx="selection.bounds.x + selection.bounds.width / 2" :cy="selection.bounds.y - 42" r="9" fill="white" stroke="#367bea" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none" />
                </g>
              </g>
            </svg>
            <div v-if="!elements.length && !activeStroke && !textPosition" class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-slate-400">
              <Pencil class="mb-1 size-5" />
              <p class="text-sm">
                A few lines are all it takes
              </p>
              <p class="px-3 text-xs">
                Draw your idea, or choose Text to add text to the sketch.
              </p>
            </div>
            <input v-if="textPosition" ref="textInput" v-model="textDraft" maxlength="200" :disabled="disabled" aria-label="Sketch text" placeholder="Add text…" class="absolute h-8 max-w-[90%] rounded border border-blue-400 bg-white px-1 text-base outline-none" :style="{ left: `${textPosition.x / SKETCH_WIDTH * 100}%`, top: `${Math.max(0, textPosition.y / SKETCH_HEIGHT * 100 - 6)}%`, width: `${Math.min(65, (SKETCH_WIDTH - textPosition.x) / SKETCH_WIDTH * 100)}%`, color }" @pointerdown.stop @keydown.enter="!$event.isComposing && ($event.preventDefault(), commitText())" @keydown.esc.prevent="cancelText" @blur="commitText">
          </div>
        </div>
      </div>
      <aside class="flex min-w-0 flex-col border-t border-border bg-card lg:h-[calc(280px+2.75rem)] lg:border-t-0 lg:border-l @min-[800px]/sketch:h-[calc(480px+2.75rem)]" aria-label="Sketch elements">
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
          <h3 class="text-sm font-medium">
            Elements <span class="ml-1 text-xs text-muted-foreground" role="status">{{ elements.length }}</span>
          </h3>
        </div>
        <div v-if="!elements.length" class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center text-muted-foreground">
          <Layers class="size-6" />
          <p class="text-xs leading-relaxed">
            Draw a line or add text on the canvas.<br>Manage each element here.
          </p>
        </div>
        <ol v-else class="max-h-[300px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 lg:max-h-none" aria-label="Element list">
          <li v-for="(element, index) in elements" :key="index" class="min-w-0 rounded-lg border p-2" :class="index === activeIndex ? 'border-border bg-accent' : 'border-transparent'">
            <div class="flex items-center justify-between gap-2">
              <button type="button" :disabled="disabled" :aria-pressed="index === activeIndex" :aria-label="`Select ${element.kind === 'text' ? 'text' : 'stroke'} ${index + 1}`" class="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="selectElement(index)">
                <span class="flex size-7 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white" :style="{ color: element.color }"><Type v-if="element.kind === 'text'" class="size-4" /><Pencil v-else class="size-4" /></span>
                <span class="truncate">{{ element.kind === 'text' ? element.text || `Text ${index + 1}` : `Stroke ${index + 1}` }}</span>
              </button>
              <button type="button" :disabled="disabled" :aria-label="`Remove element ${index + 1}`" class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="removeElement(index)">
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <div v-if="index === activeIndex" class="mt-2 space-y-2">
              <input v-if="element.kind === 'text'" :value="element.text" maxlength="200" :aria-label="`Edit text ${index + 1}`" :disabled="disabled" class="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @input="updateElementText(index, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent>
              <div v-if="element.kind === 'text'" class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Font size</span>
                <div class="flex items-center gap-1">
                  <button type="button" class="inline-flex size-6 items-center justify-center rounded border border-border hover:bg-background disabled:opacity-30" :aria-label="`Decrease font size for text ${index + 1}`" :disabled="disabled || element.size <= 12" @click="updateElementSize(index, element.size - 4)">
                    −
                  </button>
                  <input type="number" :value="element.size" min="12" max="240" step="1" :aria-label="`Font size for text ${index + 1}`" :disabled="disabled" class="h-7 w-14 rounded border border-border bg-background px-1 text-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @input="onSizeInput(index, $event)" @blur="updateElementSize(index, Number(($event.target as HTMLInputElement).value))" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()">
                  <button type="button" class="inline-flex size-6 items-center justify-center rounded border border-border hover:bg-background disabled:opacity-30" :aria-label="`Increase font size for text ${index + 1}`" :disabled="disabled || element.size >= 240" @click="updateElementSize(index, element.size + 4)">
                    +
                  </button>
                </div>
              </div>
              <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Rotation</span>
                <div class="flex items-center gap-1">
                  <button type="button" class="size-6 rounded border border-border hover:bg-background disabled:opacity-30" :aria-label="`Rotate element ${index + 1} counterclockwise`" :disabled="disabled" @click="updateElementRotation(index, (element.rotation || 0) - 15)">
                    −
                  </button>
                  <input type="number" :value="rotating?.index === index ? rotating.angle : element.rotation || 0" min="-360" max="360" step="1" :aria-label="`Rotation for element ${index + 1}`" :disabled="disabled" class="h-7 w-14 rounded border border-border bg-background px-1 text-center text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @change="updateElementRotation(index, ($event.target as HTMLInputElement).valueAsNumber)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()">
                  <span>°</span>
                  <button type="button" class="size-6 rounded border border-border hover:bg-background disabled:opacity-30" :aria-label="`Rotate element ${index + 1} clockwise`" :disabled="disabled" @click="updateElementRotation(index, (element.rotation || 0) + 15)">
                    +
                  </button>
                </div>
              </div>
              <label class="flex items-center justify-between gap-2 text-xs text-muted-foreground">Color<input type="color" :value="element.color" :aria-label="`Color for element ${index + 1}`" :disabled="disabled" class="h-6 w-8 cursor-pointer rounded border border-border bg-background" @input="updateElementColor(index, ($event.target as HTMLInputElement).value)"></label>
            </div>
          </li>
        </ol>
      </aside>
    </div>
    <p class="px-1 pt-2 text-[11px] text-muted-foreground" role="status">
      {{ mode === 'text' ? 'Click to place text · Enter to add it to the sketch' : mode === 'select' ? 'Drag to move · Drag the round handle to rotate · Escape to cancel' : 'Drag to draw · Works with touch and pen' }}
    </p>
  </div>
</template>
