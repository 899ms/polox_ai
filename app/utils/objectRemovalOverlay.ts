import type { ObjectRemovalTarget } from '~~/shared/utils/imageObjectRemoval'
import { OBJECT_REMOVAL_MASK_ALPHA, OBJECT_REMOVAL_MASK_COLOR } from '~~/shared/utils/imageObjectRemoval'

const BOX_COLORS = ['#e11d48', '#2563eb', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#db2777', '#4f46e5']

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image for removal overlay.'))
    image.src = src
  })
}

function paintMaskLayer(ctx: CanvasRenderingContext2D, target: ObjectRemovalTarget, width: number, height: number) {
  if (!target.strokes?.length)
    return
  const layer = document.createElement('canvas')
  layer.width = width
  layer.height = height
  const brush = layer.getContext('2d')
  if (!brush)
    return
  for (const stroke of target.strokes) {
    if (stroke.points.length < 1)
      continue
    const radius = Math.max(1, stroke.size / 1000 * Math.min(width, height))
    brush.lineCap = 'round'
    brush.lineJoin = 'round'
    brush.lineWidth = radius * 2
    brush.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over'
    brush.strokeStyle = stroke.mode === 'erase' ? 'rgba(0,0,0,1)' : OBJECT_REMOVAL_MASK_COLOR
    brush.beginPath()
    stroke.points.forEach((point, index) => {
      const x = point[0] / 1000 * width
      const y = point[1] / 1000 * height
      if (index === 0)
        brush.moveTo(x, y)
      else
        brush.lineTo(x, y)
    })
    brush.stroke()
    // Single-point taps still leave a visible dab.
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0]!
      brush.beginPath()
      brush.arc(x / 1000 * width, y / 1000 * height, radius, 0, Math.PI * 2)
      brush.fillStyle = stroke.mode === 'erase' ? 'rgba(0,0,0,1)' : OBJECT_REMOVAL_MASK_COLOR
      brush.fill()
    }
  }
  ctx.save()
  ctx.globalAlpha = OBJECT_REMOVAL_MASK_ALPHA
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

/** Draw numbered boxes + green masks onto the source and return a PNG blob. */
export async function renderObjectRemovalOverlayBlob(imageUrl: string, targets: ObjectRemovalTarget[]) {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('Canvas is unavailable.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const stroke = Math.max(3, Math.min(canvas.width, canvas.height) * 0.004)
  const fontSize = Math.max(14, Math.min(canvas.width, canvas.height) * 0.028)

  targets.forEach((target, index) => {
    const label = String(index + 1)
    if (target.kind === 'mask')
      paintMaskLayer(ctx, target, canvas.width, canvas.height)
    if (target.kind === 'bbox' && target.bbox) {
      const [x1, y1, x2, y2] = target.bbox
      const left = Math.min(x1, x2) / 1000 * canvas.width
      const top = Math.min(y1, y2) / 1000 * canvas.height
      const right = Math.max(x1, x2) / 1000 * canvas.width
      const bottom = Math.max(y1, y2) / 1000 * canvas.height
      const color = BOX_COLORS[index % BOX_COLORS.length]!
      ctx.lineWidth = stroke
      ctx.strokeStyle = color
      ctx.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
      const labelW = fontSize * (0.65 * label.length + 0.8)
      const labelH = fontSize * 1.35
      const lx = Math.max(0, Math.min(canvas.width - labelW, left))
      const ly = Math.max(0, top - labelH < 0 ? top : top - labelH)
      ctx.fillStyle = color
      ctx.fillRect(lx, ly, labelW, labelH)
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, lx + labelW / 2, ly + labelH / 2)
    }
    else if (target.kind === 'mask') {
      const anchor = target.strokes?.flatMap(item => item.points)[0]
      if (!anchor)
        return
      const ax = anchor[0] / 1000 * canvas.width
      const ay = anchor[1] / 1000 * canvas.height
      const labelW = fontSize * (0.65 * label.length + 0.8)
      const labelH = fontSize * 1.35
      const lx = Math.max(0, Math.min(canvas.width - labelW, ax))
      const ly = Math.max(0, Math.min(canvas.height - labelH, ay - labelH))
      ctx.fillStyle = OBJECT_REMOVAL_MASK_COLOR
      ctx.fillRect(lx, ly, labelW, labelH)
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, lx + labelW / 2, ly + labelH / 2)
    }
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not export removal overlay.')), 'image/png')
  })
  return blob
}
