export type KgTheme = 'light' | 'dark'

export type KgTokenDef = {
  cssVar: `--kg-${string}`
  light: string
  dark: string
}

export const AG_TOKEN_DEFS: readonly KgTokenDef[] = [
  { cssVar: '--kg-app-bg', light: '#f3f4f6', dark: '#020617' },
  { cssVar: '--kg-surface-bg', light: '#ffffff', dark: '#0b1220' },
  { cssVar: '--kg-panel-bg', light: '#ffffff', dark: '#020b2a' },
  { cssVar: '--kg-panel-bg-hover', light: '#f9fafb', dark: 'rgba(11, 18, 32, 0.85)' },
  { cssVar: '--kg-border', light: '#e5e7eb', dark: '#4b5563' },
  { cssVar: '--kg-divider', light: '#d1d5db', dark: '#4b5563' },
  { cssVar: '--kg-text-primary', light: '#111827', dark: '#f3f4f6' },
  { cssVar: '--kg-text-secondary', light: '#4b5563', dark: '#9ca3af' },
  { cssVar: '--kg-text-tertiary', light: '#6b7280', dark: '#6b7280' },
  { cssVar: '--kg-tooltip-bg', light: '#111827', dark: '#0b1220' },
  { cssVar: '--kg-tooltip-text', light: '#ffffff', dark: '#f3f4f6' },
  { cssVar: '--kg-code-bg', light: '#f8fafc', dark: 'rgba(2, 6, 23, 0.6)' },
  { cssVar: '--kg-code-border', light: '#e2e8f0', dark: '#1e293b' },
  { cssVar: '--kg-code-text', light: '#0f172a', dark: '#e2e8f0' },
  { cssVar: '--kg-control-height', light: '28px', dark: '28px' },
  { cssVar: '--kg-status-pill-height', light: '24px', dark: '24px' },
  { cssVar: '--kg-table-row-height', light: '44px', dark: '44px' },
  { cssVar: '--kg-canvas-bg', light: '#f3f4f6', dark: '#020617' },
  { cssVar: '--kg-canvas-node-stroke', light: '#ffffff', dark: '#0b1220' },
  { cssVar: '--kg-canvas-edge-stroke', light: '#9ca3af', dark: '#4b5563' },
  { cssVar: '--kg-canvas-accent', light: '#3b82f6', dark: '#60a5fa' },
  { cssVar: '--kg-canvas-label-halo', light: '#f3f4f6', dark: '#020617' },
  { cssVar: '--kg-canvas-label-fill', light: '#111827', dark: '#e5e7eb' },
  { cssVar: '--kg-canvas-grid-minor', light: '#111827', dark: '#f3f4f6' },
  { cssVar: '--kg-canvas-grid-major', light: '#111827', dark: '#f3f4f6' },
  { cssVar: '--kg-media-panel-bg', light: '#ffffff', dark: '#020b2a' },
  { cssVar: '--kg-media-panel-header-bg', light: '#f9fafb', dark: 'rgba(11, 18, 32, 0.75)' },
  { cssVar: '--kg-statusbar-bg', light: '#f9fafb', dark: 'rgba(11, 18, 32, 0.85)' },
  { cssVar: '--kg-statusbar-text', light: '#4b5563', dark: '#9ca3af' },
  { cssVar: '--kg-kanban-group-bg', light: '#f8fafc', dark: 'rgba(11, 18, 32, 0.7)' },
  { cssVar: '--kg-kanban-card-bg', light: '#ffffff', dark: '#020b2a' },
  { cssVar: '--kg-kanban-card-bg-hover', light: '#f9fafb', dark: 'rgba(11, 18, 32, 0.85)' },
  { cssVar: '--kg-kanban-cell-bg', light: '#f8fafc', dark: 'rgba(2, 6, 23, 0.55)' },
  { cssVar: '--kg-kanban-card-radius', light: '12px', dark: '12px' },
  { cssVar: '--kg-kanban-card-shadow', light: '0 1px 2px rgba(0,0,0,0.06)', dark: '0 1px 2px rgba(0,0,0,0.35)' },
  { cssVar: '--kg-kanban-card-shadow-hover', light: '0 10px 24px rgba(0,0,0,0.10)', dark: '0 12px 30px rgba(0,0,0,0.50)' },
  { cssVar: '--kg-panel-action-bg', light: 'rgba(0,0,0,0.04)', dark: 'rgba(255,255,255,0.06)' },
  { cssVar: '--kg-panel-action-bg-hover', light: '#fffbeb', dark: 'var(--kg-canvas-accent, #60a5fa)' },
] as const

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
