import React from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingPanelChatMessagesSection } from '@/features/chat/FloatingPanelChatSections'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isFloatingPanelChatThreadNearTail,
  reduceFloatingPanelChatThreadFollowState,
} from '@/features/chat/floatingPanelChat/useFloatingPanelChatThreadFollow'

export async function testFloatingPanelChatStreamsReasoningStatusAfterLatestMessage() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: '/prd-tad.create airvio_.JPEG',
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
          },
        ],
        isLoading: true,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        streamingReasoningPreview: 'Reasoning 447: convergence. | web_search: Bitcoin options skew gold options premium',
        streamingUsageSummary: 'Tokens 1024',
        streamingFinishReason: null,
        writingWorkspaceFileLabel: 'Writing to agentic-os-trace_20260606T011923Z.md...',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const status = container.querySelector('[data-kg-chat-stream-status="chronological"]') as HTMLElement | null
    if (!status) throw new Error('expected streaming reasoning status to render inside the chat messages section')
    const viewport = container.querySelector('[data-kg-chat-thread-viewport="true"]') as HTMLElement | null
    if (!viewport || status !== viewport.lastElementChild) {
      throw new Error('expected streaming status to follow the latest visible chat message')
    }
    if (status.getAttribute('role') !== 'status' || status.getAttribute('aria-live') !== 'polite') {
      throw new Error('expected streaming status to expose a polite live region')
    }
    if (status.className.includes('sticky') || status.className.includes('top-0')) {
      throw new Error(`expected streaming status to stay in chronological chat flow, got ${status.className}`)
    }
    const latestBubble = container.querySelector('.kg-floating-chat-message-bubble') as HTMLElement | null
    if (!latestBubble || !String(latestBubble.textContent || '').includes('/prd-tad.create')) {
      throw new Error(`expected latest user request bubble before streaming status, got ${container.textContent}`)
    }
    if (!(latestBubble.compareDocumentPosition(status) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error('expected streaming status DOM order to follow the latest user request bubble')
    }

    const reasoning = status.querySelector('[data-kg-chat-stream-reasoning="true"]') as HTMLElement | null
    if (!reasoning || !String(reasoning.textContent || '').includes('web_search: Bitcoin options skew')) {
      throw new Error(`expected reasoning/tool signal to stream in the top chat status, got ${status.textContent}`)
    }
    if (!String(status.textContent || '').includes('Writing to agentic-os-trace_20260606T011923Z.md')) {
      throw new Error(`expected workspace write status to move with the streaming chat status, got ${status.textContent}`)
    }

    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          content: 'Assistant response is settled.',
        }],
        isLoading: false,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        streamingReasoningPreview: 'Reasoning 447: stale footer status',
        streamingUsageSummary: 'Tokens 1024',
        streamingFinishReason: null,
        writingWorkspaceFileLabel: 'Writing to agentic-os-trace_20260606T011923Z.md...',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    if (container.querySelector('[data-kg-chat-stream-status="chronological"]')) {
      throw new Error('expected settled Chat state to hide stale streaming status')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatRendersLiveAssistantTailBeforeStreamingStatus() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [
          { id: 'user-live-tail', role: 'user', content: '/video-agent build the demo' },
          { id: 'assistant-live-tail', role: 'assistant', content: '' },
        ],
        streamingAssistant: {
          id: 'assistant-live-tail',
          text: 'First streamed chunk. Tail sentinel.',
        },
        isLoading: true,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        streamingReasoningPreview: 'Generating scene plan',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const tail = container.querySelector('[data-kg-chat-streaming-tail="true"]') as HTMLElement | null
    if (!tail || !String(tail.textContent || '').includes('Tail sentinel.')) {
      throw new Error(`expected real-time assistant stream tail in the thread, html=${container.innerHTML}`)
    }
    if (container.querySelectorAll('[data-kg-chat-streaming-tail="true"]').length !== 1) {
      throw new Error('expected pending assistant placeholder and live tail to resolve to one visible streaming row')
    }
    const status = container.querySelector('[data-kg-chat-stream-status="chronological"]')
    if (!status || !(tail.compareDocumentPosition(status) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error('expected live assistant tail to render immediately before chronological stream status')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatRendersPendingAssistantBubbleBeforeFirstToken() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [
          { id: 'user-pending', role: 'user', content: 'Build the workspace plan.' },
          { id: 'assistant-pending', role: 'assistant', content: '' },
        ],
        streamingAssistant: { id: 'assistant-pending', text: '' },
        isLoading: true,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const pending = container.querySelector('[data-kg-chat-streaming-state="pending"]') as HTMLElement | null
    if (!pending || !String(pending.textContent || '').includes('Waiting for response')) {
      throw new Error(`expected a visible assistant bubble before the first token, html=${container.innerHTML}`)
    }
    if (pending.getAttribute('aria-busy') !== 'true') {
      throw new Error('expected the pending assistant bubble to expose its busy state')
    }
    if (container.querySelectorAll('[data-kg-chat-streaming-tail="true"]').length !== 1) {
      throw new Error('expected one pending/live assistant row to own the streaming tail')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export function testFloatingPanelChatFollowsLargeStreamingTailUntilManualScroll() {
  let state = { isLoading: true, shouldFollow: true }
  state = reduceFloatingPanelChatThreadFollowState(state, { type: 'render', isLoading: true })
  if (!state.shouldFollow) {
    throw new Error('expected a large streamed chunk to preserve the pre-update tail-follow decision')
  }

  const isNearTail = isFloatingPanelChatThreadNearTail({
    clientHeight: 200,
    scrollHeight: 900,
    scrollTop: 100,
  })
  state = reduceFloatingPanelChatThreadFollowState(state, { type: 'scroll', isNearTail })
  state = reduceFloatingPanelChatThreadFollowState(state, { type: 'render', isLoading: true })
  if (state.shouldFollow) {
    throw new Error('expected manual scroll position to disable tail-follow until the next stream starts')
  }

  state = reduceFloatingPanelChatThreadFollowState(state, { type: 'render', isLoading: false })
  state = reduceFloatingPanelChatThreadFollowState(state, { type: 'render', isLoading: true })
  if (!state.shouldFollow) {
    throw new Error('expected a new stream to restore tail-follow')
  }
}

export function testWorkspaceRuntimeDoesNotMirrorChatStreamingStatusIntoToast() {
  const text = readFileSync(resolve(process.cwd(), 'src/lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx'), 'utf8')
  if (text.includes('Streaming to ')) {
    throw new Error('expected chat/SSE streaming file status to stay in FloatingPanel Chat instead of generic workspace toast')
  }
  if (text.includes('streamingWorkspaceToastActiveRef') || text.includes('workspaceStreamingStatusLabel')) {
    throw new Error('expected workspace runtime not to own a duplicate chat streaming toast lifecycle')
  }
}
