export type ColorHsv = { h: number; s: number; v: number }

export function normalizeHexColor(value: string): string | null {
  const hex = String(value || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex
  if (/^#[0-9a-f]{3}$/.test(hex)) return '#' + [...hex.slice(1)].map(part => part + part).join('')
  return null
}

export const colorChannel = (value: number, max = 255) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0))
export const rgbToHex = (rgb: readonly number[]) => '#' + rgb.map(value => Math.round(colorChannel(value)).toString(16).padStart(2, '0')).join('')
export const hexToRgb = (hex: string) => [1, 3, 5].map(offset => parseInt((normalizeHexColor(hex) || '#000000').slice(offset, offset + 2), 16))

export function hexToHsv(hex: string): ColorHsv {
  const [r, g, b] = hexToRgb(hex).map(value => value / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const hue = delta === 0 ? 0 : max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: (hue * 60 + 360) % 360, s: max === 0 ? 0 : delta / max * 100, v: max * 100 }
}

export function hsvToHex({ h, s, v }: ColorHsv): string {
  const hue = ((h % 360) + 360) % 360 / 60, saturation = colorChannel(s, 100) / 100, value = colorChannel(v, 100) / 100
  const c = value * saturation, x = c * (1 - Math.abs(hue % 2 - 1)), m = value - c
  const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x]
  return rgbToHex(rgb.map(channel => (channel + m) * 255))
}

/** Resolve the app's CSS palette tokens without changing the stored source value. */
export function resolvePaletteColor(value: string): string | null {
  let current = String(value || '').trim()
  for (let depth = 0; depth < 4; depth++) {
    const normalized = normalizeHexColor(current)
    if (normalized) return normalized
    const variable = /^var\((--[\w-]+)\)$/.exec(current)
    if (!variable || typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null
    current = getComputedStyle(document.documentElement).getPropertyValue(variable[1]).trim()
  }
  return null
}
