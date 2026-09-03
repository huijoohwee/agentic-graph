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
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const AGENTIC_OS_IMPORTED_URL = 'https://cloud.example/agentic-graph-imported-async.md'
const HISTORY_IMPORTED_URL = 'https://cloud.example/history-imported-async.md'
const CLOUD_IMPORT_ASYNC_DELAY_MS = 200

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

function SettingsCloudImportAsyncBridgeHarness(props: {
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
    importCloudUrlForChatHistory,
    importCloudUrlForAgenticGraph,
    chatHistoryPathStatus,
    agenticGraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
  })

  return (
    <section>
      <section data-draft-agentic-graph-cloud-url={String(values.chatAgenticGraphCloudUrl || '')} />
      <section data-draft-history-cloud-url={String(values.chatHistoryCloudUrl || '')} />
      <section data-draft-agentic-graph-storage-mode={String(values.chatAgenticGraphStorageMode || '')} />
      <section data-draft-history-storage-mode={String(values.chatHistoryStorageMode || '')} />
      <section data-agentic-graph-status={String(agenticGraphPathStatus || '')} />
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <button
        type="button"
        onClick={() => patchChatValues({
          chatAgenticGraphCloudUrl: AGENTIC_OS_IMPORTED_URL,
          chatHistoryCloudUrl: HISTORY_IMPORTED_URL,
        })}
      >
        Set Async Cloud Draft URLs
      </button>
      <button
        type="button"
        onClick={() => importCloudUrlForAgenticGraph()}
      >
        Import Async agentic-graph Cloud URL
      </button>
      <button
        type="button"
        onClick={() => importCloudUrlForChatHistory()}
      >
        Import Async History Cloud URL
      </button>
    </section>
  )
}

export async function testSettingsCloudImportAsyncBridgeKeepsCommittedSurfaceTruthfulUntilApply() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const importedUrls: string[] = []
  const unregisterBridge = registerMarkdownWorkspaceActionBridge('test-cloud-import-async-bridge', {
    importUrl: url => {
      const next = String(url || '').trim()
      setTimeout(() => {
        importedUrls.push(next)
      }, CLOUD_IMPORT_ASYNC_DELAY_MS)
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
    store.setChatAgenticGraphCloudUrl('https://cloud.example/agentic-graph-initial-async.md')
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/history-initial-async.md')

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(settingsRoot, React.createElement(SettingsCloudImportAsyncBridgeHarness, { actionsRef }), {
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
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-initial-async.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-initial-async.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline async cloud URLs to reflect committed store values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Set Async Cloud Draft URLs').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import Async agentic-graph Cloud URL').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Import Async History Cloud URL').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const draftAgenticGraphCloudUrl = settingsContainer.querySelector('[data-draft-agentic-graph-cloud-url]')?.getAttribute('data-draft-agentic-graph-cloud-url')
    const draftHistoryCloudUrl = settingsContainer.querySelector('[data-draft-history-cloud-url]')?.getAttribute('data-draft-history-cloud-url')
    const draftAgenticGraphStorageMode = settingsContainer.querySelector('[data-draft-agentic-graph-storage-mode]')?.getAttribute('data-draft-agentic-graph-storage-mode')
    const draftHistoryStorageMode = settingsContainer.querySelector('[data-draft-history-storage-mode]')?.getAttribute('data-draft-history-storage-mode')
    const agenticGraphStatus = settingsContainer.querySelector('[data-agentic-graph-status]')?.getAttribute('data-agentic-graph-status')
    const historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')
    if (
      draftAgenticGraphCloudUrl !== AGENTIC_OS_IMPORTED_URL ||
      draftHistoryCloudUrl !== HISTORY_IMPORTED_URL ||
      draftAgenticGraphStorageMode !== 'cloud' ||
      draftHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected async cloud import actions to patch draft cloud values and storage modes immediately, got ${JSON.stringify({
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
      })}`)
    }
    if (
      agenticGraphStatus !== `Importing URL: ${AGENTIC_OS_IMPORTED_URL}` ||
      historyStatus !== `Importing URL: ${HISTORY_IMPORTED_URL}`
    ) {
      throw new Error(`expected async cloud import actions to expose importing status messages, got ${JSON.stringify({ agenticGraphStatus, historyStatus })}`)
    }
    if (importedUrls.length !== 0) {
      throw new Error(`expected async workspace bridge import to remain pending immediately after cloud import actions, got ${JSON.stringify(importedUrls)}`)
    }

    const preBridgeCompletionInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preBridgeCompletionInspection.available !== true ||
      preBridgeCompletionInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-initial-async.md' ||
      preBridgeCompletionInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-initial-async.md'
    ) {
      throw new Error(`expected committed FloatingPanel Chat pipeline cloud URLs to remain on initial values before async bridge completion, got ${JSON.stringify(preBridgeCompletionInspection)}`)
    }

    await act(async () => {
      await waitForMs(CLOUD_IMPORT_ASYNC_DELAY_MS + 50)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const settledImportedUrls = [...importedUrls]
    if (
      settledImportedUrls.length !== 2 ||
      settledImportedUrls[0] !== AGENTIC_OS_IMPORTED_URL ||
      settledImportedUrls[1] !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected async workspace import bridge to eventually receive both cloud import URLs, got ${JSON.stringify(settledImportedUrls)}`)
    }

    const postBridgeCompletionInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      postBridgeCompletionInspection.available !== true ||
      postBridgeCompletionInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/agentic-graph-initial-async.md' ||
      postBridgeCompletionInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/history-initial-async.md'
    ) {
      throw new Error(`expected committed FloatingPanel Chat pipeline cloud URLs to remain on initial values even after async bridge completion before apply, got ${JSON.stringify(postBridgeCompletionInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== AGENTIC_OS_IMPORTED_URL ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline async cloud URLs to update after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphCloudUrl !== AGENTIC_OS_IMPORTED_URL ||
      useGraphStore.getState().chatHistoryCloudUrl !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected canonical store async cloud URLs to commit after Settings apply, got ${JSON.stringify({
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
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
