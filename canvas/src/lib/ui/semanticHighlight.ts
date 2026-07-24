import type React from 'react'

export const SEMANTIC_HIGHLIGHT_DEFAULT_BACKGROUND = '#FEF3C7'
export const SEMANTIC_HIGHLIGHT_DEFAULT_BORDER = '#D97706'
export const SEMANTIC_HIGHLIGHT_DEFAULT_COLOR = '#78350F'

export const SEMANTIC_HIGHLIGHT_SURFACES = {
  markdownSigil: 'markdown-sigil',
  markdownTextHighlight: 'markdown-text-highlight',
  selectionMatch: 'selection-match',
  provenanceSelection: 'provenance-selection',
  d3Graph: 'd3-graph',
  keywordMode: 'keyword-mode',
  dashboard: 'dashboard',
  renderer: 'renderer',
} as const

export type SemanticHighlightSurfaceId =
  (typeof SEMANTIC_HIGHLIGHT_SURFACES)[keyof typeof SEMANTIC_HIGHLIGHT_SURFACES]

export type SemanticHighlightColorInput = {
  color?: unknown
  background?: unknown
  border?: unknown
  defaultHighlight?: boolean
}

export type SemanticHighlightColors = {
  color: string
  background: string
  border: string
}

type SemanticTextHighlightRectLike = {
  id?: string
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

export const normalizeSemanticHighlightColor = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

export const resolveSemanticHighlightColors = (
  input?: SemanticHighlightColorInput | null,
): SemanticHighlightColors => {
  const explicitColor = normalizeSemanticHighlightColor(input?.color)
  const explicitBackground = normalizeSemanticHighlightColor(input?.background)
  const explicitBorder = normalizeSemanticHighlightColor(input?.border)
  const useDefault = input?.defaultHighlight === true
  const background = explicitBackground || (useDefault ? SEMANTIC_HIGHLIGHT_DEFAULT_BACKGROUND : '')
  const color = explicitColor || (useDefault ? SEMANTIC_HIGHLIGHT_DEFAULT_COLOR : '')
  const border = explicitBorder || explicitBackground || explicitColor || (useDefault ? SEMANTIC_HIGHLIGHT_DEFAULT_BORDER : '')
  return { color, background, border }
}

export const getSemanticHighlightSurfaceAttributes = (
  surface: SemanticHighlightSurfaceId,
): Record<string, string> => ({
  'data-kg-semantic-highlight': '1',
  'data-kg-semantic-highlight-surface': surface,
})

export const getSemanticHighlightSurfaceClassName = (
  surface: SemanticHighlightSurfaceId,
): string => `kg-semantic-highlight kg-semantic-highlight-${surface}`

export const buildSemanticHighlightChipStyle = (
  input?: SemanticHighlightColorInput | null,
): React.CSSProperties => {
  const colors = resolveSemanticHighlightColors(input)
  const style: React.CSSProperties = {}
  if (colors.background) {
    style.backgroundColor = colors.background
    style.borderColor = colors.border || colors.background
  } else if (colors.border) {
    style.borderColor = colors.border
  }
  if (colors.color) style.color = colors.color
  return style
}

export const resolveSemanticHighlightColorValue = (
  input?: SemanticHighlightColorInput | null,
): string => {
  const colors = resolveSemanticHighlightColors(input)
  return colors.background || colors.color || colors.border
}

export const getSemanticTextHighlightClassName = (
  surface: SemanticHighlightSurfaceId,
): string => `${getSemanticHighlightSurfaceClassName(surface)} -mx-1 px-1 rounded transition-colors duration-1000`

export const buildSemanticTextHighlightStyle = (
  input?: (SemanticHighlightColorInput & { underline?: boolean }) | null,
): React.CSSProperties => {
  const colors = resolveSemanticHighlightColors(input)
  const backgroundColor = colors.background || undefined
  const emphasisColor = colors.color || colors.border || undefined
  if (input?.underline) {
    return {
      backgroundColor,
      textDecorationLine: 'underline',
      textDecorationColor: emphasisColor,
      textDecorationThickness: emphasisColor ? '2px' : undefined,
      textUnderlineOffset: emphasisColor ? '2px' : undefined,
    }
  }
  return {
    backgroundColor,
    color: colors.color || undefined,
  }
}

const readSeedUnit = (seed: string, salt: number): number => {
  let hash = 2166136261
  const source = `${seed}:${salt}`
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 1000) / 1000
}

export const buildSemanticTextHighlightOverlayStyle = (
  rect: SemanticTextHighlightRectLike,
): React.CSSProperties => {
  const height = Math.max(1, Number(rect.height) || 1)
  const width = Math.max(1, Number(rect.width) || 1)
  const left = Number(rect.left) || 0
  const top = Number(rect.top) || 0
  const seed = rect.id || `${Math.round(left)}:${Math.round(top)}:${Math.round(width)}:${Math.round(height)}`
  const padX = clamp(height * 0.22, 2, 7)
  const markerHeight = clamp(height * 0.58, 6, Math.max(6, height * 0.82))
  const bottomLift = clamp(height * 0.08, 0.5, 1.5)
  const markerTop = top + Math.max(0, height - markerHeight - bottomLift)
  const yJitter = (readSeedUnit(seed, 1) - 0.5) * clamp(height * 0.08, 0.25, 1.1)
  const rotateDeg = (readSeedUnit(seed, 2) - 0.5) * 0.7
  const radiusA = clamp(markerHeight * (0.48 + readSeedUnit(seed, 3) * 0.18), 4, 12)
  const radiusB = clamp(markerHeight * (0.5 + readSeedUnit(seed, 4) * 0.2), 4, 12)

  return {
    left: `${left - padX}px`,
    top: `${markerTop}px`,
    width: `${width + padX * 2}px`,
    height: `${markerHeight}px`,
    background: 'var(--kg-semantic-highlight-selection-bg, rgba(245, 158, 11, 0.28))',
    borderTopLeftRadius: `${radiusA}px`,
    borderTopRightRadius: `${radiusB}px`,
    borderBottomRightRadius: `${radiusA}px`,
    borderBottomLeftRadius: `${radiusB}px`,
    boxShadow: '0 0 0 1px rgba(245, 158, 11, 0.08), 0 1px 3px rgba(120, 53, 15, 0.08)',
    opacity: 0.86,
    transform: `translate3d(0, ${yJitter.toFixed(2)}px, 0) rotate(${rotateDeg.toFixed(2)}deg)`,
    transformOrigin: '50% 50%',
  }
}
