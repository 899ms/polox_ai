import type { GenerationProjectList, GenerationProjectPublic } from '~~/shared/types/project'

let inflight: Promise<void> | null = null
export function useProjects() {
  const projects = useState<GenerationProjectPublic[]>('generation-projects', () => [])
  const selectedProjectId = useState('generation-project-id', () => '')
  const loaded = useState('generation-projects-loaded', () => false)
  const loading = useState('generation-projects-loading', () => false)
  const selectedProject = computed(() => projects.value.find(project => project.id === selectedProjectId.value)
    || projects.value[0]
    || null)

  /** Studio/media projects only — skill workspaces live under Skills. */
  const studioProjects = computed(() =>
    projects.value.filter(project => project.kind !== 'skill'),
  )

  async function createProject(input: {
    name?: string
    description?: string
    kind?: 'studio' | 'skill'
    skillId?: string
  } = {}) {
    const project = await $fetch<GenerationProjectPublic>('/api/projects', {
      method: 'POST',
      body: input,
    })
    projects.value = [project, ...projects.value.filter(item => item.id !== project.id)]
    selectedProjectId.value = project.id
    return project
  }

  /** 1 skill ↔ 1 project. Creates or returns the bound skill workspace. */
  async function ensureSkillProject(input: {
    skillId?: string
    name?: string
    description?: string
    projectId?: string
  } = {}) {
    const project = await $fetch<GenerationProjectPublic>('/api/projects/skill', {
      method: 'POST',
      body: input,
    })
    projects.value = [project, ...projects.value.filter(item => item.id !== project.id)]
    selectedProjectId.value = project.id
    return project
  }

  async function loadProjects() {
    if (!import.meta.client) {
      return
    }
    if (inflight)
      return inflight
    loading.value = true
    inflight = (async () => {
      try {
        const data = await $fetch<GenerationProjectList>('/api/projects')
        projects.value = data.items
        if (!projects.value.some(project => project.id === selectedProjectId.value)) {
          const studio = projects.value.filter(project => project.kind !== 'skill')
          selectedProjectId.value = studio.find(project => project.isDefault)?.id
            || studio[0]?.id
            || projects.value[0]?.id
            || ''
        }
      }
      catch (error) {
        console.error('[projects]', error)
      }
      finally {
        loading.value = false
        loaded.value = true
        inflight = null
      }
    })()
    return inflight
  }
  if (import.meta.client) {
    void loadProjects()
  }
  return {
    projects,
    studioProjects,
    selectedProjectId,
    selectedProject,
    loaded,
    loading,
    loadProjects,
    createProject,
    ensureSkillProject,
  }
}
