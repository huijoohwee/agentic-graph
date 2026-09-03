import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { waitForFrames } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FloatingPanelChatFooter } from '@/features/chat/FloatingPanelChatSections'
import { applyFloatingPanelChatInputAppend, resolveFloatingPanelChatInputAppend } from '@/features/chat/floatingPanelChat/floatingPanelChatInputAppend'
import ToastHost from '@/components/ui/ToastHost'
import HistoryView from '@/features/panels/views/HistoryView'
import { CHAT_INPUT_APPEND_EVENT, FLOATING_PANEL_OPEN_EVENT } from '@/features/canvas/utils'
import { buildChatPromotionRetryInsertAction } from '@/features/chat/floatingPanelChat/floatingPanelChatPromotionRetryUiAction'
import { buildAgenticGraphStorageConflictReviewLogActionId } from '@/lib/storage/agentic-graph-storage-conflict-actions'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testToastHostRendersSharedActionsAndDispatchesUiRuntime() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    store.resetAll()
    store.setBottomSurfaceCollapsed(true)
    store.setBottomSurfaceTab('stats')
    store.pushUiToast({
      id: 'toast:action',
      kind: 'warning',
      message: 'Storage conflict requires review.',
      ttlMs: null,
      log: false,
      actions: [
        {
          id: buildAgenticGraphStorageConflictReviewLogActionId('kgws:toast'),
          label: 'Review Log',
          tone: 'neutral',
        },
      ],
    })

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)

    await act(async () => {
      root!.render(<ToastHost />)
    })
    await tick()

    const reviewButton = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      button => button.textContent?.trim() === 'Review Log',
    )
    if (!reviewButton) throw new Error('expected toast host to render shared action button')

    await act(async () => {
      reviewButton.click()
      await tick()
    })

    const nextState = useGraphStore.getState()
    if (nextState.bottomSurfaceCollapsed !== false) {
      throw new Error('expected toast action to open the bottom surface through the shared ui runtime')
    }
    if (nextState.bottomSurfaceTab !== 'history') {
      throw new Error('expected toast action to route to History via the shared ui runtime')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    restore()
    restoreWindow()
  }
}

export async function testToastHostMessageIsSelectableAndCopiesSanitizedText() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  const rawMessage = 'Repository parsing finished.\nat internal stack frame\nThe local graph is ready to query.'
  const renderedMessage = 'Repository parsing finished.\nThe local graph is ready to query.'
  const copiedMessages: string[] = []
  const originalClipboard = Object.getOwnPropertyDescriptor(dom.window.navigator, 'clipboard')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedMessages.push(value)
        },
      },
    })
    store.resetAll()
    store.pushUiToast({
      id: 'toast:copy',
      kind: 'neutral',
      message: rawMessage,
      ttlMs: null,
      dismissible: true,
      log: false,
    })

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)
    await act(async () => {
      root!.render(<ToastHost />)
    })
    await tick()

    const card = dom.window.document.querySelector('article[data-kg-toast-id="toast:copy"]')
    if (!card) throw new Error('expected toast to use a semantic article card')
    if (card.getAttribute('role') !== 'status' || card.getAttribute('data-kg-selection-surface') !== 'toast') {
      throw new Error('expected toast article to expose a named, selection-visible notification surface')
    }
    if (!card.classList.contains('pointer-events-auto')) {
      throw new Error('expected toast article to be hit-testable for notification interaction')
    }

    const message = card.querySelector('p[data-kg-toast-message="toast:copy"]')
    if (!message) throw new Error('expected toast to expose its message in a semantic paragraph')
    if (message.textContent !== renderedMessage) {
      throw new Error(`expected toast message to expose sanitized text, got ${JSON.stringify(message.textContent)}`)
    }
    if (!message.classList.contains('pointer-events-auto') || !message.classList.contains('select-text')) {
      throw new Error('expected toast message to remain selectable and hit-testable')
    }
    if (message.getAttribute('data-kg-selection-surface') !== 'toast-message') {
      throw new Error('expected toast message to be visible to selection tooling')
    }

    const selection = dom.window.getSelection()
    const range = dom.window.document.createRange()
    range.selectNodeContents(message)
    selection?.removeAllRanges()
    selection?.addRange(range)
    if (selection?.toString() !== renderedMessage) {
      throw new Error(`expected toast message to support text selection, got ${JSON.stringify(selection?.toString())}`)
    }

    const copyButton = card.querySelector('button[data-kg-toast-copy="toast:copy"]') as HTMLButtonElement | null
    if (!copyButton) throw new Error('expected a native Copy notification text button')
    if (copyButton.type !== 'button' || copyButton.getAttribute('aria-label') !== 'Copy notification text') {
      throw new Error('expected copy affordance to retain an explicit native button contract')
    }
    if (copyButton.getAttribute('data-kg-selection-surface') !== 'toast-copy' || !copyButton.classList.contains('pointer-events-auto')) {
      throw new Error('expected Copy affordance to stay hit-testable and visible to selection tooling')
    }
    if (copyButton.textContent?.trim()) {
      throw new Error('expected toast Copy affordance to remain icon-only')
    }
    const copyIcon = copyButton.querySelector('[data-kg-selection-surface="toast-copy-icon"]')
    if (!copyIcon || copyIcon.getAttribute('aria-hidden') === 'true') {
      throw new Error('expected copy icon to remain a visible semantic affordance instead of hidden decoration')
    }

    await act(async () => {
      copyButton.click()
      await tick()
    })
    if (copiedMessages.length !== 1 || copiedMessages[0] !== renderedMessage) {
      throw new Error(`expected Copy to use the sanitized rendered message, got ${JSON.stringify(copiedMessages)}`)
    }
    if (copyButton.getAttribute('aria-label') !== 'Notification text copied') {
      throw new Error('expected successful toast copy to provide semantic confirmation')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    if (originalClipboard) Object.defineProperty(dom.window.navigator, 'clipboard', originalClipboard)
    else delete (dom.window.navigator as Navigator & { clipboard?: unknown }).clipboard
    restore()
    restoreWindow()
  }
}

export async function testHistoryViewRendersSharedLogActionsAndDispatchesUiRuntime() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    store.resetAll()
    store.setBottomSurfaceCollapsed(true)
    store.setBottomSurfaceTab('stats')
    store.pushUiLog({
      kind: 'warning',
      source: 'storage:conflict',
      message: 'Storage conflict retained local change.',
      actions: [
        {
          id: buildAgenticGraphStorageConflictReviewLogActionId('kgws:history'),
          label: 'Review Log',
          tone: 'neutral',
        },
      ],
    })

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)

    await act(async () => {
      root!.render(<HistoryView searchQuery="" />)
    })
    await tick()

    const historyChooser = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      button => button.getAttribute('aria-label')?.startsWith('History section:'),
    )
    if (!historyChooser) throw new Error('expected History section chooser')

    await act(async () => {
      historyChooser.click()
      await tick()
    })

    const logTab = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      button => button.textContent?.trim() === 'Log',
    )
    if (!logTab) throw new Error('expected Log option')

    await act(async () => {
      logTab.click()
      await tick()
    })

    const reviewButton = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      button => button.textContent?.trim() === 'Review Log',
    )
    if (!reviewButton) throw new Error('expected history view log row to render shared action button')

    await act(async () => {
      reviewButton.click()
      await tick()
    })

    const nextState = useGraphStore.getState()
    if (nextState.bottomSurfaceCollapsed !== false) {
      throw new Error('expected history log action to open the bottom surface through the shared ui runtime')
    }
    if (nextState.bottomSurfaceTab !== 'history') {
      throw new Error('expected history log action to keep the shared runtime routed to History')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    restore()
    restoreWindow()
  }
}

export async function testToastHostPromotionRetryActionAppendsCommandIntoChatComposer() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  const observedEvents: Array<{ type: 'append' | 'open'; detail: unknown }> = []
  const retryCommand = '#promotion.retry /workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md /workspace/chat/20260522T195000Z/agentic-os-trace_20260522T195000Z.md'
  const retryToastId = 'chat-promotion-retry:/workspace/chat/20260522T195000Z/agenticOs_20260522T195000Z.md'
  const RetryComposerHarness = () => {
    const [input, setInput] = React.useState('')
    const [appendFocusRequestKey, setAppendFocusRequestKey] = React.useState(0)
    React.useEffect(() => {
      const handler = (event: Event) => {
        const detail = resolveFloatingPanelChatInputAppend((event as CustomEvent<{ text?: string; mode?: 'append' | 'replace' } | undefined>).detail)
        if (!detail) return
        setInput(previous => applyFloatingPanelChatInputAppend(previous, detail))
        setAppendFocusRequestKey(previous => previous + 1)
      }
      dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
      return () => {
        dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
      }
    }, [])
    return (
      <>
        <FloatingPanelChatFooter
          input={input}
          setInput={setInput}
          appendFocusRequestKey={appendFocusRequestKey}
          isLoading={false}
          errorText={null}
          connectivity="unknown"
          connectivityDetail={null}
          currentNode={null}
          modelId="gpt-5-nano"
          modelOptions={['gpt-5-nano']}
          onModelChanged={() => undefined}
          uiPanelTextFontClass="text-sm"
          uiPanelMicroLabelTextSizeClass="text-xs"
          isSubmitDisabled={!input.trim()}
          onSubmit={event => event.preventDefault()}
          onStop={() => undefined}
          markdownText={null}
        />
        <ToastHost />
      </>
    )
  }
  const appendListener = (event: Event) => {
    observedEvents.push({ type: 'append', detail: (event as CustomEvent).detail })
  }
  const openListener = (event: Event) => {
    observedEvents.push({ type: 'open', detail: (event as CustomEvent).detail })
  }
  try {
    store.resetAll()
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    dom.window.addEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    store.pushUiToast({
      id: retryToastId,
      kind: 'warning',
      message: 'Artifact mirroring failed for the saved local artifacts.',
      ttlMs: null,
      log: false,
      actions: [buildChatPromotionRetryInsertAction(retryCommand, retryToastId)],
    })

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)

    await act(async () => {
      root!.render(<RetryComposerHarness />)
    })
    await waitForFrames(dom.window as unknown as Window, 2)

    const insertButton = (Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]).find(
      button => button.textContent?.trim() === 'Insert Retry Command',
    )
    if (!insertButton) throw new Error('expected toast host to render the shared retry-command action button')

    await act(async () => {
      insertButton.click()
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const appendEvent = observedEvents.find(event => event.type === 'append') || null
    const openEvent = observedEvents.find(event => event.type === 'open') || null
    if (!appendEvent || (appendEvent.detail as { text?: string; mode?: string } | null)?.text !== retryCommand || (appendEvent.detail as { text?: string; mode?: string } | null)?.mode !== 'append') {
      throw new Error(`expected retry toast action to append the exact retry command into the chat composer, got ${JSON.stringify(observedEvents)}`)
    }
    if (!openEvent || (openEvent.detail as { tab?: string; open?: boolean } | null)?.tab !== 'chat' || (openEvent.detail as { tab?: string; open?: boolean } | null)?.open !== true) {
      throw new Error(`expected retry toast action to open the shared chat surface before appending the command, got ${JSON.stringify(observedEvents)}`)
    }
    const textarea = dom.window.document.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!textarea) throw new Error('expected retry toast action test to mount the FloatingPanel chat composer')
    if (textarea.value !== retryCommand) {
      throw new Error(`expected retry toast action to queue the exact retry command into the chat composer, got ${JSON.stringify(textarea.value)}`)
    }
    if (textarea.selectionStart !== textarea.value.length || textarea.selectionEnd !== textarea.value.length) {
      throw new Error(`expected retry toast action to place the caret at the end of the queued command, got selection=${textarea.selectionStart}:${textarea.selectionEnd} value=${JSON.stringify(textarea.value)}`)
    }
    const updatedToast = useGraphStore.getState().uiToasts.find(toast => toast.id === retryToastId) || null
    if (!updatedToast || updatedToast.kind !== 'success' || updatedToast.message !== 'Retry command queued in chat composer.' || Array.isArray(updatedToast.actions)) {
      throw new Error(`expected retry toast action to collapse into a short success confirmation, got ${JSON.stringify(useGraphStore.getState().uiToasts)}`)
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    dom.window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    restore()
    restoreWindow()
  }
}
