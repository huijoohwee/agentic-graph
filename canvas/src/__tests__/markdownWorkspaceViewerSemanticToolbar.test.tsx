import { act } from 'react'
import { tick } from './helpers/markdownWorkspaceInlineEditHarness'
import { runViewerToolbarActionCase, pressToolbarControl, waitForCondition, findTextNodeBySubstring } from './helpers/markdownWorkspaceViewerToolbarHarness'

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
