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
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const CREATE_FAILURE_MESSAGE = 'Injected delayed-open create failure for Settings readiness regression'
const DELAYED_OPEN_DELAY_MS = 200
const PREVIOUS_ACTIVE_PATH = '/workspace/chat/existing-before-delayed-open-failure.md'

const findButtonByLabel = (container: HTMLElement, label: string): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
  const match = buttons.find(button => String(button.textContent || '').includes(label))
  if (!match) throw new Error(`expected button with label ${JSON.stringify(label)}`)
  return match
}

const waitForMs = async (ms: number) =>
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })

function SettingsCreateWorkspaceFileFailureDelayedOpenHarness(props: {
  actionsRef: React.MutableRefObject<RegisteredSettingsActions | null>
  openCalls: string[]
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
    agenticgraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
    createWorkspaceFilePathImpl: async () => {
      throw new Error(CREATE_FAILURE_MESSAGE)
    },
    openWorkspaceFileImpl: path => {
      props.openCalls.push(path)
      setTimeout(() => {
        useMarkdownExplorerStore.getState().setActivePath(path)
      }, DELAYED_OPEN_DELAY_MS)
    },
  })

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
        onClick={() => void createAndSelectAgenticGraphFile()}
      >
        Create Delayed-Open Failure AgenticGraph File
      </button>
      <button
        type="button"
        onClick={() => void createAndSelectChatHistoryFile()}
      >
        Create Delayed-Open Failure History File
      </button>
    </section>
  )
}

export async function testSettingsCreateFileFailureSkipsDelayedOpenAndKeepsCommittedSurfaceTruthful() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const openCalls: string[] = []

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
    store.setChatLocalStorageRootPath('/workspace/chat')
    store.setChatAgenticGraphStorageMode('cloud')
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agenticgraph-before-delayed-open-failure.md')
    store.setChatAgenticGraphWorkspacePath(null)
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-before-delayed-open-failure.md')
    store.setChatHistoryWorkspacePath(null)
    useMarkdownExplorerStore.getState().setActivePath(PREVIOUS_ACTIVE_PATH)

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(
      settingsRoot,
      React.createElement(SettingsCreateWorkspaceFileFailureDelayedOpenHarness, { actionsRef, openCalls }),
      { window: dom.window as unknown as Window, frames: 10 },
    )
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
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-delayed-open-failure.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-failure.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline delayed-open failure state to reflect committed cloud values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create Delayed-Open Failure AgenticGraph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Create Delayed-Open Failure History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
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
      draftAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-delayed-open-failure.md' ||
      draftHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-failure.md' ||
      draftAgenticGraphWorkspacePath !== '' ||
      draftHistoryWorkspacePath !== ''
    ) {
      throw new Error(`expected delayed-open create failure to leave draft storage state unchanged, got ${JSON.stringify({
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphWorkspacePath,
        draftHistoryWorkspacePath,
      })}`)
    }
    if (agenticgraphStatus !== CREATE_FAILURE_MESSAGE || historyStatus !== CREATE_FAILURE_MESSAGE) {
      throw new Error(`expected delayed-open create failure to expose the injected error status, got ${JSON.stringify({ agenticgraphStatus, historyStatus })}`)
    }
    if (openCalls.length !== 0) {
      throw new Error(`expected delayed-open callback to be skipped when create path fails, got ${JSON.stringify(openCalls)}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== PREVIOUS_ACTIVE_PATH) {
      throw new Error(`expected create failure to leave active workspace selection unchanged before delayed open window passes, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    await act(async () => {
      await waitForMs(DELAYED_OPEN_DELAY_MS + 50)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    if (openCalls.length !== 0 || useMarkdownExplorerStore.getState().activePath !== PREVIOUS_ACTIVE_PATH) {
      throw new Error(`expected delayed-open callback to remain skipped even after the open window passes, got ${JSON.stringify({
        openCalls,
        activePath: useMarkdownExplorerStore.getState().activePath,
      })}`)
    }

    const preApplyChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preApplyChatInspection.available !== true ||
      preApplyChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== null ||
      preApplyChatInspection.workspacePaths.chatHistoryWorkspacePath !== null ||
      preApplyChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-delayed-open-failure.md' ||
      preApplyChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-failure.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged before Settings apply on delayed-open failure, got ${JSON.stringify(preApplyChatInspection)}`)
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
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agenticgraph-before-delayed-open-failure.md' ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-before-delayed-open-failure.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged after Settings apply on delayed-open failure, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== null ||
      useGraphStore.getState().chatHistoryWorkspacePath !== null ||
      useGraphStore.getState().chatAgenticGraphStorageMode !== 'cloud' ||
      useGraphStore.getState().chatHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected canonical store delayed-open failure state to remain unchanged after Settings apply, got ${JSON.stringify({
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
        chatAgenticGraphStorageMode: useGraphStore.getState().chatAgenticGraphStorageMode,
        chatHistoryStorageMode: useGraphStore.getState().chatHistoryStorageMode,
      })}`)
    }
  } finally {
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
