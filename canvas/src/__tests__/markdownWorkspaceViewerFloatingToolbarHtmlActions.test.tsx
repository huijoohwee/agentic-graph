import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { readTrackedReactRootCount } from '@/tests/lib/reactRootLifecycle'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { tick, waitMs, ensureRangeRect, installInlineExecCommandStub } from './helpers/markdownWorkspaceInlineEditHarness'
import { runViewerToolbarActionCase, pressToolbarControl, waitForCondition, findTextNodeBySubstring } from './helpers/markdownWorkspaceViewerToolbarHarness'

export {
  testMarkdownWorkspaceViewerInlineSelectionToolbarCommentSupportsInlineSemanticAndFootnoteSelections,
  testMarkdownWorkspaceViewerHtmlCommentMarkersDifferentiateAuthorNotesAndAppendixReviewComments,
  testMarkdownWorkspaceViewerInlineSelectionToolbarCommentSelectionPreservesWholeExistingReviewCommentToken,
  testMarkdownWorkspaceViewerCommentRangeReopensAsNonLiteralIndicator,
  testMarkdownWorkspaceViewerInlineSelectionToolbarFormatsWholeSemanticAndFootnoteTokens,
  testMarkdownWorkspaceViewerInlineSelectionToolbarClearFormattingPreservesCanonicalSemanticAndFootnoteTokens,
} from './markdownWorkspaceViewerSemanticToolbar.test'

export async function testMarkdownWorkspaceViewerToolbarFixturePreservesFailuresAndRestoresOwnership() {
  const initialWindow = Reflect.get(globalThis, 'window')
  const initialDocument = Reflect.get(globalThis, 'document')
  const initialRoots = readTrackedReactRootCount()
  for (const failCleanup of [false, true]) {
    const bodyFailure = new Error('viewer_toolbar_body_sentinel')
    const cleanupFailure = new Error('viewer_toolbar_exec_restore_sentinel')
    let caught: unknown
    let promptRestored = false
    try {
      await runViewerToolbarActionCase({
        activeText: 'Viewer cleanup sentinel',
        expectedMarkdownSnippet: 'Viewer cleanup sentinel',
        action: async ({ dom, doc }) => {
          const installedPrompt = dom.window.prompt
          Object.defineProperty(dom.window, 'prompt', {
            configurable: true,
            get: () => installedPrompt,
            set: value => {
              promptRestored = true
              Object.defineProperty(dom.window, 'prompt', { configurable: true, writable: true, value })
            },
          })
          if (failCleanup) {
            const installedExecCommand = doc.execCommand
            Object.defineProperty(doc, 'execCommand', {
              configurable: true,
              get: () => installedExecCommand,
              set: () => { throw cleanupFailure },
            })
          }
          throw bodyFailure
        },
      })
    } catch (error) {
      caught = error
    }
    if (failCleanup) {
      if (!(caught instanceof AggregateError) || caught.errors.length !== 2 || caught.errors[0] !== bodyFailure || caught.errors[1] !== cleanupFailure) {
        throw new Error('expected original body and execCommand restoration failures to both survive')
      }
    } else if (caught !== bodyFailure) throw new Error('expected the original single body failure to survive unchanged')
    if (!promptRestored) throw new Error('expected prompt restoration after a Viewer fixture failure')
    if (Reflect.get(globalThis, 'window') !== initialWindow || Reflect.get(globalThis, 'document') !== initialDocument) {
      throw new Error('expected Viewer fixture failure to restore incoming DOM globals')
    }
    if (readTrackedReactRootCount() !== initialRoots) throw new Error('expected Viewer fixture failure to release its owned React root')
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
