import React from 'react'
import { Cloud, CloudOff, HardDrive, LoaderCircle } from 'lucide-react'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import {
  readCanonicalCloudDocumentSnapshot,
  resolveSourceFileCloudWorkspaceTarget,
  syncWorkspaceEntriesToCloudWorkspaceSnapshot,
  SOURCE_FILE_CLOUD_SNAPSHOT_VERIFIED_EVENT,
  type SourceFileCloudWorkspaceSnapshotResult,
} from '@/features/source-files/sourceFileCanonicalCloudSync'
import {
  readActiveAgenticGraphStorageWorkspaceId,
} from '@/features/source-files/sourceFileShareUrl'
import {
  readAgenticGraphStorageBaseUrl,
  readAgenticGraphStorageRuntimeSyncEnabled,
} from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  beginAgenticGraphStorageBrowserSignIn,
  readAgenticGraphStorageBrowserSession,
  type AgenticGraphStorageBrowserSessionState,
} from '@/lib/storage/agentic-graph-storage-browser-session'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  subscribeWorkspaceStoreSyncSettingsChanged,
} from '@/lib/workspace/workspaceStoreSyncSettings'

const CLOUD_STATUS_REFRESH_INTERVAL_MS = 120_000

export type SourceFileCloudSyncStatus =
  | 'checking'
  | 'disabled'
  | 'local'
  | 'cloud'
  | 'uploading'
  | 'error'
  | 'auth-required'
  | 'access-required'
  | 'unavailable'
  | 'unsupported'

type EntryActionState = {
  status: 'uploading' | 'error'
  message?: string
}

type CloudSnapshotStatus =
  | 'checking'
  | 'ready'
  | 'auth-required'
  | 'access-required'
  | 'unavailable'

const readCloudSnapshotStatusForSession = (
  session: AgenticGraphStorageBrowserSessionState,
): Exclude<CloudSnapshotStatus, 'checking' | 'ready'> | null => {
  if (session.status === 'unauthenticated') return 'auth-required'
  if (session.status === 'access-denied') return 'access-required'
  if (session.status === 'unavailable') return 'unavailable'
  return null
}

const readSupportedPathSignature = (entries: WorkspaceEntry[]): string =>
  entries
    .filter(entry => entry.kind === 'file' && resolveSourceFileCloudWorkspaceTarget(entry.path))
    .map(entry => entry.path)
    .sort()
    .join('|')

const readSupportedFolderEntries = (entries: WorkspaceEntry[], folderPath: string): WorkspaceEntry[] => {
  const folder = normalizeWorkspacePath(folderPath)
  const prefix = folder === '/' ? '/' : `${folder}/`
  return entries.filter(entry => entry.kind === 'file'
    && normalizeWorkspacePath(entry.path).startsWith(prefix)
    && Boolean(resolveSourceFileCloudWorkspaceTarget(entry.path)))
}

const folderActionKey = (folderPath: string): string => `folder:${normalizeWorkspacePath(folderPath)}`
const ONLINE_SYNC_DISABLED_MESSAGE = 'Online sync is off. Enable it in Settings → Document Storage & Sync; this app origin must also be enabled by the storage service.'

export const resolveSourceFileCloudSyncStatus = (args: {
  entry: WorkspaceEntry
  remoteContentByCanonicalPath: ReadonlyMap<string, string>
  snapshotStatus: CloudSnapshotStatus
  actionState?: EntryActionState | null
}): SourceFileCloudSyncStatus => {
  if (args.entry.kind !== 'file') return 'unsupported'
  const target = resolveSourceFileCloudWorkspaceTarget(args.entry.path)
  if (!target) return 'unsupported'
  if (args.actionState?.status === 'uploading') return 'uploading'
  if (args.snapshotStatus === 'auth-required') return 'auth-required'
  if (args.snapshotStatus === 'access-required') return 'access-required'
  if (args.actionState?.status === 'error') return 'error'
  if (args.snapshotStatus === 'checking') return 'checking'
  if (args.snapshotStatus === 'unavailable') return 'unavailable'
  const remoteText = args.remoteContentByCanonicalPath.get(target.canonicalPath)
  return remoteText === String(args.entry.text || '') ? 'cloud' : 'local'
}

export function useSourceFileCloudSync(entries: WorkspaceEntry[]) {
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const pathSignature = React.useMemo(() => readSupportedPathSignature(entries), [entries])
  const [cloudSyncEnabled, setCloudSyncEnabled] = React.useState(
    () => readAgenticGraphStorageRuntimeSyncEnabled(),
  )
  const [remoteContentByCanonicalPath, setRemoteContentByCanonicalPath] = React.useState<Map<string, string>>(() => new Map())
  const [snapshotStatus, setSnapshotStatus] = React.useState<CloudSnapshotStatus>(
    () => cloudSyncEnabled && pathSignature ? 'checking' : 'unavailable',
  )
  const [actionStateByPath, setActionStateByPath] = React.useState<Map<string, EntryActionState>>(() => new Map())
  const refreshInFlightRef = React.useRef<Promise<void> | null>(null)

  const applyBrowserSessionState = React.useCallback((session: AgenticGraphStorageBrowserSessionState): boolean => {
    const nextSnapshotStatus = readCloudSnapshotStatusForSession(session)
    if (!nextSnapshotStatus) return true
    setRemoteContentByCanonicalPath(new Map())
    setSnapshotStatus(nextSnapshotStatus)
    return false
  }, [])

  const refresh = React.useCallback(async () => {
    if (!cloudSyncEnabled || !pathSignature) {
      setRemoteContentByCanonicalPath(new Map())
      setSnapshotStatus('unavailable')
      return
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current
    const run = (async () => {
      const baseUrl = readAgenticGraphStorageBaseUrl()
      const workspaceId = readActiveAgenticGraphStorageWorkspaceId()
      const session = await readAgenticGraphStorageBrowserSession({ baseUrl, workspaceId })
      if (!applyBrowserSessionState(session)) return
      try {
        const snapshot = await readCanonicalCloudDocumentSnapshot({ baseUrl })
        setRemoteContentByCanonicalPath(snapshot)
        setSnapshotStatus('ready')
      } catch {
        setSnapshotStatus('unavailable')
      }
    })()
    refreshInFlightRef.current = run
    try {
      await run
    } finally {
      if (refreshInFlightRef.current === run) refreshInFlightRef.current = null
    }
  }, [applyBrowserSessionState, cloudSyncEnabled, pathSignature])

  React.useEffect(() => subscribeWorkspaceStoreSyncSettingsChanged(
    () => setCloudSyncEnabled(readAgenticGraphStorageRuntimeSyncEnabled()),
  ), [])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !cloudSyncEnabled) return
    const verified = (event: Event) => {
      const results = (event as CustomEvent<SourceFileCloudWorkspaceSnapshotResult[]>).detail
        .filter(result => result.workspaceId === readActiveAgenticGraphStorageWorkspaceId())
      if (!results.length) return
      setRemoteContentByCanonicalPath(previous => {
        const next = new Map(previous)
        for (const result of results) next.set(result.canonicalPath, result.syncedText)
        return next
      })
      setSnapshotStatus('ready')
    }
    window.addEventListener(SOURCE_FILE_CLOUD_SNAPSHOT_VERIFIED_EVENT, verified)
    return () => window.removeEventListener(SOURCE_FILE_CLOUD_SNAPSHOT_VERIFIED_EVENT, verified)
  }, [cloudSyncEnabled])

  React.useEffect(() => {
    if (!cloudSyncEnabled || !pathSignature) {
      setRemoteContentByCanonicalPath(new Map())
      setSnapshotStatus('unavailable')
      return
    }
    setSnapshotStatus('checking')
    void refresh()
  }, [cloudSyncEnabled, pathSignature, refresh])

  React.useEffect(() => {
    if (
      typeof window === 'undefined'
      || !cloudSyncEnabled
      || !pathSignature
    ) return
    const handleFocus = () => void refresh()
    const timer = window.setInterval(handleFocus, CLOUD_STATUS_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [cloudSyncEnabled, pathSignature, refresh])

  const upload = React.useCallback(async (entry: WorkspaceEntry) => {
    const isFolder = entry.kind === 'folder'
    const selectedEntries = isFolder
      ? readSupportedFolderEntries(entries, entry.path)
      : resolveSourceFileCloudWorkspaceTarget(entry.path) ? [entry] : []
    const actionKey = isFolder ? folderActionKey(entry.path) : entry.path
    if (!cloudSyncEnabled) {
      pushUiToast({
        id: `source-file-cloud-sync:${actionKey}`,
        kind: 'warning',
        message: ONLINE_SYNC_DISABLED_MESSAGE,
      })
      return
    }
    if (!selectedEntries.length) {
      pushUiToast({
        id: `source-file-cloud-sync:${actionKey}`,
        kind: 'warning',
        message: isFolder
          ? 'This folder has no Markdown or Python files to sync.'
          : 'Cloud sync supports Markdown and Python files outside chat-log.',
      })
      return
    }
    const baseUrl = readAgenticGraphStorageBaseUrl()
    const workspaceId = readActiveAgenticGraphStorageWorkspaceId()
    const session = await readAgenticGraphStorageBrowserSession({ baseUrl, workspaceId })
    if (!applyBrowserSessionState(session)) {
      if (session.status === 'unauthenticated' || session.status === 'access-denied') {
        try {
          beginAgenticGraphStorageBrowserSignIn({ baseUrl })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cloud sync sign-in is unavailable.'
          setSnapshotStatus('unavailable')
          pushUiToast({
            id: `source-file-cloud-sync:${entry.path}`,
            kind: 'warning',
            message,
          })
        }
      } else {
        pushUiToast({
          id: `source-file-cloud-sync:${actionKey}`,
          kind: 'warning',
          message: session.message || 'Cloud sync is unavailable for this app origin. Check Document Storage & Sync settings; local files remain saved.',
        })
      }
      return
    }
    setActionStateByPath(previous => {
      const next = new Map(previous)
      next.set(actionKey, { status: 'uploading' })
      return next
    })
    try {
      const results = await syncWorkspaceEntriesToCloudWorkspaceSnapshot({
        entries: selectedEntries,
        workspaceId,
        baseUrl,
      })
      setRemoteContentByCanonicalPath(previous => {
        const next = new Map(previous)
        for (const result of results) next.set(result.canonicalPath, result.syncedText)
        return next
      })
      setSnapshotStatus('ready')
      setActionStateByPath(previous => {
        const next = new Map(previous)
        next.delete(actionKey)
        return next
      })
      pushUiToast({
        id: `source-file-cloud-sync:${actionKey}`,
        kind: 'success',
        message: isFolder
          ? `${results.length} files from ${entry.name || entry.path} uploaded and verified in the shared cloud workspace.`
          : `${entry.name || entry.path} saved as a shared cloud workspace snapshot.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud sync failed.'
      const currentSession = await readAgenticGraphStorageBrowserSession({ baseUrl, workspaceId })
      if (!applyBrowserSessionState(currentSession)) {
        setActionStateByPath(previous => {
          const next = new Map(previous)
          next.delete(actionKey)
          return next
        })
        pushUiToast({
          id: `source-file-cloud-sync:${actionKey}`,
          kind: 'warning',
          message: currentSession.status === 'unauthenticated'
            ? 'Cloud sync requires sign-in. Your local copy remains saved.'
            : currentSession.status === 'access-denied'
              ? 'Cloud sync access is required for this workspace. Your local copy remains saved.'
              : currentSession.message || 'Configure cloud sync in Settings. Your local copy remains saved.',
        })
        return
      }
      setActionStateByPath(previous => {
        const next = new Map(previous)
        next.set(actionKey, { status: 'error', message })
        return next
      })
      pushUiToast({
        id: `source-file-cloud-sync:${actionKey}`,
        kind: 'warning',
        message,
      })
    }
  }, [applyBrowserSessionState, cloudSyncEnabled, entries, pushUiToast])

  const readStatus = React.useCallback((entry: WorkspaceEntry): SourceFileCloudSyncStatus => {
    if (!cloudSyncEnabled) return 'disabled'
    return resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath,
      snapshotStatus,
      actionState: actionStateByPath.get(entry.path),
    })
  }, [actionStateByPath, cloudSyncEnabled, remoteContentByCanonicalPath, snapshotStatus])

  const readFolderStatus = React.useCallback((folderPath: string): SourceFileCloudSyncStatus => {
    if (!cloudSyncEnabled) return 'disabled'
    const children = readSupportedFolderEntries(entries, folderPath)
    if (!children.length) return 'unsupported'
    const actionState = actionStateByPath.get(folderActionKey(folderPath))
    if (actionState?.status) return actionState.status
    if (snapshotStatus === 'auth-required' || snapshotStatus === 'access-required'
      || snapshotStatus === 'unavailable' || snapshotStatus === 'checking') return snapshotStatus
    const allCloud = children.every(entry => {
      const target = resolveSourceFileCloudWorkspaceTarget(entry.path)
      return target && remoteContentByCanonicalPath.get(target.canonicalPath) === String(entry.text || '')
    })
    return allCloud ? 'cloud' : 'local'
  }, [actionStateByPath, cloudSyncEnabled, entries, remoteContentByCanonicalPath, snapshotStatus])

  const readFolderFileCount = React.useCallback((folderPath: string): number =>
    readSupportedFolderEntries(entries, folderPath).length, [entries])

  const readError = React.useCallback((entry: WorkspaceEntry): string =>
    actionStateByPath.get(entry.kind === 'folder' ? folderActionKey(entry.path) : entry.path)?.message || '', [actionStateByPath])

  return { readError, readFolderFileCount, readFolderStatus, readStatus, upload }
}

const buildIndicatorLabel = (entry: WorkspaceEntry, status: SourceFileCloudSyncStatus, error: string, fileCount: number): string => {
  const name = entry.name || entry.path
  const folder = entry.kind === 'folder'
  const item = folder ? `folder ${name}` : name
  if (status === 'cloud') return folder
    ? `Cloud synced: ${name} (${fileCount} files). Upload this folder again`
    : `Cloud synced: ${name}. Upload current local copy again`
  if (status === 'uploading') return folder
    ? `Uploading ${fileCount} files from ${name} to the shared cloud workspace`
    : `Uploading ${name} to the shared cloud workspace`
  if (status === 'error') return `Cloud sync failed for ${item}. Retry shared cloud upload${error ? `: ${error}` : ''}`
  if (status === 'auth-required') return `Cloud sync requires sign-in for ${item}. Local copies remain saved.`
  if (status === 'access-required') return `Cloud sync access is required for ${item}. Local copies remain saved.`
  if (status === 'unavailable') return `Cloud sync is unavailable for ${item}. Check storage settings; local copies remain saved.`
  if (status === 'disabled') return ONLINE_SYNC_DISABLED_MESSAGE
  if (status === 'checking') return `Checking cloud sync for ${item}`
  if (status === 'unsupported') return folder
    ? `Local folder: ${name}. No Markdown or Python files are available to sync.`
    : `Local file: ${name}. Cloud upload supports Markdown and Python`
  return folder
    ? `Local folder: ${name}. Upload ${fileCount} Markdown or Python files as shared cloud snapshots`
    : `Local saved copy: ${name}. Upload a shared cloud snapshot`
}

export function SourceFileCloudSyncIndicator(props: {
  entry: WorkspaceEntry
  status: SourceFileCloudSyncStatus
  error?: string
  fileCount?: number
  onUpload: (entry: WorkspaceEntry) => void | Promise<void>
}) {
  const { entry, status } = props
  const fileCount = props.fileCount || 0
  const label = buildIndicatorLabel(entry, status, String(props.error || ''), fileCount)
  const disabled = status === 'checking'
    || status === 'uploading'
    || status === 'unsupported'
  const tone = status === 'cloud'
    ? 'text-green-600 dark:text-green-400'
    : status === 'error'
      || status === 'auth-required'
      || status === 'access-required'
      || status === 'unavailable'
      ? 'text-amber-600 dark:text-amber-400'
      : UI_THEME_TOKENS.text.tertiary
  const iconClassName = `${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} ${tone}`
  const icon = status === 'cloud'
    ? <Cloud className={iconClassName} role="img" aria-label="Cloud synced" />
    : status === 'error'
      || status === 'auth-required'
      || status === 'access-required'
      || status === 'unavailable'
      ? <CloudOff className={iconClassName} role="img" aria-label="Cloud sync unavailable" />
      : status === 'checking' || status === 'uploading'
        ? <LoaderCircle className={`${iconClassName} animate-spin`} role="img" aria-label={status === 'uploading' ? 'Uploading' : 'Checking sync'} />
        : <HardDrive className={iconClassName} role="img" aria-label="Saved locally" />

  return (
    <button
      type="button"
      className={`inline-flex ${UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_SMALL_CLASSNAME} items-center justify-center rounded ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing} disabled:cursor-default disabled:opacity-70`}
      aria-label={label}
      title={label}
      data-source-file-cloud-status={status}
      disabled={disabled}
      onClick={() => {
        if (status === 'auth-required' || status === 'access-required' || status === 'unavailable') {
          try {
            beginAgenticGraphStorageBrowserSignIn({ baseUrl: readAgenticGraphStorageBaseUrl() })
          } catch {
            void props.onUpload(entry)
          }
        } else void props.onUpload(entry)
      }}
    >
      {icon}
    </button>
  )
}
