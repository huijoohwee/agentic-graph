import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { DOCS_SSOT_VALIDATION_WORKSPACE_PATH } from '@/tests/lib/docsSsotFixture'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { buildJsonMarkdownSourceSemanticKey, serializeJsonMarkdownDraftToSourceText } from '@/features/markdown-workspace/main/jsonMarkdownEditing'
import { useMarkdownWorkspaceWidgetMode } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceWidgetMode'

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const waitMs = async (ms: number) => {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
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

const installInlineExecCommandStub = (
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  commands: Array<'bold' | 'italic' | 'underline' | 'strikeThrough'>,
) => {
  const enabled = new Set(commands)
  const originalExecCommand = dom.window.document.execCommand
  dom.window.document.execCommand = ((cmd: string) => {
    if (!enabled.has(cmd as 'bold' | 'italic' | 'underline' | 'strikeThrough')) return false
    const sel = dom.window.getSelection()
    if (!sel || sel.rangeCount <= 0) return false
    const range = sel.getRangeAt(0)
    if (range.collapsed) return false
    const tagName = cmd === 'bold'
      ? 'strong'
      : cmd === 'italic'
        ? 'em'
        : cmd === 'strikeThrough'
          ? 's'
          : 'u'
    const wrapper = dom.window.document.createElement(tagName)
    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)
    range.selectNodeContents(wrapper)
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }) as typeof dom.window.document.execCommand
  return () => {
    dom.window.document.execCommand = originalExecCommand
  }
}

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

export async function testMarkdownWorkspaceViewerInlineEditInteractionDoesNotFreeze() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
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
          layoutMode: 'viewer',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: ['Viewer edit line one', '', 'Viewer edit line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/viewer-edit-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///viewer-edit-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
    await tick(5)

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor in viewer mode')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object')
    sel.removeAllRanges()
    sel.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    await tick(4)

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar in viewer inline edit')

    const summary = toolbar.querySelector('button[aria-label="Text color"]') as HTMLElement | null
    if (!summary) throw new Error('expected text color trigger in viewer inline-selection toolbar')
    summary.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    summary.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    summary.click()
    await tick(2)
    const redBtn = doc.querySelector('menu[aria-label="Text color menu"] button') as HTMLButtonElement | null
    if (!redBtn) throw new Error('expected text color button in viewer inline-selection toolbar')
    redBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    redBtn.click()
    await tick(3)
    const stillEditorAfterToolbar = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!stillEditorAfterToolbar) throw new Error('expected viewer editor to stay active after inline-selection toolbar action')
    const toolbarAfterAction = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbarAfterAction) throw new Error('expected floating selection toolbar to remain available after action click')

    editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    await tick(2)
    const stillEditing = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!stillEditing) throw new Error('expected viewer inline edit not to freeze/bounce out on transient blur')
  } finally {
    try { root.unmount() } catch { void 0 }
    restore()
  }
}

export async function testMarkdownWorkspaceViewerUsesInlineSelectionToolbarFormattingSsot() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    root.render(
      React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: false,
        setExplorerOpen: () => void 0,
        layoutMode: 'viewer',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: true,
        activeText: ['Viewer edit line one', '', 'Viewer edit line two'].join('\n'),
        setActiveText: () => void 0,
        activeDocumentKey: '/viewer-edit-test.md',
        highlightedLineRange: null,
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///viewer-edit-test.md',
        editorLanguage: 'markdown',
        editorRef: { current: null },
      }),
    )

    await tick(6)

    const workspaceFormattingMenu = container.querySelector('menu[aria-label="Formatting"]') as HTMLElement | null
    if (workspaceFormattingMenu) {
      throw new Error('expected viewer workspace toolbar to defer duplicate formatting buttons to the inline-selection toolbar SSOT')
    }
    const workspaceContentMenu = container.querySelector('menu[aria-label="Content"]') as HTMLElement | null
    if (workspaceContentMenu) {
      throw new Error('expected viewer workspace toolbar to hide content-mode controls when there is no actionable mode switch')
    }
    const workspaceDerivedViewsMenu = container.querySelector('menu[aria-label="Derived views"]') as HTMLElement | null
    if (workspaceDerivedViewsMenu) {
      throw new Error('expected workspace header to omit Monaco document selector and avoid duplicate mode switching')
    }

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor in viewer mode')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object')
    sel.removeAllRanges()
    sel.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const inlineToolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!inlineToolbar) throw new Error('expected inline floating formatting toolbar after viewer click-to-edit selection')
    const boldButton = inlineToolbar.querySelector('button[title="Bold"]') as HTMLButtonElement | null
    if (!boldButton) throw new Error('expected inline floating formatting toolbar to keep Bold action available')
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

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarSyncsSplitMarkdownAndJsonPanesLive() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
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
          activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/viewer-floating-toolbar-sync.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///viewer-floating-toolbar-sync.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    let markdownPaneToggle = doc.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    let jsonPaneToggle = doc.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
    if (!markdownPaneToggle || !jsonPaneToggle) {
      const splitButton = container.querySelector('button[title="Split"]') as HTMLButtonElement | null
      if (splitButton) {
        await act(async () => {
          splitButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
          await tick(4)
        })
        markdownPaneToggle = doc.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
        jsonPaneToggle = doc.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
      }
    }
    if (!markdownPaneToggle) throw new Error('expected split pane selector to expose Markdown pane toggle')
    if (!jsonPaneToggle) throw new Error('expected split pane selector to expose JSON pane toggle')
    await act(async () => {
      if (!markdownPaneToggle.checked) markdownPaneToggle.click()
      jsonPaneToggle.click()
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host for inline-selection toolbar sync test')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(5)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected viewer inline editor for inline-selection toolbar sync test')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected text node in viewer inline editor')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object for inline-selection toolbar sync test')
    sel.removeAllRanges()
    sel.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar for split sync test')
    const summary = toolbar.querySelector('button[aria-label="Text color"]') as HTMLElement | null
    if (!summary) throw new Error('expected text color trigger in split sync toolbar')
    await act(async () => {
      summary.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      summary.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      summary.click()
      await tick(2)
    })
    const redBtn = doc.querySelector('menu[aria-label="Text color menu"] button') as HTMLButtonElement | null
    if (!redBtn) throw new Error('expected text color button in split sync toolbar')
    await act(async () => {
      redBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      redBtn.click()
      await tick(6)
    })

    const markdownEditorTextarea = container.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditorTextarea) throw new Error('expected Markdown editor textarea in split sync test')
    if (!String(markdownEditorTextarea.value || '').includes('`#EF4444:Viewer`')) {
      throw new Error('expected Viewer floating-toolbar text color action to sync live into Markdown pane before blur')
    }

    const jsonEditorTextarea = container.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (!jsonEditorTextarea) throw new Error('expected JSON editor textarea after enabling split JSON pane')
    if (!String(jsonEditorTextarea.value || '').includes('`#EF4444:Viewer`')) {
      throw new Error('expected Viewer floating-toolbar text color action to sync live into JSON pane before blur')
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

export async function testMarkdownWorkspaceViewerInlineEditDoubleClickWordSelectionShowsToolbar() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
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
          layoutMode: 'viewer',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: ['Viewer edit line one', '', 'Viewer edit line two'].join('\n'),
          setActiveText: () => void 0,
          activeDocumentKey: '/viewer-edit-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///viewer-edit-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    host.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 2 }))
    await tick(12)

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after double-click')

    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 2 }))
    await tick(4)

    const selectionText = String(dom.window.getSelection()?.toString() || '').trim()
    if (!selectionText) throw new Error('expected non-empty word selection after double-click open')

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 2 }))
    await tick(4)

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar after double-click word selection')
  } finally {
    try { root.unmount() } catch { void 0 }
    restore()
  }
}

export async function testMarkdownWorkspaceViewerInlineEditEditorDoubleClickDoesNotFreeze() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    root.render(
      React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: false,
        setExplorerOpen: () => void 0,
        layoutMode: 'viewer',
        setLayoutMode: () => void 0,
        markdownWordWrap: true,
        setMarkdownWordWrap: () => void 0,
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: true,
        activeText: ['Viewer edit line one', '', 'Viewer edit line two'].join('\n'),
        setActiveText: () => void 0,
        activeDocumentKey: '/viewer-edit-test.md',
        highlightedLineRange: null,
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///viewer-edit-test.md',
        editorLanguage: 'markdown',
        editorRef: { current: null },
      }),
    )

    await tick(6)

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after single-click open')

    editor.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 2 }))
    await tick(6)

    const stillEditingAfterDblClick = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!stillEditingAfterDblClick) throw new Error('expected viewer editor to remain active after editor double-click')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node after double-click')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object after double-click')
    sel.removeAllRanges()
    sel.addRange(range)

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar after editor double-click')

    const stillEditing = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!stillEditing) throw new Error('expected viewer editor to remain active after editor double-click selection')
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

export async function testMarkdownWorkspaceViewerInlineEditDoubleClickUnderlineStaysRenderedOnMouseRelease() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const restoreExecCommand = installInlineExecCommandStub(dom, ['underline'])
  const doc = dom.window.document
  const container = doc.createElement('section')
  const outsideButton = doc.createElement('button')
  outsideButton.type = 'button'
  outsideButton.textContent = 'outside'
  doc.body.appendChild(outsideButton)
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
          layoutMode: 'viewer',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: 'Viewer edit line one',
          setActiveText: () => void 0,
          activeDocumentKey: '/viewer-edit-underline-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///viewer-edit-underline-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after single-click open')

    editor.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 2 }))
    await tick(6)

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node after double-click')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object after double-click')
    sel.removeAllRanges()
    sel.addRange(range)

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 2 }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar after double-click selection')
    const underlineButton = toolbar.querySelector('button[title="Underline"]') as HTMLButtonElement | null
    if (!underlineButton) throw new Error('expected underline button')
    await act(async () => {
      underlineButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      underlineButton.click()
      await tick(6)
    })

    const underlineTextNode = editor.querySelector('u')?.firstChild
    if (!underlineTextNode || underlineTextNode.nodeType !== dom.window.Node.TEXT_NODE) {
      throw new Error(`expected underline node after toolbar action, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    const collapsedRange = doc.createRange()
    collapsedRange.setStart(underlineTextNode, 2)
    collapsedRange.setEnd(underlineTextNode, 2)
    sel.removeAllRanges()
    sel.addRange(collapsedRange)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(6)
    })

    if (!String(editor.innerHTML || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected double-click underline to stay rendered after mouse release, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    if (String(editor.textContent || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected double-click underline not to literalize into text after mouse release, got text=${JSON.stringify(editor.textContent || '')}`)
    }
  } finally {
    restoreExecCommand()
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

export async function testMarkdownWorkspaceViewerInlineEditDoubleClickUnderlineInputDoesNotLiteralizeOnMouseRelease() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const restoreExecCommand = installInlineExecCommandStub(dom, ['underline'])
  const doc = dom.window.document
  const container = doc.createElement('section')
  const outsideButton = doc.createElement('button')
  outsideButton.type = 'button'
  outsideButton.textContent = 'outside'
  doc.body.appendChild(outsideButton)
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
          layoutMode: 'viewer',
          setLayoutMode: () => void 0,
          markdownWordWrap: true,
          setMarkdownWordWrap: () => void 0,
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => void 0,
          onToggleFullscreen: () => void 0,
          presentationApiRef: { current: null },
          isMarkdown: true,
          activeText: 'Viewer edit line one',
          setActiveText: () => void 0,
          activeDocumentKey: '/viewer-edit-underline-input-test.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///viewer-edit-underline-input-test.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after single-click open')

    editor.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 28, clientY: 16, detail: 2 }))
    await tick(6)

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node after double-click')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object after double-click')
    sel.removeAllRanges()
    sel.addRange(range)

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 2 }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar after double-click selection')
    const underlineButton = toolbar.querySelector('button[title="Underline"]') as HTMLButtonElement | null
    if (!underlineButton) throw new Error('expected underline button')
    await act(async () => {
      underlineButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      underlineButton.click()
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, inputType: 'formatUnderline' }))
      await tick(6)
    })

    const underlineTextNode = editor.querySelector('u')?.firstChild
    if (!underlineTextNode || underlineTextNode.nodeType !== dom.window.Node.TEXT_NODE) {
      throw new Error(`expected underline node after toolbar action input, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    const collapsedRange = doc.createRange()
    collapsedRange.setStart(underlineTextNode, 2)
    collapsedRange.setEnd(underlineTextNode, 2)
    sel.removeAllRanges()
    sel.addRange(collapsedRange)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(6)
    })

    if (!String(editor.innerHTML || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected underline to stay rendered after input-plus-release, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    if (String(editor.textContent || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected underline not to literalize into text after input-plus-release, got text=${JSON.stringify(editor.textContent || '')}`)
    }
  } finally {
    restoreExecCommand()
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

export async function testMarkdownWorkspaceViewerUnderlineCommitKeepsRenderedPreview() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const restoreExecCommand = installInlineExecCommandStub(dom, ['underline'])
  const doc = dom.window.document
  const container = doc.createElement('section')
  const outsideButton = doc.createElement('button')
  outsideButton.type = 'button'
  outsideButton.textContent = 'outside'
  doc.body.appendChild(outsideButton)
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  try {
    const Harness = () => {
      const [activeText, setActiveText] = React.useState('Viewer edit line one')
      return React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light', uiPanelTextFontClass: 'font-sans', uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: false, setExplorerOpen: () => void 0, layoutMode: 'viewer', setLayoutMode: () => void 0,
        markdownWordWrap: true, setMarkdownWordWrap: () => void 0, markdownTextHighlight: false, setMarkdownTextHighlight: () => void 0,
        onToggleFullscreen: () => void 0,
        presentationApiRef: { current: null },
        isMarkdown: true,
        activeText,
        setActiveText,
        activeDocumentKey: '/viewer-edit-underline-commit-test.md',
        highlightedLineRange: null,
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: 'file:///viewer-edit-underline-commit-test.md',
        editorLanguage: 'markdown',
        editorRef: { current: null },
      })
    }
    await act(async () => {
      root.render(React.createElement(Harness))
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after single-click open')
    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object')
    sel.removeAllRanges()
    sel.addRange(range)

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar')
    const underlineButton = toolbar.querySelector('button[title="Underline"]') as HTMLButtonElement | null
    if (!underlineButton) throw new Error('expected underline button')
    await act(async () => {
      underlineButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      underlineButton.click()
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, inputType: 'formatUnderline' }))
      await tick(6)
    })

    await act(async () => {
      outsideButton.focus()
      editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true, cancelable: true, relatedTarget: outsideButton }))
      editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true, cancelable: true, relatedTarget: outsideButton }))
      await waitMs(260)
      await tick(8)
    })

    const editorAfterCommit = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (editorAfterCommit) throw new Error('expected inline editor to commit and close after focus leaves editor')
    const renderedUnderline = (Array.from(container.querySelectorAll('u')) as HTMLElement[]).find(node => String(node.textContent || '').includes('Viewer'))
    if (!renderedUnderline) {
      throw new Error(`expected committed Viewer preview to keep rendered underline, got html=${JSON.stringify(container.innerHTML || '')}`)
    }
    if (String(container.textContent || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected committed Viewer preview not to literalize underline html, got text=${JSON.stringify(container.textContent || '')}`)
    }
  } finally {
    restoreExecCommand()
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {
      void 0
    }
    outsideButton.remove()
    restore()
  }
}

async function runViewerInlineCommitPreviewFormattingCase(args: {
  activeText: string
  activeDocumentKey: string
  actionTitle: string
  actionMenuLabel?: string
  actionButtonText?: string
  expectedEditorHtmlSnippet: string
  expectedSelector: string
  expectedText: string
  unexpectedLiteralText?: string
}) {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  let latestActiveText = args.activeText

  try {
    const Harness = () => {
      const [activeText, setActiveText] = React.useState(args.activeText)
      return React.createElement(MarkdownWorkspaceMain, {
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
        activeText,
        setActiveText: (next: string) => {
          latestActiveText = next
          setActiveText(next)
        },
        activeDocumentKey: args.activeDocumentKey,
        highlightedLineRange: null,
        revealLineInEditor: () => void 0,
        showInViewer: () => void 0,
        showInPresentation: () => void 0,
        showInGallery: () => void 0,
        editorUri: `file://${args.activeDocumentKey}`,
        editorLanguage: 'markdown',
        editorRef: { current: null },
      })
    }
    await act(async () => {
      root.render(React.createElement(Harness))
      await tick(6)
    })

    const markdownPaneToggle = doc.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    const jsonPaneToggle = doc.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
    if (!markdownPaneToggle || !jsonPaneToggle) throw new Error('expected split pane toggles for Viewer commit preview test')
    await act(async () => {
      if (!markdownPaneToggle.checked) markdownPaneToggle.click()
      jsonPaneToggle.click()
      await tick(6)
    })

    const host = container.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected viewer first line host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 16, clientY: 16 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor after single-click open')
    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const sel = dom.window.getSelection()
    if (!sel) throw new Error('expected selection object')
    sel.removeAllRanges()
    sel.addRange(range)

    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected floating selection toolbar')
    if (args.actionMenuLabel) {
      const summary = toolbar.querySelector(`button[title="${args.actionTitle}"]`) as HTMLButtonElement | null
      if (!summary) throw new Error(`expected ${args.actionTitle} menu trigger`)
      await act(async () => {
        summary.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
        summary.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        summary.click()
        await tick(2)
      })
      const menuButtons = Array.from(doc.querySelectorAll(`menu[aria-label="${args.actionMenuLabel}"] button`)) as HTMLButtonElement[]
      const button = menuButtons.find(candidate => String(candidate.textContent || '').trim() === String(args.actionButtonText || '').trim()) || null
      if (!button) throw new Error(`expected ${args.actionButtonText} button`)
      await act(async () => {
        button.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
        button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        button.click()
        await tick(6)
      })
    } else {
      const button = toolbar.querySelector(`button[title="${args.actionTitle}"]`) as HTMLButtonElement | null
      if (!button) throw new Error(`expected ${args.actionTitle} button`)
      await act(async () => {
        button.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
        button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        button.click()
        await tick(6)
      })
    }
    const liveEditor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!liveEditor) throw new Error('expected live inline editor after toolbar action')
    if (!String(liveEditor.innerHTML || '').includes(args.expectedEditorHtmlSnippet)) {
      throw new Error(`expected editor html to include ${args.expectedEditorHtmlSnippet}; got ${JSON.stringify(liveEditor.innerHTML || '')}`)
    }

    await act(async () => {
      liveEditor.focus()
      liveEditor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ctrlKey: true }))
      await waitMs(90)
      await tick(8)
    })

    const editorAfterCommit = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (editorAfterCommit) throw new Error('expected inline editor to commit and close after explicit commit')
    const renderedNode = (Array.from(container.querySelectorAll(args.expectedSelector)) as HTMLElement[]).find(
      node => String(node.textContent || '').includes(args.expectedText),
    )
    if (!renderedNode) {
      throw new Error(`expected committed Viewer preview to keep rendered formatting; source=${JSON.stringify(latestActiveText)} html=${JSON.stringify(container.innerHTML || '')}`)
    }
    const previewRoot = container.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
    const previewText = String(previewRoot?.textContent || '')
    if (args.unexpectedLiteralText && previewText.includes(args.unexpectedLiteralText)) {
      throw new Error(`expected committed Viewer preview not to literalize formatting, got text=${JSON.stringify(previewText)}`)
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

export async function testMarkdownWorkspaceViewerHighlightCommitKeepsRenderedPreview() {
  await runViewerInlineCommitPreviewFormattingCase({
    activeText: 'Viewer edit line one',
    activeDocumentKey: '/viewer-edit-highlight-commit-test.md',
    actionTitle: 'Highlight',
    actionMenuLabel: 'Highlight menu',
    actionButtonText: 'Default (==)',
    expectedEditorHtmlSnippet: 'data-kg-default-highlight="1"',
    expectedSelector: 'mark',
    expectedText: 'Viewer',
    unexpectedLiteralText: '==Viewer==',
  })
}

export async function testMarkdownWorkspaceViewerTextColorCommitKeepsRenderedPreview() {
  await runViewerInlineCommitPreviewFormattingCase({
    activeText: 'Viewer edit line one',
    activeDocumentKey: '/viewer-edit-text-color-commit-test.md',
    actionTitle: 'Text color',
    actionMenuLabel: 'Text color menu',
    actionButtonText: 'Red',
    expectedEditorHtmlSnippet: 'data-kg-sigil-color="#EF4444"',
    expectedSelector: '[data-kg-sigil="1"]',
    expectedText: 'Viewer',
    unexpectedLiteralText: '#EF4444:Viewer',
  })
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

  const workspaceMainPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx')
  const workspaceMainText = readFileSync(workspaceMainPath, 'utf8')
  if (
    !/const\s+editableMarkdownText\s*=/.test(workspaceMainText)
    || !workspaceMainText.includes('viewerInlineMarkdownDraftText ??')
    || !workspaceMainText.includes("isJsonMarkdownEditing\n      ? (jsonDerivedMarkdownDraft ?? jsonDerivedMarkdownBase ?? '')")
    || !workspaceMainText.includes('sourceAttachedMarkdownTableText ?? activeText')
  ) {
    throw new Error('expected MarkdownWorkspaceMain to centralize json-backed markdown edits through the visible markdown draft SSOT')
  }
  if (!workspaceMainText.includes('const commitMarkdownEditText = React.useCallback(')) {
    throw new Error('expected MarkdownWorkspaceMain to centralize json-backed markdown writes behind a shared commit helper')
  }
  if (!workspaceMainText.includes('commitMarkdownEditText(next)')) {
    throw new Error('expected MarkdownWorkspaceMain viewer handlers to reuse the shared markdown commit helper')
  }
  if (!workspaceMainText.includes('markdownText: persistedEditableMarkdownText')) {
    throw new Error('expected MarkdownWorkspaceMain line-range replacement to edit the json-derived markdown draft instead of raw active JSON text')
  }
}
