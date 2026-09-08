import { getObjectPath, setObjectPath } from '@/lib/data/objectPath'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
} from '@/lib/graph/flowPorts'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { readRecordPathValue, unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { applyFlowDataflowReducer, applyFlowDataflowTransform } from '@/lib/storyboardWidget/flowDataflowTransforms'
import { isFrontmatterFlowComputedEnabled } from '@/lib/graph/frontmatterFlowSettings'
import { readFlowComputeSource, runFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'
import { runRegisteredFlowWidgetCompute } from '@/lib/storyboardWidget/widgetComputeRegistry'
import { buildTextWidgetOutputSrcDoc } from '@/lib/render/widgetOutputSrcDoc'
import { hashRecordSignature32 } from '@/lib/hash/signature'
import { buildBoundedFlowCacheKey, createFlowConnectedValuesCache } from './flowConnectedValuesCache'
import { isPlainObject } from '@/lib/graph/value'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'

export type FlowConnectedValueSource = {
  edgeId: string
  nodeId: string
  portKey: string
}
export type FlowConnectedValue = {
  value: unknown
  sources: ReadonlyArray<FlowConnectedValueSource>
}
export type FlowConnectedValuesBySchemaPath = Record<string, FlowConnectedValue>
const connectedValuesCache = createFlowConnectedValuesCache<Map<string, FlowConnectedValuesBySchemaPath>>()
function cleanString(v: unknown): string {
  const scalar = unwrapGraphCellValue(v)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

const readPlainObject = (value: unknown): Record<string, unknown> | null => {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null
}
const readPersistedPropertyObject = (value: unknown): Record<string, unknown> | null => {
  const raw = readPlainObject(value)
  if (!raw) return null
  const logical = Object.prototype.hasOwnProperty.call(raw, 'value')
    && (Object.prototype.hasOwnProperty.call(raw, 'key') || Object.prototype.hasOwnProperty.call(raw, 'type'))
    ? unwrapGraphCellValue(raw)
    : raw
  return readPlainObject(logical)
}
function isStoppedFlowValue(value: unknown): boolean { return value == null }

function isMaterializedFlowOutputValue(value: unknown): boolean { return !isStoppedFlowValue(value) && (typeof value !== 'string' || value.trim().length > 0) }

function normalizeConnectedValuesTargetNodeIds(graph: GraphData, targetNodeIds?: ReadonlySet<string>): ReadonlySet<string> | undefined {
  if (!targetNodeIds || targetNodeIds.size === 0) return undefined
  return new Set(Array.from(targetNodeIds.values()).map(rawId => {
    const id = cleanString(rawId)
    return id ? cleanString(resolveGraphNodeByCanonicalId(graph, id)?.id) || id : ''
  }).filter(Boolean))
}

function normalizeSchemaPath(schemaPath: string | undefined, fallbackKey: string): string {
  const raw = String(schemaPath || fallbackKey || '').trim()
  if (!raw) return ''
  if (raw.startsWith('properties') || raw.startsWith('metadata') || raw.startsWith('label') || raw.startsWith('type')) return raw
  return `properties.${raw}`
}

function readNodeSchemaPathValue(node: GraphNode, pathRaw: string): unknown {
  const path = cleanString(pathRaw)
  if (!path) return undefined
  if (path === 'properties') return readGraphNodeProperties(node)
  if (path.startsWith('properties.')) {
    return readRecordPathValue(readGraphNodeProperties(node), path)
  }
  return unwrapGraphCellValue(getObjectPath(node, path))
}

function readFlowEdgePortKey(edge: GraphEdge, key: string): string {
  const props = readPersistedPropertyObject(edge?.properties)
  return cleanString(props?.[key])
}

function nodeIndex(nodes: ReadonlyArray<GraphNode>): Map<string, GraphNode> {
  const out = new Map<string, GraphNode>()
  for (const n of nodes) {
    const id = cleanString(n?.id)
    if (!id) continue
    out.set(id, n)
  }
  return out
}

function resolveRegistryEntryByNodeId(args: {
  nodes: ReadonlyArray<GraphNode>
  registry: ReadonlyArray<WidgetRegistryEntry>
}): Map<string, WidgetRegistryEntry | null> {
  const out = new Map<string, WidgetRegistryEntry | null>()
  for (const n of args.nodes) {
    const id = cleanString(n?.id)
    if (!id) continue
    out.set(id, resolveWidgetRegistryEntry({ node: n, registry: args.registry }) || null)
  }
  return out
}

function buildPortSchemaPathIndex(entry: WidgetRegistryEntry | null): {
  input: Map<string, string>
  output: Map<string, string>
  schemaMappings: ReadonlyArray<{ fromPath: string; toPath: string; transformId?: string; reduceId?: string }>
} {
  const input = new Map<string, string>()
  const output = new Map<string, string>()
  const ports = Array.isArray(entry?.ports) ? entry.ports : []
  for (const p of ports) {
    const portKey = cleanString(p?.portKey)
    if (!portKey) continue
    const path = normalizeSchemaPath(p?.schemaPath, portKey)
    if (!path) continue
    if (p.direction === 'input') input.set(portKey, path)
    if (p.direction === 'output') output.set(portKey, path)
  }
  const schemaMappings = (entry && Array.isArray(entry.schemaMappings) ? entry.schemaMappings : [])
    .map(m => ({
      fromPath: cleanString(m?.fromPath),
      toPath: cleanString(m?.toPath),
      transformId: cleanString((m as unknown as { transformId?: unknown })?.transformId) || undefined,
      reduceId: cleanString((m as unknown as { reduceId?: unknown })?.reduceId) || undefined,
    }))
    .filter(m => m.fromPath && m.toPath)
  return { input, output, schemaMappings }
}

type EdgeConnection = {
  edgeId: string
  sourceId: string
  targetId: string
  sourcePortKey: string
  targetPortKey: string
}

type InboundValuesByPortKey = Map<string, Array<{ edgeId: string; sourceId: string; sourcePortKey: string; value: unknown }>>

type PortPathsByNodeId = Map<
  string,
  {
    input: Map<string, string>
    output: Map<string, string>
    schemaMappings: ReadonlyArray<{ fromPath: string; toPath: string; transformId?: string; reduceId?: string }>
  }
>

function collectConnections(edges: ReadonlyArray<GraphEdge>): EdgeConnection[] {
  const out: EdgeConnection[] = []
  for (const e of edges) {
    const edgeId = cleanString((e as unknown as { id?: unknown })?.id)
    const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(e)
    if (!edgeId || !sourceId || !targetId) continue
    const sourcePortKey = readFlowEdgePortKey(e, FLOW_EDGE_SOURCE_PORT_KEY)
    const targetPortKey = readFlowEdgePortKey(e, FLOW_EDGE_TARGET_PORT_KEY)
    if (!sourcePortKey || !targetPortKey) continue
    out.push({ edgeId, sourceId, targetId, sourcePortKey, targetPortKey })
  }
  return out
}

function buildTopologicalNodeOrder(args: {
  nodes: ReadonlyArray<GraphNode>
  connections: ReadonlyArray<EdgeConnection>
}): string[] | null {
  const nodeIds: string[] = []
  const orderByNodeId = new Map<string, number>()
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (let i = 0; i < args.nodes.length; i += 1) {
    const id = cleanString(args.nodes[i]?.id)
    if (!id || indegree.has(id)) continue
    orderByNodeId.set(id, nodeIds.length)
    nodeIds.push(id)
    indegree.set(id, 0)
    outgoing.set(id, [])
  }
  if (nodeIds.length === 0) return []
  for (const c of args.connections) {
    if (!indegree.has(c.sourceId) || !indegree.has(c.targetId)) continue
    outgoing.get(c.sourceId)!.push(c.targetId)
    indegree.set(c.targetId, (indegree.get(c.targetId) || 0) + 1)
  }

  const queue = nodeIds.filter(id => (indegree.get(id) || 0) === 0)
  const out: string[] = []
  while (queue.length > 0) {
    queue.sort((a, b) => (orderByNodeId.get(a) || 0) - (orderByNodeId.get(b) || 0))
    const id = queue.shift()!
    out.push(id)
    const targets = outgoing.get(id) || []
    for (const targetId of targets) {
      const next = (indegree.get(targetId) || 0) - 1
      indegree.set(targetId, next)
      if (next === 0) queue.push(targetId)
    }
  }
  return out.length === nodeIds.length ? out : null
}

function buildInboundValuesByNodeId(args: {
  connections: ReadonlyArray<EdgeConnection>
  byNodeId: Map<string, GraphNode>
  portPathsByNodeId: PortPathsByNodeId
  computedByNodeId: Map<string, FlowConnectedValuesBySchemaPath>
  targetNodeId?: string
}): Map<string, InboundValuesByPortKey> {
  const inboundByNodeId = new Map<string, InboundValuesByPortKey>()
  const targetNodeId = cleanString(args.targetNodeId)
  for (const c of args.connections) {
    if (targetNodeId && c.targetId !== targetNodeId) continue
    const sourceNode = args.byNodeId.get(c.sourceId)
    const targetNode = args.byNodeId.get(c.targetId)
    if (!sourceNode || !targetNode) continue
    const sourcePortPaths = args.portPathsByNodeId.get(c.sourceId)?.output || new Map()
    const value = computeOutputPortValue({
      nodeId: c.sourceId,
      node: sourceNode,
      outputPortPaths: sourcePortPaths,
      computedByNodeId: args.computedByNodeId,
      portKey: c.sourcePortKey,
    })
    if (isStoppedFlowValue(value)) continue

    if (!inboundByNodeId.has(c.targetId)) inboundByNodeId.set(c.targetId, new Map())
    const inbound = inboundByNodeId.get(c.targetId)!
    if (!inbound.has(c.targetPortKey)) inbound.set(c.targetPortKey, [])
    inbound.get(c.targetPortKey)!.push({ edgeId: c.edgeId, sourceId: c.sourceId, sourcePortKey: c.sourcePortKey, value })
  }
  return inboundByNodeId
}

function computeOutputPortValue(args: {
  nodeId: string
  node: GraphNode
  outputPortPaths: Map<string, string>
  computedByNodeId: Map<string, FlowConnectedValuesBySchemaPath>
  portKey: string
}): unknown {
  const path = args.outputPortPaths.get(args.portKey) || `properties.${args.portKey}`
  const computedDataPath = `properties.data.${args.portKey}`
  if (!args.outputPortPaths.has(args.portKey)) {
    const computedData = args.computedByNodeId.get(args.nodeId)?.[computedDataPath]
    if (computedData) return computedData.value
  }
  const computed = args.computedByNodeId.get(args.nodeId)?.[path]
  if (computed) return computed.value
  const direct = readNodeSchemaPathValue(args.node, path)
  const emptyOutputSrcDoc = path === 'properties.outputSrcDoc' && typeof direct === 'string' && !direct.trim()
  if (typeof direct !== 'undefined' && !emptyOutputSrcDoc) return direct
  if (!args.outputPortPaths.has(args.portKey)) {
    const directData = readNodeSchemaPathValue(args.node, computedDataPath)
    if (typeof directData !== 'undefined') return directData
  }
  if (path === 'properties.outputSrcDoc') {
    const output = readNodeSchemaPathValue(args.node, 'properties.output')
    if (typeof output === 'string' && output.trim()) {
      return buildTextWidgetOutputSrcDoc({
        title: args.node.label,
        text: output,
      })
    }
  }
  return direct
}

function buildConnectedValuesForNode(args: {
  node: GraphNode
  registryEntry?: WidgetRegistryEntry | null
  inbound: InboundValuesByPortKey
  inputPortPaths: Map<string, string>
  outputPortPaths: Map<string, string>
  schemaMappings: ReadonlyArray<{ fromPath: string; toPath: string; transformId?: string; reduceId?: string }>
  computeEnabled: boolean
  preserveMaterializedOutputs: boolean
}): FlowConnectedValuesBySchemaPath {
  const byPath: FlowConnectedValuesBySchemaPath = {}
  const inByPortKey: Record<string, unknown> = {}

  for (const [targetPortKey, items] of Array.from(args.inbound.entries())) {
    if (!items || items.length === 0) continue
    const schemaPath = args.inputPortPaths.get(targetPortKey) || normalizeSchemaPath(`properties.${targetPortKey}`, targetPortKey)
    if (schemaPath) {
      const sources = items.map(it => ({ edgeId: it.edgeId, nodeId: it.sourceId, portKey: it.sourcePortKey }))
      const value = items.length === 1 ? items[0].value : items.map(it => it.value)
      byPath[schemaPath] = { value, sources }
    }
    inByPortKey[targetPortKey] = items.length === 1 ? items[0].value : items.map(it => it.value)
  }

  if (args.schemaMappings.length > 0) {
    const context = {
      in: inByPortKey,
      node: {
        label: args.node.label,
        type: args.node.type,
        properties: readGraphNodeProperties(args.node),
        metadata: args.node.metadata || {},
      },
    }

    const allSources = Array.from(args.inbound.values())
      .flat()
      .map(it => ({ edgeId: it.edgeId, nodeId: it.sourceId, portKey: it.sourcePortKey }))

    for (const m of args.schemaMappings) {
      const raw = getObjectPath(context, m.fromPath)
      const reduced = m.reduceId && Array.isArray(raw) ? applyFlowDataflowReducer({ reduceId: m.reduceId, values: raw }) : raw
      const v = applyFlowDataflowTransform({ transformId: m.transformId, value: reduced })
      const toPath = normalizeSchemaPath(m.toPath, m.toPath)
      if (!toPath) continue
      if (typeof v === 'undefined') continue
      byPath[toPath] = { value: v, sources: allSources }
    }
  }

  const allSources = Array.from(args.inbound.values())
    .flat()
    .map(it => ({ edgeId: it.edgeId, nodeId: it.sourceId, portKey: it.sourcePortKey }))
  const hasMaterializedOutputPort = args.preserveMaterializedOutputs
    && Array.from(args.outputPortPaths.values()).some(path =>
      isMaterializedFlowOutputValue(readNodeSchemaPathValue(args.node, path)),
    )

  const applyComputedOutputs = (computed: Record<string, unknown>, allowUnregisteredOutputs: boolean): void => {
    for (const [portKeyRaw, value] of Object.entries(computed)) {
      const portKey = cleanString(portKeyRaw)
      if (!portKey) continue
      if (!allowUnregisteredOutputs && !args.outputPortPaths.has(portKey)) continue
      const toPath = args.outputPortPaths.get(portKey) || normalizeSchemaPath(`properties.data.${portKey}`, portKey)
      if (!toPath) continue
      if (typeof value === 'undefined') continue
      const materialized = readNodeSchemaPathValue(args.node, toPath)
      if (args.preserveMaterializedOutputs && isMaterializedFlowOutputValue(materialized)) continue
      byPath[toPath] = { value, sources: allSources }
    }
  }

  if (args.computeEnabled && !hasMaterializedOutputPort) {
    let effectiveProperties = { ...readGraphNodeProperties(args.node) }
    for (const [schemaPath, connected] of Object.entries(byPath)) {
      const normalizedPath = normalizeSchemaPath(schemaPath, schemaPath)
      if (!normalizedPath.startsWith('properties.')) continue
      if (typeof connected?.value === 'undefined') continue
      const nextNode = setObjectPath(
        { properties: effectiveProperties } as Record<string, unknown>,
        normalizedPath,
        connected.value,
      )
      const nextProps = readPlainObject((nextNode as Record<string, unknown>).properties)
      if (nextProps) effectiveProperties = nextProps
    }
    const registeredComputed = runRegisteredFlowWidgetCompute({
      node: args.node,
      registryEntry: args.registryEntry,
      properties: effectiveProperties,
    })
    if (registeredComputed) applyComputedOutputs(registeredComputed, false)
  }

  const computeSource = args.computeEnabled && !hasMaterializedOutputPort ? readFlowComputeSource(args.node) : ''
  if (computeSource) {
    const computed = runFlowComputeSource(computeSource, inByPortKey, {
      node: {
        id: args.node.id,
        type: args.node.type,
        label: args.node.label,
        properties: { ...readGraphNodeProperties(args.node) },
        metadata: args.node.metadata && typeof args.node.metadata === 'object' && !Array.isArray(args.node.metadata)
          ? { ...(args.node.metadata as Record<string, unknown>) }
          : {},
      },
      connectedValuesBySchemaPath: { ...byPath },
    })
    if (computed) {
      applyComputedOutputs(computed, true)
    }
  }

  return byPath
}

export function computeFlowConnectedValuesBySchemaPath(args: {
  graphData: GraphData | null
  registry: ReadonlyArray<WidgetRegistryEntry>
  targetNodeIds?: ReadonlySet<string>
  graphRevision?: number
  graphSemanticKey?: string
  preserveMaterializedOutputs?: boolean
}): Map<string, FlowConnectedValuesBySchemaPath> {
  const graph = args.graphData
  if (!graph) return new Map()
  const registry = Array.isArray(args.registry) ? args.registry : []
  const requestedTargets = normalizeConnectedValuesTargetNodeIds(graph, args.targetNodeIds)
  const cacheKey = buildBoundedFlowCacheKey([
    graph, registry, requestedTargets ? [...requestedTargets] : null,
    args.graphRevision, args.graphSemanticKey, args.preserveMaterializedOutputs !== false,
  ])
  const cached = connectedValuesCache.read(cacheKey)
  if (cached) return cached
  const computeEnabled = isFrontmatterFlowComputedEnabled(graph)
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []

  const byNodeId = nodeIndex(nodes)
  const registryByNodeId = resolveRegistryEntryByNodeId({ nodes, registry })

  const allConnections = collectConnections(edges)
  const includedNodeIds = (() => {
    if (!requestedTargets || requestedTargets.size === 0) return new Set<string>(Array.from(byNodeId.keys()))
    const reverseAdj = new Map<string, string[]>()
    for (const c of allConnections) {
      if (!reverseAdj.has(c.targetId)) reverseAdj.set(c.targetId, [])
      reverseAdj.get(c.targetId)!.push(c.sourceId)
    }
    const out = new Set<string>()
    const queue: string[] = []
    for (const id of Array.from(requestedTargets.values())) {
      const s = cleanString(id)
      if (!s) continue
      queue.push(s)
    }
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (out.has(cur)) continue
      if (!byNodeId.has(cur)) continue
      out.add(cur)
      const parents = reverseAdj.get(cur) || []
      for (const p of parents) {
        const pid = cleanString(p)
        if (pid && !out.has(pid)) queue.push(pid)
      }
    }
    return out
  })()

  const portPathsByNodeId: PortPathsByNodeId = new Map()
  for (const [nodeId, entry] of Array.from(registryByNodeId.entries())) {
    if (!includedNodeIds.has(nodeId)) continue
    portPathsByNodeId.set(nodeId, buildPortSchemaPathIndex(entry))
  }

  const includedNodes = Array.from(includedNodeIds.values())
    .map(id => byNodeId.get(id) || null)
    .filter((n): n is GraphNode => !!n)

  const computedByNodeId = new Map<string, FlowConnectedValuesBySchemaPath>()
  const connections = allConnections.filter(c => includedNodeIds.has(c.sourceId) && includedNodeIds.has(c.targetId))
  const objectValueKeyCache = new WeakMap<object, string>()

  const topologicalNodeOrder = buildTopologicalNodeOrder({ nodes: includedNodes, connections })
  if (topologicalNodeOrder) {
    for (const id of topologicalNodeOrder) {
      const n = byNodeId.get(id)
      if (!n) continue
      const inbound = buildInboundValuesByNodeId({
        connections,
        byNodeId,
        portPathsByNodeId,
        computedByNodeId,
        targetNodeId: id,
      }).get(id) || new Map()
      const portPaths = portPathsByNodeId.get(id)
      const connected = buildConnectedValuesForNode({
        node: n,
        registryEntry: registryByNodeId.get(id) || null,
        inbound,
        inputPortPaths: portPaths?.input || new Map(),
        outputPortPaths: portPaths?.output || new Map(),
        schemaMappings: portPaths?.schemaMappings || [],
        computeEnabled,
        preserveMaterializedOutputs: args.preserveMaterializedOutputs !== false,
      })
      computedByNodeId.set(id, connected)
    }
    const out = new Map<string, FlowConnectedValuesBySchemaPath>()
    for (const id of Array.from(includedNodeIds.values())) {
      if (requestedTargets && !requestedTargets.has(id)) continue
      out.set(id, computedByNodeId.get(id) || {})
    }
    connectedValuesCache.write(cacheKey, out)
    return out
  }

  const maxIterations = Math.max(2, Math.min(128, includedNodes.length + 1))

  const valueKey = (v: unknown): string => {
    if (typeof v === 'string') return `s:${v.length}:${v}`
    if (typeof v === 'number') return Number.isFinite(v) ? `n:${v}` : 'n:NaN'
    if (typeof v === 'boolean') return v ? 'b:1' : 'b:0'
    if (v == null) return 'null'
    if (Array.isArray(v)) return `a:${v.length}:${hashRecordSignature32({ value: v }, { maxEntries: 1, maxDepth: 3 })}`
    if (typeof v === 'object') {
      const key = objectValueKeyCache.get(v as object)
      if (key) return key
      const next = `o:${hashRecordSignature32(v, { maxEntries: 80, maxDepth: 3 })}`
      objectValueKeyCache.set(v as object, next)
      return next
    }
    return `u:${String(v)}`
  }

  const connectedKey = (m: FlowConnectedValuesBySchemaPath): string => {
    const keys = Object.keys(m).sort()
    const parts: string[] = []
    for (const k of keys) {
      const cv = m[k]
      if (!cv) continue
      const sources = Array.isArray(cv.sources) ? cv.sources : []
      const sourceParts: string[] = []
      for (let i = 0; i < sources.length; i += 1) {
        const source = sources[i]
        sourceParts.push(`${source.edgeId}|${source.nodeId}|${source.portKey}`)
      }
      const sourcesKey = sourceParts.join(',')
      parts.push(`${k}=${valueKey(cv.value)}@${sourcesKey}`)
    }
    return parts.join('\n')
  }

  let prevKeysByNodeId = new Map<string, string>()
  for (let iter = 0; iter < maxIterations; iter += 1) {
    const inboundByNodeId = buildInboundValuesByNodeId({
      connections,
      byNodeId,
      portPathsByNodeId,
      computedByNodeId,
    })

    const nextComputedByNodeId = new Map<string, FlowConnectedValuesBySchemaPath>()
    const nextKeysByNodeId = new Map<string, string>()

    for (const n of includedNodes) {
      const id = cleanString(n?.id)
      if (!id) continue
      const inbound = inboundByNodeId.get(id) || new Map()
      const portPaths = portPathsByNodeId.get(id)
      const connected = buildConnectedValuesForNode({
        node: n,
        registryEntry: registryByNodeId.get(id) || null,
        inbound,
        inputPortPaths: portPaths?.input || new Map(),
        outputPortPaths: portPaths?.output || new Map(),
        schemaMappings: portPaths?.schemaMappings || [],
        computeEnabled,
        preserveMaterializedOutputs: args.preserveMaterializedOutputs !== false,
      })
      nextComputedByNodeId.set(id, connected)
      nextKeysByNodeId.set(id, connectedKey(connected))
    }

    let changed = false
    for (const [id, key] of Array.from(nextKeysByNodeId.entries())) {
      if (prevKeysByNodeId.get(id) !== key) {
        changed = true
        break
      }
    }
    computedByNodeId.clear()
    for (const [id, m] of Array.from(nextComputedByNodeId.entries())) computedByNodeId.set(id, m)
    prevKeysByNodeId = nextKeysByNodeId
    if (!changed) break
  }

  const out = new Map<string, FlowConnectedValuesBySchemaPath>()
  for (const id of Array.from(includedNodeIds.values())) {
    if (requestedTargets && !requestedTargets.has(id)) continue
    out.set(id, computedByNodeId.get(id) || {})
  }
  connectedValuesCache.write(cacheKey, out)
  return out
}
