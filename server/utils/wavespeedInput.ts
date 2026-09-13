import Ajv from 'ajv'
import { WAVESPEED_MEDIA_FIELDS, wavespeedEndpoint, wavespeedInputSchema } from '../../shared/utils/wavespeedSchema'

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
export function sanitizeWavespeedInput(model: string, raw: Record<string, unknown>) {
  const schema = wavespeedInputSchema(model)
  if (!schema)
    throw createError({ statusCode: 400, statusMessage: 'Unknown WaveSpeed model' })
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''))
  for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
    if (input[key] === undefined && prop.default !== undefined)
      input[key] = prop.default
  }
  const validate = validators.get(model) || ajv.compile(schema)
  validators.set(model, validate)
  if (!validate(input))
    throw createError({ statusCode: 400, statusMessage: ajv.errorsText(validate.errors) })
  if (schema.required?.includes('prompt') && !String(input.prompt || '').trim())
    throw createError({ statusCode: 400, statusMessage: 'Prompt is required' })
  for (const key of WAVESPEED_MEDIA_FIELDS) {
    if (input[key] === undefined)
      continue
    for (const value of Array.isArray(input[key]) ? input[key] : [input[key]]) {
      if (typeof value !== 'string' || !(/^https?:\/\//i.test(value) || (['alibaba/wan-3.0/', 'minimax/h3/'].some(prefix => wavespeedEndpoint(model)?.startsWith(prefix)) && ['image', 'last_image'].includes(key) && /^data:image\/[\w.+-]+;base64,[a-z0-9+/=]+$/i.test(value))))
        throw createError({ statusCode: 400, statusMessage: `${key} must contain media URLs${key === 'image' || key === 'last_image' ? ' or Base64 image data' : ''}` })
    }
  }
  return input
}
