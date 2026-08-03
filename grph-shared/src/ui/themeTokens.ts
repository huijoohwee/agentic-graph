import { UI_INTENT_TOKENS } from './intentTokens.js'
import { resolveCssVarWithKgFallback } from './kgTokens.js'

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

export const UI_THEME_TOKENS = {
  button: {
    text: 'text-[color:var(--kg-text-secondary)]',
    hoverText: 'hover:text-[color:var(--kg-text-primary)]',
    hoverBg: 'hover:bg-[var(--kg-panel-action-bg-hover)]',
    neutralSubtle: 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    neutralMuted: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
    primarySolid: `${UI_INTENT_TOKENS.primary.solidBg} ${UI_INTENT_TOKENS.primary.solidText}`,
    activeSoft: `${UI_INTENT_TOKENS.primary.bg} ${UI_INTENT_TOKENS.primary.text} ${UI_INTENT_TOKENS.primary.softBorder}`,
    primaryOutline: `${UI_INTENT_TOKENS.primary.border} ${UI_INTENT_TOKENS.primary.text} hover:bg-[var(--kg-panel-action-bg-hover)]`,
    primaryLinkHoverText: UI_INTENT_TOKENS.primary.hoverText,
    hintHoverEmphasis: 'hover:bg-[var(--kg-panel-action-bg-hover)] hover:border-blue-200 dark:hover:border-blue-700',
    inverseHoverBg: 'hover:bg-black/70 dark:hover:bg-white/15',
    dangerHoverBg: 'hover:bg-red-50 dark:hover:bg-red-900/20',
    ring: 'ring-blue-500 dark:ring-blue-400',
    padding: 'p-2',
    square: 'h-[var(--kg-control-height,28px)] w-[var(--kg-control-height,28px)] p-0 flex items-center justify-center',
    activeText: 'text-blue-600 dark:text-blue-400',
    activeBg: 'bg-blue-50 dark:bg-blue-900/20',
    activeBorder: 'border-blue-500 dark:border-blue-400',
    disabledText: 'text-black/40 dark:text-white/30',
  },
  pill: {
    base: 'rounded-full px-2 py-0.5 border border-[color:var(--kg-border)]',
    text: 'text-[10px] font-medium text-[color:var(--kg-text-secondary)]',
    badgeText: 'text-[10px] font-bold',
  },
  badge: {
    chip: 'rounded px-1.5 py-0.5 bg-black/5 dark:bg-white/5',
    text: 'text-[10px] font-mono',
    toolbarGroup: 'rounded bg-black/5 dark:bg-white/5 p-0.5',
  },
  icon: {
    color: 'text-[color:var(--kg-text-secondary)]',
    active: 'text-blue-600 dark:text-blue-400',
  },
  panel: {
    bg: 'bg-[var(--kg-panel-bg)]',
    overlayBg: 'bg-[color-mix(in_srgb,var(--kg-panel-bg)_88%,transparent)] backdrop-blur-sm',
    border: 'border-[color:var(--kg-border)]',
    headerBg: 'bg-[color-mix(in_srgb,var(--kg-panel-bg)_75%,transparent)]',
    divider: 'border-[color:var(--kg-divider)]',
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
    headerBg: 'bg-gray-50 dark:bg-gray-800',
    rowHover: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
    rowHoverHighlight: 'hover:!bg-[var(--kg-panel-action-bg-hover)]',
    rowDivider: 'divide-[color:var(--kg-divider)]',
    cellBorder: 'border-[color:var(--kg-border)]',
    text: 'text-[color:var(--kg-text-primary)]',
    textSecondary: 'text-[color:var(--kg-text-secondary)]',
    rowBg: 'bg-[var(--kg-panel-bg)]',
    rowBgAlt: 'bg-[var(--kg-panel-bg)]',
    rowSelected: 'bg-blue-50 dark:bg-blue-900/20',
    rowSelectedBorder: 'ring-1 ring-inset ring-blue-500 dark:ring-blue-400',
    rowRelated: 'bg-blue-50/50 dark:bg-blue-900/10',
    rowOutside: 'bg-[var(--kg-panel-bg)]',
  },
  input: {
    bg: 'bg-[var(--kg-panel-bg)]',
    border: 'border-[color:var(--kg-border)]',
    hoverBorder: 'hover:border-blue-500/30 dark:hover:border-blue-400/40',
    placeholder: 'placeholder:text-[color:var(--kg-text-tertiary)]',
    selectionControl: 'text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400',
    text: 'text-[color:var(--kg-text-primary)]',
  },
  focus: {
    primaryRing: 'focus-visible:ring-1 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
    primaryStrongRing: 'focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400',
    primaryBorderRing: 'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400',
    primarySoftRing: 'focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40',
    primarySofterRing: 'focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50',
  },
  status: {
    success: 'text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30',
    info: 'text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30',
    warning: 'text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/30',
    error: 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30',
    neutral: 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800',
    neutralDot: 'bg-[color:var(--kg-text-tertiary)]',
    lilac: 'text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20',
    pink: 'text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20',
    orange: 'text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20',
  },
  tooltip: {
    bg: 'bg-[var(--kg-tooltip-bg)]',
    text: 'text-[color:var(--kg-tooltip-text)]',
    textSecondary: 'text-[color:var(--kg-tooltip-text)] opacity-80',
    textTertiary: 'text-[color:var(--kg-tooltip-text)] opacity-70',
  },
  code: {
    bg: 'bg-[color:var(--kg-code-bg)]',
    border: 'border-[color:var(--kg-code-border)]',
    text: 'text-[color:var(--kg-code-text)]',
  },
} as const
