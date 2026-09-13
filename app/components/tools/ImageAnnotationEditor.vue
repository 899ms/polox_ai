<script setup lang="ts">
import type { ImageAnnotationPoint, ImageAnnotationReference } from '~~/shared/utils/imageAnnotations'
import { MapPin, Trash2 } from 'lucide-vue-next'

const props = defineProps<{ src: string, disabled?: boolean, referenceImages?: ImageAnnotationReference[], uploadImage?: (file: File) => Promise<ImageAnnotationReference> }>()
const emit = defineEmits<{ uploading: [value: boolean], browseAssets: [] }>()
const uploading = ref(false)
const failed = ref(false)
const uploadedImages = ref<ImageAnnotationReference[]>([])
const referenceImages = computed(() => [...new Map([...(props.referenceImages || []), ...uploadedImages.value].map(image => [image.url, image])).values()])
const points = defineModel<ImageAnnotationPoint[]>({ default: () => [] })
const editorId = useId()
watch(() => props.src, () => { failed.value = false })
watch(() => points.value.length, (length, previous) => {
  if (length > previous)
    void nextTick(() => document.getElementById(`${editorId}-${length - 1}`)?.focus({ preventScroll: true }))
})
function updatePoint(index: number, value: ImageAnnotationPoint) {
  if (!props.disabled)
    points.value = points.value.map((point, i) => i === index ? value : point)
}
function removePoint(index: number) {
  if (!props.disabled && !uploading.value) {
    points.value = points.value.filter((_, i) => i !== index)
  }
}
async function uploadReference(file: File) {
  const asset = await props.uploadImage!(file)
  uploadedImages.value = [...uploadedImages.value.filter(image => image.url !== asset.url), asset]
  return asset
}
</script>

<template>
  <div class="min-w-0">
    <ToolsImageRegionSelector :key="src" v-model:points="points" :src="src" point-mode :disabled="disabled || uploading" @load="failed = false" @error="failed = true">
      <template #sidebar="{ activeIndex, selectObject, objectColor }">
        <aside class="flex min-w-0 flex-col border-t border-border bg-card lg:h-[calc(480px+2.75rem)] lg:border-t-0 lg:border-l" aria-label="Annotation list">
          <div class="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
            <h3 class="text-sm font-medium">
              Annotations <span class="ml-1 text-xs text-muted-foreground" role="status">{{ points.length }}/16</span>
            </h3>
          </div>
          <div v-if="!points.length" class="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center text-muted-foreground">
            <MapPin class="size-6" />
            <p class="text-xs leading-relaxed">
              Choose Add annotation point, then click the image.<br>Describe each edit here.
            </p>
          </div>
          <ol v-else class="max-h-[300px] min-h-0 flex-1 space-y-2 overflow-y-auto p-2 lg:max-h-none">
            <li v-for="(point, index) in points" :key="index" class="min-w-0 rounded-lg border p-2" :class="index === activeIndex ? 'border-border bg-accent' : 'border-transparent'">
              <div class="mb-2 flex items-center justify-between gap-2">
                <button type="button" :disabled="disabled || uploading" :aria-pressed="index === activeIndex" class="flex min-w-0 items-center gap-2 text-sm" @click="selectObject(index)">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-zinc-950" :style="{ backgroundColor: objectColor(index) }">{{ index + 1 }}</span>
                  Point {{ index + 1 }}
                </button>
                <button type="button" :disabled="disabled || uploading" :aria-label="`Remove point ${index + 1}`" class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground" @click="removePoint(index)">
                  <Trash2 class="size-3.5" />
                </button>
              </div>
              <ToolsAnnotationPointInput :id="`${editorId}-${index}`" :model-value="point" :label="`Edit for point ${index + 1}`" :disabled="disabled || uploading" :reference-images="referenceImages" :upload-image="uploadImage ? uploadReference : undefined" @uploading="uploading = $event; emit('uploading', $event)" @update:model-value="updatePoint(index, $event)" @browse-assets="emit('browseAssets')" />
            </li>
          </ol>
        </aside>
      </template>
    </ToolsImageRegionSelector>
    <p v-if="failed" role="alert" class="mt-2 text-sm text-destructive">
      Could not load this image. Select another source or try again.
    </p>
  </div>
</template>
