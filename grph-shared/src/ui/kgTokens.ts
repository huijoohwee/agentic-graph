import { renderKgTokensCss, type KgTheme, type KgTokenDef, type KgTokenType } from './kgTokenContract.js'
export * from './kgTokenContract.js'

const token = (name: string, light: string, dark: string, purpose: string,
  type: KgTokenType = 'color', references?: KgTokenDef['references']): KgTokenDef => ({
  name, cssVar: `--kg-${name}`, type, purpose, light, dark, ...(references ? { references } : {}),
})

// Order and literals preserve the existing application CSS. The former 12px radius fallback
// is reconciled here to the rendered 0.5rem value; CSS-only colors now share this owner.
export const AG_TOKEN_DEFS: readonly KgTokenDef[] = [
  token('app-bg', '#f3f4f6', '#020617', 'Application background'),
  token('surface-bg', '#ffffff', '#0b1220', 'Raised surface'),
  token('panel-bg', '#ffffff', '#020b2a', 'Panel background'),
  token('panel-bg-hover', '#f9fafb', 'rgba(11, 18, 32, 0.85)', 'Hovered panel'),
  token('border', '#e5e7eb', '#4b5563', 'Surface border'),
  token('divider', '#d1d5db', '#4b5563', 'Content divider'),
  token('text-primary', '#111827', '#f3f4f6', 'Primary text'),
  token('text-secondary', '#4b5563', '#9ca3af', 'Supporting text'),
  token('text-tertiary', '#6b7280', '#6b7280', 'Subtle text'),
  token('tooltip-bg', '#000000', '#000000', 'Tooltip background'),
  token('tooltip-text', '#ffffff', '#ffffff', 'Tooltip text'),
  token('code-bg', '#f8fafc', 'rgba(2, 6, 23, 0.6)', 'Code background'),
  token('code-border', '#e2e8f0', '#1e293b', 'Code border'),
  token('code-text', '#0f172a', '#e2e8f0', 'Code text'),
  token('control-height', '28px', '28px', 'Default control height', 'dimension'),
  token('status-pill-height', '24px', '24px', 'Status pill height', 'dimension'),
  token('table-row-height', '44px', '44px', 'Table row height', 'dimension'),
  token('focus-ring', '#3b82f6', '#60a5fa', 'Keyboard focus outline'),
  token('accent', '#3b82f6', '#60a5fa', 'Interactive accent'),
  token('accent-contrast', '#ffffff', '#020617', 'Text on accent'),
  token('accent-border', '#3b82f6', '#60a5fa', 'Accent border'),
  token('accent-soft-bg', 'rgba(59, 130, 246, 0.12)', 'rgba(96, 165, 250, 0.16)', 'Subtle accent background'),
  token('accent-strong-bg', '#3b82f6', '#60a5fa', 'Strong accent background'),
  token('focus-ring-offset', '#ffffff', '#020b2a', 'Focus outline separation'),
  token('table-header-bg', '#f9fafb', 'rgba(11, 18, 32, 0.75)', 'Table header background'),
  token('table-row-hover-bg', '#f9fafb', 'rgba(11, 18, 32, 0.85)', 'Hovered table row'),
  token('table-row-selected-bg', 'rgba(59, 130, 246, 0.12)', 'rgba(96, 165, 250, 0.16)', 'Selected table row'),
  token('table-row-related-bg', 'rgba(59, 130, 246, 0.06)', 'rgba(96, 165, 250, 0.08)', 'Related table row'),
  token('canvas-bg', '#f3f4f6', '#020617', 'Canvas background'),
  token('canvas-node-stroke', '#ffffff', '#0b1220', 'Canvas node outline'),
  token('canvas-edge-stroke', '#9ca3af', '#4b5563', 'Canvas edge stroke'),
  token('canvas-accent', '#3b82f6', '#60a5fa', 'Canvas interaction accent'),
  token('canvas-label-halo', '#f3f4f6', '#020617', 'Canvas label backdrop'),
  token('canvas-label-fill', '#111827', '#e5e7eb', 'Canvas label text'),
  token('canvas-grid-minor', '#111827', '#f3f4f6', 'Minor canvas grid'),
  token('canvas-grid-major', '#111827', '#f3f4f6', 'Major canvas grid'),
  token('media-panel-bg', '#ffffff', '#020b2a', 'Media panel background'),
  token('media-panel-header-bg', '#f9fafb', 'rgba(11, 18, 32, 0.75)', 'Media panel header'),
  token('statusbar-bg', '#f9fafb', 'rgba(11, 18, 32, 0.85)', 'Status bar background'),
  token('statusbar-text', '#4b5563', '#9ca3af', 'Status bar text'),
  token('kanban-group-bg', '#f8fafc', 'rgba(11, 18, 32, 0.7)', 'Kanban group background'),
  token('kanban-card-bg', '#ffffff', '#020b2a', 'Kanban card background'),
  token('kanban-card-bg-hover', '#f9fafb', 'rgba(11, 18, 32, 0.85)', 'Hovered kanban card'),
  token('kanban-cell-bg', '#f8fafc', 'rgba(2, 6, 23, 0.55)', 'Kanban cell background'),
  token('kanban-card-radius', '0.5rem', '0.5rem', 'Kanban card corner radius', 'dimension'),
  token('kanban-card-shadow', '0 1px 2px rgba(0,0,0,0.06)', '0 1px 2px rgba(0,0,0,0.35)', 'Kanban card elevation', 'shadow'),
  token('kanban-card-shadow-hover', '0 10px 24px rgba(0,0,0,0.10)', '0 12px 30px rgba(0,0,0,0.50)', 'Hovered card elevation', 'shadow'),
  token('panel-action-bg', 'rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)', 'Panel action background'),
  token('panel-action-bg-hover', '#fffbeb', 'var(--kg-canvas-accent, #60a5fa)', 'Hovered panel action', 'color', { dark: 'canvas-accent' }),
]

export const buildKgTokensCssText = (theme: KgTheme, options: { selector?: string } = {}): string =>
  renderKgTokensCss(AG_TOKEN_DEFS, theme, options.selector ?? (theme === 'dark' ? ":root[data-theme='dark']" : ':root'), true)

export const getKgThemeFromDom = (): KgTheme => {
  if (typeof document === 'undefined') return 'light'
  const raw = String(document.documentElement.getAttribute('data-theme') || '').trim()
  if (raw === 'dark') return 'dark'
  if (document.documentElement.classList.contains('dark')) return 'dark'
  return 'light'
}

export const getKgTokenFallback = (cssVar: KgTokenDef['cssVar'], theme: KgTheme): string => {
  const def = AG_TOKEN_DEFS.find(d => d.cssVar === cssVar)
  if (!def) return ''
  return theme === 'dark' ? def.dark : def.light
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
    const next = t === 'dark' ? def.dark : def.light
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
