import React from 'react'
import { createRoot } from 'react-dom/client'
import MainPanel from '@/features/panels/MainPanel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'

export async function testMainPanelTypographyUsesUiSettings() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setUiPanelTextFontClass('font-serif')
    api.setUiPanelKeyValueTextSizeClass('text-[15px]')
    api.setUiPanelMicroLabelTextSizeClass('text-[10px]')
    api.setUiPanelMonospaceTextClass('font-mono text-[13px]')
    api.setGraphData({
      nodes: [
        { id: 'n1', label: 'Node 1', type: 'Node', properties: {} },
        { id: 'n2', label: 'Node 2', type: 'Node', properties: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', label: 'Edge', type: 'Edge', properties: {} },
      ],
    } as never)
    api.setLastTraversalSummary({ mode: 'graphRag', edgeIds: ['e1'] } as never)

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(MainPanel, { requestedTab: 'help' } as never), {
      window: dom.window,
      frames: 4,
    })

    const traversal = container.querySelector('[aria-label="Graph Traversal"]')
    if (!traversal) throw new Error('expected main panel to render traversal summary chip')
    const chipClass = String(traversal.getAttribute('class') || '')
    if (!chipClass.includes('font-serif') || !chipClass.includes('text-xs')) {
      throw new Error(`expected traversal chip to use micro label typography, got ${JSON.stringify(chipClass)}`)
    }

    const spanEls = Array.from(container.querySelectorAll('span')) as HTMLSpanElement[]
    const edgeCount = spanEls.find(el => (el.textContent || '').includes('1 edge'))
    if (!edgeCount) throw new Error('expected traversal chip to include edge count')
    const edgeClass = String(edgeCount.getAttribute('class') || '')
    if (!edgeClass.includes('text-[13px]')) {
      throw new Error(`expected edge count to use monospace size class, got ${JSON.stringify(edgeClass)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedSettingsSearchUsesTabMetadata() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'settings',
        requestedSearchQuery: 'geo',
      } as never),
      { window: dom.window, frames: 4 },
    )

    const searchInput = container.querySelector('input')
    if (!(searchInput instanceof dom.window.HTMLInputElement)) {
      throw new Error('expected settings tab to render the search input')
    }
    if (searchInput.placeholder !== UI_COPY.searchSettingsPlaceholder) {
      throw new Error(`expected settings search placeholder, got ${JSON.stringify(searchInput.placeholder)}`)
    }
    if (searchInput.value !== 'geo') {
      throw new Error(`expected settings search query to be preserved, got ${JSON.stringify(searchInput.value)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMainPanelRequestedCommerceSearchUsesTabMetadata() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(MainPanel, {
        requestedTab: 'commerce',
        requestedSearchQuery: 'stripe',
      } as never),
      { window: dom.window, frames: 4 },
    )

    const searchInput = container.querySelector('input')
    if (!(searchInput instanceof dom.window.HTMLInputElement)) {
      throw new Error('expected commerce tab to render the search input')
    }
    if (searchInput.placeholder !== UI_COPY.searchSettingsPlaceholder) {
      throw new Error(`expected commerce search placeholder, got ${JSON.stringify(searchInput.placeholder)}`)
    }
    if (searchInput.value !== 'stripe') {
      throw new Error(`expected commerce search query to be preserved, got ${JSON.stringify(searchInput.value)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
