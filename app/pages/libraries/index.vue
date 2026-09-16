<script setup lang="ts">
import type { AssetLibraryPublic } from '~~/shared/types/assetLibrary'
import {
  ASSET_LIBRARY_DELETE_CONFIRMATION,
  ASSET_LIBRARY_DESCRIPTION_MAX,
  ASSET_LIBRARY_NAME_MAX,
  nextAssetLibraryTitle,
} from '~~/shared/types/assetLibrary'
import { toast } from 'vue-sonner'
import { readErrorMessage } from '~~/shared/utils/apiError'
import AssetLibraryCard from '@/components/asset-libraries/AssetLibraryCard.vue'
import AssetLibraryDeleteDialog from '@/components/asset-libraries/AssetLibraryDeleteDialog.vue'

const { public: publicConfig } = useRuntimeConfig()
const { libraries, loaded, loadLibraries } = useAssetLibraries()

useSeoMeta({
  title: `Asset Libraries · ${publicConfig.brandName}`,
  description: 'Shared libraries you can @-mention from any project',
})

const createOpen = ref(false)
const creating = ref(false)
const createName = ref('')
const createDescription = ref('')

const editOpen = ref(false)
const editing = ref(false)
const editingLibrary = ref<AssetLibraryPublic | null>(null)
const editName = ref('')
const editDescription = ref('')

const deleteOpen = ref(false)
const deleting = ref(false)
const deletingLibrary = ref<AssetLibraryPublic | null>(null)

onMounted(() => {
  void loadLibraries()
})

function openCreate() {
  createName.value = nextAssetLibraryTitle(libraries.value.map(library => library.name))
  createDescription.value = ''
  createOpen.value = true
}

function openEdit(library: AssetLibraryPublic) {
  editingLibrary.value = library
  editName.value = library.name
  editDescription.value = library.description
  editOpen.value = true
}

function openDelete(library: AssetLibraryPublic) {
  deletingLibrary.value = library
  deleteOpen.value = true
}

async function submitCreate() {
  if (creating.value)
    return

  creating.value = true
  try {
    const library = await $fetch<AssetLibraryPublic>('/api/asset-libraries', {
      method: 'POST',
      body: {
        name: createName.value,
        description: createDescription.value,
      },
    })
    libraries.value = [library, ...libraries.value.filter(item => item.id !== library.id)]
    createOpen.value = false
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not create the asset library'))
  }
  finally {
    creating.value = false
  }
}

async function submitEdit() {
  if (editing.value || !editingLibrary.value)
    return

  editing.value = true
  try {
    const library = await $fetch<AssetLibraryPublic>(`/api/asset-libraries/${editingLibrary.value.id}`, {
      method: 'PATCH',
      body: {
        name: editName.value,
        description: editDescription.value,
      },
    })
    libraries.value = libraries.value.map(item => item.id === library.id
      ? {
          ...item,
          ...library,
          assetCount: library.assetCount || item.assetCount,
          coverUrl: library.coverUrl || item.coverUrl,
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

async function confirmDelete() {
  if (deleting.value || !deletingLibrary.value)
    return

  deleting.value = true
  try {
    await $fetch(`/api/asset-libraries/${deletingLibrary.value.id}`, {
      method: 'DELETE',
      body: {
        confirmation: ASSET_LIBRARY_DELETE_CONFIRMATION,
      },
    })
    const removedId = deletingLibrary.value.id
    libraries.value = libraries.value.filter(item => item.id !== removedId)
    deleteOpen.value = false
    await loadLibraries()
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not delete the asset library'))
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1128px] flex-col gap-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <p class="text-sm text-muted-foreground">
          Asset Libraries
        </p>
        <h1 class="text-2xl font-semibold tracking-tight">
          Asset Libraries
        </h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          Higher-level libraries you can @-mention from any project. Library contents come next.
        </p>
      </div>
      <Button
        type="button"
        class="h-9 shrink-0 rounded-lg px-3 shadow-none"
        @click="openCreate"
      >
        New library
      </Button>
    </div>

    <div
      v-if="!loaded && libraries.length === 0"
      class="flex justify-center py-12"
    >
      <Spinner class="size-6 text-muted-foreground" />
    </div>

    <p
      v-else-if="libraries.length === 0"
      class="rounded-2xl border border-border bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground"
    >
      No asset libraries yet.
    </p>

    <div
      v-else
      class="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <AssetLibraryCard
        v-for="library in libraries"
        :key="library.id"
        :library="library"
        @edit="openEdit(library)"
        @delete="openDelete(library)"
      />
    </div>

    <Dialog v-model:open="createOpen">
      <DialogContent class="rounded-2xl border-border bg-card shadow-none sm:max-w-md">
        <DialogHeader class="gap-1">
          <DialogTitle>
            New asset library
          </DialogTitle>
          <DialogDescription>
            Give this library a title. A description is optional.
          </DialogDescription>
        </DialogHeader>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="submitCreate"
        >
          <FieldGroup>
            <Field>
              <FieldLabel html-for="asset-library-name">
                Title
              </FieldLabel>
              <Input
                id="asset-library-name"
                v-model="createName"
                :maxlength="ASSET_LIBRARY_NAME_MAX"
                required
                class="h-9 rounded-xl bg-input/30 shadow-none"
              />
            </Field>
            <Field>
              <FieldLabel html-for="asset-library-description">
                Description
                <span class="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id="asset-library-description"
                v-model="createDescription"
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
              :disabled="creating"
              @click="createOpen = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              class="h-8 rounded-lg px-3 text-xs shadow-none"
              :disabled="creating"
            >
              {{ creating ? 'Creating…' : 'Create' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

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
              <FieldLabel html-for="edit-asset-library-name">
                Title
              </FieldLabel>
              <Input
                id="edit-asset-library-name"
                v-model="editName"
                :maxlength="ASSET_LIBRARY_NAME_MAX"
                required
                class="h-9 rounded-xl bg-input/30 shadow-none"
              />
            </Field>
            <Field>
              <FieldLabel html-for="edit-asset-library-description">
                Description
                <span class="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id="edit-asset-library-description"
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

    <AssetLibraryDeleteDialog
      :open="deleteOpen"
      :pending="deleting"
      :library-name="deletingLibrary?.name"
      @update:open="deleteOpen = $event"
      @confirm="confirmDelete"
    />
  </div>
</template>
