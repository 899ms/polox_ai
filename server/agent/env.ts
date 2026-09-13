import { readServiceSettings } from '../utils/serviceSettings'

export const agentEnv = {
  get wavespeedApiKey() { return readServiceSettings().wavespeedKey },
  get falApiKey() { return readServiceSettings().falKey },
  get model() { return readServiceSettings().llmModel },
}
export function assertAgentSecrets() {
  if (!agentEnv.wavespeedApiKey)
    throw new Error('Configure WaveSpeed using Service connection in the top-right corner.')
}
