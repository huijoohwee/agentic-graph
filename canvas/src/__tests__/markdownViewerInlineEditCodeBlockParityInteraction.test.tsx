import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { UI_RESPONSIVE_CONTENT_START_PADDING_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const baseOpts = (sourceLines: string[]) => ({
  activeDocumentPath: '/tmp/doc.md',
  uiPanelTextFontClass: '',
  uiPanelMonospaceTextClass: 'font-mono text-xs',
  markdownPresentationMode: false,
  highlightedLineRange: null,
  markdownWordWrap: true,
  mermaidFrontmatterConfig: null,
  rootThemeMode: 'light' as const,
  previewOverlayScope: 'container' as const,
  viewerBlockEditingEnabled: true,
  markdownBlockControlsEnabled: true,
  markdownBlockGutterEnabled: false,
  onReplaceLineRange: () => {},
  markdownSourceLines: sourceLines,
  forbidCopy: false,
})

const withOpts = (sourceLines: string[], overrides: Record<string, unknown>) => ({
  ...baseOpts(sourceLines),
  ...overrides,
})

export async function testMarkdownViewerInlineEditCodeBlockKeepsSurfaceLayoutParity() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const a = 1', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', 'const a = 1', '```']) as never}
        wrapClass=""
      />,
    )

    await tick(2)
    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code block host figure')
    const readCode = host.querySelector('code') as HTMLElement | null
    if (!readCode) throw new Error('expected read code node for line-by-line spacing parity')
    if (!String(readCode.className || '').includes('leading-[1.5em]')) {
      throw new Error(`expected read highlighted code surface to keep centralized line spacing class; class=${JSON.stringify(String(readCode.className || ''))}`)
    }
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)

    const header = dom.window.document.querySelector('header')
    if (!header) throw new Error('expected code block header to remain visible while editing via static read-surface reuse')
    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code block editor')
    const cls = [editor.className,editor.parentElement?.className,editor.parentElement?.parentElement?.className,editor.parentElement?.parentElement?.parentElement?.className].join(' ')
    if (!cls.includes('p-4') || !editor.closest('pre') || !cls.includes('overflow-auto') || !cls.includes('leading-[1.5em]')) {
      throw new Error(`expected code block edit surface to keep read/edit spacing and preformat parity classes; class=${JSON.stringify(cls)}`)
    }
    if (
      editor.style.paddingTop ||
      editor.style.paddingLeft ||
      editor.style.paddingBottom ||
      editor.style.marginTop ||
      editor.style.marginLeft ||
      editor.style.marginBottom ||
      editor.style.borderTopWidth ||
      editor.style.borderLeftWidth ||
      editor.style.borderBottomWidth
    ) {
      throw new Error('expected code block edit surface not to inline-mutate spacing/border layout styles')
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditAsciiCodeBlockKeepsCompactTypographyParity() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: '+---+', info: 'ascii', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ascii', '+---+', '```']) as never}
        wrapClass=""
      />,
    )

    await tick(2)
    const readPre = dom.window.document.querySelector('figure pre') as HTMLElement | null
    if (!readPre) throw new Error('expected ascii code block read pre node')
    const readClass = String(readPre.className || '')
    if (!readClass.includes('text-xs') || !readClass.includes('leading-4')) {
      throw new Error(`expected ascii code block read surface to use compact typography SSOT; class=${JSON.stringify(readClass)}`)
    }
    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code block host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected ascii code block editor')
    const editorClass = [editor.className,editor.parentElement?.className,editor.parentElement?.parentElement?.className,editor.parentElement?.parentElement?.parentElement?.className].join(' ')
    if (!editorClass.includes('text-xs') || !editorClass.includes('leading-4')) {
      throw new Error(`expected ascii code block editor to keep compact typography parity from read surface; class=${JSON.stringify(editorClass)}`)
    }
    if (!editorClass.includes('p-4')) {
      throw new Error(`expected ascii code block editor to keep code-fence content padding SSOT parity; class=${JSON.stringify(editorClass)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditCodeBlockGutterLayoutKeepsSpacingParity() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const a = 1', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={withOpts(['```ts', 'const a = 1', '```'], {
          markdownBlockGutterEnabled: true,
          onInsertLineAfter: () => {},
        }) as never}
        wrapClass=""
      />,
    )

    await tick(2)
    const wrapper = dom.window.document.querySelector('section.relative.group') as HTMLElement | null
    if (!wrapper) throw new Error('expected code block gutter wrapper section')
    const wrapperClass = String(wrapper.className || '')
    if (!wrapperClass.includes('my-4') || !wrapperClass.includes(UI_RESPONSIVE_CONTENT_START_PADDING_CLASSNAME) || !wrapperClass.includes('pr-2')) {
      throw new Error(`expected code block gutter wrapper to keep read-surface spacing/gutter parity classes; class=${JSON.stringify(wrapperClass)}`)
    }

    const host = wrapper.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code block host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)

    const editor = wrapper.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code block editor inside gutter wrapper')
    const editorClass = [editor.className,editor.parentElement?.className,editor.parentElement?.parentElement?.className,editor.parentElement?.parentElement?.parentElement?.className].join(' ')
    if (!editorClass.includes('p-4') || !editor.closest('pre') || !editorClass.includes('leading-[1.5em]')) {
      throw new Error(`expected code block editor in gutter layout to keep shared spacing/preformat parity classes; class=${JSON.stringify(editorClass)}`)
    }
    const wrapperClassAfterEdit = String(wrapper.className || '')
    if (wrapperClassAfterEdit !== wrapperClass) {
      throw new Error(`expected code block gutter wrapper classes to remain stable across read/edit toggle; before=${JSON.stringify(wrapperClass)} after=${JSON.stringify(wrapperClassAfterEdit)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceToggleWordWrapUpdatesReadAndEditSurface() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const veryLongIdentifierName = 1;', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', 'const veryLongIdentifierName = 1;', '```']) as never}
        wrapClass=""
      />,
    )
    await tick(2)

    const pre = dom.window.document.querySelector('figure pre') as HTMLElement | null
    if (!pre) throw new Error('expected code-fence read pre node')
    const beforeWrapClass = String(pre.className || '')
    if (beforeWrapClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence to start without wrap when base wrap class is empty; class=${JSON.stringify(beforeWrapClass)}`)
    }
    const toggle = dom.window.document.querySelector('button[aria-label="Toggle word wrap"]') as HTMLButtonElement | null
    if (!toggle) throw new Error('expected code-fence word-wrap toggle button')
    if (toggle.disabled) throw new Error('expected code-fence word-wrap toggle to be enabled for standard code fences')
    toggle.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(2)

    const preAfter = dom.window.document.querySelector('figure pre') as HTMLElement | null
    if (!preAfter) throw new Error('expected code-fence read pre node after wrap toggle')
    const afterWrapClass = String(preAfter.className || '')
    if (!afterWrapClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence read surface to enable wrapped class after toggle; class=${JSON.stringify(afterWrapClass)}`)
    }

    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code-fence host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)
    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code-fence editor after click-to-edit')
    const editorClass = [editor.className,editor.parentElement?.className,editor.parentElement?.parentElement?.className,editor.parentElement?.parentElement?.parentElement?.className].join(' ')
    if (!editorClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence edit surface to reuse wrap toggle state; class=${JSON.stringify(editorClass)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceToggleWordWrapOffDisablesWrapInEditSurface() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const veryLongIdentifierName = 1;', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', 'const veryLongIdentifierName = 1;', '```']) as never}
        wrapClass="whitespace-pre-wrap break-words"
      />,
    )
    await tick(2)

    const pre = dom.window.document.querySelector('figure pre') as HTMLElement | null
    if (!pre) throw new Error('expected code-fence read pre node')
    const beforeToggleClass = String(pre.className || '')
    if (!beforeToggleClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence to start with wrap enabled when base wrap class is present; class=${JSON.stringify(beforeToggleClass)}`)
    }
    const toggle = dom.window.document.querySelector('button[aria-label="Toggle word wrap"]') as HTMLButtonElement | null
    if (!toggle) throw new Error('expected code-fence word-wrap toggle button')
    toggle.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(2)

    const preAfterToggle = dom.window.document.querySelector('figure pre') as HTMLElement | null
    if (!preAfterToggle) throw new Error('expected code-fence read pre node after toggling wrap off')
    const afterToggleClass = String(preAfterToggle.className || '')
    if (afterToggleClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence read surface to disable wrapped class after toggle off; class=${JSON.stringify(afterToggleClass)}`)
    }

    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code-fence host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)
    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code-fence editor after click-to-edit')
    const editorClass = [editor.className,editor.parentElement?.className,editor.parentElement?.parentElement?.className,editor.parentElement?.parentElement?.parentElement?.className].join(' ')
    if (editorClass.includes('whitespace-pre-wrap')) {
      throw new Error(`expected code-fence edit surface wrap class to be disabled when toggle is off; class=${JSON.stringify(editorClass)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceEditOpenDoesNotInjectSyntheticBottomGap() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const a = 1;', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', 'const a = 1;', '```']) as never}
        wrapClass=""
      />,
    )
    await tick(2)

    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code-fence host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 120,
        width: 640,
        height: 120,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick(3)

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code-fence editor')
    const text = String(editor.textContent || '')
    if (/\n$/.test(text)) {
      throw new Error(`expected code-fence edit-open not to append synthetic trailing newline row; text=${JSON.stringify(text)}`)
    }
    const surface = editor.parentElement as HTMLElement | null
    if (!surface) throw new Error('expected code-fence edit surface container')
    if (String(surface.style.minHeight || '').trim()) {
      throw new Error(`expected code-fence edit surface not to preserve host min-height and synthesize bottom spacing gap; minHeight=${JSON.stringify(surface.style.minHeight)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceSingleClickOpensCaretNearClickPosition() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock
    const longLine = 'const extremelyLongIdentifierNameForCaretPlacementRegression = 1234567890;'

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: longLine, info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', longLine, '```']) as never}
        wrapClass=""
      />,
    )
    await tick(2)

    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code-fence host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 720,
        bottom: 140,
        width: 720,
        height: 140,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 420, clientY: 92 }))
    await tick(3)

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code-fence editor after single click')
    const selection = dom.window.getSelection()
    if (!selection || selection.rangeCount <= 0) {
      throw new Error('expected active selection/caret range after code-fence click-to-edit')
    }
    const range = selection.getRangeAt(0)
    const containerNode = range.startContainer.nodeType === dom.window.Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement
    if (!containerNode || !editor.contains(containerNode as Node)) {
      throw new Error('expected code-fence single-click edit-open caret to remain inside code editor')
    }
    if (range.startOffset <= 0) {
      throw new Error(`expected code-fence single-click edit-open caret offset to reflect click position, not snap to first character; offset=${range.startOffset}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceSingleClickRespectsVerticalLinePosition() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock
    const lines = ['alpha = 1', 'beta = 2', 'gamma = 3']

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: lines.join('\n'), info: 'python', startLine: 1, endLine: 5 } as never}
        highlightClass=""
        opts={baseOpts(['```python', ...lines, '```']) as never}
        wrapClass=""
      />,
    )
    await tick(2)

    const host = dom.window.document.querySelector('figure') as HTMLElement | null
    if (!host) throw new Error('expected code-fence host figure')
    host.getBoundingClientRect = () => {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 720,
        bottom: 180,
        width: 720,
        height: 180,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 132 }))
    await tick(3)

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected code-fence editor after single click')
    const selection = dom.window.getSelection()
    if (!selection || selection.rangeCount <= 0) throw new Error('expected active selection range for multiline code-fence')
    const range = selection.getRangeAt(0)
    const fullText = String(editor.textContent || '')
    const {getSelectionOffsetsWithin}=await import('@/lib/markdown-core/ui/markdownBlockContainerCore.selection')
    const head = fullText.slice(0, getSelectionOffsetsWithin(editor)?.startOffset??0)
    const lineIndex = head.split('\n').length - 1
    if (lineIndex < 1) {
      throw new Error(`expected click near lower portion of code fence to place caret on later line, not first line; lineIndex=${lineIndex}, offset=${range.startOffset}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerCodeFenceToggleWordWrapDoesNotOpenInlineEditor() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownCodeBlock')
    const MarkdownCodeBlock = mod.MarkdownCodeBlock

    root.render(
      <MarkdownCodeBlock
        token={{ type: 'code', text: 'const v = 1;', info: 'ts', startLine: 1, endLine: 3 } as never}
        highlightClass=""
        opts={baseOpts(['```ts', 'const v = 1;', '```']) as never}
        wrapClass=""
      />,
    )
    await tick(2)

    const toggle = dom.window.document.querySelector('button[aria-label="Toggle word wrap"]') as HTMLButtonElement | null
    if (!toggle) throw new Error('expected code-fence word-wrap toggle button')
    toggle.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(2)

    const editor = dom.window.document.querySelector('[contenteditable="true"]')
    if (editor) {
      throw new Error('expected code-fence word-wrap toggle interaction not to open inline editor')
    }

    root.unmount()
  } finally {
    restore()
  }
}
