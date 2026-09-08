import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { ensureKgTokensInstalled } from '@/lib/ui/tokens-ssot'
import { safeScaleExtent } from '@/lib/zoom/scaleExtent'
import { buildHtmlViewerRuntimeScript } from './runtimeScript'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { filterGroupsByCollapsedAncestors } from '@/lib/graph/groupVisibility'
import { filterGraphToFrontmatterMermaid } from '@/lib/graph/layerDerivation'
import { extractNodePosByIdFromSvgMarkup } from '@/lib/graph/svgNodePos'
import { ensureSvgHasEdgeGeometry } from '@/lib/graph/svgEdgeGeometry'
import { deriveMarkdownDesignLayoutFromGraphBlocks } from '@/features/markdown-edgeless/markdownDesignLayout'
import { computeMarkdownAnchorNodeIdByBlockId } from '@/lib/render/markdownPanelOverlayPool'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import type { OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import { readOverlaySizingConfigForDensity } from '@/lib/render/overlaySizing2d'
import {
  decodeRepoFileUrlToRelPath,
  inlineStandaloneAssetUrlToDataUrl,
  inlineRepoFileUrlToDataUrl,
  unwrapStandaloneProxyUrl,
} from '@/lib/graph/htmlViewer/standaloneAssetRewrite'

import { buildHtmlViewerOverlaySeeds, inferMediaKind, isFiniteNum, type HtmlViewerMediaNode } from './htmlViewerOverlaySeeds'
import { buildHtmlViewerDocumentShell, readHtmlViewerDocumentAppearance } from './htmlViewerDocumentShell'

export async function buildGraphHtmlViewerMarkup(args: {
  title?: string
  svgMarkup?: string | null
  graphData?: GraphData | null
  includeRichMediaOverlays?: boolean
  mediaOverlayPoolMax?: number
  mediaPanelDensity?: 'default' | 'compact'
  viewportWidthPx?: number
  viewportHeightPx?: number
  viewportScaleToFit?: boolean
  enableDecorativeAnimation?: boolean
  overlaySizing?: OverlayDensitySizingConfigInput | null
  zoomMinK?: number
  zoomMaxK?: number
  wheelBehavior?: 'pan' | 'zoom' | 'preset'
  viewportControlsPreset?: 'map' | 'design'
  panSpeed?: number
  zoomSpeed?: number
  flowWheelZoomSpeedMultiplier?: number
  flowWheelZoomIncrementMultiplier?: number
  flowWheelZoomSmoothMinDurationMs?: number
  flowWheelZoomSmoothMaxDurationMs?: number
  wheelZoomCtrlMetaBoostMultiplier?: number
  canvasInteractionSpeedMultiplier?: number
  canvasPanSpeedMultiplier?: number
  snapGridEnabled?: boolean
  snapGridSize?: number
  dragConstraint?: 'free' | 'axis-x' | 'axis-y' | 'none'
  allowNodeDrag?: boolean
  allowEdgeDrag?: boolean
  allowGroupDrag?: boolean
  initialFrontmatterEnabled?: boolean
  preferWebgl3d?: boolean
  initialView?: { k: number; x: number; y: number }
  zoomLabelScaleMode2d?: 'clampAt1' | 'smooth' | 'power'
  zoomLabelScaleExponent2d?: number
  zoomLabelScaleClampMin2d?: number
  zoomLabelScaleClampMax2d?: number
  zoomStrokeScaleMode2d?: 'zoomScaled' | 'screenConstant' | 'power'
  zoomStrokeScaleExponent2d?: number
  zoomStrokeScaleClampMin2d?: number
  zoomStrokeScaleClampMax2d?: number
  hideLabelsBelowScale?: number
  overlayHtml?: string
  inlineRemoteMediaAssets?: boolean
  allowRuntimeNetwork?: boolean
  proxyOrigin?: string | null
}): Promise<string | null> {
  try {
    ensureKgTokensInstalled()
  } catch {
    void 0
  }

  const title = String(args.title || '').trim() || 'Graph viewer'
  const svgMarkupRaw = String(args.svgMarkup || '').trim()

  const initialView =
    args.initialView && isFiniteNum(args.initialView.k) && isFiniteNum(args.initialView.x) && isFiniteNum(args.initialView.y)
      ? args.initialView
      : null
  const fixedViewport =
    isFiniteNum(args.viewportWidthPx) && isFiniteNum(args.viewportHeightPx)
      ? { w: Math.max(1, Math.floor(args.viewportWidthPx)), h: Math.max(1, Math.floor(args.viewportHeightPx)) }
      : null

  const { graphNodeIdentity, resolveOverlayNodeId, shouldKeepOverlayLinkedToGraph, overlayHtmlFiltered, overlaySeeds } = buildHtmlViewerOverlaySeeds({ graphData: args.graphData, svgMarkup: svgMarkupRaw, overlayHtml: args.overlayHtml })

  const preferredOverlayNodeIds = (() => {
    if (!initialView) return []
    const graph = args.graphData
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
    if (nodes.length === 0) return []

    const nodePosById: Record<string, { x: number; y: number }> = {}
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n?.id || '').trim()
      if (!id) continue
      const x = (n as unknown as { x?: unknown }).x
      const y = (n as unknown as { y?: unknown }).y
      if (!isFiniteNum(x) || !isFiniteNum(y)) continue
      nodePosById[id] = { x, y }
    }
    const fromSvg = extractNodePosByIdFromSvgMarkup(svgMarkupRaw)
    for (const id of Object.keys(fromSvg)) nodePosById[id] = fromSvg[id]!

    const vpW = fixedViewport ? fixedViewport.w : 1920
    const vpH = fixedViewport ? fixedViewport.h : 1080
    const pad = 800
    const k = Math.max(0.00001, Number(initialView.k))
    const tx = Number(initialView.x)
    const ty = Number(initialView.y)

    const out: string[] = []
    for (const id of Object.keys(nodePosById)) {
      if (!shouldKeepOverlayLinkedToGraph({ nodeId: id })) continue
      const p = nodePosById[id]
      if (!p) continue
      const sx = p.x * k + tx
      const sy = p.y * k + ty
      if (sx < -pad || sx > vpW + pad) continue
      if (sy < -pad || sy > vpH + pad) continue
      out.push(id)
      if (out.length >= 800) break
    }
    return out
  })()

  const hasSvg = !!svgMarkupRaw
  if (!hasSvg) return null

  const density = args.mediaPanelDensity === 'compact' ? 'compact' : 'default'
  const appearance = readHtmlViewerDocumentAppearance(density)
  const overlaySizingDefault = readOverlaySizingConfigForDensity({ density: 'default', sizing: args.overlaySizing || null })
  const overlaySizingCompact = readOverlaySizingConfigForDensity({ density: 'compact', sizing: args.overlaySizing || null })
  const widthRatioDefault = overlaySizingDefault.widthRatio
  const widthRatioCompact = overlaySizingCompact.widthRatio
  const widthMinDefault = overlaySizingDefault.widthMinPx
  const widthMinCompact = overlaySizingCompact.widthMinPx
  const widthMaxDefault = overlaySizingDefault.widthMaxPx
  const widthMaxCompact = overlaySizingCompact.widthMaxPx

  const mediaNodesBase = (() => {
    if (args.includeRichMediaOverlays !== true) return []
    const graph = args.graphData
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
    const poolMaxRaw = isFiniteNum(args.mediaOverlayPoolMax) ? Math.max(0, Math.floor(args.mediaOverlayPoolMax)) : 0
    const poolMax = poolMaxRaw > 0 ? poolMaxRaw : Math.min(2000, Math.max(24, nodes.length))
    return listMediaOverlayNodes({ enabled: true, nodes, poolMax, preferredNodeIds: preferredOverlayNodeIds })
  })()

  const inlineStandaloneMedia = async (nodes: HtmlViewerMediaNode[]): Promise<HtmlViewerMediaNode[]> => {
    if (!nodes || nodes.length === 0) return []
    const MAX_BYTES = 2_400_000
    const out: HtmlViewerMediaNode[] = []
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const url0 = String(n.url || '').trim()
      const url = unwrapStandaloneProxyUrl(url0)
      const openUrl = unwrapStandaloneProxyUrl(String(n.openUrl || url || '').trim())
      const relPath = decodeRepoFileUrlToRelPath(url)
      const canInlineRemote = args.inlineRemoteMediaAssets === true && (n.kind === 'image' || n.kind === 'svg' || n.kind === 'video' || n.kind === 'audio')

      const inlined = canInlineRemote
        ? await inlineStandaloneAssetUrlToDataUrl(url0 || url, { maxBytes: MAX_BYTES, allowRemote: true })
        : (relPath ? await inlineRepoFileUrlToDataUrl(url, { maxBytes: MAX_BYTES }) : null)
      if (!inlined) {
        out.push({ ...n, url, openUrl })
        continue
      }
      out.push({ ...n, url: inlined, openUrl })
    }
    return out
  }

  const mediaNodesMerged = (() => {
    const out: HtmlViewerMediaNode[] = []
    const seen = new Set<string>()
    const push = (n: HtmlViewerMediaNode) => {
      const id = resolveOverlayNodeId(String(n.id || '').trim())
      if (!shouldKeepOverlayLinkedToGraph({ nodeId: id })) return
      if (!id || seen.has(id)) return
      seen.add(id)
      out.push({ ...n, id })
    }
    for (let i = 0; i < mediaNodesBase.length; i += 1) push(mediaNodesBase[i] as unknown as HtmlViewerMediaNode)
    for (let i = 0; i < overlaySeeds.mediaNodes.length; i += 1) push(overlaySeeds.mediaNodes[i]!)
    return out
  })()
  const mediaNodes = await inlineStandaloneMedia(mediaNodesMerged)

  const mediaNodesJson = JSON.stringify(mediaNodes)

  const nodeLabelByIdJson = (() => {
    const out: Record<string, { label: string }> = {}
    const graph = args.graphData
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n?.id || '').trim()
      if (!id) continue
      const label = String((n as unknown as { label?: unknown }).label || '').trim()
      out[id] = { label: label || id }
    }
    return JSON.stringify(out)
  })()

  const nodeIdNormalizer = (() => {
    return (raw: string): string => {
      return graphNodeIdentity.resolveNodeId(raw)
    }
  })()

  const edgeMetaByIdJson = (() => {
    const out: Record<string, { label: string; s: string; t: string }> = {}
    const graph = args.graphData
    const edges = Array.isArray(graph?.edges) ? (graph!.edges as GraphEdge[]) : []
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]
      const id = String(e?.id || '').trim()
      if (!id) continue
      const label = String((e as unknown as { label?: unknown }).label || '').trim()
      const s0 = String((e as unknown as { source?: unknown }).source || '').trim()
      const t0 = String((e as unknown as { target?: unknown }).target || '').trim()
      const s = nodeIdNormalizer(s0)
      const t = nodeIdNormalizer(t0)
      out[id] = { label: label || '', s, t }
    }
    return JSON.stringify(out)
  })()

  const frontmatterVisibilityJson = (() => {
    const graph = args.graphData
    if (!graph) return JSON.stringify({ nodeIds: [], edgeIds: [] })
    const fm = filterGraphToFrontmatterMermaid(graph)
    const nodes = Array.isArray(fm.nodes) ? (fm.nodes as GraphNode[]) : []
    const edges = Array.isArray(fm.edges) ? (fm.edges as GraphEdge[]) : []
    const nodeIds = nodes.map(n => String(n?.id || '').trim()).filter(Boolean)
    const edgeIds = edges.map(e => String(e?.id || '').trim()).filter(Boolean)
    return JSON.stringify({ nodeIds, edgeIds })
  })()

  const groupMembersByIdJson = (() => {
    const graph = args.graphData
    if (!graph) return JSON.stringify({})
    const nodes = Array.isArray((graph as unknown as { nodes?: unknown }).nodes)
      ? ((graph as unknown as { nodes: GraphNode[] }).nodes as GraphNode[])
      : []
    const nodeIdSet = new Set<string>()
    const nodeIdBySuffix: Record<string, string> = {}
    for (let i = 0; i < nodes.length; i += 1) {
      const rawId = String(nodes[i]?.id || '').trim()
      if (!rawId) continue
      nodeIdSet.add(rawId)
      const suffix = rawId.split('::').pop() || ''
      if (suffix && !nodeIdBySuffix[suffix]) nodeIdBySuffix[suffix] = rawId
    }
    const normalizeMemberId = (raw: string): string => {
      const id = String(raw || '').trim()
      if (!id) return ''
      if (nodeIdSet.has(id)) return id
      const suffix = id.split('::').pop() || ''
      if (!suffix) return ''
      const full = nodeIdBySuffix[suffix]
      return full || id
    }
    const meta = (graph.metadata || {}) as Record<string, unknown>
    const isKeywordGraph = meta.kind === 'keyword'
    const forceDocumentStructure = readDocumentViewModeContext({
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      documentSemanticMode: isKeywordGraph ? 'keyword' : 'document',
      documentStructureBaselineLock: false,
    }).forceDocumentStructureGroups
    const view = meta['kg:view'] && typeof meta['kg:view'] === 'object' && !Array.isArray(meta['kg:view']) ? (meta['kg:view'] as Record<string, unknown>) : null
    const collapsedIds = view && Array.isArray(view.collapsedGroupIds) ? (view.collapsedGroupIds as unknown[]) : []
    const collapsedSet = new Set<string>(collapsedIds.map(x => String(x || '').trim()).filter(Boolean))
    const groups = filterGroupsByCollapsedAncestors({
      groups: deriveGraphGroups(graph, { forceDocumentStructure }),
      collapsedGroupIdSet: collapsedSet,
    })
    const out: Record<string, string[]> = {}
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]
      const id = String((g as unknown as { id?: unknown }).id || '').trim()
      if (!id) continue
      const membersRaw = (g as unknown as { memberNodeIds?: unknown }).memberNodeIds
      const members = Array.isArray(membersRaw) ? membersRaw.map(v => String(v)).filter(Boolean) : []
      if (members.length === 0) continue
      const normalized = members.map(normalizeMemberId).filter(m => m && nodeIdSet.has(m))
      if (normalized.length === 0) continue
      out[id] = normalized
    }
    return JSON.stringify(out)
  })()

  const nodePosByIdObj = (() => {
    const graph = args.graphData
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
    const out: Record<string, { x: number; y: number }> = {}
    const explicitNodePosIdSet = new Set<string>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n?.id || '').trim()
      if (!id) continue
      const x = (n as unknown as { x?: unknown }).x
      const y = (n as unknown as { y?: unknown }).y
      if (!isFiniteNum(x) || !isFiniteNum(y)) continue
      explicitNodePosIdSet.add(id)
      out[id] = { x, y }
    }
    const fromSvg = extractNodePosByIdFromSvgMarkup(svgMarkupRaw)
    for (const id of Object.keys(fromSvg)) out[id] = fromSvg[id]!
    for (let i = 0; i < overlaySeeds.markdownBlocks.length; i += 1) {
      const b = overlaySeeds.markdownBlocks[i]!
      const x = Number(b.x)
      const y = Number(b.y)
      const w = Number(b.w)
      const h = Number(b.h)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !(w > 0) || !(h > 0)) continue
      const cx = x + w * 0.5
      const cy = y + h * 0.5
      const bid = String(b.id || '').trim()
      if (bid && !explicitNodePosIdSet.has(bid)) out[bid] = { x: cx, y: cy }
      const anchor = resolveOverlayNodeId(String(b.anchorNodeId || '').trim())
      if (anchor && !explicitNodePosIdSet.has(anchor)) out[anchor] = { x: cx, y: cy }
    }
    return out
  })()
  const nodePosByIdJson = JSON.stringify(nodePosByIdObj)

  const markdownBlocksJson = (() => {
    try {
      const graph = args.graphData
      if (!graph && overlaySeeds.markdownBlocks.length === 0) return '[]'
      const layout = deriveMarkdownDesignLayoutFromGraphBlocks({ graphData: graph, nodePosById: nodePosByIdObj })
      const blocks = layout && Array.isArray(layout.blocks) ? layout.blocks : []
      const nodes = Array.isArray((graph as any)?.nodes) ? ((graph as any).nodes as any[]) : []
      const anchorNodeIdByBlockId = computeMarkdownAnchorNodeIdByBlockId({ layout, nodes })
      const blocksWithAnchor = blocks.map(b => {
        const id = String((b as any)?.id || '').trim()
        const anchorNodeId = id ? resolveOverlayNodeId(String((anchorNodeIdByBlockId as any)?.[id] || '').trim()) : ''
        return anchorNodeId ? ({ ...(b as any), anchorNodeId } as any) : b
      })
      const out = [...blocksWithAnchor]
      const byId = new Map<string, any>()
      for (let i = 0; i < out.length; i += 1) {
        const id = String((out[i] as any)?.id || '').trim()
        if (id) byId.set(id, out[i] as any)
      }
      for (let i = 0; i < overlaySeeds.markdownBlocks.length; i += 1) {
        const seed = overlaySeeds.markdownBlocks[i]!
        const existing = byId.get(seed.id)
        if (!existing) {
          out.push(seed as any)
          byId.set(seed.id, seed as any)
          continue
        }
        const anchor = resolveOverlayNodeId(String((existing.anchorNodeId || seed.anchorNodeId || '') as string))
        if (anchor) existing.anchorNodeId = anchor
        const exW = Number(existing.w)
        const exH = Number(existing.h)
        if (!(Number.isFinite(exW) && exW > 0 && Number.isFinite(exH) && exH > 0)) {
          existing.x = seed.x
          existing.y = seed.y
          existing.w = seed.w
          existing.h = seed.h
        }
      }
      const filtered = out.filter(b =>
        shouldKeepOverlayLinkedToGraph({
          nodeId: String((b as any)?.id || ''),
          anchorNodeId: String((b as any)?.anchorNodeId || ''),
        }),
      )
      const deduped: any[] = []
      const seen = new Set<string>()
      for (let i = 0; i < filtered.length; i += 1) {
        const b = filtered[i] as any
        const anchor = resolveOverlayNodeId(String((b?.anchorNodeId || b?.anchorId || '') as string))
        const id = String((b?.id || '') as string).trim()
        const key = (anchor ? `md:${anchor}` : id ? `md:${id}` : '').trim()
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(b)
      }
      return JSON.stringify(deduped)
    } catch {
      return '[]'
    }
  })()

  const svgMarkupWithEdgeGeometry = ensureSvgHasEdgeGeometry({
    svgMarkup: svgMarkupRaw,
    graphData: args.graphData || ({ nodes: [], edges: [] } as any),
    nodePosById: nodePosByIdObj,
  })

  const interactionCfgJson = JSON.stringify({
    scaleExtent: safeScaleExtent({ minK: args.zoomMinK, maxK: args.zoomMaxK }),
    wheelBehavior: args.wheelBehavior,
    viewportControlsPreset: args.viewportControlsPreset,
    panSpeed: args.panSpeed,
    zoomSpeed: args.zoomSpeed,
    flowWheelZoomSpeedMultiplier: args.flowWheelZoomSpeedMultiplier,
    flowWheelZoomIncrementMultiplier: args.flowWheelZoomIncrementMultiplier,
    flowWheelZoomSmoothMinDurationMs: args.flowWheelZoomSmoothMinDurationMs,
    flowWheelZoomSmoothMaxDurationMs: args.flowWheelZoomSmoothMaxDurationMs,
    wheelZoomCtrlMetaBoostMultiplier: args.wheelZoomCtrlMetaBoostMultiplier,
    canvasInteractionSpeedMultiplier: args.canvasInteractionSpeedMultiplier,
    canvasPanSpeedMultiplier: args.canvasPanSpeedMultiplier,
    snapGridEnabled: args.snapGridEnabled,
    snapGridSize: args.snapGridSize,
    dragConstraint: args.dragConstraint,
    allowNodeDrag: args.allowNodeDrag !== false,
    allowEdgeDrag: args.allowEdgeDrag !== false,
    allowGroupDrag: args.allowGroupDrag !== false,
    preferWebgl3d: args.preferWebgl3d === true,
    initialView: initialView || null,
    fixedViewport: fixedViewport ? { widthPx: fixedViewport.w, heightPx: fixedViewport.h, scaleToFit: args.viewportScaleToFit === true } : null,
    enableDecorativeAnimation: args.enableDecorativeAnimation === true,
    zoomLabelScaleMode2d: args.zoomLabelScaleMode2d,
    zoomLabelScaleExponent2d: args.zoomLabelScaleExponent2d,
    zoomLabelScaleClampMin2d: args.zoomLabelScaleClampMin2d,
    zoomLabelScaleClampMax2d: args.zoomLabelScaleClampMax2d,
    zoomStrokeScaleMode2d: args.zoomStrokeScaleMode2d,
    zoomStrokeScaleExponent2d: args.zoomStrokeScaleExponent2d,
    zoomStrokeScaleClampMin2d: args.zoomStrokeScaleClampMin2d,
    zoomStrokeScaleClampMax2d: args.zoomStrokeScaleClampMax2d,
    hideLabelsBelowScale: args.hideLabelsBelowScale,
  })

  const proxyOrigin = (() => {
    try {
      const origin = String(args.proxyOrigin || '').trim()
      if (!origin) return ''
      const host = new URL(origin).hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return origin
      return ''
    } catch {
      return ''
    }
  })()

  const svgPlaceholder = svgMarkupWithEdgeGeometry
  // Any payload marker retains 3D, including animated SVG with WebGL disabled.
  const has3dPayload = /\bdata-kg-3d-payload\b/i.test(svgMarkupWithEdgeGeometry)
  const runtimeScript = buildHtmlViewerRuntimeScript({
    interactionCfgJson,
    has3dPayload,
    mediaNodesJson,
    markdownBlocksJson,
    nodeLabelByIdJson,
    edgeMetaByIdJson,
    frontmatterVisibilityJson,
    initialFrontmatterEnabled: args.initialFrontmatterEnabled === true,
    nodePosByIdJson,
    groupMembersByIdJson,
    density,
    widthRatioDefault,
    widthRatioCompact,
    widthMinDefault,
    widthMinCompact,
    widthMaxDefault,
    widthMaxCompact,
    proxyOrigin,
    allowRuntimeNetwork: args.allowRuntimeNetwork === true,
  })

  return buildHtmlViewerDocumentShell({ title, svgMarkup: svgPlaceholder, overlayHtml: overlayHtmlFiltered, runtimeScript, has3dPayload, appearance })
}
