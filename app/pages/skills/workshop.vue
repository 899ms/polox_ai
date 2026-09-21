<script setup lang="ts">
const { createDraftAndOpenEditor } = useSkillCreatorLaunch()

await createDraftAndOpenEditor({
  autosend: false,
  placeholder: 'Describe the skill you want to create…',
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
    Opening Skill Creator…
  </div>
</template>
