import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { tick, waitMs, ensureRangeRect, installInlineExecCommandStub, enableWorkspaceViewerPane } from './markdownWorkspaceInlineEditHarness'

export const waitForCondition = async (condition: () => boolean, attempts: number = 60, delayMs: number = 10) => {
  for (let i = 0; i < attempts; i += 1) {
    if (condition()) return true
    await waitMs(delayMs)
  }
  return condition()
}

export const findTextNodeBySubstring = (root: Node, needle: string): Text | null => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null
  while (current) {
    if (String(current.nodeValue || '').includes(needle)) return current
    current = walker.nextNode() as Text | null
  }
  return null
}

export const pressToolbarControl = async (
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  element: HTMLElement,
  waitTicks: number = 6,
) => {
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.click()
    await tick(waitTicks)
  })
}

export async function runViewerToolbarActionCase(args: {
  activeText: string
  action: (ctx: {
    dom: ReturnType<typeof initJsdomHarness>['dom']
    doc: Document
    toolbar: HTMLElement
  }) => Promise<void>
  commitAfterAction?: boolean
  expectedMarkdownSnippet: string
  expectedJsonSnippet?: string | null
  expectedEditorHtmlSnippet?: string
  promptResponse?: string | ((message: string, initialValue: string) => string | null)
}) {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const restoreExecCommand = installInlineExecCommandStub(dom, ['underline', 'bold', 'italic', 'strikeThrough'])
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  let latestActiveText = args.activeText
  const originalPrompt = dom.window.prompt
  dom.window.prompt = ((message?: string, defaultValue?: string) => {
    if (typeof args.promptResponse === 'function') {
      return args.promptResponse(String(message || ''), String(defaultValue || ''))
    }
    if (typeof args.promptResponse === 'string') return args.promptResponse
    return String(defaultValue || '')
  }) as typeof dom.window.prompt
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
      activeDocumentKey: '/viewer-floating-toolbar-html-actions.md',
      highlightedLineRange: null,
      revealLineInEditor: () => void 0,
      showInViewer: () => void 0,
      showInPresentation: () => void 0,
      showInGallery: () => void 0,
      editorUri: 'file:///viewer-floating-toolbar-html-actions.md',
      editorLanguage: 'markdown',
      editorRef: { current: null },
    })
  }

  const failures: unknown[] = []
  try {
    await act(async () => {
      root.render(React.createElement(Harness))
      await tick(6)
    })

    const markdownPaneToggle = doc.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    const jsonPaneToggle = doc.querySelector('input[aria-label="Show JSON editor pane"]') as HTMLInputElement | null
    if (!markdownPaneToggle || !jsonPaneToggle) throw new Error('expected split pane toggles for Viewer toolbar html actions test')
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
      await tick(5)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected inline viewer editor')
    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected inline editor text node')
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    selection.removeAllRanges()
    selection.addRange(range)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected inline selection toolbar')
    await args.action({ dom, doc, toolbar })
    await act(async () => {
      await tick(6)
    })

    if (args.expectedEditorHtmlSnippet) {
      const liveEditor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor after toolbar action')
      if (!String(liveEditor.innerHTML || '').includes(args.expectedEditorHtmlSnippet)) {
        throw new Error(`expected editor html to include ${args.expectedEditorHtmlSnippet}; got ${JSON.stringify(liveEditor.innerHTML || '')}`)
      }
    }

    if (args.commitAfterAction) {
      const liveEditor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor before commit')
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ctrlKey: true }))
        await waitMs(90)
        await tick(6)
      })
    }

    const markdownEditorTextarea = container.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!markdownEditorTextarea) throw new Error('expected Markdown editor textarea')
    const expectedJsonSnippet = typeof args.expectedJsonSnippet === 'string' ? args.expectedJsonSnippet : args.expectedJsonSnippet === null ? null : args.expectedMarkdownSnippet
    const jsonEditorTextarea = container.querySelector('textarea[aria-label="JSON Editor Text"]') as HTMLTextAreaElement | null
    if (!jsonEditorTextarea) throw new Error('expected JSON editor textarea')
    await act(async () => {
      await waitForCondition(() => {
        const markdownReady =
          latestActiveText.includes(args.expectedMarkdownSnippet)
          || String(markdownEditorTextarea.value || '').includes(args.expectedMarkdownSnippet)
        const jsonReady = expectedJsonSnippet ? String(jsonEditorTextarea.value || '').includes(expectedJsonSnippet) : true
        return markdownReady && jsonReady
      })
    })
    if (!latestActiveText.includes(args.expectedMarkdownSnippet) && !String(markdownEditorTextarea.value || '').includes(args.expectedMarkdownSnippet)) {
      throw new Error(
        `expected Markdown source to include ${args.expectedMarkdownSnippet}; source=${JSON.stringify(latestActiveText)} pane=${JSON.stringify(markdownEditorTextarea.value || '')}`,
      )
    }
    if (expectedJsonSnippet && !String(jsonEditorTextarea.value || '').includes(expectedJsonSnippet)) {
      throw new Error(`expected JSON pane to include ${expectedJsonSnippet}; got ${JSON.stringify(jsonEditorTextarea.value || '')}`)
    }
  } catch (error) {
    failures.push(error)
  } finally {
    for (const cleanup of [
      () => { dom.window.prompt = originalPrompt },
      restoreExecCommand,
      async () => { await act(async () => { root.unmount() }) },
      restore,
    ]) {
      try {
        await cleanup()
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, failures.map(error => error instanceof Error ? error.message : String(error)).join('; '))
  }
}
