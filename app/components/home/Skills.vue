<script setup lang="ts">
import { ArrowRight, FolderKanban, WandSparkles } from 'lucide-vue-next'
import { mergeAgentSkillCatalog, PUBLIC_AGENT_SKILLS, type CatalogAgentSkill } from '~~/shared/utils/agentSkills'

const emit = defineEmits<{ select: [skillId: string] }>()

const { data } = await useFetch<{
  catalog?: CatalogAgentSkill[]
  userSkills?: Array<{ id: string, name: string, description: string, keywords?: string, enabled: boolean }>
}>('/api/skills', { default: () => ({ catalog: [], userSkills: [] }) })

const skills = computed(() => {
  const merged = data.value?.catalog?.length
    ? data.value.catalog
    : mergeAgentSkillCatalog((data.value?.userSkills || []).map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        keywords: skill.keywords,
        icon: 'lucide:sparkles',
        source: 'user' as const,
        enabled: skill.enabled,
      })))
  return [...merged].sort((a, b) => {
    const pinned = ['product-hunt-gallery', 'app-store-graphics', 'skill-creator']
    return Number(pinned.includes(a.id)) - Number(pinned.includes(b.id))
  })
})

function coverFor(skill: CatalogAgentSkill) {
  return skill.cover || PUBLIC_AGENT_SKILLS.find(item => item.id === skill.id)?.cover || '/brand/skills/skill-creator.svg'
}

function coverAltFor(skill: CatalogAgentSkill) {
  return skill.coverAlt || skill.name
}
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

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <NuxtLink
        v-for="skill in skills.filter(item => item.id !== 'skill-creator')"
        :key="skill.id"
        :to="{ path: '/', query: { agentSkill: skill.id }, hash: '#generator' }"
        :aria-label="`Use ${skill.name} skill`"
        class="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click.prevent="emit('select', skill.id)"
      >
        <div class="relative aspect-[4/3] overflow-hidden bg-muted">
          <img
            :src="coverFor(skill)"
            :alt="coverAltFor(skill)"
            width="720"
            height="540"
            loading="lazy"
            decoding="async"
            class="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          >
        </div>
        <div class="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2 md:px-3.5 md:pb-3.5 md:pt-2.5">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-base font-medium text-foreground">
              {{ skill.name }}
            </h3>
            <ArrowRight class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
          </div>
          <p class="text-sm leading-relaxed text-muted-foreground">
            {{ skill.description }}
          </p>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/skills/workshop"
        aria-label="Create a custom skill"
        class="group flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 shadow-none transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/50">
          <WandSparkles class="size-8 text-muted-foreground/80 transition-colors group-hover:text-foreground" aria-hidden="true" />
        </div>
        <div class="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2 md:px-3.5 md:pb-3.5 md:pt-2.5">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-base font-medium text-foreground">
              Create Skill
            </h3>
            <span class="mt-0.5 shrink-0 rounded-md border border-border bg-muted/45 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
              New
            </span>
          </div>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Author an L1 skill that orchestrates existing tools — no custom code or UI.
          </p>
        </div>
      </NuxtLink>

      <NuxtLink
        to="/skills"
        aria-label="Manage my skills"
        class="group flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 shadow-none transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/50">
          <FolderKanban class="size-8 text-muted-foreground/80 transition-colors group-hover:text-foreground" aria-hidden="true" />
        </div>
        <div class="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2 md:px-3.5 md:pb-3.5 md:pt-2.5">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-base font-medium text-foreground">
              Skills
            </h3>
            <ArrowRight class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
          </div>
          <p class="text-sm leading-relaxed text-muted-foreground">
            Enable, edit, or delete the custom skills you have saved.
          </p>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>
