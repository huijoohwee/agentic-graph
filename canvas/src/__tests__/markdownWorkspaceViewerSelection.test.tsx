import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { tick, ensureRangeRect, enableWorkspaceViewerPane } from './helpers/markdownWorkspaceInlineEditHarness'

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

    await enableWorkspaceViewerPane(doc)

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
