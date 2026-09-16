<script setup lang="ts">
import type { ImageAnnotationPoint, ImageAnnotationReference } from '~~/shared/utils/imageAnnotations'
import type { ImageLayerRegion } from '~~/shared/utils/imageLayerSplitter'
import type { ChoiceAnswer, ChoicePayload, ChoiceQuestion } from '~/composables/useAgentLab'
import { standaloneImageEditQuestions, withCustomChoiceOption } from '~~/shared/utils/agentChoices'
import { renderLayerSelectionOverlayBlob } from '~/utils/layerSelectionOverlay'

const props = withDefaults(defineProps<{
  choice: ChoicePayload
  state?: 'pending' | 'answered' | 'skipped'
  answers?: ChoiceAnswer[]
  readOnly?: boolean
  pending?: boolean
  referenceImages?: ImageAnnotationReference[]
  uploadImage?: (file: File) => Promise<ImageAnnotationReference>
  sourceImages?: { id: string, url: string }[]
  /** Exact boxed-overlay URLs shown to the agent; omit when unavailable (do not locally re-render). */
  boxedPreviewImages?: { id: string, url: string }[]
  /** When another confirm card is pending, hide the full box editor. */
  hideLayerEditor?: boolean
}>(), {
  pending: false,
  readOnly: false,
  hideLayerEditor: false,
})

const emit = defineEmits<{
  submit: [answers: ChoiceAnswer[]]
  skip: []
  browseAssets: []
}>()

const questions = computed(() => standaloneImageEditQuestions(props.choice.questions).map(question => ({
  ...question,
  options: withCustomChoiceOption(question.options),
})))

const recommendation = computed(() => {
  const method = questions.value.find(question => question.id === 'image_edit_method')
  return method ? method.options.find(option => option.id === 'annotate')?.label || '' : props.choice.recommendation
})
const isPending = computed(() => (props.state || 'pending') === 'pending')
const promptExpanded = ref(false)
const questionPromptExpanded = ref<Record<string, boolean>>({})
const choicePrompt = computed(() => (props.choice.prompt || '').trim())
function textNeedsExpand(value: string) {
  const full = value.trim()
  if (!full)
    return false
  const lines = full.split(/\n/).filter(line => line.trim().length > 0)
  return lines.length > 2 || full.length > 140
}
const choicePromptNeedsExpand = computed(() => textNeedsExpand(choicePrompt.value))
function questionPromptNeedsExpand(prompt: string) {
  return textNeedsExpand(prompt)
}
function isQuestionPromptExpanded(id: string) {
  return Boolean(questionPromptExpanded.value[id])
}
function toggleQuestionPrompt(id: string) {
  questionPromptExpanded.value = {
    ...questionPromptExpanded.value,
    [id]: !questionPromptExpanded.value[id],
  }
}
const selections = ref<Record<string, { optionId: string, text: string }>>({})
const regionsByImage = ref<Record<string, ImageLayerRegion[]>>({})
const sourceUrl = ref('')
const regions = computed({
  get: () => regionsByImage.value[sourceUrl.value] || [],
  set: (value: ImageLayerRegion[]) => { regionsByImage.value[sourceUrl.value] = value },
})
const imageSelections = computed(() => (props.sourceImages || []).map(image => ({
  imageUrl: image.url,
  regions: (regionsByImage.value[image.url] || []).map(box => [...box] as ImageLayerRegion),
})))
const annotationPointsByImage = ref<Record<string, ImageAnnotationPoint[]>>({})
const annotationPoints = computed({
  get: () => annotationPointsByImage.value[sourceUrl.value] || [],
  set: (points: ImageAnnotationPoint[]) => { annotationPointsByImage.value[sourceUrl.value] = points },
})
const uploading = ref(false)
const annotating = computed(() => selections.value.image_edit_method?.optionId === 'annotate')
const selecting = ref(false)
const confirmingLayers = computed(() => questions.value.some(question => question.id === 'layer_split_confirm' || question.id === 'layer_split_plan'))
const drawing = computed(() => !confirmingLayers.value && selections.value.layer_selection_method?.optionId === 'draw_boxes')
const confirmBoxedPreviews = computed(() => (props.boxedPreviewImages || []).map(image => image.url).filter(Boolean))
watch(() => props.sourceImages, (images) => {
  if (!images?.some(image => image.url === sourceUrl.value))
    sourceUrl.value = images?.[0]?.url || ''
}, { immediate: true })
watch(sourceUrl, () => { selecting.value = false }, { flush: 'sync' })

watch(
  () => props.choice.id,
  () => {
    promptExpanded.value = false
    questionPromptExpanded.value = {}
    selections.value = {}
    regionsByImage.value = {}
    annotationPointsByImage.value = {}
    for (const answer of props.answers || []) {
      if (answer.annotationEdit) {
        sourceUrl.value = answer.annotationEdit.imageUrl
        annotationPointsByImage.value[answer.annotationEdit.imageUrl] = answer.annotationEdit.points.map(point => ({ ...point }))
      }
      if (answer.optionId)
        selections.value[answer.questionId] = { optionId: answer.optionId, text: answer.text || '' }
      if (answer.questionId === 'layer_selection_method' && answer.optionId === 'draw_boxes') {
        for (const selection of answer.imageSelections || (answer.imageUrl ? [{ imageUrl: answer.imageUrl, regions: answer.regions || [] }] : [])) {
          if (props.sourceImages?.some(image => image.url === selection.imageUrl))
            regionsByImage.value[selection.imageUrl] = selection.regions.map(box => [...box] as ImageLayerRegion)
        }
      }
    }
    // Open the annotation canvas immediately when Annotate is the recommended method.
    const method = questions.value.find(question => question.id === 'image_edit_method')
    if (method && method.recommendedId === 'annotate' && !selections.value.image_edit_method && method.options.some(option => option.id === 'annotate')) {
      selections.value = {
        ...selections.value,
        image_edit_method: { optionId: 'annotate', text: '' },
      }
    }
  },
  { immediate: true },
)

function selectedOption(question: ChoiceQuestion) {
  const current = selections.value[question.id]
  if (!current)
    return null
  return question.options.find(item => item.id === current.optionId) || null
}

function selectOption(question: ChoiceQuestion, optionId: string) {
  if (props.readOnly || !isPending.value || props.pending || uploading.value)
    return
  const option = question.options.find(item => item.id === optionId)
  if (!option)
    return
  const previous = selections.value[question.id]
  selections.value = {
    ...selections.value,
    [question.id]: {
      optionId,
      text: option.custom ? (previous?.optionId === optionId ? previous.text : '') : '',
    },
  }
}

function setCustomText(questionId: string, value: string) {
  const current = selections.value[questionId]
  if (props.readOnly || !current)
    return
  selections.value = {
    ...selections.value,
    [questionId]: {
      ...current,
      text: value,
    },
  }
}

const canSubmit = computed(() => {
  if (props.readOnly || !isPending.value || props.pending || uploading.value)
    return false
  if (annotating.value && (!sourceUrl.value || !annotationPoints.value.length || annotationPoints.value.some(point => !point.text.trim())))
    return false
  if (drawing.value && (!imageSelections.value.length || imageSelections.value.some(selection => !selection.regions.length) || selecting.value))
    return false
  return questions.value.every((question) => {
    const option = selectedOption(question)
    if (!option)
      return false
    if (option.custom)
      return Boolean(selections.value[question.id]?.text.trim())
    return true
  })
})

async function emitSubmit() {
  if (!canSubmit.value)
    return
  let boxedSelections = imageSelections.value
  if (drawing.value && props.uploadImage) {
    uploading.value = true
    try {
      boxedSelections = []
      for (const selection of imageSelections.value) {
        try {
          const blob = await renderLayerSelectionOverlayBlob(selection.imageUrl, selection.regions)
          const uploaded = await props.uploadImage(new File([blob], 'layer-boxes.png', { type: 'image/png' }))
          boxedSelections.push({ ...selection, boxedImageUrl: uploaded.url })
        }
        catch {
          // CORS or upload failure — server will render the overlay instead.
          boxedSelections.push(selection)
        }
      }
    }
    finally {
      uploading.value = false
    }
  }
  emit('submit', questions.value.map((question) => {
    const current = selections.value[question.id]
    const option = selectedOption(question)
    return {
      questionId: question.id,
      optionId: current?.optionId,
      label: option?.label,
      text: current?.text.trim() || undefined,
      ...(question.id === 'image_edit_method' && current?.optionId === 'annotate'
        ? { annotationEdit: { imageUrl: sourceUrl.value, points: annotationPoints.value.map(point => ({ ...point })) } }
        : {}),
      ...(question.id === 'layer_selection_method' && current?.optionId === 'draw_boxes'
        ? { imageSelections: boxedSelections }
        : {}),
    }
  }))
}

function optionLabel(question: ChoiceQuestion, answer?: ChoiceAnswer) {
  if (!answer || answer.skipped)
    return ''
  if (answer.text && answer.label)
    return `${answer.label}: ${answer.text}`
  if (answer.text)
    return answer.text
  if (answer.label)
    return answer.label
  const option = question.options.find(item => item.id === answer.optionId)
  return option?.label || answer.optionId || ''
}

const resolvedAnswers = computed(() => {
  const byId = new Map((props.answers || []).map(item => [item.questionId, item]))
  return questions.value.map((question) => {
    const answer = byId.get(question.id)
    return {
      question,
      answer,
      skipped: Boolean(answer?.skipped || props.state === 'skipped'),
      summary: optionLabel(question, answer),
    }
  })
})
</script>

<template>
  <AgentLabSketchChoice v-if="choice.questions.length === 1 && ['sketch_references', 'sketch_understanding', 'sketch_notes', 'sketch_prompt'].includes(choice.questions[0]!.id)" :key="choice.id" :choice="choice" :state="state" :answers="answers" :read-only="readOnly" :pending="pending" :reference-images="referenceImages" :source-images="sourceImages" :upload-image="uploadImage" @submit="emit('submit', $event)" @browse-assets="emit('browseAssets')" />
  <AgentLabTextEditor v-else-if="choice.textEdit || choice.textEdits" :key="choice.id" :edit="choice.textEdit" :edits="choice.textEdits" :pending="pending" :read-only="readOnly" :state="state" :answers="answers" @submit="emit('submit', $event)" @skip="emit('skip')" />
  <Card
    v-else
    class="relative w-full gap-4 rounded-2xl border-blue-500/70 py-4 shadow-none"
  >
    <AgentLabCardBorder v-if="isPending && !readOnly" tone="attention" />
    <CardHeader class="gap-1.5 px-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-start gap-2">
            <div class="relative min-w-0 flex-1">
              <CardTitle
                class="text-sm font-medium whitespace-pre-wrap"
                :class="!promptExpanded && choicePromptNeedsExpand ? 'line-clamp-2' : ''"
              >
                {{ choicePrompt || 'A few choices' }}
              </CardTitle>
              <button
                v-if="!promptExpanded && choicePromptNeedsExpand"
                type="button"
                class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Expand prompt"
                @click="promptExpanded = true"
              />
            </div>
            <button
              v-if="choicePromptNeedsExpand"
              type="button"
              class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-expanded="promptExpanded"
              :aria-label="promptExpanded ? 'Collapse prompt' : 'Expand prompt'"
              @click="promptExpanded = !promptExpanded"
            >
              <Icon
                name="lucide:chevron-down"
                class="size-3.5 transition-transform"
                :class="promptExpanded ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        <Badge
          v-if="state === 'skipped'"
          variant="outline"
          class="shrink-0"
        >
          Agent will decide
        </Badge>
        <Badge
          v-else-if="state === 'answered'"
          variant="outline"
          class="shrink-0"
        >
          Saved
        </Badge>
      </div>
      <p v-if="readOnly && isPending" class="text-xs text-muted-foreground">
        Pending
      </p>
      <CardDescription v-if="isPending && recommendation">
        {{ recommendation }}
      </CardDescription>
      <p
        v-else-if="isPending && !readOnly"
        class="text-xs text-muted-foreground"
      >
        Skip any time to let the agent decide.
      </p>
    </CardHeader>

    <CardContent v-if="isPending" class="px-4">
      <div class="flex flex-col gap-5">
        <fieldset
          v-for="question in questions"
          :key="question.id"
          class="min-w-0"
        >
          <legend class="mb-2 flex min-w-0 flex-col gap-0.5">
            <span
              v-if="question.title"
              class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ question.title }}
            </span>
            <div class="flex items-start gap-2">
              <div class="relative min-w-0 flex-1">
                <span
                  class="block text-sm font-medium whitespace-pre-wrap text-foreground"
                  :class="!isQuestionPromptExpanded(question.id) && questionPromptNeedsExpand(question.prompt) ? 'line-clamp-2' : ''"
                >
                  {{ question.prompt }}
                </span>
                <button
                  v-if="!isQuestionPromptExpanded(question.id) && questionPromptNeedsExpand(question.prompt)"
                  type="button"
                  class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Expand question"
                  @click.stop.prevent="toggleQuestionPrompt(question.id)"
                />
              </div>
              <button
                v-if="questionPromptNeedsExpand(question.prompt)"
                type="button"
                class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :aria-expanded="isQuestionPromptExpanded(question.id)"
                :aria-label="isQuestionPromptExpanded(question.id) ? 'Collapse question' : 'Expand question'"
                @click.stop.prevent="toggleQuestionPrompt(question.id)"
              >
                <Icon
                  name="lucide:chevron-down"
                  class="size-3.5 transition-transform"
                  :class="isQuestionPromptExpanded(question.id) ? 'rotate-180' : ''"
                  aria-hidden="true"
                />
              </button>
            </div>
          </legend>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              v-for="option in question.options"
              :key="option.id"
              type="button"
              class="flex min-h-16 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              :class="selectedOption(question)?.id === option.id
                ? 'border-primary bg-primary/10'
                : 'border-border bg-muted/35 hover:bg-accent'"
              :disabled="pending || readOnly || uploading"
              :aria-pressed="selectedOption(question)?.id === option.id"
              @click="selectOption(question, option.id)"
            >
              <span class="flex w-full items-start justify-between gap-2">
                <span class="text-sm font-medium text-foreground">
                  {{ option.label }}
                </span>
                <Badge
                  v-if="question.recommendedId === option.id"
                  variant="outline"
                  class="shrink-0 border-primary/40 text-[10px] text-primary"
                >
                  Suggested
                </Badge>
              </span>
              <span
                v-if="option.description"
                class="text-xs leading-5 text-muted-foreground"
              >
                {{ option.description }}
              </span>
            </button>
          </div>
          <Input
            v-if="selectedOption(question)?.custom"
            :id="`agent-choice-${choice.id}-${question.id}`"
            :model-value="selections[question.id]?.text || ''"
            :disabled="pending || readOnly || uploading"
            class="mt-2 h-10 rounded-xl bg-input/30 shadow-none"
            placeholder="Type your own"
            :aria-label="`Custom answer: ${question.prompt}`"
            @update:model-value="setCustomText(question.id, String($event))"
            @keydown.enter.prevent="emitSubmit()"
          />
        </fieldset>
        <section
          v-if="confirmingLayers && confirmBoxedPreviews.length"
          class="flex min-w-0 flex-col gap-2"
          aria-label="Selection preview with boxes"
        >
          <p class="text-xs text-muted-foreground">
            Selection preview
          </p>
          <div class="flex flex-col gap-3">
            <img
              v-for="(url, index) in confirmBoxedPreviews"
              :key="`${index}-${url}`"
              :src="url"
              :alt="`Boxed selection preview ${index + 1}`"
              class="max-h-80 w-full rounded-xl border border-border object-contain bg-muted/30"
            >
          </div>
        </section>
        <section v-if="annotating" class="flex min-w-0 flex-col gap-3" aria-label="Annotate image edits">
          <div v-if="(sourceImages?.length || 0) > 1" class="flex flex-wrap gap-2" aria-label="Choose image to edit">
            <button v-for="image in sourceImages" :key="image.id" type="button" class="rounded-lg border p-1" :class="sourceUrl === image.url ? 'border-primary' : 'border-border'" :aria-pressed="sourceUrl === image.url" :disabled="pending || readOnly || uploading" @click="sourceUrl = image.url">
              <img :src="image.url" alt="Select image to edit" class="size-16 object-contain">
            </button>
          </div>
          <ToolsImageAnnotationEditor v-if="sourceUrl" :key="sourceUrl" v-model="annotationPoints" :src="sourceUrl" :disabled="pending || readOnly" :reference-images="referenceImages" :upload-image="uploadImage" @uploading="uploading = $event" @browse-assets="emit('browseAssets')" />
          <p v-else role="status" class="text-sm text-muted-foreground">
            Upload a source image in the chat first.
          </p>
        </section>
        <section v-if="drawing && !hideLayerEditor" class="flex min-w-0 flex-col gap-3" aria-label="Select image layers">
          <p class="text-sm text-muted-foreground">
            Draw boxes on each image, then confirm all images together. Your boxes are saved when switching images.
          </p>
          <div v-if="(sourceImages?.length || 0) > 1" class="flex flex-wrap gap-2" aria-label="Source image">
            <button v-for="image in sourceImages" :key="image.id" type="button" class="rounded-lg border p-1" :class="sourceUrl === image.url ? 'border-primary' : 'border-border'" :aria-pressed="sourceUrl === image.url" :disabled="pending || readOnly || selecting" @click="sourceUrl = image.url">
              <img :src="image.url" alt="Select source image" class="size-16 object-contain">
              <span class="block text-xs">{{ regionsByImage[image.url]?.length || 0 }} regions</span>
            </button>
          </div>
          <ToolsImageRegionSelector v-if="sourceUrl" :key="sourceUrl" v-model="regions" :src="sourceUrl" :disabled="pending || readOnly || uploading" @selecting="selecting = $event" />
          <p v-else role="status" class="text-sm text-muted-foreground">
            No source image is available. Upload an image in the chat first.
          </p>
        </section>
      </div>
    </CardContent>

    <CardContent v-else class="px-4">
      <div class="flex flex-col gap-3">
        <div
          v-for="item in resolvedAnswers"
          :key="item.question.id"
          class="min-w-0"
        >
          <p class="text-xs text-muted-foreground">
            {{ item.question.title || item.question.prompt }}
          </p>
          <p class="mt-0.5 text-sm text-foreground">
            {{ item.skipped ? 'Agent will decide' : (item.summary || 'Saved') }}
          </p>
          <div v-if="item.answer?.annotationEdit" class="mt-2 flex flex-col gap-1 text-sm">
            <p v-for="(point, index) in item.answer.annotationEdit.points" :key="index">
              {{ index + 1 }}. {{ point.text }}
            </p>
          </div>
          <p v-if="item.answer?.imageSelections?.length" class="mt-1 text-xs text-muted-foreground">
            {{ item.answer.imageSelections.length }} images · {{ item.answer.imageSelections.reduce((total, selection) => total + selection.regions.length, 0) }} regions confirmed
          </p>
          <p v-else-if="item.answer?.regions?.length" class="mt-1 text-xs text-muted-foreground">
            {{ item.answer.regions.length }} regions confirmed
          </p>
        </div>
      </div>
    </CardContent>

    <CardFooter v-if="isPending && !readOnly" class="justify-end gap-2 border-t border-border px-4 pt-3">
      <Button
        variant="outline"
        size="sm"
        class="rounded-lg shadow-none"
        :disabled="pending || readOnly || uploading"
        @click="emit('skip')"
      >
        Skip
      </Button>
      <Button
        size="sm"
        class="rounded-lg shadow-none"
        :disabled="!canSubmit"
        @click="emitSubmit"
      >
        <Spinner v-if="pending" />
        {{ annotating ? 'Confirm edits' : drawing ? `Confirm ${imageSelections.length} image${imageSelections.length === 1 ? '' : 's'}` : 'Continue' }}
      </Button>
    </CardFooter>
  </Card>
</template>
