import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { createNewChatHistoryWorkspaceFilePath } from '@/features/chat/chatHistoryWorkspace'
import {
  getMarkdownWorkspaceActionBridge,
  type WorkspaceBridgeImportResult,
  type WorkspaceFileSelection,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { importLocalFilesFallback, importLocalFolderFallback, importUrlFallback } from '@/features/toolbar/launchDropdownFallbacks'
import {
  ACTIVE_WORKSPACE_SYNC_MAX_ATTEMPTS,
  ACTIVE_WORKSPACE_SYNC_RETRY_MS,
} from './settingsView.constants'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'

type WorkspaceKind = 'chatHistory' | 'agentic-graph'

type UseSettingsWorkspaceActionsArgs = {
  patchChatValues: (patch: Record<string, string>) => void
  chatLocalStorageRootPath: string | number | boolean | undefined
  chatHistoryCloudUrl: string | number | boolean | undefined
  chatAgenticGraphCloudUrl: string | number | boolean | undefined
  createWorkspaceFilePathImpl?: typeof createNewChatHistoryWorkspaceFilePath
  openWorkspaceFileImpl?: (path: string) => void
  importLocalFilesFallbackImpl?: typeof importLocalFilesFallback
  importLocalFolderFallbackImpl?: typeof importLocalFolderFallback
  importUrlFallbackImpl?: typeof importUrlFallback
}

export function useSettingsWorkspaceActions({
  patchChatValues,
  chatLocalStorageRootPath,
  chatHistoryCloudUrl,
  chatAgenticGraphCloudUrl,
  createWorkspaceFilePathImpl = createNewChatHistoryWorkspaceFilePath,
  openWorkspaceFileImpl,
  importLocalFilesFallbackImpl = importLocalFilesFallback,
  importLocalFolderFallbackImpl = importLocalFolderFallback,
  importUrlFallbackImpl = importUrlFallback,
}: UseSettingsWorkspaceActionsArgs) {
  const [agenticGraphPathStatus, setAgenticGraphPathStatus] = React.useState<string | null>(null)
  const [isUpdatingAgenticGraphPath, setIsUpdatingAgenticGraphPath] = React.useState(false)
  const [chatHistoryPathStatus, setChatHistoryPathStatus] = React.useState<string | null>(null)
  const [isUpdatingChatHistoryPath, setIsUpdatingChatHistoryPath] = React.useState(false)
  const agenticOsLocalImportInputRef = React.useRef<HTMLInputElement | null>(null)
  const agenticOsLocalFolderImportInputRef = React.useRef<HTMLInputElement | null>(null)
  const localImportInputRef = React.useRef<HTMLInputElement | null>(null)
  const localFolderImportInputRef = React.useRef<HTMLInputElement | null>(null)
  const activeWorkspaceSyncTimeoutsRef = React.useRef<{ chatHistory: number | null, 'agentic-graph': number | null }>({
    chatHistory: null,
    'agentic-graph': null,
  })
  const mountedRef = React.useRef(true)
  const intentRef = React.useRef<Record<WorkspaceKind, object>>({ chatHistory: {}, 'agentic-graph': {} })
  const isCurrentIntent = React.useCallback((kind: WorkspaceKind, intent: object): boolean =>
    mountedRef.current && intentRef.current[kind] === intent, [])
  const beginIntent = React.useCallback((kind: WorkspaceKind): object | null => {
    if (!mountedRef.current) return null
    const previousTimeout = activeWorkspaceSyncTimeoutsRef.current[kind]
    if (previousTimeout !== null) window.clearTimeout(previousTimeout)
    activeWorkspaceSyncTimeoutsRef.current[kind] = null
    const intent = {}
    intentRef.current[kind] = intent
    if (kind === 'chatHistory') setIsUpdatingChatHistoryPath(false)
    else setIsUpdatingAgenticGraphPath(false)
    return intent
  }, [])
  const bridge = getMarkdownWorkspaceActionBridge()
  const bridgeImportLocalFiles = bridge.importLocalFiles
  const bridgeImportLocalFolder = bridge.importLocalFolder
  const bridgeImportUrl = bridge.importUrl
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  React.useEffect(() => {
    mountedRef.current = true
    const timeouts = activeWorkspaceSyncTimeoutsRef.current
    return () => {
      mountedRef.current = false
      intentRef.current = { chatHistory: {}, 'agentic-graph': {} }
      if (timeouts.chatHistory !== null) {
        window.clearTimeout(timeouts.chatHistory)
        timeouts.chatHistory = null
      }
      if (timeouts['agentic-graph'] !== null) {
        window.clearTimeout(timeouts['agentic-graph'])
        timeouts['agentic-graph'] = null
      }
    }
  }, [])

  const openWorkspaceFile = React.useCallback((path: string) => {
    const normalized = normalizeWorkspacePath(path)
    if (typeof openWorkspaceFileImpl === 'function') {
      openWorkspaceFileImpl(normalized)
      return
    }
    openMarkdownWorkspaceEditorPane(useGraphStore.getState())
    useMarkdownExplorerStore.getState().setActivePath(normalized)
  }, [openWorkspaceFileImpl])

  const syncPathFromActiveWorkspaceFile = React.useCallback((kind: WorkspaceKind, intent: object, attempt = 0) => {
    if (!isCurrentIntent(kind, intent)) return
    const active = useMarkdownExplorerStore.getState().activePath
    const normalized = active ? normalizeWorkspacePath(active) : ''
    if (normalized && normalized.toLowerCase().endsWith('.md')) {
      if (kind === 'chatHistory') {
        patchChatValues({
          chatHistoryStorageMode: 'local',
          chatHistoryCloudUrl: '',
          chatHistoryWorkspacePath: normalized,
        })
        setChatHistoryPathStatus(normalized)
      } else {
        patchChatValues({
          chatAgenticGraphStorageMode: 'local',
          chatAgenticGraphCloudUrl: '',
          chatAgenticGraphWorkspacePath: normalized,
        })
        setAgenticGraphPathStatus(normalized)
      }
      activeWorkspaceSyncTimeoutsRef.current[kind] = null
      return
    }
    if (attempt >= ACTIVE_WORKSPACE_SYNC_MAX_ATTEMPTS || typeof window === 'undefined') {
      activeWorkspaceSyncTimeoutsRef.current[kind] = null
      return
    }
    const nextAttempt = attempt + 1
    activeWorkspaceSyncTimeoutsRef.current[kind] = window.setTimeout(() => {
      syncPathFromActiveWorkspaceFile(kind, intent, nextAttempt)
    }, ACTIVE_WORKSPACE_SYNC_RETRY_MS)
  }, [isCurrentIntent, patchChatValues])

  const createWorkspaceBackedFile = React.useCallback(async (kind: WorkspaceKind) => {
    const intent = beginIntent(kind)
    if (!intent) return
    const setPending = kind === 'chatHistory' ? setIsUpdatingChatHistoryPath : setIsUpdatingAgenticGraphPath
    const setStatus = kind === 'chatHistory' ? setChatHistoryPathStatus : setAgenticGraphPathStatus
    const storageType = kind === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph'
    const patch = kind === 'chatHistory'
      ? {
          chatHistoryStorageMode: 'local',
          chatHistoryCloudUrl: '',
        }
      : {
          chatAgenticGraphStorageMode: 'local',
          chatAgenticGraphCloudUrl: '',
        }
    const pathKey = kind === 'chatHistory' ? 'chatHistoryWorkspacePath' : 'chatAgenticGraphWorkspacePath'
    setPending(true)
    setStatus(null)
    try {
      const created = await createWorkspaceFilePathImpl(Date.now(), {
        storageType,
        defaultLocalRootPath: String(chatLocalStorageRootPath || '').trim() || null,
      })
      if (!isCurrentIntent(kind, intent)) return
      patchChatValues({
        ...patch,
        [pathKey]: created,
      })
      openWorkspaceFile(created)
      setStatus(created)
    } catch (err) {
      if (isCurrentIntent(kind, intent)) setStatus(err instanceof Error ? err.message : String(err || 'Failed to create file'))
    } finally {
      if (isCurrentIntent(kind, intent)) setPending(false)
    }
  }, [beginIntent, isCurrentIntent, chatLocalStorageRootPath, createWorkspaceFilePathImpl, openWorkspaceFile, patchChatValues])

  const applyActiveWorkspaceFile = React.useCallback((kind: WorkspaceKind) => {
    if (!beginIntent(kind)) return
    const setStatus = kind === 'chatHistory' ? setChatHistoryPathStatus : setAgenticGraphPathStatus
    setStatus(null)
    const active = useMarkdownExplorerStore.getState().activePath
    const normalized = active ? normalizeWorkspacePath(active) : null
    if (!normalized || !normalized.toLowerCase().endsWith('.md')) {
      setStatus('No active markdown file is selected in Workspace Editor.')
      return
    }
    if (kind === 'chatHistory') {
      patchChatValues({
        chatHistoryStorageMode: 'local',
        chatHistoryCloudUrl: '',
        chatHistoryWorkspacePath: normalized,
      })
    } else {
      patchChatValues({
        chatAgenticGraphStorageMode: 'local',
        chatAgenticGraphCloudUrl: '',
        chatAgenticGraphWorkspacePath: normalized,
      })
    }
    openWorkspaceFile(normalized)
    setStatus(normalized)
  }, [beginIntent, openWorkspaceFile, patchChatValues])

  const openFilePicker = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return
    try {
      const anyEl = el as unknown as { showPicker?: () => void }
      if (typeof anyEl.showPicker === 'function') {
        anyEl.showPicker()
        return
      }
    } catch {
      void 0
    }
    try {
      el.click()
    } catch {
      void 0
    }
  }, [])

  const readBridgeImportResultCreatedPaths = React.useCallback((value: void | WorkspaceBridgeImportResult): string[] => {
    const result = value && typeof value === 'object' ? value : null
    const createdPaths = Array.isArray(result?.createdPaths) ? result.createdPaths : []
    return createdPaths.map(path => String(path || '').trim()).filter(Boolean)
  }, [])

  const syncImportedWorkspaceSelectionToStorage = React.useCallback(async (args: {
    createdPaths: string[]
    label: string
    kind: WorkspaceKind
    intent: object
  }) => {
    if (args.createdPaths.length === 0 || !isCurrentIntent(args.kind, args.intent)) return
    try {
      const { publishWorkspacePathsToAgenticGraphStorage } = (await import('@/features/source-files/sourceFileShareUrl')) as typeof import('@/features/source-files/sourceFileShareUrl')
      if (!isCurrentIntent(args.kind, args.intent)) return
      const result = await publishWorkspacePathsToAgenticGraphStorage({
        paths: args.createdPaths,
        syncNow: true,
      })
      if (!isCurrentIntent(args.kind, args.intent) || result.storedCount <= 0) return
      pushUiToast({
        id: `settings-import-storage-sync-${Date.now().toString(36)}`,
        kind: 'success',
        message: `Stored ${result.storedCount} selected ${args.label} for sync.`,
        ttlMs: 2600,
        dismissible: true,
      })
    } catch (err) {
      if (!isCurrentIntent(args.kind, args.intent)) return
      pushUiToast({
        id: 'settings-import-storage-sync-failed',
        kind: 'error',
        message: err instanceof Error ? err.message : 'Selected files were imported but storage sync failed.',
        ttlMs: 5000,
        dismissible: true,
      })
    }
  }, [isCurrentIntent, pushUiToast])

  const importLocalSelection = React.useCallback(async (kind: WorkspaceKind, files: WorkspaceFileSelection, selectionKind: 'files' | 'folder') => {
    const snapshot = files ? Array.from(files) : []
    if (snapshot.length === 0) return
    const intent = beginIntent(kind)
    if (!intent) return
    const setStatus = kind === 'chatHistory' ? setChatHistoryPathStatus : setAgenticGraphPathStatus
    const label = selectionKind === 'folder' ? 'folder' : 'files'
    if (kind === 'chatHistory') {
      setChatHistoryPathStatus(`Importing local ${label}...`)
      patchChatValues({ chatHistoryStorageMode: 'local', chatHistoryCloudUrl: '' })
    } else {
      setAgenticGraphPathStatus(`Importing local ${label}...`)
      patchChatValues({ chatAgenticGraphStorageMode: 'local', chatAgenticGraphCloudUrl: '' })
    }
    const selection = snapshot
    try {
      const result = selectionKind === 'folder'
        ? typeof bridgeImportLocalFolder === 'function'
          ? await bridgeImportLocalFolder(selection)
          : await importLocalFolderFallbackImpl({ files: selection, pushUiToast })
        : typeof bridgeImportLocalFiles === 'function'
          ? await bridgeImportLocalFiles(selection)
          : await importLocalFilesFallbackImpl({ files: selection, pushUiToast })
      if (!isCurrentIntent(kind, intent)) return
      syncPathFromActiveWorkspaceFile(kind, intent)
      await syncImportedWorkspaceSelectionToStorage({
        createdPaths: readBridgeImportResultCreatedPaths(result), label, kind, intent,
      })
    } catch (err) {
      if (isCurrentIntent(kind, intent)) setStatus(err instanceof Error ? err.message : String(err || 'Failed to import files'))
    }
  }, [
    beginIntent,
    isCurrentIntent,
    bridgeImportLocalFiles,
    bridgeImportLocalFolder,
    importLocalFilesFallbackImpl,
    importLocalFolderFallbackImpl,
    patchChatValues,
    pushUiToast,
    readBridgeImportResultCreatedPaths,
    syncImportedWorkspaceSelectionToStorage,
    syncPathFromActiveWorkspaceFile,
  ])

  const importCloudUrl = React.useCallback(async (kind: WorkspaceKind) => {
    const next = String(kind === 'chatHistory' ? chatHistoryCloudUrl : chatAgenticGraphCloudUrl || '').trim()
    const setStatus = kind === 'chatHistory' ? setChatHistoryPathStatus : setAgenticGraphPathStatus
    if (!next) {
      setStatus(kind === 'chatHistory' ? 'Set chatHistoryCloudUrl first.' : 'Set chatAgenticGraphCloudUrl first.')
      return
    }
    const intent = beginIntent(kind)
    if (!intent) return
    if (kind === 'chatHistory') {
      patchChatValues({ chatHistoryStorageMode: 'cloud', chatHistoryCloudUrl: next })
    } else {
      patchChatValues({ chatAgenticGraphStorageMode: 'cloud', chatAgenticGraphCloudUrl: next })
    }
    setStatus(`Importing URL: ${next}`)
    try {
      if (typeof bridgeImportUrl === 'function') await bridgeImportUrl(next)
      else await importUrlFallbackImpl({ urlRaw: next, pushUiToast })
    } catch (err) {
      if (isCurrentIntent(kind, intent)) setStatus(err instanceof Error ? err.message : String(err || 'Failed to import URL'))
    }
  }, [beginIntent, isCurrentIntent, bridgeImportUrl, chatHistoryCloudUrl, chatAgenticGraphCloudUrl, importUrlFallbackImpl, patchChatValues, pushUiToast])

  return {
    chatHistoryPathStatus,
    createAndSelectChatHistoryFile: React.useCallback(async () => createWorkspaceBackedFile('chatHistory'), [createWorkspaceBackedFile]),
    createAndSelectAgenticGraphFile: React.useCallback(async () => createWorkspaceBackedFile('agentic-graph'), [createWorkspaceBackedFile]),
    applyActiveWorkspaceFileAsChatHistory: React.useCallback(() => applyActiveWorkspaceFile('chatHistory'), [applyActiveWorkspaceFile]),
    applyActiveWorkspaceFileAsAgenticGraph: React.useCallback(() => applyActiveWorkspaceFile('agentic-graph'), [applyActiveWorkspaceFile]),
    importCloudUrlForChatHistory: React.useCallback(() => importCloudUrl('chatHistory'), [importCloudUrl]),
    importCloudUrlForAgenticGraph: React.useCallback(() => importCloudUrl('agentic-graph'), [importCloudUrl]),
    importLocalFilesForChatHistory: React.useCallback((files: WorkspaceFileSelection) => importLocalSelection('chatHistory', files, 'files'), [importLocalSelection]),
    importLocalFilesForAgenticGraph: React.useCallback((files: WorkspaceFileSelection) => importLocalSelection('agentic-graph', files, 'files'), [importLocalSelection]),
    importLocalFolderForChatHistory: React.useCallback((files: WorkspaceFileSelection) => importLocalSelection('chatHistory', files, 'folder'), [importLocalSelection]),
    importLocalFolderForAgenticGraph: React.useCallback((files: WorkspaceFileSelection) => importLocalSelection('agentic-graph', files, 'folder'), [importLocalSelection]),
    isUpdatingChatHistoryPath,
    isUpdatingAgenticGraphPath,
    agenticOsLocalImportInputRef,
    agenticOsLocalFolderImportInputRef,
    agenticGraphPathStatus,
    localImportInputRef,
    localFolderImportInputRef,
    setChatHistoryPathStatus,
    setAgenticGraphPathStatus,
    openFilePicker,
    openWorkspaceFile,
  }
}
