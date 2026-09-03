import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { FloatingPanelChatComposer } from '@/features/chat/floatingPanelChat/FloatingPanelChatComposer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelChatComposerGrammarQuickBarSeedsSigilsAndMenus() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  function Harness() {
    const [input, setInput] = React.useState('')
    return (
      <FloatingPanelChatComposer
        input={input}
        setInput={setInput}
        markdownText={'---\nproject: agentic-graph\n---\n# Brief'}
        isLoading={false}
        isSubmitDisabled={false}
        uiPanelTextFontClass="text-sm"
        placeholder="Ask a question"
      />
    )
  }

  try {
    await mountReactRoot(root, React.createElement(Harness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    const quickBar = container.querySelector('[data-kg-chat-grammar-quick-bar="true"]') as HTMLElement | null
    if (!quickBar) throw new Error('expected FloatingPanel chat composer to render the grammar quick bar')

    const editor = container.querySelector('[data-kg-chat-input="1"]') as HTMLElement | null
    const commandProxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]') as HTMLTextAreaElement | null
    if (!editor || !commandProxy) throw new Error('expected FloatingPanel chat shared Card/Widget editor and command proxy')

    const slashButton = container.querySelector('[data-kg-chat-grammar-quick-bar-token="/"]') as HTMLButtonElement | null
    if (!slashButton) throw new Error('expected grammar quick bar slash token button')

    await act(async () => {
      slashButton.click()
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    if (commandProxy.value !== '/') {
      throw new Error(`expected slash quick bar button to seed slash token at caret, got ${JSON.stringify(commandProxy.value)}`)
    }
    const slashMenu = dom.window.document.querySelector('section[aria-label="Chat slash commands"]')
    if (!slashMenu) throw new Error(`expected slash quick bar token to mount the slash command menu, html=${container.innerHTML}`)

    await act(async () => {
      editor.textContent = 'Tell me'
      Simulate.input(editor)
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const keywordButton = container.querySelector('[data-kg-chat-grammar-quick-bar-token="#"]') as HTMLButtonElement | null
    if (!keywordButton) throw new Error('expected grammar quick bar keyword token button')

    await act(async () => {
      keywordButton.click()
      await waitForFrames(dom.window as unknown as Window, 2)
    })

    const keywordValue = String(commandProxy.value || '')
    if (keywordValue !== 'Tell me #') {
      throw new Error(`expected keyword quick bar button to append a spaced token at the caret, got ${JSON.stringify(keywordValue)}`)
    }
    const keywordMenu = dom.window.document.querySelector('section[aria-label="Chat runtime invocations"]')
    if (!keywordMenu) throw new Error('expected keyword quick bar token to mount the runtime invocation menu')
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
