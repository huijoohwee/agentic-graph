import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import RichMediaPanel from '@/components/RichMediaPanel'
import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildRichMediaPanelOverlayState } from '@/lib/render/richMediaPanelState'
import { writeMediaDragPayload, type MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import {
  UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES,
  UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME,
} from '@/lib/ui/surfaceClasses'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames, waitForNextFrame, waitForTasks } from '@/tests/lib/reactRootHarness'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'

const queryRichMediaTextEditor = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('[contenteditable="true"][data-kg-card-inline-viewer-edit-surface="1"][aria-label="Rich Media Panel text"]')

const resetRichMediaPanelTestStoreState = () => {
  const state = useGraphStore.getState()
  try { state.setWorkspaceViewMode('canvas') } catch { void 0 }
  try { state.setWorkspaceCanvasPaneOpen(false) } catch { void 0 }
  try { state.setRichMediaPanelMode('snapshot') } catch { void 0 }
  try { state.setInfiniteCanvasInteractionMode('static') } catch { void 0 }
}

const createMediaDataTransfer = (payload: MediaDragPayload): DataTransfer => {
  const values = new Map<string, string>()
  const transfer = {
    dropEffect: '',
    effectAllowed: '',
    get types() {
      return Array.from(values.keys())
    },
    clearData: (type?: string) => {
      if (type) values.delete(type)
      else values.clear()
    },
    getData: (type: string) => values.get(type) || '',
    setData: (type: string, value: string) => {
      values.set(type, value)
    },
  } as unknown as DataTransfer
  writeMediaDragPayload(transfer, payload)
  return transfer
}

const dispatchMediaDrop = (win: Window, target: EventTarget, payload: MediaDragPayload) => {
  const EventCtor = (win as unknown as { Event: typeof Event }).Event
  const event = new EventCtor('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { configurable: true, value: createMediaDataTransfer(payload) })
  Object.defineProperty(event, 'clientX', { configurable: true, value: 12 })
  Object.defineProperty(event, 'clientY', { configurable: true, value: 12 })
  target.dispatchEvent(event)
}

const dispatchPanelPointerEvent = (
  target: EventTarget,
  win: Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  args: { pointerId?: number; clientX?: number; clientY?: number; button?: number; buttons?: number } = {},
) => {
  type MouseEventConstructorLike = new (eventType: string, eventInitDict?: Record<string, unknown>) => Event
  const MouseEventCtor = (win as unknown as { MouseEvent: MouseEventConstructorLike }).MouseEvent
  const event = new MouseEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: args.button ?? 0,
    buttons: args.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: args.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: 'mouse' })
  target.dispatchEvent(event)
}

export async function testRichMediaPanelTextModeAddTextReusesMediaDropZone() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const dropped: MediaDragPayload[] = []

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        overlayId: 'rich-media-panel-add-text',
        title: 'Rich Media Panel',
        url: '',
        kind: 'iframe',
        interactive: false,
        panel: {
          activeTab: 'text',
          freezeConnectedOutput: false,
          hasText: false,
          hasImage: false,
          hasVideo: false,
          hasAudio: false,
          hasPoi: false,
          text: '',
          connectedText: '',
        },
        onPanelChange: () => void 0,
        onMediaDrop: payload => {
          dropped.push(payload)
        },
      }),
    { window: dom.window, frames: 20 })

    const dropZone = container.querySelector('[data-kg-rich-media-media-drop-zone="1"][data-kg-card-media-drop-zone="1"]') as HTMLElement | null
    if (!dropZone) throw new Error(`expected Rich Media Panel Add text surface to reuse the shared card media drop zone, html=${container.innerHTML}`)
    if (dropZone.getAttribute('data-kg-media-drop-consumes-canvas-drop') !== '1') {
      throw new Error('expected Rich Media Panel media drop zone to consume canvas-level media drops')
    }
    const editor = queryRichMediaTextEditor(container)
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!editor && !/Add text/.test(String(display?.textContent || ''))) {
      throw new Error(`expected Rich Media Panel Add text editor to remain available inside the media drop zone, html=${container.innerHTML}`)
    }

    const mediaPayload: MediaDragPayload = {
      kind: 'image',
      label: 'Storyboard source frame',
      url: 'https://example.com/storyboard-source-frame.png',
      thumbnailUrl: 'https://example.com/storyboard-source-frame-thumb.png',
      sourceKey: 'source-frame',
    }
    await act(async () => {
      dispatchMediaDrop(dom.window, dropZone, mediaPayload)
      await waitForFrames(dom.window, 2)
    })

    if (dropped.length !== 1 || dropped[0]?.url !== mediaPayload.url || dropped[0]?.kind !== 'image') {
      throw new Error(`expected Rich Media Panel Add text drop zone to forward the media payload, got ${JSON.stringify(dropped)}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelTextModeUsesMarkdownPreviewSsot() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Rich Media Panel',
        url: '',
        kind: 'iframe',
        interactive: false,
        forwardWheelTo: () => doc.body,
        panel: {
          activeTab: 'text',
          freezeConnectedOutput: false,
          hasText: true,
          hasImage: false,
          hasVideo: false,
          hasAudio: false,
          hasPoi: false,
          text: '',
          connectedText: [
            '---',
            'schema: "knowgrph-rich-media-text/v1"',
            'title: "Rich Media Panel"',
            'media_kind: "text"',
            'content_type: "text/markdown"',
            'source_contract: "test/v1"',
            '---',
            '',
            '# Hello',
            '',
            '> Storyboard quote stays structured.',
            '',
            '```ts',
            'const value = 42',
            '```',
            '',
            '```mermaid',
            'flowchart LR',
            '  A[Text surface] --> B[Mermaid surface]',
            '```',
            '',
            'Inline link [Open reference](https://example.com/reference) stays visible.',
            '',
            'Inline math $x+y$ stays visible.',
            '',
            '| ID | Criterion |',
            '| --- | --- |',
            '| C1 | Data freshness |',
            '',
            '![preview](https://example.com/preview.png)',
            '',
            '![](https://example.com/demo.mp4)',
            '',
          ].join('\n'),
        },
      }),
    { window: dom.window, frames: 28 })

    const textFrame = container.querySelector('[data-kg-rich-media-card-text-frame="1"]') as HTMLElement | null
    const textScroll = container.querySelector('[data-kg-rich-media-card-text-scroll="1"]') as HTMLElement | null
    if (!textFrame || !textScroll) throw new Error('expected RichMediaPanel text mode to mount the shared Card text frame and scroll surface')
    const textScrollClassName = String(textScroll.getAttribute('class') || '')
    if (!textScrollClassName.includes('overflow-y-auto') || !textScrollClassName.includes('overflow-x-hidden') || textScrollClassName.includes('bg-[color:var(--kg-code-bg)]')) {
      throw new Error(`expected RichMediaPanel text surface to reuse the neutral vertical-only Card scroll surface, class=${textScrollClassName}`)
    }
    const nestedTextSurface = textScroll.querySelector('[data-kg-card-inline-edit="1"]') as HTMLElement | null
    if (!nestedTextSurface || nestedTextSurface.className.includes('overflow-auto')) {
      throw new Error(`expected the shared Card frame to own scrolling without a nested Rich Media overflow variant, html=${container.innerHTML}`)
    }
    textScroll.style.overflowY = 'auto'
    textScroll.style.overflowX = 'hidden'
    Object.defineProperty(textScroll, 'scrollHeight', { configurable: true, value: 420 })
    Object.defineProperty(textScroll, 'clientHeight', { configurable: true, value: 120 })
    let forwardedWheelCount = 0
    doc.body.addEventListener('wheel', event => {
      if ((event as unknown as Record<string, unknown>).__kgForwarded === true) forwardedWheelCount += 1
    })
    const scrollWheel = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 48 })
    nestedTextSurface.dispatchEvent(scrollWheel)
    if (scrollWheel.defaultPrevented || forwardedWheelCount !== 0) {
      throw new Error(`expected normal Rich Media text wheel input to remain available for local Card scrolling, prevented=${scrollWheel.defaultPrevented} forwarded=${forwardedWheelCount}`)
    }
    if (textFrame.style.overscrollBehaviorY !== 'contain' || textFrame.style.overscrollBehaviorX !== 'none' || textFrame.style.touchAction !== 'pan-y') {
      throw new Error(`expected RichMediaPanel text frame to allow vertical scrolling only, y=${textFrame.style.overscrollBehaviorY} x=${textFrame.style.overscrollBehaviorX} touch=${textFrame.style.touchAction}`)
    }
    if (textFrame.style.pointerEvents !== 'auto') {
      throw new Error(`expected RichMediaPanel text surface to remain scroll-targetable while canvas wheel forwarding exists, pointerEvents=${textFrame.style.pointerEvents}`)
    }
    const cardMarkdownPreview = container.querySelector('[data-kg-card-markdown-preview="1"]')
    if (!cardMarkdownPreview) throw new Error('expected RichMediaPanel text mode to reuse the shared CardMarkdownPreview surface')
    await act(async () => {
      for (let attempt = 0; attempt < 8 && !container.querySelector('[data-kg-card-markdown-viewer="1"]'); attempt += 1) {
        await waitForTasks(2)
        await waitForFrames(dom.window, 2)
      }
    })
    const cardMarkdownViewer = container.querySelector('[data-kg-card-markdown-viewer="1"]')
    if (!cardMarkdownViewer) throw new Error(`expected RichMediaPanel text mode to use the chrome-free Card markdown viewer, html=${container.innerHTML}`)
    if (container.querySelector('[data-kg-rich-media-embedded-preview="1"], iframe')) {
      throw new Error(`expected frontmatter Markdown text to stay on the shared Viewer surface instead of the HTML srcdoc iframe path, html=${container.innerHTML}`)
    }
    const cardMarkdownViewerClassName = String((cardMarkdownViewer as HTMLElement).getAttribute('class') || '')
    if (cardMarkdownViewerClassName.includes('overflow-auto')) {
      throw new Error(`expected outer RichMediaPanel text surface to own scrolling instead of nested Card markdown viewer, class=${cardMarkdownViewerClassName}`)
    }
    if (container.querySelector('[aria-label="Markdown sidebar"]')) throw new Error('expected Card markdown preview to omit document Explorer/Outline chrome')
    if (container.querySelector('[aria-label="Code block actions"]')) throw new Error('expected Card markdown preview to omit document code-block toolbar chrome')
    if (container.querySelector('script[data-kg-markdown-source="1"]')) throw new Error('expected Card markdown preview to avoid embedding hidden source payload text')
    const article = cardMarkdownPreview.querySelector('article')
    if (!article || !String(article.getAttribute('class') || '').includes('w-full')) {
      throw new Error(`expected Card markdown preview content to span the Card width, html=${container.innerHTML}`)
    }
    const heading = Array.from(container.querySelectorAll('h1,h2,h3') as NodeListOf<HTMLElement>).find(el => (el.textContent || '').trim() === 'Hello')
    if (!heading) throw new Error('expected markdown heading to render through RichMediaPanel text mode')
    const blockquote = container.querySelector('blockquote')
    if (!blockquote || !/Storyboard quote stays structured/i.test(blockquote.textContent || '')) {
      throw new Error(`expected card markdown preview to render blockquote syntax, html=${container.innerHTML}`)
    }
    const code = container.querySelector('pre code')
    if (!code || !/const value = 42/i.test(code.textContent || '')) {
      throw new Error(`expected card markdown preview to render fenced code syntax, html=${container.innerHTML}`)
    }
    const codeFigure = code.closest('figure') as HTMLElement | null
    const codeFigureClassName = String(codeFigure?.getAttribute('class') || '')
    if (/\brounded\b|\bborder\b|\bshadow-sm\b/.test(codeFigureClassName)) {
      throw new Error(`expected Card markdown code frame to avoid nested rounded border shadow chrome, class=${codeFigureClassName}`)
    }
    if (!codeFigureClassName.includes('overflow-y-auto') || !codeFigureClassName.includes('overflow-x-hidden')) {
      throw new Error(`expected Card markdown code frame to use vertical-only scrolling, class=${codeFigureClassName}`)
    }
    const link = Array.from(container.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).find(anchor =>
      String(anchor.getAttribute('href') || '').includes('https://example.com/reference'),
    )
    if (!link) throw new Error('expected card markdown preview to render markdown link syntax')
    if (!/x\+y|x\s*\+\s*y/.test(container.textContent || '')) {
      throw new Error(`expected card markdown preview to preserve inline math syntax, text=${JSON.stringify(container.textContent || '')}`)
    }
    const table = article.querySelector('table')
    if (!table || !/Data freshness/i.test(table.textContent || '')) {
      throw new Error(`expected Card markdown preview to render markdown tables as a full-width plain table, html=${container.innerHTML}`)
    }
    if (container.querySelector('[aria-label="Markdown data view"]')) {
      throw new Error('expected Card markdown preview to avoid document-level data-view table conversion')
    }
    const cardDownloadLink = cardMarkdownPreview.querySelector('a[download][aria-label="Download media"]')
    if (cardDownloadLink) {
      throw new Error(`expected Card markdown preview to move media download affordance out of inline @ thumbnail pills, html=${container.innerHTML}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testProbeTreeRichMediaPanelReusesEditorWorkspaceViewerSurface() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    resetRichMediaPanelTestStoreState()
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const fixturePath = resolveRepoTestDataPath('probe-tree-rich-media-edit-parity.md')
    const probeTreeMarkdown = readFileSync(fixturePath, 'utf8')
    const panelState = buildRichMediaPanelOverlayState({
      node: {
        id: 'probe-tree-ledger',
        type: 'RichMediaPanel',
        label: 'Probe-Tree Branches',
        properties: {
          probeTreeThreadLedger: true,
          output: probeTreeMarkdown,
        },
      },
    })
    if (panelState?.markdownWorkspaceViewerSurface !== true) {
      throw new Error(`expected existing Probe-Tree ledgers to resolve the Workspace Viewer surface, got ${JSON.stringify(panelState)}`)
    }

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Probe-Tree Branches',
        url: '',
        kind: 'iframe',
        interactive: false,
        panel: panelState,
        onPanelChange: () => void 0,
      }),
      { window: dom.window, frames: 28 },
    )

    const workspaceViewer = container.querySelector('[data-kg-rich-media-workspace-viewer="1"][aria-label="Editor Workspace Viewer"]')
    if (!workspaceViewer) {
      throw new Error(`expected Probe-Tree Rich Media output to mount the Editor Workspace Viewer surface, html=${container.innerHTML}`)
    }
    if (!workspaceViewer.querySelector('[data-testid="markdown-preview-root"]')) {
      throw new Error(`expected the shared Workspace Viewer to own Probe-Tree markdown rendering, html=${container.innerHTML}`)
    }
    if (workspaceViewer.getAttribute('data-kg-view-edit-surface-area') !== UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES['data-kg-view-edit-surface-area']) {
      throw new Error(`expected the Rich Media Workspace Viewer to expose the shared view/edit surface contract, html=${container.innerHTML}`)
    }
    if (!UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME.split(/\s+/).includes('flex-col') || !workspaceViewer.classList.contains('flex-col')) {
      throw new Error(`expected the shared Workspace Viewer surface to stack its preview vertically so narrow panes do not preserve the preview's intrinsic width, html=${container.innerHTML}`)
    }
    const workspaceScrollFrame = workspaceViewer.closest('[data-kg-rich-media-card-text-scroll="1"]')
    if (!workspaceScrollFrame?.classList.contains('flex')
      || !workspaceScrollFrame.classList.contains('min-h-0')
      || !workspaceScrollFrame.classList.contains('flex-1')
      || !workspaceScrollFrame.classList.contains('overflow-hidden')) {
      throw new Error(`expected the Probe-Tree Viewer frame to constrain the Viewer preview so its internal markdown scroller remains reachable, html=${container.innerHTML}`)
    }
    if (workspaceViewer.querySelector('[data-kg-card-inline-edit="1"], [data-kg-card-markdown-viewer="1"]')) {
      throw new Error('expected Probe-Tree output to avoid the compact Card markdown read/edit renderer')
    }
    const workspaceMainSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx'), 'utf8')
    const richMediaViewerSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'RichMediaPanelWorkspaceViewerSurface.tsx'), 'utf8')
    const sharedViewerImport = "from './viewer/MarkdownWorkspaceViewerSurface'"
    const sharedRichMediaViewerImport = "import('@/features/markdown-workspace/main/viewer/MarkdownWorkspaceViewerSurface')"
    if (!workspaceMainSource.includes(sharedViewerImport) || !richMediaViewerSource.includes(sharedRichMediaViewerImport)) {
      throw new Error('expected Editor Workspace Viewer and Rich Media Panel to render through one shared Workspace Viewer surface owner')
    }
    if (workspaceMainSource.includes('<MarkdownPreview') || richMediaViewerSource.includes('<MarkdownPreview')) {
      throw new Error('expected shared Workspace Viewer consumers not to retain parallel MarkdownPreview surface configurations')
    }

    const question = Array.from(workspaceViewer.querySelectorAll('p[data-start-line]') as NodeListOf<HTMLElement>)
      .find(element => /For SGD800预算/.test(String(element.textContent || '')))
    if (!question || !question.querySelector('strong')) {
      throw new Error(`expected the Probe-Tree question to render with Viewer emphasis, html=${workspaceViewer.innerHTML}`)
    }
    question.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 42,
      width: 400,
      height: 42,
      toJSON: () => ({}),
    } as unknown as DOMRect)
    await act(async () => {
      question.dispatchEvent(new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 8,
        clientY: 8,
      }))
      await waitForTasks(2)
      await waitForFrames(dom.window, 2)
    })

    const nestedEditor = question.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (
      !nestedEditor
      || !nestedEditor.querySelector('strong')
      || nestedEditor.innerHTML.includes('**')
      || /^\s*1[.)]\s/.test(String(nestedEditor.textContent || ''))
    ) {
      throw new Error(`expected Rich Media to open the marker-free rendered Viewer editor, html=${question.innerHTML}`)
    }
    if (workspaceViewer.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')) {
      throw new Error('expected Rich Media block editing not to fall back to the legacy whole-card editor')
    }
    const workspaceText = String(workspaceViewer.textContent || '')
    if (!workspaceText.includes('优先批发库存以实现规模效应') || !workspaceText.includes('Evidence regarding成本结构')) {
      throw new Error(`expected nested Probe-Tree content to remain rendered while editing the question, text=${JSON.stringify(workspaceText)}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelPresentationMarkdownUsesNativeDeckSurface() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    await import('@/features/markdown/ui/MarkdownPreview')
    resetRichMediaPanelTestStoreState()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const node = {
      id: 'deliverables-slide-deck',
      type: 'RichMediaPanel',
      label: 'Slide Deck',
      properties: {
        output: '# Investment case\n\nSource-grounded thesis.\n\n---\n\n# Risks\n\nExplicit downside risks.',
        richMediaActiveTab: 'text',
        markdownPresentationMode: true,
        freezeConnectedOutput: true,
      },
    }
    const mediaSpec = getNodeMediaSpec(node)
    const panel = buildRichMediaPanelOverlayState({ node })
    if (!mediaSpec || !panel) throw new Error('expected generated Slide Deck Rich Media projection')

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        overlayId: node.id,
        title: node.label,
        url: mediaSpec.url,
        kind: mediaSpec.kind,
        srcDoc: mediaSpec.srcDoc,
        interactive: mediaSpec.interactive,
        panel,
      }),
    { window: dom.window, frames: 20 })
    await act(async () => {
      for (let attempt = 0; attempt < 8 && !container.querySelector('[data-testid="markdown-presentation-root"]'); attempt += 1) {
        await waitForTasks(2)
        await waitForFrames(dom.window, 2)
      }
    })

    if (!container.querySelector('[data-kg-rich-media-markdown-preview="1"]')) {
      throw new Error(`expected Slide Deck to reuse the Rich Media Markdown surface, html=${container.innerHTML}`)
    }
    if (!container.querySelector('[data-testid="markdown-presentation-root"]')) {
      throw new Error(`expected Slide Deck to reuse the native Markdown presentation renderer, html=${container.innerHTML}`)
    }
    if (container.querySelector('iframe')) {
      throw new Error(`expected presentation Markdown to avoid the generic iframe path, html=${container.innerHTML}`)
    }
    if (!/Investment case/.test(container.textContent || '')) {
      throw new Error(`expected the active Markdown slide to remain visible, text=${JSON.stringify(container.textContent || '')}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}

export async function testRichMediaPanelTextModeInlineEditUsesStoryboardCardSsot() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const state = useGraphStore.getState()
  const previousRenderer = state.canvas2dRenderer
  const previousRenderMode = state.canvasRenderMode
  try {
    resetRichMediaPanelTestStoreState()
    try {
      state.setCanvasRenderMode('2d')
      state.setCanvas2dRenderer('storyboard')
    } catch {
      void 0
    }
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    await mountReactRoot(root,
      React.createElement(RichMediaPanel, {
        title: 'Rich Media Panel',
        url: '',
        kind: 'iframe',
        interactive: false,
        panel: {
          activeTab: 'text',
          freezeConnectedOutput: false,
          hasText: true,
          hasImage: false,
          hasVideo: false,
          hasAudio: false,
          hasPoi: false,
          text: '',
          connectedText: 'Connected panel text',
        },
        onPanelChange: () => void 0,
      }),
    { window: dom.window, frames: 8 })

    const inlineSurface = container.querySelector('[data-kg-rich-media-inline-edit="1"]')
    if (!inlineSurface) throw new Error('expected RichMediaPanel text mode to expose a shared inline edit surface')
    const display = inlineSurface.querySelector('[data-kg-card-inline-edit-activation="click"]')
    if (!(display instanceof dom.window.HTMLElement)) {
      throw new Error('expected RichMediaPanel inline text surface to reuse CardInlineTextEditor click activation')
    }

    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })

    const editor = queryRichMediaTextEditor(container)
    if (!(editor instanceof dom.window.HTMLElement)) {
      throw new Error(`expected click activation to open the shared multiline Viewer edit surface, html=${container.innerHTML}`)
    }
    if (editor.textContent !== 'Connected panel text') {
      throw new Error(`expected inline editor to open with connected panel text, got ${JSON.stringify(editor.textContent)}`)
    }
    if (container.querySelector('button[title="Slash commands"],button[title="Variable commands"],button[title="Keyword commands"]')) {
      throw new Error('expected RichMediaPanel text mode to match Card edit chrome without a duplicate embedded command-launcher row')
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    try {
      state.setCanvasRenderMode(previousRenderMode)
      state.setCanvas2dRenderer(previousRenderer)
    } catch {
      void 0
    }
    restoreDom()
  }
}

export async function testRichMediaPanelReadAndEditableTextReuseOneCardSurface() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    resetRichMediaPanelTestStoreState()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const panel = {
      activeTab: 'text' as const,
      freezeConnectedOutput: false,
      hasText: true,
      hasImage: false,
      hasVideo: false,
      hasAudio: false,
      hasPoi: false,
      text: '',
      connectedText: 'Shared **Card** surface',
    }
    const renderPanel = (editable: boolean) => React.createElement(RichMediaPanel, {
      overlayId: 'rich-media-shared-text-surface',
      title: 'Rich Media Panel',
      url: '',
      kind: 'iframe' as const,
      interactive: false,
      panel,
      onPanelChange: editable ? () => void 0 : undefined,
    })

    await mountReactRoot(root, renderPanel(false), { window: dom.window, frames: 12 })
    const readFrame = container.querySelector('[data-kg-rich-media-card-text-frame="1"]')
    const readSurface = readFrame?.querySelector('[data-kg-card-inline-edit="1"]') as HTMLElement | null
    if (!readFrame || !readSurface || readFrame.hasAttribute('data-kg-rich-media-inline-edit')) {
      throw new Error(`expected read-only Rich Media text to use the shared Card display surface, html=${container.innerHTML}`)
    }
    const readClassName = readSurface.className

    await mountReactRoot(root, renderPanel(true), { window: dom.window, frames: 4 })
    const editFrame = container.querySelector('[data-kg-rich-media-card-text-frame="1"]')
    const editableDisplay = editFrame?.querySelector('[data-kg-card-inline-edit="1"]') as HTMLElement | null
    if (!editFrame || !editableDisplay || editFrame.getAttribute('data-kg-rich-media-inline-edit') !== '1') {
      throw new Error(`expected editable Rich Media text to retain the same Card display surface, html=${container.innerHTML}`)
    }
    if (container.querySelectorAll('[data-kg-rich-media-card-text-frame="1"]').length !== 1) {
      throw new Error('expected Rich Media text view/edit state to render one frame variant')
    }
    if (readClassName.replace(/\s*cursor-text\b/g, '') !== editableDisplay.className.replace(/\s*cursor-text\b/g, '')) {
      throw new Error(`expected Rich Media read/edit display chrome to differ only by edit cursor state, read=${readClassName} edit=${editableDisplay.className}`)
    }

    await act(async () => {
      editableDisplay.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForNextFrame(dom.window)
    })
    const editor = queryRichMediaTextEditor(container)
    if (!editor) {
      throw new Error(`expected the shared Card display surface to open the shared Viewer edit surface, html=${container.innerHTML}`)
    }
    if (editor.getAttribute('data-kg-card-inline-chip-density') !== 'compact' || !editor.className.includes('text-[10px]') || !editor.className.includes('text-[color:var(--kg-text-secondary)]')) {
      throw new Error(`expected Rich Media editing to reuse compact Card summary density and typography, html=${container.innerHTML}`)
    }

    await unmountReactRoot(root, { window: dom.window })
  } finally {
    restoreDom()
  }
}
