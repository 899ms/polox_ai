import type { ImageLayerRegion } from './imageLayerSplitter'

export const OBJECT_REMOVAL_MAX_TARGETS = 16
export const OBJECT_REMOVAL_MASK_COLOR = '#65a30d'
export const OBJECT_REMOVAL_MASK_ALPHA = 0.45

export type ObjectRemovalKind = 'bbox' | 'mask'

/** Brush stroke in 0–1000 image space. Erase strokes punch holes in prior paint. */
export interface ObjectRemovalStroke {
  mode: 'paint' | 'erase'
  size: number
  points: Array<[number, number]>
}

export interface ObjectRemovalTarget {
  kind: ObjectRemovalKind
  label: string
  bbox?: ImageLayerRegion
  strokes?: ObjectRemovalStroke[]
}

export interface ObjectRemovalEdit {
  imageUrl: string
  targets: ObjectRemovalTarget[]
  /** Server or client-rendered overlay guide (original + boxes/masks). */
  annotatedImageUrl?: string
}

function clampInt(value: unknown, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    return null
  return value as number
}

function validateBBox(box: unknown): ImageLayerRegion {
  if (!Array.isArray(box) || box.length !== 4)
    throw new Error('Invalid removal box. Redraw the selection.')
  const coords = box.map(value => clampInt(value, 0, 1000))
  if (coords.some(value => value === null))
    throw new Error('Invalid removal box. Redraw the selection.')
  const region = coords as ImageLayerRegion
  if (region[2] - region[0] < 5 || region[3] - region[1] < 5)
    throw new Error('Removal boxes must be at least 5 units wide and tall.')
  return region
}

function validateStroke(stroke: unknown): ObjectRemovalStroke {
  const row = stroke as ObjectRemovalStroke | undefined
  if (!row || (row.mode !== 'paint' && row.mode !== 'erase'))
    throw new Error('Invalid mask stroke.')
  const size = clampInt(row.size, 1, 200)
  if (size === null)
    throw new Error('Invalid brush size.')
  if (!Array.isArray(row.points) || row.points.length < 1 || row.points.length > 4000)
    throw new Error('Invalid mask stroke points.')
  const points = row.points.map((point) => {
    if (!Array.isArray(point) || point.length !== 2)
      throw new Error('Invalid mask stroke point.')
    const x = clampInt(point[0], 0, 1000)
    const y = clampInt(point[1], 0, 1000)
    if (x === null || y === null)
      throw new Error('Invalid mask stroke point.')
    return [x, y] as [number, number]
  })
  return { mode: row.mode, size, points }
}

export function validateObjectRemovalEdit(value: unknown, allowedUrls: string[]): ObjectRemovalEdit {
  const edit = value as ObjectRemovalEdit | undefined
  if (!edit || typeof edit.imageUrl !== 'string' || !allowedUrls.includes(edit.imageUrl))
    throw new Error('Select a source image from this conversation.')
  if (!Array.isArray(edit.targets) || edit.targets.length < 1 || edit.targets.length > OBJECT_REMOVAL_MAX_TARGETS)
    throw new Error(`Mark between 1 and ${OBJECT_REMOVAL_MAX_TARGETS} objects to remove.`)
  const targets = edit.targets.map((target, index) => {
    if (!target || (target.kind !== 'bbox' && target.kind !== 'mask'))
      throw new Error(`Object ${index + 1} is invalid.`)
    const label = typeof target.label === 'string' ? target.label.trim() : ''
    if (label.length > 500)
      throw new Error(`Object ${index + 1} notes must be 500 characters or fewer.`)
    if (target.kind === 'bbox') {
      return { kind: 'bbox' as const, label, bbox: validateBBox(target.bbox) }
    }
    if (!Array.isArray(target.strokes) || !target.strokes.length)
      throw new Error(`Paint a mask for object ${index + 1}.`)
    if (target.strokes.length > 64)
      throw new Error(`Too many mask strokes on object ${index + 1}.`)
    return {
      kind: 'mask' as const,
      label,
      strokes: target.strokes.map(validateStroke),
      ...(target.bbox ? { bbox: validateBBox(target.bbox) } : {}),
    }
  })
  const annotated = typeof edit.annotatedImageUrl === 'string' && /^https?:\/\//i.test(edit.annotatedImageUrl)
    ? edit.annotatedImageUrl
    : undefined
  return {
    imageUrl: edit.imageUrl,
    targets,
    ...(annotated ? { annotatedImageUrl: annotated } : {}),
  }
}

const BOX_COLORS = ['#e11d48', '#2563eb', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#db2777', '#4f46e5']

/** SVG overlay for sharp composite (0–1000 → pixels). Masks approximate strokes as thick polylines. */
export function objectRemovalOverlaySvg(targets: ObjectRemovalTarget[], width: number, height: number) {
  const stroke = Math.max(3, Math.min(width, height) * 0.004)
  const fontSize = Math.max(14, Math.min(width, height) * 0.028)
  const parts = targets.map((target, index) => {
    const label = String(index + 1)
    const color = target.kind === 'mask' ? OBJECT_REMOVAL_MASK_COLOR : BOX_COLORS[index % BOX_COLORS.length]!
    const chunks: string[] = []
    if (target.kind === 'bbox' && target.bbox) {
      const [x1, y1, x2, y2] = target.bbox
      const left = Math.min(x1, x2) / 1000 * width
      const top = Math.min(y1, y2) / 1000 * height
      const right = Math.max(x1, x2) / 1000 * width
      const bottom = Math.max(y1, y2) / 1000 * height
      chunks.push(`<rect x="${left}" y="${top}" width="${Math.max(1, right - left)}" height="${Math.max(1, bottom - top)}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`)
      const labelW = fontSize * (0.65 * label.length + 0.8)
      const labelH = fontSize * 1.35
      const lx = Math.max(0, Math.min(width - labelW, left))
      const ly = Math.max(0, top - labelH < 0 ? top : top - labelH)
      chunks.push(`<rect x="${lx}" y="${ly}" width="${labelW}" height="${labelH}" rx="4" fill="${color}"/>`)
      chunks.push(`<text x="${lx + labelW / 2}" y="${ly + labelH / 2}" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${label}</text>`)
    }
    else if (target.kind === 'mask' && target.strokes?.length) {
      for (const strokeItem of target.strokes) {
        if (strokeItem.mode !== 'paint' || strokeItem.points.length < 1)
          continue
        const radius = Math.max(1, strokeItem.size / 1000 * Math.min(width, height))
        const d = strokeItem.points.map((point, pointIndex) => {
          const x = point[0] / 1000 * width
          const y = point[1] / 1000 * height
          return `${pointIndex === 0 ? 'M' : 'L'}${x} ${y}`
        }).join(' ')
        chunks.push(`<path d="${d}" fill="none" stroke="${OBJECT_REMOVAL_MASK_COLOR}" stroke-opacity="${OBJECT_REMOVAL_MASK_ALPHA}" stroke-width="${radius * 2}" stroke-linecap="round" stroke-linejoin="round"/>`)
      }
      const anchor = target.strokes.flatMap(item => item.points)[0]
      if (anchor) {
        const ax = anchor[0] / 1000 * width
        const ay = anchor[1] / 1000 * height
        const labelW = fontSize * (0.65 * label.length + 0.8)
        const labelH = fontSize * 1.35
        const lx = Math.max(0, Math.min(width - labelW, ax))
        const ly = Math.max(0, Math.min(height - labelH, ay - labelH))
        chunks.push(`<rect x="${lx}" y="${ly}" width="${labelW}" height="${labelH}" rx="4" fill="${OBJECT_REMOVAL_MASK_COLOR}"/>`)
        chunks.push(`<text x="${lx + labelW / 2}" y="${ly + labelH / 2}" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${label}</text>`)
      }
    }
    return chunks.join('')
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts}</svg>`
}

export function objectRemovalTargetSummary(targets: ObjectRemovalTarget[]) {
  return targets.map((target, index) => {
    const kind = target.kind === 'bbox' ? 'box' : 'green mask'
    const note = target.label ? `: ${target.label}` : ''
    return `${kind === 'box' ? 'Box' : 'Mask'} ${index + 1} (${kind})${note}`
  }).join('\n')
}
