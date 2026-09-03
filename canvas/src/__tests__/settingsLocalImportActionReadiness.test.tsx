import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { DEFAULT_PAYMENT_PROVIDER_ID } from '@/features/payments/providers'
import { useSettingsView } from '@/features/panels/views/useSettingsView'
import { useSettingsSync } from '@/features/panels/views/useSettingsSync'
import { useSettingsWorkspaceActions } from '@/features/panels/views/useSettingsWorkspaceActions'
import { CHAT_PROVIDER_OPENAI } from '@/lib/chatEndpoint'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const AGENTIC_OS_IMPORTED_FILE_NAME = 'agenticOs_20260523133000.md'
const HISTORY_IMPORTED_FILE_NAME = 'history_local_import_20260523133000.md'
const AGENTIC_OS_IMPORTED_PATH = `/workspace/chat/${AGENTIC_OS_IMPORTED_FILE_NAME}`
const HISTORY_IMPORTED_PATH = `/workspace/chat/${HISTORY_IMPORTED_FILE_NAME}`
const AGENTIC_OS_FOLDER_FILE_NAME = 'agenticOs_20260523133100.md'
const HISTORY_FOLDER_FILE_NAME = 'history_folder_20260523133000.md'
const AGENTIC_OS_FOLDER_IMPORTED_PATH = `/workspace/chat/folder/${AGENTIC_OS_FOLDER_FILE_NAME}`
const HISTORY_FOLDER_IMPORTED_PATH = `/workspace/chat/folder/${HISTORY_FOLDER_FILE_NAME}`

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

function SettingsLocalImportHarness(props: {
  actionsRef: React.MutableRefObject<RegisteredSettingsActions | null>
}): React.ReactElement {
  const {
    values,
    setValues,
    dirtyRef,
  } = useSettingsView({
    searchQuery: 'chat',
    mode: 'all',
    paymentsProviderId: DEFAULT_PAYMENT_PROVIDER_ID,
    onRegisterActions: next => {
      props.actionsRef.current = { apply: next.apply, reset: next.reset }
    },
  })

  useSettingsSync({ dirtyRef, setValues, values })

  const patchChatValues = React.useCallback((patch: Record<string, string>) => {
    Object.keys(patch).forEach(key => dirtyRef.current.add(key))
    setValues(prev => ({ ...prev, ...patch }))
  }, [dirtyRef, setValues])

  const {
    importLocalFilesForChatHistory,
    importLocalFilesForAgenticGraph,
    importLocalFolderForChatHistory,
    importLocalFolderForAgenticGraph,
    chatHistoryPathStatus,
    agenticGraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
  })

  const agenticGraphFiles = React.useMemo(
    () => [new File(['---\n$schema: "agentic-os-pipeline/v1"\n---\n\n# Imported agentic-graph\n'], AGENTIC_OS_IMPORTED_FILE_NAME, { type: 'text/markdown' })] as unknown as FileList,
    [],
  )
  const historyFiles = React.useMemo(
    () => [new File(['# Imported History\n'], HISTORY_IMPORTED_FILE_NAME, { type: 'text/markdown' })] as unknown as FileList,
    [],
  )
  const agenticGraphFolderFiles = React.useMemo(
    () => [new File(['---\n$schema: "agentic-os-pipeline/v1"\n---\n\n# Imported agentic-graph Folder\n'], AGENTIC_OS_FOLDER_FILE_NAME, { type: 'text/markdown' })] as unknown as FileList,
    [],
  )
  const historyFolderFiles = React.useMemo(
    () => [new File(['# Imported History Folder\n'], HISTORY_FOLDER_FILE_NAME, { type: 'text/markdown' })] as unknown as FileList,
    [],
  )

  return (
    <section>
      <section data-draft-agentic-graph-storage-mode={String(values.chatAgenticGraphStorageMode || '')} />
      <section data-draft-history-storage-mode={String(values.chatHistoryStorageMode || '')} />
      <section data-draft-agentic-graph-cloud-url={String(values.chatAgenticGraphCloudUrl || '')} />
      <section data-draft-history-cloud-url={String(values.chatHistoryCloudUrl || '')} />
      <section data-draft-agentic-graph-workspace-path={String(values.chatAgenticGraphWorkspacePath || '')} />
      <section data-draft-history-workspace-path={String(values.chatHistoryWorkspacePath || '')} />
      <section data-agentic-graph-status={String(agenticGraphPathStatus || '')} />
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <button
        type="button"
        onClick={() => importLocalFilesForAgenticGraph(agenticGraphFiles)}
      >
        Import agentic-graph Local File
      </button>
      <button
        type="button"
        onClick={() => importLocalFilesForChatHistory(historyFiles)}
      >
        Import History Local File
      </button>
      <button
        type="button"
        onClick={() => importLocalFolderForAgenticGraph(agenticGraphFolderFiles)}
      >
        Import agentic-graph Local Folder
      </button>
      <button
        type="button"
        onClick={() => importLocalFolderForChatHistory(historyFolderFiles)}
      >
        Import History Local Folder
      </button>
    </section>
  )
}

export async function testSettingsLocalImportActionsKeepDraftStateLocalUntilApplyCommitsFloatingChatSurface() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const importedSelections: Array<{ kind: 'files' | 'folder'; fileName: string }> = []
  const unregisterBridge = registerMarkdownWorkspaceActionBridge('test-local-import-bridge', {
    importLocalFiles: files => {
      const snapshot = files ? Array.from(files as ArrayLike<File>) : []
      const firstName = String(snapshot[0]?.name || '').trim()
      if (firstName) {
        importedSelections.push({ kind: 'files', fileName: firstName })
      }
      if (firstName === AGENTIC_OS_IMPORTED_FILE_NAME) {
        useMarkdownExplorerStore.getState().setActivePath(AGENTIC_OS_IMPORTED_PATH)
      } else if (firstName === HISTORY_IMPORTED_FILE_NAME) {
        useMarkdownExplorerStore.getState().setActivePath(HISTORY_IMPORTED_PATH)
      }
    },
    importLocalFolder: files => {
      const snapshot = files ? Array.from(files as ArrayLike<File>) : []
      const firstName = String(snapshot[0]?.name || '').trim()
      if (firstName) {
        importedSelections.push({ kind: 'folder', fileName: firstName })
      }
      if (firstName === AGENTIC_OS_FOLDER_FILE_NAME) {
        useMarkdownExplorerStore.getState().setActivePath(AGENTIC_OS_FOLDER_IMPORTED_PATH)
      } else if (firstName === HISTORY_FOLDER_FILE_NAME) {
        useMarkdownExplorerStore.getState().setActivePath(HISTORY_FOLDER_IMPORTED_PATH)
      }
    },
  })

  let cleanupAssertionError: Error | null = null
  try {
    resetBrowserLocalSurfaceSnapshotsForTests()
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const store = useGraphStore.getState()
    store.resetAll()
    store.setChatProvider(CHAT_PROVIDER_OPENAI)
    store.setChatEndpointUrl('https://api.openai.com/v1/chat/completions')
    store.setChatModel('gpt-4.1-mini')
    store.setChatContextScope('workspace')
    store.setChatStorageTarget('chatAgenticGraph')
    store.setChatAgenticGraphStorageMode('cloud')
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agentic-graph-before-local-import.md')
    store.setChatAgenticGraphWorkspacePath(null)
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-before-local-import.md')
    store.setChatHistoryWorkspacePath(null)

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsLocalImportHarness, { actionsRef }), {
      window: dom.window as unknown as Window,
      frames: 10,
    })
    await mountReactRoot(chatRoot, React.createElement(FloatingPanelChat), {
      window: dom.window as unknown as Window,
      frames: 8,
    })

    if (!actionsRef.current?.apply) {
      throw new Error('expected Settings owner to register an apply action')
    }

    const initialChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      initialChatInspection.available !== true ||
      initialChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      initialChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-local-import.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-local-import.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline storage state to reflect the committed cloud store values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import agentic-graph Local File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import History Local File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import agentic-graph Local Folder').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import History Local Folder').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const draftAgenticGraphStorageMode = settingsContainer.querySelector('[data-draft-agentic-graph-storage-mode]')?.getAttribute('data-draft-agentic-graph-storage-mode')
    const draftHistoryStorageMode = settingsContainer.querySelector('[data-draft-history-storage-mode]')?.getAttribute('data-draft-history-storage-mode')
    const draftAgenticGraphCloudUrl = settingsContainer.querySelector('[data-draft-agentic-graph-cloud-url]')?.getAttribute('data-draft-agentic-graph-cloud-url')
    const draftHistoryCloudUrl = settingsContainer.querySelector('[data-draft-history-cloud-url]')?.getAttribute('data-draft-history-cloud-url')
    const draftAgenticGraphWorkspacePath = settingsContainer.querySelector('[data-draft-agentic-graph-workspace-path]')?.getAttribute('data-draft-agentic-graph-workspace-path')
    const draftHistoryWorkspacePath = settingsContainer.querySelector('[data-draft-history-workspace-path]')?.getAttribute('data-draft-history-workspace-path')
    const agenticGraphStatus = settingsContainer.querySelector('[data-agentic-graph-status]')?.getAttribute('data-agentic-graph-status')
    const historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')

    if (
      draftAgenticGraphStorageMode !== 'local' ||
      draftHistoryStorageMode !== 'local' ||
      draftAgenticGraphCloudUrl !== '' ||
      draftHistoryCloudUrl !== '' ||
      draftAgenticGraphWorkspacePath !== AGENTIC_OS_FOLDER_IMPORTED_PATH ||
      draftHistoryWorkspacePath !== HISTORY_FOLDER_IMPORTED_PATH
    ) {
      throw new Error(`expected local import actions to patch draft local storage state, got ${JSON.stringify({
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphWorkspacePath,
        draftHistoryWorkspacePath,
      })}`)
    }
    if (agenticGraphStatus !== AGENTIC_OS_FOLDER_IMPORTED_PATH || historyStatus !== HISTORY_FOLDER_IMPORTED_PATH) {
      throw new Error(`expected local import actions to expose imported workspace path status, got ${JSON.stringify({ agenticGraphStatus, historyStatus })}`)
    }
    if (
      JSON.stringify(importedSelections) !== JSON.stringify([
        { kind: 'files', fileName: AGENTIC_OS_IMPORTED_FILE_NAME },
        { kind: 'files', fileName: HISTORY_IMPORTED_FILE_NAME },
        { kind: 'folder', fileName: AGENTIC_OS_FOLDER_FILE_NAME },
        { kind: 'folder', fileName: HISTORY_FOLDER_FILE_NAME },
      ])
    ) {
      throw new Error(`expected workspace import bridge to receive local files and folders, got ${JSON.stringify(importedSelections)}`)
    }

    const preApplyChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preApplyChatInspection.available !== true ||
      preApplyChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      preApplyChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      preApplyChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-local-import.md' ||
      preApplyChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-local-import.md'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline local-import state to remain on committed cloud values before Settings apply, got ${JSON.stringify(preApplyChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== null ||
      useGraphStore.getState().chatHistoryWorkspacePath !== null ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'cloud' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected canonical store local-import state to remain unchanged before Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
      })}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== AGENTIC_OS_FOLDER_IMPORTED_PATH ||
      appliedChatInspection.workspacePaths.chatHistoryWorkspacePath !== HISTORY_FOLDER_IMPORTED_PATH ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== null ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== null
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline local-import state to update after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== AGENTIC_OS_FOLDER_IMPORTED_PATH ||
      useGraphStore.getState().chatHistoryWorkspacePath !== HISTORY_FOLDER_IMPORTED_PATH ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'local' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'local' ||
      String(useGraphStore.getState().chatAgenticGraphCloudUrl || '').trim() !== '' ||
      String(useGraphStore.getState().chatHistoryCloudUrl || '').trim() !== ''
    ) {
      throw new Error(`expected canonical store local-import state to commit after Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
        chatAgenticGraphCloudUrl: useGraphStore.getState().chatAgenticGraphCloudUrl,
        chatHistoryCloudUrl: useGraphStore.getState().chatHistoryCloudUrl,
      })}`)
    }
  } finally {
    unregisterBridge()
    if (chatRoot) {
      await unmountReactRoot(chatRoot, { window: dom.window as unknown as Window })
    }
    const clearedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (clearedChatInspection.available !== false) {
      cleanupAssertionError = new Error(`expected FloatingPanel Chat pipeline snapshot cleanup after chat unmount, got ${JSON.stringify(clearedChatInspection)}`)
    }
    if (settingsRoot) {
      await unmountReactRoot(settingsRoot, { window: dom.window as unknown as Window })
    }
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(null)
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
