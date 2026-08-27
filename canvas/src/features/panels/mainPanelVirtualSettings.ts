import type { SettingMeta, SettingType } from '@/features/settings/types'
import {
  getLocalStorage,
  readJsonFromStorage,
  writeJsonToStorage,
} from '@/lib/persistence'

const MAIN_PANEL_VIRTUAL_SETTING_STORAGE_PREFIX = 'kg:main-panel:virtual:'

type VirtualSettingValue = string | number | boolean
type VirtualSettingKind = 'request' | 'reference'

const EXPLANATORY_DEFAULT_PREFIX_PATTERN =
  /^(required|optional|default|states|documents|pins|keeps|explains|maintains|defines|validates|configures|allows|requires|harness provider|generation strategy|multi-scene|longer narrative|agenticgraph preserves)\b/i

function normalizeStorageKey(settingKey: string): string {
  return `${MAIN_PANEL_VIRTUAL_SETTING_STORAGE_PREFIX}${String(settingKey || '').trim()}`
}

export function isMainPanelVirtualSettingConfigDefault(value: string): boolean {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized === '-' || normalized === '—') return false
  if (normalized.length > 64) return false
  if (EXPLANATORY_DEFAULT_PREFIX_PATTERN.test(normalized)) return false
  if (normalized.includes('->')) return false
  if (normalized.includes('|')) return false
  if (normalized.includes(' or ')) return false
  if (normalized.includes(', ')) return false
  if (/[.!?](?:\s|$)/.test(normalized)) return false
  return true
}

function normalizeInitialValue(args: {
  type: SettingType
  fallbackValue: string | number | boolean | null | undefined
  defaultValue?: string | number | boolean | null
  kind?: VirtualSettingKind
}): VirtualSettingValue {
  const { type, fallbackValue, defaultValue, kind = 'request' } = args
  if (kind === 'reference') {
    if (type === 'boolean') {
      if (typeof defaultValue === 'boolean') return defaultValue
      if (typeof fallbackValue === 'boolean') return fallbackValue
      return false
    }
    if (type === 'number') {
      if (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) return defaultValue
      if (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)) return fallbackValue
      return 0
    }
    if (typeof defaultValue === 'string') return defaultValue
    if (typeof fallbackValue === 'string') return fallbackValue
    if (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)) return String(fallbackValue)
    if (typeof fallbackValue === 'boolean') return fallbackValue ? 'true' : 'false'
    return ''
  }
  if (type === 'boolean') {
    if (typeof defaultValue === 'boolean') return defaultValue
    return false
  }
  if (type === 'number') {
    if (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) return defaultValue
    return 0
  }
  if (type === 'json') {
    if (typeof defaultValue === 'string') {
      const normalizedDefault = defaultValue.trim()
      if (
        normalizedDefault === 'null'
        || normalizedDefault.startsWith('{')
        || normalizedDefault.startsWith('[')
      ) {
        return normalizedDefault
      }
    }
    return ''
  }
  if (typeof defaultValue === 'string') {
    const normalizedDefault = defaultValue.trim()
    if (isMainPanelVirtualSettingConfigDefault(normalizedDefault)) {
      return normalizedDefault
    }
  }
  return ''
}

function readStoredValue(args: {
  key: string
  type: SettingType
  fallbackValue: VirtualSettingValue
}): VirtualSettingValue {
  const storage = getLocalStorage()
  const storageKey = normalizeStorageKey(args.key)
  if (args.type === 'boolean') {
    return readJsonFromStorage<boolean>(storage, storageKey, Boolean(args.fallbackValue), raw => (
      typeof raw === 'boolean' ? raw : null
    ))
  }
  if (args.type === 'number') {
    return readJsonFromStorage<number>(storage, storageKey, Number(args.fallbackValue) || 0, raw => (
      typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    ))
  }
  return readJsonFromStorage<string>(storage, storageKey, String(args.fallbackValue ?? ''), raw => {
    if (typeof raw === 'string') return raw
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    return null
  })
}

function writeStoredValue(args: {
  key: string
  type: SettingType
  value: string | number | boolean
}): void {
  const storage = getLocalStorage()
  const storageKey = normalizeStorageKey(args.key)
  if (args.type === 'boolean') {
    writeJsonToStorage(storage, storageKey, Boolean(args.value))
    return
  }
  if (args.type === 'number') {
    const next = Number(args.value)
    writeJsonToStorage(storage, storageKey, Number.isFinite(next) ? next : 0)
    return
  }
  writeJsonToStorage(storage, storageKey, String(args.value ?? ''))
}

export function getMainPanelVirtualSettingStorageKey(settingKey: string): string {
  return normalizeStorageKey(settingKey)
}

export function normalizeMainPanelVirtualSettingType(type: string): SettingType {
  const normalized = String(type || '').trim().toLowerCase()
  if (normalized === 'boolean') return 'boolean'
  if (normalized === 'number') return 'number'
  if (normalized === 'json') return 'json'
  return 'string'
}

export function buildMainPanelVirtualSettingMeta(args: {
  key: string
  type: string
  fallbackValue: string | number | boolean | null | undefined
  defaultValue?: string | number | boolean | null
  options?: string[]
  kind?: VirtualSettingKind
}): SettingMeta {
  const type = normalizeMainPanelVirtualSettingType(args.type)
  const initialValue = normalizeInitialValue({
    type,
    fallbackValue: args.fallbackValue,
    defaultValue: args.defaultValue,
    kind: args.kind,
  })
  return {
    key: args.key,
    type,
    source: 'localStorage',
    read: () => readStoredValue({
      key: args.key,
      type,
      fallbackValue: initialValue,
    }),
    write: value => {
      writeStoredValue({
        key: args.key,
        type,
        value,
      })
    },
    default: () => initialValue,
    options: args.options,
  }
}
