import { useGraphStore } from '@/hooks/useGraphStore'
import { DARK_THEME_VARIANT_OPTIONS, isDarkThemeVariant, type ThemeMode } from '@/lib/ui/theme'
import type { SettingMeta } from './types'

const store = () => useGraphStore.getState()

export const themeSettingsRegistry: SettingMeta[] = [
  {
    key: 'themeMode', type: 'string', source: 'store', backingImports: ['tailwindcss'],
    read: () => store().themeMode,
    write: value => {
      const raw = String(value || '')
      const next: ThemeMode = raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
      store().setThemeMode(next)
    },
    docKey: 'themeMode', default: () => 'system', options: ['light', 'dark', 'system'],
  },
  {
    key: 'darkThemeVariant', type: 'string', source: 'store',
    read: () => DARK_THEME_VARIANT_OPTIONS.find(option => option.value === store().darkThemeVariant)?.label ?? 'Black (Default)',
    write: value => store().setDarkThemeVariant(
      value === 'Dark Blue' || value === 'dark-blue' ? 'dark-blue' : isDarkThemeVariant(value) ? value : 'black',
    ),
    docKey: 'darkThemeVariant', default: () => 'Black (Default)',
    options: DARK_THEME_VARIANT_OPTIONS.map(option => option.label),
  },
]
