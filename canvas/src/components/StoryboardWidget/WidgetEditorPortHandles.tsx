import React from 'react'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import type { GraphEdge } from '@/lib/graph/types'
import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { FLOW_HANDLE_DEFAULT_EDGE_ID, computeFlowHandlesByNode, ensureFlowHandlesHaveDefaults, parseFlowHandleKey, resolveRichMediaFlowPortPriority } from '@/components/FlowCanvas/handles'
import { shouldInjectDefaultFlowHandles } from '@/lib/graph/portHandlesBehavior'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { PORT_HANDLE_LINE_CLASS, PORT_HANDLE_MIN_INTERACTIVE_SIZE_PX, PORT_HANDLE_STROKE_CLASS, readPortHandleUiMetrics } from '@/components/StoryboardWidget/portHandleUi'
import { getNodeRectDimensions2d } from '@/components/GraphCanvas/nodeSizing2d'
import { shouldRenderNodePortHandleAsDot } from '@/components/GraphCanvas/portHandlesConfig'
import { formatFlowHandleSemanticKey, readFlowHandlePath } from '@/lib/graph/flowHandlePresentation'
import { hashArrayOfObjectsSignature, hashRecordSignature32, hashSignatureParts } from '@/lib/hash/signature'
import { startFlowPortHandleMouseDrag, startFlowPortHandlePointerDrag } from '@/components/StoryboardWidget/flowPortHandlePointerDrag'
import { Z_INDEX_GRAPH_OVERLAY_SELECTED } from '@/lib/ui/zIndex'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'

type StoryboardWidgetToolMode = 'select' | 'addEdge'

const FLOW_PORT_TYPES_KEY = 'flow:portTypes' as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pickString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function readFlowPortSocketType(nodeProps: unknown, dir: 'in' | 'out', portKey: string): string {
  const pk = pickString(portKey)
  if (!pk) return ''
  const props = (nodeProps || {}) as Record<string, unknown>
  const portTypes = props[FLOW_PORT_TYPES_KEY]
  if (!isRecord(portTypes)) return ''
  const bucket = portTypes[dir]
  if (!isRecord(bucket)) return ''
  return pickString(bucket[pk])
}

export function orderFlowPortHandlesByCenterPriority<T extends { topPct: number; id?: string }>(handles: ReadonlyArray<T> | null | undefined): T[] {
  const list = Array.isArray(handles) ? handles.filter(Boolean) : []
  return list
    .map((handle, index) => ({ handle, index }))
    .sort((a, b) => {
      const centerDistance = Math.abs(Number(a.handle.topPct) - 50) - Math.abs(Number(b.handle.topPct) - 50)
      if (Number.isFinite(centerDistance) && centerDistance !== 0) return centerDistance
      const vertical = Number(a.handle.topPct) - Number(b.handle.topPct)
      if (Number.isFinite(vertical) && vertical !== 0) return vertical
      return a.index - b.index
    })
    .map(entry => entry.handle)
}

export function selectCenteredFlowPortHandle<T extends { topPct: number; id?: string }>(
  handles: ReadonlyArray<T> | null | undefined,
): T[] {
  const centered = orderFlowPortHandlesByCenterPriority(handles)[0]
  return centered ? [{ ...centered, topPct: 50 }] : []
}

function selectPreferredFlowPortHandle<T extends { topPct: number; id?: string }>(
  handles: ReadonlyArray<T> | null | undefined,
): T[] {
  const preferred = Array.isArray(handles) ? handles.find(Boolean) : null
  return preferred ? [{ ...preferred, topPct: 50 }] : []
}

function coerceEdgeEndpoints(raw: ReadonlyArray<GraphEdge>): Array<{ id: string; source: string; target: string; properties?: unknown }> {
  const out: Array<{ id: string; source: string; target: string; properties?: unknown }> = []
  for (let i = 0; i < raw.length; i += 1) {
    const e = raw[i] as unknown as { id?: unknown; source?: unknown; target?: unknown; properties?: unknown }
    const id = String(e?.id || '').trim()
    const { src: source, tgt: target } = readGraphEdgeEndpoints(e)
    if (!id || !source || !target) continue
    out.push({ id, source, target, properties: e.properties })
  }
  return out
}

export const WidgetEditorPortHandles = React.memo(function WidgetEditorPortHandles(args: {
  active: boolean
  node: Pick<GraphNode, 'id' | 'type' | 'properties'>
  schema: GraphSchema | null
  registryEntries?: ReadonlyArray<WidgetRegistryEntry>
  edges: ReadonlyArray<GraphEdge>
  forceEnabled?: boolean
  inputOnly?: boolean
  outputOnly?: boolean
  strictHandleSet?: boolean
  toolMode?: StoryboardWidgetToolMode
  pendingEdgeSourceId?: string | null
  onBeginAddEdgeFromNode?: (nodeId: string, portKey?: string | null) => void
  onFinalizeAddEdgeToNode?: (nodeId: string, portKey?: string | null) => void
}) {
  const edgeConnectivitySignature = React.useMemo(() => {
    return hashArrayOfObjectsSignature(
      (Array.isArray(args.edges) ? args.edges : []).map(e => {
        const props =
          e && typeof e === 'object' && !Array.isArray(e)
            ? ((e as { properties?: unknown }).properties as Record<string, unknown> | null | undefined)
            : null
        const { src: source, tgt: target } = readGraphEdgeEndpoints(e)
        return {
          id: String((e as { id?: unknown })?.id || '').trim(),
          source,
          target,
          sourcePortKey:
            typeof props?.[FLOW_EDGE_SOURCE_PORT_KEY] === 'string'
              ? String(props?.[FLOW_EDGE_SOURCE_PORT_KEY] || '').trim()
              : '',
          targetPortKey:
            typeof props?.[FLOW_EDGE_TARGET_PORT_KEY] === 'string'
              ? String(props?.[FLOW_EDGE_TARGET_PORT_KEY] || '').trim()
              : '',
        }
      }),
      { maxItems: Math.max(24, Array.isArray(args.edges) ? args.edges.length : 0), maxKeysPerItem: 5 },
    )
  }, [args.edges])
  const coerceEdgeEndpointsSnapshotRef = React.useRef<{
    key: string
    value: Array<{ id: string; source: string; target: string; properties?: unknown }>
  } | null>(null)
  if (coerceEdgeEndpointsSnapshotRef.current?.key !== edgeConnectivitySignature) {
    coerceEdgeEndpointsSnapshotRef.current = {
      key: edgeConnectivitySignature,
      value: coerceEdgeEndpoints(args.edges),
    }
  }
  const edges = coerceEdgeEndpointsSnapshotRef.current.value
  const socketTypes = useGraphStore(s => (s.graphData?.metadata as Record<string, unknown> | null | undefined)?.socketTypes)
  const socketStyleByType = React.useMemo(() => {
    if (!isRecord(socketTypes)) return new Map<string, { color: string }>()
    const m = new Map<string, { color: string }>()
    for (const k of Object.keys(socketTypes)) {
      const spec = socketTypes[k]
      if (!isRecord(spec)) continue
      const color = pickString(spec.color)
      if (!color) continue
      m.set(String(k || ''), { color })
    }
    return m
  }, [socketTypes])

  const nodeId = React.useMemo(() => String(args.node?.id || '').trim(), [args.node?.id])
  const nodePropertiesSignature = React.useMemo(() => {
    return hashRecordSignature32(args.node?.properties || null, {
      maxEntries: 80,
      maxDepth: 2,
    })
  }, [args.node?.properties])
  const registryEntriesSignature = React.useMemo(() => {
    const entries = Array.isArray(args.registryEntries) ? args.registryEntries : []
    return hashArrayOfObjectsSignature(
      entries.map(entry => ({
        id: String(entry?.id || '').trim(),
        nodeTypeId: String(entry?.nodeTypeId || '').trim(),
        widgetTypeId: String(entry?.widgetTypeId || '').trim(),
        formId: String(entry?.formId || '').trim(),
        updatedAt: String(entry?.updatedAt || '').trim(),
        portsSignature: hashSignatureParts([
          'ports',
          ...(Array.isArray(entry?.ports) ? entry.ports.flatMap(port => [
            String(port?.direction || '').trim(),
            String(port?.portKey || '').trim(),
            port?.isHidden === true ? '1' : '0',
          ]) : []),
        ]),
      })),
      { maxItems: Math.max(24, entries.length), maxKeysPerItem: 6 },
    )
  }, [args.registryEntries])
  const registryEntriesSnapshotRef = React.useRef<{ key: string; value: ReadonlyArray<WidgetRegistryEntry> } | null>(null)
  if (registryEntriesSnapshotRef.current?.key !== registryEntriesSignature) {
    registryEntriesSnapshotRef.current = {
      key: registryEntriesSignature,
      value: Array.isArray(args.registryEntries) ? args.registryEntries : [],
    }
  }
  const registryEntriesSnapshot = registryEntriesSnapshotRef.current.value

  const handles = React.useMemo(() => {
    if (!nodeId) return { in: [], out: [] }
    const byNode = computeFlowHandlesByNode({
      nodes: [{ id: nodeId, type: args.node?.type, properties: args.node?.properties }],
      edges,
      widgetRegistry: registryEntriesSnapshot,
    })
    const base = byNode[nodeId] || { in: [], out: [] }
    if (args.strictHandleSet === true) return base
    if (args.forceEnabled !== true && !shouldInjectDefaultFlowHandles(args.schema)) return base
    return ensureFlowHandlesHaveDefaults(base)
  }, [
    args.forceEnabled,
    args.node?.properties,
    args.node?.type,
    args.schema,
    args.strictHandleSet,
    edges,
    nodeId,
    registryEntriesSnapshot,
  ])

  const nodeDims = React.useMemo(() => {
    const n = {
      id: String(args.node?.id || ''),
      type: args.node?.type,
      properties: args.node?.properties,
    } as unknown as GraphNode
    return getNodeRectDimensions2d(n, args.schema || ({ behavior: {} } as GraphSchema))
  }, [args.node?.id, args.node?.properties, args.node?.type, args.schema])
  const suppressNextPointerClickRef = React.useRef(false)

  const enabled = args.forceEnabled === true || Boolean(args.schema?.behavior?.portHandles?.enabled)
  if (!enabled) return null
  if (!nodeId) return null

  const { sizePx, hitSizePx, railWidthPx } = readPortHandleUiMetrics(args.schema, {
    nodeWidth: nodeDims.width,
    nodeHeight: nodeDims.height,
  })
  const edgeDotHitOffsetPx = sizePx
  const renderDot = shouldRenderNodePortHandleAsDot(sizePx)

  const isAddEdge = args.toolMode === 'addEdge'
  const isSource = isAddEdge && isCanonicalNodeIdEqual(args.pendingEdgeSourceId, nodeId)

  const canClickHandle = (dir: 'in' | 'out'): boolean => {
    if (!args.active) return false
    if (args.toolMode !== 'addEdge') return dir === 'out'
    const pending = String(args.pendingEdgeSourceId || '').trim()
    if (!pending) return dir === 'out'
    if (isCanonicalNodeIdEqual(pending, nodeId)) return dir === 'out'
    return true
  }

  const handleClick = (dir: 'in' | 'out', portKey: string) => {
    if (!args.active) return
    const pk = String(portKey || '').trim()
    if (!pk) return
    if (args.toolMode !== 'addEdge') {
      if (dir !== 'out') return
      args.onBeginAddEdgeFromNode?.(nodeId, pk)
      return
    }

    if (!args.pendingEdgeSourceId) {
      if (dir !== 'out') return
      args.onBeginAddEdgeFromNode?.(nodeId, pk)
      return
    }

    if (isCanonicalNodeIdEqual(args.pendingEdgeSourceId, nodeId)) {
      if (dir === 'in') return
      args.onBeginAddEdgeFromNode?.(nodeId, pk)
      return
    }

    if (dir !== 'in') {
      args.onBeginAddEdgeFromNode?.(nodeId, pk)
      return
    }

    args.onFinalizeAddEdgeToNode?.(nodeId, pk)
  }

  const Dot = (p: { handleId: string; dir: 'in' | 'out'; idx: number; topPct: number }) => {
    const isIn = p.dir === 'in'
    const portKey = parseFlowHandleKey(p.handleId as never)
    const handlePath = readFlowHandlePath(p.dir)
    const semanticKey = formatFlowHandleSemanticKey({ dir: p.dir, portKey })
    const defaultAria = isIn ? `Input handle ${p.idx + 1}` : `Output handle ${p.idx + 1}`
    const aria = semanticKey && portKey !== FLOW_HANDLE_DEFAULT_EDGE_ID ? semanticKey : defaultAria
    const ringClass = isSource ? `ring-2 ring-inset ${UI_THEME_TOKENS.button.ring}` : ''
    const clickable = canClickHandle(p.dir)
    const hoverClass = clickable ? 'hover:opacity-100' : 'opacity-90'
    const cursorClass = clickable ? 'cursor-pointer' : 'cursor-default'
    const socketType = readFlowPortSocketType(args.node?.properties, p.dir, portKey)
    const stroke = socketType ? socketStyleByType.get(socketType)?.color || '' : ''

    return (
      <button
        type="button"
        aria-label={aria}
        title={aria}
        data-kg-port-handle="1"
        data-kg-port-handle-kind="rail"
        data-kg-port-dir={p.dir}
        data-kg-port-node-id={nodeId}
        data-kg-port-key={parseFlowHandleKey(p.handleId as never)}
        data-kg-port-path={handlePath}
        className={cn('absolute pointer-events-auto', cursorClass)}
        style={{
          top: `${Math.max(0, Math.min(100, p.topPct))}%`,
          width: `${railWidthPx + edgeDotHitOffsetPx}px`,
          height: `${hitSizePx}px`,
          minWidth: `${PORT_HANDLE_MIN_INTERACTIVE_SIZE_PX}px`,
          minHeight: `${PORT_HANDLE_MIN_INTERACTIVE_SIZE_PX}px`,
          transform: 'translateY(-50%)',
          ...(isIn ? { left: `-${edgeDotHitOffsetPx}px` } : { right: `-${edgeDotHitOffsetPx}px` }),
        }}
        onPointerDown={e => {
          try {
            e.stopPropagation()
          } catch {
            void 0
          }
          try {
            e.preventDefault()
          } catch {
            void 0
          }
          if (!clickable) return
          const startedDrag =
            p.dir === 'out'
              ? startFlowPortHandlePointerDrag({ event: e, sourceNodeId: nodeId, sourcePortKey: parseFlowHandleKey(p.handleId as never) })
              : false
          if (p.dir === 'out' && !startedDrag) return
          suppressNextPointerClickRef.current = true
          handleClick(p.dir, parseFlowHandleKey(p.handleId as never))
        }}
        onMouseDown={e => {
          try {
            e.stopPropagation()
          } catch {
            void 0
          }
          try {
            e.preventDefault()
          } catch {
            void 0
          }
          if (!clickable) return
          const startedDrag =
            p.dir === 'out'
              ? startFlowPortHandleMouseDrag({ event: e, sourceNodeId: nodeId, sourcePortKey: parseFlowHandleKey(p.handleId as never) })
              : false
          if (p.dir === 'out' && !startedDrag) return
          suppressNextPointerClickRef.current = true
          handleClick(p.dir, parseFlowHandleKey(p.handleId as never))
        }}
        onClick={e => {
          try {
            e.stopPropagation()
          } catch {
            void 0
          }
          if (e.detail !== 0 && suppressNextPointerClickRef.current) {
            suppressNextPointerClickRef.current = false
            return
          }
          handleClick(p.dir, parseFlowHandleKey(p.handleId as never))
        }}
        disabled={!clickable}
      >
        <span
          aria-hidden={true}
          className={cn(
            'absolute top-1/2 rounded-full border',
            renderDot ? PORT_HANDLE_LINE_CLASS : UI_THEME_TOKENS.panel.bg,
            renderDot ? 'border-transparent' : PORT_HANDLE_STROKE_CLASS,
            ringClass,
            hoverClass,
          )}
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            transform: isIn ? 'translate(-50%, -50%)' : 'translate(50%, -50%)',
            ...(isIn ? { left: `${edgeDotHitOffsetPx}px` } : { right: `${edgeDotHitOffsetPx}px` }),
            ...(renderDot ? { borderWidth: '0px', backgroundColor: stroke || undefined } : stroke ? { borderColor: stroke } : {}),
          }}
        />
      </button>
    )
  }

  const richMediaProperties = readGraphNodeProperties(args.node)
  const hasSemanticRichMediaPort = String(args.node?.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    && resolveRichMediaFlowPortPriority(richMediaProperties?.richMediaActiveTab).length > 0
  const selectOuterHandle = hasSemanticRichMediaPort
    ? selectPreferredFlowPortHandle
    : selectCenteredFlowPortHandle
  const inputHandles = args.outputOnly === true ? [] : selectOuterHandle(handles.in)
  const outputHandles = args.inputOnly === true ? [] : selectOuterHandle(handles.out)
  const hasAny = (inputHandles?.length || 0) + (outputHandles?.length || 0) > 0
  if (!hasAny) return null
  const outputHandlesByCenterPriority = orderFlowPortHandlesByCenterPriority(outputHandles)

  return (
    <nav
      className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}
      aria-label="Node port handles"
      style={{ zIndex: Z_INDEX_GRAPH_OVERLAY_SELECTED }}
    >
      <section className={cn('absolute inset-y-0 left-0', isSource ? 'opacity-100' : 'opacity-90')} style={{ width: `${railWidthPx}px` }}>
        {(inputHandles || []).map((h, idx) => (
          <Dot key={h.id} handleId={h.id} dir="in" idx={idx} topPct={h.topPct} />
        ))}
      </section>
      <section className={cn('absolute inset-y-0 right-0', isSource ? 'opacity-100' : 'opacity-90')} style={{ width: `${railWidthPx}px` }}>
        {outputHandlesByCenterPriority.map((h, idx) => (
          <Dot key={h.id} handleId={h.id} dir="out" idx={idx} topPct={h.topPct} />
        ))}
      </section>
    </nav>
  )
})
