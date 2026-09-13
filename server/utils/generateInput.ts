import { FAL_ENDPOINTS } from '~~/shared/constants/falEndpoints'
import { isFlux3GenerateModel } from '~~/shared/utils/flux3'
import { isIdeogramRemoveBackgroundModel } from '~~/shared/utils/ideogram'
import { isImageLayerSplitterModel } from '~~/shared/utils/imageLayerSplitter'
import { wavespeedEndpoint } from '../../shared/utils/wavespeedSchema'
import { sanitizeFalInput } from './falInput'
import { sanitizeFlux3Input } from './flux3Input'
import { sanitizeIdeogramInput } from './ideogramInput'
import { sanitizeImageLayerInput } from './imageLayerSplitter'
import { sanitizeWavespeedInput } from './wavespeedInput'

export function sanitizeGenerateInput(model: string, input: Record<string, unknown>) {
  if (isImageLayerSplitterModel(model))
    return sanitizeImageLayerInput(input)
  if (wavespeedEndpoint(model))
    return sanitizeWavespeedInput(model, input)
  if (isFlux3GenerateModel(model))
    return sanitizeFlux3Input(model, input)
  if (isIdeogramRemoveBackgroundModel(model))
    return sanitizeIdeogramInput(model, input)
  if (FAL_ENDPOINTS[model] || Object.values(FAL_ENDPOINTS).includes(model))
    return sanitizeFalInput(model, input)
  throw createError({ statusCode: 400, statusMessage: 'Unknown generation model' })
}
