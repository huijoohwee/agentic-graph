import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownBlockContainer } from '@/features/markdown/ui/MarkdownBlockContainer'
import { normalizeInvocationTokenSpacing } from '@/lib/markdown/invocationTokens'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async (count: number = 1) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

const selectNodeText = (dom: ReturnType<typeof initJsdomHarness>['dom'], node: Node) => {
  const selection = dom.window.getSelection()
  if (!selection) throw new Error('expected document selection')
  const range = dom.window.document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
  dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
}

const openToolbarMenu = (dom: ReturnType<typeof initJsdomHarness>['dom'], ariaLabel: string) => {
  const trigger = dom.window.document.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null
  if (!trigger) throw new Error(`expected ${ariaLabel} toolbar trigger`)
  trigger.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
  trigger.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  trigger.click()
}

const clickToolbarMenuAction = (
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  menuLabel: string,
  actionLabel: string,
) => {
  const actions = Array.from(
    dom.window.document.querySelectorAll(`menu[aria-label="${menuLabel}"] button`),
  ) as HTMLButtonElement[]
  const action = actions.find(button => String(button.textContent || '').trim() === actionLabel)
  if (!action) throw new Error(`expected ${actionLabel} action in ${menuLabel}`)
  action.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  action.click()
}

export async function testMarkdownViewerInlineEditCombinedBoldColorHighlightMutationKeepsCanonicalSigil() {
  const canonicalSigil = '**`#EF4444|bg#FEF08A:storyboard`**'
  if (normalizeInvocationTokenSpacing(canonicalSigil) !== canonicalSigil) {
    throw new Error('expected invocation spacing normalization to preserve annotation sigils inside inline code')
  }
  if (normalizeInvocationTokenSpacing('open#storyboard') !== 'open #storyboard') {
    throw new Error('expected invocation spacing normalization to retain compact keyword separation outside code')
  }

  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const rangePrototype = dom.window.Range.prototype as unknown as {
      getBoundingClientRect?: () => DOMRect
    }
    if (typeof rangePrototype.getBoundingClientRect !== 'function') {
      rangePrototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 10,
        bottom: 10,
        width: 10,
        height: 10,
        toJSON: () => ({}),
      } as DOMRect)
    }

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    const replaceCalls: Array<{ startLine: number; endLine: number; replacementLines: string[] }> = []
    const draftChanges: string[] = []
    const root = createRoot(container)
    root.render(
      <MarkdownBlockContainer
        as="p"
        className="mt-2 mb-2 text-sm"
        highlightClass=""
        startLine={1}
        endLine={1}
        inlineEditable
        sourceLines={['**storyboard**']}
        onReplaceLineRange={args => replaceCalls.push(args)}
        onInlineDraftTextChange={nextText => draftChanges.push(nextText)}
        editPresentation="html"
        editHtmlRender="inline"
      >
        <strong>storyboard</strong>
      </MarkdownBlockContainer>,
    )
    await tick(2)

    const host = dom.window.document.querySelector('p') as HTMLElement | null
    if (!host) throw new Error('expected paragraph host')
    host.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 42,
      width: 320,
      height: 42,
      toJSON: () => ({}),
    } as DOMRect)
    host.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    }))
    await tick(3)

    const editor = dom.window.document.querySelector('[contenteditable="true"]') as HTMLElement | null
    const strong = editor?.querySelector('strong')
    const textNode = strong?.firstChild
    if (!editor || !strong || !textNode) throw new Error('expected bold text in the inline editor')

    selectNodeText(dom, textNode)
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    await tick(3)
    openToolbarMenu(dom, 'Text color')
    await tick(2)
    clickToolbarMenuAction(dom, 'Text color menu', 'Red')
    await tick(4)

    const colored = editor.querySelector('[data-kg-sigil="1"]') as HTMLElement | null
    if (!colored || colored.getAttribute('data-kg-sigil-color') !== '#EF4444') {
      throw new Error(`expected red sigil mutation, html=${editor.innerHTML}`)
    }
    if (draftChanges.at(-1) !== '**`#EF4444:storyboard`**') {
      throw new Error(`expected canonical red draft mutation, got ${JSON.stringify(draftChanges)}`)
    }

    selectNodeText(dom, colored)
    editor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    await tick(3)
    openToolbarMenu(dom, 'Highlight')
    await tick(2)
    clickToolbarMenuAction(dom, 'Highlight menu', 'Yellow')
    await tick(4)

    const combined = editor.querySelector('[data-kg-sigil="1"]') as HTMLElement | null
    if (
      !combined
      || combined.getAttribute('data-kg-sigil-color') !== '#EF4444'
      || combined.getAttribute('data-kg-sigil-bg') !== '#FEF08A'
    ) {
      throw new Error(`expected one merged red/yellow sigil mutation, html=${editor.innerHTML}`)
    }
    if (draftChanges.at(-1) !== canonicalSigil) {
      throw new Error(`expected canonical combined draft mutation, got ${JSON.stringify(draftChanges)}`)
    }
    if (replaceCalls.length > 0) {
      throw new Error(`expected toolbar mutation to remain draft-only before explicit commit, got ${JSON.stringify(replaceCalls)}`)
    }

    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      ctrlKey: true,
    }))
    await tick(8)

    const replacement = replaceCalls.at(-1)?.replacementLines
    if (replacement?.length !== 1 || replacement[0] !== canonicalSigil) {
      throw new Error(`expected canonical combined mutation, got ${JSON.stringify(replaceCalls)}, drafts=${JSON.stringify(draftChanges)}, html=${editor.innerHTML}`)
    }

    root.unmount()
  } finally {
    restore()
  }
}
