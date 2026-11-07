import { UI_TEXT_SCALE } from './typography.js'

export function tailwindTextSizeClassToPx(textSizeClass: string | null | undefined): number | null {
  const raw = typeof textSizeClass === 'string' ? textSizeClass : ''
  if (!raw.trim()) return null

  const token = raw
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .find(t => t.startsWith('text-'))

  if (!token) return null

  const explicitPxMatch = token.match(/^text-\[(\d+(?:\.\d+)?)px\]$/)
  if (explicitPxMatch) {
    const n = Number(explicitPxMatch[1])
    return Number.isFinite(n) ? n : null
  }

  const scale = UI_TEXT_SCALE[token.slice(5) as keyof typeof UI_TEXT_SCALE]
  return scale?.size ?? null
}
