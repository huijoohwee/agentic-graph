import React from 'react'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownViewerInlineEditSurfaceParitySnapshotAppliesReadSurfaceStyles() {
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
        editCaptureLayoutSpacing
      >
        <span>Hello world</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected host p')
    if (String(host.tagName || '').toUpperCase() !== 'P') throw new Error('expected host to be rendered as p')
    host.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 42,
        width: 320,
        height: 42,
        toJSON: () => ({}),
      }) as unknown as DOMRect

    const sourceSpan = host.querySelector('span') as HTMLElement | null
    if (!sourceSpan) throw new Error('expected view source span')

    const originalGetComputedStyle = dom.window.getComputedStyle.bind(dom.window)
    dom.window.getComputedStyle = ((node: Element) => {
      if (node === sourceSpan || node === host) {
        return {
          ...originalGetComputedStyle(node),
          fontFamily: 'Inter',
          fontSize: '17px',
          fontWeight: '600',
          fontStyle: 'italic',
          lineHeight: '24px',
          letterSpacing: '0.2px',
          color: 'rgb(22, 22, 22)',
          textAlign: 'right',
          wordSpacing: '4px',
          textIndent: '8px',
          paddingTop: '3px',
          paddingRight: '7px',
          paddingBottom: '5px',
          paddingLeft: '9px',
          marginTop: '2px',
          marginRight: '4px',
          marginBottom: '6px',
          marginLeft: '8px',
          borderTopWidth: '1px',
          borderRightWidth: '2px',
          borderBottomWidth: '3px',
          borderLeftWidth: '4px',
          borderTopStyle: 'solid',
          borderRightStyle: 'dashed',
          borderBottomStyle: 'double',
          borderLeftStyle: 'dotted',
          borderTopColor: 'rgb(10, 20, 30)',
          borderRightColor: 'rgb(11, 21, 31)',
          borderBottomColor: 'rgb(12, 22, 32)',
          borderLeftColor: 'rgb(13, 23, 33)',
          borderRadius: '10px',
          boxSizing: 'border-box',
          backgroundColor: 'rgb(240, 240, 240)',
          caretColor: 'rgb(30, 30, 30)',
        } as unknown as CSSStyleDeclaration
      }
      return originalGetComputedStyle(node)
    }) as typeof dom.window.getComputedStyle

    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    if(editor!==sourceSpan)throw new Error('expected the original rendered content element')
    const style=dom.window.getComputedStyle(editor)
    if(style.paddingTop!=='3px'||style.paddingLeft!=='9px'||style.marginTop!=='2px'||style.borderLeftWidth!=='4px'||style.textAlign!=='right'||style.backgroundColor!=='rgb(240, 240, 240)')throw new Error('rendered typography and spacing must remain unchanged')
    if(editor.getAttribute('style'))throw new Error('activation must not copy layout into a replacement style')

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditSurfaceKeepsMediaAsInlineChip() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const sourceLine = '4. Approve the @storyboard cards before any paid or mutating provider call. ![Image: image-088c7665f3bdba06.jpg](https://example.com/image-088c7665f3bdba06.jpg)'

    root.render(
      <MarkdownBlockContainer
        as="span"
        className="font-sans relative"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={[sourceLine]}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Approve the @storyboard cards before any paid or mutating provider call.</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected editable host')
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    const fullImage = Array.from(editor.querySelectorAll('img')).find(
      candidate => !candidate.closest('[data-kg-inline-media-edit-token="1"] [data-kg-inline-command-thumbnail]'),
    ) || null
    if (fullImage) throw new Error(`expected click-to-edit media to stay an inline chip, not full image; html=${editor.innerHTML}`)
    const chip = editor.querySelector('[data-kg-inline-media-edit-token="1"]') as HTMLElement | null
    if (!chip) throw new Error(`expected edit surface media to use inline chip token; html=${editor.innerHTML}`)
    const chipText = String(chip.textContent || '')
    if (!chipText.includes('image-088c7665f3bdba06.jpg')) {
      throw new Error(`expected edit media chip to preserve asset label, got ${JSON.stringify(chipText)}`)
    }
    if (chipText.includes('Image:')) {
      throw new Error(`expected edit media chip to strip prose-like Image: prefix, got ${JSON.stringify(chipText)}`)
    }
    const storedMarkdown = String(chip.getAttribute('data-kg-inline-media-markdown') || '')
    if (!storedMarkdown.includes('![Image: image-088c7665f3bdba06.jpg](https://example.com/image-088c7665f3bdba06.jpg)')) {
      throw new Error(`expected edit media chip to preserve original markdown token, got ${JSON.stringify(storedMarkdown)}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditMediaCommandUsesCachedInlineCaret() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const selectionMod = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.selection')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const sourceLines = [
      'Review @asset the source evidence into editable storyboard elements.',
      '![Image: asset.jpg](https://example.com/asset.jpg)',
    ]

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={sourceLines}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>Review @asset the source evidence into editable storyboard elements.</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected editable host')
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    const commandOffset = sourceLines[0].indexOf('@asset') + '@asset'.length
    selectionMod.setSelectionByOffsetsWithin(editor, { startOffset: commandOffset, endOffset: commandOffset })
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, data: '', inputType: 'insertText' }))
    await tick()
    await tick()

    const toolbar = dom.window.document.querySelector('section[aria-label="Variable toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error(`expected variable toolbar to open for @ media command; html=${dom.window.document.body.innerHTML}`)
    const assetButton = Array.from(toolbar.querySelectorAll('button')).find(button => String(button.textContent || '').includes('asset.jpg')) as HTMLButtonElement | null
    if (!assetButton) throw new Error(`expected media command candidate for asset.jpg; toolbar=${toolbar.textContent}`)
    dom.window.getSelection()?.removeAllRanges()
    assetButton.click()
    await tick()
    await tick()

    const nextText = String(editor.textContent || '').replace(/\s+/g, ' ').trim()
    const assetIndex = nextText.indexOf('asset.jpg')
    const sourceIndex = nextText.indexOf('the source evidence')
    if (assetIndex < 0) throw new Error(`expected inserted inline media chip text; text=${JSON.stringify(nextText)} html=${editor.innerHTML}`)
    if (sourceIndex < 0) throw new Error(`expected original trailing text to remain; text=${JSON.stringify(nextText)} html=${editor.innerHTML}`)
    if (assetIndex > sourceIndex) {
      throw new Error(`expected media command to insert at cached @ caret, not append after paragraph; text=${JSON.stringify(nextText)} html=${editor.innerHTML}`)
    }
    const chip = editor.querySelector('[data-kg-inline-media-edit-token="1"]') as HTMLElement | null
    if (!chip) throw new Error(`expected inserted media to render as shared inline chip; html=${editor.innerHTML}`)

    root.unmount()
  } finally {
    restore()
  }
}

export async function testMarkdownViewerInlineEditMediaCommandPreservesExistingInlineMediaChip() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const reactDomClient = await import('react-dom/client')
    const root = reactDomClient.createRoot(container)
    const mod = await import('@/features/markdown/ui/MarkdownBlockContainer')
    const selectionMod = await import('@/lib/markdown-core/ui/markdownBlockContainerCore.selection')
    const MarkdownBlockContainer = mod.MarkdownBlockContainer
    const sourceLines = [
      'The ![Image: first.jpg](https://example.com/first.jpg) template @asset is intentionally neutral.',
      '![Image: asset.jpg](https://example.com/asset.jpg)',
    ]

    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={sourceLines}
        onReplaceLineRange={() => {}}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <span>The first.jpg template @asset is intentionally neutral.</span>
      </MarkdownBlockContainer>,
    )

    await tick()
    await tick()

    const host = dom.window.document.querySelector('[data-start-line="1"]') as HTMLElement | null
    if (!host) throw new Error('expected editable host')
    host.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    await tick()
    await tick()

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editor) throw new Error('expected contenteditable editor to mount after click')
    const initialChips = Array.from(editor.querySelectorAll('[data-kg-inline-media-edit-token="1"]')) as HTMLElement[]
    if (initialChips.length !== 1 || !String(initialChips[0]?.getAttribute('data-kg-inline-media-markdown') || '').includes('first.jpg')) {
      throw new Error(`expected initial paragraph media to render as one inline chip; html=${editor.innerHTML}`)
    }

    const visibleText = String(editor.textContent || '')
    const commandOffset = visibleText.indexOf('@asset') + '@asset'.length
    if (commandOffset < '@asset'.length) throw new Error(`expected visible @asset trigger after first chip; text=${JSON.stringify(visibleText)} html=${editor.innerHTML}`)
    selectionMod.setSelectionByOffsetsWithin(editor, { startOffset: commandOffset, endOffset: commandOffset })
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, cancelable: true, data: '', inputType: 'insertText' }))
    await tick()
    await tick()

    const toolbar = dom.window.document.querySelector('section[aria-label="Variable toolbar"]') as HTMLElement | null
    if (!toolbar) throw new Error(`expected variable toolbar to open for second @ media command; html=${dom.window.document.body.innerHTML}`)
    const assetButton = Array.from(toolbar.querySelectorAll('button')).find(button => String(button.textContent || '').includes('asset.jpg')) as HTMLButtonElement | null
    if (!assetButton) throw new Error(`expected second media candidate for asset.jpg; toolbar=${toolbar.textContent}`)
    dom.window.getSelection()?.removeAllRanges()
    assetButton.click()
    await tick()
    await tick()

    const chips = Array.from(editor.querySelectorAll('[data-kg-inline-media-edit-token="1"]')) as HTMLElement[]
    const storedMarkdown = chips.map(chip => String(chip.getAttribute('data-kg-inline-media-markdown') || ''))
    if (chips.length !== 2 || !storedMarkdown.some(markdown => markdown.includes('first.jpg')) || !storedMarkdown.some(markdown => markdown.includes('asset.jpg'))) {
      throw new Error(`expected second @ insertion to preserve first chip and add second chip; markdown=${JSON.stringify(storedMarkdown)} html=${editor.innerHTML}`)
    }
    const nextText = String(editor.textContent || '').replace(/\s+/g, ' ').trim()
    if (nextText.includes('@asset')) throw new Error(`expected @asset trigger to be replaced, text=${JSON.stringify(nextText)} html=${editor.innerHTML}`)
    if (nextText.indexOf('first.jpg') > nextText.indexOf('asset.jpg') || nextText.indexOf('asset.jpg') > nextText.indexOf('is intentionally neutral')) {
      throw new Error(`expected media chips to remain inline in sentence order, text=${JSON.stringify(nextText)} html=${editor.innerHTML}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}
