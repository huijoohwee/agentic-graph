import type { LsStorageKey, SessionStorageKey, StorageChannelKey } from '@/lib/config'
import { scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'

const LS_COALESCED_WRITE_DELAY_MS = 80
const LS_COALESCED_TASK_PREFIX = 'ls:coalesced'
const STORAGE_SCOPE_PREFIX = 'kg:scope:'

const scopedStorageProxyByStorage = new WeakMap<Storage, Storage>()

const normalizeStorageScopeBasePath = (raw: string | null | undefined): string => {
  const trimmed = String(raw || '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const collapsed = withLeading.replace(/\/{2,}/g, '/')
  return collapsed.endsWith('/') ? collapsed : `${collapsed}/`
}

const readStorageScopeBasePath = (): string => {
  try {
    const envBaseUrl = (
      import.meta as unknown as { env?: { BASE_URL?: unknown } }
    )?.env?.BASE_URL
    if (typeof envBaseUrl === 'string' && envBaseUrl.trim()) {
      return normalizeStorageScopeBasePath(envBaseUrl)
    }
  } catch {
    void 0
  }
  return '/'
}

const getStorageScopePrefix = (): string | null => {
  const basePath = readStorageScopeBasePath()
  if (basePath === '/') return null
  return `${STORAGE_SCOPE_PREFIX}${basePath}::`
}

export const resolveBrowserStorageKey = (key: string): string => {
  const safeKey = String(key || '').trim()
  if (!safeKey) return ''
  const scopePrefix = getStorageScopePrefix()
  if (!scopePrefix) return safeKey
  if (safeKey.startsWith(scopePrefix)) return safeKey
  return `${scopePrefix}${safeKey}`
}

const scopeStorageKey = (key: string): string => {
  const resolved = resolveBrowserStorageKey(key)
  return resolved || String(key || '')
}

const wrapScopedStorage = (storage: Storage | null): Storage | null => {
  if (!storage) return null
  const scopePrefix = getStorageScopePrefix()
  if (!scopePrefix) return storage
  const cached = scopedStorageProxyByStorage.get(storage)
  if (cached) return cached
  const proxy = new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === 'getItem') return (key: string) => target.getItem(scopeStorageKey(key))
      if (prop === 'setItem') return (key: string, value: string) => target.setItem(scopeStorageKey(key), value)
      if (prop === 'removeItem') return (key: string) => target.removeItem(scopeStorageKey(key))
      if (prop === 'key') {
        return (index: number) => {
          const keys: string[] = []
          for (let i = 0; i < target.length; i += 1) {
            const key = target.key(i)
            if (typeof key !== 'string' || !key.startsWith(scopePrefix)) continue
            keys.push(key.slice(scopePrefix.length))
          }
          return keys[index] ?? null
        }
      }
      if (prop === 'length') {
        let count = 0
        for (let i = 0; i < target.length; i += 1) {
          const key = target.key(i)
          if (typeof key === 'string' && key.startsWith(scopePrefix)) count += 1
        }
        return count
      }
      if (prop === 'clear') {
        return () => {
          const keysToRemove: string[] = []
          for (let i = 0; i < target.length; i += 1) {
            const key = target.key(i)
            if (typeof key === 'string' && key.startsWith(scopePrefix)) {
              keysToRemove.push(key)
            }
          }
          for (const key of keysToRemove) target.removeItem(key)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Storage
  scopedStorageProxyByStorage.set(storage, proxy)
  return proxy
}

export function readNumFromStorage(storage: Storage | null, key: string, fallback: number): number {
  if (!storage) return fallback
  try {
    const v = parseFloat(storage.getItem(scopeStorageKey(key)) || '')
    if (isNaN(v)) return fallback
    const x = Math.max(0, Math.min(1, v))
    return x
  } catch {
    return fallback
  }
}

export function writeNumToStorage(storage: Storage | null, key: string, value: number): number {
  const x = Math.max(0, Math.min(1, value))
  if (!storage) return x
  try {
    storage.setItem(scopeStorageKey(key), String(x))
  } catch (err) {
    void err
  }
  return x
}

export function readBoolFromStorage(storage: Storage | null, key: string, fallback: boolean): boolean {
  if (!storage) return fallback
  try {
    const v = storage.getItem(scopeStorageKey(key))
    if (v === null) return fallback
    return v === '1' || v === 'true'
  } catch {
    return fallback
  }
}

export function writeBoolToStorage(storage: Storage | null, key: string, value: boolean): boolean {
  const next = !!value
  if (!storage) return next
  try {
    storage.setItem(scopeStorageKey(key), next ? '1' : '0')
  } catch (err) {
    void err
  }
  return next
}

export function readIntFromStorage(storage: Storage | null, key: string, fallback: number): number {
  if (!storage) return fallback
  try {
    const v = parseInt(storage.getItem(scopeStorageKey(key)) || '', 10)
    if (isNaN(v)) return fallback
    return v
  } catch {
    return fallback
  }
}

export function readFloatFromStorage(
  storage: Storage | null,
  key: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  if (!storage) return fallback
  try {
    const v = parseFloat(storage.getItem(scopeStorageKey(key)) || '')
    if (!Number.isFinite(v)) return fallback
    const min = typeof opts?.min === 'number' && Number.isFinite(opts.min) ? opts.min : -Number.MAX_SAFE_INTEGER
    const max = typeof opts?.max === 'number' && Number.isFinite(opts.max) ? opts.max : Number.MAX_SAFE_INTEGER
    return Math.max(min, Math.min(max, v))
  } catch {
    return fallback
  }
}

export function writeFloatToStorage(
  storage: Storage | null,
  key: string,
  value: number,
  opts?: { min?: number; max?: number },
): number {
  const safe = Number.isFinite(value) ? value : 0
  const min = typeof opts?.min === 'number' && Number.isFinite(opts.min) ? opts.min : -Number.MAX_SAFE_INTEGER
  const max = typeof opts?.max === 'number' && Number.isFinite(opts.max) ? opts.max : Number.MAX_SAFE_INTEGER
  const x = Math.max(min, Math.min(max, safe))
  if (!storage) return x
  try {
    storage.setItem(scopeStorageKey(key), String(x))
  } catch {
    void 0
  }
  return x
}

export function writeIntToStorage(
  storage: Storage | null,
  key: string,
  value: number,
  opts?: { min?: number; max?: number },
): number {
  const min = typeof opts?.min === 'number' ? opts.min : 1
  const max = typeof opts?.max === 'number' ? opts.max : 1024
  const x = Math.max(min, Math.min(max, Math.floor(value)))
  if (!storage) return x
  try {
    storage.setItem(scopeStorageKey(key), String(x))
  } catch (err) {
    void err
  }
  return x
}

export function readJsonFromStorage<T>(
  storage: Storage | null,
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | null,
): T {
  if (!storage) return fallback
  try {
    const raw = storage.getItem(scopeStorageKey(key))
    if (!raw) return fallback
    const parsed = parse(JSON.parse(raw) as unknown)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeJsonToStorage<T>(storage: Storage | null, key: string, value: T): T {
  if (!storage) return value
  try {
    storage.setItem(scopeStorageKey(key), JSON.stringify(value))
  } catch {
    void 0
  }
  return value
}

export const getLocalStorage = (): Storage | null => {
  try {
    const storage = typeof window === 'undefined' ? null : window.localStorage
    return wrapScopedStorage(storage)
  } catch {
    return null
  }
}

export const lsNum = (key: LsStorageKey, fallback: number) => {
  const storage = getLocalStorage()
  return readNumFromStorage(storage, key, fallback)
};

export const lsSetNum = (key: LsStorageKey, value: number) => {
  const storage = getLocalStorage()
  return writeNumToStorage(storage, key, value)
};

export const lsBool = (key: LsStorageKey, fallback: boolean) => {
  const storage = getLocalStorage()
  return readBoolFromStorage(storage, key, fallback)
};

export const lsSetBool = (key: LsStorageKey, value: boolean) => {
  const storage = getLocalStorage()
  return writeBoolToStorage(storage, key, value)
};

export const lsInt = (key: LsStorageKey, fallback: number) => {
  const storage = getLocalStorage()
  return readIntFromStorage(storage, key, fallback)
};

export const lsSetInt = (key: LsStorageKey, value: number, opts?: { min?: number; max?: number }) => {
  const storage = getLocalStorage()
  return writeIntToStorage(storage, key, value, opts)
};

export const lsFloat = (key: LsStorageKey, fallback: number, opts?: { min?: number; max?: number }) => {
  const storage = getLocalStorage()
  return readFloatFromStorage(storage, key, fallback, opts)
}

export const lsSetFloat = (key: LsStorageKey, value: number, opts?: { min?: number; max?: number }) => {
  const storage = getLocalStorage()
  return writeFloatToStorage(storage, key, value, opts)
}

export const lsJson = <T>(key: LsStorageKey, fallback: T, parse: (raw: unknown) => T | null) => {
  const storage = getLocalStorage()
  return readJsonFromStorage(storage, key, fallback, parse)
};

export const lsSetJson = <T>(key: LsStorageKey, value: T) => {
  const storage = getLocalStorage()
  return writeJsonToStorage(storage, key, value)
};

type CoalescedWriteOptions = {
  delayMs?: number
  /** Legacy caller hint; current storage bytes determine whether a write is redundant. */
  signature?: string | null
}

const scheduleStorageWrite = (
  key: LsStorageKey,
  kind: 'json' | 'int' | 'bool',
  serialize: () => string,
  opts?: CoalescedWriteOptions,
): void => {
  const safeKey = String(key || '').trim()
  if (!safeKey) return
  const delayMs = typeof opts?.delayMs === 'number' && Number.isFinite(opts.delayMs)
    ? Math.max(0, Math.floor(opts.delayMs)) : LS_COALESCED_WRITE_DELAY_MS
  // Coalesce pending values, but never let an executed signature stand in for current storage.
  scheduleWorkspaceSyncTask(`${LS_COALESCED_TASK_PREFIX}:${kind}:${safeKey}`, () => {
    const storage = getLocalStorage()
    if (!storage) return
    try {
      const nextRaw = serialize()
      if (storage.getItem(safeKey) !== nextRaw) storage.setItem(safeKey, nextRaw)
    } catch {
      void 0
    }
  }, delayMs)
}

export const lsSetJsonCoalesced = <T>(key: LsStorageKey, value: T, opts?: CoalescedWriteOptions): T => {
  scheduleStorageWrite(key, 'json', () => JSON.stringify(value), opts)
  return value
}

export const lsSetIntCoalesced = (
  key: LsStorageKey,
  value: number,
  opts?: { min?: number; max?: number } & CoalescedWriteOptions,
): number => {
  if (!String(key || '').trim()) return value
  const min = typeof opts?.min === 'number' ? opts.min : 1
  const max = typeof opts?.max === 'number' ? opts.max : 1024
  const x = Math.max(min, Math.min(max, Math.floor(value)))
  scheduleStorageWrite(key, 'int', () => String(x), opts)
  return x
}

export const lsSetBoolCoalesced = (key: LsStorageKey, value: boolean, opts?: CoalescedWriteOptions): boolean => {
  const next = !!value
  scheduleStorageWrite(key, 'bool', () => next ? '1' : '0', opts)
  return next
}

export const lsRemove = (key: LsStorageKey): void => {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(scopeStorageKey(key))
  } catch {
    void 0
  }
};

export const getSessionStorage = (): Storage | null => {
  try {
    const storage = typeof window === 'undefined' ? null : window.sessionStorage
    return wrapScopedStorage(storage)
  } catch {
    return null
  }
};

export const ssString = (
  key: SessionStorageKey | StorageChannelKey,
  fallback: string,
): string => {
  const storage = getSessionStorage()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(scopeStorageKey(key))
    if (raw === null) return fallback
    return raw
  } catch {
    return fallback
  }
}

export const ssSetString = (
  key: SessionStorageKey | StorageChannelKey,
  value: string,
  ): string => {
  const storage = getSessionStorage()
  const next = String(value ?? '')
  if (!storage) return next
  try {
    storage.setItem(scopeStorageKey(key), next)
  } catch {
    void 0
  }
  return next
}

export const ssRemove = (key: SessionStorageKey | StorageChannelKey): void => {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(scopeStorageKey(key))
  } catch {
    void 0
  }
}

export const ssJson = <T>(key: SessionStorageKey | StorageChannelKey, fallback: T, parse: (raw: unknown) => T | null) => {
  const storage = getSessionStorage()
  return readJsonFromStorage(storage, key, fallback, parse)
};

export const ssSetJson = <T>(key: SessionStorageKey | StorageChannelKey, value: T) => {
  const storage = getSessionStorage()
  return writeJsonToStorage(storage, key, value)
};
