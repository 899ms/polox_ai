<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{ skill: { name: string, description: string }, removable?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <span :title="skill.description" class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 align-middle text-xs font-medium text-foreground">
    <Icon name="lucide:images" class="size-4 shrink-0" />
    <span class="truncate">{{ skill.name }}</span>
    <span class="text-[10px] font-normal text-muted-foreground">Skill</span>
    <button v-if="removable" type="button" :disabled="disabled" :aria-label="`Remove ${skill.name} skill`" class="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" @click="emit('remove')">
      <X class="size-3" />
    </button>
  </span>
</template>
