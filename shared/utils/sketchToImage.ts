export const SKETCH_TO_IMAGE_TOOL = 'sketch-to-image'
export const SKETCH_TO_IMAGE_MODEL = 'gpt-image-2-5-flare-image-to-image'
export const SKETCH_WIDTH = 1200
export const SKETCH_HEIGHT = 800

export interface SketchPoint { x: number, y: number }
export type SketchElement = { rotation?: number } & ({
  kind: 'stroke'
  color: string
  width: number
  points: SketchPoint[]
} | {
  kind: 'text'
  color: string
  size: number
  x: number
  y: number
  text: string
})

export function sketchPrompt(prompt: string) {
  return `Turn the supplied sketch into a finished image. Preserve its composition, object placement, and the intent of the drawn lines. Read the text on the sketch as labels or instructions unless the user asks to include it in the finished image.\n${prompt.trim() || 'Create a polished image based on the sketch.'}`
}

export function sketchPoint(clientX: number, clientY: number, bounds: { left: number, top: number, width: number, height: number }): SketchPoint {
  return {
    x: Math.max(0, Math.min(SKETCH_WIDTH, (clientX - bounds.left) / Math.max(1, bounds.width) * SKETCH_WIDTH)),
    y: Math.max(0, Math.min(SKETCH_HEIGHT, (clientY - bounds.top) / Math.max(1, bounds.height) * SKETCH_HEIGHT)),
  }
}

export interface SketchBounds { x: number, y: number, width: number, height: number }

export function sketchRotation(value: number) {
  return ((Math.round(value) % 360) + 360) % 360
}

export function sketchRotatedBounds(bounds: SketchBounds, rotation = 0): SketchBounds {
  const radians = rotation * Math.PI / 180
  const width = Math.abs(bounds.width * Math.cos(radians)) + Math.abs(bounds.height * Math.sin(radians))
  const height = Math.abs(bounds.width * Math.sin(radians)) + Math.abs(bounds.height * Math.cos(radians))
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height }
}

export function sketchElementBounds(element: SketchElement, metrics?: Pick<TextMetrics, 'width' | 'actualBoundingBoxLeft' | 'actualBoundingBoxRight' | 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent'>): SketchBounds {
  if (element.kind === 'stroke') {
    const xs = element.points.map(point => point.x)
    const ys = element.points.map(point => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x: x - element.width / 2, y: y - element.width / 2, width: Math.max(...xs) - x + element.width, height: Math.max(...ys) - y + element.width }
  }
  const left = metrics?.actualBoundingBoxLeft ?? 0
  const right = metrics?.actualBoundingBoxRight ?? metrics?.width ?? element.text.length * element.size * 0.6
  const ascent = metrics?.actualBoundingBoxAscent ?? element.size * 0.8
  const descent = metrics?.actualBoundingBoxDescent ?? element.size * 0.2
  return { x: element.x - left, y: element.y - ascent, width: Math.max(1, left + right), height: Math.max(1, ascent + descent) }
}
