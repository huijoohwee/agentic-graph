import React from 'react'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag';
import { MinimapControls } from './MinimapControls'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useMinimapCollapsed } from '@/features/minimap/minimapVisibility'
import type { GraphNode, GraphEdge } from '@/lib/graph/types'
import { defaultSchema, getRendererPalette, MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { buildCollapsedGroupIdsKey } from '@/lib/canvas/collapsedGroupIdsKey'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { readLayoutMode2d } from '@/lib/graph/layoutMode'
import { buildSchemaLayoutEngineJson2d } from '@/lib/canvas/schema-layout-engine-json'
import { computeLayoutDatasetKey, buildLayoutPositionCacheKey, buildLayoutViewKey } from '@/lib/canvas/layoutPositioning'
import { pickSeedFromOtherRendererCache } from '@/lib/canvas/layoutSeed'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import {
  computeMinimapProjection,
  computeMinimapViewportWorldRect,
  computeGraphBounds,
  computeTransformFromViewTopLeft,
  computeTransformFromCenter,
  clampZoomScale,
  projectMinimapPointToWorld,
  projectWorldRectToMinimap,
  unionMinimapBoundsWithRect,
  MINIMAP_EDGE_LIMIT_DEFAULT,
  MINIMAP_GRAPH_PAD_DEFAULT,
  MINIMAP_WIDTH,
  MINIMAP_HEIGHT,
  MINIMAP_NEIGHBOR_NODE_SIZE_DEFAULT,
  MINIMAP_NODE_SIZE_DEFAULT,
  MINIMAP_OVERLAY_NODE_SIZE_DEFAULT,
  MINIMAP_SELECTED_NODE_SIZE_DEFAULT,
} from '@/features/minimap/math'
import { buildEdgesPathD, buildNodesPathD } from '@/features/minimap/renderer'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { buildMinimapStoryboardWidgetOverlayNodeById, buildMinimapStoryboardWidgetOverlaySubset } from '@/features/minimap/storyboardWidgetOverlayProjection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { resolveContextualZoomDetail } from '@/lib/zoom/viewport'

type ZoomT = { k: number; x: number; y: number };

type Highlight = { selNodes: GraphNode[]; nbrNodes: GraphNode[]; selEdges: GraphEdge[] };

type ZoomTransform = ZoomT;

const requestZoomTransform = (t: ZoomTransform) => {
  useGraphStore.getState().requestZoomTransform(t)
}

function Minimap() {
  const [minimapCollapsed, setMinimapCollapsed] = useMinimapCollapsed()
  const rawGraphData = useGraphStore(s => s.graphData)
  const activeGraphData = useActiveGraphRenderData(true)
  const graphData = activeGraphData || rawGraphData
  const graphId = useGraphStore(s => s.graphId)
  const canvasDims = useGraphStore(s => s.canvasDims)
  const miniW = MINIMAP_WIDTH
  const miniH = MINIMAP_HEIGHT
  const { canvasRenderMode, canvas2dRenderer, documentSemanticMode, multiDimTableModeEnabled, frontmatterModeEnabled, documentStructureBaselineLock, renderMediaAsNodes, mediaPanelDensity, collapsedGroupIds, designRendererWebpageLayoutKey, infiniteCanvasInteractionMode } = useGraphStore(
    useShallow(s => ({
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      documentSemanticMode: s.documentSemanticMode,
      multiDimTableModeEnabled: s.multiDimTableModeEnabled,
      frontmatterModeEnabled: s.frontmatterModeEnabled,
      documentStructureBaselineLock: s.documentStructureBaselineLock,
      renderMediaAsNodes: s.renderMediaAsNodes,
      mediaPanelDensity: s.mediaPanelDensity,
      collapsedGroupIds: s.collapsedGroupIds,
      designRendererWebpageLayoutKey: s.designRendererWebpageLayoutKey,
      infiniteCanvasInteractionMode: s.infiniteCanvasInteractionMode,
    })),
  )
  const preview = useGraphStore(s => s.minimapPreview)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision)
  const layoutPositionCacheByMode = useGraphStore(s => s.layoutPositionCacheByMode)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const uiPanelOpacity = useGraphStore(s => s.uiPanelOpacity)
  const { openWidgetNodeIds, flowWidgetPinnedByNodeId, flowWidgetPosByNodeId, flowWidgetWorldPosByNodeId } = useGraphStore(
    useShallow(s => ({
      openWidgetNodeIds: s.openWidgetNodeIds,
      flowWidgetPinnedByNodeId: s.flowWidgetPinnedByNodeId,
      flowWidgetPosByNodeId: s.flowWidgetPosByNodeId,
      flowWidgetWorldPosByNodeId: (s as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> }).flowWidgetWorldPosByNodeId,
    })),
  )

  const schema = useGraphStore(s => s.schema)
  const sceneDisplayGraphDerivation = React.useMemo(() => {
    if (!graphData) return null
    return deriveSceneDisplayGraph({ graphData })
  }, [graphData])
  const sceneGraphData = React.useMemo(() => {
    if (!graphData) return null
    return sceneDisplayGraphDerivation?.displayGraphData || graphData
  }, [graphData, sceneDisplayGraphDerivation])
  const usesDerivedSceneGraph = sceneGraphData !== graphData

  const zoomViewKey = React.useMemo(() => {
    return buildActive2dZoomViewKey({
      canvasRenderMode,
      canvas2dRenderer,
      schema,
      graphData,
      documentSemanticMode,
      frontmatterModeEnabled,
      multiDimTableModeEnabled,
      documentStructureBaselineLock,
      renderMediaAsNodes,
      mediaPanelDensity,
      collapsedGroupIds,
      designRendererWebpageLayoutKey,
    })
  }, [
    canvas2dRenderer,
    canvasRenderMode,
    collapsedGroupIds,
    documentSemanticMode,
    documentStructureBaselineLock,
    designRendererWebpageLayoutKey,
    frontmatterModeEnabled,
    graphData,
    mediaPanelDensity,
    multiDimTableModeEnabled,
    renderMediaAsNodes,
    schema,
  ])

  const zoomState = useGraphStore(React.useCallback(s => {
    if (!zoomViewKey) return null
    return s.zoomStateByKey?.[zoomViewKey] ?? null
  }, [zoomViewKey]))

  const zoomStateRef = React.useRef<ZoomTransform | null>(zoomState ? { k: zoomState.k, x: zoomState.x, y: zoomState.y } : null)
  React.useEffect(() => {
    zoomStateRef.current = zoomState ? { k: zoomState.k, x: zoomState.x, y: zoomState.y } : null
  }, [zoomState])
  const [minScale, maxScale] = React.useMemo(() => {
    return readZoomScaleExtent(schema || defaultSchema)
  }, [schema])
  const palette = getRendererPalette(schema || null)
  const highlightColor = typeof palette.nodes.idea === 'string' && palette.nodes.idea.trim()
    ? palette.nodes.idea
    : MVP_COLOR_PALETTE.nodes.idea
  const minimapOpacity = uiPanelOpacity ?? 0.7
  const nodes = React.useMemo(() => {
    const baseNodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    if (baseNodes.length === 0) return baseNodes
    if (infiniteCanvasInteractionMode === 'interactive') return baseNodes
    const schemaEffective = schema || defaultSchema
    const semanticModeKey = readDocumentViewModeContext({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      multiDimTableModeEnabled: multiDimTableModeEnabled === true,
      documentSemanticMode: String(documentSemanticMode || 'document'),
      documentStructureBaselineLock: documentStructureBaselineLock === true,
    }).documentSemanticModeKey
    const effectiveFrontmatter = computeEffectiveFrontmatterMode({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      documentSemanticMode: String(documentSemanticMode || 'document'),
      graphData,
    })
    const datasetKey = computeLayoutDatasetKey({ graphData: sceneGraphData as never, graphDataRevision: graphDataRevision || 0 })
    const layoutMode = readLayoutMode2d(schemaEffective)
    const graphMetaKey = buildGraphMetaKeyIgnoringPending(sceneGraphData as never)
    const collapsedGroupIdsKey = buildCollapsedGroupIdsKey(collapsedGroupIds)
    const viewKey = buildLayoutViewKey({
      schemaLayoutEngineJson: buildSchemaLayoutEngineJson2d(schema || null),
      frontmatterModeEnabled: effectiveFrontmatter,
      documentSemanticMode: semanticModeKey,
      graphMetaKey,
      renderMediaAsNodes: renderMediaAsNodes === true,
      mediaPanelDensity: String(mediaPanelDensity),
      collapsedGroupIdsKey,
    })
    const baseKey = buildLayoutPositionCacheKey({
      datasetKey,
      mode: layoutMode,
      frontmatterMode: effectiveFrontmatter,
      semanticMode: semanticModeKey,
      renderMode: '2d',
      renderVariant: String(canvas2dRenderer || ''),
      viewKey,
    })
    const positionSeed = pickSeedFromOtherRendererCache({
      nodes: baseNodes,
      cache: (layoutPositionCacheByMode as unknown as Record<string, Record<string, { x: number; y: number }>>) || null,
      baseKey,
      allowVariantFallback: false,
    })
    if (!positionSeed) return baseNodes
    let changed = false
    const next = new Array<GraphNode>(baseNodes.length)
    for (let i = 0; i < baseNodes.length; i += 1) {
      const n = baseNodes[i]!
      const id = String(n?.id || '').trim()
      const p = id ? positionSeed[id] : null
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        next[i] = n
        continue
      }
      if (typeof n.x === 'number' && Number.isFinite(n.x) && typeof n.y === 'number' && Number.isFinite(n.y)) {
        next[i] = n
        continue
      }
      if (n.x === p.x && n.y === p.y) {
        next[i] = n
        continue
      }
      changed = true
      next[i] = { ...n, x: p.x, y: p.y }
    }
    return changed ? next : baseNodes
  }, [
    canvas2dRenderer,
    collapsedGroupIds,
    documentSemanticMode,
    documentStructureBaselineLock,
    frontmatterModeEnabled,
    graphData,
    graphDataRevision,
    infiniteCanvasInteractionMode,
    layoutPositionCacheByMode,
    mediaPanelDensity,
    multiDimTableModeEnabled,
    renderMediaAsNodes,
    sceneGraphData,
    schema,
  ]);
  const edges = React.useMemo(() => (Array.isArray(sceneGraphData?.edges) ? (sceneGraphData!.edges as GraphEdge[]) : []), [sceneGraphData]);

  const storyboardWidgetOverlayNodeById = React.useMemo(() => {
    return buildMinimapStoryboardWidgetOverlayNodeById({ canvas2dRenderer, nodes })
  }, [canvas2dRenderer, nodes])

  const storyboardWidgetOverlaySubset = React.useMemo(() => {
    return buildMinimapStoryboardWidgetOverlaySubset({
      canvas2dRenderer,
      canvasDims,
      edges,
      storyboardWidgetOverlayNodeById,
      flowWidgetPinnedByNodeId,
      flowWidgetPosByNodeId,
      flowWidgetWorldPosByNodeId,
      openWidgetNodeIds,
      schema,
      zoomState,
    })
  }, [
    canvas2dRenderer,
    canvasDims.h,
    canvasDims.w,
    edges,
    storyboardWidgetOverlayNodeById,
    flowWidgetPinnedByNodeId,
    flowWidgetPosByNodeId,
    flowWidgetWorldPosByNodeId,
    openWidgetNodeIds,
    schema,
    zoomState,
  ])

  const hasStoryboardWidgetOverlaySubset = storyboardWidgetOverlaySubset != null
  const baseGraphBounds = React.useMemo(
    () => (
      hasStoryboardWidgetOverlaySubset
        ? computeGraphBounds(nodes, MINIMAP_GRAPH_PAD_DEFAULT)
        : (preview?.bounds ?? computeGraphBounds(nodes, MINIMAP_GRAPH_PAD_DEFAULT))
    ),
    [hasStoryboardWidgetOverlaySubset, nodes, preview?.bounds],
  )
  const storyboardWidgetOverlayBounds = React.useMemo(
    () => (storyboardWidgetOverlaySubset ? computeGraphBounds(storyboardWidgetOverlaySubset.nodes, MINIMAP_GRAPH_PAD_DEFAULT) : null),
    [storyboardWidgetOverlaySubset],
  )
  const graphBounds = React.useMemo(() => {
    if (!storyboardWidgetOverlayBounds) return baseGraphBounds
    return unionMinimapBoundsWithRect(baseGraphBounds, {
      x: storyboardWidgetOverlayBounds.minX,
      y: storyboardWidgetOverlayBounds.minY,
      w: storyboardWidgetOverlayBounds.width,
      h: storyboardWidgetOverlayBounds.height,
    })
  }, [baseGraphBounds, storyboardWidgetOverlayBounds])
  const viewRectWorld = React.useMemo(() => {
    const z = zoomState || { k: 1, x: 0, y: 0 };
    return computeMinimapViewportWorldRect(Math.max(1, canvasDims.w), Math.max(1, canvasDims.h), z.k, z.x, z.y);
  }, [canvasDims, zoomState]);
  const bounds = React.useMemo(
    () => unionMinimapBoundsWithRect(graphBounds, viewRectWorld),
    [graphBounds, viewRectWorld],
  );
  const sx = React.useMemo(() => {
    return computeMinimapProjection(bounds, { w: miniW, h: miniH }).sx;
  }, [bounds.height, bounds.width, miniH, miniW]);

  const canUsePreview = React.useMemo(() => {
    if (storyboardWidgetOverlaySubset) return false
    if (usesDerivedSceneGraph) return false
    if (graphData !== rawGraphData) return false
    if (infiniteCanvasInteractionMode === 'interactive') return false
    if (canvas2dRenderer !== 'd3') return false
    const b = preview?.bounds;
    if (!b) return false;
    return (
      Math.abs(b.minX - bounds.minX) < 1e-6
      && Math.abs(b.minY - bounds.minY) < 1e-6
      && Math.abs(b.maxX - bounds.maxX) < 1e-6
      && Math.abs(b.maxY - bounds.maxY) < 1e-6
    );
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, canvas2dRenderer, storyboardWidgetOverlaySubset, graphData, infiniteCanvasInteractionMode, preview?.bounds, rawGraphData, usesDerivedSceneGraph]);

  const EDGE_LIMIT = MINIMAP_EDGE_LIMIT_DEFAULT;
  const edgesPathD = React.useMemo(() => {
    if (canUsePreview && preview?.edgesPath) return preview.edgesPath as string;
    return edges.length > EDGE_LIMIT ? '' : buildEdgesPathD(nodes, edges, bounds, sx, graphId ?? '');
  }, [canUsePreview, nodes, edges, bounds, sx, preview?.edgesPath, graphId]);
  const nodesPathD = React.useMemo(() => {
    if (canUsePreview && preview?.nodesPath) return preview.nodesPath as string;
    return buildNodesPathD(nodes, bounds, sx, MINIMAP_NODE_SIZE_DEFAULT, graphId ?? '');
  }, [canUsePreview, nodes, bounds, sx, preview?.nodesPath, graphId]);

  const overlayEdgesPathD = React.useMemo(() => {
    const overlay = storyboardWidgetOverlaySubset
    if (!overlay) return ''
    return overlay.edges.length > EDGE_LIMIT ? '' : buildEdgesPathD(overlay.nodes, overlay.edges, bounds, sx, `qe:${graphId ?? ''}`)
  }, [bounds, storyboardWidgetOverlaySubset, graphId, sx])
  const overlayNodesPathD = React.useMemo(() => {
    const overlay = storyboardWidgetOverlaySubset
    if (!overlay) return ''
    return buildNodesPathD(overlay.nodes, bounds, sx, MINIMAP_OVERLAY_NODE_SIZE_DEFAULT, `qe:${graphId ?? ''}`)
  }, [bounds, storyboardWidgetOverlaySubset, graphId, sx])

  const highlight: Highlight = React.useMemo(() => {
    if (!selectedNodeId && !selectedEdgeId) return { selNodes: [], nbrNodes: [], selEdges: [] };
    if (selectedNodeId) {
      const nbr = new Set<string>();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = String(e.source);
        const t = String(e.target);
        if (s === selectedNodeId) nbr.add(t);
        if (t === selectedNodeId) nbr.add(s);
      }
      const selNodes = nodes.filter((n) => n.id === selectedNodeId);
      const nbrNodes = nodes.filter((n) => nbr.has(n.id));
      const selEdges = edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
      return { selNodes, nbrNodes, selEdges };
    }
    if (selectedEdgeId) {
      const eSel = edges.find((e) => e.id === selectedEdgeId);
      if (!eSel) return { selNodes: [], nbrNodes: [], selEdges: [] };
      const sId = String(eSel.source);
      const tId = String(eSel.target);
      const selNodes = nodes.filter((n) => n.id === sId || n.id === tId);
      const nbrNodes: GraphNode[] = [];
      const selEdges = [eSel];
      return { selNodes, nbrNodes, selEdges };
    }
    return { selNodes: [], nbrNodes: [], selEdges: [] };
  }, [selectedNodeId, selectedEdgeId, nodes, edges]);

  const selNodesPathD = React.useMemo(
    () => (highlight.selNodes.length ? buildNodesPathD(highlight.selNodes, bounds, sx, MINIMAP_SELECTED_NODE_SIZE_DEFAULT, graphId ?? '') : ''),
    [highlight.selNodes, bounds, sx, graphId]
  );
  const nbrNodesPathD = React.useMemo(
    () => (highlight.nbrNodes.length ? buildNodesPathD(highlight.nbrNodes, bounds, sx, MINIMAP_NEIGHBOR_NODE_SIZE_DEFAULT, graphId ?? '') : ''),
    [highlight.nbrNodes, bounds, sx, graphId]
  );
  const selEdgesPathD = React.useMemo(
    () => (highlight.selEdges.length ? buildEdgesPathD(nodes, highlight.selEdges, bounds, sx, graphId ?? '') : ''),
    [nodes, highlight.selEdges, bounds, sx, graphId]
  );

  const viewRectRaw = React.useMemo(() => {
    return { x: viewRectWorld.x, y: viewRectWorld.y, w: viewRectWorld.w, h: viewRectWorld.h };
  }, [viewRectWorld.h, viewRectWorld.w, viewRectWorld.x, viewRectWorld.y]);

  const viewRect = React.useMemo(
    () => projectWorldRectToMinimap(viewRectRaw, bounds, sx),
    [viewRectRaw, bounds, sx],
  );

  const centerThreshold = React.useMemo(() => {
    const minSide = Math.min(viewRect.w, viewRect.h);
    const base = Math.max(4, minSide * 0.06);
    const zoomDetail = resolveContextualZoomDetail({ k: zoomState?.k ?? 1, contentThreshold: 0.3 })
    const scale = zoomDetail.showContent ? 1 : (zoomDetail.threshold / Math.max(zoomDetail.k, 0.1));
    return Math.min(14, base * scale);
  }, [viewRect, zoomState]);

  const dragRef = React.useRef<{ mx: number; my: number; gx: number; gy: number } | null>(null);


  const onMinimapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { x: cx, y: cy } = projectMinimapPointToWorld({ x: mx, y: my }, bounds, sx);
    const z: ZoomT = zoomState || { k: 1, x: 0, y: 0 };
    const k = z.k || 1;
    const x = -cx * k + (canvasDims.w / 2);
    const y = -cy * k + (canvasDims.h / 2);
    requestZoomTransform({ k, x, y });
  };

  const onMinimapWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    dragRef.current = null;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { x: ux, y: uy } = projectMinimapPointToWorld({ x: mx, y: my }, bounds, sx);
    const z: ZoomT = zoomState || { k: 1, x: 0, y: 0 };
    const k0 = z.k || 1;
    const factor = Math.pow(1.2, -e.deltaY / 100);
    const k1 = clampZoomScale(k0 * factor, minScale, maxScale)
    const t = computeTransformFromCenter(
      Math.max(1, canvasDims.w),
      Math.max(1, canvasDims.h),
      ux,
      uy,
      k1,
      { minScale, maxScale },
    )
    requestZoomTransform(t);
  };

  const onRectPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.preventDefault();
    const svgEl = (e.currentTarget as SVGGraphicsElement).ownerSVGElement as (SVGSVGElement | null);
    if (!svgEl) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    const cx = viewRect.w / 2;
    const cy = viewRect.h / 2;
    const nearCenter = Math.abs(lx - cx) <= centerThreshold && Math.abs(ly - cy) <= centerThreshold;
    if (!nearCenter) return;
    const rect = svgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    dragRef.current = { mx, my, gx: viewRectRaw.x, gy: viewRectRaw.y };

    const scheduler = createRafValueScheduler((p: { ngx: number; ngy: number }) => {
      const z = zoomStateRef.current || { k: 1, x: 0, y: 0 }
      const t = computeTransformFromViewTopLeft(Math.max(1, canvasDims.w), Math.max(1, canvasDims.h), z.k, p.ngx, p.ngy)
      const EPS = 0.5
      const nearlySame =
        Math.abs(t.x - z.x) < EPS && Math.abs(t.y - z.y) < EPS && Math.abs((t.k || 1) - (z.k || 1)) < 1e-9
      if (!nearlySame) requestZoomTransform(t)
    })

    startPointerDrag({
      ev: e.nativeEvent,
      cursor: 'grabbing',
      shouldStart: (down) => {
        if (down.pointerType === 'mouse' && down.button !== 0) return false;
        return true;
      },
      onMove: (mv) => {
        if (!dragRef.current) return;
        const owner = (e.currentTarget as SVGGraphicsElement).ownerSVGElement as (SVGSVGElement | null);
        if (!owner) return;
        const mrect = owner.getBoundingClientRect();
        const curMx = mv.clientX - mrect.left;
        const curMy = mv.clientY - mrect.top;
        const dx = curMx - dragRef.current.mx;
        const dy = curMy - dragRef.current.my;
        const dxg = dx / sx;
        const dyg = dy / sx;
        const ngx = dragRef.current.gx + dxg;
        const ngy = dragRef.current.gy + dyg;
        scheduler.schedule({ ngx, ngy })
      },
      onEnd: (up) => {
        const owner = (e.currentTarget as SVGGraphicsElement).ownerSVGElement as (SVGSVGElement | null);
        const rect = owner?.getBoundingClientRect();
        const hasPos = rect != null;
        const z = zoomStateRef.current || { k: 1, x: 0, y: 0 };
        const k = z.k || 1;
        if (hasPos) {
          const mx = up.clientX - (rect as DOMRect).left;
          const my = up.clientY - (rect as DOMRect).top;
          const { x: ux, y: uy } = projectMinimapPointToWorld({ x: mx, y: my }, bounds, sx);
          const vw = Math.max(1, canvasDims.w);
          const vh = Math.max(1, canvasDims.h);
          const kk = clampZoomScale(k, minScale, maxScale)
          const t = computeTransformFromCenter(vw, vh, ux, uy, kk, { minScale, maxScale });
          const EPS = 0.5;
          const nearlySame = Math.abs(t.x - z.x) < EPS && Math.abs(t.y - z.y) < EPS && Math.abs((t.k || 1) - (z.k || 1)) < 1e-9;
          if (!nearlySame) {
            requestZoomTransform(t);
          }
        }
        dragRef.current = null;
        scheduler.cancel()
      },
      onCancel: () => {
        dragRef.current = null;
        scheduler.cancel()
      },
    });
  };

  const onRectPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (dragRef.current) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    const cx = viewRect.w / 2;
    const cy = viewRect.h / 2;
    const isCenter = Math.abs(lx - cx) <= centerThreshold && Math.abs(ly - cy) <= centerThreshold;
    setHoverCenter(isCenter);
  };

  const [hoverCenter, setHoverCenter] = React.useState(false);
  const isNearCenter = React.useCallback((lx: number, ly: number) => {
    const cx = viewRect.w / 2;
    const cy = viewRect.h / 2;
    return Math.abs(lx - cx) <= centerThreshold && Math.abs(ly - cy) <= centerThreshold;
  }, [viewRect, centerThreshold]);
  const onRectMouseLeave = () => setHoverCenter(false);

  return (
    <aside className="relative isolate group kg-minimap-root" aria-label="Minimap" data-kg-minimap-root="1" data-kg-css-inspector-selectable="minimap">
      {!minimapCollapsed && <section
        className={`relative overflow-hidden rounded border kg-minimap-surface ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} shadow backdrop-blur-sm`}
        style={{ opacity: minimapOpacity }} data-kg-css-inspector-selectable="minimap-surface"
      >
        <svg width={miniW} height={miniH} onClick={onMinimapClick} onWheel={onMinimapWheel} className="relative block kg-minimap-svg" data-kg-minimap-surface="1" data-kg-minimap-svg="1">
          <rect x={0} y={0} width={miniW} height={miniH} fill="#f8fafc" />
          {edgesPathD && (
            <path d={edgesPathD} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} fill="none" pointerEvents="none" shapeRendering="crispEdges" />
          )}
          {nodesPathD && (
            <path d={nodesPathD} fill="#334155" stroke="none" pointerEvents="none" />
          )}
          {overlayEdgesPathD && (
            <path d={overlayEdgesPathD} stroke="#0f172a" strokeWidth={1} strokeOpacity={0.35} fill="none" pointerEvents="none" shapeRendering="crispEdges" />
          )}
          {overlayNodesPathD && (
            <path d={overlayNodesPathD} fill="#0f172a" fillOpacity={0.35} stroke="none" pointerEvents="none" />
          )}
          {selEdgesPathD && (
            <path d={selEdgesPathD} stroke={highlightColor} strokeWidth={1.5} strokeOpacity={0.9} fill="none" pointerEvents="none" shapeRendering="crispEdges" />
          )}
          {nbrNodesPathD && (
            <path d={nbrNodesPathD} fill={palette.nodes.execution} stroke="none" pointerEvents="none" />
          )}
          {selNodesPathD && (
            <path d={selNodesPathD} fill={highlightColor} stroke="none" pointerEvents="none" />
          )}
          <rect
            x={viewRect.x}
            y={viewRect.y}
            width={viewRect.w}
            height={viewRect.h}
            fill="none"
            stroke={highlightColor}
            strokeWidth={1}
            style={{ cursor: dragRef.current ? 'grabbing' : (hoverCenter ? 'grab' : 'auto'), touchAction: 'none' }}
            onPointerDown={onRectPointerDown}
            onPointerMove={onRectPointerMove}
            onPointerLeave={() => setHoverCenter(false)}
            onMouseLeave={onRectMouseLeave}
          />
          {hoverCenter && (
            <g transform={`translate(${viewRect.x + viewRect.w / 2}, ${viewRect.y + viewRect.h / 2})`}>
              <line x1={-6} y1={0} x2={6} y2={0} stroke={highlightColor} strokeWidth={1} />
              <line x1={0} y1={-6} x2={0} y2={6} stroke={highlightColor} strokeWidth={1} />
            </g>
          )}
        </svg>
      </section>}
      <MinimapControls collapsed={minimapCollapsed} opacity={minimapOpacity} onToggle={setMinimapCollapsed} />
    </aside>
  );
}

export default React.memo(Minimap)
