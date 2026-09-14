import React from 'react'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { LS_KEYS } from '@/lib/config'
import { lsRemove } from '@/lib/persistence'
import {
  readWorkspaceDocsMirrorRootPathSetting,
  writeWorkspaceAutoRefreshEnabledSetting,
  writeWorkspaceSeedSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { uiToolbarRowScrollClassName, uiToolbarToggleActiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { openLocalMarkdownFolder, syncLocalMarkdownFolderToSourceFiles } from '@/features/source-files/localMarkdownFolder'
import { importSelectedSourceFiles } from '@/features/source-files/importSelectedSourceFiles'
import { SOURCE_FILES_FORMATS } from '@/lib/config.copy'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

const SOURCE_FILE_MANAGEMENT_SEARCH_INDEX = [
  'source file management',
  'source files',
  'docs mirror hydration',
  'local docs mirror',
  'configured docs root',
  'manual import local files',
  'select source files folder',
  'select source files files',
  'automatic sync',
  'manual sync',
  'docs mirror contract',
  'storage defaults cloud connection',
  'source mix',
  'workspace sync source files docs only',
  'workspace sync source files debounce ms',
  'workspace import default source url',
].join(' ')

export const SOURCE_FILE_MANAGEMENT_SETTINGS_ROW_COUNT = 7

const SOURCE_FILE_MANAGEMENT_ROW_ANCHORS = {
  actions: buildSettingsRowAnchorId('source-file-management-row', 'actions'),
  contract: buildSettingsRowAnchorId('source-file-management-row', 'contract'),
  counts: buildSettingsRowAnchorId('source-file-management-row', 'counts'),
  selection: buildSettingsRowAnchorId('source-file-management-row', 'selection'),
  sources: buildSettingsRowAnchorId('source-file-management-row', 'sources'),
  storage: buildSettingsRowAnchorId('source-file-management-row', 'storage'),
  sync: buildSettingsRowAnchorId('source-file-management-row', 'sync'),
} as const
const SOURCE_FILE_ROW_VALUE_CLASS_NAME = `${uiToolbarRowScrollClassName} flex-1 gap-1`
const SOURCE_FILE_ROW_DESCRIPTION_CLASS_NAME = `min-w-0 max-w-full ${UI_TEXT_TRUNCATE} ${UI_THEME_TOKENS.text.secondary}`

export const matchesSourceFileManagementQuery = (query: string): boolean => {
  const terms = query.split(/\s+/).map(term => term.trim()).filter(Boolean)
  if (terms.length === 0) return true
  return terms.every(term => SOURCE_FILE_MANAGEMENT_SEARCH_INDEX.includes(term))
}

type SourceFileManagementSettingsRowsProps = {
  normalizedQuery: string
  setValues?: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>
  values: Record<string, string | number | boolean>
}

const readBooleanValue = (
  values: Record<string, string | number | boolean>,
  key: string,
  fallback: boolean,
): boolean => {
  const value = values[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function SourceFileValuePill({ children }: { children: React.ReactNode }) {
  return (
    <span className={getUiSectionChipClassName('secondary')}>
      <span className={UI_TEXT_TRUNCATE}>{children}</span>
    </span>
  )
}

function SourceFileSettingsActionButton({
  children,
  disabled,
  onClick,
  primary,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  primary?: boolean
}) {
  const className = primary
    ? `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`
    : getUiSectionActionClassName('primary')
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      <span className={UI_TEXT_TRUNCATE}>{children}</span>
    </button>
  )
}

export function SourceFileManagementSettingsRows({
  normalizedQuery,
  setValues,
  values,
}: SourceFileManagementSettingsRowsProps) {
  const sourceFiles = useGraphStore(s => s.sourceFiles)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const setWorkspaceViewMode = useGraphStore(s => s.setWorkspaceViewMode)
  const setEditorWorkspacePane = useGraphStore(s => s.setEditorWorkspacePane)
  const [isRestoringDefaults, setIsRestoringDefaults] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const shouldShow = matchesSourceFileManagementQuery(normalizedQuery)
  const docsMirrorRootPath = String(values['workspace.sync.docsMirror.rootPath'] || readWorkspaceDocsMirrorRootPathSetting() || '').trim()
  const docsOnly = readBooleanValue(values, 'workspace.sync.sourceFiles.docsOnly', true)
  const seedSync = readBooleanValue(values, 'workspace.sync.seed.enabled', true)
  const autoRefresh = readBooleanValue(values, 'workspace.sync.autoRefresh.enabled', true)
  const defaultSourceUrl = String(values['workspace.import.defaultSourceUrl'] || '').trim()
  const syncMode = seedSync && autoRefresh ? 'automatic' : 'manual'
  const folderName = useGraphStore(s => s.localMarkdownFolderName)
  const folderAccessMode = useGraphStore(s => s.localMarkdownFolderAccessMode)
  const folderCacheId = useGraphStore(s => s.localMarkdownFolderCacheId)

  const summary = React.useMemo(() => {
    const list = Array.isArray(sourceFiles) ? sourceFiles : []
    let enabled = 0
    let parsed = 0
    let errors = 0
    let workspaceBacked = 0
    let remoteUrl = 0
    let manualLocal = 0
    for (const file of list) {
      if (!file) continue
      if (file.enabled) enabled += 1
      if (file.status === 'parsed') parsed += 1
      if (file.status === 'error') errors += 1
      const sourcePath = String(file.source?.path || '')
      const sourceUrl = String(file.source?.url || '')
      if (sourcePath.startsWith('workspace:')) workspaceBacked += 1
      else if (sourceUrl) remoteUrl += 1
      else if (sourcePath) manualLocal += 1
    }
    return {
      enabled,
      errors,
      manualLocal,
      parsed,
      remoteUrl,
      total: list.length,
      workspaceBacked,
    }
  }, [sourceFiles])
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const KeyTypeValueRow = (
    props: Omit<
      React.ComponentProps<typeof KeyTypeValueStaticRow>,
      'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
    >,
  ) => <KeyTypeValueStaticRow {...staticRowProps} {...props} />

  const openSourceFiles = React.useCallback(() => {
    requestMarkdownExplorerSourceFilesOpen()
    openMarkdownWorkspaceEditorPane(useGraphStore.getState())
  }, [])

  const syncSelectedFolder = React.useCallback(async () => {
    try {
      if (!folderName || !folderAccessMode) throw new Error('Select a Source Files folder first.')
      await syncLocalMarkdownFolderToSourceFiles()
      pushUiToast({
        id: `source-files-folder-refresh-${Date.now().toString(36)}`,
        kind: 'success',
        message: 'Refreshed selected Source Files folder.',
        ttlMs: 2600,
        dismissible: true,
      })
    } catch (err) {
      pushUiToast({
        id: 'source-files-folder-refresh-failed',
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to refresh selected Source Files folder.',
        ttlMs: 5000,
        dismissible: true,
      })
    }
  }, [folderName, folderAccessMode, pushUiToast])

  const selectSourceFilesFolder = React.useCallback(async () => {
    const opened = await openLocalMarkdownFolder()
    if (opened) openSourceFiles()
  }, [openSourceFiles])

  const selectSourceFiles = React.useCallback(() => {
    const input = fileInputRef.current
    if (!input) return
    try {
      const anyInput = input as unknown as { showPicker?: () => void }
      if (typeof anyInput.showPicker === 'function') {
        anyInput.showPicker()
        return
      }
    } catch {
      void 0
    }
    input.click()
  }, [])

  const importSourceFiles = React.useCallback(async (files: FileList | null) => {
    try {
      const count = await importSelectedSourceFiles(files)
      if (count > 0) {
        openSourceFiles()
        pushUiToast({
          id: `source-files-selected-imported-${Date.now().toString(36)}`,
          kind: 'success',
          message: `Imported ${count} selected Source Files.`,
          ttlMs: 2600,
          dismissible: true,
        })
      }
    } catch (err) {
      pushUiToast({
        id: 'source-files-selected-import-failed',
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to import selected Source Files.',
        ttlMs: 5000,
        dismissible: true,
      })
    }
  }, [openSourceFiles, pushUiToast])

  const setSourceFilesSyncMode = React.useCallback(async (mode: 'automatic' | 'manual') => {
    const automatic = mode === 'automatic'
    writeWorkspaceSeedSyncEnabledSetting(automatic)
    writeWorkspaceAutoRefreshEnabledSetting(automatic)
    setValues?.(prev => ({
      ...prev,
      'workspace.sync.seed.enabled': automatic,
      'workspace.sync.autoRefresh.enabled': automatic,
    }))
    if (automatic) {
      try {
        const mod = (await import('@/features/workspace-fs/workspaceFs')) as typeof import('@/features/workspace-fs/workspaceFs')
        const fs = await mod.getWorkspaceFs()
        await fs.ensureSeed()
      } catch {
        void 0
      }
    }
    pushUiToast({
      id: `source-files-sync-mode-${mode}`,
      kind: 'neutral',
      message: `Source Files sync: ${automatic ? 'automatic' : 'manual'}.`,
      ttlMs: 2400,
      dismissible: true,
    })
  }, [pushUiToast, setValues])

  const recomposeSourceFiles = React.useCallback(async () => {
    try {
      const mod = (await import('@/features/source-files/applyComposedGraphFromSourceFiles')) as typeof import('@/features/source-files/applyComposedGraphFromSourceFiles')
      mod.scheduleApplyComposedGraphFromSourceFiles()
      pushUiToast({
        id: `source-files-recompose-${Date.now().toString(36)}`,
        kind: 'neutral',
        message: 'Queued Source Files recomposition.',
        ttlMs: 2600,
        dismissible: true,
      })
    } catch (err) {
      pushUiToast({
        id: 'source-files-recompose-failed',
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to queue Source Files recomposition.',
        ttlMs: 5000,
        dismissible: true,
      })
    }
  }, [pushUiToast])

  const restoreDefaultSourceFiles = React.useCallback(async () => {
    if (isRestoringDefaults) return
    setIsRestoringDefaults(true)
    try {
      lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
      lsRemove(LS_KEYS.markdownWorkspaceSeeded)
      const mod = (await import('@/features/workspace-fs/workspaceFs')) as typeof import('@/features/workspace-fs/workspaceFs')
      const fs = await mod.getWorkspaceFs()
      await fs.ensureSeed()
      requestMarkdownExplorerSourceFilesOpen()
      openMarkdownWorkspaceEditorPane(useGraphStore.getState())
      const composeMod = (await import('@/features/source-files/applyComposedGraphFromSourceFiles')) as typeof import('@/features/source-files/applyComposedGraphFromSourceFiles')
      composeMod.scheduleApplyComposedGraphFromSourceFiles()
      pushUiToast({
        id: 'source-files-defaults-restored',
        kind: 'success',
        message: 'Default docs mirror Source Files restored.',
        ttlMs: 3000,
        dismissible: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore default Source Files.'
      pushUiToast({
        id: 'source-files-defaults-restore-failed',
        kind: 'error',
        message,
        ttlMs: 5000,
        dismissible: true,
      })
    } finally {
      setIsRestoringDefaults(false)
    }
  }, [isRestoringDefaults, pushUiToast])

  if (!shouldShow) return null

  return (
    <>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.actions}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.actions}
          keyNode={<span className="font-semibold">Source File Management</span>}
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>actions</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileSettingsActionButton primary onClick={openSourceFiles}>
                Open Source Files
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton onClick={() => emitMainPanelOpen({ tab: 'settings', searchQuery: 'cloud' })}>
                Configure cloud sync
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton onClick={() => { void recomposeSourceFiles() }}>
                Recompose now
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton disabled={isRestoringDefaults} onClick={() => { void restoreDefaultSourceFiles() }}>
                {isRestoringDefaults ? 'Restoring...' : 'Restore docs mirror defaults'}
              </SourceFileSettingsActionButton>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.contract}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.contract}
          keyNode="Docs mirror contract"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>policy</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_DESCRIPTION_CLASS_NAME}>
              Automated defaults hydrate Source Files from the configured docs mirror. Import local files remains an explicit manual action, not a hidden bootstrap path.
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.selection}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.selection}
          keyNode="Folder / file selection"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>input</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileSettingsActionButton onClick={() => { void selectSourceFilesFolder() }}>
                Select folder
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton onClick={selectSourceFiles}>
                Select files
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton disabled={!folderName || !folderAccessMode} onClick={() => { void syncSelectedFolder() }}>
                Refresh selected
              </SourceFileSettingsActionButton>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={SOURCE_FILES_FORMATS.importLocalText.join(',')}
                className="hidden"
                onChange={event => {
                  const files = event.currentTarget.files
                  void importSourceFiles(files)
                  event.currentTarget.value = ''
                }}
              />
              <SourceFileValuePill>Folder: {folderName || folderCacheId || 'none'}</SourceFileValuePill>
              <SourceFileValuePill>Access: {folderAccessMode || 'none'}</SourceFileValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.sync}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.sync}
          keyNode="Local refresh mode"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>control</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileSettingsActionButton primary={syncMode === 'automatic'} onClick={() => { void setSourceFilesSyncMode('automatic') }}>
                Automatic
              </SourceFileSettingsActionButton>
              <SourceFileSettingsActionButton primary={syncMode === 'manual'} onClick={() => { void setSourceFilesSyncMode('manual') }}>
                Manual
              </SourceFileSettingsActionButton>
              <SourceFileValuePill>Default: automatic</SourceFileValuePill>
              <SourceFileValuePill>Mode: {syncMode}</SourceFileValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.counts}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.counts}
          keyNode="Source Files"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>summary</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileValuePill>Total: {summary.total}</SourceFileValuePill>
              <SourceFileValuePill>Enabled: {summary.enabled}</SourceFileValuePill>
              <SourceFileValuePill>Parsed: {summary.parsed}</SourceFileValuePill>
              <SourceFileValuePill>Errors: {summary.errors}</SourceFileValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.storage}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.storage}
          keyNode="Storage defaults"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>local</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileValuePill>Docs root: {docsMirrorRootPath || 'not configured'}</SourceFileValuePill>
              <SourceFileValuePill>Workspace root: /docs</SourceFileValuePill>
              <SourceFileValuePill>Docs only: {docsOnly ? 'on' : 'off'}</SourceFileValuePill>
              <SourceFileValuePill>Seed sync: {seedSync ? 'on' : 'off'}</SourceFileValuePill>
              <SourceFileValuePill>Auto refresh: {autoRefresh ? 'on' : 'off'}</SourceFileValuePill>
            </section>
          )}
          align="start"
        />
      </li>
      <li>
        <KeyTypeValueRow
          id={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.sources}
          dataKgAnchor={SOURCE_FILE_MANAGEMENT_ROW_ANCHORS.sources}
          keyNode="Source mix"
          typeNode={<span className={UI_THEME_TOKENS.text.secondary}>origin</span>}
          valueNode={(
            <section className={SOURCE_FILE_ROW_VALUE_CLASS_NAME}>
              <SourceFileValuePill>Workspace-backed: {summary.workspaceBacked}</SourceFileValuePill>
              <SourceFileValuePill>Manual local: {summary.manualLocal}</SourceFileValuePill>
              <SourceFileValuePill>URL imports: {summary.remoteUrl}</SourceFileValuePill>
              {defaultSourceUrl ? <SourceFileValuePill>Default source: {defaultSourceUrl}</SourceFileValuePill> : null}
            </section>
          )}
          align="start"
        />
      </li>
    </>
  )
}
