import React from 'react'

import FlowWidgetOverlay from '@/components/StoryboardWidget/FlowWidgetOverlay'
import { deriveGraphDataWithGroupCollapse } from '@/components/GraphCanvas/viewDerivation'
import { filterGraphToFlowWidgetEligible } from '@/lib/graph/flowWidgetEligibility'
import { isFlowWidgetOverlayEligibleNode } from '@/lib/graph/flowWidgetEligibility'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { filterGraphByIncludedNodeIds } from '@/lib/graph/filterByNodeIds'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { WidgetEditorSurfaceKind } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { isCanonicalFrontmatterBuiltInWidgetNode } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY } from '@/components/StoryboardCanvas/storyboardModel'
import {
  deriveFrontmatterFlowOverlayNodeIds,
  resolveGraphNodeIdByCanonicalId,
} from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { readSnapGridScalarSize } from '@/lib/canvas/snapGridSize'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import { readStableRichMediaPanelSize } from '@/lib/render/mediaPanelLayout'
export {
  isCanonicalFrontmatterBuiltInWidgetNode,
  resolveDefaultFlowWidgetPinnedInCanvas,
  shouldAutoPlaceStoryboardWidget,
  shouldUseStoryboardWidgetFloatingScreenAuthority,
  stripFrontmatterAutoManagedWidgetScreenPositions,
} from '@/lib/storyboardWidget/widgetPlacementAuthority'
export {
  deriveFrontmatterFlowOverlayNodeIds,
  resolveGraphNodeIdByCanonicalId,
} from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'

export type ToolMode = 'select' | 'addEdge'

export const OVERLAY_NODE_OVERRIDE_LOCK_MS = 4000
export const WIDGET_DROP_DEDUPE_WINDOW_MS = 250
export const FORCE_SELECT_TICK_MS = 30
export const FORCE_SELECT_MAX_TICKS = 80
export const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function pickString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function pickFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function readFiniteGeoLatLng(properties: Record<string, unknown>): { lat: number; lng: number } | null {
  const geoRaw = isRecord(properties.geo) ? properties.geo : null
  const lat = pickFiniteNumber(geoRaw?.lat)
  const lng = pickFiniteNumber(geoRaw?.lng)
  if (lat == null || lng == null) return null
  return { lat, lng }
}

function normalizeStoryboardWidgetDropTransform(raw: { k?: unknown; x?: unknown; y?: unknown } | null | undefined): {
  k: number
  x: number
  y: number
} | null {
  if (!raw) return null
  const k = Number(raw.k)
  const x = Number(raw.x)
  const y = Number(raw.y)
  return Number.isFinite(k) && k > 0 && Number.isFinite(x) && Number.isFinite(y) ? { k, x, y } : null
}

export function resolveProjectedRichMediaShellTransformFromGeometry(args: {
  rect: { left: number; top: number; width: number; height: number }
  nodeTopLeft: { x: number; y: number }
  panelSize: { width: number; height: number }
  screenOrigin?: { left: number; top: number } | null
}): { k: number; x: number; y: number } | null {
  const kx = args.rect.width / args.panelSize.width
  const ky = args.rect.height / args.panelSize.height
  const k = Number.isFinite(kx) && kx > 0 ? kx : (Number.isFinite(ky) && ky > 0 ? ky : null)
  if (k == null) return null
  const originLeft = Number.isFinite(args.screenOrigin?.left) ? Number(args.screenOrigin?.left) : 0
  const originTop = Number.isFinite(args.screenOrigin?.top) ? Number(args.screenOrigin?.top) : 0
  const x = args.rect.left - originLeft - args.nodeTopLeft.x * k
  const y = args.rect.top - originTop - args.nodeTopLeft.y * k
  return Number.isFinite(x) && Number.isFinite(y) ? { k, x, y } : null
}

export function readProjectedRichMediaShellTransform(args: {
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  baseGraphData: GraphData | null
  screenOrigin?: { left: number; top: number } | null
}): { k: number; x: number; y: number } | null {
  if (typeof document === 'undefined') return null
  const graphData = args.draftGraphDataRef.current || useGraphStore.getState().graphData || args.baseGraphData || null
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const readNodeForOverlayId = (overlayId: string) => {
    return resolveGraphNodeByCanonicalId({ ...graphData, nodes }, overlayId)
  }
  const shells = Array.from(document.querySelectorAll<HTMLElement>('[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id]'))
  for (const shell of shells) {
    const rect = shell.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0)) continue
    const node = readNodeForOverlayId(shell.dataset.nodeId)
    const nodeX = typeof node?.x === 'number' && Number.isFinite(node.x) ? node.x : null
    const nodeY = typeof node?.y === 'number' && Number.isFinite(node.y) ? node.y : null
    if (nodeX == null || nodeY == null) continue
    const properties = isRecord(node?.properties) ? node.properties : null
    const stableSize = readStableRichMediaPanelSize(properties)
    const panelWidth = stableSize?.w || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width
    const panelHeight = stableSize?.h || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height
    const transform = resolveProjectedRichMediaShellTransformFromGeometry({
      rect,
      nodeTopLeft: { x: nodeX, y: nodeY },
      panelSize: { width: panelWidth, height: panelHeight },
      screenOrigin: args.screenOrigin,
    })
    if (transform) return transform
  }
  return null
}

export function readResolvedStoryboardWidgetDropTransform(args: {
  getLiveZoomTransform: () => { k: number; x: number; y: number } | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  baseGraphData: GraphData | null
  allowNeutralFallback?: boolean
  useProjectedRichMediaShell?: boolean
  screenOrigin?: { left: number; top: number } | null
}): { k: number; x: number; y: number } | null {
  const st = useGraphStore.getState()
  const liveTransform = normalizeStoryboardWidgetDropTransform(args.getLiveZoomTransform())
  const persistedTransform = normalizeStoryboardWidgetDropTransform(getEffectiveZoomStateForKey({
    zoomViewKey: args.zoomViewKeyRef.current,
    zoomStateByKey: st.zoomStateByKey,
    zoomState: st.zoomState,
  }))
  const liveIsNeutral = !!liveTransform && Math.abs(liveTransform.k - 1) <= 1e-3 && Math.abs(liveTransform.x) <= 0.5 && Math.abs(liveTransform.y) <= 0.5
  const projectedTransform = args.useProjectedRichMediaShell === true
    ? readProjectedRichMediaShellTransform({
        draftGraphDataRef: args.draftGraphDataRef,
        baseGraphData: args.baseGraphData,
        screenOrigin: args.screenOrigin,
      })
    : null
  if (liveTransform && !liveIsNeutral) return liveTransform
  if (projectedTransform) return projectedTransform
  if (persistedTransform) return persistedTransform
  if (liveTransform && args.allowNeutralFallback === true) return liveTransform
  if (args.allowNeutralFallback === true) return { k: 1, x: 0, y: 0 }
  return null
}

export type StoryboardWidgetDropCameraAuthority = {
  zoomViewKey: string
  transform: { k: number; x: number; y: number }
}

export function captureStoryboardWidgetDropCameraAuthority(args: {
  getLiveZoomTransform: () => { k: number; x: number; y: number } | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  baseGraphData: GraphData | null
  screenOrigin?: { left: number; top: number } | null
}): StoryboardWidgetDropCameraAuthority | null {
  const transform = readResolvedStoryboardWidgetDropTransform({
    ...args,
    allowNeutralFallback: true,
    useProjectedRichMediaShell: true,
  })
  if (!transform) return null
  return {
    zoomViewKey: String(args.zoomViewKeyRef.current || '').trim(),
    transform,
  }
}

export function restoreStoryboardWidgetDropCameraAuthority(args: {
  authority: StoryboardWidgetDropCameraAuthority | null
  zoomViewKeyRef: React.MutableRefObject<string | null>
  requestBalancedLayout?: boolean
}): void {
  const authority = args.authority
  if (!authority) return
  const currentZoomViewKey = String(args.zoomViewKeyRef.current || '').trim()
  if (authority.zoomViewKey && currentZoomViewKey && authority.zoomViewKey !== currentZoomViewKey) return
  const store = useGraphStore.getState()
  const zoomState = {
    ...authority.transform,
    graphDataRevision: store.graphDataRevision,
  }
  store.setZoomState(zoomState)
  if (authority.zoomViewKey) store.setZoomStateForKey(authority.zoomViewKey, zoomState)
  if (args.requestBalancedLayout === true) store.requestStoryboardWidgetLayoutRebalance()
  store.requestZoomTransform(authority.transform)
}

export function snapToGridPx(value: number, stepPx: number): number {
  if (!Number.isFinite(value)) return 0
  const step = Number.isFinite(stepPx) ? Math.max(1, Math.floor(stepPx)) : 1
  if (step <= 1) return value
  return Math.round(value / step) * step
}

export function readWidgetGridLayoutSettings(schema: unknown): {
  gridEnabled: boolean
  stepPx: number
  gapPx: number
} {
  const behavior =
    schema && typeof schema === 'object' && !Array.isArray(schema)
      ? ((schema as { behavior?: unknown }).behavior as Record<string, unknown> | undefined)
      : undefined
  const snapGrid =
    behavior && typeof behavior.snapGrid === 'object' && behavior.snapGrid !== null
      ? (behavior.snapGrid as Record<string, unknown>)
      : null
  const canvasGrid =
    behavior && typeof behavior.canvasGrid === 'object' && behavior.canvasGrid !== null
      ? (behavior.canvasGrid as Record<string, unknown>)
      : null
  const snapEnabled = snapGrid?.enabled === true
  const canvasEnabled = canvasGrid?.enabled === true
  const gridEnabled = snapEnabled || canvasEnabled
  const snapSize = Math.max(6, Math.min(160, readSnapGridScalarSize(snapGrid?.size)))
  const majorEveryRaw = typeof canvasGrid?.majorEvery === 'number' && Number.isFinite(canvasGrid.majorEvery) ? canvasGrid.majorEvery : 5
  const majorEvery = Math.max(2, Math.min(20, Math.floor(majorEveryRaw)))
  const stepPx = gridEnabled ? (snapEnabled ? snapSize : Math.max(8, Math.min(200, snapSize * majorEvery))) : 1
  const gapPx = gridEnabled ? Math.max(12, Math.min(80, Math.round(stepPx * 0.8))) : 12
  return { gridEnabled, stepPx, gapPx }
}

export function deriveStoryboardWidgetViewGraph(args: {
  graphData: GraphData | null
  collapsedGroupIds: string[]
  forceFrontmatterFlow?: boolean
}): GraphData | null {
  const base = args.graphData
  if (!base) return null
  const filteredByPolicy = args.forceFrontmatterFlow === true ? filterGraphToFlowWidgetEligible(base) : base
  const filtered = (() => {
    if (args.forceFrontmatterFlow !== true || !isFrontmatterFlowGraph(filteredByPolicy)) return filteredByPolicy
    const frontmatterOverlayNodeIds = deriveFrontmatterFlowOverlayNodeIds(filteredByPolicy)
    if (frontmatterOverlayNodeIds.length === 0) return filteredByPolicy
    return filterGraphByIncludedNodeIds({
      graphData: filteredByPolicy,
      includedNodeIds: frontmatterOverlayNodeIds,
    })
  })()
  if (!Array.isArray(args.collapsedGroupIds) || args.collapsedGroupIds.length === 0) return filtered
  return deriveGraphDataWithGroupCollapse({
    graphData: filtered,
    collapsedGroupIds: args.collapsedGroupIds,
  })
}

export function deriveStoryboardCanvasRichMediaPanelNodeIds(graphData: GraphData | null | undefined): string[] {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const out: string[] = []
  for (const node of nodes) {
    const id = String(node?.id || '').trim()
    if (!id) continue
    if (String(node?.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) continue
    const properties = isRecord(node.properties) ? node.properties : {}
    if (properties[STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY] === true) out.push(id)
  }
  return out
}

export function deriveSelectedOverlayEditorNodeIdForDerivation(args: {
  overlayDraftNode?: GraphNode | null
  pendingOverlayNode?: GraphNode | null
  pendingOverlayNodeId?: string | null
  renderGraphDataOverride: GraphData | null
  lastStableRenderGraphDataOverride: GraphData | null
  nodeById: ReadonlyMap<string, GraphNode>
  storyboardWidgetSurfaceId: string
}): string | null {
  const selectedNodeId = String(args.overlayDraftNode?.id || args.pendingOverlayNode?.id || args.pendingOverlayNodeId || '').trim()
  if (!selectedNodeId) return null
  if (String(args.storyboardWidgetSurfaceId || '').trim() !== 'storyboard') return selectedNodeId
  const pendingId = String(args.pendingOverlayNode?.id || '').trim()
  const node = args.pendingOverlayNode && pendingId === selectedNodeId
    ? args.pendingOverlayNode
    : args.nodeById.get(selectedNodeId)
      || resolveGraphNodeByCanonicalId(args.renderGraphDataOverride, selectedNodeId)
      || resolveGraphNodeByCanonicalId(args.lastStableRenderGraphDataOverride, selectedNodeId)
  return isRichMediaPanelNode(node) ? null : selectedNodeId
}

function isStoryboardWidgetOverlayExcludedNode(node: GraphNode | null | undefined): boolean {
  return String(node?.type || '') === 'Section'
}

export function deriveOpenWidgetOverlayNodeIds(args: {
  graphData: GraphData | null | undefined
  openWidgetNodeIds: ReadonlyArray<string> | null | undefined
  allowExplicitOpenWidgetNodeIds?: boolean
  eligibleNodeIds?: ReadonlySet<string> | null | undefined
  nodeById?: ReadonlyMap<string, GraphNode> | null | undefined
  selectedNodeId?: string | null | undefined
}): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  const eligibleNodeIds = args.eligibleNodeIds || null
  const nodeById = args.nodeById || null

  const canIncludeNodeId = (id: string, explicitOpen: boolean): boolean => {
    if (!id || seen.has(id)) return false
    const allowExplicitOpen = explicitOpen && args.allowExplicitOpenWidgetNodeIds === true
    if (eligibleNodeIds && eligibleNodeIds.size > 0 && !eligibleNodeIds.has(id) && !allowExplicitOpen) return false
    const node = nodeById?.get(id) || null
    if (isStoryboardWidgetOverlayExcludedNode(node)) return false
    if (node && !isFlowWidgetOverlayEligibleNode(node) && !allowExplicitOpen) return false
    return true
  }

  const pushResolvedOverlayNodeId = (rawId: unknown, explicitOpen: boolean) => {
    const resolvedId = resolveGraphNodeIdByCanonicalId(args.graphData, rawId)
    const id = resolvedId || String(rawId || '').trim()
    if (!canIncludeNodeId(id, explicitOpen)) return
    seen.add(id)
    next.push(id)
  }

  const openWidgetNodeIds = Array.isArray(args.openWidgetNodeIds) ? args.openWidgetNodeIds : []
  const explicitOpenWidgetNodeIds = openWidgetNodeIds.length > 0 || args.allowExplicitOpenWidgetNodeIds !== true
    ? openWidgetNodeIds
    : (Array.isArray(args.graphData?.nodes) ? (args.graphData.nodes as GraphNode[]).map(node => String(node?.id || '').trim()).filter(Boolean) : [])
  for (let i = 0; i < explicitOpenWidgetNodeIds.length; i += 1) {
    pushResolvedOverlayNodeId(explicitOpenWidgetNodeIds[i], true)
  }

  const selectedNodeId = String(args.selectedNodeId || '').trim()
  if (selectedNodeId) pushResolvedOverlayNodeId(selectedNodeId, false)
  return next
}

type StoryboardWidgetOverlayProps = {
  visible?: boolean
  active: boolean
  storyboardWidgetSurfaceId?: string
  editorSurfaceKind?: WidgetEditorSurfaceKind
  overlayCollectiveCount?: number
  node: GraphNode
  nodeById?: ReadonlyMap<string, GraphNode>
  graphMetaKind?: string | null
  graphMetaKey?: string | null
  portHandleEdges?: ReadonlyArray<GraphEdge>
  registryEntries?: ReadonlyArray<WidgetRegistryEntry>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  viewportW: number
  viewportH: number
  canvasWindowOffset: { left: number; top: number }
  zoomViewKey: string | null
  autoRevealKey?: number
  stackIndex?: number
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  toolMode: ToolMode
  pendingEdgeSourceId: string | null
  onBeginAddEdgeFromNode: (nodeId: string, portKey?: string | null) => void
  onFinalizeAddEdgeToNode: (nodeId: string, portKey?: string | null) => void
  onSetLabel: (label: string) => void
  onSetType: (type: string) => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onValidate: () => void
  onRun: () => void
  onDuplicate: () => void
  onRemove: () => void
  onClearOutput: () => void
  onHelp: () => void
  onConvertToLoopNode: () => void
  onEnableHandlesForAllInputs: () => void
  onUpdateKvEntry?: () => void
  onPinnedInCanvasChange: (pinnedInCanvas: boolean) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
}

export const StoryboardWidgetOverlay = React.memo(function StoryboardWidgetOverlay(args: StoryboardWidgetOverlayProps) {
  return (
    <FlowWidgetOverlay
      visible={args.visible}
      active={args.active}
      storyboardWidgetSurfaceId={args.storyboardWidgetSurfaceId}
      editorSurfaceKind={args.editorSurfaceKind}
      overlayCollectiveCount={args.overlayCollectiveCount}
      node={args.node}
      nodeById={args.nodeById}
      graphMetaKind={args.graphMetaKind}
      graphMetaKey={args.graphMetaKey}
      portHandleEdges={args.portHandleEdges}
      registryEntries={args.registryEntries}
      connectedValuesBySchemaPath={args.connectedValuesBySchemaPath}
      toolMode={args.toolMode}
      pendingEdgeSourceId={args.pendingEdgeSourceId}
      zoomViewKey={args.zoomViewKey}
      onBeginAddEdgeFromNode={args.onBeginAddEdgeFromNode}
      onFinalizeAddEdgeToNode={args.onFinalizeAddEdgeToNode}
      viewportW={args.viewportW}
      viewportH={args.viewportH}
      canvasWindowOffset={args.canvasWindowOffset}
      autoRevealKey={args.autoRevealKey}
      stackIndex={args.stackIndex}
      getLiveNodeWorldPos={args.getLiveNodeWorldPos}
      getLiveZoomTransform={args.getLiveZoomTransform}
      getLiveContainmentGroupAabbForNode={args.getLiveContainmentGroupAabbForNode}
      onSetLabel={args.onSetLabel}
      onSetType={args.onSetType}
      onPatchProperties={args.onPatchProperties}
      onSetProperties={args.onSetProperties}
      onValidate={args.onValidate}
      onRun={args.onRun}
      onDuplicate={args.onDuplicate}
      onRemove={args.onRemove}
      onClearOutput={args.onClearOutput}
      onHelp={args.onHelp}
      onConvertToLoopNode={args.onConvertToLoopNode}
      onEnableHandlesForAllInputs={args.onEnableHandlesForAllInputs}
      onUpdateKvEntry={args.onUpdateKvEntry}
      onPinnedInCanvasChange={args.onPinnedInCanvasChange}
      onRenameSchemaFieldId={args.onRenameSchemaFieldId}
    />
  )
})
