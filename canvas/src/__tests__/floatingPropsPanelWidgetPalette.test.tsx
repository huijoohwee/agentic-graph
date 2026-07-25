import React from 'react'
import { createRoot } from 'react-dom/client'

import { FloatingPropsPanel } from '@/features/toolbar/FloatingPropsPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'

const renderAndFlush = async (
  root: ReturnType<typeof createRoot>,
  node: React.ReactNode,
  frameCount = 4,
) => {
  const win = (globalThis as unknown as { window?: Window }).window
  if (!win) throw new Error('expected window for root render flush')
  await mountReactRoot(root, node as React.ReactElement, { window: win, frames: frameCount })
}

export async function testPropsPanelRendersWidgetPaletteOnlySurface() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderAndFlush(root, React.createElement(FloatingPropsPanel))

    const surface = container.querySelector('[data-kg-props-panel-surface="widget-palette"]')
    if (!surface) throw new Error('expected Floating Props Panel to render the palette-only surface marker')
    const layouts = surface.querySelectorAll('[data-kg-widget-palette-layout]')
    if (layouts.length !== 5) {
      throw new Error(`expected five canonical palette layouts, got ${layouts.length}`)
    }

    const text = String(container.textContent || '')
    for (const expected of [
      'Widgets',
      'Widget Card Type 0',
      'Probe-Tree Type 1',
      'Probe-Tree Type 2',
      'Deliverables Widget Card',
      'Rich Media Panel',
    ]) {
      if (!text.includes(expected)) {
        throw new Error(`expected Floating Props Panel palette text ${JSON.stringify(expected)}, got ${JSON.stringify(text)}`)
      }
    }
    for (const registryMetadata of ['default/richMediaPanel', 'default/textGeneration']) {
      if (text.includes(registryMetadata)) {
        throw new Error(`expected palette previews to hide registry metadata ${JSON.stringify(registryMetadata)}, got ${JSON.stringify(text)}`)
      }
    }
    for (const staleToken of [
      'Add Node',
      'Node',
      'Media view',
      'Panel layout',
      'Layout',
      'Edge',
      'Discovery Widget',
      'Image Widget',
      'Video Widget',
      'Update Media',
      'Add Media Node',
      'Text Widget',
    ]) {
      if (text.includes(staleToken)) {
        throw new Error(`expected Floating Props Panel palette-only render to omit stale token ${JSON.stringify(staleToken)}, got ${JSON.stringify(text)}`)
      }
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
