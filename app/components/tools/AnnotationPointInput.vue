<script setup lang="ts">
import type { ImageAnnotationPoint, ImageAnnotationReference } from '~~/shared/utils/imageAnnotations'
import { Paperclip, X } from 'lucide-vue-next'

const props = defineProps<{
  id: string
  label: string
  disabled?: boolean
  referenceImages?: ImageAnnotationReference[]
  uploadImage?: (file: File) => Promise<ImageAnnotationReference>
}>()
const emit = defineEmits<{ browseAssets: [], uploading: [value: boolean] }>()
const point = defineModel<ImageAnnotationPoint>({ required: true })
const input = useTemplateRef('input')
const picker = useTemplateRef('picker')
const uploading = ref(false)
let uploadRange: { start: number, end: number } | undefined
const mention = ref<{ start: number, end: number, query: string } | null>(null)
const activeIndex = ref(0)
const error = ref('')
const listId = `${props.id}-assets`
const matches = computed(() => (props.referenceImages || []).filter(asset => asset.name.toLowerCase().includes(mention.value?.query.toLowerCase() || '')))
const uploadOffset = computed(() => props.uploadImage ? 1 : 0)
const optionCount = computed(() => matches.value.length + uploadOffset.value)
watch(() => mention.value?.query, () => { activeIndex.value = 0 }, { flush: 'sync' })
watch(optionCount, (count) => { activeIndex.value = Math.max(0, Math.min(activeIndex.value, count - 1)) })
function updateMention() {
  const element = input.value
  if (!element)
    return
  const end = element.selectionStart
  const match = /@([^@\n]*)$/.exec(element.value.slice(0, end))
  const wasOpen = Boolean(mention.value)
  mention.value = match ? { start: end - match[0].length, end, query: match[1]! } : null
  if (mention.value && !wasOpen)
    emit('browseAssets')
}
function updateText(event: Event) {
  const text = (event.target as HTMLTextAreaElement).value
  point.value = { ...point.value, text }
  updateMention()
}
function insert(asset: ImageAnnotationReference, selectedRange?: { start: number, end: number }) {
  const name = asset.name.slice(0, 100)
  const cursor = input.value?.selectionStart ?? point.value.text.length
  const range = selectedRange || mention.value || { start: cursor, end: cursor }
  const text = point.value.text.slice(0, range.start) + point.value.text.slice(range.end)
  if (text.length > 1000 || ((point.value.references?.length || 0) >= 14 && !point.value.references?.some(reference => reference.url === asset.url))) {
    error.value = 'Use up to 1000 characters and 14 reference images per point.'
    return
  }
  const references = point.value.references?.some(reference => reference.url === asset.url)
    ? point.value.references
    : [...(point.value.references || []), { url: asset.url, name }]
  point.value = { ...point.value, text, references }
  mention.value = null
  error.value = ''
  void nextTick(() => {
    input.value?.focus({ preventScroll: true })
    input.value?.setSelectionRange(range.start, range.start)
  })
}
function removeReference(asset: ImageAnnotationReference) {
  point.value = { ...point.value, references: point.value.references?.filter(reference => reference.url !== asset.url) }
}
function onKeydown(event: KeyboardEvent) {
  if (!mention.value || event.isComposing)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    mention.value = null
  }
  else if (optionCount.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    event.preventDefault()
    if (event.key === 'Enter') {
      if (props.uploadImage && activeIndex.value === 0)
        chooseUpload()
      else
        insert(matches.value[activeIndex.value - uploadOffset.value]!)
    }
    else {
      activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + optionCount.value) % optionCount.value
      void nextTick(() => document.getElementById(`${listId}-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' }))
    }
  }
}
function chooseUpload() {
  if (props.disabled || uploading.value)
    return
  uploadRange = mention.value ? { start: mention.value.start, end: mention.value.end } : undefined
  picker.value?.click()
}
async function upload(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file || !props.uploadImage || uploading.value)
    return
  const range = uploadRange
  uploading.value = true
  emit('uploading', true)
  error.value = ''
  mention.value = null
  try {
    insert(await props.uploadImage(file), range)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Upload failed. Please try again.'
  }
  finally {
    uploading.value = false
    emit('uploading', false)
  }
}
</script>

<template>
  <div class="min-w-0 flex-1">
    <div class="overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <textarea :id="id" ref="input" :value="point.text" :disabled="disabled || uploading" maxlength="1000" rows="2" :aria-label="label" :aria-expanded="Boolean(mention)" :aria-controls="mention ? listId : undefined" :aria-activedescendant="mention && optionCount ? `${listId}-${activeIndex}` : undefined" aria-autocomplete="list" placeholder="Describe the edit, or @ an image…" class="block w-full min-w-0 resize-y border-0 bg-transparent px-3 py-2 text-sm outline-none" @input="updateText" @click="updateMention" @keydown="onKeydown" @blur="mention = null" />
      <div v-if="point.references?.length" class="flex flex-wrap justify-start gap-2 px-3 pb-3" aria-label="Referenced images">
        <span v-for="asset in point.references" :key="asset.url" :title="asset.name" class="relative block size-12 shrink-0">
          <img :src="asset.url" :alt="asset.name" class="size-full rounded-md border object-cover">
          <button type="button" :disabled="disabled || uploading" :aria-label="`Remove reference ${asset.name}`" class="absolute -top-1 -right-1 rounded-full border bg-background p-0.5 text-foreground hover:bg-accent disabled:opacity-50" @click="removeReference(asset)"><X class="size-3" /></button>
        </span>
      </div>
    </div>
    <div v-if="mention" :id="listId" role="listbox" aria-label="Project images" class="mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover p-1">
      <button v-if="uploadImage" :id="`${listId}-0`" type="button" role="option" :aria-selected="activeIndex === 0" :disabled="disabled || uploading" class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent" :class="activeIndex === 0 ? 'bg-accent' : ''" @pointerdown.prevent @click="chooseUpload">
        <Paperclip class="size-4" />Upload image
      </button>
      <button v-for="(asset, index) in matches" :id="`${listId}-${index + uploadOffset}`" :key="asset.url" type="button" role="option" :aria-selected="activeIndex === index + uploadOffset" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent" :class="activeIndex === index + uploadOffset ? 'bg-accent' : ''" @pointerdown.prevent @click="insert(asset)">
        <img :src="asset.url" alt="" class="size-8 shrink-0 rounded object-cover">
        <span class="min-w-0 truncate">{{ asset.name }}</span>
      </button>
      <p v-if="!matches.length" class="px-2 py-3 text-xs text-muted-foreground" role="status">
        No matching project images.
      </p>
    </div>
    <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" aria-label="Upload reference image" @change="upload">
    <p v-if="uploading" role="status" class="mt-1 text-xs text-muted-foreground">
      Uploading…
    </p>
    <p v-if="error" role="alert" class="mt-1 text-xs text-destructive">
      {{ error }}
    </p>
  </div>
</template>
