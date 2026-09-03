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

const NEXT_AGENTIC_OS_PATH = '/workspace/chat/agenticOs_20260523163000.md'
const NEXT_HISTORY_PATH = '/workspace/chat/history_delayed_open_apply.md'
const DELAYED_OPEN_DELAY_MS = 200

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

function SettingsActiveWorkspaceDelayedOpenHarness(props: {
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
    applyActiveWorkspaceFileAsChatHistory,
    applyActiveWorkspaceFileAsAgenticGraph,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
    openWorkspaceFileImpl: path => {
      setTimeout(() => {
        props.openCalls.push(path)
      }, DELAYED_OPEN_DELAY_MS)
    },
  })

  return (
    <section>
      <section data-draft-storage-target={String(values.chatStorageTarget || '')} />
      <section data-draft-chat-history-path={String(values.chatHistoryWorkspacePath || '')} />
      <section data-draft-chat-agentic-graph-path={String(values.chatAgenticGraphWorkspacePath || '')} />
      <button
        type="button"
        onClick={() => patchChatValues({ chatStorageTarget: 'chatAgenticGraph' })}
      >
        Use agentic-graph
      </button>
      <button
        type="button"
        onClick={() => patchChatValues({ chatStorageTarget: 'chatHistory' })}
      >
        Use Chat History
      </button>
      <button
        type="button"
        onClick={() => applyActiveWorkspaceFileAsAgenticGraph()}
      >
        Use Active agentic-graph File
      </button>
      <button
        type="button"
        onClick={() => applyActiveWorkspaceFileAsChatHistory()}
      >
        Use Active Chat History File
      </button>
    </section>
  )
}

export async function testSettingsApplyActiveWorkspaceDelayedOpenKeepsCommittedSurfaceTruthfulUntilApply() {
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
    store.setChatAgenticGraphWorkspacePath('/workspace/chat/agenticOs_20260523120000.md')
    store.setChatHistoryWorkspacePath('/workspace/chat/history_initial.md')
    useMarkdownExplorerStore.getState().setActivePath('/workspace/chat/start.md')

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsActiveWorkspaceDelayedOpenHarness, { actionsRef, openCalls }), {
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
      initialChatInspection.chatStorageTarget !== 'chatAgenticGraph' ||
      initialChatInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      initialChatInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline active-workspace delayed-open state to reflect seeded store values, got ${JSON.stringify(initialChatInspection)}`)
    }

    useMarkdownExplorerStore.getState().setActivePath(NEXT_AGENTIC_OS_PATH)
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use agentic-graph').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active agentic-graph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 4)
    })

    useMarkdownExplorerStore.getState().setActivePath(NEXT_HISTORY_PATH)
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Chat History').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active Chat History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 4)
    })

    const draftStorageTarget = settingsContainer.querySelector('[data-draft-storage-target]')?.getAttribute('data-draft-storage-target')
    const draftChatAgenticGraphPath = settingsContainer.querySelector('[data-draft-chat-agentic-graph-path]')?.getAttribute('data-draft-chat-agentic-graph-path')
    const draftChatHistoryPath = settingsContainer.querySelector('[data-draft-chat-history-path]')?.getAttribute('data-draft-chat-history-path')
    if (
      draftStorageTarget !== 'chatHistory' ||
      draftChatAgenticGraphPath !== NEXT_AGENTIC_OS_PATH ||
      draftChatHistoryPath !== NEXT_HISTORY_PATH
    ) {
      throw new Error(`expected delayed-open active workspace actions to patch draft values immediately, got ${JSON.stringify({
        draftStorageTarget,
        draftChatAgenticGraphPath,
        draftChatHistoryPath,
      })}`)
    }
    if (openCalls.length !== 0) {
      throw new Error(`expected delayed-open callback to remain pending immediately after active workspace actions, got ${JSON.stringify(openCalls)}`)
    }
    if (useMarkdownExplorerStore.getState().activePath !== NEXT_HISTORY_PATH) {
      throw new Error(`expected active workspace selection to remain on the explicit current active file before delayed open callbacks resolve, got ${String(useMarkdownExplorerStore.getState().activePath || '')}`)
    }

    const preDelayInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preDelayInspection.available !== true ||
      preDelayInspection.chatStorageTarget !== 'chatAgenticGraph' ||
      preDelayInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      preDelayInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged before delayed open callbacks resolve, got ${JSON.stringify(preDelayInspection)}`)
    }

    await act(async () => {
      await waitForMs(DELAYED_OPEN_DELAY_MS + 50)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const settledOpenCalls = [...openCalls]
    if (
      settledOpenCalls.length !== 2 ||
      settledOpenCalls[0] !== NEXT_AGENTIC_OS_PATH ||
      settledOpenCalls[1] !== NEXT_HISTORY_PATH
    ) {
      throw new Error(`expected delayed-open callback to eventually run for both active workspace paths, got ${JSON.stringify(settledOpenCalls)}`)
    }

    const postDelayInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      postDelayInspection.available !== true ||
      postDelayInspection.chatStorageTarget !== 'chatAgenticGraph' ||
      postDelayInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      postDelayInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged even after delayed open callbacks resolve before apply, got ${JSON.stringify(postDelayInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedInspection.available !== true ||
      appliedInspection.chatStorageTarget !== 'chatHistory' ||
      appliedInspection.workspacePaths.chatAgenticGraphWorkspacePath !== NEXT_AGENTIC_OS_PATH ||
      appliedInspection.workspacePaths.chatHistoryWorkspacePath !== NEXT_HISTORY_PATH
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline active-workspace delayed-open state to update after apply, got ${JSON.stringify(appliedInspection)}`)
    }
    if (
      useGraphStore.getState().chatStorageTarget !== 'chatHistory' ||
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== NEXT_AGENTIC_OS_PATH ||
      useGraphStore.getState().chatHistoryWorkspacePath !== NEXT_HISTORY_PATH
    ) {
      throw new Error(`expected canonical store active-workspace delayed-open state to commit after apply, got ${JSON.stringify({
        chatStorageTarget: useGraphStore.getState().chatStorageTarget,
        chatAgenticGraphWorkspacePath: useGraphStore.getState().chatAgenticGraphWorkspacePath,
        chatHistoryWorkspacePath: useGraphStore.getState().chatHistoryWorkspacePath,
      })}`)
    }
  } finally {
    if (chatRoot) {
      await unmountReactRoot(chatRoot, { window: dom.window as unknown as Window })
    }
    const clearedInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (clearedInspection.available !== false) {
      cleanupAssertionError = new Error(`expected FloatingPanel Chat pipeline snapshot cleanup after chat unmount, got ${JSON.stringify(clearedInspection)}`)
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
