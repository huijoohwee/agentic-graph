import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useFloatingPanelChatHistory } from '@/features/chat/floatingPanelChat/useFloatingPanelChatHistory'
import { getCachedChatHistory, putChatHistoryCache, publishChatHistoryTransition } from '@/features/chat/floatingPanelChat/floatingPanelChatRuntime'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelChatHydrationSurvivesEffectReplay(): Promise<void> {
  for (const transition of [false, true]) {
    const { dom, restore } = initJsdomHarness()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    const key = `demo-hydration-${transition}-${Date.now()}`
    const seeded: ChatMessage[] = [
      { id: `${key}:user`, role: 'user', content: '/launch-copilot outline reference Example request.' },
      { id: `${key}:assistant`, role: 'assistant', content: 'Demo example response.' },
    ]
    putChatHistoryCache(key, seeded)
    if (transition) publishChatHistoryTransition({ historyKeys: [key], messages: seeded })
    function Harness() {
      const [messages, setMessages] = React.useState<ChatMessage[]>([])
      useFloatingPanelChatHistory({ historyKey: key, isLoading: false, messages, setMessages, streamingAssistant: null })
      return <section><p>{messages.map(message => message.content).join('\n')}</p><button onClick={() => setMessages([])}>Clear</button></section>
    }
    try {
      await mountReactRoot(root, <React.StrictMode><Harness /></React.StrictMode>, { window: dom.window as unknown as Window, frames: 4 })
      if (!container.textContent?.includes('Demo example response.') || getCachedChatHistory(key)?.length !== 2) {
        throw new Error(`Effect replay erased the ${transition ? 'transition' : 'cached'} conversation`)
      }
      await act(async () => { container.querySelector('button')!.click(); await waitForFrames(dom.window as unknown as Window, 3) })
      if (container.textContent?.includes('Demo example response.') || getCachedChatHistory(key)?.length !== 0) {
        throw new Error('A deliberate Clear must still replace hydrated messages')
      }
    } finally {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
      container.remove()
      restore()
    }
  }
}
