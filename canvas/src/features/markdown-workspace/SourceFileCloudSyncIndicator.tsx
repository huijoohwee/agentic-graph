import React from 'react'
import { Cloud, CloudOff, HardDrive, LoaderCircle } from 'lucide-react'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import {
  readCanonicalCloudDocumentSnapshot,
  resolveSourceFileCanonicalCloudTarget,
  syncWorkspaceEntryToCanonicalCloud,
} from '@/features/source-files/sourceFileCanonicalCloudSync'
import {
  readKnowgrphStorageRuntimeSyncEnabled,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  subscribeWorkspaceStoreSyncSettingsChanged,
} from '@/lib/workspace/workspaceStoreSyncSettings'

const CLOUD_STATUS_REFRESH_INTERVAL_MS = 120_000

export type SourceFileCloudSyncStatus =
  | 'checking'
  | 'local'
  | 'cloud'
  | 'uploading'
  | 'error'
  | 'unavailable'
  | 'unsupported'

type EntryActionState = {
  status: 'uploading' | 'error'
  message?: string
}

const readSupportedPathSignature = (entries: WorkspaceEntry[]): string =>
  entries
    .filter(entry => entry.kind === 'file' && resolveSourceFileCanonicalCloudTarget(entry.path))
    .map(entry => entry.path)
    .sort()
    .join('|')

export const resolveSourceFileCloudSyncStatus = (args: {
  entry: WorkspaceEntry
  remoteContentByCanonicalPath: ReadonlyMap<string, string>
  snapshotStatus: 'checking' | 'ready' | 'unavailable'
  actionState?: EntryActionState | null
}): SourceFileCloudSyncStatus => {
  if (args.entry.kind !== 'file') return 'unsupported'
  const target = resolveSourceFileCanonicalCloudTarget(args.entry.path)
  if (!target) return 'unsupported'
  if (args.actionState?.status === 'uploading') return 'uploading'
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
    () => readKnowgrphStorageRuntimeSyncEnabled(),
  )
  const [remoteContentByCanonicalPath, setRemoteContentByCanonicalPath] = React.useState<Map<string, string>>(() => new Map())
  const [snapshotStatus, setSnapshotStatus] = React.useState<'checking' | 'ready' | 'unavailable'>(
    () => cloudSyncEnabled && pathSignature ? 'checking' : 'unavailable',
  )
  const [actionStateByPath, setActionStateByPath] = React.useState<Map<string, EntryActionState>>(() => new Map())
  const refreshInFlightRef = React.useRef<Promise<void> | null>(null)

  const refresh = React.useCallback(async () => {
    if (!cloudSyncEnabled || !pathSignature) {
      setRemoteContentByCanonicalPath(new Map())
      setSnapshotStatus('unavailable')
      return
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current
    const run = (async () => {
      try {
        const snapshot = await readCanonicalCloudDocumentSnapshot()
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
  }, [cloudSyncEnabled, pathSignature])

  React.useEffect(() => subscribeWorkspaceStoreSyncSettingsChanged(
    () => setCloudSyncEnabled(readKnowgrphStorageRuntimeSyncEnabled()),
  ), [])

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
    if (entry.kind !== 'file' || !resolveSourceFileCanonicalCloudTarget(entry.path)) return
    setActionStateByPath(previous => {
      const next = new Map(previous)
      next.set(entry.path, { status: 'uploading' })
      return next
    })
    try {
      const result = await syncWorkspaceEntryToCanonicalCloud({ entry })
      setRemoteContentByCanonicalPath(previous => {
        const next = new Map(previous)
        next.set(result.canonicalPath, result.syncedText)
        return next
      })
      setSnapshotStatus('ready')
      setActionStateByPath(previous => {
        const next = new Map(previous)
        next.delete(entry.path)
        return next
      })
      pushUiToast({
        id: `source-file-cloud-sync:${entry.path}`,
        kind: 'success',
        message: `${entry.name || entry.path} saved to GitHub and verified in Cloudflare.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud sync failed.'
      setActionStateByPath(previous => {
        const next = new Map(previous)
        next.set(entry.path, { status: 'error', message })
        return next
      })
      pushUiToast({
        id: `source-file-cloud-sync:${entry.path}`,
        kind: 'warning',
        message,
      })
    }
  }, [pushUiToast])

  const readStatus = React.useCallback((entry: WorkspaceEntry): SourceFileCloudSyncStatus =>
    resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath,
      snapshotStatus,
      actionState: actionStateByPath.get(entry.path),
    }), [actionStateByPath, remoteContentByCanonicalPath, snapshotStatus])

  const readError = React.useCallback((entry: WorkspaceEntry): string =>
    actionStateByPath.get(entry.path)?.message || '', [actionStateByPath])

  return { readError, readStatus, upload }
}

const buildIndicatorLabel = (entry: WorkspaceEntry, status: SourceFileCloudSyncStatus, error: string): string => {
  const name = entry.name || entry.path
  if (status === 'cloud') return `Cloud synced: ${name}. Upload saved copy again`
  if (status === 'uploading') return `Uploading ${name} to GitHub and Cloudflare`
  if (status === 'error') return `Cloud sync failed for ${name}. Retry upload${error ? `: ${error}` : ''}`
  if (status === 'unavailable') return `Local saved copy: ${name}. Cloud status unavailable; click to upload`
  if (status === 'checking') return `Checking cloud sync for ${name}`
  if (status === 'unsupported') return `Local file: ${name}. Cloud upload supports Markdown`
  return `Local saved copy: ${name}. Upload to GitHub and Cloudflare`
}

export function SourceFileCloudSyncIndicator(props: {
  entry: WorkspaceEntry
  status: SourceFileCloudSyncStatus
  error?: string
  onUpload: (entry: WorkspaceEntry) => void | Promise<void>
}) {
  const { entry, status } = props
  const label = buildIndicatorLabel(entry, status, String(props.error || ''))
  const disabled = status === 'checking' || status === 'uploading' || status === 'unsupported'
  const tone = status === 'cloud'
    ? 'text-green-600 dark:text-green-400'
    : status === 'error' || status === 'unavailable'
      ? 'text-amber-600 dark:text-amber-400'
      : UI_THEME_TOKENS.text.tertiary
  const iconClassName = `${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} ${tone}`
  const icon = status === 'cloud'
    ? <Cloud className={iconClassName} aria-hidden="true" />
    : status === 'error' || status === 'unavailable'
      ? <CloudOff className={iconClassName} aria-hidden="true" />
      : status === 'checking' || status === 'uploading'
        ? <LoaderCircle className={`${iconClassName} animate-spin`} aria-hidden="true" />
        : <HardDrive className={iconClassName} aria-hidden="true" />

  return (
    <button
      type="button"
      className={`inline-flex h-5 w-5 items-center justify-center rounded ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing} disabled:cursor-default disabled:opacity-70`}
      aria-label={label}
      title={label}
      data-source-file-cloud-status={status}
      disabled={disabled}
      onClick={() => void props.onUpload(entry)}
    >
      {icon}
    </button>
  )
}
