<script setup lang="ts">
import type { AssetLibraryAssetPublic } from '~~/shared/types/assetLibrary'
import { Check, Pencil, X } from 'lucide-vue-next'
import { isMediaAudioUrl, isMediaVideoUrl } from '~~/shared/utils/seedance25'

const props = defineProps<{
  asset: AssetLibraryAssetPublic
  deleting?: boolean
  renaming?: boolean
}>()

const emit = defineEmits<{
  delete: []
  open: []
  rename: [name: string]
}>()

const isVideo = computed(() => props.asset.kind === 'video' || isMediaVideoUrl(props.asset.url))
const isAudio = computed(() => props.asset.kind === 'audio' || isMediaAudioUrl(props.asset.url))

const editing = ref(false)
const draft = ref('')
const inputRef = ref<{ $el?: HTMLInputElement } | null>(null)

watch(() => props.asset.name, (name, previous) => {
  if (editing.value && previous !== undefined && previous !== name) {
    editing.value = false
    draft.value = name
    return
  }
  if (!editing.value)
    draft.value = name
})

async function startEdit() {
  if (props.deleting || props.renaming)
    return
  draft.value = props.asset.name
  editing.value = true
  await nextTick()
  const el = inputRef.value?.$el
  el?.focus()
  el?.select()
}

function cancelEdit() {
  if (props.renaming)
    return
  editing.value = false
  draft.value = props.asset.name
}

function saveEdit() {
  if (props.renaming)
    return
  const name = draft.value.trim()
  if (!name || name === props.asset.name) {
    cancelEdit()
    return
  }
  emit('rename', name)
}

</script>

<template>
  <article class="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none">
    <button
      type="button"
      class="relative aspect-4/3 w-full overflow-hidden bg-muted/35 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @click="emit('open')"
    >
      <img
        v-if="!isVideo && !isAudio"
        :src="asset.url"
        :alt="asset.name"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <video
        v-else-if="isVideo"
        :src="asset.url"
        class="h-full w-full object-cover"
        muted
        playsinline
        preload="metadata"
      />
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-2 px-3 text-muted-foreground"
      >
        <Icon name="i-lucide-audio-lines" class="size-8" />
        <span class="line-clamp-2 text-center text-xs">{{ asset.name }}</span>
      </div>
      <span
        class="absolute left-2 top-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {{ asset.kind }}
      </span>
    </button>
    <div class="flex min-h-10 items-center gap-1 px-2 py-2">
      <template v-if="editing">
        <Input
          ref="inputRef"
          v-model="draft"
          maxlength="120"
          :disabled="renaming"
          class="h-8 min-w-0 flex-1 rounded-lg bg-input/30 px-2 text-sm shadow-none"
          aria-label="Asset name"
          @keydown.enter.prevent="saveEdit"
          @keydown.escape.prevent="cancelEdit"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0 rounded-lg text-emerald-500 shadow-none hover:text-emerald-400"
          :disabled="renaming || !draft.trim()"
          aria-label="Save name"
          @click="saveEdit"
        >
          <Spinner v-if="renaming" class="size-4" />
          <Check v-else class="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0 rounded-lg shadow-none"
          :disabled="renaming"
          aria-label="Cancel rename"
          @click="cancelEdit"
        >
          <X class="size-4" />
        </Button>
      </template>
      <template v-else>
        <p class="min-w-0 flex-1 truncate px-1 text-sm font-medium">
          {{ asset.name }}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0 rounded-lg shadow-none opacity-70 group-hover:opacity-100"
          :disabled="deleting"
          :aria-label="`Rename ${asset.name}`"
          @click="startEdit"
        >
          <Pencil class="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="shrink-0 rounded-lg shadow-none"
          :disabled="deleting"
          :aria-label="`Delete ${asset.name}`"
          @click="emit('delete')"
        >
          <Spinner v-if="deleting" class="size-4" />
          <Icon v-else name="i-lucide-trash-2" class="size-4" />
        </Button>
      </template>
    </div>
  </article>
</template>
