import { centralTokenValue } from './fontStacks.js'
import { UI_INTENT_TOKENS } from './intentTokens.js'
import { resolveCssVarWithKgFallback } from './kgTokens.js'
import palette from './ui-intent-palette.json' with { type: 'json' }

export type ThemeColors = {
  bg: string
  text: string
  textSecondary: string
  border: string
  nodeStroke: string
  edgeStroke: string
  labelHalo: string
  labelFill: string
}

export const UI_THEME_COLORS_CSS: ThemeColors = {
  bg: 'var(--kg-panel-bg)',
  text: 'var(--kg-text-primary)',
  textSecondary: 'var(--kg-text-secondary)',
  border: 'var(--kg-border)',
  nodeStroke: 'var(--kg-canvas-node-stroke)',
  edgeStroke: 'var(--kg-canvas-edge-stroke)',
  labelHalo: 'var(--kg-canvas-label-halo)',
  labelFill: 'var(--kg-canvas-label-fill)',
} as const

export function resolveCssVar(name: string, fallback: string): string {
  const key = String(name || '').trim()
  if (key.startsWith('--kg-')) {
    const v = resolveCssVarWithKgFallback(key as `--kg-${string}`)
    return v || fallback
  }
  if (typeof document === 'undefined') return fallback
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(key).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

export function resolveThemeColors(): ThemeColors {
  return {
    bg: resolveCssVarWithKgFallback('--kg-panel-bg'),
    text: resolveCssVarWithKgFallback('--kg-text-primary'),
    textSecondary: resolveCssVarWithKgFallback('--kg-text-secondary'),
    border: resolveCssVarWithKgFallback('--kg-border'),
    nodeStroke: resolveCssVarWithKgFallback('--kg-canvas-node-stroke'),
    edgeStroke: resolveCssVarWithKgFallback('--kg-canvas-edge-stroke'),
    labelHalo: resolveCssVarWithKgFallback('--kg-canvas-label-halo'),
    labelFill: resolveCssVarWithKgFallback('--kg-canvas-label-fill'),
  }
}

const NEUTRAL_BORDER_COLOR_CLASS_NAME = 'border-[color:var(--kg-border)]'
const NEUTRAL_BORDER_WIDTH_CLASS_NAME = 'border-[length:var(--kg-surface-border-width,1px)]'
const CONTROL_BORDER_CLASS_NAME = '[border:var(--agentic-control-border)]'

const CONTROL_HEIGHT_CLASS_NAME = 'h-[var(--agentic-control-height)]'

/** Paint counterpart of table.rowSelected for the virtualized canvas grid; central palette owns the values. */
export const UI_ROW_SELECTION_PAINT = palette.interaction.rowSelection

const ROW_SELECTION_PERCENT = `${Math.round(UI_ROW_SELECTION_PAINT.alpha * 100)}%`
const ROW_SELECTION_ACCENT = UI_ROW_SELECTION_PAINT.accent
const ROW_SELECTION_WIDTH = UI_ROW_SELECTION_PAINT.accentWidthPx
const ROW_SELECTED_CLASS_NAME = `!bg-[color-mix(in_srgb,${ROW_SELECTION_ACCENT}_${ROW_SELECTION_PERCENT},var(--kg-panel-bg,white))] hover:!bg-[color-mix(in_srgb,${ROW_SELECTION_ACCENT}_${ROW_SELECTION_PERCENT},var(--kg-panel-bg,white))] !shadow-[inset_${ROW_SELECTION_WIDTH}px_0_0_${ROW_SELECTION_ACCENT}] [&>td:first-child]:!shadow-[inset_${ROW_SELECTION_WIDTH}px_0_0_${ROW_SELECTION_ACCENT}] [&>th:first-child]:!shadow-[inset_${ROW_SELECTION_WIDTH}px_0_0_${ROW_SELECTION_ACCENT}] [&>td]:!bg-inherit [&>th]:!bg-inherit`

/** Contract adapter; values and presentation live in the pinned central profile. */
export const UI_ICON_DEFAULTS = { strokeWidth: Number(centralTokenValue('--agentic-icon-stroke-width')) } as const
export const UI_ICON_APPEARANCE = Object.freeze({
  uiIconFormat: '1',
  uiIconStrokeWidth: UI_ICON_DEFAULTS.strokeWidth,
  uiIconColorClass: 'agentic-icon-color',
  uiIconHoverBgClass: 'agentic-icon-hover',
  uiIconButtonPaddingClass: 'agentic-icon-padding',
  uiIconPillClass: 'agentic-icon-pill',
  uiIconPillLegendTextSizeClass: 'agentic-icon-text',
  uiIconPillBadgeTextSizeClass: 'agentic-icon-text',
  uiIconBadgeChipClass: 'agentic-icon-badge',
  uiIconBadgeChipTextSizeClass: 'agentic-icon-text',
} as const)
/** Legacy saved values normalize to the shared owner without writing local overrides. */
export function normalizeUiIconStrokeWidth(_value: number): number { return UI_ICON_DEFAULTS.strokeWidth }
export function assertCentralIconAppearance<K extends keyof typeof UI_ICON_APPEARANCE>(key: K, value: unknown): typeof UI_ICON_APPEARANCE[K] {
  const owned = UI_ICON_APPEARANCE[key]
  if (value !== owned) throw new Error(`${key} is read-only; change the shared Design System owner`)
  return owned
}

// A stronger primary wash distinguishes keyboard focus even on a selected icon; central palette owns it.
const ICON_FOCUS_CLASS_NAME = palette.focus.iconWash

export const UI_THEME_TOKENS = {
  shadow: {
    flat: 'shadow-none',
    raised: 'shadow-[var(--kg-shadow-raised)]',
    overlay: 'shadow-[var(--kg-shadow-overlay)]',
  },
  border: {
    width: NEUTRAL_BORDER_WIDTH_CLASS_NAME,
    color: NEUTRAL_BORDER_COLOR_CLASS_NAME,
    outline: `${NEUTRAL_BORDER_WIDTH_CLASS_NAME} ${NEUTRAL_BORDER_COLOR_CLASS_NAME}`,
  },
  control: {
    height: CONTROL_HEIGHT_CLASS_NAME,
    singleLine: 'agentic-form-control min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap',
  },
  button: {
    iconControl: `kg-icon-control min-w-[var(--kg-control-height)]! min-h-[var(--kg-default-glyph-size,1rem)] rounded border-0 outline-none transition-colors shadow-none ${ICON_FOCUS_CLASS_NAME}`,
    selectedIcon: 'agentic-control-selected',
    text: 'text-[color:var(--kg-text-secondary)]',
    hoverText: 'hover:text-[color:var(--kg-text-primary)]',
    hoverBg: 'hover:bg-[var(--kg-panel-action-bg-hover)]',
    neutralSubtle: palette.surfaces.neutralSubtle,
    neutralMuted: palette.surfaces.neutralMuted,
    primarySolid: `${UI_INTENT_TOKENS.primary.solidBg} ${UI_INTENT_TOKENS.primary.solidText}`,
    activeSoft: `${UI_INTENT_TOKENS.primary.bg} ${UI_INTENT_TOKENS.primary.text} ${UI_INTENT_TOKENS.primary.softBorder}`,
    primaryOutline: `${UI_INTENT_TOKENS.primary.border} ${UI_INTENT_TOKENS.primary.text} hover:bg-[var(--kg-panel-action-bg-hover)]`,
    primaryLinkHoverText: UI_INTENT_TOKENS.primary.hoverText,
    hintHoverEmphasis: `hover:bg-[var(--kg-panel-action-bg-hover)] ${palette.interaction.hintHoverBorder}`,
    inverseHoverBg: palette.interaction.inverseHoverBg,
    dangerHoverBg: palette.interaction.dangerHoverBg,
    ring: palette.interaction.ring,
    padding: 'p-2',
    square: 'h-[var(--kg-control-height,28px)] w-[var(--kg-control-height,28px)] p-0 flex items-center justify-center',
    activeText: UI_INTENT_TOKENS.primary.text,
    activeBg: UI_INTENT_TOKENS.primary.bg,
    activeBorder: UI_INTENT_TOKENS.primary.border,
    disabledText: palette.interaction.disabledText,
  },
  pill: {
    base: 'rounded-full px-2 py-0.5 border border-[color:var(--kg-border)]',
    text: 'text-xs font-medium text-[color:var(--kg-text-secondary)]',
    badgeText: 'text-xs font-bold',
  },
  badge: {
    chip: `rounded px-1.5 py-0.5 ${palette.surfaces.chipWash}`,
    text: 'text-xs font-mono',
    toolbarGroup: `rounded ${palette.surfaces.chipWash} p-0.5`,
  },
  icon: {
    color: 'text-[color:var(--kg-text-secondary)]',
    active: UI_INTENT_TOKENS.primary.text,
  },
  panel: {
    bg: 'bg-[var(--kg-panel-bg)]',
    overlayBg: 'bg-[color-mix(in_srgb,var(--kg-panel-bg)_88%,transparent)] backdrop-blur-sm',
    border: NEUTRAL_BORDER_COLOR_CLASS_NAME,
    headerBg: 'bg-[color-mix(in_srgb,var(--kg-panel-bg)_75%,transparent)]',
    divider: NEUTRAL_BORDER_COLOR_CLASS_NAME,
  },
  kanban: {
    groupBg: 'bg-[var(--kg-kanban-group-bg)]',
    cardBg: 'bg-[var(--kg-kanban-card-bg)]',
    cardHoverBg: 'hover:bg-[var(--kg-kanban-card-bg-hover)]',
    cellBg: 'bg-[var(--kg-kanban-cell-bg)]',
    cardRadius: 'rounded-[var(--kg-kanban-card-radius)]',
    cardShadow: 'shadow-[var(--kg-kanban-card-shadow)]',
    cardHoverShadow: 'hover:shadow-[var(--kg-kanban-card-shadow-hover)]',
    actionIconButton: 'bg-[var(--kg-panel-action-bg)] hover:bg-[var(--kg-panel-action-bg-hover)]',
  },
  text: {
    primary: 'text-[color:var(--kg-text-primary)]',
    secondary: 'text-[color:var(--kg-text-secondary)]',
    tertiary: 'text-[color:var(--kg-text-tertiary)]',
  },
  table: {
    headerBg: palette.surfaces.tableHeaderBg,
    rowHover: palette.surfaces.tableRowHover,
    rowHoverHighlight: 'hover:!bg-[var(--kg-panel-action-bg-hover)]',
    rowDivider: 'divide-[color:var(--kg-border)]',
    cellBorder: NEUTRAL_BORDER_COLOR_CLASS_NAME,
    text: 'text-[color:var(--kg-text-primary)]',
    textSecondary: 'text-[color:var(--kg-text-secondary)]',
    rowBg: 'bg-[var(--kg-panel-bg)]',
    rowBgAlt: 'bg-[var(--kg-panel-bg)]',
    // Inset accent avoids layout shifts; first-cell paint keeps it above sticky table cells.
    rowSelected: ROW_SELECTED_CLASS_NAME,
    rowRelated: palette.interaction.rowRelated,
    rowOutside: 'bg-[var(--kg-panel-bg)]',
  },
  input: {
    bg: 'bg-[var(--kg-panel-bg)]',
    border: CONTROL_BORDER_CLASS_NAME,
    hoverBorder: 'hover:[border:var(--agentic-control-border)]',
    placeholder: 'placeholder:text-[color:var(--kg-text-tertiary)]',
    selectionControl: palette.interaction.selectionControl,
    text: 'text-[color:var(--kg-text-primary)]',
  },
  focus: {
    primaryRing: palette.focus.primaryRing,
    primaryStrongRing: palette.focus.primaryStrongRing,
    primaryBorderRing: palette.focus.primaryBorderRing,
    primarySoftRing: palette.focus.primarySoftRing,
    primarySofterRing: palette.focus.primarySofterRing,
  },
  status: {
    success: palette.statuses.success,
    info: palette.statuses.info,
    warning: palette.statuses.warning,
    error: palette.statuses.error,
    neutral: palette.statuses.neutral,
    neutralDot: 'bg-[color:var(--kg-text-tertiary)]',
    lilac: palette.statuses.lilac,
    pink: palette.statuses.pink,
    orange: palette.statuses.orange,
  },
  tooltip: {
    bg: 'agentic-hover-background',
    text: 'agentic-hover-text',
    textSecondary: 'agentic-hover-label',
    textTertiary: 'agentic-hover-muted',
  },
  code: {
    bg: 'bg-[color:var(--kg-code-bg)]',
    border: 'border-[color:var(--kg-code-border)]',
    text: 'text-[color:var(--kg-code-text)]',
  },
} as const

/** Keep decoration; fixed geometry belongs to the shared single-line control. */
export function singleLineControlDecorationClassName(className = ''): string {
  return className.split(/\s+/).filter(token => {
    const utility = token.replace(/^(?:(?:[\w-]+|\[[^\]]+\]):)+/, '').replace(/^!/, '')
    return token && !/^(?:(?:min-|max-)?(?:h|size)-|(?:min|max)-w-|p[xytrblse]?-|leading-|whitespace-|overflow(?:-[xy])?-|text-(?:ellipsis|clip)$|box-)/.test(utility)
  }).join(' ')
}

/** Normalize saved/caller classes so old sizes cannot override the shared owner. */
export function normalizeSingleLineControlClassName(className = ''): string {
  return [...new Set(`${singleLineControlDecorationClassName(className)} ${UI_THEME_TOKENS.control.singleLine}`.trim().split(/\s+/))].join(' ')
}
