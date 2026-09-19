<script setup lang="ts">
import type { FrontierModelCard } from '@/constants/aiModels'
import { AGENT_MODELS, publicAgentModels } from '~~/shared/utils/agentModels'
import { PUBLIC_AGENT_SKILLS } from '~~/shared/utils/agentSkills'
import HomeFrontierModels from '@/components/home/FrontierModels.vue'
import HomeRecentProjects from '@/components/home/RecentProjects.vue'
import HomeUsefulTools from '@/components/home/UsefulTools.vue'

const { public: publicConfig } = useRuntimeConfig()
const route = useRoute()
const { selectHomeAgent } = useAgentWorkspaceNav()

const agentComposer = useTemplateRef('agentComposer')

async function selectAgentModel(modelId: string) {
  selectHomeAgent()
  await nextTick()
  await agentComposer.value?.mentionModel(modelId)
  document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function selectAgentSkill(skillId: string) {
  selectHomeAgent()
  await nextTick()
  await agentComposer.value?.mentionSkill(skillId)
  document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  selectHomeAgent()
  watch(() => route.query.agentSkill, async (skillId) => {
    if (typeof skillId !== 'string' || !PUBLIC_AGENT_SKILLS.some(skill => skill.id === skillId))
      return
    const { agentSkill: _agentSkill, ...query } = route.query
    await navigateTo({ path: '/', query, hash: route.hash }, { replace: true })
    await selectAgentSkill(skillId)
  }, { immediate: true })
  watch(() => route.query.agentTask, async (task) => {
    if (task !== 'image-to-image' && task !== 'reference-to-video')
      return
    const { agentTask: _agentTask, ...query } = route.query
    await navigateTo({ path: '/', query, hash: route.hash }, { replace: true })
    selectHomeAgent()
    await nextTick()
    document.getElementById('generator')?.scrollIntoView({ behavior: 'instant', block: 'start' })
    await agentComposer.value?.mentionTask(task)
  }, { immediate: true })
  watch(() => route.query.agentModel || route.query.model, async (modelId) => {
    if (typeof modelId !== 'string' || !publicAgentModels().some(model => model.id === modelId))
      return
    const { agentModel: _agentModel, model: _model, ...query } = route.query
    await navigateTo({ path: '/', query, hash: route.hash }, { replace: true })
    await selectAgentModel(modelId)
  }, { immediate: true })
})

function selectFrontierModel(card: FrontierModelCard) {
  void selectAgentModel(card.modelId)
}

useSeoMeta({
  title: `${publicConfig.brandName} | ${publicConfig.heroTitle} ${publicConfig.heroTagline}`,
  description: publicConfig.heroDescription,
  ogTitle: `${publicConfig.brandName} | ${publicConfig.heroTitle} ${publicConfig.heroTagline}`,
  ogDescription: publicConfig.heroDescription,
})
</script>

<template>
  <div class="relative isolate mx-auto flex w-full max-w-[1128px] flex-col gap-5 md:gap-6">
    <div class="relative">
      <HomeHeroVideoBackground />

      <div class="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
        <h1 class="text-[2.55rem] font-semibold leading-[1.03] tracking-[-0.045em] text-balance text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.8)] md:text-[3.25rem]">
          <span class="block">{{ publicConfig.heroTitle }}</span>
          <span class="block">{{ publicConfig.heroTagline }}</span>
        </h1>
        <p class="max-w-2xl text-sm leading-relaxed text-balance text-white/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] md:text-base">
          {{ publicConfig.heroDescription }}
        </p>
      </div>
    </div>

    <div class="relative z-10 w-full pt-3 md:pt-4">
      <div id="generator" class="flex flex-col gap-5 overflow-hidden rounded-2xl border border-border/70 bg-card/35 p-4 shadow-none backdrop-blur-xl supports-backdrop-filter:bg-card/25 md:gap-6 md:p-5">
        <HomeAgentComposer ref="agentComposer" embedded compact new-agent-on-send class="w-full" />
      </div>
    </div>

    <HomeRecentProjects />

    <div class="flex flex-col gap-5 md:gap-6">
      <HomeSkills @select="selectAgentSkill" />
      <HomeFrontierModels @select="selectFrontierModel" />
      <HomeUsefulTools />
    </div>

    <a
      href="https://theresanaiforthat.com/ai/polox-ai/?ref=featured&v=8794914"
      target="_blank"
      rel="nofollow noopener noreferrer"
      class="mx-auto mt-1 inline-flex opacity-90 transition-opacity duration-150 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src="https://media.theresanaiforthat.com/featured-on-taaft.png?width=600"
        alt="Featured on There's An AI For That"
        width="180"
        height="54"
        class="h-auto w-[180px]"
      >
    </a>
  </div>
</template>
