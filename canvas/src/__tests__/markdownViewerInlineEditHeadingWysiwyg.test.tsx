import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}
const waitForQuery = async (query: () => Element | null, attempts = 5): Promise<Element | null> => {
  for (let i = 0; i < attempts; i += 1) {
    const found = query()
    if (found) return found
    await tick()
  }
  return null
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

export async function testMarkdownViewerInlineEditHeadingUsesHtmlEditingAndPreservesHeight() {
  const headingPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownHeadingBlock.tsx')
  const headingText = fs.readFileSync(headingPath, { encoding: 'utf8' })
  if (!headingText.includes('editPresentation="html"')) {
    throw new Error('expected MarkdownHeadingBlock to use html edit presentation')
  }
  if (!headingText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS')) {
    throw new Error('expected heading edit surface to reuse centralized normal-text edit surface base layout contract without whitespace-pre-wrap conflict')
  }
  if (!headingText.includes('overflow-x-auto whitespace-nowrap')) {
    throw new Error('expected heading edit surface to allow horizontal scroll reveal during edit')
  }
  if (headingText.includes('overflow-hidden text-ellipsis') || headingText.includes('focus:overflow-x-auto') || headingText.includes('focus:[text-overflow:clip]')) {
    throw new Error('expected heading edit surface to avoid ellipsis clipping and focus-time overflow overrides')
  }
  if (headingText.includes('editCaptureLayoutSpacing')) {
    throw new Error('expected heading edit surface to avoid extra spacing snapshot replay and stay on normal-text SSOT baseline')
  }

  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const reactDomClient = await import('react-dom/client')
    const createRoot = reactDomClient.createRoot

    const root = createRoot(container)
    root.render(<section data-test-probe="1">probe</section>)
    const probe = await waitForQuery(() => dom.window.document.querySelector('[data-test-probe="1"]'))
    if (!probe) {
      throw new Error('expected react root to render a probe element')
    }

    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer

    root.render(
      <MarkdownBlockContainer
        as="h2"
        className="font-semibold text-xl"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['## Hello world']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
        editStripLinePrefix={(line: string) => {
          const m = line.match(/^(\s*#{1,6}\s+)([\s\S]*)$/)
          if (!m) return { prefix: '', content: line }
          return { prefix: m[1] || '', content: m[2] || '' }
        }}
        forbidCopy
      >
        <span>Hello world</span>
      </MarkdownBlockContainer>,
    )

    await tick()

    const host = dom.window.document.querySelector('h2') as HTMLElement | null
    if (!host) throw new Error('expected host h2')

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

    host.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    )
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    if(!host.contains(editor))throw new Error('expected the retained heading content')
    if(editor.style.minHeight||host.style.minHeight)throw new Error('activation must not add a layout wrapper or minimum height')
    if(host.getBoundingClientRect().height!==42)throw new Error('heading height changed on activation')

    const copyEvent = new dom.window.Event('copy', { bubbles: true, cancelable: true })
    editor.dispatchEvent(copyEvent)
    if (!copyEvent.defaultPrevented) {
      throw new Error('expected copy to be prevented when forbidCopy is true')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditHeadingDoubleClickSelectsWordOnOpen() {
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
        as="h2"
        className="font-semibold text-xl"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['## Hello world']}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
        editStripLinePrefix={(line: string) => {
          const m = line.match(/^(\s*#{1,6}\s+)([\s\S]*)$/)
          if (!m) return { prefix: '', content: line }
          return { prefix: m[1] || '', content: m[2] || '' }
        }}
      >
        <span>Hello world</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    const host = dom.window.document.querySelector('h2') as HTMLElement | null
    if (!host) throw new Error('expected host h2')
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

    host.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 20, clientY: 10, detail: 2 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected heading editor after double click')
    const sel = dom.window.getSelection()
    if (!sel || sel.rangeCount <= 0) throw new Error('expected selection range on heading editor open')
    const range = sel.getRangeAt(0)
    const containerNode = range.startContainer.nodeType === dom.window.Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement
    if (!containerNode || !editor.contains(containerNode as Node)) {
      throw new Error('expected double click heading edit-open to place active selection/caret inside heading editor')
    }

    root.unmount()
  } finally {
    restore()
  }
}
