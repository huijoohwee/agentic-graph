import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const waitForCondition = async (check: () => boolean, attempts: number = 60) => {
  for (let i = 0; i < attempts; i += 1) {
    if (check()) return true
    await tick()
  }
  return false
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

export async function testMarkdownViewerInlineEditParagraphDoesNotInsertBlockElementsIntoP() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)

    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Hello world']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Hello world</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    if (String(host.tagName || '').toUpperCase() !== 'P') throw new Error('expected host p')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }

    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    if (String(editor.tagName || '').toUpperCase() !== 'SPAN') {
      throw new Error('expected paragraph editing surface to use inline editor tag')
    }

    const wrapper = editor.parentElement as HTMLElement | null
    if (!wrapper) throw new Error('expected editor wrapper')
    if (editor.parentElement !== host) throw new Error('expected editor wrapper to be a direct child of <p>')
    if (dom.window.document.querySelector('p div')) {
      throw new Error('expected no block-level div to be inserted into <p> during inline editing')
    }
    if (wrapper.style.minHeight || host.getBoundingClientRect().height !== 42) {
      throw new Error('expected editor wrapper minHeight to preserve layout height')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditParagraphClickingInlineLinkStillOpensEditor() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)

    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Go to https://example.com']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <a href="https://example.com">example</a>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host paragraph')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }

    const link = host.querySelector('a') as HTMLAnchorElement | null
    if (!link) throw new Error('expected inline link in paragraph')
    link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected click on inline link to still open inline editor')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditParagraphDoubleClickOpensEditor() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)

    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Double click edit']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Double click edit</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host paragraph')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }

    host.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 30, clientY: 10, detail: 2 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected double click to enter inline editing')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditParagraphDoubleClickSelectsWordOnOpen() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    ensureRangeRect(dom)
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)

    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Double click edit']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Double click edit</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host paragraph')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }

    host.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 30, clientY: 10, detail: 2 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected double click to enter inline editing')
    const sel = dom.window.getSelection()
    if (!sel || sel.rangeCount <= 0) throw new Error('expected a selection range after double click')
    const range = sel.getRangeAt(0)
    const containerNode = range.startContainer.nodeType === dom.window.Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement
    if (!containerNode || !editor.contains(containerNode as Node)) {
      throw new Error('expected double click paragraph edit-open to place active selection/caret inside paragraph editor')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditParagraphEarlyBlurDoesNotBounceOut() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    ensureRangeRect(dom)
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Click edit']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Click edit</span>
      </MarkdownBlockContainer>,
    )
    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host paragraph')
    host.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}),
    } as unknown as DOMRect)

    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }))
    await tick()
    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected editor after click')
    editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    await tick()
    const stillEditing = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!stillEditing) throw new Error('expected early blur guard to keep editor active and prevent bounce-out')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditParagraphPlainTextCommitDoesNotEscapeMarkdownChars() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    ensureRangeRect(dom)
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['Plain paragraph']}
        onReplaceLineRange={(args) => {
          replaceCalls.push(args)
        }}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Plain paragraph</span>
      </MarkdownBlockContainer>,
    )
    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host paragraph')
    host.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 42, width: 320, height: 42, toJSON: () => ({}),
    } as unknown as DOMRect)

    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }))
    await tick()
    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected editor after click')

    const nextText = 'hello_world [link](https://x.com) ok'
    editor.textContent = nextText
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true }))
    editor.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
    editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }))
    const committed = await waitForCondition(() => replaceCalls.length > 0)
    if (!committed) throw new Error('expected paragraph inline edit to commit replacement lines')

    const commit = replaceCalls[replaceCalls.length - 1]
    if (commit.replacementLines.length !== 1 || commit.replacementLines[0] !== nextText) {
      throw new Error(`expected plain text inline edit to keep markdown-like characters unescaped; got=${JSON.stringify(commit.replacementLines)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}
