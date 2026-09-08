import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingPanelChat from '@/features/chat/FloatingPanelChat'
import {
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { DEFAULT_PAYMENT_PROVIDER_ID } from '@/features/payments/providers'
import { useSettingsView } from '@/features/panels/views/useSettingsView'
import { useSettingsSync } from '@/features/panels/views/useSettingsSync'
import { useSettingsWorkspaceActions } from '@/features/panels/views/useSettingsWorkspaceActions'
import { CHAT_PROVIDER_OPENAI } from '@/lib/chatEndpoint'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { createAsyncActionTracker, installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const AGENTIC_OS_CREATED_PATH = '/workspace/chat/20260523T160000Z/agenticOs_20260523T160000Z.md'
const HISTORY_CREATED_PATH = '/workspace/chat/chh_20260523160000.md'
const PREVIOUS_ACTIVE_PATH = '/workspace/chat/already-open-before-create.md'

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

function SettingsCreateWorkspaceFileDelayedOpenHarness(props: {
  actionsRef: React.MutableRefObject<RegisteredSettingsActions | null>
  actionTracker: ReturnType<typeof createAsyncActionTracker>
  queueOpen: (path: string) => void
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
    createAndSelectChatHistoryFile,
    createAndSelectAgenticGraphFile,
    chatHistoryPathStatus,
    agenticGraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
    openWorkspaceFileImpl: props.queueOpen,
  })

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
        onClick={() => props.actionTracker.track(createAndSelectAgenticGraphFile())}
      >
        Create Delayed-Open agentic-graph File
      </button>
      <button
        type="button"
        onClick={() => props.actionTracker.track(createAndSelectChatHistoryFile())}
      >
        Create Delayed-Open History File
      </button>
    </section>
  )
}

export async function testSettingsCreateFilesDelayedOpenKeepsCommittedSurfaceTruthfulUntilApply() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const actionTracker = createAsyncActionTracker()
  const delayedOpens: string[] = []
  const releaseDelayedOpens = () => {
    for (const path of delayedOpens.splice(0)) useMarkdownExplorerStore.getState().setActivePath(path)
  }
  const originalDateNow = Date.now

  let cleanupAssertionError: Error | null = null
  let bodyError: unknown
  let bodyFailed = false
  try {
    resetBrowserLocalSurfaceSnapshotsForTests()
    resetWorkspaceFsForTests()
    Date.now = () => Date.UTC(2026, 4, 23, 16, 0, 0, 0)
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const store = useGraphStore.getState()
    store.resetAll()
    store.setChatProvider(CHAT_PROVIDER_OPENAI)
    store.setChatEndpointUrl('https://api.openai.com/v1/chat/completions')
    store.setChatModel('gpt-4.1-mini')
    store.setChatContextScope('workspace')
    store.setChatStorageTarget('chatAgenticGraph')
    store.setChatLocalStorageRootPath('/workspace/chat')
    store.setChatAgenticGraphStorageMode('cloud')
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agentic-graph-before-delayed-open-create.md')
    store.setChatAgenticGraphWorkspacePath(null)
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-before-delayed-open-create.md')
    store.setChatHistoryWorkspacePath(null)
    useMarkdownExplorerStore.getState().setActivePath(PREVIOUS_ACTIVE_PATH)

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsCreateWorkspaceFileDelayedOpenHarness, { actionsRef, actionTracker, queueOpen: path => { delayedOpens.push(path) } }), {
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
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-delayed-open-create.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-create.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline delayed-open create state to reflect committed cloud values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create Delayed-Open agentic-graph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await actionTracker.settle()
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create Delayed-Open History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await actionTracker.settle()
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
      draftAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      draftHistoryWorkspacePath !== HISTORY_CREATED_PATH
    ) {
      throw new Error(`expected delayed-open create-file actions to patch draft local storage state immediately, got ${JSON.stringify({
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphWorkspacePath,
        draftHistoryWorkspacePath,
      })}`)
    }
    if (agenticGraphStatus !== AGENTIC_OS_CREATED_PATH || historyStatus !== HISTORY_CREATED_PATH) {
      throw new Error(`expected delayed-open create-file actions to expose created workspace path status immediately, got ${JSON.stringify({ agenticGraphStatus, historyStatus })}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== PREVIOUS_ACTIVE_PATH) {
      throw new Error(`expected active workspace selection to remain on the previous path before delayed open completes, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    const fs = await getWorkspaceFs()
    const agenticGraphText = await fs.readFileText(AGENTIC_OS_CREATED_PATH)
    const historyText = await fs.readFileText(HISTORY_CREATED_PATH)
    if (agenticGraphText !== '' || historyText !== '') {
      throw new Error(`expected delayed-open create-file actions to materialize empty workspace files immediately, got ${JSON.stringify({ agenticGraphText, historyText })}`)
    }

    const preDelayChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preDelayChatInspection.available !== true ||
      preDelayChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      preDelayChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      preDelayChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-delayed-open-create.md' ||
      preDelayChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-create.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged before delayed open completes, got ${JSON.stringify(preDelayChatInspection)}`)
    }

    await act(async () => {
      releaseDelayedOpens()
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    if (useMarkdownExplorerStore.getState().activePath !== HISTORY_CREATED_PATH) {
      throw new Error(`expected delayed open to eventually update the active workspace selection to the latest created path, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    const postDelayChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      postDelayChatInspection.available !== true ||
      postDelayChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      postDelayChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      postDelayChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-before-delayed-open-create.md' ||
      postDelayChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-create.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged even after delayed open completes before apply, got ${JSON.stringify(postDelayChatInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      appliedChatInspection.workspacePaths.chatHistoryWorkspacePath !== HISTORY_CREATED_PATH ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== null ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== null
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline delayed-open create state to update after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== AGENTIC_OS_CREATED_PATH ||
      useGraphStore.getState().chatHistoryWorkspacePath !== HISTORY_CREATED_PATH ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'local' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'local'
    ) {
      throw new Error(`expected canonical store delayed-open create state to commit after Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
      })}`)
    }
  } catch (error) {
    bodyError = error
    bodyFailed = true
  } finally {
    try {
      await act(async () => {
        try { await actionTracker.settle() } finally { releaseDelayedOpens() }
      })
    } catch (error) {
      cleanupAssertionError = error instanceof Error ? error : new Error(String(error))
    }
    Date.now = originalDateNow
    if (chatRoot) {
      await unmountReactRoot(chatRoot, { window: dom.window as unknown as Window })
    }
    const clearedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (clearedChatInspection.available !== false) {
      const snapshotError = new Error(`expected FloatingPanel Chat pipeline snapshot cleanup after chat unmount, got ${JSON.stringify(clearedChatInspection)}`)
      cleanupAssertionError = cleanupAssertionError
        ? new AggregateError([cleanupAssertionError, snapshotError], 'Settings fixture cleanup failed')
        : snapshotError
    }
    if (settingsRoot) {
      await unmountReactRoot(settingsRoot, { window: dom.window as unknown as Window })
    }
    resetBrowserLocalSurfaceSnapshotsForTests()
    resetWorkspaceFsForTests()
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(null)
    restoreDom()
    restoreWindow()
  }
  if (bodyFailed) {
    if (cleanupAssertionError) throw new AggregateError([bodyError, cleanupAssertionError], 'Settings fixture body and cleanup failed')
    throw bodyError
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
