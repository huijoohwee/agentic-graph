import React from 'react'
import {
  FULL_CANVAS_INSETS, readCanvasContainerSizing, resolveCanvasContainerInsets,
  subscribeCanvasContainerSizing,
} from '@/lib/canvas/canvasContainerSizing'

const OVERLAYS = '[data-kg-workspace-left-pane="1"], [data-kg-floating-panel-root="true"], .MainPanelContainer, .kg-canvas-bottom-panel'
const CHROME = `${OVERLAYS}, [data-kg-workspace-visible-viewport-occluder], [aria-label="Canvas Toolbar"]`

/** One sizing owner for all renderers. Editor and panel overlays remain on the full workspace. */
export function CanvasViewContainer({ children, configurable = true, sizing, overlay = false }: {
  children: React.ReactNode
  configurable?: boolean
  sizing?: 'full' | 'inset'
  overlay?: boolean
}) {
  const preference = React.useSyncExternalStore(subscribeCanvasContainerSizing, readCanvasContainerSizing, () => 'full' as const)
  const mode = sizing ?? (configurable ? preference : 'full')
  const frameRef = React.useRef<HTMLElement>(null)
  const [insets, setInsets] = React.useState(FULL_CANVAS_INSETS)
  React.useLayoutEffect(() => {
    const frame = frameRef.current
    if (mode !== 'inset' || !frame) return
    const doc = frame.ownerDocument, win = doc.defaultView
    if (!win) return
    const selectors = overlay ? CHROME : OVERLAYS
    let pending = 0
    let panels: Element[] = []
    const resize = new ResizeObserver(() => schedule())
    const measure = () => {
      pending = 0
      const nextPanels = Array.from(doc.querySelectorAll(selectors)).filter(panel => !frame.contains(panel))
      for (const panel of panels) if (!nextPanels.includes(panel)) resize.unobserve(panel)
      for (const panel of nextPanels) if (!panels.includes(panel)) resize.observe(panel)
      panels = nextPanels
      const rects = panels.filter(panel => panel.getClientRects().length > 0
        && !panel.closest('[aria-hidden="true"]') && win.getComputedStyle(panel).visibility !== 'hidden')
        .map(panel => panel.getBoundingClientRect())
      const next = resolveCanvasContainerInsets(mode, frame.getBoundingClientRect(), rects)
      setInsets(previous => previous.left === next.left && previous.right === next.right
        && previous.top === next.top && previous.bottom === next.bottom ? previous : next)
    }
    function schedule() { if (!pending) pending = win!.requestAnimationFrame(measure) }
    const containsPanel = (node: Node) => node instanceof Element
      && (node.matches(selectors) || Boolean(node.querySelector(selectors)))
    const mutations = new win.MutationObserver(records => {
      if (records.some(record => record.type === 'attributes'
        ? containsPanel(record.target)
        : [...record.addedNodes, ...record.removedNodes].some(containsPanel))) schedule()
    })
    resize.observe(frame)
    mutations.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'data-kg-workspace-visible-viewport-occluder'] })
    win.addEventListener('resize', schedule)
    doc.addEventListener('scroll', schedule, true)
    measure()
    return () => {
      resize.disconnect()
      mutations.disconnect()
      win.cancelAnimationFrame(pending)
      win.removeEventListener('resize', schedule)
      doc.removeEventListener('scroll', schedule, true)
    }
  }, [mode, overlay])
  return <section ref={frameRef} className="absolute inset-0 pointer-events-none" data-kg-canvas-container-frame="1">
    <section className={`absolute overflow-hidden ${overlay ? 'pointer-events-none' : 'pointer-events-auto'}`} style={mode === 'inset' ? insets : FULL_CANVAS_INSETS}
      data-kg-canvas-view-container={mode}>
      {children}
    </section>
  </section>
}
