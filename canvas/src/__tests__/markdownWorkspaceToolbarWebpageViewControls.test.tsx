import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceToolbar } from '@/features/markdown-workspace/MarkdownWorkspaceToolbar'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { resolveMarkdownWorkspaceInitialPaneVisibility } from '@/features/markdown-workspace/main/types'
import type { MarkdownWorkspacePaneVisibility } from '@/features/markdown-workspace/main/types'
import { useInitialWorkspacePaneVisibility } from '@/features/markdown-workspace/main/useInitialWorkspacePaneVisibility'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { useGraphStore } from '@/hooks/useGraphStore'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const checkboxFor = (doc: Document, label: string): HTMLInputElement => {
  const labels = Array.from(doc.querySelectorAll('label')) as HTMLLabelElement[]
  const found = labels.find(l => String(l.textContent || '').replace(/\s+/g, ' ').trim() === label) || null
  if (!found) throw new Error(`expected ${label} checkbox to exist`)
  const input = found.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  if (!input) throw new Error(`expected ${label} checkbox input`)
  return input
}

export async function testMarkdownWorkspaceToolbarContentFormatUsesPaneChecks() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const formatCalls: Array<'markdown' | 'json'> = []

    function Harness() {
      const [layoutMode, setLayoutMode] = React.useState<'split' | 'editor' | 'viewer' | 'presentation'>('split')
      const [visibility, setVisibility] = React.useState<MarkdownWorkspacePaneVisibility>({
        json: false,
        markdown: true,
        viewer: false,
        html: false,
      })
      const [format, setFormat] = React.useState<'markdown' | 'json'>('markdown')

      return (
        <MarkdownWorkspaceToolbar
          explorerOpen={true}
          setExplorerOpen={() => {}}
          canvasOpen={false}
          setCanvasOpen={() => {}}
          layoutMode={layoutMode}
          setLayoutMode={setLayoutMode}
          markdownWordWrap={true}
          setMarkdownWordWrap={() => {}}
          markdownTextHighlight={false}
          setMarkdownTextHighlight={() => {}}
          splitPaneVisibility={visibility}
          setSplitPaneVisibility={setVisibility}
          onToggleFullscreen={() => {}}
          presentationApiRef={{ current: null }}
          contentFormat={format}
          onContentFormatChange={next => {
            formatCalls.push(next)
            setFormat(next)
          }}
        />
      )
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
      await tick()
    })

    if (dom.window.document.querySelector('[aria-label="YouTube transcript format"]')) {
      throw new Error('expected active document format controls to use the workspace pane checkboxes')
    }
    const jsonInput = checkboxFor(dom.window.document, 'JSON')
    const markdownInput = checkboxFor(dom.window.document, 'Markdown')
    if (jsonInput.checked) throw new Error('expected JSON pane to start closed')
    if (!markdownInput.checked) throw new Error('expected Markdown pane to start open')

    await act(async () => {
      jsonInput.click()
      await tick()
    })
    if (formatCalls[0] !== 'json') throw new Error(`expected JSON pane checkbox to switch content format, got ${JSON.stringify(formatCalls)}`)
    if (!jsonInput.checked) throw new Error('expected JSON pane to open from the consolidated checkbox')
    if (!markdownInput.checked) throw new Error('expected Markdown pane to remain open after JSON format switch')

    await act(async () => {
      markdownInput.click()
      await tick()
    })
    if (formatCalls[1] !== 'markdown') {
      throw new Error(`expected visible Markdown pane checkbox to switch content format without hiding, got ${JSON.stringify(formatCalls)}`)
    }
    if (!markdownInput.checked) throw new Error('expected Markdown pane to remain open when used as a format switch')

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    restore()
  }
}

export async function testMarkdownWorkspaceToolbarViewerToggleKeepsEditablePane() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function Harness() {
      const [layoutMode, setLayoutMode] = React.useState<'split' | 'editor' | 'viewer' | 'presentation'>('editor')
      const [visibility, setVisibility] = React.useState<MarkdownWorkspacePaneVisibility>({
        json: false,
        markdown: false,
        viewer: false,
        html: false,
      })

      return (
        <MarkdownWorkspaceToolbar
          explorerOpen={true}
          setExplorerOpen={() => {}}
          canvasOpen={false}
          setCanvasOpen={() => {}}
          layoutMode={layoutMode}
          setLayoutMode={setLayoutMode}
          markdownWordWrap={true}
          setMarkdownWordWrap={() => {}}
          markdownTextHighlight={false}
          setMarkdownTextHighlight={() => {}}
          splitPaneVisibility={visibility}
          setSplitPaneVisibility={setVisibility}
          onToggleFullscreen={() => {}}
          presentationApiRef={{ current: null }}
          contentFormat="markdown"
        />
      )
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
      await tick()
    })

    const viewerInput = checkboxFor(dom.window.document, 'Viewer')
    const markdownInput = checkboxFor(dom.window.document, 'Markdown')
    if (viewerInput.checked) {
      throw new Error('expected Viewer pane to start closed in the editability regression')
    }
    if (!markdownInput.checked) {
      throw new Error('expected forced editor-mode Markdown pane to report checked when it is visible')
    }

    await act(async () => {
      viewerInput.click()
      await tick()
    })

    if (!checkboxFor(dom.window.document, 'Viewer').checked) {
      throw new Error('expected Viewer checkbox to turn on from the mobile pane toggle')
    }
    if (!checkboxFor(dom.window.document, 'Markdown').checked) {
      throw new Error('expected Viewer toggle to keep an editable Markdown pane visible')
    }

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    restore()
  }
}

export async function testMarkdownWorkspaceToolbarRemovesMultiDimTableToggleAndViewerKeepsEditablePane() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function Harness() {
      const [layoutMode, setLayoutMode] = React.useState<'split' | 'editor' | 'viewer' | 'presentation'>('editor')
      const [visibility, setVisibility] = React.useState<MarkdownWorkspacePaneVisibility>({
        json: false,
        markdown: false,
        viewer: false,
        html: false,
      })

      return (
        <>
          <MarkdownWorkspaceToolbar
            explorerOpen={true}
            setExplorerOpen={() => {}}
            canvasOpen={false}
            setCanvasOpen={() => {}}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            markdownWordWrap={true}
            setMarkdownWordWrap={() => {}}
            markdownTextHighlight={false}
            setMarkdownTextHighlight={() => {}}
            splitPaneVisibility={visibility}
            setSplitPaneVisibility={setVisibility}
            onToggleFullscreen={() => {}}
            presentationApiRef={{ current: null }}
            contentFormat="markdown"
          />
          <output data-testid="layout-mode">{layoutMode}</output>
        </>
      )
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
      await tick()
    })

    const tableInput = dom.window.document.querySelector('input[aria-label="Show Multi-dimensional Table"]')
    const markdownInput = checkboxFor(dom.window.document, 'Markdown')
    const viewerInput = checkboxFor(dom.window.document, 'Viewer')
    if (tableInput) {
      throw new Error('expected the legacy Multi-dimensional Table pane toggle to be removed')
    }
    if (viewerInput.checked) {
      throw new Error('expected Viewer pane to start closed in the pane toggle regression')
    }
    if (!markdownInput.checked) {
      throw new Error('expected forced editor-mode Markdown pane to report checked when it is visible')
    }

    await act(async () => {
      viewerInput.click()
      await tick()
    })

    if (!checkboxFor(dom.window.document, 'Viewer').checked) {
      throw new Error('expected Viewer checkbox to turn on from the pane toggle')
    }
    if (!checkboxFor(dom.window.document, 'Markdown').checked) {
      throw new Error('expected Viewer toggle to keep an editable Markdown pane visible')
    }
    const layoutModeOutput = dom.window.document.querySelector('[data-testid="layout-mode"]')
    if (String(layoutModeOutput?.textContent || '') !== 'split') {
      throw new Error('expected Viewer pane toggle to enter split layout')
    }

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    restore()
  }
}

export async function testMarkdownWorkspaceInitialPaneVisibilityPreservesViewerToggleAcrossOverlayReopen() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function Harness() {
      const [overlayOpen, setOverlayOpen] = React.useState(true)
      const [activeDocumentKey, setActiveDocumentKey] = React.useState('doc-a')
      const [visibility, setVisibility] = React.useState<MarkdownWorkspacePaneVisibility>({
        json: false,
        markdown: false,
        viewer: false,
        html: false,
      })
      useInitialWorkspacePaneVisibility({
        activeDocumentKey,
        splitPaneVisibility: visibility,
        workspaceEditorOverlayOpen: overlayOpen,
        setSplitPaneVisibility: setVisibility,
      })
      const summary = JSON.stringify({
        overlayOpen,
        activeDocumentKey,
        visibility,
      })

      return (
        <section>
          <button type="button" onClick={() => {
            setVisibility(prev => ({ ...prev, markdown: true, viewer: true }))
          }}
          >
            Enable Viewer
          </button>
          <button type="button" onClick={() => {
            setOverlayOpen(prev => !prev)
          }}
          >
            Toggle Overlay
          </button>
          <button type="button" onClick={() => {
            setActiveDocumentKey('doc-b')
          }}
          >
            Switch Document
          </button>
          <output data-testid="pane-state">{summary}</output>
        </section>
      )
    }

    const readState = () => {
      const el = dom.window.document.querySelector('[data-testid="pane-state"]')
      if (!(el instanceof dom.window.HTMLElement)) {
        throw new Error('expected pane state output')
      }
      return JSON.parse(el.textContent || '{}') as {
        overlayOpen: boolean
        activeDocumentKey: string
        visibility: MarkdownWorkspacePaneVisibility
      }
    }

    const buttonFor = (text: string): HTMLButtonElement => {
      const buttons = Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]
      const button = buttons.find(node => String(node.textContent || '').trim() === text)
      if (!(button instanceof dom.window.HTMLButtonElement)) {
        throw new Error(`expected ${text} button`)
      }
      return button
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
      await tick()
    })

    const initial = readState()
    if (!initial.visibility.markdown || initial.visibility.viewer) {
      throw new Error(`expected markdown-only initial pane preset, got ${JSON.stringify(initial)}`)
    }

    await act(async () => {
      buttonFor('Enable Viewer').click()
      await tick()
    })
    const viewerEnabled = readState()
    if (!viewerEnabled.visibility.markdown || !viewerEnabled.visibility.viewer) {
      throw new Error(`expected viewer toggle to keep markdown + viewer visible, got ${JSON.stringify(viewerEnabled)}`)
    }

    await act(async () => {
      buttonFor('Toggle Overlay').click()
      await tick()
      buttonFor('Toggle Overlay').click()
      await tick()
    })
    const reopened = readState()
    if (!reopened.visibility.markdown || !reopened.visibility.viewer) {
      throw new Error(`expected overlay reopen to preserve viewer pane visibility for the same document, got ${JSON.stringify(reopened)}`)
    }

    await act(async () => {
      buttonFor('Switch Document').click()
      await tick()
    })
    const switched = readState()
    if (!switched.visibility.markdown || switched.visibility.viewer) {
      throw new Error(`expected a new document to receive the initial pane preset, got ${JSON.stringify(switched)}`)
    }

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    restore()
  }
}

export async function testMarkdownWorkspaceToolbarWebpageViewControlsConsolidated() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const state = useGraphStore.getState()
  const prevWorkspaceViewMode = state.workspaceViewMode
  const prevWorkspaceCanvasPaneOpen = state.workspaceCanvasPaneOpen
  try {
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    } else {
      state.setWorkspaceViewMode('editor')
      state.setWorkspaceCanvasPaneOpen(true)
    }
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as unknown }
    let viewCalls: string[] = []
    const sourceUrl = 'https://example.invalid/page'

    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MarkdownWorkspaceMain
          themeMode="light"
          uiPanelTextFontClass="font-sans"
          uiPanelMonospaceTextClass="font-mono text-xs"
          explorerOpen={true}
          setExplorerOpen={() => {}}
          layoutMode="split"
          setLayoutMode={() => {}}
          markdownWordWrap={true}
          setMarkdownWordWrap={() => {}}
          markdownTextHighlight={false}
          setMarkdownTextHighlight={() => {}}
          onToggleFullscreen={() => {}}
          presentationApiRef={presentationApiRef as never}
          isMarkdown={true}
          webpageWorkspaceMeta={{ url: sourceUrl, view: 'html', fidelityLevel: 4 } as never}
          onWebpageChangeView={(view) => {
            viewCalls = [...viewCalls, String(view)]
          }}
          onWebpageUpdateMeta={() => {}}
          activeText={`---\nkgWebpageUrl: "${sourceUrl}"\nkgWebpageView: "html"\n---\n\n[](${sourceUrl})\n`}
          setActiveText={() => {}}
          activeDocumentKey="doc"
          highlightedLineRange={{ start: null, end: null }}
          revealLineInEditor={() => {}}
          showInViewer={() => {}}
          showInPresentation={() => {}}
          showInGallery={() => {}}
          editorUri="file:///doc.md"
          editorLanguage="markdown"
          editorRef={editorRef}
          onEditorCaretLine={() => {}}
        />,
      )
      await tick()
      await tick()
    })
    const viewSelect = dom.window.document.querySelector('select[aria-label="Webpage view mode"]')
    if (viewSelect) throw new Error('expected Webpage view dropdown to be removed')

    const htmlInput = checkboxFor(dom.window.document, 'HTML')
    const viewerInput = checkboxFor(dom.window.document, 'Viewer')
    const jsonInput = checkboxFor(dom.window.document, 'JSON')
    const markdownInput = checkboxFor(dom.window.document, 'Markdown')
    if (!htmlInput.checked || !viewerInput.checked) {
      throw new Error('expected HTML import view to start with Viewer and HTML panes active')
    }
    if (!dom.window.document.querySelector('section[aria-label="Viewer"]')) {
      throw new Error('expected Viewer pane to render beside the HTML pane')
    }
    if (!dom.window.document.querySelector('section[aria-label="HTML Viewer"] section[aria-label="Webpage Viewer"]')) {
      throw new Error('expected HTML pane to render webpage viewer independently')
    }
    await act(async () => {
      jsonInput.click()
      await tick()
    })
    await act(async () => {
      markdownInput.click()
      await tick()
    })
    if (!jsonInput.checked || !markdownInput.checked || !viewerInput.checked || !htmlInput.checked) {
      throw new Error('expected JSON, Markdown, Viewer, and HTML checkboxes to stay open together')
    }
    if (!dom.window.document.querySelector('section[aria-label="JSON Editor"]')) {
      throw new Error('expected JSON pane to render while Viewer and HTML stay open')
    }
    if (dom.window.document.querySelector('section[aria-label="JSON Editor"] section[aria-label="Markdown Editor"]')) {
      throw new Error('expected JSON pane not to expose itself as a Markdown editor')
    }
    if (!dom.window.document.querySelector('section[aria-label="JSON Editor"] section[aria-label="JSON Editor Surface"]')) {
      throw new Error('expected JSON pane to expose a JSON editor surface')
    }
    if (!dom.window.document.querySelector('section[aria-label="Markdown Editor"]')) {
      throw new Error('expected Markdown pane to render while Viewer and HTML stay open')
    }
    if (!dom.window.document.querySelector('section[aria-label="Viewer"]')) {
      throw new Error('expected Viewer pane to remain rendered while HTML is open')
    }
    if (!dom.window.document.querySelector('section[aria-label="HTML Viewer"] section[aria-label="Webpage Viewer"]')) {
      throw new Error('expected HTML pane to remain rendered with Viewer open')
    }
    if (viewCalls.length !== 0) {
      throw new Error(`expected JSON/Markdown pane toggles not to rewrite webpage view, got ${JSON.stringify(viewCalls)}`)
    }

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: prevWorkspaceViewMode, paneOpen: prevWorkspaceCanvasPaneOpen })
    } else {
      state.setWorkspaceViewMode(prevWorkspaceViewMode)
      state.setWorkspaceCanvasPaneOpen(prevWorkspaceCanvasPaneOpen)
    }
    restore()
  }
}

export async function testMarkdownWorkspaceToolbarViewerAndHtmlRenderTogetherAfterSelection() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const state = useGraphStore.getState()
  const prevWorkspaceViewMode = state.workspaceViewMode
  const prevWorkspaceCanvasPaneOpen = state.workspaceCanvasPaneOpen
  try {
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    } else {
      state.setWorkspaceViewMode('editor')
      state.setWorkspaceCanvasPaneOpen(true)
    }
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const sourceUrl = 'https://example.invalid/page'
    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as unknown }
    let viewCalls: string[] = []

    function Harness() {
      const [layoutMode, setLayoutMode] = React.useState<'split' | 'editor'>('split')
      return (
        <MarkdownWorkspaceMain
          themeMode="light"
          uiPanelTextFontClass="font-sans"
          uiPanelMonospaceTextClass="font-mono text-xs"
          explorerOpen={true}
          setExplorerOpen={() => {}}
          layoutMode={layoutMode}
          setLayoutMode={next => setLayoutMode(next === 'editor' || next === 'split' ? next : 'split')}
          markdownWordWrap={true}
          setMarkdownWordWrap={() => {}}
          markdownTextHighlight={false}
          setMarkdownTextHighlight={() => {}}
          onToggleFullscreen={() => {}}
          presentationApiRef={presentationApiRef as never}
          isMarkdown={true}
          webpageWorkspaceMeta={{ url: sourceUrl, view: 'markdown', fidelityLevel: 4 } as never}
          onWebpageChangeView={next => {
            viewCalls = [...viewCalls, String(next)]
          }}
          onWebpageUpdateMeta={() => {}}
          activeText={`---\nkgWebpageUrl: "${sourceUrl}"\nkgWebpageView: "markdown"\n---\n\n[](${sourceUrl})\n`}
          setActiveText={() => {}}
          activeDocumentKey="doc-click-path"
          highlightedLineRange={{ start: null, end: null }}
          revealLineInEditor={() => {}}
          showInViewer={() => {}}
          showInPresentation={() => {}}
          showInGallery={() => {}}
          editorUri="file:///doc-click-path.md"
          editorLanguage="markdown"
          editorRef={editorRef}
          onEditorCaretLine={() => {}}
        />
      )
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
      await tick()
      await tick()
    })

    const viewerInput = checkboxFor(dom.window.document, 'Viewer')
    const htmlInput = checkboxFor(dom.window.document, 'HTML')
    if (htmlInput.checked) throw new Error('expected HTML pane to start closed in markdown view')
    await act(async () => {
      viewerInput.click()
      await tick()
      await tick()
    })
    if (!checkboxFor(dom.window.document, 'Viewer').checked) {
      throw new Error('expected Viewer checkbox to stay checked before selecting HTML')
    }
    await act(async () => {
      checkboxFor(dom.window.document, 'HTML').click()
      await tick()
      await tick()
    })
    if (!checkboxFor(dom.window.document, 'Viewer').checked || !checkboxFor(dom.window.document, 'HTML').checked) {
      throw new Error('expected Viewer and HTML checkboxes to stay checked together after selection without waiting for webpage view persistence')
    }
    if (JSON.stringify(viewCalls) !== JSON.stringify(['html'])) {
      throw new Error(`expected HTML pane selection to request persisted webpage html view once, got ${JSON.stringify(viewCalls)}`)
    }
    if (!dom.window.document.querySelector('section[aria-label="Viewer"]')) {
      throw new Error('expected Viewer pane to render after selecting Viewer and HTML')
    }
    if (!dom.window.document.querySelector('section[aria-label="HTML Viewer"] section[aria-label="Webpage Viewer"]')) {
      throw new Error('expected HTML pane to render after selecting Viewer and HTML')
    }

    await act(async () => {
      root.unmount()
      await tick()
    })
  } finally {
    if (state.setWorkspaceViewState) {
      state.setWorkspaceViewState({ mode: prevWorkspaceViewMode, paneOpen: prevWorkspaceCanvasPaneOpen })
    } else {
      state.setWorkspaceViewMode(prevWorkspaceViewMode)
      state.setWorkspaceCanvasPaneOpen(prevWorkspaceCanvasPaneOpen)
    }
    restore()
  }
}

export function testMarkdownWorkspaceInitialPaneVisibilityFollowsImportView() {
  const cases = [
    { view: 'json' as const, expected: { json: true, markdown: false, viewer: false, html: false } },
    { view: 'markdown' as const, expected: { json: false, markdown: true, viewer: false, html: false } },
    { view: 'html' as const, expected: { json: false, markdown: false, viewer: true, html: true } },
  ]
  for (const item of cases) {
    const actual = resolveMarkdownWorkspaceInitialPaneVisibility({ webpageView: item.view })
    if (
      actual.json !== item.expected.json ||
      actual.markdown !== item.expected.markdown ||
      actual.viewer !== item.expected.viewer ||
      actual.html !== item.expected.html
    ) {
      throw new Error(`expected ${item.view} import to land on matching workspace pane`)
    }
  }
  const gltf = resolveMarkdownWorkspaceInitialPaneVisibility({ modelAssetFormat: 'gltf', webpageView: 'html' })
  if (!gltf.json || gltf.markdown || gltf.viewer || gltf.html) throw new Error('expected GLTF imports to prefer the JSON pane')
  const glb = resolveMarkdownWorkspaceInitialPaneVisibility({ modelAssetFormat: 'glb', webpageView: 'html' })
  if (glb.json || glb.markdown || glb.viewer || glb.html) throw new Error('expected GLB imports to keep text panes closed')
}

export function testMarkdownWorkspaceInitialPaneVisibilityFollowsCsvJsonMarkdownDocumentFormats() {
  const cases = [
    { path: 'people.csv', expected: { json: false, markdown: false, viewer: true, html: false } },
    { path: 'scores.tsv', expected: { json: false, markdown: false, viewer: true, html: false } },
    { path: 'rows.json', expected: { json: true, markdown: false, viewer: false, html: false } },
    { path: 'graph.geojson', expected: { json: true, markdown: false, viewer: false, html: false } },
    { path: 'notes.md', expected: { json: false, markdown: true, viewer: false, html: false } },
    { path: 'readme.markdown', expected: { json: false, markdown: true, viewer: false, html: false } },
  ]
  for (const item of cases) {
    const actual = resolveMarkdownWorkspaceInitialPaneVisibility({ activeDocumentKey: item.path })
    if (
      actual.json !== item.expected.json ||
      actual.markdown !== item.expected.markdown ||
      actual.viewer !== item.expected.viewer ||
      actual.html !== item.expected.html
    ) {
      throw new Error(`expected ${item.path} import/export pane route to match its document format`)
    }
  }
}
