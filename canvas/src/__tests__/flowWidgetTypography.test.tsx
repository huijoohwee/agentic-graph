import React from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import FlowWidgetOverlay from '@/components/StoryboardWidget/FlowWidgetOverlay'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testFlowWidgetTypographyInheritsPanelSettings() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const api = useGraphStore.getState()
    api.resetAll()
    api.setUiPanelTextFontClass('font-serif')
    api.setUiPanelKeyValueTextSizeClass('text-[15px]')
    api.setUiPanelMicroLabelTextSizeClass('text-[10px]')
    api.setUiPanelMonospaceTextClass('font-mono text-[13px]')
    api.setZoomState({ k: 1, x: 0, y: 0 })

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    root.render(
      React.createElement(FlowWidgetOverlay, {
        active: true,
        node: { id: 'n1', label: '890', type: 'Anchor', x: 10, y: 10, properties: {} },
        edges: [],
        viewportW: 800,
        viewportH: 600,
        onSetLabel: () => void 0,
        onSetType: () => void 0,
        onPatchProperties: () => void 0,
        onSetProperties: () => void 0,
        onValidate: () => void 0,
        onDuplicate: () => void 0,
        onRemove: () => void 0,
        onClearOutput: () => void 0,
        onHelp: () => void 0,
        onConvertToLoopNode: () => void 0,
        onTogglePortHandles: () => void 0,
        onEnableHandlesForAllInputs: () => void 0,
      } as never),
    )

    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (typeof raf === 'function') raf(() => resolve())
        else setTimeout(() => resolve(), 0)
      })

    await tick()
    await tick()

    const form = document.body.querySelector('form[aria-label="Widget form"]')
    if (!form) throw new Error('expected widget to render a form')
    const formClass = String(form.getAttribute('class') || '')
    if (!formClass.includes('text-[15px]')) {
      throw new Error(`expected form to inherit base panel text size, got ${JSON.stringify(formClass)}`)
    }

    const caption = form.querySelector('caption')
    if (!caption) throw new Error('expected widget to render a table caption')
    const captionClass = String(caption.getAttribute('class') || '')
    if (!captionClass.includes('text-xs')) {
      throw new Error(`expected caption to use micro label class, got ${JSON.stringify(captionClass)}`)
    }

    const formSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorForm.tsx'), 'utf8')
    if (
      !formSource.includes('const { panelTextClass, microLabelClass, monospaceTextClass, textSizeClass, keyValueInputClass, keyLabelClass } = usePanelTypography()') ||
      !formSource.includes('monospaceTextClass={monospaceTextClass}') ||
      !formSource.includes('monospaceTextClass,')
    ) {
      throw new Error('expected widget form source to propagate configured monospace typography to code/editor surfaces')
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
