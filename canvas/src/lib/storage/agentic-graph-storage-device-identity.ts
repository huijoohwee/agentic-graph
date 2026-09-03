import { getLocalStorage } from '@/lib/persistence'

export const AGENTIC_OS_STORAGE_DEVICE_ID_KEY = 'kg:agentic-graph-storage:device-id'

const normalizeString = (value: unknown): string => String(value || '').trim()

export const getAgenticGraphStorageDeviceId = (storage: Storage | null = getLocalStorage()): string => {
  try {
    const existing = normalizeString(storage?.getItem(AGENTIC_OS_STORAGE_DEVICE_ID_KEY))
    if (existing) return existing
    const next = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `dev:${crypto.randomUUID()}`
      : `dev:${Date.now()}:${Math.random().toString(16).slice(2)}`
    storage?.setItem(AGENTIC_OS_STORAGE_DEVICE_ID_KEY, next)
    return next
  } catch {
    return `dev:${Date.now()}:${Math.random().toString(16).slice(2)}`
  }
}
