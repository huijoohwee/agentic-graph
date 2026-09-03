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

const NO_ACTIVE_MARKDOWN_STATUS = 'No active markdown file is selected in Workspace Editor.'
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

function SettingsActiveWorkspaceGuardDelayedOpenHarness(props: {
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
    chatHistoryPathStatus,
    agenticGraphPathStatus,
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
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <section data-agentic-graph-status={String(agenticGraphPathStatus || '')} />
      <button
        type="button"
        onClick={() => applyActiveWorkspaceFileAsChatHistory()}
      >
        Use Active Chat History File
      </button>
      <button
        type="button"
        onClick={() => applyActiveWorkspaceFileAsAgenticGraph()}
      >
        Use Active agentic-graph File
      </button>
    </section>
  )
}

export async function testSettingsActiveWorkspaceGuardPathsSkipDelayedOpenAndKeepCommittedSurfaceUnchanged() {
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
    store.setChatStorageTarget('chatHistory')
    store.setChatAgenticGraphWorkspacePath('/workspace/chat/agenticOs_20260523120000.md')
    store.setChatHistoryWorkspacePath('/workspace/chat/history_initial.md')
    useMarkdownExplorerStore.getState().setActivePath(null)

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsActiveWorkspaceGuardDelayedOpenHarness, { actionsRef, openCalls }), {
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

    const initialInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      initialInspection.available !== true ||
      initialInspection.chatStorageTarget !== 'chatHistory' ||
      initialInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      initialInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline guard delayed-open state to reflect seeded store values, got ${JSON.stringify(initialInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active Chat History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active agentic-graph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    let historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')
    let agenticGraphStatus = settingsContainer.querySelector('[data-agentic-graph-status]')?.getAttribute('data-agentic-graph-status')
    if (historyStatus !== NO_ACTIVE_MARKDOWN_STATUS || agenticGraphStatus !== NO_ACTIVE_MARKDOWN_STATUS) {
      throw new Error(`expected missing-markdown guard to surface shared status, got ${JSON.stringify({ historyStatus, agenticGraphStatus })}`)
    }
    if (openCalls.length !== 0) {
      throw new Error(`expected delayed open callback to remain skipped for missing-markdown guard, got ${JSON.stringify(openCalls)}`)
    }

    useMarkdownExplorerStore.getState().setActivePath('/workspace/assets/not-markdown.png')
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active Chat History File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Use Active agentic-graph File').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const draftStorageTarget = settingsContainer.querySelector('[data-draft-storage-target]')?.getAttribute('data-draft-storage-target')
    const draftChatHistoryPath = settingsContainer.querySelector('[data-draft-chat-history-path]')?.getAttribute('data-draft-chat-history-path')
    const draftChatAgenticGraphPath = settingsContainer.querySelector('[data-draft-chat-agentic-graph-path]')?.getAttribute('data-draft-chat-agentic-graph-path')
    historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')
    agenticGraphStatus = settingsContainer.querySelector('[data-agentic-graph-status]')?.getAttribute('data-agentic-graph-status')

    if (
      draftStorageTarget !== 'chatHistory' ||
      draftChatHistoryPath !== '/workspace/chat/history_initial.md' ||
      draftChatAgenticGraphPath !== '/workspace/chat/agenticOs_20260523120000.md'
    ) {
      throw new Error(`expected guard paths to leave draft settings unchanged, got ${JSON.stringify({
        draftStorageTarget,
        draftChatHistoryPath,
        draftChatAgenticGraphPath,
      })}`)
    }
    if (historyStatus !== NO_ACTIVE_MARKDOWN_STATUS || agenticGraphStatus !== NO_ACTIVE_MARKDOWN_STATUS) {
      throw new Error(`expected non-markdown guard to surface shared status, got ${JSON.stringify({ historyStatus, agenticGraphStatus })}`)
    }
    if (openCalls.length !== 0) {
      throw new Error(`expected delayed open callback to remain skipped for non-markdown guard, got ${JSON.stringify(openCalls)}`)
    }

    await act(async () => {
      await waitForMs(DELAYED_OPEN_DELAY_MS + 50)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    if (openCalls.length !== 0) {
      throw new Error(`expected delayed open callback to remain skipped even after the delayed-open window passes, got ${JSON.stringify(openCalls)}`)
    }

    const preApplyInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preApplyInspection.available !== true ||
      preApplyInspection.chatStorageTarget !== 'chatHistory' ||
      preApplyInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      preApplyInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged across guard delayed-open paths before apply, got ${JSON.stringify(preApplyInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 4)
    })

    const appliedInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedInspection.available !== true ||
      appliedInspection.chatStorageTarget !== 'chatHistory' ||
      appliedInspection.workspacePaths.chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      appliedInspection.workspacePaths.chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected committed FloatingPanel surface to remain unchanged after apply across guard delayed-open paths, got ${JSON.stringify(appliedInspection)}`)
    }
    if (
      useGraphStore.getState().chatStorageTarget !== 'chatHistory' ||
      useGraphStore.getState().chatAgenticGraphWorkspacePath !== '/workspace/chat/agenticOs_20260523120000.md' ||
      useGraphStore.getState().chatHistoryWorkspacePath !== '/workspace/chat/history_initial.md'
    ) {
      throw new Error(`expected canonical store to remain unchanged across guard delayed-open paths after apply, got ${JSON.stringify({
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
