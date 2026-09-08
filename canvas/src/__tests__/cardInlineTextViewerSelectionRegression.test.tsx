import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { normalizeCardInlineMediaSoftLineBreaks, resolveCardInlineMediaSoftBreakEdit } from '@/lib/cards/cardInlineTextViewerDraftProjection'
import { insertMediaIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { getInlineMediaEditorMarkdownSelectionOffsets } from '@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml'
import { focusMarkdownInlineTextSelectionSoon } from '@/lib/markdown-core/ui/MarkdownInlineTextEditSurface'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'

export async function testCardInlineTextEditorViewerMediaCatalogInsertionKeepsMiddleLineSelection() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  const outsideTarget = dom.window.document.createElement('button')
  dom.window.document.body.append(container, outsideTarget)
  const root = createRoot(container)
  const committedValues: string[] = []
  const sourceText = 'Generate a  text response for the active request.\nKeep the validation line.'
  const insertionOffset = sourceText.indexOf('  ') + 1
  const mediaUrl = 'https://media.example.test/buddydrone.jpg'
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          id: 'viewer-middle-line-media-card',
          value: sourceText,
          ariaLabel: 'Prompt for viewer-middle-line-media-card',
          placeholder: 'Add prompt',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          mediaCommandMode: 'external',
          showCommandLaunchers: false,
          onCommit: next => committedValues.push(next),
        }),
      )
      await waitForFrames(dom.window, 6)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Viewer card display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      await waitForFrames(dom.window, 6)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    const proxy = container.querySelector('[data-kg-card-inline-viewer-edit-command-proxy="1"]')
    if (!(editor instanceof dom.window.HTMLElement) || !(proxy instanceof dom.window.HTMLTextAreaElement)) {
      throw new Error(`expected Viewer edit surface and command proxy, html=${container.innerHTML}`)
    }
    await act(async () => {
      editor.focus()
      const firstLine = editor.firstChild
      if (!(firstLine instanceof dom.window.Text)) throw new Error(`expected first Viewer line to start with a text node, html=${editor.innerHTML}`)
      const range = dom.window.document.createRange()
      range.setStart(firstLine, insertionOffset)
      range.collapse(true)
      const selection = dom.window.getSelection()
      if (!selection) throw new Error('expected Viewer browser selection')
      selection.removeAllRanges()
      selection.addRange(range)
      Simulate.mouseUp(editor)
      const offsets = getInlineMediaEditorMarkdownSelectionOffsets(editor)
      if (!offsets || offsets.startOffset !== insertionOffset || offsets.endOffset !== insertionOffset) {
        throw new Error(`expected Viewer caret at middle-line insertion offset ${insertionOffset}, got ${JSON.stringify(offsets)}`)
      }
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Digit2',
        key: '2',
        shiftKey: true,
      }))
      await waitForFrames(dom.window, 4)
    })
    if (!dom.window.document.querySelector('section[aria-label="Card variable commands"]')) {
      throw new Error('expected middle-line @ command to open the shared variable menu')
    }
    proxy.setSelectionRange(sourceText.length, sourceText.length)
    const outsideRange = dom.window.document.createRange()
    outsideRange.selectNodeContents(outsideTarget)
    const outsideSelection = dom.window.getSelection()
    if (!outsideSelection) throw new Error('expected browser selection')
    outsideSelection.removeAllRanges()
    outsideSelection.addRange(outsideRange)
    Simulate.keyUp(editor)
    const inserted = insertMediaIntoActiveCardInlineTextEditor({
      kind: 'image',
      url: mediaUrl,
      label: 'buddydrone.jpg',
    })
    if (!inserted) throw new Error('expected active Viewer card to accept media catalog insertion')
    await act(async () => {
      await waitForFrames(dom.window, 6)
    })
    const committed = committedValues.at(-1) || ''
    const expectedEmbed = `![buddydrone.jpg](${mediaUrl})`
    if (committed !== `${sourceText.slice(0, insertionOffset)}${expectedEmbed}${sourceText.slice(insertionOffset)}`) {
      throw new Error(`expected media catalog insertion to preserve the middle-line @ offset instead of using the stale proxy end, got ${JSON.stringify(committed)}`)
    }
    if (!(committed.indexOf(expectedEmbed) < committed.indexOf('text response')) || committed.indexOf(expectedEmbed) > committed.indexOf('\n')) {
      throw new Error(`expected inserted media source to remain on the first line before trailing text, got ${JSON.stringify(committed)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorViewerOpenPlacesCaretAtClickedPoint() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const sourceText = 'I and buddydrone.jpg can ... #storyboard .. /soul.load , #runtime , is it better in #storyboard'
  const clickedOffset = sourceText.indexOf('can') + 1
  const documentWithCaretRange = dom.window.document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  try {
    documentWithCaretRange.caretRangeFromPoint = (x: number, y: number) => {
      if (x !== 141 || y !== 229) return null
      const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
      if (!(editor instanceof dom.window.HTMLElement)) return null
      const textNode = Array.from(editor.childNodes).find((node): node is Text => node instanceof dom.window.Text)
      if (!textNode) return null
      const range = dom.window.document.createRange()
      range.setStart(textNode, clickedOffset)
      range.collapse(true)
      return range
    }
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          id: 'viewer-click-point-card',
          value: sourceText,
          ariaLabel: 'Summary for workspace-source',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          showCommandLaunchers: false,
          displayClassName: 'm-0 h-full min-h-0 overflow-auto text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]',
          editorClassName: 'h-full min-h-[3rem] overflow-auto text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]',
        }),
      )
      await waitForFrames(dom.window, 6)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Viewer display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 141,
        clientY: 229,
      }))
      await waitForFrames(dom.window, 8)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected Viewer edit surface, html=${container.innerHTML}`)
    const offsets = getInlineMediaEditorMarkdownSelectionOffsets(editor)
    if (!offsets || offsets.startOffset !== clickedOffset || offsets.endOffset !== clickedOffset) {
      throw new Error(`expected initial Viewer click caret at offset ${clickedOffset}, not end-of-line fallback; got ${JSON.stringify(offsets)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorViewerBlankPlaceholderSharesInvocationTextOrigin() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: '',
          ariaLabel: 'Summary for blank-viewer-card',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          showCommandLaunchers: false,
          displayClassName: 'm-0 h-full min-h-0 overflow-auto text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]',
          editorClassName: 'h-full min-h-[3rem] overflow-auto text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]',
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected blank Viewer display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Digit2',
        key: '2',
        shiftKey: true,
      }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    const placeholder = container.querySelector('[data-kg-markdown-edit-placeholder="1"]')
    if (!(editor instanceof dom.window.HTMLElement) || !(placeholder instanceof dom.window.HTMLElement)) {
      throw new Error(`expected blank Viewer editor and placeholder, html=${container.innerHTML}`)
    }
    if (placeholder !== editor || container.querySelectorAll('[data-kg-markdown-edit-placeholder="1"]').length !== 1) {
      throw new Error(`expected the editable surface to own the placeholder without a sibling text layer, html=${container.innerHTML}`)
    }
    const editorClass = editor.className
    for (const expectedClass of ['text-[10px]', 'leading-4', 'before:content-[attr(aria-placeholder)]']) {
      if (!editorClass.includes(expectedClass)) {
        throw new Error(`expected placeholder to inherit the Viewer editor ${expectedClass} metric, class=${editorClass}`)
      }
    }
    for (const staleInset of ['left-1.5', 'top-1', 'px-3', 'py-1.5', 'text-xs', 'min-h-8']) {
      if (editorClass.includes(staleInset) || container.innerHTML.includes(staleInset)) {
        throw new Error(`expected blank Viewer editor not to layer ${staleInset}, html=${container.innerHTML}`)
      }
    }
    if (editor.getAttribute('aria-placeholder') !== 'Add summary' || editor.childNodes.length !== 0) {
      throw new Error(`expected placeholder text to stay outside the editable DOM, html=${editor.outerHTML}`)
    }
    if (editor.style.padding || editor.style.margin) {
      throw new Error('expected blank-to-chip Viewer transition not to layer inline spacing mutations')
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorEmptyViewerSurfaceFocusesAndCommits() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  let focusedElement: EventTarget | null = null
  container.addEventListener('focusin', event => {
    focusedElement = event.target
  })
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: '',
          ariaLabel: 'Output for probe-option',
          placeholder: 'Add output',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          markdownCommandMenus: false,
          showCommandLaunchers: false,
          onCommit: next => committedValues.push(next),
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[aria-label="Output for probe-option"][data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected empty Output to use the shared Viewer display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })
    await act(async () => {
      await waitForFrames(dom.window, 8)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected empty Output to enter the shared Viewer editor, html=${container.innerHTML}`)
    const selection = dom.window.getSelection()
    const selectionNode = selection?.anchorNode || null
    if (focusedElement !== editor || !selectionNode || (selectionNode !== editor && !editor.contains(selectionNode))) {
      throw new Error(`expected empty Output editor to receive focus and own the caret, focused=${(focusedElement as Element | null)?.outerHTML}`)
    }
    if (editor.getAttribute('aria-placeholder') !== 'Add output' || editor.textContent) {
      throw new Error(`expected Add output to remain a non-value placeholder, html=${editor.outerHTML}`)
    }
    await act(async () => {
      editor.textContent = 'Source-backed answer.'
      Simulate.input(editor)
      Simulate.keyDown(editor, { key: 'Enter', metaKey: true })
      await waitForFrames(dom.window, 4)
    })
    if (committedValues.at(-1) !== 'Source-backed answer.') {
      throw new Error(`expected shared Viewer editor to commit the mutated Output, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorViewerPreservesTypedSpacesAcrossRenders() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: '',
          ariaLabel: 'Summary for space-edit-card',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          showCommandLaunchers: false,
          onCommit: value => committedValues.push(value),
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected blank Viewer display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected Viewer edit surface, html=${container.innerHTML}`)
    await act(async () => {
      editor.textContent = '123'
      Simulate.input(editor)
      await waitForFrames(dom.window, 4)
      editor.textContent = '123 '
      Simulate.input(editor)
      await waitForFrames(dom.window, 4)
    })
    if (editor.textContent !== '123 ') {
      throw new Error(`expected an authored trailing space to survive the input render, text=${JSON.stringify(editor.textContent)}`)
    }
    await act(async () => {
      editor.textContent = '123 and'
      Simulate.input(editor)
      await waitForFrames(dom.window, 4)
      Simulate.blur(editor, { relatedTarget: null })
      await waitForFrames(dom.window, 4)
    })
    if (committedValues.at(-1) !== '123 and') {
      throw new Error(`expected the space between typed words to persist, got ${JSON.stringify(committedValues)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorViewerMediaInsertStaysInlineAndEditable() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const committedValues: string[] = []
  const mediaUrl = 'https://media.example.test/空武.jpg'
  const secondMediaUrl = 'https://media.example.test/buddydrone.jpg'
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: '123 and looks #storyboard and /reference.expand',
          ariaLabel: 'Summary for inline-media-card',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          mediaCommandMode: 'external',
          multiline: true,
          markdownCommandContextText: `![空武.jpg](${mediaUrl})\n![buddydrone.jpg](${secondMediaUrl})`,
          onCommit: value => committedValues.push(value),
          onMediaCommandSelect: () => void 0,
          showCommandLaunchers: false,
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Viewer display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected Viewer edit surface, html=${container.innerHTML}`)
    const firstTextNode = editor.firstChild
    if (!(firstTextNode instanceof dom.window.Text)) throw new Error(`expected leading editable text, html=${editor.innerHTML}`)
    const insertionOffset = '123 and '.length
    const range = dom.window.document.createRange()
    range.setStart(firstTextNode, insertionOffset)
    range.collapse(true)
    const selection = dom.window.document.getSelection()
    if (!selection) throw new Error('expected Viewer selection')
    selection.removeAllRanges()
    selection.addRange(range)
    await act(async () => {
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Digit2',
        key: '@',
        shiftKey: true,
      }))
      await waitForFrames(dom.window, 4)
    })
    const mediaButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').includes('空武.jpg'))
    if (!(mediaButton instanceof dom.window.HTMLButtonElement)) {
      throw new Error(`expected @ media candidate, html=${dom.window.document.body.innerHTML}`)
    }
    await act(async () => {
      mediaButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      mediaButton.click()
      await waitForFrames(dom.window, 8)
    })
    const activeEditor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')
    if (!(activeEditor instanceof dom.window.HTMLElement)) {
      throw new Error(`expected @ insertion to keep the Viewer editor open, html=${container.innerHTML}`)
    }
    const mediaChip = activeEditor.querySelector('[data-kg-inline-media-edit-token="1"]')
    if (!(mediaChip instanceof dom.window.HTMLElement) || !decodeURIComponent(String(mediaChip.textContent || '')).includes('空武.jpg')) {
      throw new Error(`expected inserted @ media to render as an inline chip, html=${activeEditor.innerHTML}`)
    }
    const editorText = decodeURIComponent(String(activeEditor.textContent || ''))
    const mediaIndex = editorText.indexOf('空武.jpg')
    if (!(mediaIndex > editorText.indexOf('123 and') && mediaIndex < editorText.indexOf('looks'))) {
      throw new Error(`expected inserted media chip to remain at the active caret, text=${JSON.stringify(editorText)}`)
    }
    if (!activeEditor.querySelector('[data-kg-inline-invocation-edit-token="1"]')) {
      throw new Error(`expected existing # and / chips to remain in the same editable surface, html=${activeEditor.innerHTML}`)
    }
    if (!committedValues.some(value => decodeURIComponent(value).includes(mediaUrl))) {
      throw new Error(`expected inline @ insertion to persist without closing, got ${JSON.stringify(committedValues)}`)
    }
    const firstCommitted = committedValues.at(-1) || ''
    const secondInsertionOffset = firstCommitted.indexOf(' looks') + ' looks'.length
    await act(async () => {
      focusMarkdownInlineTextSelectionSoon({ current: activeEditor }, secondInsertionOffset)
      await waitForFrames(dom.window, 4)
      activeEditor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Digit2',
        key: '@',
        shiftKey: true,
      }))
      await waitForFrames(dom.window, 4)
    })
    const secondMediaButton = (Array.from(dom.window.document.querySelectorAll('section[aria-label="Card variable commands"] button')) as HTMLButtonElement[])
      .find(button => String(button.textContent || '').includes('buddydrone.jpg'))
    if (!(secondMediaButton instanceof dom.window.HTMLButtonElement)) {
      throw new Error(`expected second @ media candidate, html=${dom.window.document.body.innerHTML}`)
    }
    await act(async () => {
      secondMediaButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      secondMediaButton.click()
      await waitForFrames(dom.window, 8)
    })
    const editorAfterSecondInsert = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"][contenteditable="true"]')
    if (!(editorAfterSecondInsert instanceof dom.window.HTMLElement)) {
      throw new Error(`expected second @ insertion to keep the Viewer editor open, html=${container.innerHTML}`)
    }
    const mediaChips = editorAfterSecondInsert.querySelectorAll('[data-kg-inline-media-edit-token="1"]')
    if (mediaChips.length !== 2) {
      throw new Error(`expected second @ insertion to preserve the first media chip, html=${editorAfterSecondInsert.innerHTML}`)
    }
    const secondCommitted = committedValues.at(-1) || ''
    if (!secondCommitted.includes(mediaUrl) || !secondCommitted.includes(secondMediaUrl)) {
      throw new Error(`expected multiple @ media insertions to preserve both canonical references, got ${JSON.stringify(secondCommitted)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testCardInlineTextEditorViewerEditPreservesAuthoredMediaSpacing() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const media = '![buddydrone.jpg](https://media.example.test/buddydrone.jpg)'
  const sourceText = `I 123 and\n${media}\ncan 123 see that #storyboard is as #source interesting.`
  const committedValues: string[] = []
  try {
    await act(async () => {
      root.render(
        React.createElement(CardInlineTextEditor, {
          value: sourceText,
          ariaLabel: 'Summary for runtime-spacing-card',
          placeholder: 'Add summary',
          canEdit: true,
          editActivation: 'click',
          editorSurface: 'viewer',
          inlineChipDensity: 'compact',
          multiline: true,
          showCommandLaunchers: false,
          onCommit: next => committedValues.push(next),
        }),
      )
      await waitForFrames(dom.window, 4)
    })
    const display = container.querySelector('[data-kg-card-inline-edit="1"]')
    if (!(display instanceof dom.window.HTMLElement)) throw new Error('expected Runtime summary display surface')
    await act(async () => {
      display.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 4)
    })
    const editor = container.querySelector('[data-kg-card-inline-viewer-edit-surface="1"]')
    if (!(editor instanceof dom.window.HTMLElement)) throw new Error(`expected Runtime summary Viewer editor, html=${container.innerHTML}`)
    const firstTextNode = editor.firstChild
    if (!(firstTextNode instanceof dom.window.Text)) throw new Error(`expected leading Runtime summary text node, html=${editor.innerHTML}`)
    await act(async () => {
      firstTextNode.nodeValue = 'I 123 edited and '
      Simulate.input(editor)
      await waitForFrames(dom.window, 4)
      Simulate.blur(editor, { relatedTarget: null })
      await waitForFrames(dom.window, 4)
    })
    const committed = committedValues.at(-1) || ''
    const expected = `I 123 edited and\n${media}\ncan 123 see that #storyboard is as #source interesting.`
    if (committed !== expected) {
      throw new Error(`expected Viewer edit to preserve authored media-adjacent spacing instead of committing its compact display projection, got ${JSON.stringify(committed)}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export function testCardInlineTextViewerInvocationEditsPreserveRawMediaSpacing() {
  const media = '![buddydrone.jpg](https://media.example.test/buddydrone.jpg)'
  const source = `I and\n${media}\ncan see the active request.`
  const display = normalizeCardInlineMediaSoftLineBreaks(source).trim()
  const nextDisplay = display.replace('active request', '@agent /cost.audit #storyboard active request')
  const resolved = resolveCardInlineMediaSoftBreakEdit(source, nextDisplay)
  const expected = `I and\n${media}\ncan see the @agent /cost.audit #storyboard active request.`
  if (resolved !== expected) {
    throw new Error(`expected @ / # display insertion to preserve raw media spacing, got ${JSON.stringify(resolved)}`)
  }
}
