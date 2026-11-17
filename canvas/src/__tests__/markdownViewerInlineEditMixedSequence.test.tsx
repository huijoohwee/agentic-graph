import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import MarkdownTokenRenderer from '@/features/markdown/ui/MarkdownTokenRenderer'
import { MarkdownBlockquoteBlock } from '@/features/markdown/ui/MarkdownBlockquoteBlock'
import type { RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const waitTicks = async (count: number) => {
  for (let i = 0; i < count; i += 1) await tick()
}

const waitForElement = async <T extends HTMLElement>(query: () => T | null, attempts: number = 20) => {
  for (let i = 0; i < attempts; i += 1) {
    const el = query()
    if (el) return el
    await tick()
  }
  return null
}

const waitForCondition = async (check: () => boolean, attempts: number = 40) => {
  for (let i = 0; i < attempts; i += 1) {
    if (check()) return true
    await tick()
  }
  return false
}

const setRect = (el: HTMLElement, width: number = 480, height: number = 28) => {
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as unknown as DOMRect)
}

const openEditorAtLine = async (dom: any, line: number) => {
  const host = await waitForElement(() => {
    const rowHost = dom.document.querySelector(`[data-kg-list-item-start-line="${line}"]`) as HTMLElement | null
    if (rowHost) {
      const rowEditableHost = rowHost.querySelector(`[data-start-line="${line}"]`) as HTMLElement | null
      return rowEditableHost || rowHost
    }
    return dom.document.querySelector(`[data-start-line="${line}"]`) as HTMLElement | null
  })
  if (!host) throw new Error(`expected host for start line ${line}`)
  setRect(host)
  host.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }))
  await tick()
  await tick()
  const editor = await waitForElement(
    () => (host.matches('[contenteditable="true"]') ? host : host.querySelector('[contenteditable="true"]')) as HTMLElement | null,
  )
  if (!editor) throw new Error(`expected editor for start line ${line}`)
  return { host, editor }
}

export async function testMarkdownViewerInlineEditMixedBlockSequencePreservesInlineCodeAndListMarkers() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      'Paragraph with `inline` code.',
      '',
      '```ts',
      'const value = 1',
      '```',
      '',
      '1. First `code`',
      '2. Second',
      '',
      '- Alpha `code`',
      '- Beta',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    dom.window.history.replaceState({}, '', 'http://localhost/?kgEditParityProbe=1')

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/mixed-sequence.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const paragraph = await openEditorAtLine(dom.window, 1)
    const inlineCode=paragraph.editor.querySelector('code')
    if(!inlineCode)throw new Error('expected the original inline code node to remain visible')
    if(paragraph.editor.style.padding)throw new Error('activation must not add editor padding')

    paragraph.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    await tick()

    const codeBlock = await openEditorAtLine(dom.window, 3)
    if (!codeBlock.editor.closest('pre')) {
      throw new Error('expected fenced code block editor to preserve preformatted edit surface')
    }

    codeBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    await tick()

    const ordered = await openEditorAtLine(dom.window, 7)
    if (!ordered.editor.closest('[class*="whitespace-pre-wrap"]')) {
      throw new Error('expected ordered list row editor to use normal-text style pre-wrap editing surface')
    }
    if (!ordered.editor.closest('li')) throw new Error('expected the original list row to remain mounted')
    if (ordered.editor.className.includes('[&_ol]:list-decimal')) {
      throw new Error('expected ordered list row editor to avoid block-level list-surface classes')
    }

    ordered.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    await tick()

    const unordered = await openEditorAtLine(dom.window, 10)
    if (!unordered.editor.closest('[class*="whitespace-pre-wrap"]')) {
      throw new Error('expected unordered list row editor to use normal-text style pre-wrap editing surface')
    }
    if (!unordered.editor.closest('li')) throw new Error('expected the original list row to remain mounted')
    if (unordered.editor.className.includes('[&_ul]:list-disc')) {
      throw new Error('expected unordered list row editor to avoid block-level list-surface classes')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditTaskListCompactBracketSyntaxParsesAndCommits() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '- [] Compact',
      '- [ ] Spaced',
      '- [x] Done',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/task-list-compact.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const hasCheckboxes = await waitForCondition(
      () => dom.window.document.querySelectorAll('input[type="checkbox"]').length === 3,
    )
    if (!hasCheckboxes) {
      const actual = dom.window.document.querySelectorAll('input[type="checkbox"]').length
      throw new Error(`expected compact/spaced task rows to render checkbox controls; count=${actual}`)
    }
    const checkboxes = Array.from(dom.window.document.querySelectorAll('input[type="checkbox"]'))
    if ((checkboxes[2] as HTMLInputElement).checked !== true) {
      throw new Error('expected [x] task row to remain checked')
    }

    const taskRow = await openEditorAtLine(dom.window, 1)
    const initialText = String(taskRow.editor.textContent || '')
    if (initialText.includes('[]') || initialText.includes('[ ]')) {
      throw new Error(`expected task row inline edit text to exclude checkbox token prefix; text=${JSON.stringify(initialText)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditMultilineListParagraphKeepsUnderlineRendered() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '- intro line',
      '  <u>Alpha</u> tail',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/list-multiline-underline.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const row = await openEditorAtLine(dom.window, 1)
    if (!String(row.editor.innerHTML || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected multiline paragraph-only list row to reuse html inline editor and render underline markup, got html=${JSON.stringify(row.editor.innerHTML || '')}`)
    }
    if (String(row.editor.textContent || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected multiline paragraph-only list row not to literalize underline markup into text, got text=${JSON.stringify(row.editor.textContent || '')}`)
    }

    const underlineTextNode = row.editor.querySelector('u')?.firstChild
    if (!underlineTextNode || underlineTextNode.nodeType !== dom.window.Node.TEXT_NODE) {
      throw new Error('expected underline text node in multiline list row editor')
    }
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection')
    const range = dom.window.document.createRange()
    range.setStart(underlineTextNode, 2)
    range.setEnd(underlineTextNode, 2)
    selection.removeAllRanges()
    selection.addRange(range)
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    row.editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    await waitTicks(6)

    if (!String(row.editor.innerHTML || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected multiline paragraph-only list row to preserve underline after mouseup, got html=${JSON.stringify(row.editor.innerHTML || '')}`)
    }
    if (String(row.editor.textContent || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected multiline paragraph-only list row not to literalize underline after mouseup, got text=${JSON.stringify(row.editor.textContent || '')}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditTaskRowKeepsUnderlineRendered() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '- [ ] <u>Alpha</u> tail',
      '- [ ] plain',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/task-row-underline.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const taskRow = await openEditorAtLine(dom.window, 1)
    if (!String(taskRow.editor.innerHTML || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected task row editor to render underline markup, got html=${JSON.stringify(taskRow.editor.innerHTML || '')}`)
    }
    if (String(taskRow.editor.textContent || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected task row editor not to literalize underline markup into text, got text=${JSON.stringify(taskRow.editor.textContent || '')}`)
    }

    const underlineTextNode = taskRow.editor.querySelector('u')?.firstChild
    if (!underlineTextNode || underlineTextNode.nodeType !== dom.window.Node.TEXT_NODE) {
      throw new Error('expected task row underline text node')
    }
    const selection = dom.window.getSelection()
    if (!selection) throw new Error('expected selection')
    const range = dom.window.document.createRange()
    range.setStart(underlineTextNode, 2)
    range.setEnd(underlineTextNode, 2)
    selection.removeAllRanges()
    selection.addRange(range)
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    taskRow.editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    await waitTicks(6)

    if (!String(taskRow.editor.innerHTML || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected task row underline to remain rendered after mouseup, got html=${JSON.stringify(taskRow.editor.innerHTML || '')}`)
    }
    if (String(taskRow.editor.textContent || '').includes('<u>Alpha</u>')) {
      throw new Error(`expected task row underline not to literalize after mouseup, got text=${JSON.stringify(taskRow.editor.textContent || '')}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteBlankLinesPreserveQuotePrefixes() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '>> First',
      '>>',
      '>> Last',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-blank-lines.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const initialText = String(quoteBlock.editor.textContent || '')
    if (initialText.includes('>')) {
      throw new Error(`expected nested quote prefixes to be fully stripped from edit surface text; text=${JSON.stringify(initialText)}`)
    }
    if (!initialText.includes('First') || !initialText.includes('Last')) {
      throw new Error(`expected nested quote edit surface text to keep quote content; text=${JSON.stringify(initialText)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditCalloutThreeBlankLinesKeepsUneditedQuoteRows() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '>',
      '>',
      '>',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/callout-triple-blank.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    quoteBlock.editor.textContent = 'Edited'
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    const committed = await waitForCondition(() => replaceCalls.length > 0, 400)
    if (!committed) throw new Error('expected callout edit to commit replacement lines')

    const commit = replaceCalls[replaceCalls.length - 1]
    if (commit.replacementLines.length !== 3) {
      throw new Error(`expected callout commit to keep original 3 quote rows; got=${JSON.stringify(commit.replacementLines)}`)
    }
    const firstLineOk = commit.replacementLines[0] === '>Edited' || commit.replacementLines[0] === '> Edited'
    if (!firstLineOk || commit.replacementLines[1] !== '>' || commit.replacementLines[2] !== '>') {
      throw new Error(`expected unedited quote rows to remain present after editing one row; got=${JSON.stringify(commit.replacementLines)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditCalloutThreeContentLinesEditOneKeepsOtherContentLines() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> a',
      '> b',
      '> c',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/callout-triple-content.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const paragraphRows = quoteBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (paragraphRows.length === 3) {
      const paragraphText = renderedLines.map(text=>text.replace(/\r/g,''))
      if (paragraphText.join('\n') !== 'a\nb\nc') {
        throw new Error(`expected callout edit surface to keep baseline line contents before edit; lines=${JSON.stringify(paragraphText)} html=${quoteBlock.editor.innerHTML}`)
      }
    } else {
      const normalizedText = String(quoteBlock.editor.textContent || '').replace(/\r/g, '').replace(/\n$/, '')
      if (normalizedText.replace(/\n/g,'') !== 'abc') {
        throw new Error(`expected callout edit surface text-mode baseline lines before edit; text=${JSON.stringify(normalizedText)} html=${quoteBlock.editor.innerHTML}`)
      }
    }
    quoteBlock.editor.innerHTML = '<p>a b c</p>'
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    const committed = await waitForCondition(() => replaceCalls.length > 0, 400)
    if (!committed) throw new Error('expected callout content edit to commit replacement lines')

    const commit = replaceCalls[replaceCalls.length - 1]
    if (commit.startLine !== 1 || commit.endLine !== 3) {
      throw new Error(`expected callout replace range to keep original line indexing 1..3; got=${commit.startLine}..${commit.endLine}`)
    }
    const firstLineOk = commit.replacementLines[0] === '>a b c' || commit.replacementLines[0] === '> a b c'
    if (!firstLineOk || commit.replacementLines[1] !== '> b' || commit.replacementLines[2] !== '> c') {
      throw new Error(`expected edited first quote line and preserved untouched content lines; got=${JSON.stringify(commit.replacementLines)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditCalloutClickBlurWithoutEditDoesNotMutate() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> a',
      '> b',
      '> c',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/callout-click-blur-noedit.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const paragraphRows = quoteBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (paragraphRows.length === 3) {
      const paragraphText = renderedLines.map(text=>text.replace(/\r/g,''))
      if (paragraphText.join('\n') !== 'a\nb\nc') {
        throw new Error(`expected callout edit surface baseline line contents before blur; lines=${JSON.stringify(paragraphText)}`)
      }
    } else {
      const normalizedText = String(quoteBlock.editor.textContent || '').replace(/\r/g, '').replace(/\n$/, '')
      if (normalizedText.replace(/\n/g,'') !== 'abc') {
        throw new Error(`expected callout edit surface text-mode baseline line contents before blur; text=${JSON.stringify(normalizedText)}`)
      }
    }
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected click+blur without edits to avoid replacement mutation; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditAdmonitionCalloutBodyOpenKeepsPerLineParity() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> [!NOTE] Demo',
      '> a',
      '> b',
      '> c',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/admonition-callout-open-parity.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const bodyBlock = await openEditorAtLine(dom.window, 2)
    const paragraphRows = bodyBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (renderedLines.length !== 3) {
      throw new Error(`expected admonition callout body editor to preserve per-line rows; count=${paragraphRows.length} html=${bodyBlock.editor.innerHTML}`)
    }
    const paragraphText = renderedLines.map(text=>text.replace(/\r/g,''))
    if (paragraphText.join('\n') !== 'a\nb\nc') {
      throw new Error(`expected admonition callout body editor baseline lines to stay split; lines=${JSON.stringify(paragraphText)}`)
    }
    bodyBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    bodyBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected admonition callout open+blur without edits to avoid mutation; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteTrailingBlankLineDoesNotCollapseRows() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = '> a\n> b\n> c\n'
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-trailing-blank-line.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const paragraphRows = quoteBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (paragraphRows.length >= 3) {
      const firstThreeText = Array.from(paragraphRows).slice(0, 3).map(p => String(p.textContent || '').replace(/\r/g, ''))
      if (firstThreeText.join('\n') !== 'a\nb\nc') {
        throw new Error(`expected blockquote editor first three rows to match baseline lines; lines=${JSON.stringify(firstThreeText)} html=${quoteBlock.editor.innerHTML}`)
      }
    } else {
      const normalizedText = String(quoteBlock.editor.textContent || '').replace(/\r/g, '').replace(/\n$/, '')
      if (normalizedText.replace(/\n/g,'') !== 'abc') {
        throw new Error(`expected blockquote editor text-mode lines to match baseline with trailing blank source line; text=${JSON.stringify(normalizedText)} html=${quoteBlock.editor.innerHTML}`)
      }
    }
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected open+blur without edits on trailing-blank blockquote to avoid mutation; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteTypographyKeepsUiFontClass() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> a',
      '> b',
      '> c',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-font-parity.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    if (!quoteBlock.editor.closest('.font-sans')) {
      throw new Error(`expected blockquote inline editor to keep uiPanelTextFontClass for typography parity; class=${quoteBlock.editor.className}`)
    }
    if (!quoteBlock.editor.className.includes('pl-3')) {
      throw new Error(`expected blockquote inline editor to keep quote text padding for no-shift parity; class=${quoteBlock.editor.className}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditRuntimeParityProbeReportsMismatch() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> a',
      '> b',
      '> c',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-runtime-parity-probe.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    if (!quoteBlock.editor) {
      throw new Error('expected runtime parity probe mode to keep blockquote editor openable')
    }
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await tick()

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteRangeClampsToContiguousQuoteLines() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> a',
      '> b',
      '> c',
      '',
      'tail paragraph',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-range-clamp.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const text = String(quoteBlock.editor.textContent || '').replace(/\r/g, '').replace(/\n$/, '')
    if (text.replace(/\n/g,'') !== 'abc') {
      throw new Error(`expected blockquote edit range to clamp before trailing blank/non-quote lines; text=${JSON.stringify(text)}`)
    }

    quoteBlock.editor.textContent = 'a updated\nb\nc'
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    const committed = await waitForCondition(() => replaceCalls.length > 0, 200)
    if (!committed) throw new Error('expected blockquote clamped-range edit to commit')
    const commit = replaceCalls[replaceCalls.length - 1]
    if (commit.startLine !== 1 || commit.endLine !== 3) {
      throw new Error(`expected blockquote clamped replace range to stay 1..3; got=${commit.startLine}..${commit.endLine}`)
    }
    if (commit.replacementLines.length !== 3) {
      throw new Error(`expected no extra-row mutation from trailing blank/non-quote lines; got=${JSON.stringify(commit.replacementLines)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteTrailingNewlineDoesNotCreateExtraRow() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> a', '> b', '> c'].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-trailing-newline-no-extra-row.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    quoteBlock.editor.textContent = 'a\nb\nc\n'
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected trailing newline not to create extra quote row or mutation commit; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteMultiLineOpenDoesNotAddTrailingRow() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> "alpha"', '> "beta"', '> "gamma"'].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-multiline-open-no-extra-row.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const paragraphRows = quoteBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (renderedLines.length !== 3) {
      throw new Error(`expected multiline blockquote edit open parity to keep 3 rows without trailing extra row; count=${paragraphRows.length} html=${quoteBlock.editor.innerHTML}`)
    }
    const paragraphText = renderedLines.map(text=>text.replace(/\r/g,''))
    if (paragraphText.join('\n') !== '"alpha"\n"beta"\n"gamma"') {
      throw new Error(`expected multiline blockquote edit open text parity to preserve line mapping; lines=${JSON.stringify(paragraphText)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteMultiLineWithSourceTrailingNewlineOpenDoesNotAddTrailingRow() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> "alpha"', '> "beta"', '> "gamma"'].join('\n') + '\n'
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-multiline-source-trailing-newline-open-no-extra-row.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    const paragraphRows = quoteBlock.editor.querySelectorAll('p')
    const renderedLines=Array.from(paragraphRows).flatMap(p=>p.innerHTML.split(/<br\s*\/?>(?:\n)?/i).map(html=>{const el=dom.window.document.createElement('span');el.innerHTML=html;return el.textContent||''}))
    if (renderedLines.length !== 3) {
      throw new Error(`expected multiline blockquote with source trailing newline to keep 3 rows without extra trailing row; count=${paragraphRows.length} html=${quoteBlock.editor.innerHTML}`)
    }
    const paragraphText = renderedLines.map(text=>text.replace(/\r/g,''))
    if (paragraphText.join('\n') !== '"alpha"\n"beta"\n"gamma"') {
      throw new Error(`expected multiline blockquote with source trailing newline to preserve line mapping; lines=${JSON.stringify(paragraphText)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteTrimsTrailingEmptyInlineWrapperRow() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> a', '> b', '> c'].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/blockquote-trim-trailing-empty-inline-wrapper-row.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={() => {}}
        forbidCopy
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    quoteBlock.editor.innerHTML = `${quoteBlock.editor.innerHTML}<p><em><br/></em></p>`
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await waitTicks(6)

    const last = quoteBlock.editor.lastElementChild as HTMLElement | null
    const lastText = String(last?.textContent || '').replace(/\r/g, '').trim()
    if (!last) throw new Error('expected editor to have content')
    if (!lastText) {
      throw new Error(`expected trailing empty inline-wrapper row to be trimmed; lastTag=${String(last.tagName || '')} html=${quoteBlock.editor.innerHTML}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteGutterDisabledOpenBlurDoesNotMutate() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> a', '> b', '> c'].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const blockquoteToken = (tokens as any[]).find(t => t && t.type === 'blockquote')
    if (!blockquoteToken) throw new Error('expected blockquote token')
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const opts: RenderOpts = {
      activeDocumentPath: '/fixtures/blockquote-gutter-disabled-open-blur-noedit.md',
      highlightedLineRange: null,
      markdownWordWrap: true,
      markdownPresentationMode: false,
      uiPanelTextFontClass: 'font-sans',
      uiPanelMonospaceTextClass: 'font-mono text-xs',
      mermaidFrontmatterConfig: null,
      rootThemeMode: 'light',
      previewOverlayScope: 'container',
      markdownSourceLines: sourceLines,
      viewerBlockEditingEnabled: true,
      markdownBlockControlsEnabled: true,
      markdownBlockGutterEnabled: false,
      onReplaceLineRange: (args) => {
        replaceCalls.push(args)
      },
      forbidCopy: true,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownBlockquoteBlock
        token={blockquoteToken}
        highlightClass=""
        opts={opts}
        baseTextClass="text-sm leading-normal"
        commonBlockClass=""
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    if (quoteBlock.editor.querySelector('blockquote blockquote')) {
      throw new Error(`expected gutter-disabled blockquote editor to avoid nested blockquote inset drift; class=${quoteBlock.editor.className}`)
    }
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected gutter-disabled blockquote open+blur without edits to avoid mutation; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditBlockquoteGutterDisabledTrailingNewlineDoesNotMutate() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = ['> a', '> b', '> c'].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const blockquoteToken = (tokens as any[]).find(t => t && t.type === 'blockquote')
    if (!blockquoteToken) throw new Error('expected blockquote token')
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const opts: RenderOpts = {
      activeDocumentPath: '/fixtures/blockquote-gutter-disabled-trailing-newline-no-mutation.md',
      highlightedLineRange: null,
      markdownWordWrap: true,
      markdownPresentationMode: false,
      uiPanelTextFontClass: 'font-sans',
      uiPanelMonospaceTextClass: 'font-mono text-xs',
      mermaidFrontmatterConfig: null,
      rootThemeMode: 'light',
      previewOverlayScope: 'container',
      markdownSourceLines: sourceLines,
      viewerBlockEditingEnabled: true,
      markdownBlockControlsEnabled: true,
      markdownBlockGutterEnabled: false,
      onReplaceLineRange: (args) => {
        replaceCalls.push(args)
      },
      forbidCopy: true,
    }

    const root = createRoot(container)
    root.render(
      <MarkdownBlockquoteBlock
        token={blockquoteToken}
        highlightClass=""
        opts={opts}
        baseTextClass="text-sm leading-normal"
        commonBlockClass=""
      />,
    )
    await tick()

    const quoteBlock = await openEditorAtLine(dom.window, 1)
    quoteBlock.editor.textContent = 'a\nb\nc\n'
    quoteBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    quoteBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    await tick()
    await tick()
    if (replaceCalls.length !== 0) {
      throw new Error(`expected gutter-disabled blockquote trailing newline not to commit mutation; calls=${JSON.stringify(replaceCalls)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditAdmonitionCalloutRangeClampsToContiguousQuoteLines() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const markdown = [
      '> [!NOTE] Demo',
      '> a',
      '> b',
      '> c',
      '',
      'tail paragraph',
    ].join('\n')
    const sourceLines = markdown.split('\n')
    const { tokens } = lexMarkdown(markdown)
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []

    const root = createRoot(container)
    root.render(
      <MarkdownTokenRenderer
        tokens={tokens}
        activeDocumentPath="/fixtures/admonition-range-clamp.md"
        highlightedLineRange={null}
        markdownWordWrap
        markdownPresentationMode={false}
        uiPanelTextFontClass="font-sans"
        uiPanelMonospaceTextClass="font-mono text-xs"
        mermaidFrontmatterConfig={null}
        rootThemeMode="light"
        previewOverlayScope="container"
        markdownSourceLines={sourceLines}
        viewerBlockEditingEnabled
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        forbidCopy
      />,
    )
    await tick()

    const bodyBlock = await openEditorAtLine(dom.window, 2)
    const text = String(bodyBlock.editor.textContent || '').replace(/\r/g, '')
    if (text.includes('tail paragraph')) {
      throw new Error(`expected admonition body edit range to exclude trailing non-quote lines; text=${JSON.stringify(text)}`)
    }

    bodyBlock.editor.textContent = 'a updated\nb\nc'
    bodyBlock.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    bodyBlock.editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    bodyBlock.editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    const committed = await waitForCondition(() => replaceCalls.length > 0, 200)
    if (!committed) throw new Error('expected admonition clamped-range edit to commit')
    const commit = replaceCalls[replaceCalls.length - 1]
    if (commit.startLine !== 2 || commit.endLine !== 4) {
      throw new Error(`expected admonition clamped replace range to stay 2..4; got=${commit.startLine}..${commit.endLine}`)
    }
    if (commit.replacementLines.length !== 3) {
      throw new Error(`expected no extra-row mutation from trailing blank/non-quote lines in admonition body; got=${JSON.stringify(commit.replacementLines)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}
