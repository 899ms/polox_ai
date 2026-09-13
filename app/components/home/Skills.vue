<script setup lang="ts">
import { ArrowRight, Ellipsis } from 'lucide-vue-next'
import { PUBLIC_AGENT_SKILLS } from '~~/shared/utils/agentSkills'

const emit = defineEmits<{ select: [skillId: string] }>()

const skills = [...PUBLIC_AGENT_SKILLS].sort((a, b) => Number(a.id === 'product-hunt-gallery') - Number(b.id === 'product-hunt-gallery'))
</script>

<template>
  <section aria-labelledby="home-skills-heading" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <h2 id="home-skills-heading" class="text-2xl font-semibold tracking-tight md:text-3xl">
        Skills
      </h2>
      <p class="text-sm text-muted-foreground">
        Bring your ideas to life with AI-powered creative workflows.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink
        v-for="skill in skills"
        :key="skill.id"
        :to="{ path: '/', query: { agentSkill: skill.id }, hash: '#generator' }"
        :aria-label="`Use ${skill.name} skill`"
        class="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-none transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click.prevent="emit('select', skill.id)"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/45">
            <Icon :name="skill.icon" class="size-5 text-foreground" aria-hidden="true" />
          </div>
          <ArrowRight class="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
        </div>
        <h3 class="text-base font-medium text-foreground">
          {{ skill.name }}
        </h3>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ skill.description }}
        </p>
      </NuxtLink>
      <div class="flex flex-col rounded-2xl border border-dashed border-border bg-card/50 p-5">
        <div class="mb-4 flex size-9 items-center justify-center rounded-lg border border-border bg-muted/45">
          <Ellipsis class="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 class="text-base font-medium text-muted-foreground">
          更多技能即将到来
        </h3>
      </div>
    </div>
  </section>
</template>
