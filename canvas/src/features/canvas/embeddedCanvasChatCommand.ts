export const EMBEDDED_CANVAS_CHAT_SUBMIT_MESSAGE_KIND = 'kg-preview-chat-submit' as const
export const EMBEDDED_CANVAS_CHAT_READY_MESSAGE_KIND = 'kg-preview-chat-ready' as const

export type EmbeddedCanvasChatSubmitMessage = {
  kind: typeof EMBEDDED_CANVAS_CHAT_SUBMIT_MESSAGE_KIND
  payload: { text: string }
}

export type EmbeddedCanvasChatReadyMessage = {
  kind: typeof EMBEDDED_CANVAS_CHAT_READY_MESSAGE_KIND
}

type EmbeddedCanvasChatCommandBridge = {
  submit: (text: string) => boolean
}

type EmbeddedCanvasChatCommandReceiver = {
  submit: (text: string) => boolean
}

const EMBEDDED_CANVAS_CHAT_COMMAND_BRIDGE_KEY = '__agenticGraphEmbeddedCanvasChatCommandBridge'

declare global {
  interface Window {
    __agenticGraphEmbeddedCanvasChatCommandBridge?: EmbeddedCanvasChatCommandBridge
    __agenticGraphEmbeddedCanvasChatCommandReceiver?: EmbeddedCanvasChatCommandReceiver
  }
}

export function deliverEmbeddedCanvasChatSubmit(
  target: Window,
  message: EmbeddedCanvasChatSubmitMessage,
  targetOrigin: string,
): boolean {
  try {
    if (target.__agenticGraphEmbeddedCanvasChatCommandReceiver?.submit(message.payload.text)) return true
  } catch {
    void 0
  }
  try {
    target.postMessage(message, targetOrigin)
    return true
  } catch {
    return false
  }
}

export function createEmbeddedCanvasChatSubmitMessage(text: string): EmbeddedCanvasChatSubmitMessage | null {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return null
  return { kind: EMBEDDED_CANVAS_CHAT_SUBMIT_MESSAGE_KIND, payload: { text: normalizedText } }
}

export function readEmbeddedCanvasChatSubmitMessage(value: unknown): EmbeddedCanvasChatSubmitMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as { kind?: unknown; payload?: { text?: unknown } }
  if (message.kind !== EMBEDDED_CANVAS_CHAT_SUBMIT_MESSAGE_KIND) return null
  return createEmbeddedCanvasChatSubmitMessage(typeof message.payload?.text === 'string' ? message.payload.text : '')
}

export function isEmbeddedCanvasChatReadyMessage(value: unknown): value is EmbeddedCanvasChatReadyMessage {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === EMBEDDED_CANVAS_CHAT_READY_MESSAGE_KIND)
}

export function installEmbeddedCanvasChatCommandBridge(bridge: EmbeddedCanvasChatCommandBridge): () => void {
  if (typeof window === 'undefined') return () => void 0
  window[EMBEDDED_CANVAS_CHAT_COMMAND_BRIDGE_KEY] = bridge
  return () => {
    if (window[EMBEDDED_CANVAS_CHAT_COMMAND_BRIDGE_KEY] === bridge) {
      delete window[EMBEDDED_CANVAS_CHAT_COMMAND_BRIDGE_KEY]
    }
  }
}

export function submitToEmbeddedCanvasChat(text: string): boolean {
  if (typeof window === 'undefined') return false
  return window[EMBEDDED_CANVAS_CHAT_COMMAND_BRIDGE_KEY]?.submit(text) === true
}
