import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

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

const buildLargeMarkdownText = () => {
  const paragraph = 'Large imported viewer content keeps selectable text editable with high source fidelity. '.repeat(3600)
  return ['# Large imported viewer', '', paragraph].join('\n')
}

export async function testLargeMarkdownViewerKeepsInlineSelectionToolbar() {
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
          activeText: buildLargeMarkdownText(),
          setActiveText: () => void 0,
          activeDocumentKey: '/large-viewer-toolbar.md',
          highlightedLineRange: null,
          revealLineInEditor: () => void 0,
          showInViewer: () => void 0,
          showInPresentation: () => void 0,
          showInGallery: () => void 0,
          editorUri: 'file:///large-viewer-toolbar.md',
          editorLanguage: 'markdown',
          editorRef: { current: null },
        }),
      )
      await tick(8)
    })

    const largeViewer = container.querySelector('[data-kg-large-markdown-viewer="1"]') as HTMLElement | null
    if (!largeViewer) throw new Error('expected large imported markdown to use large-document viewer mode')

    const reorderHandle = container.querySelector('button[draggable="true"]') as HTMLButtonElement | null
    if (reorderHandle) throw new Error('expected large-document viewer to keep heavyweight block reorder controls disabled')

    const host = container.querySelector('[data-start-line="3"]') as HTMLElement | null
    if (!host) throw new Error('expected large viewer paragraph host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 720, bottom: 80, width: 720, height: 80, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 18, clientY: 18 }))
      await tick(6)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected large viewer block to remain inline-editable')

    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected large viewer editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(8, String(textNode.textContent || '').length))
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    selection.removeAllRanges()
    selection.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const inlineToolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!inlineToolbar) throw new Error('expected inline floating formatting toolbar for large markdown viewer')
    const boldButton = inlineToolbar.querySelector('button[title="Bold"]') as HTMLButtonElement | null
    if (!boldButton) throw new Error('expected inline floating formatting toolbar to expose formatting actions')
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
