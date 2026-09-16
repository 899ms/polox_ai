<script setup lang="ts">
import type { AssetLibraryPublic } from '~~/shared/types/assetLibrary'

const props = withDefaults(defineProps<{
  library: AssetLibraryPublic
  showActions?: boolean
}>(), {
  showActions: true,
})

const emit = defineEmits<{
  edit: []
  delete: []
}>()

const coverStyle = computed(() => {
  if (!props.library.coverUrl)
    return undefined
  return { backgroundImage: `url(${props.library.coverUrl})` }
})
</script>

<template>
  <article class="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none transition-colors duration-150 hover:bg-accent">
    <NuxtLink
      :to="`/libraries/${library.id}`"
      class="flex min-w-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        class="aspect-4/3 bg-muted/35 bg-cover bg-center"
        :style="coverStyle"
      >
        <div
          v-if="!library.coverUrl"
          class="flex h-full items-center justify-center text-muted-foreground"
        >
          <Icon
            name="i-lucide-library"
            class="size-8"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1 p-4 pb-2">
        <h3 class="flex min-w-0 items-center gap-1.5 text-base font-medium text-foreground">
          <span class="truncate">{{ library.name }}</span>
        </h3>
        <p
          v-if="library.description"
          class="line-clamp-2 text-sm text-muted-foreground"
        >
          {{ library.description }}
        </p>
      </div>
    </NuxtLink>
    <div class="flex min-h-8 items-center justify-between gap-2 px-4 pb-4">
      <p class="min-w-0 truncate text-sm text-muted-foreground">
        {{ library.assetCount }} {{ library.assetCount === 1 ? 'asset' : 'assets' }}
      </p>
      <DropdownMenu
        v-if="showActions"
        :modal="false"
      >
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="shrink-0 rounded-lg shadow-none"
            :aria-label="`Actions for ${library.name}`"
          >
            <Icon
              name="i-lucide-ellipsis-vertical"
              class="size-4"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-36">
          <DropdownMenuItem @click="emit('edit')">
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            @click="emit('delete')"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </article>
</template>
