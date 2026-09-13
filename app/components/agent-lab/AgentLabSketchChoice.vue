<script setup lang="ts">
import type { ImageAnnotationReference } from '~~/shared/utils/imageAnnotations'
import type { ChoiceAnswer, ChoicePayload } from '~/composables/useAgentLab'

const props = defineProps<{
  choice: ChoicePayload
  state?: 'pending' | 'answered' | 'skipped'
  answers?: ChoiceAnswer[]
  pending?: boolean
  readOnly?: boolean
  referenceImages?: ImageAnnotationReference[]
  sourceImages?: { id: string, url: string }[]
  uploadImage?: (file: File) => Promise<ImageAnnotationReference>
}>()
const emit = defineEmits<{ submit: [answers: ChoiceAnswer[]], browseAssets: [] }>()
const question = computed(() => props.choice.questions[0]!)
const active = computed(() => !props.readOnly && (!props.state || props.state === 'pending'))
const selected = ref('')
const note = ref('')
const references = ref<ImageAnnotationReference[]>([])
const uploading = ref(false)
const error = ref('')
const picker = useTemplateRef('picker')
const browsing = ref(false)
const locked = computed(() => props.pending || uploading.value || !active.value)
const addingImages = computed(() => question.value.id === 'sketch_references' && selected.value === 'yes')
const addingText = computed(() => (question.value.id === 'sketch_notes' && selected.value === 'yes') || selected.value === 'adjust' || question.value.options.find(option => option.id === selected.value)?.custom)
const limit = computed(() => Math.max(0, 9 - Math.max(1, props.sourceImages?.length || 0)))
const available = computed(() => (props.referenceImages || []).filter(image => !props.sourceImages?.some(source => source.url === image.url)))
const canContinue = computed(() => !locked.value && Boolean(selected.value) && (!addingImages.value || references.value.length > 0) && (!addingText.value || Boolean(note.value.trim())))

function toggleReference(image: ImageAnnotationReference) {
  if (locked.value)
    return
  if (references.value.some(item => item.url === image.url)) {
    references.value = references.value.filter(item => item.url !== image.url)
    return
  }
  if (references.value.length >= limit.value) {
    error.value = `Choose up to ${limit.value} additional images.`
    return
  }
  references.value = [...references.value, image]
  error.value = ''
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!props.uploadImage || locked.value)
    return
  if (files.length + references.value.length > limit.value) {
    error.value = `Choose up to ${limit.value} additional images.`
    return
  }
  uploading.value = true
  error.value = ''
  try {
    for (const file of files) {
      const image = await props.uploadImage(file)
      if (!references.value.some(item => item.url === image.url))
        references.value.push(image)
    }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Upload failed. Try again.' }
  finally { uploading.value = false }
}
function submit() {
  if (!canContinue.value)
    return
  emit('submit', [{
    questionId: question.value.id,
    optionId: selected.value,
    label: question.value.options.find(option => option.id === selected.value)?.label,
    ...(addingText.value ? { text: note.value.trim() } : {}),
    ...(addingImages.value ? { referenceImages: references.value } : {}),
  }])
}
</script>

<template>
  <Card class="relative w-full min-w-0 gap-4 rounded-2xl border-blue-500/70 py-4 shadow-none">
    <AgentLabCardBorder v-if="active" tone="attention" />
    <CardHeader class="px-4">
      <CardTitle class="text-sm">
        {{ choice.prompt || 'Sketch to Image' }}
      </CardTitle>
      <CardDescription>{{ active ? (question.title || 'Review this step before continuing.') : (state === 'skipped' ? 'Skipped' : state === 'answered' ? 'Saved' : 'Pending') }}</CardDescription>
    </CardHeader>
    <CardContent v-if="active" class="grid min-w-0 gap-4 px-4">
      <p class="whitespace-pre-wrap break-words text-sm leading-6">
        {{ question.prompt }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button v-for="option in question.options" :key="option.id" :variant="selected === option.id ? 'default' : 'outline'" :aria-pressed="selected === option.id" :disabled="locked" @click="selected = option.id">
          {{ option.label }}
        </Button>
      </div>
      <section v-if="addingImages" class="space-y-3" aria-label="Reference images">
        <div class="flex flex-wrap gap-2">
          <Button v-if="uploadImage" variant="outline" :disabled="locked || references.length >= limit" @click="picker?.click()">
            Upload images
          </Button>
          <Button variant="outline" :disabled="locked" @click="browsing = !browsing; emit('browseAssets')">
            Choose from project
          </Button>
          <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden @change="upload">
        </div>
        <p v-if="uploading" role="status" class="text-sm">
          Uploading…
        </p>
        <div v-if="references.length" class="flex flex-wrap gap-2">
          <button v-for="image in references" :key="image.url" type="button" class="rounded border border-primary p-1 text-xs" :disabled="locked" :aria-label="`Remove ${image.name}`" @click="toggleReference(image)">
            <img :src="image.url" :alt="image.name" class="size-20 object-contain">Remove
          </button>
        </div>
        <div v-if="browsing" class="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded border p-2 sm:grid-cols-4">
          <button v-for="image in available" :key="image.url" type="button" class="min-w-0 rounded border p-1" :class="references.some(item => item.url === image.url) ? 'border-primary bg-primary/10' : 'border-border'" :disabled="locked" :aria-pressed="references.some(item => item.url === image.url)" @click="toggleReference(image)">
            <img :src="image.url" :alt="image.name" class="h-20 w-full object-contain"><span class="block truncate text-xs">{{ image.name }}</span>
          </button>
          <p v-if="!available.length" class="col-span-full text-sm text-muted-foreground">
            No other project images yet. Upload an image above.
          </p>
        </div>
      </section>
      <Textarea v-if="addingText" v-model="note" :disabled="locked" :maxlength="4000" rows="5" :placeholder="question.id === 'sketch_understanding' ? 'Add details or correct my understanding…' : selected === 'adjust' ? 'Describe what you want to change…' : 'Add your instructions…'" :aria-label="question.id === 'sketch_understanding' ? 'Additions or corrections' : 'Additional instructions'" />
      <p v-if="error" role="alert" class="text-sm text-destructive">
        {{ error }}
      </p>
    </CardContent>
    <CardContent v-else class="min-w-0 space-y-3 px-4">
      <p class="whitespace-pre-wrap break-words text-sm">
        {{ question.prompt }}
      </p>
      <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">
        {{ answers?.[0]?.text || answers?.[0]?.label || (state === 'skipped' ? 'Skipped' : 'Saved') }}
      </p>
      <div v-if="answers?.[0]?.referenceImages?.length" class="flex flex-wrap gap-2">
        <img v-for="image in answers[0].referenceImages" :key="image.url" :src="image.url" :alt="image.name" class="size-16 rounded border object-contain">
      </div>
    </CardContent>
    <CardFooter v-if="active" class="justify-end gap-2 border-t px-4 pt-3">
      <Button type="button" size="sm" :disabled="!canContinue" @click="submit">
        {{ question.id === 'sketch_understanding' && selected === 'correct' ? 'Generate image' : selected === 'send' ? 'Send' : 'Continue' }}
      </Button>
    </CardFooter>
  </Card>
</template>
