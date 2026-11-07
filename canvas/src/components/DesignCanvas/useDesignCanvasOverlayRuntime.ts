import React from 'react'
import * as d3 from 'd3'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readNodeCenterWorld2d } from '@/lib/render/mediaAnchor'
import type { MediaOverlayNode } from '@/lib/render/mediaOverlayPool'
import { startMediaOverlayLayoutLoop2d } from '@/lib/render/mediaOverlayLayoutLoop2d'
import { normalizeRichMediaPanelDensity } from '@/lib/render/richMediaSsot'
import { readOverlaySizingConfigForDensity, type OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import { readRichMediaOverlayFrameSize } from '@/components/StoryboardWidget/richMediaOverlayFrameSize'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'

type OverlayRuntimeArgs = {
  active: boolean
  localGraphData: GraphData
  designMediaOverlayNodeIdsKey: string
  designMediaOverlayNodes: MediaOverlayNode[]
  viewportW: number
  viewportH: number
  mediaPanelDensity: unknown
  renderMediaAsNodes: boolean
  overlaySizing?: OverlayDensitySizingConfigInput | null
  svgRef: React.RefObject<SVGSVGElement | null>
  zoomRef: React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  documentUrl: string
  webpageLayoutStatus: string
  activeWebpageLayoutGraphData: GraphData | null
  hiddenById: Record<string, boolean> | null | undefined
  webpageLayout: { elements?: unknown[]; meta?: { ts?: unknown } } | null | undefined
  schema: GraphSchema | null
  setWebpageLayoutStatus: React.Dispatch<React.SetStateAction<'idle' | 'loading' | 'ready' | 'error'>>
  setWebpageStatusUi: (next: { message: string }) => void
}

export function useDesignCanvasOverlayRuntime(args: OverlayRuntimeArgs) {
  const {
    active,
    localGraphData,
    designMediaOverlayNodeIdsKey,
    designMediaOverlayNodes,
    viewportW,
    viewportH,
    mediaPanelDensity,
    renderMediaAsNodes,
    overlaySizing,
    svgRef,
    zoomRef,
    documentUrl,
    webpageLayoutStatus,
    activeWebpageLayoutGraphData,
    hiddenById,
    webpageLayout,
    schema,
    setWebpageLayoutStatus,
    setWebpageStatusUi,
  } = args

  const localGraphDataRef = React.useRef<GraphData>(localGraphData)
  const designMediaOverlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const designMediaHeaderDragRef = React.useRef<null | {
    id: string
    pointerId: number
    startX: number
    startY: number
    startK: number
    lastDx: number
    lastDy: number
    schema: GraphSchema | null
  }>(null)
  const lastAutoFitWireframeKeyRef = React.useRef<string>('')

  React.useEffect(() => {
    localGraphDataRef.current = localGraphData
  }, [localGraphData])
  const localGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('design-canvas-overlay-runtime-graph', { graphData: localGraphData }),
    [localGraphData],
  )
  const localGraphLookup = React.useMemo(() => {
    return getCachedGraphLookup({
      cacheScope: 'design-canvas-overlay-runtime-graph',
      graphData: localGraphData,
      graphSemanticKey: localGraphSemanticKey,
      preferCurrentGraphDataRefs: true,
    })
  }, [localGraphData, localGraphSemanticKey])
  const localGraphNodeById = localGraphLookup?.nodeById || null

  React.useEffect(() => {
    const next = new Map<string, HTMLElement>()
    for (const node of designMediaOverlayNodes) {
      const existing = designMediaOverlayElsRef.current.get(node.id)
      if (existing) next.set(node.id, existing)
    }
    designMediaOverlayElsRef.current = next
  }, [designMediaOverlayNodeIdsKey, designMediaOverlayNodes])

  React.useEffect(() => {
    if (!active) return
    if (designMediaOverlayNodes.length === 0) return
    const density = normalizeRichMediaPanelDensity(mediaPanelDensity)
    const sizingConfig = readOverlaySizingConfigForDensity({ density, sizing: overlaySizing || null })

    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true,
      loop: 'always',
      items: designMediaOverlayNodes,
      density,
      viewportW,
      viewportH,
      readTransform: () => {
        const svgEl = svgRef.current
        if (!svgEl) return null
        return d3.zoomTransform(svgEl as unknown as SVGSVGElement)
      },
      getElementForId: id => designMediaOverlayElsRef.current.get(id) || null,
      getPanelSizeForId: id => {
        const node = localGraphNodeById?.get(id) || null
        const size = readRichMediaOverlayFrameSize(node)
        return size ? { w: size.width, h: size.height } : null
      },
      getNodeWorldCenterForId: id => {
        const node = localGraphNodeById?.get(id) || null
        return readNodeCenterWorld2d(node, { coords: 'center' })
      },
      sizingConfig: {
        widthRatio: sizingConfig.widthRatio,
        widthMinPx: sizingConfig.widthMinPx,
        widthMaxPx: sizingConfig.widthMaxPx,
      },
    })

    return () => loop.stop()
  }, [
    active,
    designMediaOverlayNodeIdsKey,
    designMediaOverlayNodes,
    mediaPanelDensity,
    overlaySizing,
    renderMediaAsNodes,
    localGraphNodeById,
    svgRef,
    viewportH,
    viewportW,
  ])

  React.useEffect(() => {
    if (!active) return
    if (!documentUrl) return
    if (webpageLayoutStatus !== 'ready') return
    const svgEl = svgRef.current
    if (!svgEl) return
    const zoom = zoomRef.current
    if (!zoom) return
    const graph = localGraphDataRef.current
    const nodes = Array.isArray(graph.nodes) ? (graph.nodes as GraphNode[]) : ([] as GraphNode[])
    if (nodes.length === 0) {
      const total = Array.isArray(activeWebpageLayoutGraphData?.nodes) ? activeWebpageLayoutGraphData.nodes.length : 0
      if (total > 0) {
        let hiddenCount = 0
        for (let i = 0; i < activeWebpageLayoutGraphData!.nodes.length; i += 1) {
          const id = String((activeWebpageLayoutGraphData!.nodes[i] as GraphNode)?.id || '').trim()
          if (id && hiddenById?.[id] === true) hiddenCount += 1
        }
        if (hiddenCount >= total) {
          const ids: string[] = []
          for (let i = 0; i < activeWebpageLayoutGraphData!.nodes.length; i += 1) {
            const id = String((activeWebpageLayoutGraphData!.nodes[i] as GraphNode)?.id || '').trim()
            if (id) ids.push(id)
          }
          try {
            useGraphStore.getState().setDesignLayerState({ order: ids, hiddenById: {} })
          } catch {
            void 0
          }
          setWebpageStatusUi({ message: 'All wireframe layers were hidden. Reset visibility.' })
          lastAutoFitWireframeKeyRef.current = ''
          return
        }
      }
      setWebpageLayoutStatus('error')
      const elCount = Array.isArray(webpageLayout?.elements) ? webpageLayout!.elements.length : 0
      setWebpageStatusUi({ message: `Wireframe is empty (0 nodes). elements=${elCount}, convertedNodes=${total}. Click Retry.` })
      return
    }
    const key = `${documentUrl}#${webpageLayout?.meta?.ts || 0}#${nodes.length}`
    if (lastAutoFitWireframeKeyRef.current === key) return
    lastAutoFitWireframeKeyRef.current = key
    if (viewportW <= 80 || viewportH <= 80) return
    const mode = readLayoutMode(schema)
    const options = readFitAllOptions({ schema, mode, intent: 'initialFit' })
    const transform = fitAllTransform(nodes, Math.max(1, viewportW), Math.max(1, viewportH), { ...options, graphData: graph })
    d3.select(svgEl).call(zoom.transform as never, d3.zoomIdentity.translate(transform.x, transform.y).scale(transform.k))
  }, [
    active,
    activeWebpageLayoutGraphData,
    documentUrl,
    hiddenById,
    schema,
    setWebpageLayoutStatus,
    setWebpageStatusUi,
    svgRef,
    viewportH,
    viewportW,
    webpageLayout,
    webpageLayoutStatus,
    zoomRef,
  ])

  return {
    localGraphDataRef,
    designMediaOverlayElsRef,
    designMediaHeaderDragRef,
  }
}
