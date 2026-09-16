import type { ImageLayerRegion } from '~~/shared/utils/imageLayerSplitter'

const BOX_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#db2777']

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image for boxed overlay.'))
    image.src = src
  })
}

/** Draw numbered boxes onto a source image and return a PNG blob (0–1000 → pixels). */
export async function renderLayerSelectionOverlayBlob(imageUrl: string, regions: ImageLayerRegion[]) {
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
  regions.forEach((region, index) => {
    const [x1, y1, x2, y2] = region
    const left = Math.min(x1, x2) / 1000 * canvas.width
    const top = Math.min(y1, y2) / 1000 * canvas.height
    const right = Math.max(x1, x2) / 1000 * canvas.width
    const bottom = Math.max(y1, y2) / 1000 * canvas.height
    const color = BOX_COLORS[index % BOX_COLORS.length]!
    ctx.lineWidth = stroke
    ctx.strokeStyle = color
    ctx.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
    const label = String(index + 1)
    ctx.font = `700 ${fontSize}px sans-serif`
    const labelW = fontSize * (0.65 * label.length + 0.8)
    const labelH = fontSize * 1.35
    const lx = Math.max(0, Math.min(canvas.width - labelW, left))
    const ly = Math.max(0, top - labelH < 0 ? top : top - labelH)
    ctx.fillStyle = color
    ctx.fillRect(lx, ly, labelW, labelH)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + labelW / 2, ly + labelH / 2)
  })
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not export boxed overlay.')), 'image/png')
  })
  return blob
}
