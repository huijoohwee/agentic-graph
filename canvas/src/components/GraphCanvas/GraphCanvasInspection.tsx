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
import { packDisjointPositions2d } from './layout/collectivePackPositions'
import { applyRadialClusterLayout } from './layout/radial'
import { readLayoutMode2d } from '@/lib/graph/layoutMode'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveMediaPreviewSurfaceSelectionProps } from '@/lib/cards/mediaPreviewSurfaceSelection'
import { emitRendererPanelOpen } from '@/features/canvas/utils'
import { focusRendererInspectionGraph, releaseRendererInspectionGraph, useRendererInspectionGraph } from '@/features/toolbar/floatingPanelBridge'

import { getStoryboardWidgetPanelSelectionChromeClassName, WIDGET_SELECTION_SURFACE_CLASS_NAME } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'

type Scene = Parameters<typeof setupGraphScene>[0]
const noop = () => {}
const refKeys = ['gRef', 'nodesSelRef', 'groupChevronSelRef', 'mediaSelRef', 'portHandlesSelRef', 'linksHitSelRef',
  'linksSelRef', 'labelsSelRef', 'zoomRef', 'tempLinkSelRef', 'linkDragRef', 'simulationRef', 'sceneGraphDataRef',
  'beforeRenderFrameRef', 'selectedEdgeIdRef', 'selectedNodeIdRef', 'selectedNodeIdsRef', 'selectedEdgeIdsRef'] as const
/** Read-only adapter to the existing D3 scene. No authored graph writes, persistence or continuous simulation. */
export default function GraphCanvasInspection({ graph, selectedNodeId, onSelect, highlightedNodeIds, highlightedEdgeIds, rendererControls = false, label = 'Observed execution topology', description = 'Observed spans and causal links; use the node buttons below to select a span' }: {
  graph: GraphData; selectedNodeId: string | null; onSelect: (nodeId: string) => void
  label?: string; description?: string
  highlightedNodeIds?: string[]; highlightedEdgeIds?: string[]
  rendererControls?: boolean
}) {
  const focusedGraph = useRendererInspectionGraph()
  const configuredSchema = useGraphStore(state => rendererControls ? state.schema : defaultSchema)
  const fitFill = useGraphStore(state => rendererControls ? state.viewportFitFillRatio : undefined)
  const inspectionSchema = React.useMemo(() => ({ ...configuredSchema, behavior: { ...configuredSchema.behavior,
    selectMode: 'single' as const, allowNodeDrag: false, allowEdgeCreation: false } }), [configuredSchema])
  const configure = React.useCallback(() => { focusRendererInspectionGraph(graph); emitRendererPanelOpen() }, [graph])
  React.useEffect(() => () => releaseRendererInspectionGraph(graph), [graph])
  const selectionProps = React.useMemo(() => resolveMediaPreviewSurfaceSelectionProps({
    enabled: rendererControls, ariaLabel: 'Configure codebase visualization', selectionPhase: 'click', claimClick: false,
    onSelect: event => { if (!event.shiftKey && !event.ctrlKey && !event.metaKey) configure() },
  }), [configure, rendererControls])
  const parent = React.useRef<HTMLDivElement>(null), svg = React.useRef<SVGSVGElement>(null)
  const refs = React.useMemo(() => Object.fromEntries(refKeys.map(key => [key, { current: null }])) as unknown as Pick<Scene, typeof refKeys[number]>, [])
  const selectSpan = React.useRef(onSelect); selectSpan.current = onSelect
  refs.selectedNodeIdRef.current = highlightedNodeIds?.length ? null : selectedNodeId
  refs.selectedNodeIdsRef.current = highlightedNodeIds
  refs.selectedEdgeIdsRef.current = highlightedEdgeIds
  const highlightSchema = React.useMemo(() => highlightedNodeIds?.length ? { ...inspectionSchema,
    behavior: { ...inspectionSchema.behavior, expansion: { ...inspectionSchema.behavior.expansion, highlightNeighbors: false } } } : inspectionSchema, [highlightedNodeIds, inspectionSchema])
  const highlightOptions = React.useRef({ schema: highlightSchema, nodes: highlightedNodeIds, edges: highlightedEdgeIds })
  highlightOptions.current = { schema: highlightSchema, nodes: highlightedNodeIds, edges: highlightedEdgeIds }
  const [size, setSize] = React.useState({ width: 1, height: 360 })
  const scene = React.useMemo(() => {
    const copy = structuredClone(graph)
    const nodeSize = copy.metadata?.agentGraphProjection ? { widthPx: 240, heightPx: 140 } : { widthPx: 120, heightPx: 100 }
    const dagre = buildDagreLayout({ nodes: copy.nodes, edges: copy.edges, rankdir: 'TB',
      nodeSize, spacingPx: { nodesep: 48, ranksep: 64 } })
    let positions = copy.metadata?.agentGraphProjection ? packDisjointPositions2d({
      nodeIds: copy.nodes.map(node => node.id), edges: copy.edges, positions: dagre,
      nodeSize, paddingPx: 0, // Codebase cells already reserve space for labels.
    }) : dagre
    if (rendererControls && readLayoutMode2d(inspectionSchema) === 'radial' && size.width > 1) {
      applyRadialClusterLayout(copy.nodes, copy.edges, size.width, size.height, inspectionSchema)
      positions = Object.fromEntries(copy.nodes.map(node => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
    }
    for (const node of copy.nodes) { Object.assign(node, positions[node.id]); node.fx = node.x; node.fy = node.y }
    return { graph: copy, positions }
  }, [graph, rendererControls, inspectionSchema, size])
  const fit = React.useCallback(() => {
    if (svg.current && refs.zoomRef.current) select(svg.current).call(refs.zoomRef.current.transform,
      fitAllTransform(scene.graph.nodes, size.width, size.height, { pad: 32, enforceAspectRatio: false, maxScale: 1.5,
        schema: inspectionSchema, targetFillRatio: fitFill }))
  }, [scene, size, refs, inspectionSchema, fitFill])
  const highlight = React.useCallback(() => {
    const { schema, nodes, edges } = highlightOptions.current
    applySelectionHighlight(refs.nodesSelRef.current, refs.mediaSelRef.current, refs.labelsSelRef.current, refs.linksSelRef.current,
      scene.graph, schema, nodes?.length ? null : refs.selectedNodeIdRef.current, null, nodes ?? [], edges ?? [], false)
  }, [scene, refs])
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
      graphData: scene.graph, graphDataRevision: 0, schema: inspectionSchema, canvas2dRenderer: 'd3',
      edgesForSim: scene.graph.edges, width: size.width, height: size.height,
      hoverEnabled: false, zoomOnDoubleClick: false, renderMediaAsNodes: false, mediaPanelDensity: 'default',
      viewportControlsPreset: DEFAULT_VIEWPORT_CONTROLS_PRESET, fitToScreenMode: false,
      layoutPositionsForMode: scene.positions, skipInitialLayout: true, freezeSimulation: true,
      isolateDocumentState: true, enableContinuousForceLayout: false, enableEditorGestures: false, groupsForBboxCollide: [], layoutGroupKeyByNodeId: null,
      selectNode: id => { if (id && scene.graph.nodes.some(node => node.id === id && node.properties.observed !== false)) selectSpan.current(id) },
      selectEdge: noop, selectGroup: noop, selectGroupExpanded: noop, toggleGroupCollapsed: noop,
      setSelectionSource: noop, addEdge: noop, updateEdge: noop, addNode: noop, updateNode: noop,
      setHoverInfo: noop, setLifecycleStageRendering: noop, requestZoomSelection: noop, onZoomTransform: noop,
      getSchema: () => highlightOptions.current.schema, getRenderMediaAsNodes: () => false, layoutCacheKey: null, setLayoutPositionsForMode: null,
    })
    refs.simulationRef.current?.stop(); fit(); highlight()
    return cleanup
  }, [scene, size, refs, fit, highlight, inspectionSchema])
  React.useEffect(highlight, [highlight, selectedNodeId, highlightedNodeIds, highlightedEdgeIds])
  const zoom = (factor: number) => { if (svg.current && refs.zoomRef.current) select(svg.current).call(refs.zoomRef.current.scaleBy, factor) }
  const button = `rounded border px-3 py-2 text-sm ${UI_THEME_TOKENS.button.neutralMuted}`
  return <section aria-label={label} data-renderer="d3" data-layout-mode={rendererControls ? readLayoutMode2d(inspectionSchema) : 'trace'} className="min-w-0">
    <div className="flex flex-wrap items-center gap-2 py-2"><span className="text-xs">2D Renderer: D3 · read-only snapshot</span>
      <button type="button" onClick={() => zoom(1.25)} className={button}>Zoom in</button>
      <button type="button" onClick={() => zoom(0.8)} className={button}>Zoom out</button>
      <button type="button" onClick={fit} className={button}>Fit topology</button>
      {rendererControls && <button type="button" onClick={configure} className={button}>Renderer settings</button>}
    </div>
    <div {...selectionProps} ref={parent} tabIndex={rendererControls ? 0 : undefined} className={`w-full min-w-0 overflow-hidden rounded border ${WIDGET_SELECTION_SURFACE_CLASS_NAME} ${getStoryboardWidgetPanelSelectionChromeClassName(rendererControls && focusedGraph === graph)}`} style={{ height: 'clamp(360px, 60vh, 720px)' }}>
      <svg ref={svg} role="img" aria-label={description}
        onClickCapture={event => { if (event.shiftKey || event.ctrlKey || event.metaKey) { event.preventDefault(); event.stopPropagation() } }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }} />
    </div>
    <ul aria-label="Topology nodes" className="flex max-h-40 flex-wrap gap-2 overflow-auto py-2">
      {graph.nodes.map(node => <li key={node.id} className="min-w-0 max-w-full"><button type="button"
        disabled={node.properties.observed === false} aria-pressed={node.id === selectedNodeId}
        className={`rounded border p-2 text-left text-xs ${node.id === selectedNodeId ? UI_THEME_TOKENS.button.activeSoft : ''}`}
        style={{ overflowWrap: 'anywhere' }} onClick={() => onSelect(node.id)}>{String(node.properties['inspection:label'] || node.label)}</button></li>)}
    </ul>
  </section>
}
