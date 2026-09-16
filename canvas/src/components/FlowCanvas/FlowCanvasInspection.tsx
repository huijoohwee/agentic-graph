import React from 'react'
import { zoomIdentity } from 'd3'
import type { GraphData } from '@/lib/graph/types'
import { buildDagreLayout } from './layout'
import { readFlowConfig } from './config'
import { buildAndSetFlowNativeScene } from './buildNativeScene'
import { createFlowNativeRuntime, setFlowNativeTransform, setFlowNativeViewport, requestFlowNativeDraw,
  hitTestNode, type FlowNativeRuntime } from './nativeRuntime'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

/** Renderer reuse without editor subscriptions, snapshots, persistence or global selection. */
export default function FlowCanvasInspection({ graph, selectedNodeId, onSelect }: {
  graph: GraphData; selectedNodeId: string | null; onSelect: (nodeId: string) => void
}) {
  const container = React.useRef<HTMLDivElement>(null), canvas = React.useRef<HTMLCanvasElement>(null)
  const runtime = React.useRef<FlowNativeRuntime | null>(null), selected = React.useRef(selectedNodeId)
  const pointer = React.useRef<{ id: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  const positions = React.useMemo(() => buildDagreLayout({ nodes: graph.nodes, edges: graph.edges, rankdir: 'TB' }), [graph])
  selected.current = selectedNodeId
  const draw = React.useCallback(() => {
    if (runtime.current) requestFlowNativeDraw(runtime.current, { selectedNodeIds: selected.current ? [selected.current] : [], selectedEdgeIds: [] })
  }, [])
  const fit = React.useCallback(() => {
    const rt = runtime.current
    if (!rt) return
    const points = Object.values(positions)
    const width = Math.max(180, ...points.map(p => p.x + 180)), height = Math.max(48, ...points.map(p => p.y + 48))
    const scale = Math.max(0.08, Math.min(1.5, (rt.viewportW - 32) / width, (rt.viewportH - 32) / height))
    setFlowNativeTransform(rt, zoomIdentity.translate((rt.viewportW - width * scale) / 2, 16).scale(scale)); draw()
  }, [positions, draw])
  React.useLayoutEffect(() => {
    const element = canvas.current, parent = container.current, ctx = element?.getContext('2d')
    if (!element || !parent || !ctx) return
    const rt = createFlowNativeRuntime({ canvas: element, ctx, viewportW: parent.clientWidth, viewportH: 320,
      dpr: window.devicePixelRatio || 1, rankdir: 'TB' })
    runtime.current = rt
    // Static observed edges need no animation loop.
    rt.presentation.edges.animated = false
    buildAndSetFlowNativeScene({ runtime: rt, graphData: graph, positions, schema: null, forbidCircleNodes: true,
      flowConfig: readFlowConfig({ schema: null, rankdir: 'TB' }), sceneGroups: [], rankdir: 'TB' })
    const resize = () => {
      const width = Math.max(1, parent.clientWidth), height = 320, dpr = window.devicePixelRatio || 1
      element.width = Math.ceil(width * dpr); element.height = Math.ceil(height * dpr)
      setFlowNativeViewport(rt, { viewportW: width, viewportH: height, dpr }); fit()
    }
    const observer = new ResizeObserver(resize); observer.observe(parent); resize()
    return () => { observer.disconnect(); if (rt.pendingRaf !== null) cancelAnimationFrame(rt.pendingRaf); runtime.current = null }
  }, [graph, positions, fit])
  React.useEffect(draw, [draw, selectedNodeId])
  const zoom = (factor: number) => {
    const rt = runtime.current
    if (!rt) return
    const scale = Math.max(0.08, Math.min(4, rt.transform.k * factor)), ratio = scale / rt.transform.k
    setFlowNativeTransform(rt, zoomIdentity.translate(rt.viewportW / 2 + (rt.transform.x - rt.viewportW / 2) * ratio,
      rt.viewportH / 2 + (rt.transform.y - rt.viewportH / 2) * ratio).scale(scale)); draw()
  }
  return <section aria-label="Observed execution topology" className="min-w-0">
    <div className="flex flex-wrap gap-2 py-2">
      <button type="button" onClick={() => zoom(1.25)} className={UI_THEME_TOKENS.button.neutralMuted}>Zoom in</button>
      <button type="button" onClick={() => zoom(0.8)} className={UI_THEME_TOKENS.button.neutralMuted}>Zoom out</button>
      <button type="button" onClick={fit} className={UI_THEME_TOKENS.button.neutralMuted}>Fit topology</button>
    </div>
    <div ref={container} className="w-full min-w-0 overflow-hidden rounded border" style={{ height: 320 }}>
      <canvas ref={canvas} role="img" aria-label="Observed spans and causal links; use the node buttons below to select a span"
        style={{ width: '100%', height: 320, touchAction: 'none' }}
        onPointerDown={event => {
          const rt = runtime.current
          if (!rt || pointer.current) return
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: rt.transform.x, ty: rt.transform.y, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const p = pointer.current, rt = runtime.current
          if (!p || !rt || p.id !== event.pointerId) return
          const dx = event.clientX - p.x, dy = event.clientY - p.y
          p.moved ||= Math.abs(dx) + Math.abs(dy) > 4
          if (p.moved) { setFlowNativeTransform(rt, zoomIdentity.translate(p.tx + dx, p.ty + dy).scale(rt.transform.k)); draw() }
        }}
        onPointerUp={event => {
          const p = pointer.current, rt = runtime.current
          if (!p || p.id !== event.pointerId) return
          pointer.current = null
          if (!p.moved && rt) {
            const bounds = event.currentTarget.getBoundingClientRect()
            const id = hitTestNode(rt, { sx: event.clientX - bounds.left, sy: event.clientY - bounds.top })
            if (id && graph.nodes.find(node => node.id === id)?.properties.observed !== false) onSelect(id)
          }
        }} onPointerCancel={() => { pointer.current = null }} />
    </div>
    <ul aria-label="Topology nodes" className="flex flex-wrap gap-2 py-2">
      {graph.nodes.map(node => <li key={node.id} className="min-w-0 max-w-full">
        <button type="button" disabled={node.properties.observed === false} aria-pressed={node.id === selectedNodeId}
          className={`rounded border p-2 text-left text-xs ${node.id === selectedNodeId ? UI_THEME_TOKENS.button.activeSoft : ''}`}
          style={{ overflowWrap: 'anywhere' }} onClick={() => onSelect(node.id)}>{node.label}</button>
      </li>)}
    </ul>
  </section>
}
