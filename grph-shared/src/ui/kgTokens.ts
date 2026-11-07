import { renderKgTokensCss, type KgTheme, type KgTokenDef } from './kgTokenContract.js'
export * from './kgTokenContract.js'

import { centralTokenValue, centralTokenCss } from './fontStacks.js'

const purposes: Record<string, string> = {
  'app-bg': 'Application background',
  'surface-bg': 'Raised surface',
  'panel-bg': 'Panel background',
  'panel-bg-hover': 'Hovered panel',
  'border': 'Surface border',
  'divider': 'Content divider',
  'text-primary': 'Primary text',
  'text-secondary': 'Supporting text',
  'text-tertiary': 'Subtle text',
  'tooltip-bg': 'Tooltip background',
  'tooltip-text': 'Tooltip text',
  'code-bg': 'Code background',
  'code-border': 'Code border',
  'code-text': 'Code text',
  'control-height': 'Default control height',
  'status-pill-height': 'Status pill height',
  'table-row-height': 'Table row height',
  'focus-ring': 'Keyboard focus outline',
  'accent': 'Interactive accent',
  'accent-contrast': 'Text on accent',
  'accent-border': 'Accent border',
  'accent-soft-bg': 'Subtle accent background',
  'accent-strong-bg': 'Strong accent background',
  'focus-ring-offset': 'Focus outline separation',
  'table-header-bg': 'Table header background',
  'table-row-hover-bg': 'Hovered table row',
  'table-row-selected-bg': 'Selected table row',
  'table-row-related-bg': 'Related table row',
  'canvas-bg': 'Canvas background',
  'canvas-node-stroke': 'Canvas node outline',
  'canvas-edge-stroke': 'Canvas edge stroke',
  'canvas-accent': 'Canvas interaction accent',
  'canvas-label-halo': 'Canvas label backdrop',
  'canvas-label-fill': 'Canvas label text',
  'canvas-grid-minor': 'Minor canvas grid',
  'canvas-grid-major': 'Major canvas grid',
  'media-panel-bg': 'Media panel background',
  'media-panel-header-bg': 'Media panel header',
  'statusbar-bg': 'Status bar background',
  'statusbar-text': 'Status bar text',
  'kanban-group-bg': 'Kanban group background',
  'kanban-card-bg': 'Kanban card background',
  'kanban-card-bg-hover': 'Hovered kanban card',
  'kanban-cell-bg': 'Kanban cell background',
  'kanban-card-radius': 'Kanban card corner radius',
  'kanban-card-shadow': 'Kanban card elevation',
  'kanban-card-shadow-hover': 'Hovered card elevation',
  'panel-action-bg': 'Panel action background',
  'panel-action-bg-hover': 'Hovered panel action',
}

// Existing 49-token API is a contract-only projection of the central registry.
export const AG_TOKEN_DEFS: readonly KgTokenDef[] = Object.entries(purposes).map(([name, purpose]) => {
  const cssVar = `--kg-${name}` as KgTokenDef['cssVar']
  const type = ['control-height', 'status-pill-height', 'table-row-height', 'kanban-card-radius'].includes(name)
    ? 'dimension' : ['kanban-card-shadow', 'kanban-card-shadow-hover'].includes(name) ? 'shadow' : 'color'
  const value = (theme: KgTheme) => name === 'table-row-height' || name === 'panel-action-bg-hover'
    ? centralTokenCss(cssVar, theme) : centralTokenValue(cssVar, theme)
  return { cssVar, name, type, purpose, light: value('light'), dark: value('dark'), black: value('black'),
    ...(name === 'panel-action-bg-hover' ? { references: { dark: 'canvas-accent', black: 'canvas-accent' } } : {}) }
})

export const buildKgTokensCssText = (theme: KgTheme, options: { selector?: string } = {}): string => {
  const selector = options.selector ?? (
    theme === 'black' ? ":root[data-theme='dark'][data-dark-variant='black']"
      : theme === 'dark' ? ":root[data-theme='dark']" : ':root'
  )
  return renderKgTokensCss(AG_TOKEN_DEFS, theme, selector, true, { inheritLayout: theme !== 'light' && selector !== ':root' })
}

export const getKgThemeFromDom = (): KgTheme => {
  if (typeof document === 'undefined') return 'light'
  const raw = String(document.documentElement.getAttribute('data-theme') || '').trim()
  if (raw === 'dark') return document.documentElement.getAttribute('data-dark-variant') === 'black' ? 'black' : 'dark'
  if (document.documentElement.classList.contains('dark')) return document.documentElement.getAttribute('data-dark-variant') === 'black' ? 'black' : 'dark'
  return 'light'
}

export const getKgTokenFallback = (cssVar: KgTokenDef['cssVar'], theme: KgTheme): string => {
  const def = AG_TOKEN_DEFS.find(d => d.cssVar === cssVar)
  if (!def) return ''
  return def[theme]
}

export const resolveCssVarWithKgFallback = (cssVar: KgTokenDef['cssVar'], theme?: KgTheme): string => {
  const t = theme || getKgThemeFromDom()
  const fallback = getKgTokenFallback(cssVar, t)
  if (typeof document === 'undefined') return fallback
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

export const ensureKgTokensInstalled = (theme?: KgTheme): void => {
  if (typeof document === 'undefined') return
  const t = theme || getKgThemeFromDom()
  const root = document.documentElement
  let styles: CSSStyleDeclaration | null = null
  try {
    styles = getComputedStyle(root)
  } catch {
    styles = null
  }
  for (let i = 0; i < AG_TOKEN_DEFS.length; i += 1) {
    const def = AG_TOKEN_DEFS[i]
    const current = styles ? String(styles.getPropertyValue(def.cssVar) || '').trim() : ''
    if (current) continue
    const next = def[t]
    if (!next) continue
    try {
      root.style.setProperty(def.cssVar, next)
    } catch {
      void 0
    }
  }
}

export const extractKgCssVarsFromCssText = (cssText: string): Set<string> => {
  const set = new Set<string>()
  const re = /(--kg-[a-z0-9-]+)\s*:/gi
  let m: RegExpExecArray | null = null
  while ((m = re.exec(cssText)) != null) {
    const v = String(m[1] || '').trim()
    if (v) set.add(v)
  }
  return set
}
