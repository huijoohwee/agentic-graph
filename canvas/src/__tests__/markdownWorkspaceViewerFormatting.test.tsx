import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { tick, waitMs, ensureRangeRect, installInlineExecCommandStub, enableWorkspaceViewerPane } from './helpers/markdownWorkspaceInlineEditHarness'

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

    await enableWorkspaceViewerPane(doc)

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
