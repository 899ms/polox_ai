<script setup lang="ts">
import type { AssetLibraryPublic } from '~~/shared/types/assetLibrary'
import { Plus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { readErrorMessage } from '~~/shared/utils/apiError'

const props = defineProps<{
  count?: number
  open: boolean
  pending?: boolean
  libraries: AssetLibraryPublic[]
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'confirm': [libraryId: string]
  'created': [library: AssetLibraryPublic]
}>()

const targetLibraryId = ref('')
const creating = ref(false)
const canSave = computed(() => Boolean(targetLibraryId.value))

watch(() => props.open, (open) => {
  if (!open)
    return
  creating.value = false
  targetLibraryId.value = props.libraries[0]?.id || ''
})

watch(() => props.libraries.map(library => library.id).join(), () => {
  if (!props.open)
    return
  if (targetLibraryId.value && props.libraries.some(library => library.id === targetLibraryId.value))
    return
  targetLibraryId.value = props.libraries[0]?.id || ''
})

function onOpenChange(open: boolean) {
  if ((props.pending || creating.value) && !open)
    return
  emit('update:open', open)
}

function onConfirm() {
  if (!canSave.value || props.pending || creating.value)
    return
  emit('confirm', targetLibraryId.value)
}

async function onCreateLibrary() {
  if (creating.value || props.pending)
    return
  creating.value = true
  try {
    const library = await $fetch<AssetLibraryPublic>('/api/asset-libraries', {
      method: 'POST',
      body: {},
    })
    emit('created', library)
    targetLibraryId.value = library.id
  }
  catch (error) {
    toast.error(readErrorMessage(error, 'Could not create the library'))
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <AlertDialog :open="open" @update:open="onOpenChange">
    <AlertDialogContent class="rounded-2xl border-border bg-card shadow-none sm:max-w-md">
      <AlertDialogHeader class="gap-2">
        <AlertDialogTitle>
          Save to asset library?
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ count && count > 1
            ? `${count} assets will be added to the library you select. They stay in this project.`
            : 'This asset will be added to the library you select. It stays in this project.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid max-h-64 gap-2 overflow-y-auto">
        <button
          type="button"
          class="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-left text-sm font-normal transition-colors hover:bg-muted/40 disabled:opacity-50"
          :disabled="pending || creating"
          @click="onCreateLibrary"
        >
          <Spinner v-if="creating" class="size-4 shrink-0" />
          <Plus v-else class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">Create new library</span>
        </button>

        <RadioGroup
          v-if="libraries.length"
          :model-value="targetLibraryId"
          class="grid gap-2"
          @update:model-value="targetLibraryId = String($event)"
        >
          <div
            v-for="library in libraries"
            :key="library.id"
            class="flex items-center gap-2 rounded-lg border border-border bg-muted/35 px-3 py-2"
          >
            <RadioGroupItem :id="`import-library-${library.id}`" :value="library.id" :disabled="pending || creating" />
            <Label
              :for="`import-library-${library.id}`"
              class="min-w-0 flex-1 truncate font-normal"
            >
              {{ library.name }}
            </Label>
          </div>
        </RadioGroup>

        <p
          v-else
          class="px-1 text-sm text-muted-foreground"
        >
          No libraries yet. Create one above, then save.
        </p>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel class="rounded-lg shadow-none" :disabled="pending || creating">
          Cancel
        </AlertDialogCancel>
        <Button
          class="rounded-lg shadow-none"
          :disabled="pending || creating || !canSave"
          @click="onConfirm"
        >
          <Spinner v-if="pending" class="size-4" />
          Save
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
