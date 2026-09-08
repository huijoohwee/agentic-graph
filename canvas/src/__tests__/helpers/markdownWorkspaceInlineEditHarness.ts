import { act } from 'react'
import type { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export const tick = async (n: number = 1) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

export const waitMs = async (ms: number) => {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

export const ensureRangeRect = (dom: ReturnType<typeof initJsdomHarness>['dom']) => {
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

export const installInlineExecCommandStub = (
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  commands: Array<'bold' | 'italic' | 'underline' | 'strikeThrough'>,
) => {
  const enabled = new Set(commands)
  const originalExecCommand = dom.window.document.execCommand
  dom.window.document.execCommand = ((cmd: string) => {
    if (!enabled.has(cmd as 'bold' | 'italic' | 'underline' | 'strikeThrough')) return false
    const sel = dom.window.getSelection()
    if (!sel || sel.rangeCount <= 0) return false
    const range = sel.getRangeAt(0)
    if (range.collapsed) return false
    const tagName = cmd === 'bold'
      ? 'strong'
      : cmd === 'italic'
        ? 'em'
        : cmd === 'strikeThrough'
          ? 's'
          : 'u'
    const wrapper = dom.window.document.createElement(tagName)
    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)
    range.selectNodeContents(wrapper)
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }) as typeof dom.window.document.execCommand
  return () => {
    dom.window.document.execCommand = originalExecCommand
  }
}

export const enableWorkspaceViewerPane = async (doc: Document): Promise<void> => {
  const toggle = doc.querySelector('input[aria-label="Show Viewer preview pane"]') as HTMLInputElement | null
  if (!toggle || toggle.disabled) throw new Error('expected an available Viewer preview pane toggle')
  await act(async () => {
    if (!toggle.checked) toggle.click()
    await tick(6)
  })
  if (!toggle.checked || toggle.disabled) throw new Error('expected Viewer preview pane to be enabled')
}
