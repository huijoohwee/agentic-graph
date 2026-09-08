import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { focusMarkdownInlineTextSelectionSoon, focusMarkdownInlineTextSelectionAtPointSoon } from '@/lib/markdown-core/ui/MarkdownInlineTextEditSurface'

export function testMarkdownInlineSelectionFramesRespectEditorOwnership() {
  const browser = initJsdomHarness(), win = browser.dom.window
  const originalRequest = win.requestAnimationFrame, originalCancel = win.cancelAnimationFrame
  const queued: FrameRequestCallback[] = [], canceled: number[] = []
  win.requestAnimationFrame = callback => { queued.push(callback); return queued.length }
  win.cancelAnimationFrame = id => { canceled.push(id) }
  const expect = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  const editor = () => {
    const root = win.document.createElement('div')
    root.setAttribute('contenteditable', 'true'); root.textContent = 'abcdef'
    win.document.body.appendChild(root)
    return root
  }
  const place = (root: HTMLElement, offset: number) => {
    const range = win.document.createRange()
    range.setStart(root.firstChild!, offset); range.collapse(true)
    const selection = win.document.getSelection()!
    selection.removeAllRanges(); selection.addRange(range)
  }
  try {
    const first = editor(), second = editor(), ref = { current: first }
    place(second, 0)
    focusMarkdownInlineTextSelectionSoon(ref, 2)
    ref.current = second; first.remove()
    queued[0](0)
    expect(win.document.getSelection()?.anchorOffset === 0, 'retired editor callback must not move replacement selection')
    focusMarkdownInlineTextSelectionSoon(ref, 1)
    focusMarkdownInlineTextSelectionSoon(ref, 4)
    expect(canceled.includes(2), 'superseded request must cancel its creating window frame')
    queued[1](0) // A callback already dequeued by the browser must also be fenced.
    expect(win.document.getSelection()?.anchorOffset === 0, 'superseded callback must have no intermediate effect')
    queued[2](0)
    expect(win.document.getSelection()?.anchorNode === second.firstChild && win.document.getSelection()?.anchorOffset === 4, 'latest live editor request must apply')
    focusMarkdownInlineTextSelectionAtPointSoon(ref, { x: 0, y: 0 }, 1)
    const third = editor(); ref.current = third; place(third, 0)
    queued[3](0)
    expect(win.document.getSelection()?.anchorNode === third.firstChild && win.document.getSelection()?.anchorOffset === 0, 'point request must not cross editor identity')
    focusMarkdownInlineTextSelectionSoon(ref, 3)
    third.remove(); place(second, 2)
    queued[4](0)
    expect(win.document.getSelection()?.anchorNode === second.firstChild, 'detached editor request must not steal the live selection')
    ref.current = second
    focusMarkdownInlineTextSelectionSoon(ref, 1)
    focusMarkdownInlineTextSelectionSoon({ current: second }, 5)
    queued[5](0)
    expect(win.document.getSelection()?.anchorOffset === 2, 'another ref for the same editor must supersede older work')
    queued[6](0)
    expect(win.document.getSelection()?.anchorOffset === 5, 'latest request through another ref must apply')
  } finally {
    win.requestAnimationFrame = originalRequest; win.cancelAnimationFrame = originalCancel
    browser.restore()
  }
}
