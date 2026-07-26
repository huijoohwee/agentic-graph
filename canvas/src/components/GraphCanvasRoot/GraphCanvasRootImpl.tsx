import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useGraphStoreKeyRef } from '@/hooks/useGraphStoreKeyRef'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { cloneGraphDataForRender } from '@/components/GraphCanvas/renderClone'
import { normalizeEdgesForSim } from '@/components/GraphCanvas/simulation'
import { create2dSvgSnapshotFns, computeFlowState, getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { looksLikeSingleTagBlock } from 'grph-shared/markdown/mediaHtml'
import { useZoomEffects } from '@/components/GraphCanvas/hooks/useZoomEffects'
import { useEdgeCreationEffect } from '@/components/GraphCanvas/hooks/useEdgeCreationEffect'
import { useSelectionHighlight } from '@/components/GraphCanvas/hooks/useSelectionHighlight'
import { useGroupSelectionHighlight } from '@/components/GraphCanvas/hooks/useGroupSelectionHighlight'
import { useGraphCanvasStyles } from '@/components/GraphCanvas/useGraphCanvasStyles'
import { useAutoZoomModes2d } from '@/features/zoom/useAutoZoomModes2d'
import { GraphHoverTooltip, type HoverInfo } from '@/components/GraphHoverTooltip'
import { MarkdownDesignOverlay } from '@/lib/markdown-edgeless'
import { buildMarkdownTokensKey, lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { deriveMarkdownDesignLayout, MARKDOWN_DESIGN_LAYOUT, type MarkdownDesignBlock, type MarkdownDesignLayout } from '@/features/markdown-edgeless/markdownDesignLayout'
import {
  buildMarkdownIframeNodeIdSetFromGraphNodes,
  buildMarkdownMatchedBlockNodeIdSetFromGraphNodes,
  buildPanelOnlyNodeIdSetFromGraphNodes,
  computeMarkdownAnchorNodeIdByBlockId,
} from '@/lib/render/markdownPanelOverlayPool'
import { readNodeCenterWorld2d } from '@/lib/render/mediaAnchor'
import { useOverlayInteractions2d } from '@/components/GraphCanvasRoot/hooks/useOverlayInteractions2d'
import { subscribeGlobalCancelWatchdog } from '@/lib/browser/globalCancelEvents'
import { resetGlobalUserSelectLock } from '@/lib/canvas/interaction-user-select'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import { buildCollapsedGroupIdsKey } from '@/lib/canvas/collapsedGroupIdsKey'
import { buildSchemaLayoutEngineJson2d } from '@/lib/canvas/schema-layout-engine-json'
import { CANVAS_INTERACTIVE_CLASS, CANVAS_SURFACE_CLASS } from '@/lib/canvas/surface'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'
import { readSnapGridConfigFromSchema } from '@/lib/canvas/gridSnap'
import { deriveSceneDisplayGraph, deriveSceneGroups } from '@/lib/scene/sceneDerivation'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { PendingLink, TempLinkSelection } from '@/features/edge-creation'
import type { PortHandleDatum } from '@/components/GraphCanvas/portHandles'

import { useEnsureSpacePanListener, useCanvasWheelAndGestureGuards } from '@/components/GraphCanvasRoot/hooks/useCanvasNativeGuards'
import { useCanvasContextMenu } from '@/components/GraphCanvasRoot/hooks/useCanvasContextMenu'
import { useCanvasLayoutSync } from '@/components/GraphCanvasRoot/hooks/useCanvasLayoutSync'
import { useZoomStateSeeding2d } from '@/components/GraphCanvasRoot/hooks/useZoomStateSeeding2d'
import { usePersistLayoutOnDeactivate2d } from '@/components/GraphCanvasRoot/hooks/usePersistLayoutOnDeactivate2d'
import { useRichMediaOverlays2d } from '@/components/GraphCanvasRoot/hooks/useRichMediaOverlays2d'
import { RichMediaOverlayLayer2d } from '@/components/GraphCanvasRoot/components/RichMediaOverlayLayer2d'
import { useD3GraphScene2d } from '@/components/GraphCanvasRoot/hooks/useD3GraphScene2d'
import { useD3PresentationUpdates2d } from '@/components/GraphCanvasRoot/hooks/useD3PresentationUpdates2d'
import { useSelectionRerenderSubscription2d, useZoomScaleReapplySubscription2d } from '@/components/GraphCanvasRoot/hooks/usePresentationSubscriptions2d'
import { useFlowLabelPresentation2d } from '@/components/GraphCanvasRoot/hooks/useFlowLabelPresentation2d'
import { useArrange2d } from '@/components/GraphCanvasRoot/hooks/useArrange2d'
import { useArrangeKeyboardShortcuts2d } from '@/components/GraphCanvasRoot/hooks/useArrangeKeyboardShortcuts2d'
import { useArrangeRequestEffect2d } from '@/components/GraphCanvasRoot/hooks/useArrangeRequestEffect2d'
import { ArrangeToolbar2d } from '@/components/GraphCanvasRoot/components/ArrangeToolbar2d'
import { useMarqueeSelection2d } from '@/components/GraphCanvasRoot/hooks/useMarqueeSelection2d'
import { MarqueeBoxOverlay } from '@/components/GraphCanvasRoot/components/MarqueeBoxOverlay'
import { readMergedGraphNodeLookup } from '@/components/GraphCanvasRoot/utils/mergedNodeLookup'
import { pipelinePerfMeasureSync } from '@/lib/pipelinePerf'
import { readOverlaySizingInputFromStoreState } from '@/lib/render/overlaySizing2d'
import { useCanvasAppliedMarkdownDocument } from '@/features/canvas/useCanvasAppliedMarkdownDocument'
import { isStoryboardWidgetSurfaceRenderer } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
const EMPTY_STRING_ARRAY: string[] = []
export default function GraphCanvas({ active = true }: { active?: boolean }) {
  const containerRef = useRef<HTMLElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const resolvedThemeMode = useGraphStore(s => (s.resolvedThemeMode || 'light') as 'light' | 'dark')
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const isEmbeddedPreview = useMemo(() => {
    try {
      const q = new URLSearchParams(String(window.location.search || '')).get('kgPreview') === '1'
      if (q) return true
      const w = window as unknown as { frameElement?: Element | null; parent?: Window | null }
      const parent = w?.parent
      if (!parent || parent === window) return false
      const frameEl = w?.frameElement
      if (!frameEl) return false
      return String(frameEl.getAttribute('data-kg-preview') || '') === '1'
    } catch {
      return false
    }
  }, [])

  const activeRef = useRef<boolean>(true)
  activeRef.current = !!active
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const nodesSelRef = useRef<d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null>(null)
  const groupChevronSelRef = useRef<d3.Selection<SVGPathElement, GraphNode, SVGGElement, unknown> | null>(null)
  const mediaSelRef = useRef<d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null>(null)
  const portHandlesSelRef = useRef<d3.Selection<SVGCircleElement, PortHandleDatum, SVGGElement, unknown> | null>(null)
  const linksHitSelRef = useRef<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>(null)
  const linksSelRef = useRef<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>(null)
  const labelsSelRef = useRef<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null)
  const sceneGraphDataRef = useRef<GraphData | null>(null)
  const beforeRenderFrameRef = useRef<(() => void) | null>(null)
  const beforeRenderFrameWrappedSourceRef = useRef<(() => void) | null>(null)
  const nodesPresentationAppliedKeyRef = useRef<string | null>(null)
  const groupsPresentationAppliedKeyRef = useRef<string | null>(null)
  const sceneCleanupRef = useRef<null | (() => void)>(null)
  const sceneBuildKeyRef = useRef<string | null>(null)
  const activeLayoutCacheKeyRef = useRef<string | null>(null)

  useEnsureSpacePanListener()
  useCanvasWheelAndGestureGuards({ svgRef, activeRef })

  const {
    graphDataRevision,
    graphContentRevision,
    setCanvasDims,
    setCanvasPos,
    schema,
    renderMediaAsNodes,
    mediaPanelDensity,
    threeIframeOverlayPoolMax,
    overlaySizing,
    setLayoutPositionsForMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    documentSemanticMode,
    canvasRenderMode,
    canvas2dRenderer,
    viewportControlsPreset,
    collapsedGroupIds,
    viewPinned,
    zoomState,
    fitToScreenMode,
    zoomToSelectionMode,
    documentStructureBaselineLock,
    graphCanvasArrangeRequest,
    clearGraphCanvasArrangeRequest,
    selectedNodeId,
    selectedNodeIds, openWidgetNodeIds,
    selectNode,
    markdownDocumentName,
    markdownDocumentText,
    markdownDocumentApplyViewPreset,
  } = useGraphStore(
    useShallow(s => {
      if (!active) {
        return {
          graphDataRevision: s.graphDataRevision,
          graphContentRevision: s.graphContentRevision,
          setCanvasDims: s.setCanvasDims,
          setCanvasPos: s.setCanvasPos,
          schema: s.schema,
          renderMediaAsNodes: false,
          mediaPanelDensity: 'default' as const,
          threeIframeOverlayPoolMax: s.threeIframeOverlayPoolMax,
          overlaySizing: readOverlaySizingInputFromStoreState(s),
          setLayoutPositionsForMode: s.setLayoutPositionsForMode,
          frontmatterModeEnabled: false,
          multiDimTableModeEnabled: false,
          documentSemanticMode: 'document' as const,
          canvasRenderMode: '2d' as const,
          canvas2dRenderer: 'd3' as const,
          viewportControlsPreset: s.viewportControlsPreset,
          collapsedGroupIds: EMPTY_STRING_ARRAY,
          viewPinned: false,
          zoomState: null,
          fitToScreenMode: false,
          zoomToSelectionMode: false,
          documentStructureBaselineLock: false,
          graphCanvasArrangeRequest: null,
          clearGraphCanvasArrangeRequest: s.clearGraphCanvasArrangeRequest,
          selectedNodeId: null,
          selectedNodeIds: EMPTY_STRING_ARRAY, openWidgetNodeIds: EMPTY_STRING_ARRAY,
          selectNode: s.selectNode,
          markdownDocumentName: null,
          markdownDocumentText: '',
          markdownDocumentApplyViewPreset: false,
        }
      }
      return {
        graphDataRevision: s.graphDataRevision,
        graphContentRevision: s.graphContentRevision,
        setCanvasDims: s.setCanvasDims,
        setCanvasPos: s.setCanvasPos,
        schema: s.schema,
        renderMediaAsNodes: s.renderMediaAsNodes,
        mediaPanelDensity: s.mediaPanelDensity,
        threeIframeOverlayPoolMax: s.threeIframeOverlayPoolMax,
        overlaySizing: readOverlaySizingInputFromStoreState(s),
        setLayoutPositionsForMode: s.setLayoutPositionsForMode,
        frontmatterModeEnabled: s.frontmatterModeEnabled || false,
        multiDimTableModeEnabled: (s as unknown as { multiDimTableModeEnabled?: unknown }).multiDimTableModeEnabled === true,
        documentSemanticMode: (s.documentSemanticMode || 'document') as 'document' | 'keyword',
        canvasRenderMode: s.canvasRenderMode,
        canvas2dRenderer: s.canvas2dRenderer,
        viewportControlsPreset: s.viewportControlsPreset,
        collapsedGroupIds: s.collapsedGroupIds ?? EMPTY_STRING_ARRAY,
        viewPinned: s.viewPinned === true,
        zoomState: s.zoomState || null,
        fitToScreenMode: s.fitToScreenMode === true,
        zoomToSelectionMode: s.zoomToSelectionMode === true,
        documentStructureBaselineLock: s.documentStructureBaselineLock === true,
        graphCanvasArrangeRequest: s.graphCanvasArrangeRequest,
        clearGraphCanvasArrangeRequest: s.clearGraphCanvasArrangeRequest,
        openWidgetNodeIds:
          (Array.isArray(s.openWidgetNodeIdsByRenderer?.[s.canvas2dRenderer])
            ? s.openWidgetNodeIdsByRenderer[s.canvas2dRenderer]
            : s.openWidgetNodeIds) ?? EMPTY_STRING_ARRAY,
        selectedNodeId: s.selectedNodeId,
        selectedNodeIds: s.selectedNodeIds,
        selectNode: s.selectNode,
        markdownDocumentName: s.markdownDocumentName,
        markdownDocumentText: s.markdownDocumentText,
        markdownDocumentApplyViewPreset: s.markdownDocumentApplyViewPreset,
      }
    }),
  )
  const canvasMarkdownDocument = useCanvasAppliedMarkdownDocument({ name: markdownDocumentName, text: markdownDocumentText, applyViewPreset: markdownDocumentApplyViewPreset !== false })
  const documentViewMode = useMemo(() => {
    return readDocumentViewModeContext({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      multiDimTableModeEnabled: multiDimTableModeEnabled === true,
      documentSemanticMode: String(documentSemanticMode || 'document'),
      documentStructureBaselineLock: documentStructureBaselineLock === true,
    })
  }, [documentSemanticMode, documentStructureBaselineLock, frontmatterModeEnabled, multiDimTableModeEnabled])
  const layoutSemanticModeKey = documentViewMode.documentSemanticViewModeKey
  const markdownPanelAllowedKinds = documentViewMode.markdownPanelAllowedKinds

  const registerCanvasSnapshotFns = useGraphStore(s => s.registerCanvasSnapshotFns)
  const selectedNodeIdRef = useGraphStoreKeyRef('selectedNodeId')
  const selectedEdgeIdRef = useGraphStoreKeyRef('selectedEdgeId')
  const selectedNodeIdsRef = useGraphStoreKeyRef('selectedNodeIds')
  const selectedEdgeIdsRef = useGraphStoreKeyRef('selectedEdgeIds')
  const graphDataRevisionRef = useGraphStoreKeyRef('graphDataRevision')

  const interactionSchema = useMemo<GraphSchema>(() => {
    if (documentStructureBaselineLock !== true) return schema
    return {
      ...schema,
      behavior: {
        ...schema.behavior,
        allowNodeDrag: false,
      },
    }
  }, [documentStructureBaselineLock, schema])

  const schemaRef = useRef(interactionSchema)
  useEffect(() => {
    schemaRef.current = interactionSchema
  }, [interactionSchema])

  const schemaLayoutEngineJson = useMemo(() => buildSchemaLayoutEngineJson2d(schema), [schema])
  const schemaNodesPresentationJson = useMemo(() => {
    return JSON.stringify({
      nodeShapeMode: schema?.behavior?.nodeShapeMode || 'auto',
      portHandles: schema?.behavior?.portHandles || null,
      nodeShapes: schema?.nodeShapes || null,
      allowNodeDrag: documentStructureBaselineLock !== true && schema?.behavior?.allowNodeDrag !== false,
      hoverEnabled: schema?.behavior?.hover?.enabled !== false,
      expansion: schema?.behavior?.expansion || null,
      renderMediaAsNodes,
      mediaPanelDensity,
    })
  }, [
    mediaPanelDensity,
    documentStructureBaselineLock,
    renderMediaAsNodes,
    schema?.behavior?.allowNodeDrag,
    schema?.behavior?.expansion,
    schema?.behavior?.hover?.enabled,
    schema?.behavior?.nodeShapeMode,
    schema?.behavior?.portHandles,
    schema?.nodeShapes,
  ])
  const schemaGroupsPresentationJson = useMemo(() => {
    return JSON.stringify({
      groups: schema?.layout?.groups || null,
      labelStyles: schema?.labelStyles || null,
      nodeShapeMode: schema?.behavior?.nodeShapeMode || 'auto',
      portHandles: schema?.behavior?.portHandles || null,
    })
  }, [schema?.behavior?.nodeShapeMode, schema?.behavior?.portHandles, schema?.labelStyles, schema?.layout?.groups])

  const renderGraphData = useActiveGraphRenderData(active)
  const effectiveFrontmatterModeEnabled = useMemo(() => {
    return computeEffectiveFrontmatterMode({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      documentSemanticMode,
      graphData: renderGraphData,
    })
  }, [documentSemanticMode, frontmatterModeEnabled, renderGraphData])
  const collapsedGroupIdsKey = useMemo(() => buildCollapsedGroupIdsKey(collapsedGroupIds), [collapsedGroupIds])

  const clonedGraphData = useMemo(() => {
    if (!renderGraphData) return null
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:clone',
      detail: {
        nodes: Array.isArray(renderGraphData.nodes) ? renderGraphData.nodes.length : 0,
        edges: Array.isArray(renderGraphData.edges) ? renderGraphData.edges.length : 0,
      },
      run: () => cloneGraphDataForRender(renderGraphData) as GraphData,
    })
  }, [renderGraphData])
  const sceneDisplayGraphDerivation = useMemo(() => {
    if (!clonedGraphData) return null
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:displayGraph',
      detail: {
        nodes: Array.isArray(clonedGraphData.nodes) ? clonedGraphData.nodes.length : 0,
        edges: Array.isArray(clonedGraphData.edges) ? clonedGraphData.edges.length : 0,
      },
      run: () => deriveSceneDisplayGraph({ graphData: clonedGraphData }),
    })
  }, [clonedGraphData])
  const sceneGraphData = useMemo(() => {
    if (!clonedGraphData) return null
    return sceneDisplayGraphDerivation?.displayGraphData || clonedGraphData
  }, [clonedGraphData, sceneDisplayGraphDerivation])
  const sceneGroupsDerivation = useMemo(() => {
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:groups',
      detail: {
        nodes: Array.isArray(clonedGraphData?.nodes) ? clonedGraphData.nodes.length : 0,
        edges: Array.isArray(clonedGraphData?.edges) ? clonedGraphData.edges.length : 0,
        graphContentRevision: graphContentRevision || 0,
        documentSemanticMode: String(documentSemanticMode || ''),
        frontmatterModeEnabled: effectiveFrontmatterModeEnabled === true,
      },
      run: () => deriveSceneGroups({
        graphData: clonedGraphData,
        graphDataRevision: graphContentRevision || 0,
        schema,
        documentSemanticMode: String(documentSemanticMode || ''),
        frontmatterModeEnabled: !!effectiveFrontmatterModeEnabled,
        multiDimTableModeEnabled: multiDimTableModeEnabled === true,
        documentStructureBaselineLock: documentStructureBaselineLock === true,
        resolvedThemeMode,
      }),
    })
  }, [
    clonedGraphData,
    documentSemanticMode,
    documentStructureBaselineLock,
    effectiveFrontmatterModeEnabled,
    graphContentRevision,
    multiDimTableModeEnabled,
    resolvedThemeMode,
    schema,
  ])

  const { width, height, left, top, dpr } = useContainerDims(containerRef)
  const canvasGrid = useMemo(() => readCanvasGridRenderConfigFromSchema(schema), [schema])
  const getZoomTransform = useCallback(() => {
    const el = svgRef.current
    if (!el) return null
    return d3.zoomTransform(el)
  }, [])
  const getZoomEventTarget = useCallback(() => svgRef.current, [])
  const readAutoZoomGraph = useCallback(
    () => ({
      graphData: sceneGraphData,
      graphDataRevision: graphContentRevision || graphDataRevision || 0,
    }),
    [graphContentRevision, graphDataRevision, sceneGraphData],
  )

  const debouncedWidth = useDebouncedValue(width, 100)
  const debouncedHeight = useDebouncedValue(height, 100)
  const sceneWidth = useMemo(() => Math.max(1, Math.floor(debouncedWidth)), [debouncedWidth])
  const sceneHeight = useMemo(() => Math.max(1, Math.floor(debouncedHeight)), [debouncedHeight])
  const tempLinkSelRef = useRef<TempLinkSelection>(null)
  const linkDragRef = useRef<PendingLink | null>(null)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)

  useCanvasContextMenu({ svgRef })
  useCanvasLayoutSync({ width, height, left, top, setCanvasDims, setCanvasPos })
  useZoomStateSeeding2d({
    active,
    viewPinned,
    zoomState,
    fitToScreenMode,
    zoomToSelectionMode,
    svgRef,
    gRef,
    zoomRef,
    sceneWidth,
    sceneHeight,
    canvasRenderMode,
    canvas2dRenderer,
    collapsedGroupIdsKey,
    documentSemanticMode,
    frontmatterModeEnabled,
    mediaPanelDensity,
    renderMediaAsNodes,
    schemaLayoutEngineJson,
  })

  usePersistLayoutOnDeactivate2d({
    active,
    nodesSelRef,
    schemaRef: schemaRef as unknown as React.MutableRefObject<GraphSchema>,
    sceneGraphDataRef,
  })

  useEffect(() => {
    return () => {
      try {
        sceneCleanupRef.current?.()
      } catch {
        void 0
      } finally {
        sceneCleanupRef.current = null
        sceneBuildKeyRef.current = null
      }
    }
  }, [])

  useZoomEffects({ svgRef, zoomRef, width, height, paused: !active, graphDataOverride: sceneGraphData })
  useAutoZoomModes2d({ viewportW: width, viewportH: height, paused: !active, getGraph: readAutoZoomGraph })
  useEdgeCreationEffect({ paused: !active, graphData: sceneGraphData, tempLinkSelRef, linkDragRef })
  useEffect(() => {
    if (!active) return
    registerCanvasSnapshotFns('2d', svgRef.current ? create2dSvgSnapshotFns(svgRef) : null)
    return () => {
      registerCanvasSnapshotFns('2d', null)
    }
  }, [active, registerCanvasSnapshotFns])

  useEffect(() => {
    if (!active) {
      try {
        simulationRef.current?.stop()
      } catch {
        void 0
      }
    }
  }, [active])

  const edgesForSim = useMemo(() => {
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:edgesForSim',
      detail: {
        nodes: Array.isArray(sceneGraphData?.nodes) ? sceneGraphData.nodes.length : 0,
        edges: Array.isArray(sceneGraphData?.edges) ? sceneGraphData.edges.length : 0,
      },
      run: () => normalizeEdgesForSim((sceneGraphData?.nodes ?? []) as GraphNode[], (sceneGraphData?.edges ?? []) as GraphEdge[]),
    })
  }, [sceneGraphData])
  const flowState = useMemo(() => computeFlowState(sceneGraphData as GraphData | null), [sceneGraphData])

  const deferredMarkdownDocumentText = React.useDeferredValue(canvasMarkdownDocument.text)
  const markdownDesignLayout: MarkdownDesignLayout | null = useMemo(() => {
    const markdownText = String(deferredMarkdownDocumentText || '')
    if (!markdownText.trim()) return null
    const activeDocumentPath = String(canvasMarkdownDocument.name || '').trim() || 'markdown'
    const markdownTokensKey = buildMarkdownTokensKey(markdownText)
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:markdownLayout',
      detail: { textLength: markdownText.length, activeDocumentPath },
      run: () => {
        const lexed = lexMarkdown(markdownText)
        return deriveMarkdownDesignLayout({ activeDocumentPath, markdownTokensKey, tokens: lexed.tokens as never })
      },
    })
  }, [canvasMarkdownDocument.name, deferredMarkdownDocumentText])

  const nodeByIdForPanelsRef = useRef<{ graphSemanticKey: string; rev: number; sim: d3.Simulation<GraphNode, GraphEdge> | null; map: Map<string, GraphNode> }>({
    graphSemanticKey: '',
    rev: -1,
    sim: null,
    map: new Map(),
  })
  const graphBlockPanelLastPosRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const getNodeWorldCenterForId = useCallback((idRaw: string) => {
    const id = String(idRaw || '').trim()
    if (!id) return null
    const sim = simulationRef.current
    const graph = sceneGraphDataRef.current
    const rev = typeof graphDataRevision === 'number' && Number.isFinite(graphDataRevision) ? Math.floor(graphDataRevision) : 0
    const nodeById = readMergedGraphNodeLookup({
      cacheRef: nodeByIdForPanelsRef,
      cacheScope: 'graph-canvas-root-panel-node-lookup',
      graphData: graph,
      graphRevision: rev,
      simulation: sim,
    })
    const n = nodeById.get(id) || null
    return readNodeCenterWorld2d(n, { coords: 'center' })
  }, [graphDataRevision])

  const markdownAnchorNodeIdByBlockId = useMemo(() => {
    const layout = markdownDesignLayout
    if (!layout) return null
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    if (nodes.length === 0) return null
    return computeMarkdownAnchorNodeIdByBlockId({ layout, nodes, allowedKinds: markdownPanelAllowedKinds })
  }, [markdownDesignLayout, markdownPanelAllowedKinds, sceneGraphData])

  const graphBlockPanel = useMemo(() => {
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    if (nodes.length === 0) return null
    return pipelinePerfMeasureSync({
      name: 'render',
      stage: 'graphRoot:graphBlockPanel',
      detail: {
        nodes: nodes.length,
        renderer: String(canvas2dRenderer || ''),
      },
      run: () => {
        const blocks: MarkdownDesignBlock[] = []
        const iframeNodeIds: string[] = []

        const sim = simulationRef.current
        const rev = typeof graphDataRevision === 'number' && Number.isFinite(graphDataRevision) ? Math.floor(graphDataRevision) : 0
        const nodeById = readMergedGraphNodeLookup({
          cacheRef: nodeByIdForPanelsRef,
          cacheScope: 'graph-canvas-root-panel-node-lookup',
          graphData: sceneGraphData,
          graphRevision: rev,
          simulation: sim,
        })
        const lastPos = graphBlockPanelLastPosRef.current
        const keepPosIds = new Set<string>()

        const getNum = (v: unknown): number | null => {
          if (typeof v === 'number' && Number.isFinite(v)) return v
          if (typeof v === 'string') {
            const n = Number(v)
            if (Number.isFinite(n)) return n
          }
          return null
        }

        const escapeAttr = (s: string): string => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

        for (let i = 0; i < nodes.length; i += 1) {
          const n = nodes[i]!
          const id = String(n?.id || '').trim()
          if (!id) continue
          const xGraph = getNum((n as unknown as { x?: unknown }).x)
          const yGraph = getNum((n as unknown as { y?: unknown }).y)
          const simNode = nodeById.get(id) || null
          const xSim = simNode ? getNum((simNode as unknown as { x?: unknown }).x) : null
          const ySim = simNode ? getNum((simNode as unknown as { y?: unknown }).y) : null
          const prev = lastPos.get(id) || null
          const x = xGraph ?? xSim ?? prev?.x ?? -99999
          const y = yGraph ?? ySim ?? prev?.y ?? -99999
          if (Number.isFinite(x) && Number.isFinite(y)) {
            keepPosIds.add(id)
            lastPos.set(id, { x, y })
          }

          const meta = n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata) ? (n.metadata as Record<string, unknown>) : null
          const lineStart = getNum(meta ? meta.lineStart : null)
          const lineEnd = getNum(meta ? meta.lineEnd : null)
          const startLine = Math.max(1, Math.floor(lineStart ?? 1))
          const endLine = Math.max(startLine, Math.floor(lineEnd ?? startLine))

          const propsObj = n.properties && typeof n.properties === 'object' && !Array.isArray(n.properties) ? (n.properties as Record<string, unknown>) : null
          const w = Math.max(1, Math.floor(getNum(propsObj ? propsObj['visual:width'] : null) ?? MARKDOWN_DESIGN_LAYOUT.block.widthPx))
          const h = Math.max(1, Math.floor(getNum(propsObj ? propsObj['visual:height'] : null) ?? MARKDOWN_DESIGN_LAYOUT.block.minHeightPx))

          const nodeType = String(n.type || '').trim()
          const typeLower = nodeType.toLowerCase()

          if (typeLower === 'table') {
            const headerRaw = propsObj ? propsObj['table:header'] : null
            const rowsRaw = propsObj ? propsObj['table:rows'] : null
            const header = Array.isArray(headerRaw) ? headerRaw.map(v => String(v ?? '')) : []
            const rows = Array.isArray(rowsRaw)
              ? rowsRaw.map(r => (Array.isArray(r) ? r.map(v => String(v ?? '')) : [])).filter(r => r.length > 0)
              : []
            blocks.push({
              id,
              type: 'table',
              title: String(n.label || '').trim() || 'Table',
              summary: '',
              startLine,
              endLine,
              x: x - w / 2,
              y: y - h / 2,
              w,
              h,
              preview: { kind: 'table', table: { columns: header, rows, rowCount: rows.length } },
            })
            continue
          }

          if (typeLower === 'codeblock') {
            const lang = propsObj && typeof propsObj.language === 'string' ? String(propsObj.language || '') : ''
            const code = propsObj && typeof propsObj.code === 'string' ? String(propsObj.code || '') : ''
            const lines = code ? code.split(/\r?\n/) : []
            blocks.push({
              id,
              type: 'code',
              title: String(n.label || '').trim() || (lang ? `Code (${lang})` : 'Code'),
              summary: '',
              startLine,
              endLine,
              x: x - w / 2,
              y: y - h / 2,
              w,
              h,
              preview: { kind: 'code', code: { lang, lines } },
            })
            continue
          }

          if (typeLower === 'paragraph') {
            const text = propsObj && typeof propsObj['text'] === 'string' ? String(propsObj['text'] || '') : ''
            const trimmed = text.trim()
            const isCallout = propsObj && propsObj.calloutType === true
            if (isCallout) {
              const calloutType = String(propsObj?.calloutKind || 'note')
              const title = String(propsObj?.calloutTitle || '').trim()
              const collapsed = String(propsObj?.calloutFoldable || '') === '-'
              blocks.push({
                id,
                type: 'blockquote',
                title: String(n.label || '').trim() || 'Callout',
                summary: '',
                startLine,
                endLine,
                x: x - w / 2,
                y: y - h / 2,
                w,
                h,
                preview: { kind: 'callout', callout: { calloutType, title, collapsed } },
              })
              continue
            }
            if (trimmed.startsWith('>')) {
              const lines = trimmed.split(/\r?\n/).map(l => l.replace(/^\s*>\s?/, '')).filter(Boolean).slice(0, 6)
              blocks.push({
                id,
                type: 'blockquote',
                title: String(n.label || '').trim() || 'Blockquote',
                summary: '',
                startLine,
                endLine,
                x: x - w / 2,
                y: y - h / 2,
                w,
                h,
                preview: { kind: 'blockquote', blockquote: { lines } },
              })
              continue
            }
          }

          const spec = getNodeMediaSpec(n)
          if (spec?.kind === 'iframe') {
            const url = String(spec.url || '').trim()
            if (!url) continue
            iframeNodeIds.push(id)
            const title = String(n.label || 'Iframe').trim() || 'Iframe'
            const raw = `<iframe src="${escapeAttr(url)}" title="${escapeAttr(title)}"></iframe>`
            blocks.push({
              id,
              type: 'html',
              title,
              summary: '',
              startLine,
              endLine,
              x: x - w / 2,
              y: y - h / 2,
              w,
              h,
              preview: { kind: 'html', html: { raw } },
            })
            continue
          }
        }

        for (const id of Array.from(lastPos.keys())) {
          if (!keepPosIds.has(id)) lastPos.delete(id)
        }

        if (blocks.length === 0) return null

        const sortedIframes = Array.from(new Set(iframeNodeIds)).sort((a, b) => a.localeCompare(b))
        const key = `graphBlocks|rev:${graphDataRevision || 0}|nodes:${nodes.length}`
        return {
          layout: { key, blocks } as MarkdownDesignLayout,
          panelOnlyNodeIdsKey: blocks.map(b => b.id).sort((a, b) => a.localeCompare(b)).join('|'),
          panelOnlyNodeIdSet: new Set(blocks.map(b => b.id)),
          iframeNodeIdsKey: sortedIframes.join('|'),
          iframeNodeIdSet: new Set(sortedIframes),
        }
      },
    })
  }, [canvas2dRenderer, graphDataRevision, sceneGraphData])

  const markdownPanelLineRanges = useMemo(() => {
    const layout = markdownDesignLayout
    if (!layout) return null
    const table = new Set<number>()
    const code = new Set<number>()
    const blockquote = new Set<number>()
    const iframe = new Set<number>()
    for (let i = 0; i < layout.blocks.length; i += 1) {
      const b = layout.blocks[i]!
      const start = Math.max(1, Math.floor(Number(b.startLine) || 1))
      if (b.type === 'table') table.add(start)
      else if (b.type === 'code') code.add(start)
      else if (b.type === 'blockquote' || b.type === 'callout') blockquote.add(start)
      else if (b.type === 'html') {
        const raw = String(b.preview.kind === 'html' ? (b.preview.html?.raw || '') : '').trim()
        if (/<\s*iframe\b/i.test(raw)) iframe.add(start)
      }
    }
    return { table, code, blockquote, iframe }
  }, [markdownDesignLayout])

  const { markdownIframeNodeIdsKey, markdownIframeNodeIdSet } = useMemo(() => {
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    const iframeRanges = markdownPanelLineRanges?.iframe || null
    if (!iframeRanges || iframeRanges.size === 0) return { markdownIframeNodeIdsKey: '', markdownIframeNodeIdSet: new Set<string>() }
    const sorted = Array.from(
      buildMarkdownIframeNodeIdSetFromGraphNodes({
        nodes,
        iframeLineStarts: iframeRanges,
      }),
    ).sort((a, b) => a.localeCompare(b))
    return { markdownIframeNodeIdsKey: sorted.join('|'), markdownIframeNodeIdSet: new Set(sorted) }
  }, [markdownPanelLineRanges, sceneGraphData])

  const panelIframeNodeIdsKey = graphBlockPanel ? graphBlockPanel.iframeNodeIdsKey : markdownIframeNodeIdsKey
  const panelIframeNodeIdSet = graphBlockPanel ? graphBlockPanel.iframeNodeIdSet : markdownIframeNodeIdSet

  const markdownPanelLayoutRef = React.useRef<MarkdownDesignLayout | null>(null)
  const markdownPanelLayoutLive = graphBlockPanel?.layout || markdownDesignLayout || null
  React.useEffect(() => {
    if (markdownPanelLayoutLive) markdownPanelLayoutRef.current = markdownPanelLayoutLive
  }, [markdownPanelLayoutLive])
  const markdownPanelLayoutForOverlay = markdownPanelLayoutLive || markdownPanelLayoutRef.current

  const markdownOverlayEnabled = active && (!!String(canvasMarkdownDocument.text || '').trim() || !!markdownPanelLayoutForOverlay)

  const { panelOnlyNodeIdsKey, panelOnlyNodeIdSet } = useMemo(() => {
    if (graphBlockPanel) {
      return { panelOnlyNodeIdsKey: graphBlockPanel.panelOnlyNodeIdsKey, panelOnlyNodeIdSet: graphBlockPanel.panelOnlyNodeIdSet }
    }
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    const idsSet = buildPanelOnlyNodeIdSetFromGraphNodes(nodes)
    if (markdownAnchorNodeIdByBlockId) {
      const anchorIds = Object.values(markdownAnchorNodeIdByBlockId)
      for (let i = 0; i < anchorIds.length; i += 1) {
        const id = String(anchorIds[i] || '').trim()
        if (!id) continue
        idsSet.add(id)
      }
    }
    for (const id of panelIframeNodeIdSet) idsSet.add(id)
    if (markdownPanelLineRanges) {
      const matchedNodeIds = buildMarkdownMatchedBlockNodeIdSetFromGraphNodes({
        nodes,
        lineRanges: markdownPanelLineRanges,
        includeIframeRanges: false,
        requireBlockNodeIds: true,
      })
      for (const id of matchedNodeIds) idsSet.add(id)
    }
    const sorted = Array.from(idsSet).sort((a, b) => a.localeCompare(b))
    return { panelOnlyNodeIdsKey: sorted.join('|'), panelOnlyNodeIdSet: new Set(sorted) }
  }, [graphBlockPanel, markdownAnchorNodeIdByBlockId, markdownPanelLineRanges, panelIframeNodeIdSet, sceneGraphData])

  const panelOnlyNodeIdSetRef = React.useRef<Set<string> | null>(null)
  const panelOnlyNodeIdsKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    if (panelOnlyNodeIdSet && panelOnlyNodeIdSet.size > 0) {
      panelOnlyNodeIdSetRef.current = panelOnlyNodeIdSet
      panelOnlyNodeIdsKeyRef.current = panelOnlyNodeIdsKey
    }
  }, [panelOnlyNodeIdSet, panelOnlyNodeIdsKey])

  const panelOnlyNodeIdSetForScene = useMemo(() => {
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    const base = panelOnlyNodeIdSetRef.current || panelOnlyNodeIdSet || null
    const extra = nodes.length > 0 ? buildPanelOnlyNodeIdSetFromGraphNodes(nodes) : null
    if (!base && (!extra || extra.size === 0)) return null
    if (!extra || extra.size === 0) return base
    if (!base) return extra
    let needsCopy = false
    for (const id of extra) {
      if (!base.has(id)) {
        needsCopy = true
        break
      }
    }
    if (!needsCopy) return base
    const out = new Set<string>(base)
    for (const id of extra) out.add(id)
    return out
  }, [panelOnlyNodeIdSet, sceneGraphData])
  const panelOnlyNodeIdsKeyForScene = useMemo(() => {
    if (!panelOnlyNodeIdSetForScene) return ''
    return Array.from(panelOnlyNodeIdSetForScene).sort((a, b) => a.localeCompare(b)).join('|')
  }, [panelOnlyNodeIdSetForScene])
  const [overlayInteractionActive, setOverlayInteractionActive] = useState(false)
  React.useEffect(() => {
    if (!overlayInteractionActive) return
    const end = () => setOverlayInteractionActive(false)
    return subscribeGlobalCancelWatchdog({
      listener: end,
      capture: true,
      includePointerDown: true,
      visibilityBehavior: 'hidden-only',
      timeoutMs: 12000,
    })
  }, [overlayInteractionActive])

  const richMedia = useRichMediaOverlays2d({
    active,
    activeRef,
    svgRef,
    zoomRef,
    simulationRef,
    sceneGraphData,
    sceneGraphDataRef,
    graphDataRevision: graphDataRevision || 0,
    schemaRef: schemaRef as unknown as React.MutableRefObject<GraphSchema>,
    renderMediaAsNodes,
    mediaPanelDensity,
    excludeNodeIdsKey: panelOnlyNodeIdsKeyForScene,
    excludeNodeIdSet: panelOnlyNodeIdSetForScene || undefined,
    threeIframeOverlayPoolMax,
    overlaySizing,
    sceneWidth,
    sceneHeight,
    freezeOverlayMembership: overlayInteractionActive,
  })


  const markdownOverlayScheduleRef = React.useRef<(() => void) | null>(null)
  const requestOverlaySchedule = React.useCallback(() => {
    try {
      richMedia.requestMediaOverlaySchedule()
    } catch {
      void 0
    }
    try {
      markdownOverlayScheduleRef.current?.()
    } catch {
      void 0
    }
  }, [richMedia])

  React.useEffect(() => {
    if (isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)) return
    const preserveStoryboardOverlaySelection =
      canvas2dRenderer === 'storyboard'
      && Array.isArray(openWidgetNodeIds)
      && openWidgetNodeIds.length > 0
      && ((typeof selectedNodeId === 'string'
        && selectedNodeId
        && richMedia.mediaOverlayNodeIdSet?.has(selectedNodeId)
        && openWidgetNodeIds.includes(selectedNodeId))
        || (Array.isArray(selectedNodeIds)
          && selectedNodeIds.some(id => richMedia.mediaOverlayNodeIdSet?.has(id) && openWidgetNodeIds.includes(id))))
    if (preserveStoryboardOverlaySelection) return
    const hasHiddenSelected =
      (typeof selectedNodeId === 'string' &&
        selectedNodeId &&
        ((panelOnlyNodeIdSetForScene && panelOnlyNodeIdSetForScene.has(selectedNodeId)) ||
          (richMedia.mediaOverlayNodeIdSet && richMedia.mediaOverlayNodeIdSet.has(selectedNodeId)))) ||
      (Array.isArray(selectedNodeIds) &&
        selectedNodeIds.some(id =>
          (panelOnlyNodeIdSetForScene && panelOnlyNodeIdSetForScene.has(id)) ||
          (richMedia.mediaOverlayNodeIdSet && richMedia.mediaOverlayNodeIdSet.has(id)),
        ))
    if (!hasHiddenSelected) return
    try {
      selectNode(null)
    } catch {
      void 0
    }
  }, [canvas2dRenderer, openWidgetNodeIds, panelOnlyNodeIdSetForScene, richMedia.mediaOverlayNodeIdSet, selectNode, selectedNodeId, selectedNodeIds])

  const overlayInteractions = useOverlayInteractions2d({
    activeRef,
    svgRef,
    zoomRef,
    simulationRef,
    sceneGraphDataRef,
    graphDataRevision: graphDataRevision || 0,
    schemaRef: schemaRef as unknown as React.MutableRefObject<GraphSchema>,
    requestOverlaySchedule,
  })

  useD3GraphScene2d({
    active,
    activeRef,
    svgRef,
    gRef,
    zoomRef,
    simulationRef,
    sceneGraphDataRef,
    sceneCleanupRef,
    sceneBuildKeyRef,
    beforeRenderFrameRef,
    beforeRenderFrameWrappedSourceRef,
    nodesSelRef,
    groupChevronSelRef,
    mediaSelRef,
    portHandlesSelRef,
    linksHitSelRef,
    linksSelRef,
    labelsSelRef,
    tempLinkSelRef,
    linkDragRef,
    schemaRef: schemaRef as unknown as React.MutableRefObject<GraphSchema>,
    schemaLayoutEngineJson,
    schemaNodesPresentationJson,
    schemaGroupsPresentationJson,
    nodesPresentationAppliedKeyRef,
    groupsPresentationAppliedKeyRef,
    activeLayoutCacheKeyRef,
    graphDataRevision: graphDataRevision || 0,
    graphContentRevision: graphContentRevision || 0,
    graphDataRevisionRef,
    sceneWidth,
    sceneHeight,
    sceneGraphData,
    sceneGroupsDerivation,
    edgesForSim,
    effectiveFrontmatterModeEnabled,
    multiDimTableModeEnabled,
    documentStructureBaselineLock,
    documentSemanticMode,
    layoutSemanticModeKey,
    canvasRenderMode,
    canvas2dRenderer,
    renderMediaAsNodes,
    mediaPanelDensity,
    viewportControlsPreset,
    collapsedGroupIdsKey,
    fitToScreenMode,
    zoomToSelectionMode,
    isEmbeddedPreview,
    coarsePointer: coarsePointer === true,
    mediaOverlayNodeIdSet: richMedia.mediaOverlayNodeIdSet,
    panelOnlyNodeIdsKey: panelOnlyNodeIdsKeyForScene,
    panelOnlyNodeIdSet: panelOnlyNodeIdSetForScene,
    overlaySizing,
    requestOverlaySchedule,
    setLayoutPositionsForMode,
    selectedEdgeIdRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
    selectedEdgeIdsRef,
    setHoverInfo,
  })

  useD3PresentationUpdates2d({
    activeRef,
    svgRef,
    gRef,
    zoomRef,
    simulationRef,
    sceneGraphDataRef,
    sceneGraphData,
    schemaRef: schemaRef as unknown as React.MutableRefObject<GraphSchema>,
    documentSemanticMode,
    frontmatterModeEnabled: effectiveFrontmatterModeEnabled === true,
    multiDimTableModeEnabled: multiDimTableModeEnabled === true,
    documentStructureBaselineLock: documentStructureBaselineLock === true,
    canvas2dRenderer,
    coarsePointer: coarsePointer === true,
    sceneWidth,
    sceneHeight,
    schemaNodesPresentationJson,
    schemaGroupsPresentationJson,
    nodesPresentationAppliedKeyRef,
    groupsPresentationAppliedKeyRef,
    edgesForSim,
    sceneGroupsDerivation,
    renderMediaAsNodes,
    mediaPanelDensity,
    mediaOverlayNodeIdSet: richMedia.mediaOverlayNodeIdSet,
    panelOnlyNodeIdsKey,
    panelOnlyNodeIdSet,
    tempLinkSelRef,
    linkDragRef,
    nodesSelRef,
    groupChevronSelRef,
    mediaSelRef,
    portHandlesSelRef,
    labelsSelRef,
    beforeRenderFrameRef,
    selectedEdgeIdRef,
    setHoverInfo,
  })

  useSelectionHighlight({ paused: !active, nodesSelRef, mediaSelRef, labelsSelRef, linksSelRef, themeSignal: resolvedThemeMode })
  useGroupSelectionHighlight({ gRef, paused: !active })
  useSelectionRerenderSubscription2d({ active, beforeRenderFrameRef })
  useZoomScaleReapplySubscription2d({ active, svgRef, zoomRef })
  useFlowLabelPresentation2d({
    active,
    labelsSelRef,
    sceneGraphData,
    flowState: flowState as unknown as { valuesByNodeId: Record<string, unknown>; kindsByNodeId: Record<string, unknown> },
    schemaNodesPresentationJson,
  })
  useGraphCanvasStyles({
    gRef,
    nodesSelRef,
    linksSelRef,
    labelsSelRef,
    schema,
    documentSemanticMode: documentSemanticMode ?? undefined,
    paused: !active,
    graphDataRevision: graphDataRevisionRef.current ?? 0,
    themeSignal: resolvedThemeMode,
  })

  const arrange = useArrange2d({
    active,
    schema,
    svgRef,
    simulationRef,
    sceneGraphDataRef,
    activeLayoutCacheKeyRef,
    selectedNodeId,
    selectedNodeIds,
  })
  useArrangeKeyboardShortcuts2d({
    active,
    schema,
    selectedIds: arrange.selectedIds,
    applyArrange: arrange.applyArrange,
    svgRef,
    simulationRef,
    sceneGraphDataRef,
    activeLayoutCacheKeyRef,
  })
  useArrangeRequestEffect2d({
    active,
    graphCanvasArrangeRequest,
    clearGraphCanvasArrangeRequest,
    svgRef,
    sceneGraphDataRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
    sceneWidth,
    sceneHeight,
    simulationRef,
    activeLayoutCacheKeyRef,
  })

  const marquee = useMarqueeSelection2d({ active, schema: schema as GraphSchema | null, svgRef, sceneGraphDataRef })

  return (
    <main ref={containerRef} className={CANVAS_SURFACE_CLASS} role="main" aria-label="Graph Canvas">
      <ArrangeToolbar2d active={active} selectedCount={arrange.selectedIds.length} onArrange={arrange.applyArrange} />
      <CanvasGridOverlaySurface
        canvasGrid={canvasGrid}
        width={width}
        height={height}
        dpr={dpr}
        getTransform={getZoomTransform}
        getEventTarget={getZoomEventTarget}
        themeSignal={resolvedThemeMode}
        surfaceId="d3"
      />
      <svg
        ref={svgRef}
        aria-hidden="true" focusable="false" role="presentation"
        className={`${CANVAS_INTERACTIVE_CLASS} z-10`}
        data-kg-canvas-interactive="1" data-kg-canvas-svg-viewport="presentation" style={{ pointerEvents: 'visiblePainted' }}
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} preserveAspectRatio="xMidYMid meet"
        onPointerDownCapture={() => {
          try {
            resetGlobalUserSelectLock()
          } catch {
            void 0
          }
          try {
            setOverlayInteractionActive(false)
          } catch {
            void 0
          }
        }}
        onPointerDown={marquee.svgPointerHandlers.onPointerDown} onPointerMove={marquee.svgPointerHandlers.onPointerMove} onPointerUp={marquee.svgPointerHandlers.onPointerUp}
      />
      <RichMediaOverlayLayer2d
        active={active}
        mediaOverlayNodes={richMedia.mediaOverlayNodes}
        getOverlayRefForId={richMedia.getOverlayRefForId}
        svgRef={svgRef}
        renderMediaAsNodes={renderMediaAsNodes === true}
        stopEvent={overlayInteractions.stopEvent}
        onOverlayPanStart={args0 => {
          setOverlayInteractionActive(true)
          overlayInteractions.startOverlayPan(args0)
        }}
        onOverlayPan={overlayInteractions.moveOverlayPan}
        onOverlayPanEnd={args0 => {
          overlayInteractions.endOverlayPan(args0)
          setOverlayInteractionActive(false)
        }}
        onHeaderDragStart={({ id, clientX, clientY }) => {
          setOverlayInteractionActive(true)
          overlayInteractions.beginHeaderDrag(id, clientX, clientY)
        }}
        onHeaderDrag={({ clientX, clientY, dx, dy }) => overlayInteractions.moveHeaderDrag(dx, dy, clientX, clientY)}
        onHeaderDragEnd={() => {
          overlayInteractions.endHeaderDrag()
          setOverlayInteractionActive(false)
        }}
        requestMediaOverlaySchedule={richMedia.requestMediaOverlaySchedule}
      />
      <MarqueeBoxOverlay marqueeBox={marquee.marqueeBox} />
      <GraphHoverTooltip
        hoverInfo={hoverInfo}
        containerRef={containerRef as unknown as React.RefObject<HTMLElement | null>}
        nodes={(sceneGraphData as GraphData | null)?.nodes}
        edges={(sceneGraphData as GraphData | null)?.edges}
        schema={schema as GraphSchema | null}
        onRequestClose={() => setHoverInfo(null)}
        tooltipInteractive
      />
      <MarkdownDesignOverlay
        enabled={markdownOverlayEnabled}
        svgRef={svgRef}
        markdownDocumentName={canvasMarkdownDocument.name}
        markdownDocumentText={canvasMarkdownDocument.text}
        allowedKinds={markdownPanelAllowedKinds}
        layoutOverride={markdownPanelLayoutForOverlay}
        anchorNodeIdByBlockId={markdownAnchorNodeIdByBlockId}
        getNodeWorldCenterForId={getNodeWorldCenterForId}
        stopEvent={overlayInteractions.stopEvent}
        requestOverlayScheduleRef={markdownOverlayScheduleRef}
        onOverlayPanStart={args0 => {
          setOverlayInteractionActive(true)
          overlayInteractions.startOverlayPan(args0)
        }}
        onOverlayPan={overlayInteractions.moveOverlayPan}
        onOverlayPanEnd={args0 => {
          overlayInteractions.endOverlayPan(args0)
          setOverlayInteractionActive(false)
        }}
        onHeaderDragStart={({ id, clientX, clientY }) => {
          setOverlayInteractionActive(true)
          overlayInteractions.beginHeaderDrag(id, clientX, clientY)
        }}
        onHeaderDrag={({ dx, dy }) => overlayInteractions.moveHeaderDrag(dx, dy)}
        onHeaderDragEnd={() => {
          overlayInteractions.endHeaderDrag()
          setOverlayInteractionActive(false)
        }}
        onVisibleNodeIdsChange={undefined}
      />
    </main>
  )
}
