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
import { buildMarkdown, setInputValue } from './previewPanelMediaSupport'
export async function testCommandMenuMediaLayoutSelectorTogglesGridAndList() {
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
    state.setGraphData({ type: 'Graph', nodes: [], edges: [] })
    state.setMarkdownDocument('doc.md', buildMarkdown())
    state.setMarkdownPreviewMermaidFocus(null)
    state.setMarkdownPreviewActiveMediaKey(null)

    await mountReactRoot(root, React.createElement(CommandMenuCatalogPanel), { window: dom.window, frames: 8 })

    const panel = doc.querySelector('[data-kg-media-panel="1"]') as HTMLElement | null
    if (!panel) throw new Error('expected FloatingPanel Media root')
    if (panel.getAttribute('data-kg-floating-panel-catalog-list') !== 'media') {
      throw new Error('expected FloatingPanel Media to reuse the shared catalog list root')
    }
    if (panel.getAttribute('data-kg-media-layout') !== 'grid') {
      throw new Error(`expected Media layout to default to grid, got ${String(panel.getAttribute('data-kg-media-layout'))}`)
    }
    const mediaHeader = doc.querySelector('[data-kg-media-catalog-header="1"]') as HTMLElement | null
    if (!mediaHeader || mediaHeader.getAttribute('data-kg-floating-panel-catalog-header-fixed') !== '1' || !mediaHeader.className.includes('shrink-0') || mediaHeader.className.includes('sticky')) {
      throw new Error('expected Media header to reuse the fixed FloatingPanel catalog header')
    }
    const mediaBody = doc.querySelector('[data-kg-floating-panel-catalog-body="media"]') as HTMLElement | null
    if (!mediaBody || !mediaBody.className.includes('overflow-auto')) {
      throw new Error('expected Media body to own scrolling below the fixed header')
    }
    if (!doc.querySelector('[data-kg-media-layout-selector="1"]')) throw new Error('expected Media layout selector')
    const newMediaButton = doc.querySelector('[data-kg-media-new-button="1"]') as HTMLButtonElement | null
    if (!(newMediaButton instanceof dom.window.HTMLButtonElement) || newMediaButton.getAttribute('aria-label') !== 'New Media') {
      throw new Error('expected Media header to expose the New Media opener')
    }
    const searchButton = doc.querySelector('[data-kg-media-search-toggle="1"]') as HTMLButtonElement | null
    if (!(searchButton instanceof dom.window.HTMLButtonElement) || searchButton.getAttribute('aria-label') !== 'Search media') {
      throw new Error('expected Media header to replace the @ badge with a Search button')
    }
    if (searchButton.textContent?.trim()) {
      throw new Error('expected Media search toggle to render as icon-only')
    }
    const searchAffordance = doc.querySelector('[data-kg-media-search-affordance="1"]') as HTMLElement | null
    if (!searchAffordance || searchAffordance.getAttribute('data-kg-media-search-overlay-anchor') !== '1') {
      throw new Error('expected Media search affordance to own overlay expansion')
    }
    if (doc.querySelector('[data-kg-media-search-panel]')) {
      throw new Error('expected Media search panel to stay collapsed before hover or click')
    }
    if (!doc.querySelector('[data-kg-media-grid="1"]')) throw new Error('expected Media grid surface')
    if (!doc.querySelector('article[data-kg-command-menu-media-candidate]')) throw new Error('expected media candidates to render as semantic grid articles')
    if (!doc.querySelector('[data-kg-media-grid="1"] [data-kg-media-draggable="1"]')) {
      throw new Error('expected Media grid candidates to expose draggable shared media payload handles')
    }
    await act(async () => {
      searchAffordance.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, relatedTarget: doc.body }))
      await waitForNextFrame(dom.window)
    })
    if (doc.querySelector('[data-kg-media-search-panel]')) {
      throw new Error('expected Media search overlay to ignore hover and wait for click')
    }
    await act(async () => {
      searchButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const searchInput = doc.querySelector('[data-kg-media-search-input="1"]') as HTMLInputElement | null
    if (!(searchInput instanceof dom.window.HTMLInputElement) || searchInput.getAttribute('placeholder') !== 'Search media') {
      throw new Error('expected Search button to expand the media search input')
    }
    const searchPanel = doc.querySelector('[data-kg-media-search-panel="overlay"]') as HTMLElement | null
    if (
      !searchPanel
      || searchPanel.getAttribute('data-kg-media-search-overlay') !== '1'
      || searchPanel.getAttribute('data-kg-media-search-expand-direction') !== 'down'
      || searchPanel.closest('[data-kg-media-search-affordance="1"]') !== searchAffordance
      || !searchPanel.closest('header')
    ) {
      throw new Error('expected Search button to expand the media search input as a down overlay from the header')
    }
    await act(async () => {
      setInputValue(dom.window, searchInput, 'Generate Media')
      await waitForFrames(dom.window, 3)
    })
    const searchedRows = Array.from(doc.querySelectorAll('[data-kg-media-grid="1"] article')) as HTMLElement[]
    if (searchedRows.length === 0 || !searchedRows.every(row => /generate media/i.test(row.textContent || ''))) {
      throw new Error(`expected media search to filter visible grid rows, got ${searchedRows.length} rows`)
    }
    const clearSearchButton = doc.querySelector('[data-kg-media-search-clear="1"]') as HTMLButtonElement | null
    if (!(clearSearchButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected media search clear button')
    await act(async () => {
      clearSearchButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })
    const gridActions = Array.from(doc.querySelectorAll('[data-kg-media-grid="1"] > article[data-kg-command-menu-media-action]')) as HTMLElement[]
    if (!gridActions[0]?.matches('[data-kg-command-menu-media-action="upload-media"]') || !/Upload Media/.test(gridActions[0]?.textContent || '')) {
      throw new Error('expected Upload Media to be the first New Media grid action')
    }
    if (!gridActions[1]?.matches('[data-kg-command-menu-media-action="import-media-url"]') || !/Import URL/.test(gridActions[1]?.textContent || '')) {
      throw new Error('expected Import URL to be the second New Media grid action')
    }
    if (!gridActions[2]?.matches('[data-kg-command-menu-media-action="generate-media"]') || !/Generate Media/.test(gridActions[2]?.textContent || '')) {
      throw new Error('expected Generate Media to be the third New Media grid action')
    }
    if (
      !gridActions.some(row => row.matches('[data-kg-command-menu-media-action="insert-image"]')) ||
      !gridActions.some(row => row.matches('[data-kg-command-menu-media-action="insert-audio"]')) ||
      !gridActions.some(row => row.matches('[data-kg-command-menu-media-action="insert-video"]'))
    ) {
      throw new Error('expected Media grid actions to keep image, audio, and video insertion actions')
    }
    if (gridActions.some(row => String(row.getAttribute('data-kg-command-menu-media-action') || '').startsWith('agentic-os-'))) {
      throw new Error('expected Media grid actions to move non-media Agentic OS / # @ entries into Skills & Commands')
    }

    const listButton = doc.querySelector('[data-kg-media-layout-toggle="list"]') as HTMLButtonElement | null
    const cardButton = doc.querySelector('[data-kg-media-layout-toggle="card"]') as HTMLButtonElement | null
    const gridButton = doc.querySelector('[data-kg-media-layout-toggle="grid"]') as HTMLButtonElement | null
    if (!listButton || !cardButton || !gridButton) throw new Error('expected list, card, and grid layout buttons')
    if (
      listButton.getAttribute('aria-label') !== 'List layout' ||
      cardButton.getAttribute('aria-label') !== 'Card layout' ||
      gridButton.getAttribute('aria-label') !== 'Grid layout'
    ) {
      throw new Error('expected Media layout selector to expose List layout, Card layout, and Grid layout labels')
    }

    await act(async () => {
      cardButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    if (panel.getAttribute('data-kg-media-layout') !== 'card') {
      throw new Error(`expected Media layout to switch to card, got ${String(panel.getAttribute('data-kg-media-layout'))}`)
    }
    if (!doc.querySelector('[data-kg-media-card-layout="3-rows"]')) throw new Error('expected Media card layout to expose the renamed 3-row marker')
    const cardRows = Array.from(doc.querySelectorAll('[data-kg-media-list-row-layout="3-rows"]')) as HTMLElement[]
    if (cardRows.length === 0) throw new Error('expected media candidates to render as semantic 3-row card items')
    if (!doc.querySelector('[data-kg-media-list="1"] [data-kg-media-draggable="1"]')) {
      throw new Error('expected Media card candidates to expose draggable shared media payload handles')
    }
    const cardActionRows = Array.from(doc.querySelectorAll('[data-kg-media-card-rows="3"] > article[data-kg-command-menu-media-action]')) as HTMLElement[]
    if (!cardActionRows[0]?.matches('[data-kg-command-menu-media-action="upload-media"]') || !/Upload Media/.test(cardActionRows[0]?.textContent || '')) {
      throw new Error('expected Upload Media to be the first New Media card action')
    }
    if (!cardActionRows[1]?.matches('[data-kg-command-menu-media-action="import-media-url"]') || !/Import URL/.test(cardActionRows[1]?.textContent || '')) {
      throw new Error('expected Import URL to be the second New Media card action')
    }
    if (!cardActionRows[2]?.matches('[data-kg-command-menu-media-action="generate-media"]') || !/Generate Media/.test(cardActionRows[2]?.textContent || '')) {
      throw new Error('expected Generate Media to be the third New Media card action')
    }
    if (
      !cardActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-image"]')) ||
      !cardActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-audio"]')) ||
      !cardActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-video"]'))
    ) {
      throw new Error('expected Media card actions to keep image, audio, and video insertion actions')
    }
    if (cardActionRows.some(row => String(row.getAttribute('data-kg-command-menu-media-action') || '').startsWith('agentic-os-'))) {
      throw new Error('expected Media card actions to move non-media Agentic OS / # @ entries into Skills & Commands')
    }
    const rowSectionCounts = cardRows.map(row => row.querySelectorAll('[data-kg-media-list-row-section]').length)
    if (rowSectionCounts.some(count => count !== 3)) {
      throw new Error(`expected every media card item to expose exactly 3 rows, got ${JSON.stringify(rowSectionCounts)}`)
    }

    await act(async () => {
      listButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    if (panel.getAttribute('data-kg-media-layout') !== 'list') {
      throw new Error(`expected Media layout to switch to compact list, got ${String(panel.getAttribute('data-kg-media-layout'))}`)
    }
    if (doc.querySelector('[data-kg-media-ktv-layout="1"]')) throw new Error('expected list layout to avoid legacy KTV three-column surface')
    if (doc.querySelector('[data-kg-media-list="1"] [role="columnheader"]')) throw new Error('expected media list layout to avoid column headers')
    if (!doc.querySelector('[data-kg-media-list-layout="compact-list"]')) throw new Error('expected Media list layout to expose the shared compact-list marker')
    if (!doc.querySelector('[data-kg-media-list-view="1"][data-kg-floating-panel-catalog-list-rows="compact-list"][data-kg-media-list-rows="compact-list"]')) {
      throw new Error('expected Media list wrapper to reuse the Skills & Commands compact-list catalog contract')
    }
    const compactRows = Array.from(doc.querySelectorAll('[data-kg-media-list-row-layout="compact-list"]')) as HTMLElement[]
    if (compactRows.length === 0) throw new Error('expected media candidates to render as compact list-view rows')
    const firstCompactRow = compactRows[0]
    if (
      !firstCompactRow.className.includes('grid-cols-[1.75rem_minmax(0,1fr)_auto]') ||
      !firstCompactRow.className.includes('shadow-sm') ||
      !firstCompactRow.className.includes('rounded')
    ) {
      throw new Error('expected Media compact rows to reuse the Skills & Commands compact catalog row shell')
    }
    if (!doc.querySelector('[data-kg-media-list-view="1"] [data-kg-media-draggable="1"]')) {
      throw new Error('expected compact list candidates to expose draggable shared media payload handles')
    }
    const compactActionRows = Array.from(doc.querySelectorAll('[data-kg-media-list-view="1"] > article[data-kg-command-menu-media-action]')) as HTMLElement[]
    if (!compactActionRows[0]?.matches('[data-kg-command-menu-media-action="upload-media"]') || !/Upload Media/.test(compactActionRows[0]?.textContent || '')) {
      throw new Error('expected Upload Media to be the first New Media compact list action')
    }
    if (!compactActionRows[1]?.matches('[data-kg-command-menu-media-action="import-media-url"]') || !/Import URL/.test(compactActionRows[1]?.textContent || '')) {
      throw new Error('expected Import URL to be the second New Media compact list action')
    }
    if (!compactActionRows[2]?.matches('[data-kg-command-menu-media-action="generate-media"]') || !/Generate Media/.test(compactActionRows[2]?.textContent || '')) {
      throw new Error('expected Generate Media to be the third New Media compact list action')
    }
    if (
      !compactActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-image"]')) ||
      !compactActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-audio"]')) ||
      !compactActionRows.some(row => row.matches('[data-kg-command-menu-media-action="insert-video"]'))
    ) {
      throw new Error('expected Media compact list actions to keep image, audio, and video insertion actions')
    }
    if (compactActionRows.some(row => String(row.getAttribute('data-kg-command-menu-media-action') || '').startsWith('agentic-os-'))) {
      throw new Error('expected Media compact list actions to move non-media Agentic OS / # @ entries into Skills & Commands')
    }

    await act(async () => {
      gridButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextFrame(dom.window)
    })

    if (panel.getAttribute('data-kg-media-layout') !== 'grid') {
      throw new Error(`expected Media layout to switch back to grid, got ${String(panel.getAttribute('data-kg-media-layout'))}`)
    }
    if (storage.getItem('kg.media.catalog.layout') !== 'grid') {
      throw new Error(`expected Media layout preference to persist, got ${String(storage.getItem('kg.media.catalog.layout'))}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
    restoreWindow()
  }
}

