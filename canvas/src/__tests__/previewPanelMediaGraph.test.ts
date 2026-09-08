import { createGraphMutationTransitionClock } from '@/tests/lib/resetCanvasTestRuntime'
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
import { buildGraphWithMediaNode, buildGraphWithConflictingSeedanceAndRichMediaPanelNodes, buildGraphWithRichMediaPanelTextPreview, readCommandMenuMediaRowName, setInputValue } from './previewPanelMediaSupport'
export async function testCommandMenuGraphMediaSelectionSelectsPreviewMedia() {
  const transition = createGraphMutationTransitionClock()
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const state = useGraphStore.getState()
    try {
      state.setFrontmatterModeEnabled(false)
    } catch {
      void 0
    }
    const graph = buildGraphWithMediaNode()
    state.setGraphData(graph)
    state.setMarkdownDocument('doc.md', '')
    state.setWorkspaceViewMode('canvas')
    state.selectNode(null)
    state.setSelectionSource(null)
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)
    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })
    const rows = Array.from(doc.querySelectorAll('[data-kg-command-menu-media-source="graph"]')) as HTMLElement[]
    const graphCard = rows.find(row => readCommandMenuMediaRowName(row).includes('Node media:'))
    if (!graphCard) {
      throw new Error('graph media Command Menu row not found')
    }
    await act(async () => {
      graphCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const after = useGraphStore.getState()
    if (after.selectedNodeId !== 'n1') {
      throw new Error(`expected selectedNodeId to be "n1", got ${String(after.selectedNodeId)}`)
    }
    if (after.selectionSource !== 'toolbar') {
      throw new Error(`expected selectionSource "toolbar", got ${String(after.selectionSource)}`)
    }
    const expectedKey = 'graph-node-media:n1:image:https://example.com/example.png'
    if (after.markdownPreviewActiveMediaKey !== expectedKey) {
      throw new Error(
        `expected markdownPreviewActiveMediaKey "${expectedKey}", got ${String(
          after.markdownPreviewActiveMediaKey,
        )}`,
      )
    }
    transition.expectBlockedThenAdvance(() => {
      useGraphStore.getState().updateNode('n1', { label: 'blocked rename' })
    })
    const renameButton = graphCard.querySelector('[data-kg-command-menu-media-rename]') as HTMLButtonElement | null
    if (!renameButton) throw new Error('expected graph media row to expose explicit rename control')
    await act(async () => {
      renameButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    const nameInput = graphCard.querySelector('[data-kg-command-menu-media-name-input]') as HTMLInputElement | null
    if (!nameInput) throw new Error('expected graph media row to expose inline name edit input')
    await act(async () => {
      setInputValue(dom.window, nameInput, 'Renamed graph media')
      nameInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const renamedNode = useGraphStore.getState().graphData?.nodes?.find(node => node.id === 'n1')
    if (renamedNode?.label !== 'Renamed graph media') {
      throw new Error(`expected graph media inline rename to update node label, got ${String(renamedNode?.label || '')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    transition.restore()
    restoreDom()
    restoreWindow()
  }
}


export async function testCommandMenuMediaInventoryDeduplicatesMarkdownAndGraphSameUrl() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const href = 'https://example.com/example.png'
    const markdown = [
      '# Media source',
      '',
      `![Seedance source](${href})`,
      '',
    ].join('\n')

    const state = useGraphStore.getState()
    state.setGraphData(buildGraphWithMediaNode())
    state.setSourceFiles([])
    state.setMarkdownDocument('workspace:/import-url-source.md', markdown)
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)

    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })

    const mediaRows = Array.from(doc.querySelectorAll('[data-kg-command-menu-media-candidate]')) as HTMLElement[]
    if (mediaRows.length !== 1) {
      const rowText = mediaRows.map(row => String(row.textContent || '').replace(/\s+/g, ' ').trim())
      throw new Error(`expected graph and markdown same-URL media to collapse to one row, got ${mediaRows.length}; rows=${JSON.stringify(rowText)}`)
    }
    const deduped = dedupeCommandMenuRichMediaItems([
      {
        key: 'markdown:image',
        kind: 'image',
        source: 'markdown',
        startLine: 3,
        label: 'Seedance source',
        src: href,
        openUrl: href,
      },
      {
        key: 'graph:image',
        kind: 'image',
        source: 'graph',
        startLine: 0,
        label: 'Node media: Example media node',
        src: href,
        openUrl: href,
        nodeId: 'n1',
      },
    ] satisfies CommandMenuRichMediaItem[])
    if (deduped.length !== 1 || deduped[0]?.source !== 'graph') {
      throw new Error(`expected shared media inventory dedupe to keep graph owner, got ${JSON.stringify(deduped.map(item => item.source))}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
    restoreWindow()
  }
}


export async function testPreviewPanelGraphMediaDeduplicatesBytePlusVideoWidgetToCanonicalRichMediaPanel() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const state = useGraphStore.getState()
    state.setGraphData(buildGraphWithConflictingSeedanceAndRichMediaPanelNodes())
    state.setMarkdownDocument('doc.md', '')
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)

    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })

    const graphCards = (Array.from(doc.querySelectorAll('[data-kg-command-menu-media-source="graph"]')) as HTMLElement[]).filter(row =>
      readCommandMenuMediaRowName(row).includes('Node media:'),
    )
    if (graphCards.length !== 1) {
      throw new Error(`expected one canonical graph media Command Menu row after dedupe, got ${graphCards.length}`)
    }
    const graphCardText = String(graphCards[0]?.textContent || '')
    if (!graphCardText.includes('Rich Media Panel')) {
      throw new Error(`expected canonical graph media row to keep Rich Media Panel version, got ${graphCardText || '<empty>'}`)
    }
    if (graphCardText.includes('Rich Media Panel for ')) {
      throw new Error(`expected graph media row title to stay on the single Rich Media Panel SSOT, got ${graphCardText}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
    restoreWindow()
  }
}


export function testPreviewPanelGraphMediaPreviewSkipsSemanticLabelSrc() {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalNow = Date.now
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost:5175' } }
  Date.now = () => 1_700_000_000_000
  try {
    const staleUrl = 'http://localhost:5173/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=stale'
    const item: CommandMenuRichMediaItem = {
      key: 'graph-node-media:strybldr-source:image:Strybldr starter source',
      kind: 'image',
      source: 'graph',
      startLine: 0,
      label: 'Node media: Strybldr Starter Source',
      panelTitle: 'Strybldr Starter Source',
      src: 'Strybldr starter source',
      openUrl: staleUrl,
      nodeId: 'strybldr-source',
    }
    const previewUrl = readRichMediaPreviewUrl(item)
    const insertUrl = readRichMediaInsertUrl(item)
    if (!previewUrl.startsWith('http://localhost:5175/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=')) {
      throw new Error(`expected graph node media preview to ignore semantic label src and use current runtime URL, got ${previewUrl}`)
    }
    if (previewUrl.includes('localhost:5173') || previewUrl.includes('agentic_os_media_token=stale')) {
      throw new Error(`expected graph node media preview to refresh stale local storage URL, got ${previewUrl}`)
    }
    if (insertUrl !== previewUrl) {
      throw new Error(`expected graph node media insert URL to share normalized preview URL, got ${insertUrl} vs ${previewUrl}`)
    }
  } finally {
    Date.now = originalNow
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}


export async function testPreviewPanelGraphRichMediaPanelTextPreviewUsesCanonicalPanelSurface() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage })

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const state = useGraphStore.getState()
    const expectedKey = 'graph-node-media:rich-media-text-panel:iframe:srcdoc'
    state.setGraphData(buildGraphWithRichMediaPanelTextPreview())
    state.setMarkdownDocument('doc.md', '')
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
    state.setMarkdownPreviewActiveMediaKey(expectedKey)

    await mountReactRoot(root, React.createElement(PreviewPanelView), { window: dom.window, frames: 8 })

    const after = useGraphStore.getState()
    if (after.markdownPreviewActiveMediaKey !== expectedKey) {
      throw new Error(`expected markdownPreviewActiveMediaKey "${expectedKey}", got ${String(after.markdownPreviewActiveMediaKey)}`)
    }
    const mediaPanel = doc.querySelector('[data-kg-rich-media-panel="1"][data-kg-rich-media-render-surface="1"]')
    if (!mediaPanel) throw new Error('expected the canonical RichMediaPanel render surface')
    const frame = mediaPanel.querySelector('[data-kg-rich-media-embedded-preview="1"] iframe')
    const authoredHtml = String(frame?.getAttribute('srcdoc') || '')
    if (!authoredHtml.includes('<h1>Inline preview</h1>') || !authoredHtml.includes('<p>Body copy.</p>')) {
      throw new Error('expected authored outputSrcDoc to survive canonical preview projection')
    }
    if (mediaPanel.querySelector('[data-kg-rich-media-markdown-preview="1"]')) {
      throw new Error('expected helper text not to cover authored outputSrcDoc')
    }
    const loadEmbedButton = (Array.from(doc.querySelectorAll('button')) as HTMLButtonElement[]).find(btn =>
      String(btn.textContent || '').toLowerCase().includes('load embed'),
    )
    if (loadEmbedButton) {
      throw new Error('expected graph-backed RichMediaPanel text preview to avoid the legacy explicit iframe load gate')
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
    restoreWindow()
  }
}
