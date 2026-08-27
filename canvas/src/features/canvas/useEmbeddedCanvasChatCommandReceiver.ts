import React from 'react'
import {
  EMBEDDED_CANVAS_CHAT_READY_MESSAGE_KIND,
  createEmbeddedCanvasChatSubmitMessage,
  readEmbeddedCanvasChatSubmitMessage,
} from '@/features/canvas/embeddedCanvasChatCommand'

export function useEmbeddedCanvasChatCommandReceiver(): void {
  React.useEffect(() => {
    if (!window.parent || window.parent === window) return
    const submit = (text: string) => {
      const message = createEmbeddedCanvasChatSubmitMessage(text)
      if (!message) return false
      void import('@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed').then(({ openFloatingPanelChatWithSeedWhenReady }) => {
        openFloatingPanelChatWithSeedWhenReady({
          text: message.payload.text,
          mode: 'replace',
          delivery: 'queuedHandoff',
          submit: true,
        })
      })
      return true
    }
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return
      const message = readEmbeddedCanvasChatSubmitMessage(event.data)
      if (!message) return
      submit(message.payload.text)
    }
    window.__agenticgraphEmbeddedCanvasChatCommandReceiver = { submit }
    window.addEventListener('message', handleMessage)
    window.parent.postMessage({ kind: EMBEDDED_CANVAS_CHAT_READY_MESSAGE_KIND }, window.location.origin)
    return () => {
      window.removeEventListener('message', handleMessage)
      delete window.__agenticgraphEmbeddedCanvasChatCommandReceiver
    }
  }, [])
}
