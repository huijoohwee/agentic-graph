import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const waitMs = async (ms: number) => {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

const waitForCondition = async (condition: () => boolean, attempts: number = 60, delayMs: number = 10) => {
  for (let i = 0; i < attempts; i += 1) {
    if (condition()) return true
    await waitMs(delayMs)
  }
  return condition()
}

const findTextNodeBySubstring = (root: Node, needle: string): Text | null => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null
  while (current) {
    if (String(current.nodeValue || '').includes(needle)) return current
    current = walker.nextNode() as Text | null
  }
  return null
}

const pressToolbarControl = async (
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

async function runViewerToolbarActionCase(args: {
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
  } finally {
    dom.window.prompt = originalPrompt
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

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarHtmlActionsSyncMarkdownAndJsonPanes() {
  await runViewerToolbarActionCase({
    activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '<u>Viewer</u>',
    expectedEditorHtmlSnippet: '<u>Viewer</u>',
    action: async ({ dom, doc, toolbar }) => {
      const button = toolbar.querySelector('button[title="Underline"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected underline button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '==Viewer==',
    expectedEditorHtmlSnippet: 'data-kg-default-highlight="1"',
    action: async ({ dom, doc, toolbar }) => {
      const trigger = toolbar.querySelector('button[aria-label="Highlight"]') as HTMLElement | null
      if (!trigger) throw new Error('expected highlight trigger')
      await pressToolbarControl(dom, trigger, 2)
      const button = doc.querySelector('menu[aria-label="Highlight menu"] button') as HTMLButtonElement | null
      if (!button) throw new Error('expected default highlight button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '`#EF4444:Viewer`',
    expectedEditorHtmlSnippet: 'data-kg-sigil-color="#EF4444"',
    action: async ({ dom, doc, toolbar }) => {
      const trigger = toolbar.querySelector('button[aria-label="Text color"]') as HTMLElement | null
      if (!trigger) throw new Error('expected text color trigger')
      await pressToolbarControl(dom, trigger, 2)
      const button = doc.querySelector('menu[aria-label="Text color menu"] button') as HTMLButtonElement | null
      if (!button) throw new Error('expected text color button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '<!-- comment | id: c-001 | author: TODO | text: Explain the Viewer wording choice. -->',
    expectedJsonSnippet: '<!-- comment | id: c-001 | author: TODO | text: Explain the Viewer wording choice. -->',
    promptResponse: 'Explain the Viewer wording choice.',
    action: async ({ dom, doc }) => {
      const button = doc.querySelector('menu[aria-label="Inline selection toolbar"] button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      if (!button.isConnected) throw new Error('expected connected comment button before press')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!dom.window.document.querySelector('[data-kg-comment-rich-media-preview="1"] [data-testid="markdown-preview-root"]'), 20, 5)
      const previewRoot = dom.window.document.querySelector('[data-kg-comment-rich-media-preview="1"] [data-testid="markdown-preview-root"]')
      if (!previewRoot) {
        const body = String(dom.window.document.body.innerHTML || '')
        throw new Error(`expected comment action to reuse the shared Markdown preview overlay; hasPreview=${body.includes('data-kg-comment-rich-media-preview')}; hasMarkdownPreview=${body.includes('data-testid="markdown-preview-root"')}; hasEditor=${body.includes('contenteditable="true"')}; hasComment=${body.includes('data-kg-comment')}`)
      }
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor after comment preview action')
      if (String(liveEditor.innerHTML || '').includes('data-kg-comment')) {
        throw new Error(`expected comment preview action not to mutate WYSIWYG surface; got ${JSON.stringify(liveEditor.innerHTML || '')}`)
      }
    },
  })

  await runViewerToolbarActionCase({
    activeText: ['Viewer sync line one', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '- [ ] Viewer sync line one',
    expectedJsonSnippet: '[ ] Viewer sync line one',
    action: async ({ dom, doc, toolbar }) => {
      const trigger = toolbar.querySelector('button[aria-label="More"]') as HTMLElement | null
      if (!trigger) throw new Error('expected more trigger')
      await pressToolbarControl(dom, trigger, 2)
      const buttons = Array.from(doc.querySelectorAll('menu[aria-label="More actions"] button')) as HTMLButtonElement[]
      const checklistButton = buttons.find(candidate => String(candidate.textContent || '').trim() === 'Checklist') || null
      if (!checklistButton) throw new Error('expected checklist button')
      await pressToolbarControl(dom, checklistButton)
    },
  })
}

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarCommandMenusExposeSlashAndVariableActions() {
  await runViewerToolbarActionCase({
    activeText: ['Viewer command menu line', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: '- [ ] Viewer command menu line',
    expectedJsonSnippet: '[ ] Viewer command menu line',
    action: async ({ dom, doc, toolbar }) => {
      const button = toolbar.querySelector('button[title="Slash commands"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected slash command button')
      await pressToolbarControl(dom, button, 4)
      const input = doc.querySelector('section[aria-label="Slash commands"] input[placeholder="Type a command"]') as HTMLInputElement | null
      if (!input) throw new Error(`expected searchable slash command input; html=${doc.body.innerHTML}`)
      const commandButtons = Array.from(doc.querySelectorAll('section[aria-label="Slash commands"] button')) as HTMLButtonElement[]
      const codeBlockButton = commandButtons.find(candidate => String(candidate.textContent || '').includes('Code block')) || null
      if (!codeBlockButton) throw new Error('expected slash command menu to expose Code block action')
      const checklistButton = commandButtons.find(candidate => String(candidate.textContent || '').includes('Checklist')) || null
      if (!checklistButton) throw new Error('expected slash command menu to expose Checklist action')
      await pressToolbarControl(dom, checklistButton)
    },
  })

  await runViewerToolbarActionCase({
    activeText: ['Viewer variable command line', '', 'Viewer sync line two'].join('\n'),
    expectedMarkdownSnippet: 'Viewer variable command line',
    expectedJsonSnippet: 'Viewer variable command line',
    action: async ({ dom, doc, toolbar }) => {
      const button = toolbar.querySelector('button[title="Variable commands"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected variable command button')
      await pressToolbarControl(dom, button, 4)
      const input = doc.querySelector('section[aria-label="Variable toolbar"] input[placeholder="Find variable or action"]') as HTMLInputElement | null
      if (!input) throw new Error(`expected searchable variable command input; html=${doc.body.innerHTML}`)
      const commandText = String(doc.querySelector('section[aria-label="Variable toolbar"]')?.textContent || '')
      if (!commandText.includes('New variable')) throw new Error(`expected variable command menu to expose New variable action; text=${JSON.stringify(commandText)}`)
      if (!commandText.includes('Fallback reference')) throw new Error(`expected variable command menu to expose Fallback reference action; text=${JSON.stringify(commandText)}`)
    },
  })
}


export async function testMarkdownWorkspaceViewerCommentPreviewReusesMarkdownTimestampLinkPreview() {
  const timestampUrl = 'https://youtu.be/dQw4w9WgXcQ?t=421'
  await runViewerToolbarActionCase({
    activeText: `${timestampUrl} transcript marker`,
    expectedMarkdownSnippet: `\`@comment:c-001\`${timestampUrl}\`@comment:c-001\``,
    expectedJsonSnippet: `\`@comment:c-001\`${timestampUrl}\`@comment:c-001\``,
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, timestampUrl)
      if (!textNode) throw new Error(`expected timestamp url text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf(timestampUrl)
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + timestampUrl.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!doc.querySelector('[data-kg-comment-rich-media-preview="1"]'), 20, 5)
      const link = doc.querySelector(`[data-kg-comment-rich-media-preview="1"] a[data-kg-youtube-timestamp-link="1"][href="${timestampUrl}"]`) as HTMLAnchorElement | null
      if (!link) {
        throw new Error(`expected comment preview to render timestamp url as normal Markdown timestamp link; html=${doc.body.innerHTML}`)
      }
      if (String(link.textContent || '').trim() !== '7:01') {
        throw new Error(`expected comment preview timestamp link label to normalize through the shared Markdown timestamp-link path; text=${JSON.stringify(link.textContent || '')}`)
      }
      link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
      await tick(2)
      const preview = doc.querySelector('[data-kg-youtube-timestamp-preview="1"]') as HTMLElement | null
      if (!preview) throw new Error(`expected comment preview timestamp link hover to reuse shared preview; html=${doc.body.innerHTML}`)
      const snapshot = preview.querySelector('[data-kg-video-snapshot="1"]') as HTMLElement | null
      if (!snapshot) throw new Error('expected comment preview timestamp hover to reuse shared video snapshot surface')
      if (String(snapshot.getAttribute('data-src') || '') !== timestampUrl) {
        throw new Error(`expected comment preview timestamp snapshot to preserve the requested timestamp source URL; got=${snapshot.getAttribute('data-src') || ''}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerCommentActionDoesNotRewriteLiveSelectionDuringToolbarBlur() {
  await runViewerToolbarActionCase({
    activeText: 'Viewer sync line one',
    expectedMarkdownSnippet: '`@comment:c-001`Viewer`@comment:c-001` sync line one',
    expectedJsonSnippet: '`@comment:c-001`Viewer`@comment:c-001` sync line one',
    action: async ({ dom, doc, toolbar }) => {
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor after comment action')
      if (String(liveEditor.innerHTML || '').includes('data-kg-comment')) {
        throw new Error(`expected comment action not to rewrite the active selection into a comment indicator during toolbar click; got ${JSON.stringify(liveEditor.innerHTML || '')}`)
      }
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.FocusEvent('blur', { relatedTarget: null }))
        await waitMs(120)
        await tick(6)
      })
    },
  })
}

export async function testMarkdownWorkspaceViewerCommentHoverUsesCompactIndicatorPreview() {
  await runViewerToolbarActionCase({
    activeText: 'Before <!-- hidden viewer note --> after',
    commitAfterAction: false,
    expectedMarkdownSnippet: '<!-- hidden viewer note -->',
    expectedJsonSnippet: '<!-- hidden viewer note -->',
    expectedEditorHtmlSnippet: 'data-kg-comment="1"',
    action: async ({ dom, doc }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor for comment hover preview test')
      await waitForCondition(() => !!liveEditor.querySelector('[data-kg-comment="1"]'), 20, 5)
      const comment = liveEditor.querySelector('[data-kg-comment="1"]') as HTMLElement | null
      if (!comment) throw new Error(`expected existing HTML comment to render as an inline indicator; html=${liveEditor.innerHTML}`)
      if (String(comment.textContent || '').trim() !== '...') {
        throw new Error(`expected comment indicator to reuse compact ellipsis affordance; text=${JSON.stringify(comment.textContent || '')}`)
      }
      if (String(comment.getAttribute('data-kg-comment-text') || '') !== 'hidden viewer note') {
        throw new Error(`expected comment indicator to preserve raw comment text in data; raw=${JSON.stringify(comment.getAttribute('data-kg-comment-text') || '')}`)
      }
      await act(async () => {
        comment.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      await waitForCondition(() => !!doc.querySelector('[data-kg-comment-rich-media-preview="1"]'), 20, 5)
      const preview = doc.querySelector('[data-kg-comment-rich-media-preview="1"]') as HTMLElement | null
      if (!preview) throw new Error('expected comment hover to reveal the shared comment preview overlay')
      if (!String(preview.textContent || '').includes('hidden viewer note')) {
        throw new Error(`expected comment hover preview to expose the raw comment text; text=${JSON.stringify(preview.textContent || '')}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerTaskRowUnderlineKeepsRenderedUnderlineOnMouseRelease() {
  const { dom, restore } = initJsdomHarness()
  ensureRangeRect(dom)
  const restoreExecCommand = installInlineExecCommandStub(dom, ['underline'])
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)

  const Harness = () => {
    const [activeText, setActiveText] = React.useState([
      '- [ ] Viewer sync line one',
      '- [ ] Viewer sync line two',
    ].join('\n'))
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
      setActiveText,
      activeDocumentKey: '/viewer-task-row-underline.md',
      highlightedLineRange: null,
      revealLineInEditor: () => void 0,
      showInViewer: () => void 0,
      showInPresentation: () => void 0,
      showInGallery: () => void 0,
      editorUri: 'file:///viewer-task-row-underline.md',
      editorLanguage: 'markdown',
      editorRef: { current: null },
    })
  }

  try {
    await act(async () => {
      root.render(React.createElement(Harness))
      await tick(6)
    })

    const markdownPaneToggle = doc.querySelector('input[aria-label="Show Markdown editor pane"]') as HTMLInputElement | null
    if (!markdownPaneToggle) throw new Error('expected markdown pane toggle')
    await act(async () => {
      if (!markdownPaneToggle.checked) markdownPaneToggle.click()
      await tick(4)
    })

    const host = (() => {
      const row = container.querySelector('[data-kg-list-item-start-line="1"]') as HTMLElement | null
      if (!row) return container.querySelector('[data-start-line="1"]') as HTMLElement | null
      return (row.querySelector('[data-start-line="1"]') as HTMLElement | null) || row
    })()
    if (!host) throw new Error('expected first task row host')
    host.getBoundingClientRect = () => {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 460, bottom: 60, width: 460, height: 60, toJSON: () => ({}),
      } as unknown as DOMRect
    }

    await act(async () => {
      host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 20, clientY: 16 }))
      await tick(5)
    })

    const editor = container.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected inline task row editor')
    const textNode = editor.firstChild
    if (!textNode || textNode.nodeType !== dom.window.Node.TEXT_NODE) throw new Error('expected task row editor text node')

    const initialRange = doc.createRange()
    initialRange.setStart(textNode, 0)
    initialRange.setEnd(textNode, Math.min(6, String(textNode.textContent || '').length))
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection object')
    selection.removeAllRanges()
    selection.addRange(initialRange)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(4)
    })

    const toolbar = doc.querySelector('menu[aria-label="Inline selection toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error('expected inline selection toolbar')
    const underlineButton = toolbar.querySelector('button[title="Underline"]') as HTMLButtonElement | null
    if (!underlineButton) throw new Error('expected underline button')
    await act(async () => {
      underlineButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      underlineButton.click()
      await tick(6)
    })

    const underlineTextNode = editor.querySelector('u')?.firstChild
    if (!underlineTextNode || underlineTextNode.nodeType !== dom.window.Node.TEXT_NODE) {
      throw new Error(`expected task row underline node after toolbar action, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    const collapsedRange = doc.createRange()
    collapsedRange.setStart(underlineTextNode, 2)
    collapsedRange.setEnd(underlineTextNode, 2)
    selection.removeAllRanges()
    selection.addRange(collapsedRange)
    doc.dispatchEvent(new dom.window.Event('selectionchange'))
    await act(async () => {
      editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      await tick(6)
    })

    if (!String(editor.innerHTML || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected task row underline to stay rendered after mouse release, got html=${JSON.stringify(editor.innerHTML || '')}`)
    }
    if (String(editor.textContent || '').includes('<u>Viewer</u>')) {
      throw new Error(`expected task row underline not to literalize after mouse release, got text=${JSON.stringify(editor.textContent || '')}`)
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

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarCommentSupportsInlineSemanticAndFootnoteSelections() {
  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and `@node:callout-alert-1` and `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '<!-- metadata | type: key | value: Ctrl+S | note: Reuse the same shortcut label in toolbar copy. -->',
    expectedJsonSnippet: '<!-- metadata | type: key | value: Ctrl+S | note: Reuse the same shortcut label in toolbar copy. -->',
    promptResponse: 'Reuse the same shortcut label in toolbar copy.',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      if (!String(liveEditor.innerHTML || '').includes('data-kg-inline-code-token="1"')) {
        throw new Error(`expected semantic inline tokens on edit surface; html=${liveEditor.innerHTML}`)
      }
      if (!String(liveEditor.textContent || '').includes('[^1]')) {
        throw new Error(`expected footnote ref text to remain selectable on edit surface; html=${liveEditor.innerHTML}`)
      }
      const textNode = findTextNodeBySubstring(liveEditor, '@key:Ctrl+S')
      if (!textNode) throw new Error(`expected semantic text node for metadata token; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('@key:Ctrl+S')
      if (start < 0) throw new Error('expected metadata token start offset')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '@key:Ctrl+S'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!dom.window.document.querySelector('[data-kg-comment-rich-media-preview="1"] [data-testid="markdown-preview-root"]'), 20, 5)
    },
  })

  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and `@node:callout-alert-1` and `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '[^1]: Citation body',
    expectedJsonSnippet: '[^1]: Citation body',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '[^1]')
      if (!textNode) throw new Error(`expected footnote ref text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('[^1]')
      if (start < 0) throw new Error('expected footnote ref start offset')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '[^1]'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!dom.window.document.querySelector('[data-kg-comment-rich-media-preview="1"] [data-testid="markdown-preview-root"]'), 20, 5)
    },
  })

  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and `@node:callout-alert-1` and `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '<!-- callout | id: callout-alert-1 | type: note | title: callout-alert-1 note pending -->',
    expectedJsonSnippet: '<!-- callout | id: callout-alert-1 | type: note | title: callout-alert-1 note pending -->',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '@node:callout-alert-1')
      if (!textNode) throw new Error(`expected semantic text node for callout ref; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('@node:callout-alert-1')
      if (start < 0) throw new Error('expected callout ref start offset')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '@node:callout-alert-1'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!dom.window.document.querySelector('[data-kg-comment-rich-media-preview="1"] [data-testid="markdown-preview-root"]'), 20, 5)
    },
  })
}

export async function testMarkdownWorkspaceViewerHtmlCommentMarkersDifferentiateAuthorNotesAndAppendixReviewComments() {
  await runViewerToolbarActionCase({
    activeText: 'Before <!-- // @todo: keep hidden from viewer body --> <!-- comment | id: c-001 | author: A. Hui | text: Long annotation in appendix for AI-ready phrasing. --> after',
    commitAfterAction: false,
    expectedMarkdownSnippet: '<!-- comment | id: c-001 | author: A. Hui | text: Long annotation in appendix for AI-ready phrasing. -->',
    expectedJsonSnippet: null,
    expectedEditorHtmlSnippet: 'data-kg-comment-review="1"',
    action: async ({ dom, doc }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor for appendix comment marker test')
      await waitForCondition(() => !!liveEditor.querySelector('[data-kg-comment-review="1"]'), 20, 5)
      const reviewComment = liveEditor.querySelector('[data-kg-comment-review="1"]') as HTMLElement | null
      if (!reviewComment) {
        throw new Error(`expected appendix review comment marker to stay previewable on edit surface; html=${liveEditor.innerHTML}`)
      }
      if (!String(reviewComment.getAttribute('data-kg-comment-text') || '').includes('A. Hui c-001: Long annotation in appendix for AI-ready phrasing.')) {
        throw new Error(`expected review comment marker to expose parsed preview text; raw=${JSON.stringify(reviewComment.getAttribute('data-kg-comment-text') || '')}`)
      }
      const hiddenMarkers = liveEditor.querySelectorAll('[data-kg-comment-hidden="1"]')
      if (hiddenMarkers.length < 1) {
        throw new Error(`expected author notes to stay hidden but preserved on the edit surface; html=${liveEditor.innerHTML}`)
      }
      await act(async () => {
        reviewComment.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      await waitForCondition(() => !!doc.querySelector('[data-kg-comment-rich-media-preview="1"]'), 20, 5)
      const preview = doc.querySelector('[data-kg-comment-rich-media-preview="1"]') as HTMLElement | null
      if (!preview) throw new Error('expected review comment marker hover to reveal the shared comment preview overlay')
      if (!String(preview.textContent || '').includes('Long annotation in appendix for AI-ready phrasing.')) {
        throw new Error(`expected review comment preview to show the appendix comment text; text=${JSON.stringify(preview.textContent || '')}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarCommentSelectionPreservesWholeExistingReviewCommentToken() {
  const rawComment = '<!-- comment | id: c-001 | author: A. Hui | text: Long annotation in appendix for AI-ready phrasing. -->'
  await runViewerToolbarActionCase({
    activeText: `Before ${rawComment} after`,
    commitAfterAction: false,
    expectedMarkdownSnippet: rawComment,
    expectedJsonSnippet: rawComment,
    expectedEditorHtmlSnippet: 'data-kg-comment-review="1"',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      await waitForCondition(() => !!liveEditor.querySelector('[data-kg-comment-review="1"]'), 20, 5)
      const reviewComment = liveEditor.querySelector('[data-kg-comment-review="1"]') as HTMLElement | null
      if (!reviewComment) throw new Error(`expected review comment token in live editor; html=${liveEditor.innerHTML}`)
      const commentTextNode = findTextNodeBySubstring(reviewComment, 'Long annotation')
      if (!commentTextNode) throw new Error(`expected selectable text node inside review comment token; html=${reviewComment.outerHTML}`)
      const textValue = String(commentTextNode.nodeValue || '')
      const start = textValue.indexOf('Long annotation')
      const range = doc.createRange()
      range.setStart(commentTextNode, start)
      range.setEnd(commentTextNode, start + 'Long annotation'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Comment"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected comment button')
      await pressToolbarControl(dom, button)
      await waitForCondition(() => !!doc.querySelector('[data-kg-comment-rich-media-preview="1"]'), 20, 5)
      const preview = doc.querySelector('[data-kg-comment-rich-media-preview="1"]') as HTMLElement | null
      if (!preview) throw new Error('expected existing review comment selection to open preview instead of nesting HTML comments')
      if (!String(preview.textContent || '').includes('Long annotation in appendix for AI-ready phrasing.')) {
        throw new Error(`expected review comment preview to reuse parsed appendix comment text; text=${JSON.stringify(preview.textContent || '')}`)
      }
      const editorHtml = String(liveEditor.innerHTML || '')
      if ((editorHtml.match(/data-kg-comment-review="1"/g) || []).length !== 1) {
        throw new Error(`expected existing review comment selection not to duplicate/nest rendered comment markers; html=${editorHtml}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerCommentRangeReopensAsNonLiteralIndicator() {
  await runViewerToolbarActionCase({
    activeText: [
      'Before `@comment:c-001`Viewer`@comment:c-001` after',
      '',
      '---',
      '',
      '<!-- appendix -->',
      '',
      '<!-- comment | id: c-001 | author: TODO | text: TODO: add long comment for "Viewer". -->',
      '<!-- /comment -->',
      '',
      '<!-- /appendix -->',
    ].join('\n'),
    commitAfterAction: false,
    expectedMarkdownSnippet: '`@comment:c-001`Viewer`@comment:c-001`',
    expectedJsonSnippet: '`@comment:c-001`Viewer`@comment:c-001`',
    expectedEditorHtmlSnippet: 'data-kg-comment-range="1"',
    action: async ({ doc }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor for comment range render test')
      await waitForCondition(() => !!liveEditor.querySelector('[data-kg-comment-range="1"]'), 20, 5)
      const rangeNode = liveEditor.querySelector('[data-kg-comment-range="1"]') as HTMLElement | null
      if (!rangeNode) throw new Error(`expected rendered comment range indicator; html=${liveEditor.innerHTML}`)
      if (String(rangeNode.textContent || '').trim() !== 'Viewer') {
        throw new Error(`expected comment range indicator to preserve wrapped text only; text=${JSON.stringify(rangeNode.textContent || '')}`)
      }
      if (String(liveEditor.textContent || '').includes('@comment:c-001')) {
        throw new Error(`expected reopened WYSIWYG surface not to expose raw @comment sigils; text=${JSON.stringify(liveEditor.textContent || '')}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarFormatsWholeSemanticAndFootnoteTokens() {
  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '==`@comment:c-42`==',
    expectedJsonSnippet: '==`@comment:c-42`==',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '@comment:c-42')
      if (!textNode) throw new Error(`expected semantic text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('@comment:c-42')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '@comment:c-42'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const trigger = toolbar.querySelector('button[aria-label="Highlight"]') as HTMLElement | null
      if (!trigger) throw new Error('expected highlight trigger')
      await pressToolbarControl(dom, trigger, 2)
      const button = doc.querySelector('menu[aria-label="Highlight menu"] button') as HTMLButtonElement | null
      if (!button) throw new Error('expected highlight menu button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '`#EF4444:@key:Ctrl+S`',
    expectedJsonSnippet: '`#EF4444:@key:Ctrl+S`',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '@key:Ctrl+S')
      if (!textNode) throw new Error(`expected semantic text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('@key:Ctrl+S')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '@key:Ctrl+S'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const trigger = toolbar.querySelector('button[aria-label="Text color"]') as HTMLElement | null
      if (!trigger) throw new Error('expected text color trigger')
      await pressToolbarControl(dom, trigger, 2)
      const button = doc.querySelector('menu[aria-label="Text color menu"] button') as HTMLButtonElement | null
      if (!button) throw new Error('expected text color menu button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: 'Semantic `@comment:c-42` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '[^1]',
    expectedJsonSnippet: '[^1]',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '[^1]')
      if (!textNode) throw new Error(`expected footnote text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('[^1]')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '[^1]'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Link"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected link button')
      await pressToolbarControl(dom, button)
      const popover = doc.querySelector('section[aria-label="Edit link"],input[placeholder="https://example.com"]')
      if (!popover) {
        throw new Error(`expected link popover to open from whole footnote token selection; html=${doc.body.innerHTML}`)
      }
    },
  })
}

export async function testMarkdownWorkspaceViewerInlineSelectionToolbarClearFormattingPreservesCanonicalSemanticAndFootnoteTokens() {
  await runViewerToolbarActionCase({
    activeText: 'Semantic `#EF4444:@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: '`@key:Ctrl+S`',
    expectedJsonSnippet: '`@key:Ctrl+S`',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '@key:Ctrl+S')
      if (!textNode) throw new Error(`expected semantic text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('@key:Ctrl+S')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '@key:Ctrl+S'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const button = toolbar.querySelector('button[title="Clear formatting"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected clear formatting button')
      await pressToolbarControl(dom, button)
    },
  })

  await runViewerToolbarActionCase({
    activeText: 'Semantic `@key:Ctrl+S` and footnote [^1]\n\n[^1]: Citation body',
    expectedMarkdownSnippet: 'footnote [^1]',
    expectedJsonSnippet: 'footnote [^1]',
    action: async ({ dom, doc, toolbar }) => {
      const liveEditor = doc.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (!liveEditor) throw new Error('expected live inline editor')
      const textNode = findTextNodeBySubstring(liveEditor, '[^1]')
      if (!textNode) throw new Error(`expected footnote text node; html=${liveEditor.innerHTML}`)
      const textValue = String(textNode.nodeValue || '')
      const start = textValue.indexOf('[^1]')
      const range = doc.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + '[^1]'.length)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected selection object')
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new dom.window.Event('selectionchange'))
      await act(async () => {
        liveEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        await tick(4)
      })
      const highlightTrigger = toolbar.querySelector('button[aria-label="Highlight"]') as HTMLElement | null
      if (!highlightTrigger) throw new Error('expected highlight trigger')
      await pressToolbarControl(dom, highlightTrigger, 2)
      const highlightButton = doc.querySelector('menu[aria-label="Highlight menu"] button') as HTMLButtonElement | null
      if (!highlightButton) throw new Error('expected highlight menu button')
      await pressToolbarControl(dom, highlightButton)
      const button = toolbar.querySelector('button[title="Clear formatting"]') as HTMLButtonElement | null
      if (!button) throw new Error('expected clear formatting button')
      await pressToolbarControl(dom, button)
    },
  })
}
