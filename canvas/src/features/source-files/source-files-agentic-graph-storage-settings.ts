import { readEnvString } from '@/lib/config.env'
import { LS_KEYS } from '@/lib/config'
import { lsBool } from '@/lib/persistence'
import { readWorkspaceCloudSyncEnabledSetting } from '@/lib/workspace/workspaceStoreSyncSettings'

const normalizeString = (value: unknown): string => String(value || '').trim()

export const readAgenticGraphStorageBaseUrl = (): string =>
  normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', ''))

export const readAgenticGraphStorageRuntimeSyncAvailable = (): boolean => {
  const raw = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED', '')).toLowerCase()
  // An explicit Online choice can configure the existing same-origin service
  // without a rebuild. Merely opening a workspace must not enable transport.
  if (!raw) return lsBool(LS_KEYS.workspaceCloudSyncEnabled, false)
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

export const readAgenticGraphStorageRuntimeSyncEnabled = (): boolean =>
  readAgenticGraphStorageRuntimeSyncAvailable() && readWorkspaceCloudSyncEnabledSetting()
