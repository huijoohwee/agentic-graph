import React from 'react'
import { readActiveAgenticGraphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'
import { beginAgenticGraphStorageBrowserSignIn, readAgenticGraphStorageBrowserSession, type AgenticGraphStorageBrowserSessionState } from '@/lib/storage/agentic-graph-storage-browser-session'
import { Cloud, CloudOff, FolderOpen, HardDrive, RefreshCw } from 'lucide-react'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { DOCUMENT_REPOSITORY_DISPLAY_ROOTS } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runDocumentStorageSyncNow } from '@/features/source-files/documentStorageSyncRuntime'
import {
  readAgenticGraphStorageBaseUrl,
  readAgenticGraphStorageRuntimeSyncAvailable,
} from '@/features/source-files/source-files-agentic-graph-storage-settings'
import { readAgenticGraphCollaborationConfig } from '@/features/source-files/sourceFilesPocketBaseYjsRoom'
import {
  readWorkspaceCloudSyncEnabledSetting,
  readWorkspaceDocsMirrorRootPathSetting,
  subscribeWorkspaceStoreSyncSettingsChanged,
  writeWorkspaceCloudSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { uiToolbarRowScrollClassName, uiToolbarToggleActiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import {
  subscribeAgenticGraphStoragePersistenceState,
} from '@/lib/storage/agentic-graph-storage-db'
import type { PersistedCollectionPersistenceState } from '@/lib/storage/persistedCollectionStore'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

const SEARCH_INDEX = [
  'document storage sync cloud online collaboration offline fallback',
  'github agentic-graph docs huijoohwee docs workspace seeds',
  'pocketbase yjs cloudflare d1 indexeddb local mirror sync now',
  'source file management configure connection sign in upload download file folder directory',
].join(' ')

export const DOCUMENT_STORAGE_SYNC_SETTINGS_ROW_COUNT = 6

const ROW_ANCHORS = {
  mode: buildSettingsRowAnchorId('document-storage-sync-row', 'mode'),
  status: buildSettingsRowAnchorId('document-storage-sync-row', 'status'),
  roots: buildSettingsRowAnchorId('document-storage-sync-row', 'roots'),
  fallback: buildSettingsRowAnchorId('document-storage-sync-row', 'fallback'),
  actions: buildSettingsRowAnchorId('document-storage-sync-row', 'actions'),
} as const

export const matchesDocumentStorageSyncQuery = (query: string): boolean => {
  const terms = query.split(/\s+/).map(term => term.trim()).filter(Boolean)
  return terms.length === 0 || terms.every(term => SEARCH_INDEX.includes(term))
}

const VALUE_CLASS_NAME = `${uiToolbarRowScrollClassName} flex-1 gap-1`

function ValuePill({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span className={getUiSectionChipClassName(primary ? 'primary' : 'secondary')}>
      <span className={UI_TEXT_TRUNCATE}>{children}</span>
    </span>
  )
}

export function DocumentStorageSyncSettingsRows() {
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const [settingsRevision, setSettingsRevision] = React.useState(0)
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [syncing, setSyncing] = React.useState(false)
  const [connection, setConnection] = React.useState<AgenticGraphStorageBrowserSessionState | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [transferScope, setTransferScope] = React.useState('/')
  const workspaceId = readActiveAgenticGraphStorageWorkspaceId()
  const [lastStatus, setLastStatus] = React.useState('Not synced in this session')
  const [persistenceState, setPersistenceState] = React.useState<PersistedCollectionPersistenceState | null>(null)
  const persistenceWarningRef = React.useRef('')
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const cloudEnabled = React.useMemo(() => readWorkspaceCloudSyncEnabledSetting(), [settingsRevision])
  const storageAvailable = React.useMemo(() => readAgenticGraphStorageRuntimeSyncAvailable(), [settingsRevision])
  const storageBaseUrl = React.useMemo(() => readAgenticGraphStorageBaseUrl(), [settingsRevision])
  const collaboration = React.useMemo(() => readAgenticGraphCollaborationConfig(), [settingsRevision])
  const docsMirrorRoot = React.useMemo(() => readWorkspaceDocsMirrorRootPathSetting(), [settingsRevision])
  const collaborationReady = collaboration.enabled && !!collaboration.pocketBaseUrl && !!collaboration.saveBridgeUrl
  const durablePersistence = persistenceState?.mode === 'indexeddb' && persistenceState.status === 'active'

  React.useEffect(() => subscribeWorkspaceStoreSyncSettingsChanged(() => {
    setSettingsRevision(previous => previous + 1)
  }), [])

  React.useEffect(() => subscribeAgenticGraphStoragePersistenceState(state => {
    setPersistenceState(state)
    const warning = state.status === 'degraded' ? String(state.error || 'IndexedDB unavailable') : ''
    if (!warning || persistenceWarningRef.current === warning) return
    persistenceWarningRef.current = warning
    pushUiToast({
      id: 'document-storage-indexeddb-degraded',
      kind: 'warning',
      message: `IndexedDB degraded to volatile in-memory storage for this browser session. ${warning}`,
      ttlMs: null,
      dismissible: true,
    })
  }), [pushUiToast])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const updateOnline = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const checkConnection = React.useCallback(async () => {
    setChecking(true)
    try {
      const session = await readAgenticGraphStorageBrowserSession({ workspaceId, baseUrl: storageBaseUrl })
      setConnection(session)
      return session
    } finally { setChecking(false) }
  }, [workspaceId, storageBaseUrl])

  React.useEffect(() => {
    let current = true
    if (!online || !cloudEnabled || !storageAvailable) { setConnection(null); return }
    void readAgenticGraphStorageBrowserSession({ workspaceId, baseUrl: storageBaseUrl }).then(session => {
      if (current) setConnection(session)
    })
    return () => { current = false }
  }, [workspaceId, storageBaseUrl, online, cloudEnabled, storageAvailable])

  const signIn = () => {
    try {
      const returnTo = new URL(window.location.href)
      returnTo.searchParams.set('openMainPanel', 'settings')
      beginAgenticGraphStorageBrowserSignIn({ baseUrl: storageBaseUrl, returnTo: `${returnTo.pathname}${returnTo.search}` })
    } catch (error) {
      setConnection({ status: 'unavailable', message: error instanceof Error ? error.message : 'Sign-in unavailable.' })
    }
  }

  const transfer = async (direction: 'upload' | 'download') => {
    if (syncing) return
    setSyncing(true)
    try {
      const { transferSourceFilesCloud } = await import('@/features/source-files/sourceFileCloudTransfer')
      const result = await transferSourceFilesCloud({ direction, prefix: transferScope })
      const message = `${direction === 'upload' ? 'Uploaded' : 'Downloaded'} ${result.transferred}; unchanged ${result.unchanged}; preserved cloud copies ${result.conflicts.length}; unsupported ${result.skipped}.`
      setLastStatus(message)
      pushUiToast({ id: 'source-files-cloud-transfer', kind: result.conflicts.length ? 'warning' : 'success',
        message, ttlMs: 6000, dismissible: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed; local copies retained.'
      setLastStatus(message)
      pushUiToast({ id: 'source-files-cloud-transfer', kind: 'warning', message, ttlMs: 6000, dismissible: true })
      await checkConnection()
    } finally { setSyncing(false) }
  }

  const setCloudEnabled = React.useCallback((enabled: boolean) => {
    writeWorkspaceCloudSyncEnabledSetting(enabled)
    setLastStatus(enabled ? 'Online sync enabled; local fallback remains active' : 'Offline-only mode')
  }, [])

  const openSourceFiles = React.useCallback(() => {
    requestMarkdownExplorerSourceFilesOpen()
    openMarkdownWorkspaceEditorPane(useGraphStore.getState())
  }, [])

  const syncNow = React.useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const session = await checkConnection()
      if (session.status !== 'authenticated') throw new Error(session.message || 'Sign in before syncing this workspace.')
      const result = await runDocumentStorageSyncNow()
      const retainedIssueCount = result.unresolvedConflictCount + result.rejectedCount + result.deferredCount
      const message = result.status === 'synced' && retainedIssueCount > 0
        ? `Sync transport completed with ${retainedIssueCount} retained change${retainedIssueCount === 1 ? '' : 's'} needing review.`
        : result.status === 'synced'
        ? `Synced ${result.pushedCount} up and ${result.pulledDocumentCount} down.`
        : result.status === 'volatile-session'
          ? 'IndexedDB unavailable; storage changes are volatile and cloud sync is paused for this browser session.'
        : result.status === 'offline-only'
          ? 'Offline-only mode; storage changes remain saved in IndexedDB.'
          : durablePersistence
            ? 'Cloud unavailable; local changes remain queued in IndexedDB for retry.'
            : 'Cloud unavailable; storage changes remain only for this browser session.'
      setLastStatus(message)
      pushUiToast({
        id: `document-storage-sync-${Date.now().toString(36)}`,
        kind: result.status === 'synced' && retainedIssueCount === 0 ? 'success' : 'warning',
        message,
        ttlMs: 3600,
        dismissible: true,
      })
    } catch (error) {
      const fallback = durablePersistence
        ? 'Document sync failed; local changes remain saved in IndexedDB.'
        : 'Document sync failed; storage changes remain only for this browser session.'
      const detail = error instanceof Error ? String(error.message || '').trim() : ''
      const message = detail ? `${fallback} ${detail}` : fallback
      setLastStatus(message)
      pushUiToast({ id: 'document-storage-sync-failed', kind: 'warning', message, ttlMs: 5000, dismissible: true })
    } finally {
      setSyncing(false)
    }
  }, [checkConnection, durablePersistence, pushUiToast, syncing])

  const KeyTypeValueRow = (
    props: Omit<React.ComponentProps<typeof KeyTypeValueStaticRow>, 'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'>,
  ) => <KeyTypeValueStaticRow {...staticRowProps} {...props} />
  const actionClassName = getUiSectionActionClassName('primary')
  const activeActionClassName = `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`
  const modeStatus = !cloudEnabled
    ? 'Offline only'
    : !durablePersistence
      ? 'Volatile session; cloud sync paused'
    : !online
      ? 'Offline fallback active'
      : storageAvailable
        ? connection?.status === 'authenticated' ? 'Cloud connection ready' : 'Cloud sign-in required'
        : 'Online sync not configured'
  const indexedDbStatus = durablePersistence
    ? 'IndexedDB: active'
    : persistenceState
      ? 'IndexedDB: active? no; memory is volatile'
      : 'IndexedDB: checking'

  return (
    <>
      <li>
        <KeyTypeValueRow
          id={ROW_ANCHORS.mode}
          dataKgAnchor={ROW_ANCHORS.mode}
          keyNode="Storage mode"
          typeNode={<Cloud className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <button type="button" role="switch" aria-checked={cloudEnabled && storageAvailable} className={cloudEnabled && storageAvailable ? activeActionClassName : actionClassName} onClick={() => setCloudEnabled(true)}>
                <Cloud className="h-3.5 w-3.5" aria-hidden="true" /> Online
              </button>
              <button type="button" className={!cloudEnabled ? activeActionClassName : actionClassName} onClick={() => setCloudEnabled(false)}>
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Offline only
              </button>
              <ValuePill primary={cloudEnabled}>{modeStatus}</ValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={ROW_ANCHORS.status}
          dataKgAnchor={ROW_ANCHORS.status}
          keyNode="Cloud connection"
          typeNode={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <ValuePill>Workspace: {workspaceId}</ValuePill>
              <ValuePill>{connection?.status === 'authenticated' ? 'Signed in' : connection?.status === 'unauthenticated' ? 'Sign-in required' : connection?.status === 'access-denied' ? 'Workspace access required' : connection?.message || (!online || !cloudEnabled ? 'Offline only' : !storageAvailable ? 'Choose Online to connect' : 'Checking connection')}</ValuePill>
              <button type="button" className={actionClassName} disabled={syncing || checking || !online} onClick={() => { void checkConnection() }}>
                {checking ? 'Checking…' : 'Check connection'}
              </button>
              {connection?.status !== 'authenticated' && <button type="button" className={activeActionClassName} disabled={syncing || !online} onClick={signIn}>Sign in</button>}
              <ValuePill>Storage: {storageAvailable ? 'configured' : 'choose Online to configure'}</ValuePill>
              <ValuePill>Yjs room: {collaborationReady ? 'configured' : 'unavailable'}</ValuePill>
              <ValuePill>{lastStatus}</ValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={ROW_ANCHORS.roots}
          dataKgAnchor={ROW_ANCHORS.roots}
          keyNode="GitHub document roots"
          typeNode={<Cloud className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <ValuePill>Product: {DOCUMENT_REPOSITORY_DISPLAY_ROOTS.agenticGraphDocs}</ValuePill>
              <ValuePill>Workspace: {DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceDocs}</ValuePill>
              <ValuePill>Seeds: {DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceSeeds}</ValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={ROW_ANCHORS.fallback}
          dataKgAnchor={ROW_ANCHORS.fallback}
          keyNode="Offline fallback"
          typeNode={<HardDrive className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <ValuePill>{indexedDbStatus}</ValuePill>
              <ValuePill>{durablePersistence ? 'Queued outbox: retained in IndexedDB' : 'Outbox: this browser session only'}</ValuePill>
              {persistenceState?.failedRecordTypes.length
                ? <ValuePill>Restore warnings: {persistenceState.failedRecordTypes.map(item => item.recordType).join(', ')}</ValuePill>
                : null}
              <ValuePill>Mirror: {docsMirrorRoot || 'browser local storage'}</ValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={ROW_ANCHORS.actions}
          dataKgAnchor={ROW_ANCHORS.actions}
          keyNode="Sync actions"
          typeNode={<RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <button type="button" className={activeActionClassName} disabled={syncing || !online || !storageAvailable || !cloudEnabled || connection?.status !== 'authenticated'} title={durablePersistence ? 'Save to IndexedDB, then push queued changes and pull remote updates' : 'Save only for this browser session; cloud sync remains paused'} onClick={() => { void syncNow() }}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {syncing ? 'Syncing...' : 'Sync now'}
              </button>
              <button type="button" className={actionClassName} onClick={openSourceFiles}>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Open Source Files
              </button>
              <ValuePill>Endpoint: {storageBaseUrl || '/api/storage (same origin)'}</ValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={buildSettingsRowAnchorId('document-storage-sync-row', 'transfers')}
          keyNode="Transfer files / folders"
          typeNode={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <input aria-label="Cloud transfer file or folder path" className="min-w-0 rounded border bg-transparent px-2 py-1" value={transferScope} disabled={syncing} onChange={event => setTransferScope(event.target.value)} />
              {(['upload', 'download'] as const).map(direction => <button key={direction} type="button" className={actionClassName}
                disabled={syncing || !online || !storageAvailable || !cloudEnabled || connection?.status !== 'authenticated'}
                onClick={() => { void transfer(direction) }}>{direction === 'upload' ? 'Upload copies' : 'Download copies'}</button>)}
              <small className="basis-full">Markdown files and subfolders · 50 files / 5 MiB per transfer. Differing downloads are kept as .cloud copies. No files are deleted; Git remains canonical.</small>
              <span role="status" className="basis-full break-words">{syncing ? 'Transfer in progress…' : lastStatus}</span>
            </section>
          )}
          align="start"
        />
      </li>
    </>
  )
}
