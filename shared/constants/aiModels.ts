import type { AiCategory, AiModelConfig, AiTask } from '../types/aiModel'
import { FLUX_3_I2V_MODEL, FLUX_3_T2V_MODEL } from '~~/shared/utils/flux3'
import { IDEOGRAM_REMOVE_BACKGROUND_MODEL } from '~~/shared/utils/ideogram'
import { wavespeedFormSchema } from '../utils/wavespeedSchema'

export const AI_CATEGORIES: AiCategory[] = ['Image', 'Video']

export const AI_TASKS: Array<{ value: AiTask, category: AiCategory, abbr: string, comingSoon?: boolean }> = [
  { value: 'Text to Image', category: 'Image', abbr: 't2i' },
  { value: 'Image to Image', category: 'Image', abbr: 'i2i' },
  { value: 'Text to Video', category: 'Video', abbr: 't2v' },
  { value: 'Image to Video', category: 'Video', abbr: 'i2v' },
  { value: 'Reference to Video', category: 'Video', abbr: 'r2v' },
  { value: 'Remove Background', category: 'Tools', abbr: 'bg' },
]

export const TASK_ABBR = Object.fromEntries(
  AI_TASKS.map(task => [task.value, task.abbr]),
) as Record<AiTask, string>

export function getTaskAbbr(task: AiTask) {
  return TASK_ABBR[task]
}

export const AI_MODELS: AiModelConfig[] = [
  {
    id: 'seedream/5-pro-text-to-image',
    name: 'Seedream 5.0 Pro',
    category: 'Image',
    task: 'Text to Image',

    icon: 'lucide:image',
    schema: wavespeedFormSchema('seedream/5-pro-text-to-image')!,
  },
  {
    id: 'seedream/5-pro-image-to-image',
    name: 'Seedream 5.0 Pro',
    category: 'Image',
    task: 'Image to Image',

    icon: 'lucide:images',
    schema: wavespeedFormSchema('seedream/5-pro-image-to-image')!,
  },
  {
    id: 'gpt-image-2-text-to-image',
    name: 'GPT Image 2',
    category: 'Image',
    task: 'Text to Image',

    icon: 'lucide:sparkles',
    schema: wavespeedFormSchema('gpt-image-2-text-to-image')!,
  },
  {
    id: 'gpt-image-2-image-to-image',
    name: 'GPT Image 2',
    category: 'Image',
    task: 'Image to Image',

    icon: 'lucide:sparkles',
    schema: wavespeedFormSchema('gpt-image-2-image-to-image')!,
  },
  {
    id: 'gpt-image-2-5-flare-image-to-image',
    name: 'GPT Image 2.5 Flare',
    category: 'Image',
    task: 'Image to Image',
    icon: 'lucide:sparkles',
    schema: wavespeedFormSchema('gpt-image-2-5-flare-image-to-image'),
  },
  {
    id: 'gpt-image-2-5-sunburst-image-to-image',
    name: 'GPT Image 2.5 Sunburst',
    category: 'Image',
    task: 'Image to Image',
    icon: 'lucide:sparkles',
    schema: wavespeedFormSchema('gpt-image-2-5-sunburst-image-to-image'),
  },
  {
    id: 'nano-banana-2-text-to-image',
    name: 'Nano Banana 2',
    category: 'Image',
    task: 'Text to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-2-text-to-image')!,
  },
  {
    id: 'nano-banana-2-image-to-image',
    name: 'Nano Banana 2',
    category: 'Image',
    task: 'Image to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-2-image-to-image')!,
  },
  {
    id: 'nano-banana-2-lite-text-to-image',
    name: 'Nano Banana 2 Lite',
    category: 'Image',
    task: 'Text to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-2-lite-text-to-image')!,
  },
  {
    id: 'nano-banana-2-lite-image-to-image',
    name: 'Nano Banana 2 Lite',
    category: 'Image',
    task: 'Image to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-2-lite-image-to-image')!,
  },
  {
    id: 'nano-banana-pro-text-to-image',
    name: 'Nano Banana Pro',
    category: 'Image',
    task: 'Text to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-pro-text-to-image')!,
  },
  {
    id: 'nano-banana-pro-image-to-image',
    name: 'Nano Banana Pro',
    category: 'Image',
    task: 'Image to Image',

    icon: 'lucide:banana',
    schema: wavespeedFormSchema('nano-banana-pro-image-to-image')!,
  },
  {
    id: FLUX_3_T2V_MODEL,
    name: 'Flux 3',
    category: 'Video',
    task: 'Text to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema(FLUX_3_T2V_MODEL),
  },
  {
    id: FLUX_3_I2V_MODEL,
    name: 'Flux 3',
    category: 'Video',
    task: 'Image to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema(FLUX_3_I2V_MODEL),
  },
  {
    id: 'bytedance/seedance-2-5-text-to-video',
    name: 'Seedance 2.5',
    category: 'Video',
    task: 'Text to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-5-text-to-video')!,
  },
  {
    id: 'bytedance/seedance-2-5-image-to-video',
    name: 'Seedance 2.5',
    category: 'Video',
    task: 'Image to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-5-image-to-video')!,
  },
  {
    id: 'bytedance/seedance-2-5-reference-to-video',
    name: 'Seedance 2.5',
    category: 'Video',
    task: 'Reference to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-5-reference-to-video')!,
  },
  {
    id: 'bytedance/seedance-2-text-to-video',
    name: 'Seedance 2.0',
    category: 'Video',
    task: 'Text to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-text-to-video')!,
  },
  {
    id: 'bytedance/seedance-2-image-to-video',
    name: 'Seedance 2.0',
    category: 'Video',
    task: 'Image to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-image-to-video')!,
  },
  {
    id: 'bytedance/seedance-2-reference-to-video',
    name: 'Seedance 2.0',
    category: 'Video',
    task: 'Reference to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('bytedance/seedance-2-reference-to-video')!,
  },
  {
    id: 'minimax-h3/text-to-video',
    name: 'MiniMax H3',
    category: 'Video',
    task: 'Text to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('minimax-h3/text-to-video')!,
  },
  {
    id: 'minimax-h3/image-to-video',
    name: 'MiniMax H3',
    category: 'Video',
    task: 'Image to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('minimax-h3/image-to-video')!,
  },
  {
    id: 'minimax-h3/reference-to-video',
    name: 'MiniMax H3',
    category: 'Video',
    task: 'Reference to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('minimax-h3/reference-to-video')!,
  },
  {
    id: 'wan/3-0-video-text-to-video',
    name: 'Wan 3.0',
    category: 'Video',
    task: 'Text to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('wan/3-0-video-text-to-video')!,
  },
  {
    id: 'wan/3-0-video-image-to-video',
    name: 'Wan 3.0',
    category: 'Video',
    task: 'Image to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('wan/3-0-video-image-to-video')!,
  },
  {
    id: 'wan/3-0-video-reference-to-video',
    name: 'Wan 3.0',
    category: 'Video',
    task: 'Reference to Video',

    icon: 'lucide:clapperboard',
    schema: wavespeedFormSchema('wan/3-0-video-reference-to-video')!,
  },
  {
    id: IDEOGRAM_REMOVE_BACKGROUND_MODEL,
    name: 'Image Background Removal',
    category: 'Tools',
    task: 'Remove Background',

    icon: 'lucide:eraser',
    schema: wavespeedFormSchema(IDEOGRAM_REMOVE_BACKGROUND_MODEL),
  },
]

export const MODEL_COMPANIES: Record<string, string> = {
  'Seedream 5.0 Pro': 'ByteDance',
  'GPT Image 2': 'OpenAI',
  'GPT Image 2.5 Flare': 'OpenAI',
  'GPT Image 2.5 Sunburst': 'OpenAI',
  'Nano Banana 2': 'Google',
  'Nano Banana 2 Lite': 'Google',
  'Nano Banana Pro': 'Google',
  'Flux 3': 'Black Forest Labs',
  'Seedance 2.5': 'ByteDance',
  'Seedance 2.0': 'ByteDance',
  'MiniMax H3': 'MiniMax',
  'Wan 3.0': 'Alibaba',
  'Image Background Removal': 'Ideogram',
}

export const COMPANY_LOGOS: Record<string, string> = {
  'ByteDance': '/brand/companies/bytedance.svg',
  'OpenAI': '/brand/companies/openai.svg',
  'Google': '/brand/companies/google.svg',
  'Black Forest Labs': '/brand/companies/flux.svg',
  'MiniMax': '/brand/companies/minimax.svg',
  'Alibaba': '/brand/companies/alibaba.svg',
}

export function getModelCompanyLogo(name?: string) {
  if (!name)
    return undefined
  const company = MODEL_COMPANIES[name]
  return company ? COMPANY_LOGOS[company] : undefined
}

export interface FrontierModelCard {
  name: string
  title: string
  company: string
  logo?: string
  task: AiTask
  taskAbbr: string
  icon?: string
  modelId: string
  category: AiCategory
}

export function getFrontierModelCards(): FrontierModelCard[] {
  return AI_MODELS
    .filter(model => model.category !== 'Tools')
    .map((model) => {
      const company = MODEL_COMPANIES[model.name] || ''
      const taskAbbr = getTaskAbbr(model.task)
      return {
        name: model.name,
        title: `${model.name} ${taskAbbr}`,
        company,
        logo: COMPANY_LOGOS[company],
        task: model.task,
        taskAbbr,
        icon: model.icon,
        modelId: model.id,
        category: model.category,
      }
    })
}
