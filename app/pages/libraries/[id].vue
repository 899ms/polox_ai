<script setup lang="ts">
import type { AssetLibraryAssetPublic, AssetLibraryPublic } from '~~/shared/types/assetLibrary'
import {
  ASSET_LIBRARY_ACCEPT_ATTR,
  ASSET_LIBRARY_DESCRIPTION_MAX,
  ASSET_LIBRARY_EXTENSION_RE,
  ASSET_LIBRARY_NAME_MAX,
  isAssetLibraryAcceptFile,
} from '~~/shared/types/assetLibrary'
import { ArrowLeft, Pencil } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { readErrorMessage } from '~~/shared/utils/apiError'
import AssetLibraryMediaCard from '@/components/asset-libraries/AssetLibraryMediaCard.vue'

const route = useRoute()
const { public: publicConfig } = useRuntimeConfig()
const { libraries } = useAssetLibraries()
const libraryId = computed(() => String(route.params.id || ''))

const library = ref<AssetLibraryPublic | null>(null)
const assets = ref<AssetLibraryAssetPublic[]>([])
const loading = ref(true)
const importing = ref(false)
const deletingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dropActive = ref(false)
let dragDepth = 0

const editOpen = ref(false)
const editing = ref(false)
const editName = ref('')
const editDescription = ref('')

const deleteOpen = ref(false)
const pendingDelete = ref<AssetLibraryAssetPublic | null>(null)

useSeoMeta({
  title: computed(() => `${library.value?.name || 'Asset Library'} · ${publicConfig.brandName}`),
  description: 'Import shared media you can @-mention from any project',
})

async function load() {
  if (!libraryId.value)
    return
  loading.value = true
  try {
    const [meta, list] = await Promise.all([
      $fetch<AssetLibraryPublic>(`/api/asset-libraries/${libraryId.value}`),
      $fetch<{ items: AssetLibraryAssetPublic[] }>(`/api/asset-libraries/${libraryId.value}/assets`),
    ])
    library.value = meta
    assets.value = list.items
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not load this asset library'))
    library.value = null
    assets.value = []
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(libraryId, () => {
  void load()
})

function openPicker() {
  fileInput.value?.click()
}

function openEdit() {
  if (!library.value)
    return
  editName.value = library.value.name
  editDescription.value = library.value.description
  editOpen.value = true
}

async function submitEdit() {
  if (editing.value || !library.value || !libraryId.value)
    return

  editing.value = true
  try {
    const updated = await $fetch<AssetLibraryPublic>(`/api/asset-libraries/${libraryId.value}`, {
      method: 'PATCH',
      body: {
        name: editName.value,
        description: editDescription.value,
      },
    })
    library.value = {
      ...library.value,
      ...updated,
      assetCount: updated.assetCount || library.value.assetCount,
      coverUrl: updated.coverUrl || library.value.coverUrl,
    }
    libraries.value = libraries.value.map(item => item.id === updated.id
      ? {
          ...item,
          ...updated,
          assetCount: updated.assetCount || item.assetCount,
          coverUrl: updated.coverUrl || item.coverUrl,
        }
      : item)
    editOpen.value = false
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not update the asset library'))
  }
  finally {
    editing.value = false
  }
}

function filesFromList(list: FileList | File[] | null | undefined) {
  if (!list)
    return [] as File[]
  return [...list].filter(file => isAssetLibraryAcceptFile(file) || ASSET_LIBRARY_EXTENSION_RE.test(file.name))
}

async function importFiles(fileList: File[]) {
  const files = filesFromList(fileList)
  if (!files.length) {
    toast.error('Use image, video, or audio types supported on the canvas')
    return
  }
  if (!libraryId.value || importing.value)
    return

  importing.value = true
  let failed = 0
  try {
    for (const file of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        const uploaded = await $fetch<{ url: string, duration?: number }>('/api/uploads', {
          method: 'POST',
          body: form,
        })
        const asset = await $fetch<AssetLibraryAssetPublic>(`/api/asset-libraries/${libraryId.value}/assets`, {
          method: 'POST',
          body: {
            url: uploaded.url,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            duration: uploaded.duration,
          },
        })
        assets.value = [asset, ...assets.value.filter(item => item.id !== asset.id)]
      }
      catch {
        failed += 1
      }
    }
    if (library.value)
      library.value = { ...library.value, assetCount: assets.value.length, coverUrl: assets.value.find(item => item.kind === 'image')?.url || library.value.coverUrl }
    if (failed)
      toast.error(`${failed} file${failed === 1 ? '' : 's'} could not be imported`)
  }
  finally {
    importing.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  void importFiles(filesFromList(input.files))
  input.value = ''
}

function onDragEnter(event: DragEvent) {
  if (![...(event.dataTransfer?.types || [])].includes('Files'))
    return
  event.preventDefault()
  dragDepth += 1
  dropActive.value = true
}

function onDragOver(event: DragEvent) {
  if (![...(event.dataTransfer?.types || [])].includes('Files'))
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'copy'
  dropActive.value = true
}

function onDragLeave(event: DragEvent) {
  if (![...(event.dataTransfer?.types || [])].includes('Files'))
    return
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth)
    dropActive.value = false
}

function onDrop(event: DragEvent) {
  if (![...(event.dataTransfer?.types || [])].includes('Files'))
    return
  event.preventDefault()
  dragDepth = 0
  dropActive.value = false
  void importFiles(filesFromList(event.dataTransfer?.files))
}

function onDeleteOpenChange(open: boolean) {
  if (deletingId.value && !open)
    return
  deleteOpen.value = open
  if (!open)
    pendingDelete.value = null
}

async function onRename(asset: AssetLibraryAssetPublic, name: string) {
  if (renamingId.value || deletingId.value || !libraryId.value)
    return
  renamingId.value = asset.id
  try {
    const updated = await $fetch<AssetLibraryAssetPublic>(`/api/asset-libraries/${libraryId.value}/assets/${asset.id}`, {
      method: 'PATCH',
      body: { name },
    })
    assets.value = assets.value.map(item => item.id === updated.id ? { ...item, ...updated } : item)
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not rename this asset'))
  }
  finally {
    renamingId.value = null
  }
}

function requestDelete(asset: AssetLibraryAssetPublic) {
  if (deletingId.value)
    return
  pendingDelete.value = asset
  deleteOpen.value = true
}

async function confirmDelete() {
  const asset = pendingDelete.value
  if (!asset || deletingId.value || !libraryId.value)
    return
  deletingId.value = asset.id
  try {
    await $fetch(`/api/asset-libraries/${libraryId.value}/assets/${asset.id}`, { method: 'DELETE' })
    assets.value = assets.value.filter(item => item.id !== asset.id)
    if (library.value)
      library.value = { ...library.value, assetCount: assets.value.length, coverUrl: assets.value.find(item => item.kind === 'image')?.url || '' }
    deleteOpen.value = false
    pendingDelete.value = null
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not delete this asset'))
  }
  finally {
    deletingId.value = null
  }
}

const { open: openLightbox } = useMediaLightbox()

function onOpen(asset: AssetLibraryAssetPublic) {
  openLightbox({
    url: asset.url,
    kind: asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image',
    alt: asset.name,
  })
}
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-[1128px] flex-col gap-5"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex min-w-0 flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-8 w-fit gap-1 rounded-lg px-2 shadow-none"
          @click="navigateTo('/libraries')"
        >
          <ArrowLeft class="size-3.5" />
          Asset Libraries
        </Button>
        <div class="flex flex-col gap-1">
          <p class="text-sm text-muted-foreground">
            Asset Libraries / {{ library?.name || '…' }}
          </p>
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="min-w-0 truncate text-2xl font-semibold tracking-tight">
              {{ library?.name || 'Asset Library' }}
            </h1>
            <Button
              v-if="library"
              type="button"
              variant="ghost"
              size="icon-sm"
              class="shrink-0 rounded-lg shadow-none"
              aria-label="Edit library"
              @click="openEdit"
            >
              <Pencil class="size-4" />
            </Button>
          </div>
          <p
            v-if="library?.description"
            class="max-w-2xl text-sm text-muted-foreground"
          >
            {{ library.description }}
          </p>
        </div>
      </div>
      <Button
        type="button"
        class="h-9 shrink-0 rounded-lg px-3 shadow-none"
        :disabled="importing || loading || !library"
        @click="openPicker"
      >
        <Spinner v-if="importing" class="size-4" />
        Import media
      </Button>
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        multiple
        :accept="ASSET_LIBRARY_ACCEPT_ATTR"
        @change="onFileChange"
      >
    </div>

    <div
      class="rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition-colors"
      :class="dropActive ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-muted/20 text-muted-foreground'"
    >
      {{ dropActive ? 'Drop to import' : 'Drag and drop images, videos, or audio here — same types the canvas supports.' }}
    </div>

    <div
      v-if="loading && !library"
      class="flex justify-center py-12"
    >
      <Spinner class="size-6 text-muted-foreground" />
    </div>

    <p
      v-else-if="!library"
      class="rounded-2xl border border-border bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground"
    >
      This asset library could not be found.
    </p>

    <p
      v-else-if="!assets.length"
      class="rounded-2xl border border-border bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground"
    >
      No media yet. Import files to build this library.
    </p>

    <div
      v-else
      class="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <AssetLibraryMediaCard
        v-for="asset in assets"
        :key="asset.id"
        :asset="asset"
        :deleting="deletingId === asset.id"
        :renaming="renamingId === asset.id"
        @delete="requestDelete(asset)"
        @rename="onRename(asset, $event)"
        @open="onOpen(asset)"
      />
    </div>

    <Dialog v-model:open="editOpen">
      <DialogContent class="rounded-2xl border-border bg-card shadow-none sm:max-w-md">
        <DialogHeader class="gap-1">
          <DialogTitle>
            Edit asset library
          </DialogTitle>
          <DialogDescription>
            Update the title and description.
          </DialogDescription>
        </DialogHeader>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="submitEdit"
        >
          <FieldGroup>
            <Field>
              <FieldLabel html-for="edit-library-name">
                Title
              </FieldLabel>
              <Input
                id="edit-library-name"
                v-model="editName"
                :maxlength="ASSET_LIBRARY_NAME_MAX"
                required
                class="h-9 rounded-xl bg-input/30 shadow-none"
              />
            </Field>
            <Field>
              <FieldLabel html-for="edit-library-description">
                Description
                <span class="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id="edit-library-description"
                v-model="editDescription"
                rows="3"
                :maxlength="ASSET_LIBRARY_DESCRIPTION_MAX"
                placeholder="What this library is for"
                class="min-h-20 rounded-xl bg-input/30 shadow-none"
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              class="h-8 rounded-lg px-3 text-xs shadow-none"
              :disabled="editing"
              @click="editOpen = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              class="h-8 rounded-lg px-3 text-xs shadow-none"
              :disabled="editing"
            >
              {{ editing ? 'Saving…' : 'Save' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="deleteOpen" @update:open="onDeleteOpenChange">
      <AlertDialogContent class="rounded-2xl border-border bg-card shadow-none sm:max-w-md">
        <AlertDialogHeader class="gap-2">
          <AlertDialogTitle>
            Delete this asset?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. {{ pendingDelete?.name || 'This file' }} will be removed from the library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel class="rounded-lg shadow-none" :disabled="Boolean(deletingId)">
            Cancel
          </AlertDialogCancel>
          <Button
            class="rounded-lg bg-destructive text-white shadow-none hover:bg-destructive/90"
            :disabled="Boolean(deletingId)"
            @click="confirmDelete"
          >
            <Spinner v-if="deletingId" class="size-4" />
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
