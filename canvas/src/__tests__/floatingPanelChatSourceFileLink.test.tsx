import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingPanelChatMessagesSection } from '@/features/chat/FloatingPanelChatSections'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelChatRendersSourceFilesWorkspaceLinks() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const openedPaths: string[] = []

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            '- Structured KGC response saved to workspace.',
            '- [Open in Source Files: kgc_20260606T010203Z.md](workspace:/chat-log/20260606T010203Z/kgc_20260606T010203Z.md)',
          ].join('\n'),
        }],
        isLoading: false,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        onOpenWorkspacePath: path => { openedPaths.push(path) },
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const button = container.querySelector('[data-kg-chat-source-file-link="true"]') as HTMLButtonElement | null
    if (!button) throw new Error('expected assistant message to render a Source Files workspace link button')
    const expectedPath = '/chat-log/20260606T010203Z/kgc_20260606T010203Z.md'
    if (button.dataset.workspacePath !== expectedPath) {
      throw new Error(`expected workspace link to normalize the workspace: scheme, got ${button.dataset.workspacePath}`)
    }
    if (!String(button.textContent || '').includes('Open in Source Files')) {
      throw new Error(`expected workspace link label to name Source Files, got ${String(button.textContent || '')}`)
    }
    if (button.getAttribute('aria-label') !== `Open ${expectedPath} in Source Files`) {
      throw new Error(`expected workspace link to expose a Source Files aria-label, got ${button.getAttribute('aria-label')}`)
    }

    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (openedPaths[0] !== expectedPath) {
      throw new Error(`expected workspace link click to open the Source Files workspace path, got ${JSON.stringify(openedPaths)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatRendersTypedSourceFilesWorkspaceLinks() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const openedPaths: string[] = []

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [{
          id: 'assistant-typed-link',
          role: 'assistant',
          content: [
            '- Materialized user model.',
            '- [Open USER_MODEL in Source Files: user-model-founder.md](workspace:/chat-log/user-models/user-model-founder.md)',
          ].join('\n'),
        }],
        isLoading: false,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        onOpenWorkspacePath: path => { openedPaths.push(path) },
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const button = container.querySelector('[data-kg-chat-source-file-link="true"]') as HTMLButtonElement | null
    if (!button) throw new Error('expected assistant message to render a typed Source Files workspace link button')
    const expectedPath = '/chat-log/user-models/user-model-founder.md'
    if (button.dataset.workspacePath !== expectedPath) {
      throw new Error(`expected typed workspace link to normalize the workspace: scheme, got ${button.dataset.workspacePath}`)
    }
    if (!String(button.textContent || '').includes('Open USER_MODEL in Source Files')) {
      throw new Error(`expected typed workspace link label to preserve the artifact type, got ${String(button.textContent || '')}`)
    }

    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    if (openedPaths[0] !== expectedPath) {
      throw new Error(`expected typed workspace link click to open the Source Files workspace path, got ${JSON.stringify(openedPaths)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatRendersUserMediaMarkdownAsInlineChip() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const mediaUrl = 'http://localhost:5180/api/storage/media/airvio/runs/upload-017d1e965528642f/image/strybldr-starter-source-017d1e965528642f.png?kg_media_token=test-token'
  const content = `what's in ![strybldr-starter-source.png](${mediaUrl})`

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [{ id: 'user-1', role: 'user', content }],
        isLoading: false,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const bubble = container.querySelector('.kg-floating-chat-message-bubble')
    if (!bubble) throw new Error('expected user message bubble to render')
    const chip = bubble.querySelector('[data-kg-chat-message-media-chip="1"][data-kg-chat-message-media-kind="image"]')
    if (!chip) throw new Error(`expected user media markdown to render as an inline media chip, html=${bubble.innerHTML}`)
    const sharedPill = chip.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (!sharedPill) throw new Error(`expected message media chip to reuse the shared inline media pill, html=${chip.innerHTML}`)
    const thumbnail = chip.querySelector('[data-kg-inline-command-thumbnail="image"] img') as HTMLImageElement | null
    if (!thumbnail || thumbnail.getAttribute('src') !== mediaUrl) {
      throw new Error(`expected message media chip thumbnail to preserve the media URL, got ${JSON.stringify(thumbnail?.getAttribute('src') || null)}`)
    }

    const visibleText = String(bubble.textContent || '')
    if (!visibleText.includes("what's in") || !visibleText.includes('strybldr-starter-source.png')) {
      throw new Error(`expected media-chip bubble to preserve prompt text and label, got ${JSON.stringify(visibleText)}`)
    }
    for (const hiddenRawToken of ['![', mediaUrl, 'kg_media_token']) {
      if (visibleText.includes(hiddenRawToken)) {
        throw new Error(`expected raw media markdown to stay out of visible bubble text, got ${JSON.stringify(visibleText)}`)
      }
    }
    if (content !== `what's in ![strybldr-starter-source.png](${mediaUrl})`) {
      throw new Error('expected test message content to remain raw markdown-owned')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}

export async function testFloatingPanelChatRendersInvocationChipsAcrossThreadMessages() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const content = [
    '/video-agent @video-generation-demo-script @provider.byteplus #spec.low',
    '@[AI video script.md](https://airvio.co/agenticgraph/share/opaque)',
  ].join(' ')

  try {
    await mountReactRoot(
      root,
      React.createElement(FloatingPanelChatMessagesSection, {
        messages: [{ id: 'user-invocations', role: 'user', content }],
        isLoading: false,
        historyKey: 'history-key',
        uiPanelTextFontClass: 'text-sm',
        uiPanelKeyValueTextSizeClass: 'text-xs',
        uiPanelMicroLabelTextSizeClass: 'text-xs',
        setMessages: () => undefined,
      }),
      { window: dom.window as unknown as Window, frames: 2 },
    )

    const bubble = container.querySelector('.kg-floating-chat-message-bubble')
    if (!bubble) throw new Error('expected invocation message bubble to render')
    const tokens = (Array.from(bubble.querySelectorAll('[data-kg-chat-message-invocation-token]')) as HTMLElement[])
      .map(node => node.getAttribute('data-kg-chat-message-invocation-token'))
    const expectedTokens = ['/video-agent', '@video-generation-demo-script', '@provider.byteplus', '#spec.low']
    expectedTokens.forEach(token => {
      if (!tokens.includes(token)) {
        throw new Error(`expected thread bubble to project ${token} as an inline invocation chip, got ${JSON.stringify(tokens)}`)
      }
    })
    const sourceBinding = bubble.querySelector('[data-kg-chat-message-source-binding="1"]') as HTMLAnchorElement | null
    if (!sourceBinding || sourceBinding.textContent !== '@AI video script.md') {
      throw new Error(`expected structured @ source link to render as one filename chip, html=${bubble.innerHTML}`)
    }
    if (sourceBinding.href !== 'https://airvio.co/agenticgraph/share/opaque') {
      throw new Error(`expected structured @ source chip to preserve its target, got ${sourceBinding.href}`)
    }
    if (String(bubble.textContent || '').includes('@[AI video script.md](')) {
      throw new Error(`expected raw structured binding markdown to stay out of visible bubble text, got ${bubble.textContent}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
  }
}
