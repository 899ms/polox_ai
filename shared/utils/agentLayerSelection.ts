import type { ImageLayerRegion } from './imageLayerSplitter'

/** Seedream / Quality hard cap. */
export const LAYER_SPLIT_QUALITY_MAX_REGIONS = 16

export function validateLayerSelection(imageUrl: unknown, regions: unknown, allowedUrls: string[], maxRegions = LAYER_SPLIT_QUALITY_MAX_REGIONS) {
  if (typeof imageUrl !== 'string' || !allowedUrls.includes(imageUrl))
    throw new Error('Select an image from this conversation.')
  if (!Array.isArray(regions) || regions.length < 1 || regions.length > maxRegions)
    throw new Error(`Draw between 1 and ${maxRegions} boxes before continuing.`)
  const validated = regions.map((box) => {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(value => Number.isInteger(value) && value >= 0 && value <= 1000)
      || box[2] - box[0] < 5 || box[3] - box[1] < 5) {
      throw new Error('Invalid selection coordinates. Redraw the box.')
    }
    return [...box] as ImageLayerRegion
  })
  return { imageUrl, regions: validated }
}

export function validateLayerSelections(selections: unknown, allowedUrls: string[], maxRegions = LAYER_SPLIT_QUALITY_MAX_REGIONS) {
  if (!Array.isArray(selections) || !selections.length || selections.length > allowedUrls.length)
    throw new Error('Confirm boxes for the images you want to split.')
  const seen = new Set<string>()
  return selections.map((selection) => {
    const validated = withOptionalBoxedImageUrl(
      validateLayerSelection(selection?.imageUrl, selection?.regions, allowedUrls, maxRegions),
      selection || {},
    )
    if (seen.has(validated.imageUrl))
      throw new Error('Each source image must appear only once.')
    seen.add(validated.imageUrl)
    return validated
  })
}

const BOX_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#db2777']

/** Draw numbered selection boxes for sharp composite overlays (0–1000 → pixels). */
/** When `color` is set, every box uses that stroke/label color; otherwise cycle BOX_COLORS. */
export function layerSelectionOverlaySvg(
  regions: Array<readonly [number, number, number, number] | number[]>,
  width: number,
  height: number,
  options?: { color?: string },
) {
  const stroke = Math.max(3, Math.min(width, height) * 0.004)
  const fontSize = Math.max(14, Math.min(width, height) * 0.028)
  const boxes = regions.map((region, index) => {
    const [x1, y1, x2, y2] = region
    const left = Math.min(x1, x2) / 1000 * width
    const top = Math.min(y1, y2) / 1000 * height
    const right = Math.max(x1, x2) / 1000 * width
    const bottom = Math.max(y1, y2) / 1000 * height
    const w = Math.max(1, right - left)
    const h = Math.max(1, bottom - top)
    const color = options?.color || BOX_COLORS[index % BOX_COLORS.length]!
    const label = String(index + 1)
    const labelW = fontSize * (0.65 * label.length + 0.8)
    const labelH = fontSize * 1.35
    const lx = Math.max(0, Math.min(width - labelW, left))
    const ly = Math.max(0, top - labelH < 0 ? top : top - labelH)
    return [
      `<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
      `<rect x="${lx}" y="${ly}" width="${labelW}" height="${labelH}" rx="4" fill="${color}"/>`,
      `<text x="${lx + labelW / 2}" y="${ly + labelH / 2}" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${label}</text>`,
    ].join('')
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${boxes}</svg>`
}

export type LayerImageSelection = {
  imageUrl: string
  regions: import('./imageLayerSplitter').ImageLayerRegion[]
  boxedImageUrl?: string
}

/** Allow optional boxedImageUrl on validated selections (client may pre-render). */
export function withOptionalBoxedImageUrl<T extends { imageUrl: string, regions: unknown }>(
  validated: T,
  raw: { boxedImageUrl?: unknown },
): T & { boxedImageUrl?: string } {
  const boxed = typeof raw.boxedImageUrl === 'string' && raw.boxedImageUrl.startsWith('http')
    ? raw.boxedImageUrl
    : undefined
  return boxed ? { ...validated, boxedImageUrl: boxed } : validated
}
