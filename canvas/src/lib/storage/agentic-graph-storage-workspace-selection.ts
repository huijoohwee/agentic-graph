import { readEnvString } from '@/lib/config.env'

const KEY = 'kg:storage:workspace-selection:v1'
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(value)
export type AgenticGraphStorageWorkspaceSelection = { userId: string; workspaceId: string }
type Selection = AgenticGraphStorageWorkspaceSelection
const readSelection = (): Selection | null => {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(KEY)
    if (!raw || raw.length > 600) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Partial<Selection>
    return validId(record.userId) && validId(record.workspaceId)
      ? { userId: record.userId, workspaceId: record.workspaceId } : null
  } catch { return null }
}

export const readAgenticGraphStorageWorkspaceSelection = (): Selection | null => readSelection()

const notifyWorkspaceSelectionChanged = (): void => {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new Event('kg:storage:workspace-selection:changed')) } catch { void 0 }
}

export const subscribeAgenticGraphStorageWorkspaceSelectionChanged = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const onChange = () => callback()
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) callback()
  }
  window.addEventListener('kg:storage:workspace-selection:changed', onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('kg:storage:workspace-selection:changed', onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Public routing choice only. Every request still needs a server-authorized membership. */
export const readAgenticGraphStorageWorkspaceOverride = (): string =>
  readSelection()?.workspaceId || String(readEnvString('VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID', '') || '').trim()

export const clearOtherStorageAccountSelection = (userId: string): void => {
  const previous = readSelection()
  if (previous && previous.userId !== userId) {
    window.localStorage.removeItem(KEY)
    notifyWorkspaceSelectionChanged()
  }
}

export const selectAgenticGraphStorageWorkspace = (selection: Selection): void => {
  if (!validId(selection.userId) || !validId(selection.workspaceId)) throw new Error('Choose an available workspace.')
  window.localStorage.setItem(KEY, JSON.stringify(selection))
  const saved = readSelection()
  if (saved?.userId !== selection.userId || saved.workspaceId !== selection.workspaceId)
    throw new Error('Workspace selection could not be saved. Your local files remain available.')
  notifyWorkspaceSelectionChanged()
}

