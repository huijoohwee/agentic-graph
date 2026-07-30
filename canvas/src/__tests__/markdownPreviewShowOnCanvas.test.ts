import React from 'react'
import { createRoot } from 'react-dom/client'
import { useGraphStore } from '@/hooks/useGraphStore'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { buildMarkdownTokensKey, lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import type { GraphData } from '@/lib/graph/types'
import {
  collectTextSelectionMatchHighlightRects,
  readSelectionMatchQuery,
} from '@/lib/ui/textSelectionMatchHighlights'

export async function testMarkdownPreviewShowOnCanvasSelectsExpectedNode() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      getSelection?: () => Selection | null
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document

    const graphData: GraphData = {
      type: 'Graph',
      nodes: [
        {
          id: 'n1',
          type: 'Paragraph',
          label: 'First',
          properties: {},
          metadata: {
            documentPath: 'docs/example.md',
            lineStart: 5,
            lineEnd: 7,
          },
        },
        {
          id: 'n2',
          type: 'Paragraph',
          label: 'Second',
          properties: {},
          metadata: {
            documentPath: 'docs/example.md',
            lineStart: 20,
            lineEnd: 22,
          },
        },
      ],
      edges: [],
      metadata: {},
    }

    const state = useGraphStore.getState()
    state.setGraphData(graphData as never)
    state.selectNode(null)
    state.selectEdge(null)

    const markdownLines = [
      '# Title',
      '',
      'intro',
      '',
      'first para line 1',
      'first para line 2',
      'first para line 3',
      '',
      'other content',
      '',
      'second para line 1',
      'second para line 2',
      'second para line 3',
    ]
    const markdownText = markdownLines.join('\n')

    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: 'docs/example.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
      } as never),
      { window: dom.window as unknown as Window, frames: 1, tasks: 1 },
    )

    const tick = (label: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 750) as unknown as number
        const raf = anyWindow.requestAnimationFrame
        if (typeof raf === 'function') {
          raf(() => {
            clearTimeout(timer)
            resolve()
          })
          return
        }
        setTimeout(() => {
          clearTimeout(timer)
          resolve()
        }, 0)
      })
    const rootEl = doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    if (!rootEl) {
      throw new Error('markdown preview root not found')
    }

    const targetBlock = rootEl.querySelector('[data-start-line="5"]') as HTMLElement | null
    if (!targetBlock) {
      throw new Error('block with data-start-line=5 not found')
    }

    const showOnCanvasEvent = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    })
    await React.act(async () => {
      targetBlock.dispatchEvent(showOnCanvasEvent)
      await tick('meta-click-show-on-canvas')
    })

    const selectedNodeId = useGraphStore.getState().selectedNodeId
    const selectedEdgeId = useGraphStore.getState().selectedEdgeId
    if (selectedNodeId !== 'n1') {
      throw new Error(
        `expected selectedNodeId to be "n1" after Show on Canvas, got ${String(selectedNodeId)} (edge=${String(selectedEdgeId)})`,
      )
    }

  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownPreviewUsesNativeContextMenuWithoutLegacySelectionBubble() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      getSelection?: () => Selection | null
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document

    const markdownLines = [
      '# Title',
      '',
      'intro',
      '',
      'first para line 1',
      'first para line 2',
      'first para line 3',
    ]
    const markdownText = markdownLines.join('\n')

    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: 'docs/example.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
      } as never),
      { window: dom.window as unknown as Window, frames: 1, tasks: 1 },
    )

    const tick = (label: string) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 750) as unknown as number
        const raf = anyWindow.requestAnimationFrame
        if (typeof raf === 'function') {
          raf(() => {
            clearTimeout(timer)
            resolve()
          })
          return
        }
        setTimeout(() => {
          clearTimeout(timer)
          resolve()
        }, 0)
      })
    const rootEl = doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    if (!rootEl) {
      throw new Error('markdown preview root not found')
    }

    const targetBlock = rootEl.querySelector('[data-start-line="5"]') as HTMLElement | null
    if (!targetBlock) {
      throw new Error('block with data-start-line=5 not found')
    }

    const contextMenuEvent = new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    })
    let dispatched = false
    await React.act(async () => {
      dispatched = targetBlock.dispatchEvent(contextMenuEvent)
      await tick('contextmenu')
    })
    if (!dispatched || contextMenuEvent.defaultPrevented) {
      throw new Error('expected Markdown Viewer to preserve the native context menu')
    }
    if (rootEl.querySelector('[aria-label="Selection actions"]')) {
      throw new Error('did not expect the deleted legacy Selection actions bubble')
    }

  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownPreviewTokenCacheDoesNotCrossDocumentPath() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const markdownA = ['# A', '', 'alpha'].join('\n')
    const markdownB = ['# B', '', 'beta'].join('\n')

    const { tokens: tokensA, meta: metaA, startLineOffset: startLineOffsetA } = lexMarkdown(markdownA)
    if (!tokensA || tokensA.length === 0) throw new Error('expected tokens for markdownA')

    const keyB = buildMarkdownTokensKey(markdownB)
    useGraphStore.getState().setMarkdownTokens({
      tokens: tokensA,
      path: 'docA.md',
      key: keyB,
      meta: metaA,
      startLineOffset: startLineOffsetA,
    })

    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText: markdownB,
        activeDocumentPath: 'docB.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
      } as never),
      { window: dom.window as unknown as Window, frames: 1, tasks: 1 },
    )

    const rootEl = doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    if (!rootEl) throw new Error('markdown preview root not found')

    const text = String(rootEl.textContent || '')
    if (!text.includes('B')) {
      throw new Error(`expected markdownB content to render, got: ${text.slice(0, 80)}`)
    }
    if (text.includes('A')) {
      throw new Error(`expected markdownA token cache not to be used, got: ${text.slice(0, 80)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownPreviewViewModeSwitchDoesNotCrossDocumentPath() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText: ['# A', '', 'alpha'].join('\n'),
        activeDocumentPath: 'docA.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
        viewMode: 'viewer',
      } as never),
      { window: dom.window as unknown as Window, frames: 1, tasks: 1 },
    )

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText: ['# B', '', 'beta'].join('\n'),
        activeDocumentPath: 'docB.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: true,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
        viewMode: 'presentation',
      } as never),
      { window: dom.window as unknown as Window, frames: 1, tasks: 1 },
    )

    const rootEl =
      (doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null) ||
      (doc.querySelector('[data-testid="markdown-preview"]') as HTMLElement | null) ||
      (container as unknown as HTMLElement)
    const text = String(rootEl.textContent || '')
    if (!text.includes('B')) {
      throw new Error(`expected B content after view switch, got: ${text.slice(0, 80)}`)
    }
    if (text.includes('A')) {
      throw new Error(`expected A content not to persist after view switch, got: ${text.slice(0, 80)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownPreviewSelectionHighlightsOtherSameText() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    anyWindow.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    ;(globalThis as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }).requestAnimationFrame = anyWindow.requestAnimationFrame
    ;(globalThis as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }).cancelAnimationFrame = anyWindow.cancelAnimationFrame

    const doc = dom.window.document
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    } as unknown as DOMRect)
    const rangeProto = dom.window.Range.prototype as unknown as {
      getClientRects?: (this: Range) => DOMRectList
      getBoundingClientRect?: (this: Range) => DOMRect
    }
    rangeProto.getClientRects = function getClientRects(this: Range) {
      const node = this.startContainer
      if (!node || node.nodeType !== dom.window.Node.TEXT_NODE) return [] as unknown as DOMRectList
      const parent = (node as Text).parentElement
      const host = parent?.closest('[data-start-line]') as HTMLElement | null
      const line = Number(host?.getAttribute('data-start-line') || '1')
      const width = Math.max(4, Math.abs(this.endOffset - this.startOffset) * 7)
      return [rect(this.startOffset * 7, line * 14, width, 12)] as unknown as DOMRectList
    }
    rangeProto.getBoundingClientRect = function getBoundingClientRect(this: Range) {
      const rects = Array.from(this.getClientRects?.() || [])
      return rects[0] || rect(0, 0, 0, 0)
    }

    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText: ['# Selection match', '', 'alpha beta alpha beta', '', '`beta` beta'].join('\n'),
        activeDocumentPath: 'docs/selection-match.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
      } as never),
      { window: dom.window as unknown as Window, frames: 2, tasks: 2 },
    )

    const rootEl = doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    if (!rootEl) throw new Error('markdown preview root not found')
    rootEl.getBoundingClientRect = () => rect(0, 0, 900, 600)

    const paragraph = rootEl.querySelector('[data-start-line="3"]') as HTMLElement | null
    if (!paragraph) throw new Error('expected paragraph host for selectable text')
    const walker = doc.createTreeWalker(paragraph, dom.window.NodeFilter.SHOW_TEXT)
    let textNode: Text | null = null
    let current = walker.nextNode()
    while (current) {
      const text = String(current.textContent || '')
      if (text.includes('beta')) {
        textNode = current as Text
        break
      }
      current = walker.nextNode()
    }
    if (!textNode) throw new Error('expected selectable beta text node')
    const offset = String(textNode.textContent || '').indexOf('beta')
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    const range = doc.createRange()
    range.setStart(textNode, offset)
    range.setEnd(textNode, offset + 'beta'.length)
    selection.removeAllRanges()
    selection.addRange(range)

    await React.act(async () => {
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      paragraph.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })

    const highlights = Array.from(rootEl.querySelectorAll('[data-kg-selection-match-highlight="true"]'))
    if (highlights.length !== 3) {
      throw new Error(`expected three peer beta highlights and no highlight for the selected range, got ${highlights.length}`)
    }
    const firstHighlight = highlights[0] as HTMLElement | undefined
    if (!firstHighlight) throw new Error('expected a selection-match highlight element')
    if (!String(firstHighlight.className || '').includes('kg-semantic-highlight-selection-match')) {
      throw new Error(`expected selection-match highlight to use shared semantic class, got ${String(firstHighlight.className || '')}`)
    }
    if (firstHighlight.getAttribute('data-kg-semantic-highlight-surface') !== 'selection-match') {
      throw new Error('expected selection-match highlight to carry the shared semantic surface marker')
    }
    const styleAttr = firstHighlight.getAttribute('style') || ''
    if (!styleAttr.includes('border-top-left-radius') || !styleAttr.includes('transform')) {
      throw new Error(`expected organic lower-band highlight style, got ${styleAttr}`)
    }
    if (/border(?:-color)?\s*:/.test(styleAttr)) {
      throw new Error(`expected selection-match highlight to avoid boxed borders, got ${styleAttr}`)
    }

    await React.act(async () => {
      selection.removeAllRanges()
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })

    const clearedHighlights = Array.from(rootEl.querySelectorAll('[data-kg-selection-match-highlight="true"]'))
    if (clearedHighlights.length !== 0) {
      throw new Error(`expected selection-match highlights to clear with the native selection, got ${clearedHighlights.length}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownPreviewSelectionHighlightsOtherSameSentence() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    } as unknown as DOMRect)
    const rangeProto = dom.window.Range.prototype as unknown as {
      getClientRects?: (this: Range) => DOMRectList
      getBoundingClientRect?: (this: Range) => DOMRect
    }
    rangeProto.getClientRects = function getClientRects(this: Range) {
      const parent = this.startContainer.nodeType === dom.window.Node.TEXT_NODE
        ? (this.startContainer as Text).parentElement
        : null
      const row = Number(parent?.getAttribute('data-row') || '1')
      const width = Math.max(4, Math.abs(this.endOffset - this.startOffset) * 7)
      return [rect(8, row * 16, width, 12)] as unknown as DOMRectList
    }
    rangeProto.getBoundingClientRect = function getBoundingClientRect(this: Range) {
      const rects = Array.from(this.getClientRects?.() || [])
      return rects[0] || rect(0, 0, 0, 0)
    }

    const rootEl = doc.createElement('section')
    rootEl.setAttribute('data-testid', 'markdown-preview-root')
    rootEl.innerHTML = [
      '<p data-row="1">Semantic highlight follows a complete sentence.</p>',
      '<p data-row="2">Semantic highlight follows a complete\nsentence.</p>',
      '<p data-row="3">Semantic highlight follows a    complete sentence.</p>',
    ].join('')
    rootEl.getBoundingClientRect = () => rect(0, 0, 900, 600)
    doc.body.appendChild(rootEl)

    const first = rootEl.querySelector('[data-row="1"]')?.firstChild as Text | null
    if (!first) throw new Error('expected first sentence text node')
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    const range = doc.createRange()
    range.setStart(first, 0)
    range.setEnd(first, String(first.textContent || '').length)
    selection.removeAllRanges()
    selection.addRange(range)

    const query = readSelectionMatchQuery(rootEl, selection)
    if (!query) throw new Error('expected normalized sentence selection query')
    if (query.text !== 'Semantic highlight follows a complete sentence.') {
      throw new Error(`expected normalized sentence query, got ${JSON.stringify(query.text)}`)
    }

    const highlights = collectTextSelectionMatchHighlightRects({ root: rootEl, query })
    if (highlights.length !== 2) {
      throw new Error(`expected two peer sentence highlights with normalized whitespace, got ${highlights.length}`)
    }
    if (highlights.some(highlight => highlight.top <= 16)) {
      throw new Error(`expected sentence highlights to exclude the selected source range, got ${JSON.stringify(highlights)}`)
    }
  } finally {
    restoreDom()
  }
}

export async function testMarkdownPreviewSentenceDragSelectionSurvivesPeerHighlightRender() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    anyWindow.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
    ;(globalThis as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }).requestAnimationFrame = anyWindow.requestAnimationFrame
    ;(globalThis as unknown as {
      requestAnimationFrame?: (cb: (ts: number) => void) => number
      cancelAnimationFrame?: (id: number) => void
    }).cancelAnimationFrame = anyWindow.cancelAnimationFrame

    const doc = dom.window.document
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    } as unknown as DOMRect)
    const rangeProto = dom.window.Range.prototype as unknown as {
      getClientRects?: (this: Range) => DOMRectList
      getBoundingClientRect?: (this: Range) => DOMRect
    }
    rangeProto.getClientRects = function getClientRects(this: Range) {
      const node = this.startContainer
      if (!node || node.nodeType !== dom.window.Node.TEXT_NODE) return [] as unknown as DOMRectList
      const parent = (node as Text).parentElement
      const host = parent?.closest('[data-start-line]') as HTMLElement | null
      const line = Number(host?.getAttribute('data-start-line') || '1')
      const width = Math.max(4, Math.abs(this.endOffset - this.startOffset) * 7)
      return [rect(this.startOffset * 7, line * 14, width, 12)] as unknown as DOMRectList
    }
    rangeProto.getBoundingClientRect = function getBoundingClientRect(this: Range) {
      const rects = Array.from(this.getClientRects?.() || [])
      return rects[0] || rect(0, 0, 0, 0)
    }

    const sentence = 'Semantic highlight follows a complete sentence.'
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(MarkdownPreview, {
        markdownText: ['# Selection match', '', `${sentence} ${sentence}`].join('\n'),
        activeDocumentPath: 'docs/selection-match-sentence.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
      } as never),
      { window: dom.window as unknown as Window, frames: 2, tasks: 2 },
    )

    const rootEl = doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    if (!rootEl) throw new Error('markdown preview root not found')
    rootEl.getBoundingClientRect = () => rect(0, 0, 900, 600)
    const paragraph = rootEl.querySelector('[data-start-line="3"]') as HTMLElement | null
    if (!paragraph) throw new Error('expected paragraph host for selectable sentence')

    const walker = doc.createTreeWalker(paragraph, dom.window.NodeFilter.SHOW_TEXT)
    let textNode: Text | null = null
    let current = walker.nextNode()
    while (current) {
      const text = String(current.textContent || '')
      if (text.includes(sentence)) {
        textNode = current as Text
        break
      }
      current = walker.nextNode()
    }
    if (!textNode) throw new Error('expected selectable sentence text node')
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, sentence.length)

    await React.act(async () => {
      paragraph.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })

    const duringDragHighlights = Array.from(rootEl.querySelectorAll('[data-kg-selection-match-highlight="true"]'))
    if (duringDragHighlights.length !== 0) {
      throw new Error(`expected peer highlights to wait until mouseup, got ${duringDragHighlights.length}`)
    }
    if (selection.toString() !== sentence) {
      throw new Error(`expected native sentence selection during drag, got ${JSON.stringify(selection.toString())}`)
    }

    await React.act(async () => {
      paragraph.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })

    const highlights = Array.from(rootEl.querySelectorAll('[data-kg-selection-match-highlight="true"]'))
    if (highlights.length <= 0) {
      throw new Error('expected peer sentence highlight after committed mouse selection')
    }
    if (selection.toString() !== sentence) {
      throw new Error(`expected native sentence selection to survive highlight render, got ${JSON.stringify(selection.toString())}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window, tasks: 1 })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
