import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { CHAT_INPUT_APPEND_EVENT, FLOATING_PANEL_OPEN_EVENT } from '@/features/canvas/utils'
import { installFloatingPanelBridge } from '@/features/toolbar/floatingPanelBridge'
import { consumeFloatingPanelChatInputHandoff } from '@/features/chat/floatingPanelChat/floatingPanelChatInputHandoff'
import { openFloatingPanelChat, openFloatingPanelChatWithSeed } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { NATIVE_IMPORT_URL_INVOCATION_TEMPLATE } from '@/features/chat/nativeImportUrlInvocation'

export async function testFloatingPanelChatOpenOnlyHelperDispatchesSharedOpenEvent(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const seenOpen: Array<{ tab?: string; open?: boolean }> = []
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  const openListener = (event: Event) => {
    seenOpen.push((((event as CustomEvent<{ tab?: string; open?: boolean } | undefined>).detail) || {}) as { tab?: string; open?: boolean })
  }
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }
  try {
    dom.window.addEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    const accepted = openFloatingPanelChat()
    if (!accepted) throw new Error('expected open-only chat helper to accept the shared chat open request')
    if (seenOpen.length !== 1 || seenOpen[0]?.tab !== 'chat' || seenOpen[0]?.open !== true) {
      throw new Error(`expected open-only chat helper to emit one chat-open event, got ${JSON.stringify(seenOpen)}`)
    }
    if (seenAppend.length !== 0) {
      throw new Error(`expected open-only chat helper not to emit chat append events, got ${JSON.stringify(seenAppend)}`)
    }
    if (consumeFloatingPanelChatInputHandoff() !== null) {
      throw new Error('expected open-only chat helper to avoid leaving queued handoff drafts behind')
    }
  } finally {
    dom.window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedAppendEventDispatchesSharedEvents(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const seenOpen: Array<{ tab?: string; open?: boolean }> = []
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  const openListener = (event: Event) => {
    seenOpen.push((((event as CustomEvent<{ tab?: string; open?: boolean } | undefined>).detail) || {}) as { tab?: string; open?: boolean })
  }
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }
  try {
    dom.window.addEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    const accepted = openFloatingPanelChatWithSeed({
      text: '#promotion.retry /workspace/chat/agenticOs.md',
      mode: 'append',
      delivery: 'appendEvent',
    })
    if (!accepted) throw new Error('expected append-event chat seed helper to open the shared chat surface')
    if (seenOpen.length !== 1 || seenOpen[0]?.tab !== 'chat' || seenOpen[0]?.open !== true) {
      throw new Error(`expected append-event chat seed helper to emit one chat-open event, got ${JSON.stringify(seenOpen)}`)
    }
    if (seenAppend.length !== 1 || seenAppend[0]?.text !== '#promotion.retry /workspace/chat/agenticOs.md' || seenAppend[0]?.mode !== 'append') {
      throw new Error(`expected append-event chat seed helper to emit one shared chat append event, got ${JSON.stringify(seenAppend)}`)
    }
    if (consumeFloatingPanelChatInputHandoff() !== null) {
      throw new Error('expected append-event chat seed helper to avoid leaving queued handoff drafts behind')
    }
  } finally {
    dom.window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedAppendEventNormalizesInvocationSpacing(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }
  try {
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    const accepted = openFloatingPanelChatWithSeed({
      text: '  /workspace.review   #token-economics   @dev-only  ',
      mode: 'append',
      delivery: 'appendEvent',
    })
    if (!accepted) throw new Error('expected append-event chat seed helper to accept normalized invocation text')
    if (
      seenAppend.length !== 1
      || seenAppend[0]?.text !== '/workspace.review #token-economics @dev-only'
      || seenAppend[0]?.mode !== 'append'
    ) {
      throw new Error(`expected append-event chat seed helper to normalize invocation spacing before dispatch, got ${JSON.stringify(seenAppend)}`)
    }
  } finally {
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedAppendEventPreservesRawSeedText(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }
  try {
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    const accepted = openFloatingPanelChatWithSeed({
      text: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
      mode: 'append',
      delivery: 'appendEvent',
    })
    if (!accepted) throw new Error('expected append-event chat seed helper to accept raw command prompts')
    if (
      seenAppend.length !== 1
      || seenAppend[0]?.text !== NATIVE_IMPORT_URL_INVOCATION_TEMPLATE
      || seenAppend[0]?.mode !== 'append'
    ) {
      throw new Error(`expected append-event chat seed helper to preserve raw seed text when normalization does not apply, got ${JSON.stringify(seenAppend)}`)
    }
  } finally {
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedQueuedHandoffClearsQueueWhenChatUnavailable(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    void consumeFloatingPanelChatInputHandoff()
    const accepted = openFloatingPanelChatWithSeed({
      text: '/chat.seed',
      mode: 'replace',
      delivery: 'queuedHandoff',
    })
    if (accepted) throw new Error('expected queued-handoff chat seed helper to fail closed without a floating panel bridge')
    if (consumeFloatingPanelChatInputHandoff() !== null) {
      throw new Error('expected queued-handoff chat seed helper to clear the pending draft after a failed open request')
    }
  } finally {
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedQueuedHandoffQueuesResolvedSeedWhenChatAvailable(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const seenOpen: Array<{ tab?: string; open?: boolean }> = []
  const seenAppend: Array<{ text?: string; mode?: string }> = []
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  const openListener = (event: Event) => {
    seenOpen.push((((event as CustomEvent<{ tab?: string; open?: boolean } | undefined>).detail) || {}) as { tab?: string; open?: boolean })
  }
  const appendListener = (event: Event) => {
    seenAppend.push((((event as CustomEvent<{ text?: string; mode?: string } | undefined>).detail) || {}) as { text?: string; mode?: string })
  }
  try {
    void consumeFloatingPanelChatInputHandoff()
    dom.window.addEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.addEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    const accepted = openFloatingPanelChatWithSeed({
      text: '  /workspace.review   #token-economics   @dev-only  ',
      mode: 'replace',
      delivery: 'queuedHandoff',
    })
    if (!accepted) throw new Error('expected queued-handoff chat seed helper to accept an available chat surface')
    if (seenOpen.length !== 1 || seenOpen[0]?.tab !== 'chat' || seenOpen[0]?.open !== true) {
      throw new Error(`expected queued-handoff chat seed helper to emit one chat-open event, got ${JSON.stringify(seenOpen)}`)
    }
    if (seenAppend.length !== 0) {
      throw new Error(`expected queued-handoff chat seed helper not to emit append events before flush, got ${JSON.stringify(seenAppend)}`)
    }
    const handoff = consumeFloatingPanelChatInputHandoff()
    if (!handoff || handoff.text !== '/workspace.review #token-economics @dev-only' || handoff.mode !== 'replace') {
      throw new Error(`expected queued-handoff chat seed helper to queue one resolved draft, got ${JSON.stringify(handoff)}`)
    }
  } finally {
    dom.window.removeEventListener(FLOATING_PANEL_OPEN_EVENT, openListener as EventListener)
    dom.window.removeEventListener(CHAT_INPUT_APPEND_EVENT, appendListener as EventListener)
    cleanupBridge()
    restore()
  }
}

export async function testFloatingPanelChatOpenSeedQueuedHandoffPreservesAutoSubmitIntent(): Promise<void> {
  const { restore } = initJsdomHarness()
  const cleanupBridge = installFloatingPanelBridge({
    openPropsPanel: () => undefined,
    openFloatingPanel: () => undefined,
    openRendererPanel: () => undefined,
  })
  try {
    void consumeFloatingPanelChatInputHandoff()
    const accepted = openFloatingPanelChatWithSeed({
      text: '/video-agent @provider.byteplus @text',
      mode: 'replace',
      delivery: 'queuedHandoff',
      submit: true,
    })
    const handoff = consumeFloatingPanelChatInputHandoff()
    if (!accepted || handoff?.text !== '/video-agent @provider.byteplus @text' || handoff.submit !== true) {
      throw new Error(`expected queued Chat seed to preserve auto-submit intent, got ${JSON.stringify({ accepted, handoff })}`)
    }
  } finally {
    cleanupBridge()
    restore()
  }
}
