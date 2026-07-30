import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import RichMediaPanel from '@/components/RichMediaPanel'
import { captureRichMediaPanelBoundaryEvent } from '@/components/captureRichMediaPanelBoundaryEvent'
import type { GraphData } from '@/lib/graph/types'
import {
  RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID,
  resolveRichMediaTextOutputVersionSelection,
} from '@/lib/render/richMediaOutputVersions'

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const ensureRangeRect = (dom: ReturnType<typeof initJsdomHarness>['dom']) => {
  try {
    const proto = (dom.window as unknown as { Range?: { prototype?: Record<string, unknown> } }).Range?.prototype as unknown as {
      getBoundingClientRect?: () => DOMRect
    } | null
    if (proto && typeof proto.getBoundingClientRect !== 'function') {
      proto.getBoundingClientRect = () => {
        return {
          x: 0, y: 0, top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10, toJSON: () => ({}),
        } as unknown as DOMRect
      }
    }
  } catch {
    void 0
  }
}

const findButtonByExactText = (rootEl: HTMLElement, label: string): HTMLButtonElement | null => {
  const buttons = Array.from(rootEl.querySelectorAll('button'))
  for (const btn of buttons) {
    const text = (btn.textContent || '').trim()
    if (text === label) return btn as HTMLButtonElement
  }
  return null
}

export async function testInlineEditToolbarMoreMenuIncludesCentralizedSelectionActions() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  ensureRangeRect(dom)
  const doc = dom.window.document
  const container = doc.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container as unknown as HTMLElement)

  try {
    const graphData: GraphData = {
      type: 'Graph',
      nodes: [
        {
          id: 'n1',
          type: 'Paragraph',
          label: 'Hello',
          properties: {},
          metadata: { documentPath: 'docs/example.md', lineStart: 1, lineEnd: 1 },
        },
      ],
      edges: [],
      metadata: {},
    }
    const store = useGraphStore.getState()
    store.setGraphData(graphData as never)
    store.selectNode(null)
    store.selectEdge(null)

    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: 'Hello world',
        activeDocumentPath: 'docs/example.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
        onReplaceLineRange: () => {},
      } as never),
    )

    await tick(6)

    const host = doc.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host for start line 1')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 1 }))
    await tick(6)

    const editor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected inline editor after click')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 5)
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection')
    sel.removeAllRanges()
    sel.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 1 }))
    await tick(6)

    const selectionActionsBubble = doc.querySelector('button[aria-label="Selection actions"]')
    if (selectionActionsBubble) throw new Error('did not expect separate Selection actions bubble while inline edit enabled')

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected inline selection toolbar')

    const moreSummary = toolbar.querySelector('button[aria-label="More"]') as HTMLElement | null
    if (!moreSummary) throw new Error('expected More trigger in inline toolbar')
    moreSummary.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(2)

    const showOnCanvas = findButtonByExactText(doc.body, 'Show on Canvas')
    if (!showOnCanvas) throw new Error('expected Show on Canvas inside inline toolbar More menu')
    if (findButtonByExactText(doc.body, 'Show in Editor')) {
      throw new Error('did not expect an unwired Show in Editor action')
    }
    if (!findButtonByExactText(doc.body, 'Link: Inline URL (default)')) {
      throw new Error('expected legacy link-display actions to be consolidated into More')
    }
    if (!findButtonByExactText(doc.body, 'Link: Horizontal Card')) {
      throw new Error('expected horizontal-card link display action inside More')
    }
    showOnCanvas.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(2)

    const selectedNodeId = useGraphStore.getState().selectedNodeId
    if (selectedNodeId !== 'n1') throw new Error(`expected selectedNodeId to be n1, got ${String(selectedNodeId)}`)
  } finally {
    try { root.unmount() } catch { void 0 }
    restore()
  }
}

export async function testVersionedRichMediaWorkspaceViewerReusesInlineSelectionToolbar() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  ensureRangeRect(dom)
  const doc = dom.window.document
  const container = doc.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container as unknown as HTMLElement)
  let canvasBoundaryClickCount = 0
  const probeTreeMarkdown = [
    '---',
    'schema: "knowgrph-rich-media-text/v1"',
    'title: "Probe-Tree Branches"',
    'media_kind: "text"',
    'content_type: "text/markdown"',
    'source_contract: "knowgrph-probe-tree/v0.1"',
    '---',
    '',
    '# Probe-Tree Branches',
    '',
    '`source=n1 · contract=probe-tree-llm-response/v5`',
    '',
    '1. **Which missing variable changes the decision?**',
    '   1. Product margin',
    '   2. Landed cost',
  ].join('\n')

  try {
    root.render(
      React.createElement(
        'section',
        { onClick: () => { canvasBoundaryClickCount += 1 } },
        React.createElement(RichMediaPanel, {
          overlayId: 'probe-tree-branches',
          title: 'Probe-Tree Branches',
          url: '',
          kind: 'iframe',
          interactive: false,
          onClick: captureRichMediaPanelBoundaryEvent,
          onDoubleClick: captureRichMediaPanelBoundaryEvent,
          panel: {
            activeTab: 'text',
            freezeConnectedOutput: true,
            markdownWorkspaceViewerSurface: true,
            hasText: true,
            hasImage: false,
            hasVideo: false,
            hasAudio: false,
            hasPoi: false,
            text: probeTreeMarkdown,
            connectedText: '',
            outputVersions: [
              {
                id: 'probe-tree-run-1',
                createdAt: '2026-07-23T00:00:00.000Z',
                output: 'Earlier Probe-Tree output',
              },
              {
                id: 'probe-tree-run-2',
                createdAt: '2026-07-23T00:01:00.000Z',
                output: probeTreeMarkdown,
              },
            ],
            selectedOutputVersionId: 'probe-tree-run-2',
          },
          onPanelChange: () => {},
        }),
      ),
    )
    await tick(10)

    const richMediaEditSurface = doc.querySelector('[data-kg-rich-media-inline-edit="1"]')
    if (!richMediaEditSurface) {
      throw new Error(`expected versioned Rich Media output to expose the shared Viewer edit surface, html=${container.innerHTML}`)
    }
    const richMediaScrollSurface = richMediaEditSurface.querySelector('[data-kg-rich-media-card-text-scroll="1"]') as HTMLElement | null
    if (!richMediaScrollSurface) throw new Error('expected Rich Media Viewer scroll surface')
    richMediaScrollSurface.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    await tick(2)
    if (canvasBoundaryClickCount !== 0) {
      throw new Error('expected Rich Media bubble boundary to stop clicks before the parent Canvas owner')
    }
    const host = richMediaEditSurface.querySelector('h1[data-start-line="9"]') as HTMLElement | null
    if (!host) throw new Error(`expected versioned Rich Media Viewer markdown host, html=${container.innerHTML}`)
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 1 }))
    await tick(6)

    const editor = richMediaEditSurface.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error(`expected versioned Rich Media Viewer to enter shared inline editing, html=${container.innerHTML}`)
    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected Rich Media Viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 9)
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected Rich Media Viewer selection')
    selection.removeAllRanges()
    selection.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 1 }))
    await tick(6)

    const toolbars = doc.querySelectorAll('[data-kg-inline-selection-toolbar="1"]')
    if (toolbars.length !== 1) {
      throw new Error(`expected one canonical inline-selection toolbar in Rich Media Viewer, got ${toolbars.length}`)
    }
    if (doc.querySelector('[aria-label="Selection actions"]')) {
      throw new Error('did not expect a stale Selection actions variant in Rich Media Viewer')
    }
    const draftSelection = resolveRichMediaTextOutputVersionSelection({
      properties: {
        outputVersions: [
          { id: 'probe-tree-run-1', createdAt: '', output: 'Earlier Probe-Tree output' },
          { id: 'probe-tree-run-2', createdAt: '', output: 'Versioned toolbar text' },
        ],
        selectedOutputVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID,
      },
      fallbackOutput: '**Versioned** toolbar text',
    })
    if (
      draftSelection.selectedVersionId !== RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID
      || draftSelection.selectedOutput !== '**Versioned** toolbar text'
      || draftSelection.versions.length !== 2
    ) {
      throw new Error(`expected Rich Media toolbar edits to resolve as a draft without deleting generated versions, got ${JSON.stringify(draftSelection)}`)
    }
  } finally {
    try { root.unmount() } catch { void 0 }
    restore()
  }
}

export function testInlineSelectionToolbarHasOneSourceOwnerAndSharedSurfaces() {
  const root = process.cwd()
  const sourceRoot = path.resolve(root, 'src')
  const canonicalPath = path.resolve(sourceRoot, 'lib/markdown-core/ui/MarkdownInlineSelectionToolbar.tsx')
  const legacyPaths = [
    path.resolve(sourceRoot, 'features/markdown/ui/MarkdownSelectionToolbar.tsx'),
    path.resolve(sourceRoot, 'features/markdown/ui/markdownFloatingSelectionToolbar.ts'),
    path.resolve(sourceRoot, 'lib/markdown-core/ui/markdownBlockContainerCore.bubbleToolbarOverlay.tsx'),
  ]
  if (!fs.existsSync(canonicalPath)) throw new Error('expected canonical MarkdownInlineSelectionToolbar source owner')
  for (const legacyPath of legacyPaths) {
    if (fs.existsSync(legacyPath)) throw new Error(`expected legacy selection-toolbar source to be removed: ${legacyPath}`)
  }

  const sourceFiles: string[] = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'tests') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolute)
        continue
      }
      if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) continue
      sourceFiles.push(absolute)
    }
  }
  visit(sourceRoot)
  const toolbarOwners = sourceFiles.filter(file => fs.readFileSync(file, 'utf8').includes('aria-label="Inline selection toolbar"'))
  if (toolbarOwners.length !== 1 || toolbarOwners[0] !== canonicalPath) {
    throw new Error(`expected exactly one inline-selection toolbar source owner, got ${JSON.stringify(toolbarOwners)}`)
  }
  const staleSelectionActions = sourceFiles.filter(file => fs.readFileSync(file, 'utf8').includes('aria-label="Selection actions"'))
  if (staleSelectionActions.length) {
    throw new Error(`expected stale Selection actions variants to be removed, got ${JSON.stringify(staleSelectionActions)}`)
  }

  const editSurface = fs.readFileSync(path.resolve(sourceRoot, 'lib/markdown-core/ui/markdownBlockContainerCore.editSurfaceView.tsx'), 'utf8')
  if (!editSurface.includes("import { MarkdownInlineSelectionToolbar } from './MarkdownInlineSelectionToolbar'")) {
    throw new Error('expected the shared edit surface to render the canonical inline-selection toolbar')
  }
  const richMediaViewer = fs.readFileSync(path.resolve(sourceRoot, 'components/RichMediaPanelWorkspaceViewerSurface.tsx'), 'utf8')
  const workspaceViewer = fs.readFileSync(path.resolve(sourceRoot, 'features/markdown-workspace/main/viewer/MarkdownWorkspaceViewerSurface.tsx'), 'utf8')
  const markdownPreview = fs.readFileSync(path.resolve(sourceRoot, 'features/markdown/ui/MarkdownPreview.tsx'), 'utf8')
  const flowCanvasMediaOverlays = fs.readFileSync(path.resolve(sourceRoot, 'components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  const richMediaShell = fs.readFileSync(path.resolve(sourceRoot, 'components/RichMediaPanelShell.tsx'), 'utf8')
  const richMediaTypes = fs.readFileSync(path.resolve(sourceRoot, 'components/RichMediaPanel.types.ts'), 'utf8')
  if (
    !richMediaViewer.includes('<MarkdownWorkspaceViewerSurface')
    || !workspaceViewer.includes('<MarkdownPreview')
    || !richMediaViewer.includes('onInlineDraftTextChange=')
    || !richMediaViewer.includes('onReplaceLineRange=')
    || !markdownPreview.includes('<MarkdownInlineSelectionActionsContext.Provider')
  ) {
    throw new Error('expected Editor Workspace Viewer and Rich Media Panel to reuse the canonical inline-edit selection toolbar path')
  }
  if (
    !flowCanvasMediaOverlays.includes('onClick={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}')
    || !flowCanvasMediaOverlays.includes('onDoubleClick={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}')
    || flowCanvasMediaOverlays.includes('onClickCapture={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}')
    || flowCanvasMediaOverlays.includes('onDoubleClickCapture={mediaOverlayInteractionPolicy.capturePanelEvents ? stopEvent : undefined}')
    || !richMediaShell.includes('onClick={props.onClick}')
    || !richMediaShell.includes('onDoubleClick={props.onDoubleClick}')
    || !richMediaTypes.includes('onClick?: React.MouseEventHandler<HTMLElement>')
    || !richMediaTypes.includes('onDoubleClick?: React.MouseEventHandler<HTMLElement>')
  ) {
    throw new Error('expected Canvas Rich Media boundaries to run after canonical Viewer inline-edit handlers instead of suppressing them in capture')
  }
}
