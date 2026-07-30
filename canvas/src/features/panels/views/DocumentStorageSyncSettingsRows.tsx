import React from 'react'
import { Cloud, CloudOff, FolderOpen, HardDrive, RefreshCw } from 'lucide-react'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { DOCUMENT_REPOSITORY_DISPLAY_ROOTS } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runDocumentStorageSyncNow } from '@/features/source-files/documentStorageSyncRuntime'
import {
  readKnowgrphStorageBaseUrl,
  readKnowgrphStorageRuntimeSyncAvailable,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { readKnowgrphCollaborationConfig } from '@/features/source-files/sourceFilesPocketBaseYjsRoom'
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
  subscribeKnowgrphStoragePersistenceState,
} from '@/lib/storage/knowgrphStorageDb'
import type { PersistedCollectionPersistenceState } from '@/lib/storage/persistedCollectionStore'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

const SEARCH_INDEX = [
  'document storage sync cloud online collaboration offline fallback',
  'github knowgrph docs huijoohwee docs workspace seeds',
  'pocketbase yjs cloudflare d1 indexeddb local mirror sync now',
].join(' ')

export const DOCUMENT_STORAGE_SYNC_SETTINGS_ROW_COUNT = 5

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
  const [lastStatus, setLastStatus] = React.useState('Not synced in this session')
  const [persistenceState, setPersistenceState] = React.useState<PersistedCollectionPersistenceState | null>(null)
  const persistenceWarningRef = React.useRef('')
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const cloudEnabled = React.useMemo(() => readWorkspaceCloudSyncEnabledSetting(), [settingsRevision])
  const storageAvailable = React.useMemo(() => readKnowgrphStorageRuntimeSyncAvailable(), [settingsRevision])
  const storageBaseUrl = React.useMemo(() => readKnowgrphStorageBaseUrl(), [settingsRevision])
  const collaboration = React.useMemo(() => readKnowgrphCollaborationConfig(), [settingsRevision])
  const docsMirrorRoot = React.useMemo(() => readWorkspaceDocsMirrorRootPathSetting(), [settingsRevision])
  const collaborationReady = collaboration.enabled && !!collaboration.pocketBaseUrl && !!collaboration.saveBridgeUrl

  React.useEffect(() => subscribeWorkspaceStoreSyncSettingsChanged(() => {
    setSettingsRevision(previous => previous + 1)
  }), [])

  React.useEffect(() => subscribeKnowgrphStoragePersistenceState(state => {
    setPersistenceState(state)
    const warning = state.status === 'degraded' ? String(state.error || 'IndexedDB unavailable') : ''
    if (!warning || persistenceWarningRef.current === warning) return
    persistenceWarningRef.current = warning
    pushUiToast({
      id: 'document-storage-indexeddb-degraded',
      kind: 'warning',
      message: `IndexedDB degraded to in-memory storage. ${warning}`,
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
      const result = await runDocumentStorageSyncNow()
      const message = result.status === 'synced'
        ? `Synced ${result.pushedCount} up and ${result.pulledDocumentCount} down.`
        : result.status === 'offline-only'
          ? 'Offline-only mode; documents remain saved locally.'
          : 'Cloud unavailable; local changes remain queued for retry.'
      setLastStatus(message)
      pushUiToast({
        id: `document-storage-sync-${Date.now().toString(36)}`,
        kind: result.status === 'synced' ? 'success' : 'warning',
        message,
        ttlMs: 3600,
        dismissible: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document sync failed; local changes remain saved.'
      setLastStatus(message)
      pushUiToast({ id: 'document-storage-sync-failed', kind: 'warning', message, ttlMs: 5000, dismissible: true })
    } finally {
      setSyncing(false)
    }
  }, [pushUiToast, syncing])

  const KeyTypeValueRow = (
    props: Omit<React.ComponentProps<typeof KeyTypeValueStaticRow>, 'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'>,
  ) => <KeyTypeValueStaticRow {...staticRowProps} {...props} />
  const actionClassName = getUiSectionActionClassName('primary')
  const activeActionClassName = `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`
  const modeStatus = !cloudEnabled
    ? 'Offline only'
    : !online
      ? 'Offline fallback active'
      : storageAvailable
        ? 'Online sync active'
        : 'Online sync not configured'
  const indexedDbStatus = persistenceState?.status === 'degraded'
    ? 'IndexedDB: degraded to memory'
    : 'IndexedDB: active'

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
              <button type="button" role="switch" aria-checked={cloudEnabled} className={cloudEnabled ? activeActionClassName : actionClassName} onClick={() => setCloudEnabled(true)}>
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
          keyNode="Online collaboration"
          typeNode={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          valueNode={(
            <section className={VALUE_CLASS_NAME}>
              <ValuePill>Storage: {storageAvailable ? 'configured' : 'unavailable'}</ValuePill>
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
              <ValuePill>Product: {DOCUMENT_REPOSITORY_DISPLAY_ROOTS.knowgrphDocs}</ValuePill>
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
              <ValuePill>Queued outbox: retained</ValuePill>
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
              <button type="button" className={activeActionClassName} disabled={syncing} title="Save locally, then push queued changes and pull remote document updates when online" onClick={() => { void syncNow() }}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {syncing ? 'Syncing...' : 'Sync now'}
              </button>
              <button type="button" className={actionClassName} onClick={openSourceFiles}>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Open Source Files
              </button>
              {storageBaseUrl ? <ValuePill>Endpoint: {storageBaseUrl}</ValuePill> : null}
            </section>
          )}
          align="start"
        />
      </li>
    </>
  )
}
