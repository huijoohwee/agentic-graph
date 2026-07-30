import { LS_KEYS } from '@/lib/config'
import { readEnvString } from '@/lib/config.env'
import { getLocalStorage, lsBool, lsInt, lsSetBool, lsSetInt } from '@/lib/persistence'

const SETTINGS_EVENT = 'kg:workspace-store-sync-settings:changed'
const SEED_SYNC_POLL_MIN_MS = 1000
const SEED_SYNC_POLL_MAX_MS = 60_000
const SEED_SYNC_IDLE_MAX_MS_DEFAULT = 30_000
const SEED_SYNC_IDLE_MAX_MS_MIN = 1000
const SEED_SYNC_IDLE_MAX_MS_MAX = 300_000
const SOURCE_FILES_SYNC_DEBOUNCE_MIN_MS = 100
const SOURCE_FILES_SYNC_DEBOUNCE_MAX_MS = 10_000
const WINDOWS_DRIVE_PREFIX_RE = /^[A-Za-z]:[\\/]/
const WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT = '/docs_'
export const WORKSPACE_IMPORT_VIDEO_DOWNLOAD_OUTPUT_DIR_DEFAULT = ''

const parseEnvBoolean = (name: string, fallback: boolean): boolean => {
  const raw = String(readEnvString(name, fallback ? 'true' : 'false') || '')
    .trim()
    .toLowerCase()
  if (!raw) return fallback
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

const parseEnvSeedSyncPollMs = (): number => {
  const raw = Number.parseInt(readEnvString('VITE_WORKSPACE_SEED_SYNC_POLL_MS', '3000'), 10)
  if (!Number.isFinite(raw)) return 3000
  return Math.min(SEED_SYNC_POLL_MAX_MS, Math.max(SEED_SYNC_POLL_MIN_MS, raw))
}

const notifyWorkspaceStoreSyncSettingsChanged = (): void => {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(SETTINGS_EVENT))
  } catch {
    void 0
  }
}

export const subscribeWorkspaceStoreSyncSettingsChanged = (
  cb: () => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const handler = () => {
    cb()
  }
  window.addEventListener(SETTINGS_EVENT, handler)
  return () => {
    window.removeEventListener(SETTINGS_EVENT, handler)
  }
}

export const readWorkspaceCloudSyncEnabledSetting = (): boolean => {
  return lsBool(LS_KEYS.workspaceCloudSyncEnabled, true)
}

export const writeWorkspaceCloudSyncEnabledSetting = (next: boolean): boolean => {
  const written = lsSetBool(LS_KEYS.workspaceCloudSyncEnabled, !!next)
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceSeedSyncEnabledSetting = (): boolean => {
  return lsBool(LS_KEYS.workspaceSeedSyncEnabled, parseEnvBoolean('VITE_WORKSPACE_SEED_SYNC_ENABLED', true))
}

export const writeWorkspaceSeedSyncEnabledSetting = (next: boolean): boolean => {
  const written = lsSetBool(LS_KEYS.workspaceSeedSyncEnabled, !!next)
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceSeedSyncPollMsSetting = (): number => {
  return lsInt(LS_KEYS.workspaceSeedSyncPollMs, parseEnvSeedSyncPollMs())
}

export const writeWorkspaceSeedSyncPollMsSetting = (next: number): number => {
  const written = lsSetInt(LS_KEYS.workspaceSeedSyncPollMs, next, {
    min: SEED_SYNC_POLL_MIN_MS,
    max: SEED_SYNC_POLL_MAX_MS,
  })
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceSeedSyncIdleMaxMsSetting = (): number => {
  return lsInt(LS_KEYS.workspaceSeedSyncIdleMaxMs, SEED_SYNC_IDLE_MAX_MS_DEFAULT)
}

export const writeWorkspaceSeedSyncIdleMaxMsSetting = (next: number): number => {
  const written = lsSetInt(LS_KEYS.workspaceSeedSyncIdleMaxMs, next, {
    min: SEED_SYNC_IDLE_MAX_MS_MIN,
    max: SEED_SYNC_IDLE_MAX_MS_MAX,
  })
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceAutoRefreshEnabledSetting = (): boolean => {
  return lsBool(LS_KEYS.workspaceAutoRefreshEnabled, true)
}

export const writeWorkspaceAutoRefreshEnabledSetting = (next: boolean): boolean => {
  const written = lsSetBool(LS_KEYS.workspaceAutoRefreshEnabled, !!next)
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceSourceFilesDocsOnlySetting = (): boolean => {
  return lsBool(LS_KEYS.workspaceSourceFilesDocsOnly, true)
}

export const writeWorkspaceSourceFilesDocsOnlySetting = (next: boolean): boolean => {
  const written = lsSetBool(LS_KEYS.workspaceSourceFilesDocsOnly, !!next)
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceSourceFilesSyncDebounceMsSetting = (): number => {
  return lsInt(LS_KEYS.workspaceSourceFilesSyncDebounceMs, 1200)
}

export const writeWorkspaceSourceFilesSyncDebounceMsSetting = (next: number): number => {
  const written = lsSetInt(LS_KEYS.workspaceSourceFilesSyncDebounceMs, next, {
    min: SOURCE_FILES_SYNC_DEBOUNCE_MIN_MS,
    max: SOURCE_FILES_SYNC_DEBOUNCE_MAX_MS,
  })
  notifyWorkspaceStoreSyncSettingsChanged()
  return written
}

export const readWorkspaceImportDefaultSourceUrlSetting = (): string => {
  const storage = getLocalStorage()
  if (!storage) return ''
  try {
    return String(storage.getItem(LS_KEYS.workspaceImportDefaultSourceUrl) || '').trim()
  } catch {
    return ''
  }
}

const normalizeFilesystemRootPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
}

const readWorkspaceDocsMirrorRootPathFallback = (): string => {
  return normalizeFilesystemRootPath(readEnvString('VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT', ''))
}

export const readWorkspaceDocsMirrorRootPathSetting = (): string => {
  if (parseEnvBoolean('VITE_KNOWGRPH_RUN_READY_REPO_LOCAL', false)) return readWorkspaceDocsMirrorRootPathFallback()
  const storage = getLocalStorage()
  if (!storage) return readWorkspaceDocsMirrorRootPathFallback()
  try {
    const stored = normalizeFilesystemRootPath(String(storage.getItem(LS_KEYS.workspaceDocsMirrorRootPath) || ''))
    return stored || readWorkspaceDocsMirrorRootPathFallback()
  } catch {
    return readWorkspaceDocsMirrorRootPathFallback()
  }
}

export const writeWorkspaceDocsMirrorRootPathSetting = (next: string): void => {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    const value = normalizeFilesystemRootPath(next)
    if (value) storage.setItem(LS_KEYS.workspaceDocsMirrorRootPath, value)
    else storage.removeItem(LS_KEYS.workspaceDocsMirrorRootPath)
    notifyWorkspaceStoreSyncSettingsChanged()
  } catch {
    void 0
  }
}

const readKnowgrphStorageBaseUrlSetting = (): string =>
  String(readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', '') || '').trim()

const normalizeWorkspaceLikeRootPath = (value: string, fallback: string): string => {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!raw) return fallback
  return raw.startsWith('/') ? raw : `/${raw}`
}

const readWorkspaceMirrorBaseAbsRoot = (): string => {
  const docsRoot = readWorkspaceDocsMirrorRootPathSetting()
  if (!docsRoot) return ''
  const parts = docsRoot.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return `/${parts.slice(0, -1).join('/')}`
}

export const normalizeWorkspaceImportShareExportRootPathSetting = (next: string): string => {
  const raw = String(next || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!raw) return WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT
  const baseRoot = readWorkspaceMirrorBaseAbsRoot()
  if (baseRoot && raw === baseRoot) return '/'
  if (baseRoot && raw.startsWith(`${baseRoot}/`)) {
    return normalizeWorkspaceLikeRootPath(raw.slice(baseRoot.length), WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT)
  }
  return normalizeWorkspaceLikeRootPath(raw, WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT)
}

const isLocalFilesystemLikePath = (value: string): boolean => {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.startsWith('/')) return true
  if (text.startsWith('./') || text.startsWith('../')) return true
  if (WINDOWS_DRIVE_PREFIX_RE.test(text)) return true
  return false
}

const isCloudflareDashboardD1Url = (value: string): boolean => {
  const raw = String(value || '').trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    if (url.hostname !== 'dash.cloudflare.com') return false
    return /\/workers\/d1(?:\/|$)/.test(url.pathname)
  } catch {
    return false
  }
}

export const normalizeWorkspaceImportDefaultSourceUrlForSourceFiles = (next: string): string => {
  const raw = String(next || '').trim()
  const storageBaseUrl = readKnowgrphStorageBaseUrlSetting()
  if (!raw) return storageBaseUrl || ''
  if (isLocalFilesystemLikePath(raw) || isCloudflareDashboardD1Url(raw)) {
    return storageBaseUrl || ''
  }
  return raw
}

export const writeWorkspaceImportDefaultSourceUrlSetting = (next: string): void => {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    const value = normalizeWorkspaceImportDefaultSourceUrlForSourceFiles(next)
    if (value) {
      storage.setItem(LS_KEYS.workspaceImportDefaultSourceUrl, value)
    } else {
      storage.removeItem(LS_KEYS.workspaceImportDefaultSourceUrl)
    }
    notifyWorkspaceStoreSyncSettingsChanged()
  } catch {
    void 0
  }
}

export const normalizeWorkspaceImportVideoDownloadOutputDirSetting = (next: string): string => {
  const normalized = normalizeFilesystemRootPath(next)
  return normalized || WORKSPACE_IMPORT_VIDEO_DOWNLOAD_OUTPUT_DIR_DEFAULT
}

export const readWorkspaceImportVideoDownloadOutputDirSetting = (): string => {
  const storage = getLocalStorage()
  if (!storage) return WORKSPACE_IMPORT_VIDEO_DOWNLOAD_OUTPUT_DIR_DEFAULT
  try {
    return normalizeWorkspaceImportVideoDownloadOutputDirSetting(
      String(storage.getItem(LS_KEYS.workspaceImportVideoDownloadOutputDir) || ''),
    )
  } catch {
    return WORKSPACE_IMPORT_VIDEO_DOWNLOAD_OUTPUT_DIR_DEFAULT
  }
}

export const writeWorkspaceImportVideoDownloadOutputDirSetting = (next: string): void => {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    const value = normalizeWorkspaceImportVideoDownloadOutputDirSetting(next)
    storage.setItem(LS_KEYS.workspaceImportVideoDownloadOutputDir, value)
    notifyWorkspaceStoreSyncSettingsChanged()
  } catch {
    void 0
  }
}

export const readWorkspaceImportShareExportRootPathSetting = (): string => {
  const storage = getLocalStorage()
  if (!storage) return WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT
  try {
    return normalizeWorkspaceImportShareExportRootPathSetting(
      String(storage.getItem(LS_KEYS.workspaceImportShareExportRootPath) || ''),
    )
  } catch {
    return WORKSPACE_IMPORT_SHARE_EXPORT_ROOT_PATH_DEFAULT
  }
}

export const writeWorkspaceImportShareExportRootPathSetting = (next: string): void => {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    const value = normalizeWorkspaceImportShareExportRootPathSetting(next)
    storage.setItem(LS_KEYS.workspaceImportShareExportRootPath, value)
    notifyWorkspaceStoreSyncSettingsChanged()
  } catch {
    void 0
  }
}
