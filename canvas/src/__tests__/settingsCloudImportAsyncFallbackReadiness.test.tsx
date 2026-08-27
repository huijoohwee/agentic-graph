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
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

type RegisteredSettingsActions = {
  apply: () => void
  reset: () => void
}

const AGENTICGRAPH_IMPORTED_URL = 'https://cloud.example/no-bridge-agenticgraph-async.md'
const HISTORY_IMPORTED_URL = 'https://cloud.example/no-bridge-history-async.md'
const CLOUD_FALLBACK_ASYNC_DELAY_MS = 200

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

function SettingsCloudImportAsyncFallbackHarness(props: {
  actionsRef: React.MutableRefObject<RegisteredSettingsActions | null>
  fallbackCalls: Array<{ urlRaw: string }>
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
    agenticgraphPathStatus,
  } = useSettingsWorkspaceActions({
    patchChatValues,
    chatLocalStorageRootPath: values.chatLocalStorageRootPath,
    chatHistoryCloudUrl: values.chatHistoryCloudUrl,
    chatAgenticGraphCloudUrl: values.chatAgenticGraphCloudUrl,
    importUrlFallbackImpl: async args => {
      await waitForMs(CLOUD_FALLBACK_ASYNC_DELAY_MS)
      props.fallbackCalls.push({ urlRaw: String(args.urlRaw || '').trim() })
      args.pushUiToast({
        id: `launch:import:url:${String(args.urlRaw || '').trim()}`,
        kind: 'neutral',
        message: `Async fallback import invoked: ${String(args.urlRaw || '').trim()}`,
        ttlMs: null,
        dismissible: false,
      })
    },
  })

  return (
    <section>
      <section data-draft-agenticgraph-cloud-url={String(values.chatAgenticGraphCloudUrl || '')} />
      <section data-draft-history-cloud-url={String(values.chatHistoryCloudUrl || '')} />
      <section data-draft-agenticgraph-storage-mode={String(values.chatAgenticGraphStorageMode || '')} />
      <section data-draft-history-storage-mode={String(values.chatHistoryStorageMode || '')} />
      <section data-agenticgraph-status={String(agenticgraphPathStatus || '')} />
      <section data-history-status={String(chatHistoryPathStatus || '')} />
      <button
        type="button"
        onClick={() => patchChatValues({
          chatAgenticGraphCloudUrl: AGENTICGRAPH_IMPORTED_URL,
          chatHistoryCloudUrl: HISTORY_IMPORTED_URL,
        })}
      >
        Set Async Fallback Draft URLs
      </button>
      <button
        type="button"
        onClick={() => importCloudUrlForAgenticGraph()}
      >
        Async Fallback Import AgenticGraph Cloud URL
      </button>
      <button
        type="button"
        onClick={() => importCloudUrlForChatHistory()}
      >
        Async Fallback Import History Cloud URL
      </button>
    </section>
  )
}

export async function testSettingsCloudImportAsyncFallbackKeepsCommittedSurfaceTruthfulUntilApply() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let settingsRoot: ReturnType<typeof createRoot> | null = null
  let chatRoot: ReturnType<typeof createRoot> | null = null
  const actionsRef: { current: RegisteredSettingsActions | null } = { current: null }
  const fallbackCalls: Array<{ urlRaw: string }> = []

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
    store.setChatAgenticGraphCloudUrl('https://cloud.example/fallback-initial-agenticgraph-async.md')
    store.setChatHistoryStorageMode('cloud')
    store.setChatHistoryCloudUrl('https://cloud.example/fallback-initial-history-async.md')

    const doc = dom.window.document
    const settingsContainer = doc.createElement('section')
    const chatContainer = doc.createElement('section')
    doc.body.appendChild(settingsContainer)
    doc.body.appendChild(chatContainer)
    settingsRoot = createRoot(settingsContainer as unknown as HTMLElement)
    chatRoot = createRoot(chatContainer as unknown as HTMLElement)

    await mountReactRoot(
      settingsRoot,
      React.createElement(SettingsCloudImportAsyncFallbackHarness, { actionsRef, fallbackCalls }),
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
      initialChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/fallback-initial-agenticgraph-async.md' ||
      initialChatInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/fallback-initial-history-async.md'
    ) {
      throw new Error(`expected initial FloatingPanel Chat pipeline async fallback cloud URLs to reflect committed store values, got ${JSON.stringify(initialChatInspection)}`)
    }

    await act(async () => {
      findButtonByLabel(settingsContainer, 'Set Async Fallback Draft URLs').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Async Fallback Import AgenticGraph Cloud URL').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })
    await act(async () => {
      findButtonByLabel(settingsContainer, 'Async Fallback Import History Cloud URL').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const draftAgenticGraphCloudUrl = settingsContainer.querySelector('[data-draft-agenticgraph-cloud-url]')?.getAttribute('data-draft-agenticgraph-cloud-url')
    const draftHistoryCloudUrl = settingsContainer.querySelector('[data-draft-history-cloud-url]')?.getAttribute('data-draft-history-cloud-url')
    const draftAgenticGraphStorageMode = settingsContainer.querySelector('[data-draft-agenticgraph-storage-mode]')?.getAttribute('data-draft-agenticgraph-storage-mode')
    const draftHistoryStorageMode = settingsContainer.querySelector('[data-draft-history-storage-mode]')?.getAttribute('data-draft-history-storage-mode')
    const agenticgraphStatus = settingsContainer.querySelector('[data-agenticgraph-status]')?.getAttribute('data-agenticgraph-status')
    const historyStatus = settingsContainer.querySelector('[data-history-status]')?.getAttribute('data-history-status')
    if (
      draftAgenticGraphCloudUrl !== AGENTICGRAPH_IMPORTED_URL ||
      draftHistoryCloudUrl !== HISTORY_IMPORTED_URL ||
      draftAgenticGraphStorageMode !== 'cloud' ||
      draftHistoryStorageMode !== 'cloud'
    ) {
      throw new Error(`expected async fallback cloud import path to keep draft URLs and storage modes updated immediately, got ${JSON.stringify({
        draftAgenticGraphCloudUrl,
        draftHistoryCloudUrl,
        draftAgenticGraphStorageMode,
        draftHistoryStorageMode,
      })}`)
    }
    if (
      agenticgraphStatus !== `Importing URL: ${AGENTICGRAPH_IMPORTED_URL}` ||
      historyStatus !== `Importing URL: ${HISTORY_IMPORTED_URL}`
    ) {
      throw new Error(`expected async fallback cloud import path to expose importing status messages, got ${JSON.stringify({ agenticgraphStatus, historyStatus })}`)
    }
    if (fallbackCalls.length !== 0 || useGraphStore.getState().uiToasts.length !== 0) {
      throw new Error(`expected async fallback side effects to remain pending immediately after cloud import actions, got ${JSON.stringify({
        fallbackCalls,
        uiToasts: useGraphStore.getState().uiToasts,
      })}`)
    }

    const preFallbackCompletionInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      preFallbackCompletionInspection.available !== true ||
      preFallbackCompletionInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/fallback-initial-agenticgraph-async.md' ||
      preFallbackCompletionInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/fallback-initial-history-async.md'
    ) {
      throw new Error(`expected committed FloatingPanel Chat pipeline cloud URLs to remain on initial values before async fallback completion, got ${JSON.stringify(preFallbackCompletionInspection)}`)
    }

    await act(async () => {
      await waitForMs(CLOUD_FALLBACK_ASYNC_DELAY_MS + 50)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const settledFallbackCalls = [...fallbackCalls]
    if (
      settledFallbackCalls.length !== 2 ||
      settledFallbackCalls[0]?.urlRaw !== AGENTICGRAPH_IMPORTED_URL ||
      settledFallbackCalls[1]?.urlRaw !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected async fallback import path to eventually invoke fallback for both URLs, got ${JSON.stringify(settledFallbackCalls)}`)
    }
    const agenticgraphToast = useGraphStore.getState().uiToasts.find(toast => toast.id === `launch:import:url:${AGENTICGRAPH_IMPORTED_URL}`)
    const historyToast = useGraphStore.getState().uiToasts.find(toast => toast.id === `launch:import:url:${HISTORY_IMPORTED_URL}`)
    if (!agenticgraphToast || !historyToast) {
      throw new Error(`expected async fallback import path to eventually surface both launch toasts, got ${JSON.stringify(useGraphStore.getState().uiToasts)}`)
    }

    const postFallbackCompletionInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      postFallbackCompletionInspection.available !== true ||
      postFallbackCompletionInspection.cloudUrls.chatAgenticGraphCloudUrl !== 'https://cloud.example/fallback-initial-agenticgraph-async.md' ||
      postFallbackCompletionInspection.cloudUrls.chatHistoryCloudUrl !== 'https://cloud.example/fallback-initial-history-async.md'
    ) {
      throw new Error(`expected committed FloatingPanel Chat pipeline cloud URLs to remain on initial values even after async fallback completion before apply, got ${JSON.stringify(postFallbackCompletionInspection)}`)
    }

    await act(async () => {
      actionsRef.current?.apply()
      await waitForFrames(dom.window as unknown as Window, 6)
    })

    const appliedChatInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (
      appliedChatInspection.available !== true ||
      appliedChatInspection.cloudUrls.chatAgenticGraphCloudUrl !== AGENTICGRAPH_IMPORTED_URL ||
      appliedChatInspection.cloudUrls.chatHistoryCloudUrl !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected FloatingPanel Chat pipeline async fallback cloud URLs to update after Settings apply, got ${JSON.stringify(appliedChatInspection)}`)
    }
    if (
      useGraphStore.getState().chatAgenticGraphCloudUrl !== AGENTICGRAPH_IMPORTED_URL ||
      useGraphStore.getState().chatHistoryCloudUrl !== HISTORY_IMPORTED_URL
    ) {
      throw new Error(`expected canonical store async fallback cloud URLs to commit after Settings apply, got ${JSON.stringify({
        chatAgenticGraphCloudUrl: useGraphStore.getState().chatAgenticGraphCloudUrl,
        chatHistoryCloudUrl: useGraphStore.getState().chatHistoryCloudUrl,
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
    restoreDom()
    restoreWindow()
  }
  if (cleanupAssertionError) throw cleanupAssertionError
}
