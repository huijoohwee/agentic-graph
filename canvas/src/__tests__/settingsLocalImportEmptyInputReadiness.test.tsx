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

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

function SettingsLocalImportEmptyInputHarness(props: {
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
    chatHistoryPathStatus,
    agenticgraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
  })

  const emptyFileList = React.useMemo(() => [] as unknown as FileList, [])

  return (
    <section>
      <section data-draft-agenticgraph-storage-mode={String(values.chatAgenticGraphStorageMode || '')} />
      <section data-draft-history-storage-mode={String(values.chatHistoryStorageMode || '')} />
      <section data-draft-agenticgraph-cloud-url={String(values.chatAgenticGraphCloudUrl || '')} />
      <section data-draft-history-cloud-url={String(values.chatHistoryCloudUrl || '')} />
      <section data-draft-agenticgraph-workspace-path={String(values.chatAgenticGraphWorkspacePath || '')} />
      <section data-draft-history-workspace-path={String(values.chatHistoryWorkspacePath || '')} />
      <section data-agenticgraph-status={String(agenticgraphPathStatus || '')} />
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <button
        type="button"
        onClick={() => importLocalFilesForAgenticGraph(null)}
      >
        Import AgenticGraph Empty Local Input
      </button>
      <button
        type="button"
        onClick={() => importLocalFilesForChatHistory(emptyFileList)}
      >
        Import History Empty Local Input
      </button>
    </section>
  )
}

export async function testSettingsLocalImportEmptyInputKeepsCommittedFloatingChatSurfaceUnchanged() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const bridgeCalls: number[] = []
  const unregisterBridge = registerMarkdownWorkspaceActionBridge('test-empty-local-import-bridge', {
    importLocalFiles: () => {
      bridgeCalls.push(Date.now())
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
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agenticgraph-before-empty-local-import.md')
    store.setChatAgenticGraphWorkspacePath(null)
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-before-empty-local-import.md')
    store.setChatHistoryWorkspacePath(null)
    useMarkdownExplorerStore.getState().setActivePath('/workspace/chat/already-open.md')

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsLocalImportEmptyInputHarness, { actionsRef }), {
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
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-empty-local-import.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-empty-local-import.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline local-import empty-input state to reflect committed cloud values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import AgenticGraph Empty Local Input').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import History Empty Local Input').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const draftAgenticGraphStorageMode = settingsContainer.querySelector('[data-draft-agenticgraph-storage-mode]')?.getAttribute('data-draft-agenticgraph-storage-mode')
    const draftHistoryStorageMode = settingsContainer.querySelector('[data-draft-history-storage-mode]')?.getAttribute('data-draft-history-storage-mode')
    const draftAgenticGraphCloudUrl = settingsContainer.querySelector('[data-draft-agenticgraph-cloud-url]')?.getAttribute('data-draft-agenticgraph-cloud-url')
    const draftHistoryCloudUrl = settingsContainer.querySelector('[data-draft-history-cloud-url]')?.getAttribute('data-draft-history-cloud-url')
    const draftAgenticGraphWorkspacePath = settingsContainer.querySelector('[data-draft-agenticgraph-workspace-path]')?.getAttribute('data-draft-agenticgraph-workspace-path')
    const draftHistoryWorkspacePath = settingsContainer.querySelector('[data-draft-history-workspace-path]')?.getAttribute('data-draft-history-workspace-path')
    const agenticgraphStatus = settingsContainer.querySelector('[data-agenticgraph-status]')?.getAttribute('data-agenticgraph-status')
    const historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')

    if (
      draftAgenticGraphStorageMode !== 'cloud' ||
      draftHistoryStorageMode !== 'cloud' ||
      draftAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-empty-local-import.md' ||
      draftHistoryCloudUrl !== 'https://cloud.example/history-before-empty-local-import.md' ||
      draftAgenticGraphWorkspacePath !== '' ||
      draftHistoryWorkspacePath !== ''
    ) {
      throw new Error(`expected empty local-import guard to leave draft state unchanged, got ${JSON.stringify({
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphWorkspacePath,
        draftHistoryWorkspacePath,
      })}`)
    }
    if (agenticgraphStatus !== '' || historyStatus !== '') {
      throw new Error(`expected empty local-import guard to leave status unchanged, got ${JSON.stringify({ agenticgraphStatus, historyStatus })}`)
    }
    if (bridgeCalls.length !== 0) {
      throw new Error(`expected empty local-import guard to skip workspace bridge import, got ${bridgeCalls.length} calls`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== '/workspace/chat/already-open.md') {
      throw new Error(`expected empty local-import guard to leave active workspace selection unchanged, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    const preApplyChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preApplyChatInspection.available !== true ||
      preApplyChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      preApplyChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      preApplyChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-empty-local-import.md' ||
      preApplyChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-empty-local-import.md'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline empty local-import state to remain on committed cloud values before Settings apply, got ${JSON.stringify(preApplyChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== null ||
      useGraphStore.getState().chatHistoryWorkspacePath !== null ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'cloud' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected canonical store empty local-import state to remain unchanged before Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
      })}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 4)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      appliedChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-empty-local-import.md' ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-empty-local-import.md'
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline empty local-import state to remain unchanged after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== null ||
      useGraphStore.getState().chatHistoryWorkspacePath !== null ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'cloud' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected canonical store empty local-import state to remain unchanged after Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
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
