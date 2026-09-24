import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LS_KEYS } from '@/lib/config'
import { applyThemeMode, DARK_THEME_VARIANT_OPTIONS, getInitialDarkThemeVariant, getInitialThemeMode, getNextThemeMode, getThemeModeLabel, isThemeMode, persistDarkThemeVariant, subscribeToSystemThemeChanges, THEME_MODE_OPTIONS, ThemeMode } from '@/lib/ui/theme'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { JSDOM } from 'jsdom'

export function testThemeModePersistence() {
  if (LS_KEYS.themeMode !== 'kg:ui:themeMode') {
    throw new Error('themeMode key mismatch')
  }

  const optionModes = THEME_MODE_OPTIONS.map(option => option.mode).join(',')
  if (optionModes !== 'system,light,dark') {
    throw new Error('expected shared theme mode options to expose System, Light, Dark in toolbar order')
  }
  if (!THEME_MODE_OPTIONS.every(option => isThemeMode(option.mode))) {
    throw new Error('expected shared theme mode options to only contain valid theme modes')
  }
  if (getNextThemeMode('system') !== 'light' || getNextThemeMode('light') !== 'dark' || getNextThemeMode('dark') !== 'system') {
    throw new Error('expected single-button theme cycle to follow System, Light, Dark')
  }
  if (getThemeModeLabel('system') !== 'System' || getThemeModeLabel('light') !== 'Light' || getThemeModeLabel('dark') !== 'Dark') {
    throw new Error('expected theme mode labels to come from the shared theme mode options')
  }

  const storage = new MemoryStorage()

  storage.setItem(LS_KEYS.themeMode, 'light')
  let mode: ThemeMode = getInitialThemeMode(storage, 'system')
  if (mode !== 'light') {
    throw new Error('expected light when storage contains light')
  }

  storage.setItem(LS_KEYS.themeMode, 'dark')
  mode = getInitialThemeMode(storage, 'system')
  if (mode !== 'dark') {
    throw new Error('expected dark when storage contains dark')
  }

  storage.setItem(LS_KEYS.themeMode, 'system')
  mode = getInitialThemeMode(storage, 'light')
  if (mode !== 'system') {
    throw new Error('expected system when storage contains system')
  }

  storage.setItem(LS_KEYS.themeMode, 'other')
  mode = getInitialThemeMode(storage, 'dark')
  if (mode !== 'dark') {
    throw new Error('expected fallback for invalid value')
  }

  const emptyStorage = new MemoryStorage()
  const fallbackMode: ThemeMode = getInitialThemeMode(emptyStorage, 'light')
  if (fallbackMode !== 'light') {
    throw new Error('expected fallback when storage is empty')
  }
  if (LS_KEYS.darkThemeVariant !== 'kg:ui:darkThemeVariant') throw new Error('dark variant key mismatch')
  if (DARK_THEME_VARIANT_OPTIONS.map(option => option.label).join(',') !== 'Black (Default),Dark Blue') {
    throw new Error('dark variant labels must be shared')
  }
  if (getInitialDarkThemeVariant(emptyStorage, 'system') !== 'black') {
    throw new Error('fresh sessions must prefer black')
  }
  const legacy = new MemoryStorage()
  legacy.setItem(LS_KEYS.themeMode, 'dark')
  if (getInitialDarkThemeVariant(legacy, 'dark') !== 'dark-blue'
    || legacy.getItem(LS_KEYS.darkThemeVariant) !== 'dark-blue') {
    throw new Error('legacy saved dark sessions must preserve blue and migrate once')
  }
  persistDarkThemeVariant(legacy, 'black')
  if (getInitialDarkThemeVariant(legacy, 'dark') !== 'black') {
    throw new Error('an explicit black preference must survive reload')
  }
  const writeDenied = {
    getItem: () => null,
    setItem: () => { throw new Error('quota denied') },
  } as unknown as Storage
  if (getInitialDarkThemeVariant(writeDenied, 'dark') !== 'dark-blue') {
    throw new Error('readable legacy Dark must stay blue when migration cannot persist')
  }
  legacy.setItem(LS_KEYS.darkThemeVariant, 'invalid')
  if (getInitialDarkThemeVariant(legacy, 'dark') !== 'black') {
    throw new Error('invalid dark variants must fail to the safe default')
  }
}

export function testThemeSystemModeApplyAndSubscribe() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  const prevWindow = g.window
  const prevDocument = g.document

  let mqListener: ((ev: Event) => void) | null = null
  const mq = {
    matches: false,
    addEventListener: (_: string, cb: (ev: Event) => void) => { mqListener = cb },
    removeEventListener: (_: string, cb: (ev: Event) => void) => { if (mqListener === cb) mqListener = null },
  }
  ;(dom.window as unknown as { matchMedia?: unknown }).matchMedia = () => mq as unknown as MediaQueryList

  g.window = dom.window
  g.document = dom.window.document

  const seen: string[] = []
  const unsub = subscribeToSystemThemeChanges((resolved) => {
    seen.push(resolved)
    applyThemeMode('system')
  })

  applyThemeMode('system')
  const root = dom.window.document.documentElement
  if (root.getAttribute('data-theme') !== 'light') {
    throw new Error('expected system-resolved theme to start as light')
  }
  if (root.classList.contains('dark')) {
    throw new Error('expected no dark class when resolved theme is light')
  }
  if (root.getAttribute('data-dark-variant') !== 'black') {
    throw new Error('fresh system mode must carry the black preference')
  }

  mq.matches = true
  if (mqListener) mqListener(new dom.window.Event('change'))

  if (!seen.includes('dark')) {
    throw new Error('expected system theme subscription to emit dark')
  }
  if (root.getAttribute('data-theme') !== 'dark') {
    throw new Error('expected system-resolved theme to update to dark')
  }
  if (!root.classList.contains('dark')) {
    throw new Error('expected dark class when resolved theme is dark')
  }
  applyThemeMode('dark', 'dark-blue')
  if (root.getAttribute('data-dark-variant') !== 'dark-blue') {
    throw new Error('dark blue must be applied without changing the mode')
  }
  applyThemeMode('light', 'dark-blue')
  applyThemeMode('dark', 'dark-blue')
  if (root.getAttribute('data-dark-variant') !== 'dark-blue') {
    throw new Error('light mode must retain the dark preference')
  }

  unsub()

  g.window = prevWindow
  g.document = prevDocument
}

export async function testNativeMonacoDarkVariants() {
  const { setNativeMonacoTheme } = await import('@/lib/monaco/theme')
  const { getKgThemeFromDom, getKgTokenFallback, readRootCssStateKey } = await import('@/lib/ui/tokens-ssot')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const globals = globalThis as unknown as { window?: unknown; document?: unknown }
  const previous = { window: globals.window, document: globals.document }
  globals.window = dom.window
  globals.document = dom.window.document
  try {
    const selected: string[] = []
    const defined: Array<{ id: string; data: { colors: Record<string, string> } }> = []
    const monaco = { editor: {
      setTheme: (id: string) => selected.push(id),
      defineTheme: (id: string, data: { colors: Record<string, string> }) => defined.push({ id, data }),
    } } as unknown as Parameters<typeof setNativeMonacoTheme>[0]
    applyThemeMode('dark', 'black')
    const blackCssKey = readRootCssStateKey()
    if (getKgThemeFromDom() !== 'black') throw new Error('black DOM palette was not resolved')
    setNativeMonacoTheme(monaco, 'dark', 'black')
    if (selected.at(-1) !== 'kg-dark-black'
      || defined.at(-1)?.data.colors['editor.background'] !== getKgTokenFallback('--kg-code-bg', 'black')) {
      throw new Error('Monaco black palette must consume the shared code surface')
    }
    applyThemeMode('dark', 'dark-blue')
    if (readRootCssStateKey() === blackCssKey) {
      throw new Error('native canvas CSS cache must invalidate when the dark variant changes')
    }
    if (getKgThemeFromDom() !== 'dark') throw new Error('dark-blue DOM palette was not resolved')
    setNativeMonacoTheme(monaco, 'dark', 'dark-blue')
    if (selected.at(-1) !== 'vs-dark') throw new Error('saved blue editors must retain their native palette')
    setNativeMonacoTheme(monaco, 'light', 'black')
    if (selected.at(-1) !== 'vs') throw new Error('light editors must retain their native palette')
  } finally {
    globals.window = previous.window
    globals.document = previous.document
  }
}

export function testToolbarThemeUsesSingleSharedCycleButton() {
  const root = process.cwd()
  const toolbar = readFileSync(resolve(root, 'src/components/Toolbar.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/features/toolbar/hooks/useToolbarActions.ts'), 'utf8')

  if (!toolbar.includes('data-kg-theme-mode-control="toggle"') || !toolbar.includes('onClick={actions.handleToggleTheme}')) {
    throw new Error('expected Toolbar Theme to render one shared System/Light/Dark cycle button')
  }
  if (toolbar.includes('ThemeModeSegmentedControl') || toolbar.includes('data-kg-theme-mode-control="segmented"')) {
    throw new Error('expected Toolbar Theme to avoid the rejected segmented toolbar control')
  }
  if (!actions.includes('handleToggleTheme') || !actions.includes('getNextThemeMode(themeMode)') || actions.includes('handleSetThemeMode')) {
    throw new Error('expected toolbar theme actions to cycle through shared theme mode options')
  }
}
