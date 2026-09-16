<script setup lang="ts">
import { ASSET_LIBRARY_DELETE_CONFIRMATION } from '~~/shared/types/assetLibrary'

const props = defineProps<{
  open: boolean
  pending?: boolean
  libraryName?: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'confirm': []
}>()

const confirmation = ref('')
const canDelete = computed(() => confirmation.value.trim() === ASSET_LIBRARY_DELETE_CONFIRMATION)

watch(() => props.open, (open) => {
  if (open)
    confirmation.value = ''
})

function onOpenChange(open: boolean) {
  if (props.pending && !open)
    return
  emit('update:open', open)
}
</script>

<template>
  <AlertDialog :open="open" @update:open="onOpenChange">
    <AlertDialogContent class="rounded-2xl border-border bg-card shadow-none sm:max-w-md">
      <AlertDialogHeader class="gap-2">
        <AlertDialogTitle>
          Delete this asset library?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This cannot be undone. {{ libraryName || 'This library' }} and its assets will be removed.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-2">
        <Label for="delete-asset-library-confirmation">
          Type {{ ASSET_LIBRARY_DELETE_CONFIRMATION }} to confirm
        </Label>
        <Input
          id="delete-asset-library-confirmation"
          v-model="confirmation"
          :disabled="pending"
          autocomplete="off"
          autofocus
          class="h-9 rounded-xl bg-input/30 shadow-none"
          :placeholder="ASSET_LIBRARY_DELETE_CONFIRMATION"
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel class="rounded-lg shadow-none" :disabled="pending">
          Cancel
        </AlertDialogCancel>
        <Button
          class="rounded-lg bg-destructive text-white shadow-none hover:bg-destructive/90 disabled:opacity-40"
          :disabled="pending || !canDelete"
          @click="emit('confirm')"
        >
          <Spinner v-if="pending" class="size-4" />
          Delete library
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
