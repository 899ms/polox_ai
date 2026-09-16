<script setup lang="ts">
const props = defineProps<{
  count?: number
  open: boolean
  pending?: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'confirm': []
}>()

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
          {{ count && count > 1 ? `Delete ${count} assets?` : 'Delete asset' }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ count && count > 1
            ? 'This cannot be undone. These assets will be removed from this project and cannot be recovered.'
            : 'This cannot be undone. The asset will be removed from this project and cannot be recovered.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="rounded-lg shadow-none" :disabled="pending">
          Cancel
        </AlertDialogCancel>
        <Button
          class="rounded-lg bg-destructive text-white shadow-none hover:bg-destructive/90"
          :disabled="pending"
          @click="emit('confirm')"
        >
          <Spinner v-if="pending" class="size-4" />
          Delete
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
