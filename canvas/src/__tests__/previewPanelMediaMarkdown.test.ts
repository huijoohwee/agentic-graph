import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import PreviewPanelView from '@/lib/panels/views/PreviewPanelView.impl'
import CommandMenuCatalogPanel from '@/features/command-menu/CommandMenuCatalogPanel'
import { dedupeCommandMenuRichMediaItems, type CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { readRichMediaInsertUrl, readRichMediaPreviewUrl } from '@/features/command-menu/mediaCatalogShared'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForNextFrame } from '@/tests/lib/reactRootHarness'
import { buildMarkdownPreviewMediaKey } from '@/features/markdown/ui/markdownPreviewLinks'
import { readCommandMenuMediaRowName, setInputValue } from './previewPanelMediaSupport'
export async function testPreviewPanelStandaloneLinkWebpageAndTweetSelectable() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const markdown = [
      '# Rich Media',
      '',
      '[Article](https://www.aljazeera.com/news/2026/2/19/visualising-ai-spending-how-does-it-compare-with-historys-mega-projects)',
      '',
      '[Tweet](https://x.com/HuiJooHwee/status/2023774971982672097?s=20)',
      '',
    ].join('\n')

    const state = useGraphStore.getState()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [] })
    state.setMarkdownDocument('doc.md', markdown)
    try {
      state.setFrontmatterModeEnabled(false)
    } catch {
      void 0
    }
    try {
      useGraphStore.setState({ frontmatterModeEnabled: false })
    } catch {
      void 0
    }
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)

    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })

    const rows = Array.from(doc.querySelectorAll('[data-kg-command-menu-media-source="markdown"]')) as HTMLElement[]
    const webpageCard = rows.find(row => readCommandMenuMediaRowName(row).toLowerCase().includes('article'))
    if (!webpageCard) throw new Error('webpage Command Menu row not found')

    const renameButton = webpageCard.querySelector('[data-kg-command-menu-media-rename]') as HTMLButtonElement | null
    if (!renameButton) throw new Error('expected an explicit Rename action for the webpage')
    await act(async () => {
      renameButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    const webpageNameInput = webpageCard.querySelector('[data-kg-command-menu-media-name-input]') as HTMLInputElement | null
    if (!webpageNameInput) throw new Error('expected markdown media row to expose inline name edit input')
    await act(async () => {
      setInputValue(dom.window, webpageNameInput, 'Renamed article')
      webpageNameInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const renamedMarkdown = String(useGraphStore.getState().markdownDocumentText || '')
    if (!renamedMarkdown.includes('[Renamed article](https://www.aljazeera.com/news/2026/2/19/visualising-ai-spending-how-does-it-compare-with-historys-mega-projects)')) {
      throw new Error(`expected markdown media inline rename to persist into link text, got ${renamedMarkdown}`)
    }

    await act(async () => {
      webpageCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    await act(async () => {
      root.render(React.createElement(PreviewPanelView))
      await waitForFrames(dom.window, 4)
    })

    const loadButtons = Array.from(doc.querySelectorAll('button')) as HTMLButtonElement[]
    const loadEmbed = loadButtons.find(btn => String(btn.textContent || '').toLowerCase().includes('load embed'))
    if (!loadEmbed) {
      const sample = loadButtons
        .map(b => String(b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 30)
        .join(' | ')
      throw new Error(`load embed button not found. buttons=${sample}`)
    }
    await act(async () => {
      loadEmbed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    const mediaPanel = doc.querySelector('[data-kg-rich-media-panel="1"][data-kg-rich-media-render-surface="1"]')
    if (!mediaPanel) throw new Error('expected active media preview to reuse the widget-style RichMediaPanel surface')

    const expectedWebpageKey = buildMarkdownPreviewMediaKey(
      'webpage',
      3,
      'https://www.aljazeera.com/news/2026/2/19/visualising-ai-spending-how-does-it-compare-with-historys-mega-projects',
    )
    const afterWebpage = useGraphStore.getState()
    if (afterWebpage.markdownPreviewActiveMediaKey !== expectedWebpageKey) {
      throw new Error(
        `expected markdownPreviewActiveMediaKey "${expectedWebpageKey}", got ${String(
          afterWebpage.markdownPreviewActiveMediaKey,
        )}`,
      )
    }

    await act(async () => {
      root.render(React.createElement(CommandMenuCatalogPanel))
      await waitForFrames(dom.window, 4)
    })
    const rowsAfter = Array.from(doc.querySelectorAll('[data-kg-command-menu-media-source="markdown"]')) as HTMLElement[]
    const tweetCard = rowsAfter.find(row => readCommandMenuMediaRowName(row).toLowerCase().includes('tweet'))
    if (!tweetCard) throw new Error('tweet Command Menu row not found')

    await act(async () => {
      tweetCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    const expectedTweetKey = buildMarkdownPreviewMediaKey(
      'tweet',
      5,
      'https://x.com/HuiJooHwee/status/2023774971982672097?s=20',
    )
    const afterTweet = useGraphStore.getState()
    if (afterTweet.markdownPreviewActiveMediaKey !== expectedTweetKey) {
      throw new Error(
        `expected markdownPreviewActiveMediaKey "${expectedTweetKey}", got ${String(
          afterTweet.markdownPreviewActiveMediaKey,
        )}`,
      )
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
    restoreWindow()
  }
}


export async function testCommandMenuMarkdownMediaRenameSyncsWorkspaceHrefReferences() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const href = 'https://example.com/seedance.mp4'
    const markdown = [
      '# Media source',
      '',
      `[${href}](${href})`,
      '',
      `[Video reference](${href})`,
      '',
    ].join('\n')
    const workspacePeerText = [
      '# Storyboard card',
      '',
      `[Old storyboard media](${href})`,
      '',
    ].join('\n')

    const state = useGraphStore.getState()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [] })
    state.setSourceFiles([
      {
        id: 'active-media-source',
        name: 'import-url-source.md',
        text: markdown,
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'workspace:/import-url-source.md' },
      },
      {
        id: 'storyboard-media-peer',
        name: 'storyboard-card.md',
        text: workspacePeerText,
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: 'workspace:/storyboard-card.md' },
      },
    ])
    state.setMarkdownDocument('workspace:/import-url-source.md', markdown)
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)

    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })

    const nameText = Array
      .from(doc.querySelectorAll('[data-kg-command-menu-media-name-text]') as NodeListOf<HTMLElement>)
      .find(label => String(label.textContent || '').trim() === href)
    if (!nameText) throw new Error('expected Command Menu media row to expose the URL-derived media name')
    const mediaRow = nameText.closest('[data-kg-command-menu-media-candidate]')
    const renameButton = mediaRow?.querySelector('[data-kg-command-menu-media-rename]') as HTMLButtonElement | null
    if (!renameButton) throw new Error('expected Command Menu media row to expose explicit rename control')

    await act(async () => {
      renameButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })

    const nameInput = mediaRow?.querySelector('[data-kg-command-menu-media-name-input]') as HTMLInputElement | null
    if (!nameInput || nameInput.value !== href) throw new Error('expected explicit rename control to open the URL-derived media name input')

    await act(async () => {
      setInputValue(dom.window, nameInput, 'Seedance source media')
      await waitForNextFrame(dom.window)
    })
    const syncedDraftInput = mediaRow?.querySelector('[data-kg-command-menu-media-name-input]') as HTMLInputElement | null
    if (syncedDraftInput?.value !== 'Seedance source media') {
      throw new Error(`expected same-href media row to keep one live draft input, got ${JSON.stringify(syncedDraftInput?.value || '')}`)
    }

    await act(async () => {
      nameInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    const after = useGraphStore.getState()
    const activeText = String(after.markdownDocumentText || '')
    if (!activeText.includes(`[Seedance source media](${href})`)) {
      throw new Error(`expected active markdown link label to be renamed, got ${activeText}`)
    }
    if (!activeText.includes(`[Seedance source media](${href})\n\n[Seedance source media](${href})`)) {
      throw new Error(`expected active markdown same-href link labels to sync to renamed media name, got ${activeText}`)
    }
    const sourceFiles = after.sourceFiles || []
    const activeSource = sourceFiles.find(file => file.id === 'active-media-source')
    const peerSource = sourceFiles.find(file => file.id === 'storyboard-media-peer')
    if (!String(activeSource?.text || '').includes(`[Seedance source media](${href})\n\n[Seedance source media](${href})`)) {
      throw new Error(`expected active Source Files entry to sync media rename, got ${String(activeSource?.text || '')}`)
    }
    if (!String(peerSource?.text || '').includes(`[Seedance source media](${href})`)) {
      throw new Error(`expected peer Source Files entry to sync same-href media rename, got ${String(peerSource?.text || '')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    useGraphStore.getState().setSourceFiles([])
    restoreDom()
    restoreWindow()
  }
}

