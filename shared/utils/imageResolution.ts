/** Shared 1K / 2K / 4K tiers used by GPT Image, GPT Image 2.5, Nano Banana, etc. */
export const IMAGE_K_RESOLUTIONS = ['1K', '2K', '4K'] as const
export type ImageKResolution = typeof IMAGE_K_RESOLUTIONS[number]

/** Longer-edge centers for nearest-tier selection. */
const TIER_PX = [1024, 2048, 4096] as const

export type ImageKResolutionFamily = 'gpt-image-2' | 'gpt-image-25' | 'nano-banana' | 'generic'

/** GPT Image 2.5 aspects that only support 1K. */
const GPT_IMAGE_25_ONE_K_RATIOS = new Set(['27:16', '16:27', '9:8', '8:9'])

/** GPT Image 2 aspects that only support 1K. */
const GPT_IMAGE_2_HIGH_RES_UNSUPPORTED = new Set(['5:4', '4:5', '3:1', '1:3', '9:21'])

export function isImageKResolution(value: string): value is ImageKResolution {
  return (IMAGE_K_RESOLUTIONS as readonly string[]).includes(value)
}

export function normalizeImageKResolution(value: string): ImageKResolution | null {
  const upper = String(value || '').trim().toUpperCase()
  return isImageKResolution(upper) ? upper : null
}

/** Pick the nearest 1K/2K/4K tier from source pixel dimensions (longer edge). */
export function pickNearestImageResolution(width: number, height: number): ImageKResolution {
  const longer = Math.max(Number(width) || 0, Number(height) || 0)
  if (longer <= 0)
    return '1K'
  let bestIndex = 0
  let bestDist = Infinity
  for (let index = 0; index < TIER_PX.length; index++) {
    const dist = Math.abs(longer - TIER_PX[index]!)
    if (dist < bestDist) {
      bestDist = dist
      bestIndex = index
    }
  }
  return IMAGE_K_RESOLUTIONS[bestIndex]!
}

export function imageKResolutionFamily(modelId: string): ImageKResolutionFamily {
  const id = String(modelId || '')
  if (id.includes('gpt-image-2-5') || id.includes('gpt-image-25') || id.includes('gpt-image-2.5'))
    return 'gpt-image-25'
  if (id.includes('gpt-image-2'))
    return 'gpt-image-2'
  if (id.includes('nano-banana'))
    return 'nano-banana'
  return 'generic'
}

/**
 * Apply model/aspect constraints after nearest-tier pick.
 * Prefers lowering resolution over changing aspect ratio.
 */
export function constrainImageKResolution(
  resolution: string,
  aspect = 'auto',
  family: ImageKResolutionFamily = 'generic',
): ImageKResolution {
  let next: ImageKResolution = normalizeImageKResolution(resolution) || '1K'
  if (family === 'gpt-image-2') {
    if (aspect === 'auto')
      return '1K'
    if (aspect === '1:1' && next === '4K')
      return '2K'
    if (GPT_IMAGE_2_HIGH_RES_UNSUPPORTED.has(aspect))
      return '1K'
    return next
  }
  if (family === 'gpt-image-25') {
    if (GPT_IMAGE_25_ONE_K_RATIOS.has(aspect))
      return '1K'
    return next
  }
  return next
}

/** Map canonical 1K/2K/4K onto the model's schema enum casing (1K vs 1k). */
export function adaptImageKResolution(resolution: ImageKResolution, enumValues?: unknown[]) {
  if (!Array.isArray(enumValues) || !enumValues.length)
    return resolution
  const match = enumValues.find(value => String(value).toUpperCase() === resolution)
  return match !== undefined ? String(match) : resolution
}

/** True when the model schema exposes a 1K/2K/4K resolution enum (any casing). */
export function modelSupportsImageKResolution(model: {
  id?: string
  schema?: { components?: { schemas?: { Input?: { properties?: Record<string, { enum?: unknown[] }> } } } }
}): boolean {
  const resolution = model.schema?.components?.schemas?.Input?.properties?.resolution
  const values = resolution?.enum
  if (!Array.isArray(values))
    return false
  const normalized = new Set(values.map(value => String(value).toUpperCase()))
  return IMAGE_K_RESOLUTIONS.every(tier => normalized.has(tier))
}

export function modelIsImageToImage(model: { id?: string, task?: string }): boolean {
  const id = String(model.id || '')
  const task = String(model.task || '')
  return id.includes('image-to-image') || /image\s*to\s*image/i.test(task) || /\bedit\b/i.test(task) && id.includes('gpt-image')
}
