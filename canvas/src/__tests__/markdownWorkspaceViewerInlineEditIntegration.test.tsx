import React, { act } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DOCS_SSOT_VALIDATION_WORKSPACE_PATH } from '@/tests/lib/docsSsotFixture'
import { buildJsonMarkdownSourceSemanticKey, serializeJsonMarkdownDraftToSourceText } from '@/features/markdown-workspace/main/jsonMarkdownEditing'
import { useMarkdownWorkspaceWidgetMode } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceWidgetMode'
import { tick } from './helpers/markdownWorkspaceInlineEditHarness'

export async function testMarkdownWorkspaceWidgetModeKeepsMarkdownLoadInDocumentMode() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const snapshots: string[] = []
  const widgetAvailabilitySnapshots: boolean[] = []

  function Harness(props: { active?: boolean; activePath: string; graphContentRevision: number }) {
    const state = useMarkdownWorkspaceWidgetMode({
      active: props.active,
      graphNodes: [{ id: 'w-text-script', type: 'TextGeneration', properties: {} } as never],
      graphEdges: [{ id: 'e-video', source: 'w-text-script', target: 'p-text-script' } as never],
      graphContentRevision: props.graphContentRevision,
      widgetRegistry: [{ isEnabled: true, nodeTypeId: 'TextGeneration' } as never],
      openWidgetNodeIds: ['w-text-script'],
      selectedNodeId: null,
      activePath: props.activePath,
      isMarkdownPath: path => String(path || '').toLowerCase().endsWith('.md'),
    })

    React.useEffect(() => {
      snapshots.push(state.contentMode)
    }, [state.contentMode])
    React.useEffect(() => {
      widgetAvailabilitySnapshots.push(state.widgetAvailable)
    }, [state.widgetAvailable])

    return null
  }

  try {
    await act(async () => {
      root.render(React.createElement(Harness, { active: false, activePath: DOCS_SSOT_VALIDATION_WORKSPACE_PATH, graphContentRevision: 1 }))
      await tick(2)
    })

    if (widgetAvailabilitySnapshots.includes(true)) {
      throw new Error('expected inactive markdown workspace widget mode to skip graph lookup and widget availability')
    }

    await act(async () => {
      root.render(React.createElement(Harness, { active: true, activePath: DOCS_SSOT_VALIDATION_WORKSPACE_PATH, graphContentRevision: 1 }))
      await tick(2)
    })

    if (snapshots[0] !== 'document') {
      throw new Error('expected markdown workspace seed to stay in document mode on first load even when widgets are available')
    }

    await act(async () => {
      root.render(React.createElement(Harness, { active: true, activePath: '/workspace/output.json', graphContentRevision: 2 }))
      await tick(2)
    })

    if (snapshots.includes('widget')) {
      throw new Error('expected first transition away from markdown seed to avoid auto-switching into widget mode during workspace load')
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    restore()
  }
}

export function testMarkdownWorkspaceWidgetModeUsesSemanticCacheAndLazyBundleBuild() {
  const p = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceWidgetMode.ts')
  const text = readFileSync(p, 'utf8')
  if (!text.includes("from '@/lib/hash/signature'") || !text.includes('hashScopedStringArraySignature')) {
    throw new Error('expected widget mode to reuse shared hash signature helper for semantic cache keys')
  }
  if (
    !text.includes('openWidgetNodeIdsSnapshotRef')
    || !text.includes('widgetRegistrySnapshotRef')
    || !text.includes('widgetGraphDataSnapshotRef')
    || !text.includes('getCachedGraphLookup({')
  ) {
    throw new Error('expected widget mode to cache hot-path snapshots by semantic keys instead of raw array identity')
  }
  if (text.includes('preferCurrentGraphDataRefs: true')) {
    throw new Error('expected widget mode lookup caching to stop keying rebuilds off current graph collection identities')
  }
  if (!text.includes('deriveWidgetCandidateNodeIds({')) {
    throw new Error('expected widget mode to reuse the shared widget candidate node-id resolver instead of local open-widget filtering')
  }
  if (!text.includes('const widgetBundleBuildActive = active && contentMode === \'widget\' && widgetAvailable')) {
    throw new Error('expected widget mode to gate large bundle generation behind active widget mode')
  }
  const bundleStart = text.indexOf('const widgetBundleJsonText = React.useMemo(() => {')
  const bundleEnd = text.indexOf('  const widgetEditorText = React.useMemo(() => {')
  if (bundleStart < 0 || bundleEnd <= bundleStart) {
    throw new Error('expected widget bundle generation to remain isolated in its own memo')
  }
  const bundleSection = text.slice(bundleStart, bundleEnd)
  if (!bundleSection.includes("if (!widgetBundleBuildActive || widgetNodeIds.length === 0 || !graphLookupById) return ''")) {
    throw new Error('expected widget bundle JSON generation to stay lazy while document mode is active')
  }
  if (!text.includes("const widgetBundleSemanticKey = React.useMemo(") || !text.includes("'widget-bundle-subset'")) {
    throw new Error('expected widget bundle cache reuse to distinguish widget-node subsets at the same graph revision')
  }
  if (!bundleSection.includes('buildWidgetBundleJsonText({')) {
    throw new Error('expected widget mode to reuse the shared widget bundle JSON helper instead of rebuilding text inline')
  }
  if (!text.includes('getCachedGraphSubsetByNodeIds({')) {
    throw new Error('expected widget bundle generation to reuse the shared cached graph subset helper instead of rebuilding nodes and edges inline')
  }
}

export async function testMarkdownWorkspaceEditorOmitsDocumentSelectorInHeader() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await act(async () => {
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: false,
          setExplorerOpen: () => void 0,
          layoutMode: 'editor',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: ['Editor line one', '', 'Editor line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/editor-mode-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///editor-mode-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const derivedViewsMenu = container.querySelector('menu[aria-label="Derived views"]') as HTMLElement | null
    if (derivedViewsMenu) throw new Error('expected Monaco editor header to omit document selector and rely on editor-language SSOT')
    const monacoEditors = container.querySelector('section[aria-label="Monaco editors"]') as HTMLElement | null
    if (!monacoEditors) throw new Error('expected editor layout to render dedicated Monaco editor surfaces')
    const jsonEditorPane = monacoEditors.querySelector('section[aria-label="JSON Editor"]') as HTMLElement | null
    if (jsonEditorPane) throw new Error('expected editor layout to avoid mounting JSON Editor pane until it is explicitly enabled')
    const markdownEditorPane = monacoEditors.querySelector('section[aria-label="Markdown Editor"]') as HTMLElement | null
    if (!markdownEditorPane) throw new Error('expected editor layout to include Markdown Editor pane')
    const jsonEditorTextarea = container.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (jsonEditorTextarea) throw new Error('expected JSON editor textarea surface not to mount during initial editor load')
    const markdownEditorTextarea = container.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditorTextarea) throw new Error('expected markdown editor textarea surface in workspace editor')
    if (!String(markdownEditorTextarea.value || '').includes('Editor line one')) {
      throw new Error('expected markdown editor pane to keep markdown source text')
    }

    const contentMenu = container.querySelector('menu[aria-label="Content"]') as HTMLElement | null
    if (contentMenu) throw new Error('expected legacy content-mode toggle menu to be removed from workspace header')

    const widgetFormatMenu = container.querySelector('menu[aria-label="Document format in Widget"]') as HTMLElement | null
    if (widgetFormatMenu) throw new Error('expected legacy widget document-format menu to be removed from workspace header')
  } finally {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceEditorKeepsJsonPaneBlankForEmptyMarkdown() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await act(async () => {
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: false,
          setExplorerOpen: () => void 0,
          layoutMode: 'editor',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: '',
          setActiveText: () => void 0,
          activeDocumentKey: '/empty-init-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///empty-init-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const jsonEditorTextarea = container.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (jsonEditorTextarea) throw new Error('expected JSON editor pane not to mount for empty markdown input during initial editor load')
    const markdownEditorTextarea = container.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditorTextarea) throw new Error('expected markdown editor textarea surface in workspace editor')
    if (String(markdownEditorTextarea.value || '') !== '') {
      throw new Error('expected markdown editor pane to stay blank for empty markdown input')
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceSplitConsolidatesViewerFormattingIntoInlineSelectionToolbar() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await act(async () => {
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: false,
          setExplorerOpen: () => void 0,
          layoutMode: 'split',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: ['Split line one', '', 'Split line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/split-mode-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///split-mode-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const splitView = container.querySelector('section[aria-label="Split view"]') as HTMLElement | null
    if (!splitView) throw new Error('expected split layout to render workspace panes')
    const splitViewerPane = splitView.querySelector('section[aria-label="Viewer"]') as HTMLElement | null
    if (!splitViewerPane) throw new Error('expected split layout to include WYSIWYG viewer pane')
    const splitFormattingMenu = container.querySelector('menu[aria-label="Formatting"]') as HTMLElement | null
    if (splitFormattingMenu) throw new Error('expected split header to defer duplicate formatting actions to the viewer inline-selection toolbar when Viewer is checked')
    const derivedViewsMenu = container.querySelector('menu[aria-label="Derived views"]') as HTMLElement | null
    if (derivedViewsMenu) throw new Error('expected split header to omit Monaco document selector and avoid duplicate mode switching')

    const inlineSelectionToolbarText = readFileSync(
      resolve(process.cwd(), 'src/lib/markdown-core/ui/MarkdownInlineSelectionToolbar.tsx'),
      'utf8',
    )
    const expectedToolbarTitles = [
      'Heading',
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline Code',
      'Link',
      'Bulleted List',
      'Numbered List',
      'Quote',
    ]
    for (const title of expectedToolbarTitles) {
      if (
        !inlineSelectionToolbarText.includes(`title="${title}"`)
        && !inlineSelectionToolbarText.includes(`title: '${title}'`)
      ) {
        throw new Error(`expected split viewer inline-selection toolbar to expose ${title}`)
      }
    }
    if (!inlineSelectionToolbarText.includes('autoFocus={false}')) {
      throw new Error('expected inline selection toolbar overlay to preserve editor selection instead of stealing focus')
    }
    const formattingText = readFileSync(
      resolve(process.cwd(), 'src/lib/markdown-core/ui/markdownBlockContainerCore.markdownFormatting.ts'),
      'utf8',
    )
    if (!formattingText.includes('args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()')) {
      throw new Error('expected inline floating formatting actions to reuse cached selection offsets after toolbar focus changes')
    }
  } finally {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceSplitButtonOpensPaneSelector() {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    await act(async () => {
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: false,
          setExplorerOpen: () => void 0,
          layoutMode: 'split',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: ['Split line one', '', 'Split line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/split-selector-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///split-selector-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const splitButton = container.querySelector('button[title="Split"]') as HTMLButtonElement | null
    if (!splitButton) throw new Error('expected split layout button')
    const legacyViewerButton = container.querySelector('button[title^="Viewer"]') as HTMLButtonElement | null
    if (legacyViewerButton) throw new Error('expected viewer button to be consolidated into split and removed from toolbar')
    await act(async () => {
      splitButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const selectorDialog = doc.querySelector('[aria-label="Split panes selector"]') as HTMLElement | null
    if (!selectorDialog) throw new Error('expected split button click to open split panes selector')
    const legacyEditorButton = container.querySelector('button[title="Editor"]') as HTMLButtonElement | null
    if (legacyEditorButton) throw new Error('expected editor button to be consolidated into split and removed from toolbar')
    const splitPanesMenu = selectorDialog.querySelector('menu[aria-label="Split panes"]') as HTMLElement | null
    if (!splitPanesMenu) throw new Error('expected split panes multi-select menu')
  } finally {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    restore()
  }
}

export async function testMarkdownWorkspaceViewerInlineEditSyncsJsonBackedMarkdownEdits() {
  const markdown = '=={color=red}Viewer{color}== edit line one'
  const jsonText = serializeJsonMarkdownDraftToSourceText({
    activeDocumentKey: '/viewer-edit-test.json',
    editorUri: 'file:///viewer-edit-test.json',
    markdownText: markdown,
  })
  const parsed = JSON.parse(jsonText) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('expected json-backed markdown draft serializer to return valid JSON')
  }
  if (!jsonText.includes('"@graph"') && !jsonText.includes('"@context"')) {
    throw new Error('expected json-backed markdown draft serializer to emit JSON-LD')
  }
  const semanticKey = buildJsonMarkdownSourceSemanticKey({
    activeDocumentKey: '/viewer-edit-test.json',
    text: jsonText,
  })
  if (!semanticKey.trim()) {
    throw new Error('expected json-backed markdown serializer to produce a reusable semantic key')
  }

  const documentStatePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'useWorkspaceDocumentState.ts')
  const documentStateText = readFileSync(documentStatePath, 'utf8')
  if (
    !/const\s+editableMarkdownText\s*=/.test(documentStateText)
    || !documentStateText.includes('viewerInlineMarkdownDraftText ??')
    || !documentStateText.includes("isJsonMarkdownEditing\n      ? (jsonDerivedMarkdownDraft ?? jsonDerivedMarkdownBase ?? '')")
    || !documentStateText.includes('sourceAttachedMarkdownTableText ?? activeText')
  ) {
    throw new Error('expected useWorkspaceDocumentState to centralize json-backed markdown edits through the visible markdown draft SSOT')
  }
  if (!documentStateText.includes('const commitMarkdownEditText = React.useCallback(')) {
    throw new Error('expected useWorkspaceDocumentState to centralize json-backed markdown writes behind a shared commit helper')
  }
  if (!documentStateText.includes('commitMarkdownEditText(next)')) {
    throw new Error('expected useWorkspaceDocumentState viewer handlers to reuse the shared markdown commit helper')
  }
  if (!documentStateText.includes('markdownText: persistedEditableMarkdownText')) {
    throw new Error('expected useWorkspaceDocumentState line-range replacement to edit the json-derived markdown draft instead of raw active JSON text')
  }
  const workspaceMainPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx')
  const workspaceMainText = readFileSync(workspaceMainPath, 'utf8')
  if (!workspaceMainText.includes("import { useWorkspaceDocumentState } from './useWorkspaceDocumentState'")
    || !workspaceMainText.includes('} = useWorkspaceDocumentState({')) {
    throw new Error('expected MarkdownWorkspaceMain to use the shared document-state hook')
  }
}

export {
  testMarkdownWorkspaceViewerInlineEditInteractionDoesNotFreeze,
  testMarkdownWorkspaceViewerUsesInlineSelectionToolbarFormattingSsot,
  testMarkdownWorkspaceViewerInlineSelectionToolbarSyncsSplitMarkdownAndJsonPanesLive,
  testMarkdownWorkspaceViewerInlineEditDoubleClickWordSelectionShowsToolbar,
  testMarkdownWorkspaceViewerInlineEditEditorDoubleClickDoesNotFreeze,
} from './markdownWorkspaceViewerSelection.test'

export {
  testMarkdownWorkspaceViewerInlineEditDoubleClickUnderlineStaysRenderedOnMouseRelease,
  testMarkdownWorkspaceViewerInlineEditDoubleClickUnderlineInputDoesNotLiteralizeOnMouseRelease,
  testMarkdownWorkspaceViewerUnderlineCommitKeepsRenderedPreview,
  testMarkdownWorkspaceViewerHighlightCommitKeepsRenderedPreview,
  testMarkdownWorkspaceViewerTextColorCommitKeepsRenderedPreview,
} from './markdownWorkspaceViewerFormatting.test'

export async function testMarkdownWorkspaceLocalCsvProjectionKeepsViewerRows() {
  const incoming = useGraphStore.getState()
  const previousView = { mode: incoming.workspaceViewMode, paneOpen: incoming.workspaceCanvasPaneOpen }
  const previousTransition = {
    workspaceGraphMutationBlockUntilMs: incoming.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: incoming.workspaceGraphMutationBlockKey,
  }
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const writes: string[] = []
  const render = async (csv: string) => {
    await act(async () => {
      root.render(React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light', uiPanelTextFontClass: 'font-sans', uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: true, setExplorerOpen: () => void 0, layoutMode: 'editor', setLayoutMode: () => void 0,
        markdownWordWrap: true, setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false, setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0, presentationApiRef: { current: null },
        isMarkdown: false, activeText: csv, setActiveText: text => { writes.push(text) }, jsonSourceText: null,
        activeDocumentKey: 'people.csv', highlightedLineRange: null, revealLineInEditor: () => void 0,
        showInViewer: () => void 0, showInPresentation: () => void 0, showInGallery: () => void 0,
        editorUri: 'file:///people.csv', editorLanguage: 'csv', editorRef: { current: null },
      }))
      await tick(2)
    })
  }
  const readViewerRows = () => Array.from<Element>(container.querySelectorAll('section[aria-label="Workspace data view"] tbody tr'))
    .map(row => Array.from<Element>(row.querySelectorAll('td')).map(cell => String(cell.textContent || '').trim()))
    .filter(row => row.some(Boolean))
  const waitForRows = async (expected: string[][]) => {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (expected.every(row => readViewerRows().some(actual => JSON.stringify(actual.slice(0, row.length)) === JSON.stringify(row)))) return
      await act(async () => { await tick(2) })
    }
    throw new Error(`CSV Viewer rows did not settle: ${JSON.stringify(readViewerRows())}`)
  }
  const assertProjection = (headers: string[], rows: string[][]) => {
    const viewer = container.querySelector('section[aria-label="Workspace data view"]')
    if (!viewer) throw new Error('Missing CSV Viewer after pane projection')
    for (const header of headers) {
      if (!viewer.querySelector(`[aria-label="Column type: ${header}"]`)) throw new Error(`Missing Viewer header ${header}`)
    }
    const markdown = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown Editor Text"]')?.value || ''
    if (!markdown.startsWith(`| ${headers.join(' | ')} |`)) throw new Error('Markdown projection lost CSV headers')
    for (const row of rows) if (!markdown.includes(`| ${row.join(' | ')} |`)) throw new Error('Markdown projection lost CSV row values')
    const json = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON Editor Text"]')?.value || ''
    const parsed = JSON.parse(json) as { rows?: Record<string, string>[]; metadata?: { fieldNames?: string[] } }
    const records = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
    if (JSON.stringify(parsed.metadata?.fieldNames) !== JSON.stringify(headers) || JSON.stringify(parsed.rows) !== JSON.stringify(records)) throw new Error('JSON projection lost CSV values or refreshed schema')
    if (writes.length) throw new Error('Viewing CSV projections wrote back to source')
  }
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    const firstRows = [['Ada', 'Singapore', 'hello, world'], ['Grace', 'London', 'compiler']]
    await render('name,city,note\nAda,Singapore,"hello, world"\nGrace,London,compiler\n')
    await waitForRows(firstRows)
    await act(async () => {
      for (const label of ['Show JSON editor pane', 'Show Markdown editor pane']) {
        const toggle = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
        if (!toggle) throw new Error(`Missing CSV pane toggle ${label}`)
        if (!toggle.checked) toggle.click()
      }
      await tick(2)
    })
    await waitForRows(firstRows)
    assertProjection(['name', 'city', 'note'], firstRows)
    const nextRows = [['Lin', 'Tokyo', 'updated']]
    await render('name,city,status\nLin,Tokyo,updated\n')
    await waitForRows(nextRows)
    assertProjection(['name', 'city', 'status'], nextRows)
    if (readViewerRows().some(row => row.includes('Ada'))) throw new Error('CSV Viewer retained a row from before refresh')
  } finally {
    try { await act(async () => { root.unmount(); await tick(2) }) }
    finally {
      try {
        useGraphStore.getState().resetAll()
        useGraphStore.getState().setWorkspaceViewState(previousView)
        useGraphStore.setState(previousTransition)
        const restored = useGraphStore.getState()
        if (restored.workspaceViewMode !== previousView.mode || restored.workspaceCanvasPaneOpen !== previousView.paneOpen
          || restored.workspaceGraphMutationBlockUntilMs !== previousTransition.workspaceGraphMutationBlockUntilMs
          || restored.workspaceGraphMutationBlockKey !== previousTransition.workspaceGraphMutationBlockKey) {
          throw new Error('CSV projection fixture did not restore its incoming workspace view and transition')
        }
      } finally { restore() }
    }
  }
}
