import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter } from 'three'

type TextureKey = string

const textureCache = new Map<TextureKey, CanvasTexture>()

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

const makeCanvasTexture = (args: {
  text: string
  fontSizePx: number
  textColor: string
  bgColor: string
  bgOpacity: number
  paddingX: number
  paddingY: number
}): { texture: CanvasTexture; widthPx: number; heightPx: number } => {
  const fontSizePx = Number.isFinite(args.fontSizePx) ? Math.max(8, Math.min(36, Math.floor(args.fontSizePx))) : 12
  const paddingX = Number.isFinite(args.paddingX) ? Math.max(4, Math.min(40, Math.floor(args.paddingX))) : 10
  const paddingY = Number.isFinite(args.paddingY) ? Math.max(2, Math.min(24, Math.floor(args.paddingY))) : 6
  const text = String(args.text || '').trim()
  const textColor = String(args.textColor || '#111827')
  const bgColor = String(args.bgColor || '#000000')
  const bgOpacity = clamp01(Number.isFinite(args.bgOpacity) ? args.bgOpacity : 0.42)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new CanvasTexture(document.createElement('canvas'))
    return { texture: fallback, widthPx: 1, heightPx: 1 }
  }

  ctx.font = `${fontSizePx}px ${UI_FONT_SANS}`
  const metrics = ctx.measureText(text)
  const textW = Math.ceil(metrics.width)
  const textH = Math.ceil(fontSizePx * 1.2)
  const w = Math.max(1, textW + paddingX * 2)
  const h = Math.max(1, textH + paddingY * 2)

  canvas.width = w
  canvas.height = h

  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.globalAlpha = bgOpacity
  ctx.fillStyle = bgColor
  const r = Math.max(2, Math.min(14, Math.floor(Math.min(w, h) * 0.18)))
  const x = 0
  const y = 0
  const rw = w
  const rh = h
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + rw - r, y)
  ctx.quadraticCurveTo(x + rw, y, x + rw, y + r)
  ctx.lineTo(x + rw, y + rh - r)
  ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh)
  ctx.lineTo(x + r, y + rh)
  ctx.quadraticCurveTo(x, y + rh, x, y + rh - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = textColor
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `${fontSizePx}px ${UI_FONT_SANS}`
  ctx.fillText(text, w / 2, h / 2)

  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  return { texture, widthPx: w, heightPx: h }
}

export const getVoxelLabelTexture = (args: {
  text: string
  fontSizePx: number
  textColor: string
  bgColor: string
  bgOpacity: number
}): { texture: CanvasTexture; widthPx: number; heightPx: number } => {
  const key = [
    String(args.text || ''),
    String(args.fontSizePx || ''),
    String(args.textColor || ''),
    String(args.bgColor || ''),
    String(args.bgOpacity || ''),
  ].join('|')

  const cached = textureCache.get(key)
  if (cached) {
    const img = cached.image as HTMLCanvasElement | undefined
    const w = img && typeof img.width === 'number' ? img.width : 1
    const h = img && typeof img.height === 'number' ? img.height : 1
    return { texture: cached, widthPx: w, heightPx: h }
  }

  const created = makeCanvasTexture({
    text: args.text,
    fontSizePx: args.fontSizePx,
    textColor: args.textColor,
    bgColor: args.bgColor,
    bgOpacity: args.bgOpacity,
    paddingX: 10,
    paddingY: 6,
  })
  textureCache.set(key, created.texture)
  return created
}
