import React from 'react'
import { select } from 'd3'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphData } from '@/lib/graph/types'
import { DEFAULT_VIEWPORT_CONTROLS_PRESET } from '@/lib/config.viewport-controls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { setupGraphScene } from './scene'
import { applySelectionHighlight } from './highlight'
import { fitAllTransform } from './fit'
import { buildDagreLayout } from '@/components/FlowCanvas/layout'

type Scene = Parameters<typeof setupGraphScene>[0]
const noop = () => {}
const refKeys = ['gRef', 'nodesSelRef', 'groupChevronSelRef', 'mediaSelRef', 'portHandlesSelRef', 'linksHitSelRef',
  'linksSelRef', 'labelsSelRef', 'zoomRef', 'tempLinkSelRef', 'linkDragRef', 'simulationRef', 'sceneGraphDataRef',
  'beforeRenderFrameRef', 'selectedEdgeIdRef', 'selectedNodeIdRef', 'selectedNodeIdsRef', 'selectedEdgeIdsRef'] as const
/** Read-only adapter to the existing D3 scene. No authored graph writes, persistence or continuous simulation. */
export default function GraphCanvasInspection({ graph, selectedNodeId, onSelect }: {
  graph: GraphData; selectedNodeId: string | null; onSelect: (nodeId: string) => void
}) {
  const parent = React.useRef<HTMLDivElement>(null), svg = React.useRef<SVGSVGElement>(null)
  const refs = React.useMemo(() => Object.fromEntries(refKeys.map(key => [key, { current: null }])) as unknown as Pick<Scene, typeof refKeys[number]>, [])
  const selectSpan = React.useRef(onSelect); selectSpan.current = onSelect
  refs.selectedNodeIdRef.current = selectedNodeId
  const [size, setSize] = React.useState({ width: 1, height: 360 })
  const scene = React.useMemo(() => {
    const copy = structuredClone(graph)
    const positions = buildDagreLayout({ nodes: copy.nodes, edges: copy.edges, rankdir: 'TB',
      nodeSize: { widthPx: 120, heightPx: 100 }, spacingPx: { nodesep: 48, ranksep: 64 } })
    for (const node of copy.nodes) { Object.assign(node, positions[node.id]); node.fx = node.x; node.fy = node.y }
    return { graph: copy, positions }
  }, [graph])
  const fit = React.useCallback(() => {
    if (svg.current && refs.zoomRef.current) select(svg.current).call(refs.zoomRef.current.transform,
      fitAllTransform(scene.graph.nodes, size.width, size.height, { pad: 32, enforceAspectRatio: false, maxScale: 1.5, schema: defaultSchema }))
  }, [scene, size, refs])
  const highlight = React.useCallback(() => applySelectionHighlight(refs.nodesSelRef.current, refs.mediaSelRef.current,
    refs.labelsSelRef.current, refs.linksSelRef.current, scene.graph, defaultSchema, refs.selectedNodeIdRef.current, null, [], [], false), [scene, refs])
  React.useLayoutEffect(() => {
    if (!parent.current) return
    const element = parent.current
    const resize = () => setSize(previous => {
      const next = { width: Math.max(1, element.clientWidth), height: Math.max(320, element.clientHeight) }
      return previous.width === next.width && previous.height === next.height ? previous : next
    })
    const observer = new ResizeObserver(resize); observer.observe(element); resize()
    return () => observer.disconnect()
  }, [])
  React.useLayoutEffect(() => {
    if (!svg.current || size.width <= 1) return
    const cleanup = setupGraphScene({ ...refs, active: () => true, svgEl: svg.current, svgRef: svg as Scene['svgRef'],
      graphData: scene.graph, graphDataRevision: 0, schema: defaultSchema, canvas2dRenderer: 'd3',
      edgesForSim: scene.graph.edges, width: size.width, height: size.height,
      hoverEnabled: false, zoomOnDoubleClick: false, renderMediaAsNodes: false, mediaPanelDensity: 'default',
      viewportControlsPreset: DEFAULT_VIEWPORT_CONTROLS_PRESET, fitToScreenMode: false,
      layoutPositionsForMode: scene.positions, skipInitialLayout: true, freezeSimulation: true,
      enableContinuousForceLayout: false, enableEditorGestures: false, groupsForBboxCollide: [], layoutGroupKeyByNodeId: null,
      selectNode: id => { if (id && scene.graph.nodes.some(node => node.id === id && node.properties.observed !== false)) selectSpan.current(id) },
      selectEdge: noop, selectGroup: noop, selectGroupExpanded: noop, toggleGroupCollapsed: noop,
      setSelectionSource: noop, addEdge: noop, updateEdge: noop, addNode: noop, updateNode: noop,
      setHoverInfo: noop, setLifecycleStageRendering: noop, requestZoomSelection: noop, onZoomTransform: noop,
      getSchema: () => defaultSchema, getRenderMediaAsNodes: () => false, layoutCacheKey: null, setLayoutPositionsForMode: null,
    })
    refs.simulationRef.current?.stop(); fit(); highlight()
    return cleanup
  }, [scene, size, refs, fit, highlight])
  React.useEffect(highlight, [highlight, selectedNodeId])
  const zoom = (factor: number) => { if (svg.current && refs.zoomRef.current) select(svg.current).call(refs.zoomRef.current.scaleBy, factor) }
  const button = `rounded border px-3 py-2 text-sm ${UI_THEME_TOKENS.button.neutralMuted}`
  return <section aria-label="Observed execution topology" data-renderer="d3" className="min-w-0">
    <div className="flex flex-wrap items-center gap-2 py-2"><span className="text-xs">2D Renderer: D3 · read-only snapshot</span>
      <button type="button" onClick={() => zoom(1.25)} className={button}>Zoom in</button>
      <button type="button" onClick={() => zoom(0.8)} className={button}>Zoom out</button>
      <button type="button" onClick={fit} className={button}>Fit topology</button>
    </div>
    <div ref={parent} className="w-full min-w-0 overflow-hidden rounded border" style={{ height: 'clamp(360px, 60vh, 720px)' }}>
      <svg ref={svg} role="img" aria-label="Observed spans and causal links; use the node buttons below to select a span"
        style={{ width: '100%', height: '100%', touchAction: 'none' }} />
    </div>
    <ul aria-label="Topology nodes" className="flex flex-wrap gap-2 py-2">
      {graph.nodes.map(node => <li key={node.id} className="min-w-0 max-w-full"><button type="button"
        disabled={node.properties.observed === false} aria-pressed={node.id === selectedNodeId}
        className={`rounded border p-2 text-left text-xs ${node.id === selectedNodeId ? UI_THEME_TOKENS.button.activeSoft : ''}`}
        style={{ overflowWrap: 'anywhere' }} onClick={() => onSelect(node.id)}>{String(node.properties['inspection:label'] || node.label)}</button></li>)}
    </ul>
  </section>
}
