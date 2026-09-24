import { LS_KEYS } from '@/lib/config'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>
export type DarkThemeVariant = 'black' | 'dark-blue'

export const DARK_THEME_VARIANT_OPTIONS: ReadonlyArray<{ value: DarkThemeVariant; label: string }> = [
  { value: 'black', label: 'Black (Default)' },
  { value: 'dark-blue', label: 'Dark Blue' },
] as const

export const isDarkThemeVariant = (value: unknown): value is DarkThemeVariant =>
  value === 'black' || value === 'dark-blue'

export const THEME_MODE_OPTIONS: ReadonlyArray<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
] as const

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemeModeLabel(mode: ThemeMode): string {
  return THEME_MODE_OPTIONS.find(option => option.mode === mode)?.label || mode
}

export function getNextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODE_OPTIONS.findIndex(option => option.mode === mode)
  const next = THEME_MODE_OPTIONS[(index + 1) % THEME_MODE_OPTIONS.length]
  return next?.mode || 'system'
}

export function getInitialThemeMode(storage: Storage | null, fallback: ThemeMode = 'system'): ThemeMode {
  if (!storage) return fallback
  try {
    const stored = storage.getItem(LS_KEYS.themeMode)
    if (isThemeMode(stored)) return stored
  } catch {
    void 0
  }
  return fallback
}

export function persistThemeMode(storage: Storage | null, mode: ThemeMode): void {
  if (!storage) return
  try {
    storage.setItem(LS_KEYS.themeMode, mode)
  } catch {
    void 0
  }
}

export function getInitialDarkThemeVariant(
  storage: Storage | null,
  mode: ThemeMode,
): DarkThemeVariant {
  if (!storage) return 'black'
  try {
    const stored = storage.getItem(LS_KEYS.darkThemeVariant)
    if (isDarkThemeVariant(stored)) return stored
    // Existing saved Dark sessions retain their original blue palette.
    if (stored === null && mode === 'dark') {
      try {
        storage.setItem(LS_KEYS.darkThemeVariant, 'dark-blue')
      } catch {
        void 0
      }
      return 'dark-blue'
    }
  } catch {
    void 0
  }
  return 'black'
}

export function persistDarkThemeVariant(storage: Storage | null, variant: DarkThemeVariant): void {
  if (!storage) return
  try {
    storage.setItem(LS_KEYS.darkThemeVariant, variant)
  } catch {
    void 0
  }
}

export function getSystemTheme(): ResolvedThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  return mq.matches ? 'dark' : 'light'
}

export function applyThemeMode(mode: ThemeMode, variant: DarkThemeVariant = 'black'): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = mode === 'system' ? getSystemTheme() : mode
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-dark-variant', variant)
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  return mode === 'system' ? getSystemTheme() : mode
}

export function subscribeToSystemThemeChanges(onChange: (resolved: ResolvedThemeMode) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => void 0
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange(mq.matches ? 'dark' : 'light')
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }
  mq.addListener(handler)
  return () => mq.removeListener(handler)
}
