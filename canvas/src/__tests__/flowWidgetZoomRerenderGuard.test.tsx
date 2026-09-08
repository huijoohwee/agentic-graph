import React from 'react'
import { createRoot } from 'react-dom/client'

import FlowWidgetOverlay from '@/components/StoryboardWidget/FlowWidgetOverlay'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { emitStoryboardWidgetInteractionFrame, STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT } from '@/lib/canvas/storyboard-widget-overlay-proxy'

export async function testFlowWidgetZoomUpdatesDoNotRerenderPanel() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const failures: unknown[] = []

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = (cb: (ts: number) => void) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number
    ;(globalThis as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame =
      anyWindow.requestAnimationFrame

    const api = useGraphStore.getState()
    api.resetAll()
    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.selectNode('n1')

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    let commits = 0
    const onRender: React.ProfilerOnRenderCallback = () => {
      commits += 1
    }

    await React.act(async () => { root!.render(
      React.createElement(
        React.Profiler,
        { id: 'widget', onRender },
        React.createElement(FlowWidgetOverlay, {
          active: true,
          node: { id: 'n1', label: 'node', type: 'Anchor', x: 10, y: 10, properties: {} },
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
      ),
    ) })

    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (typeof raf === 'function') raf(() => resolve())
        else setTimeout(() => resolve(), 0)
      })

    // Drain the actual interaction frame and its React updates before sampling.
    await React.act(async () => { await tick() })

    const panel = document.body.querySelector('aside[data-kg-canvas-wheel-ignore="true"]')
    if (!panel) throw new Error('expected widget to render an overlay aside')
    const initialTransform = String((panel as HTMLElement).style.transform || '')
    const initialCommits = commits

    const frameIntents: boolean[] = []
    dom.window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, event => {
      frameIntents.push((event as CustomEvent<{ updateToolbarLayout?: boolean }>).detail?.updateToolbarLayout !== false)
    })
    await React.act(async () => {
      api.setZoomState({ k: 2, x: 50, y: 60 })
      await tick()
    })

    const nextTransform = String((panel as HTMLElement).style.transform || '')
    if (nextTransform === initialTransform) {
      throw new Error('expected overlay transform to update when zoomState changes')
    }

    if (commits !== initialCommits) {
      throw new Error(`expected zoomState updates to avoid React rerenders, commits ${initialCommits} -> ${commits}`)
    }
    if (frameIntents.join(',') !== 'false') {
      throw new Error('expected one real position-only interaction frame after zoom')
    }

    const toolbar = panel.querySelector('[data-kg-bubble-toolbar="1"]')?.parentElement
    if (!toolbar) throw new Error('expected widget action toolbar placement surface')
    const toolbarPosition = () => `${toolbar.style.top}|${toolbar.style.transform}`
    for (const geometryFirst of [false, true]) {
      if (geometryFirst) {
        const beforeZoom = commits
        await React.act(async () => {
          api.setZoomState({ k: 1, x: 0, y: 0 })
          await tick()
        })
        if (commits !== beforeZoom) throw new Error('expected subsequent zoom to keep React commits unchanged')
      }
      frameIntents.length = 0
      const previousToolbar = toolbarPosition()
      const previousCommits = commits
      await React.act(async () => {
        if (geometryFirst) emitStoryboardWidgetInteractionFrame()
        emitStoryboardWidgetInteractionFrame({ updateToolbarLayout: false })
        if (!geometryFirst) emitStoryboardWidgetInteractionFrame()
        await tick()
      })
      if (frameIntents.join(',') !== 'true') {
        throw new Error('expected geometry intent to survive either coalescing order')
      }
      if (commits <= previousCommits || toolbarPosition() === previousToolbar) {
        throw new Error('expected geometry interaction frame to refresh actual toolbar placement')
      }
    }
  } catch (error) {
    failures.push(error)
  } finally {
    try { await React.act(async () => { root?.unmount() }) } catch (error) { failures.push(error) }
    try { restoreDom() } catch (error) { failures.push(error) }
    try { restoreWindow() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, failures.map(error => String(error)).join('; '))
}
