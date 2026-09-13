import type { AiModelConfig } from '~~/shared/types/aiModel'

export function agentComposerPlaceholder(models: Pick<AiModelConfig, 'task'>[]) {
  if (!models.length)
    return 'Type / for skills, @ for models, or share your idea.'
  return 'What do you want to create next?'
}
