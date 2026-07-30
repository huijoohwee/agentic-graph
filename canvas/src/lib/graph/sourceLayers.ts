import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { readWidgetRegistryMetadataEntries, writeWidgetRegistryMetadata } from '@/lib/config.storyboard-widget'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import { readParsedGraphRevisionOrInitial } from '@/features/source-files/sourceFileParsedGraphRevision'
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { createUniqueId } from '@/lib/ids'
import { readFlowEdgePortKey } from '@/lib/graph/flowPorts'
import { readSubgraphs, writeSubgraphs, type UserSubgraph } from '@/lib/graph/subgraphs'

export type SourceLayerInput = {
  id: string
  name: string
  enabled: boolean
  source?: { kind: 'url' | 'local'; url?: string; path?: string }
  text?: string
  parsedTextHash?: string
  parsedGraphRevision?: number
  parsedGraphData?: GraphData
}

function inferSourceLayerFormat(name: string): string {
  const trimmed = String(name || '').trim().toLowerCase()
  const dot = trimmed.lastIndexOf('.')
  const ext = dot >= 0 ? trimmed.slice(dot) : ''
  if (ext === '.markdown') return 'markdown'
  if (ext === '.md') return 'markdown'
  if (ext === '.txt') return 'text'
  if (ext === '.geojson') return 'geojson'
  if (ext === '.json') return 'json'
  if (ext === '.jsonld') return 'jsonld'
  if (ext === '.csv') return 'csv'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (ext === '.yaml' || ext === '.yml') return 'yaml'
  if (ext === '.pdf') return 'pdf'
  if (!ext) return 'auto'
  return ext.replace(/^\./, '') || 'auto'
}

function computeTextHash(layer: SourceLayerInput): string {
  const existing = typeof layer.parsedTextHash === 'string' ? layer.parsedTextHash.trim() : ''
  if (existing) return existing
  const text = typeof layer.text === 'string' ? layer.text : ''
  return hashStringToHexCached(`source-layer:${String(layer.id || '').trim() || 'unknown'}`, text)
}

function readSourceLayerGraphMetadata(graphData: { metadata?: unknown } | null | undefined): Record<string, unknown> {
  return toMetadataRecord(graphData?.metadata)
}

export function stripRepeatedSourceLayerEntityPrefix(rawId: unknown, rawLayerId: unknown): string {
  let id = String(rawId || '').trim()
  const layerId = String(rawLayerId || '').trim()
  if (!id || !layerId) return id
  const prefix = `${layerId}::`
  while (id.startsWith(prefix)) {
    id = id.slice(prefix.length).trim()
  }
  return id
}

function buildSourceLayerEdgeTopologyKey(edge: GraphEdge, source: string, target: string): string {
  return JSON.stringify({
    source,
    target,
    sourcePortKey: readFlowEdgePortKey(edge, 'source') || '',
    targetPortKey: readFlowEdgePortKey(edge, 'target') || '',
    type: String(edge.type || '').trim(),
    label: String(edge.label || '').trim(),
  })
}

const PARSED_GRAPH_SEMANTIC_KEY_CACHE = new WeakMap<object, string>()
const COMPOSED_GRAPH_CACHE_LIMIT = 24
const composedGraphCache = new Map<string, GraphData>()

function stripVolatileGraphMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata }
  delete next.hash
  delete next.graphDataRevision
  delete next.updatedAt
  delete next.modifiedAt
  delete next.lastUpdated
  delete next.pending
  delete next.sourceLayerHash
  delete next.sourceLayerOrderHash
  return next
}

function buildParsedGraphSemanticKey(graphData: GraphData | null | undefined, fallbackRevision?: unknown): string {
  if (!graphData || typeof graphData !== 'object') return ''
  const cached = PARSED_GRAPH_SEMANTIC_KEY_CACHE.get(graphData as object)
  if (cached) return cached
  const metadata = stripVolatileGraphMetadata(readSourceLayerGraphMetadata(graphData))
  const payload = JSON.stringify({
    type: typeof graphData.type === 'string' ? graphData.type : '',
    context: typeof graphData.context === 'string' ? graphData.context : '',
    metadata,
    nodes: Array.isArray(graphData.nodes) ? graphData.nodes : [],
    edges: Array.isArray(graphData.edges) ? graphData.edges : [],
  })
  const semanticHash = hashStringToHexCached(
    `source-layer-graph:${String(graphData.type || '')}:${String(graphData.context || '')}`,
    payload,
  )
  const next =
    buildScopedGraphSemanticKey('source-layer-parsed-graph', {
      graphData,
      graphSemanticKey: semanticHash || `rev:${readParsedGraphRevisionOrInitial(fallbackRevision)}`,
    })
    || semanticHash
    || `rev:${readParsedGraphRevisionOrInitial(fallbackRevision)}`
  PARSED_GRAPH_SEMANTIC_KEY_CACHE.set(graphData as object, next)
  return next
}

function readComposedGraphCache(key: string): GraphData | null {
  if (!key) return null
  const cached = composedGraphCache.get(key) || null
  if (!cached) return null
  composedGraphCache.delete(key)
  composedGraphCache.set(key, cached)
  return cached
}

function writeComposedGraphCache(key: string, graphData: GraphData): void {
  if (!key) return
  composedGraphCache.set(key, graphData)
  if (composedGraphCache.size > COMPOSED_GRAPH_CACHE_LIMIT) {
    const oldest = composedGraphCache.keys().next().value
    if (typeof oldest === 'string') composedGraphCache.delete(oldest)
  }
}

function mergeWidgetRegistryMetadata(layers: SourceLayerInput[]): JSONValue[] | undefined {
  const out: JSONValue[] = []
  const seen = new Set<string>()
  for (let i = 0; i < layers.length; i += 1) {
    const graph = layers[i]?.parsedGraphData
    const metadata = readSourceLayerGraphMetadata(graph)
    const raw = readWidgetRegistryMetadataEntries(metadata)
    for (let j = 0; j < raw.length; j += 1) {
      const entry = raw[j]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const nodeTypeId = typeof entry.nodeTypeId === 'string' ? entry.nodeTypeId.trim() : ''
      const formId = typeof entry.formId === 'string' ? entry.formId.trim() : ''
      const widgetTypeId = typeof entry.widgetTypeId === 'string' ? entry.widgetTypeId.trim() : ''
      const id = typeof entry.id === 'string' ? entry.id.trim() : ''
      const key = nodeTypeId && formId && widgetTypeId ? `${nodeTypeId}|${formId}|${widgetTypeId}` : id
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(entry as unknown as JSONValue)
    }
  }
  return out.length > 0 ? out : undefined
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeCorpusLabel(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_$.-]+/g, '')
}

function readNodeLayerId(node: GraphNode): string {
  return String(readRecord((node as { metadata?: unknown }).metadata).sourceLayerId || '').trim()
}

function readCorpusSourcePath(node: GraphNode): string {
  const props = readRecord(node.properties)
  const meta = readRecord((node as { metadata?: unknown }).metadata)
  return String(props['corpus:sourcePath'] || meta.documentPath || '').trim()
}

function readCorpusLineStart(node: GraphNode): number {
  const raw = readRecord(node.properties)['corpus:lineStart']
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

function appendCorpusCrossSourceReferenceEdges(nodes: GraphNode[], edges: GraphEdge[]): void {
  const tableByName = new Map<string, GraphNode[]>()
  const referenceNodes: GraphNode[] = []
  for (const node of nodes) {
    const type = String(node.type || '').trim()
    const label = normalizeCorpusLabel(node.label || node.id)
    if (!label) continue
    if (type === 'CorpusSqlTable') {
      const list = tableByName.get(label) || []
      list.push(node)
      tableByName.set(label, list)
      continue
    }
    if (type === 'CorpusSqlTableReference' || type === 'CorpusEntityReference' || type === 'CorpusDependency') {
      referenceNodes.push(node)
    }
  }
  if (tableByName.size < 1 || referenceNodes.length < 1) return
  const existingEdgeIds = new Set(edges.map(edge => String(edge.id || '')).filter(Boolean))
  for (const ref of referenceNodes) {
    const label = normalizeCorpusLabel(ref.label || ref.id)
    const targets = tableByName.get(label) || []
    if (targets.length < 1) continue
    for (const target of targets) {
      if (String(ref.id || '') === String(target.id || '')) continue
      const refLayer = readNodeLayerId(ref)
      const targetLayer = readNodeLayerId(target)
      if (refLayer && targetLayer && refLayer === targetLayer) continue
      const edgeId = `corpus:cross:${hashStringToHexCached('corpus-cross-source-edge', `${ref.id}->${target.id}`)}`
      if (existingEdgeIds.has(edgeId)) continue
      existingEdgeIds.add(edgeId)
      const lineStart = readCorpusLineStart(ref)
      edges.push({
        id: edgeId,
        source: String(ref.id),
        target: String(target.id),
        label: 'referencesCorpusEntity',
        properties: {
          'evidence:kind': 'inferred' as unknown as JSONValue,
          'evidence:confidence': 'medium' as unknown as JSONValue,
          'evidence:sourcePath': readCorpusSourcePath(ref) as unknown as JSONValue,
          'evidence:lineStart': lineStart as unknown as JSONValue,
          'evidence:lineEnd': lineStart as unknown as JSONValue,
          'corpus:parserId': 'source-layer-compose' as unknown as JSONValue,
        },
        metadata: {
          sourceLayerId: refLayer as unknown as JSONValue,
          sourceLayerLabel: String(readRecord((ref as { metadata?: unknown }).metadata).sourceLayerLabel || '') as unknown as JSONValue,
          documentPath: readCorpusSourcePath(ref) as unknown as JSONValue,
        },
      })
    }
  }
}

export function buildSourceLayerKeys(layers: SourceLayerInput[]): { contentKey: string; orderKey: string } {
  const normalized = (layers || []).map(l => ({
    id: String(l.id || '').trim(),
    included: Boolean(l.enabled && l.parsedGraphData),
    hash: computeTextHash(l),
    graphKey: buildParsedGraphSemanticKey(l.parsedGraphData, l.parsedGraphRevision),
  }))
  const contentKey = normalized
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(l => `${l.id}:${l.included ? '1' : '0'}:${l.hash}:g${l.graphKey}`)
    .join('|')
  const orderKey = normalized.map(l => `${l.id}:${l.included ? '1' : '0'}:${l.hash}:g${l.graphKey}`).join('|')
  return { contentKey, orderKey }
}

export function readSourceLayerKeysFromGraphData(graphData: GraphData | null | undefined): {
  contentKey: string
  orderKey: string
} {
  const metadata = readSourceLayerGraphMetadata(graphData)
  return {
    contentKey: typeof metadata.sourceLayerHash === 'string' ? metadata.sourceLayerHash : '',
    orderKey: typeof metadata.sourceLayerOrderHash === 'string' ? metadata.sourceLayerOrderHash : '',
  }
}

export function resolveSourceLayerKeyChange(args: {
  previousGraphData: GraphData | null | undefined
  contentKey: string
  orderKey: string
}): 'unchanged' | 'order-only' | 'content' {
  const previous = readSourceLayerKeysFromGraphData(args.previousGraphData)
  if (previous.contentKey === args.contentKey && previous.orderKey === args.orderKey) {
    return 'unchanged'
  }
  if (previous.contentKey === args.contentKey) {
    return 'order-only'
  }
  return 'content'
}

export function updateGraphDataSourceLayerKeys(args: {
  graphData: GraphData
  layers: SourceLayerInput[]
}): {
  graphData: GraphData
  contentKey: string
  orderKey: string
  changed: boolean
} {
  const { contentKey, orderKey } = buildSourceLayerKeys(args.layers)
  const prev = readSourceLayerKeysFromGraphData(args.graphData)
  if (prev.contentKey === contentKey && prev.orderKey === orderKey) {
    return {
      graphData: args.graphData,
      contentKey,
      orderKey,
      changed: false,
    }
  }
  return {
    graphData: {
      ...args.graphData,
      metadata: {
        ...readSourceLayerGraphMetadata(args.graphData),
        sourceLayerHash: contentKey as unknown as JSONValue,
        sourceLayerOrderHash: orderKey as unknown as JSONValue,
      },
    },
    contentKey,
    orderKey,
    changed: true,
  }
}

export function composeGraphFromSourceLayers(args: {
  layers: SourceLayerInput[]
  fallbackType?: string
  precomputedKeys?: { contentKey: string; orderKey: string }
}): { graphData: GraphData; contentKey: string; orderKey: string } {
  const layers = args.layers || []
  const { contentKey, orderKey } = args.precomputedKeys || buildSourceLayerKeys(layers)
  const enabledParsed = layers.filter(l => l.enabled && l.parsedGraphData)

  const base = enabledParsed[0]?.parsedGraphData || null
  const cacheKey = buildScopedGraphSemanticKey('source-layer-compose', {
    graphData: base,
    sourceLayerHash: contentKey,
    sourceLayerOrderHash: orderKey,
    graphSemanticKey: String(args.fallbackType || ''),
  })
  const cachedGraphData = readComposedGraphCache(cacheKey)
  if (cachedGraphData) return { graphData: cachedGraphData, contentKey, orderKey }
  const baseType = base?.type || args.fallbackType || 'Graph'
  const baseContext = typeof base?.context === 'undefined' ? 'sourceLayers' : (base?.context as JSONValue)
  const baseMetadata = readSourceLayerGraphMetadata(base) as Record<string, JSONValue>

  const sourceLayersMeta = layers.map(l => {
    const sourceUrl = l.source?.kind === 'url' ? String(l.source?.url || '').trim() : ''
    const sourcePath = l.source?.kind === 'local' ? String(l.source?.path || '').trim() : ''
    const format = inferSourceLayerFormat(l.name)
    return {
      id: l.id,
      label: l.name,
      enabled: Boolean(l.enabled),
      source: l.source?.kind ? { kind: l.source.kind, url: sourceUrl || undefined, path: sourcePath || undefined } : undefined,
      format,
      hash: computeTextHash(l),
    }
  })

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const layer of enabledParsed) {
    const graph = layer.parsedGraphData
    if (!graph) continue
    const prefix = `${layer.id}::`
    const label = String(layer.name || '').trim() || layer.id
    const sourceUrl = layer.source?.kind === 'url' ? String(layer.source?.url || '').trim() : ''
    const documentPath = label

    const includedNodeIds = new Set<string>()
    for (const node of graph.nodes || []) {
      const innerId = stripRepeatedSourceLayerEntityPrefix(node.id, layer.id)
      if (!innerId || includedNodeIds.has(innerId)) continue
      includedNodeIds.add(innerId)
      const nextId = `${prefix}${innerId}`
      const nextMeta = { ...(node.metadata || {}) } as Record<string, JSONValue>
      nextMeta.sourceLayerId = layer.id as unknown as JSONValue
      nextMeta.sourceLayerLabel = label as unknown as JSONValue
      if (!nextMeta.documentPath) nextMeta.documentPath = documentPath as unknown as JSONValue
      if (sourceUrl && !nextMeta.documentUrl) nextMeta.documentUrl = sourceUrl as unknown as JSONValue
      nodes.push({ ...node, id: nextId, metadata: nextMeta })
    }

    const reservedEdgeIds = new Set(
      (graph.edges || [])
        .map(edge => stripRepeatedSourceLayerEntityPrefix(edge.id, layer.id))
        .filter(Boolean),
    )
    const includedEdgeTopologyById = new Map<string, string>()
    const includedCanonicalEdgeIdentities = new Set<string>()
    for (const edge of graph.edges || []) {
      const source = stripRepeatedSourceLayerEntityPrefix(edge.source, layer.id)
      const target = stripRepeatedSourceLayerEntityPrefix(edge.target, layer.id)
      let innerId = stripRepeatedSourceLayerEntityPrefix(edge.id, layer.id)
      if (!innerId || !source || !target) continue
      const topologyKey = buildSourceLayerEdgeTopologyKey(edge, source, target)
      const canonicalIdentity = JSON.stringify([innerId, topologyKey])
      if (includedCanonicalEdgeIdentities.has(canonicalIdentity)) continue
      includedCanonicalEdgeIdentities.add(canonicalIdentity)
      const existingTopologyKey = includedEdgeTopologyById.get(innerId)
      if (existingTopologyKey) {
        innerId = createUniqueId('e', reservedEdgeIds)
      }
      reservedEdgeIds.add(innerId)
      includedEdgeTopologyById.set(innerId, topologyKey)
      const nextId = `${prefix}${innerId}`
      const nextMeta = { ...(edge.metadata || {}) } as Record<string, JSONValue>
      nextMeta.sourceLayerId = layer.id as unknown as JSONValue
      nextMeta.sourceLayerLabel = label as unknown as JSONValue
      if (!nextMeta.documentPath) nextMeta.documentPath = documentPath as unknown as JSONValue
      if (sourceUrl && !nextMeta.documentUrl) nextMeta.documentUrl = sourceUrl as unknown as JSONValue
      edges.push({
        ...edge,
        id: nextId,
        source: `${prefix}${source}`,
        target: `${prefix}${target}`,
        metadata: nextMeta,
      })
    }
  }
  appendCorpusCrossSourceReferenceEdges(nodes, edges)

  const nextMetadata: Record<string, JSONValue> = {
    ...baseMetadata,
    sourceLayers: sourceLayersMeta as unknown as JSONValue,
    sourceLayerComposition: 'compose' as unknown as JSONValue,
    sourceLayerHash: contentKey as unknown as JSONValue,
    sourceLayerOrderHash: orderKey as unknown as JSONValue,
  }
  const mergedWidgetRegistry = mergeWidgetRegistryMetadata(enabledParsed)
  const nextMetadataWithWidgetRegistry = writeWidgetRegistryMetadata(
    nextMetadata,
    (mergedWidgetRegistry || []) as JSONValue[],
  )

  const graphData: GraphData = {
    context: baseContext,
    metadata: nextMetadataWithWidgetRegistry,
    type: baseType,
    nodes,
    edges,
  }
  writeComposedGraphCache(cacheKey, graphData)
  return {
    graphData,
    contentKey,
    orderKey,
  }
}

const COMPOSED_ENTITY_METADATA_KEYS = ['sourceLayerId', 'sourceLayerLabel', 'documentPath', 'documentUrl'] as const

function readComposedEntityLayerId(entity: GraphNode | GraphEdge): string {
  const metadata = readRecord((entity as { metadata?: unknown }).metadata)
  const explicitLayerId = String(metadata.sourceLayerId || '').trim()
  if (explicitLayerId) return explicitLayerId
  const id = String(entity.id || '').trim()
  const separatorIndex = id.indexOf('::')
  return separatorIndex > 0 ? id.slice(0, separatorIndex).trim() : ''
}

function projectComposedEntityId(rawId: unknown, layerId: string): string {
  const id = String(rawId || '').trim()
  if (!id) return ''
  const projectedId = stripRepeatedSourceLayerEntityPrefix(id, layerId)
  if (projectedId !== id) return projectedId
  return id.includes('::') ? '' : id
}

function restoreSourceEntityMetadata<T extends GraphNode | GraphEdge>(
  entity: T,
  original: T | null,
): T {
  const currentMetadata = readRecord((entity as { metadata?: unknown }).metadata)
  const originalMetadata = readRecord((original as { metadata?: unknown } | null)?.metadata)
  if (Object.keys(currentMetadata).length === 0) return entity
  const metadata = { ...currentMetadata }
  for (const key of COMPOSED_ENTITY_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(originalMetadata, key)) metadata[key] = originalMetadata[key]
    else delete metadata[key]
  }
  return {
    ...entity,
    ...(Object.keys(metadata).length > 0 ? { metadata: metadata as T['metadata'] } : { metadata: undefined }),
  }
}

/**
 * Projects an aggregate source-layer graph back to one writable document.
 * Scoped entities from other documents are excluded; unscoped entities are
 * retained because they were authored after composition and belong to the
 * active publication transaction.
 */
export function projectComposedGraphToSourceLayer(args: {
  graphData: GraphData
  layer: SourceLayerInput
}): GraphData {
  const graphMetadata = readSourceLayerGraphMetadata(args.graphData)
  if (String(graphMetadata.sourceLayerComposition || '').trim() !== 'compose') return args.graphData
  const layerId = String(args.layer.id || '').trim()
  if (!layerId) return args.graphData

  const sourceGraph = args.layer.parsedGraphData || { type: 'Graph', nodes: [], edges: [], metadata: {} }
  const originalNodesById = new Map<string, GraphNode>()
  for (const node of sourceGraph.nodes || []) {
    const id = stripRepeatedSourceLayerEntityPrefix(node.id, layerId)
    if (id && !originalNodesById.has(id)) originalNodesById.set(id, node)
  }
  const projectedNodes: GraphNode[] = []
  const includedNodeIds = new Set<string>()
  for (const node of args.graphData.nodes || []) {
    const entityLayerId = readComposedEntityLayerId(node)
    if (entityLayerId && entityLayerId !== layerId) continue
    const projectedId = projectComposedEntityId(node.id, layerId)
    if (!projectedId || includedNodeIds.has(projectedId)) continue
    includedNodeIds.add(projectedId)
    projectedNodes.push(restoreSourceEntityMetadata(
      { ...node, id: projectedId },
      originalNodesById.get(projectedId) || null,
    ))
  }

  const originalEdgesById = new Map<string, GraphEdge>()
  for (const edge of sourceGraph.edges || []) {
    const id = stripRepeatedSourceLayerEntityPrefix(edge.id, layerId)
    if (id && !originalEdgesById.has(id)) originalEdgesById.set(id, edge)
  }
  const edgeCandidates: Array<{ edge: GraphEdge; id: string; source: string; target: string }> = []
  for (const edge of args.graphData.edges || []) {
    const entityLayerId = readComposedEntityLayerId(edge)
    if (entityLayerId && entityLayerId !== layerId) continue
    const id = projectComposedEntityId(edge.id, layerId)
    const source = projectComposedEntityId(edge.source, layerId)
    const target = projectComposedEntityId(edge.target, layerId)
    if (!id || !includedNodeIds.has(source) || !includedNodeIds.has(target)) continue
    edgeCandidates.push({ edge, id, source, target })
  }
  const projectedEdges: GraphEdge[] = []
  const reservedEdgeIds = new Set(edgeCandidates.map(candidate => candidate.id))
  const includedEdgeTopologyById = new Map<string, string>()
  const includedCanonicalEdgeIdentities = new Set<string>()
  for (const candidate of edgeCandidates) {
    let projectedId = candidate.id
    const topologyKey = buildSourceLayerEdgeTopologyKey(candidate.edge, candidate.source, candidate.target)
    const canonicalIdentity = JSON.stringify([projectedId, topologyKey])
    if (includedCanonicalEdgeIdentities.has(canonicalIdentity)) continue
    includedCanonicalEdgeIdentities.add(canonicalIdentity)
    const existingTopologyKey = includedEdgeTopologyById.get(projectedId)
    if (existingTopologyKey) {
      projectedId = createUniqueId('e', reservedEdgeIds)
    }
    reservedEdgeIds.add(projectedId)
    includedEdgeTopologyById.set(projectedId, topologyKey)
    projectedEdges.push(restoreSourceEntityMetadata(
      { ...candidate.edge, id: projectedId, source: candidate.source, target: candidate.target },
      originalEdgesById.get(candidate.id) || null,
    ))
  }

  const candidateSubgraphs = readSubgraphs(args.graphData).map(subgraph => ({
    ...subgraph,
    memberNodeIds: Array.from(new Set(
      subgraph.memberNodeIds
        .map(memberNodeId => projectComposedEntityId(memberNodeId, layerId))
        .filter(memberNodeId => memberNodeId && includedNodeIds.has(memberNodeId)),
    )).sort((left, right) => left.localeCompare(right)),
  }))
  const retainedSubgraphIds = new Set(
    candidateSubgraphs
      .filter(subgraph => subgraph.memberNodeIds.length > 0)
      .map(subgraph => subgraph.id),
  )
  let retainedParent = true
  while (retainedParent) {
    retainedParent = false
    for (const subgraph of candidateSubgraphs) {
      if (retainedSubgraphIds.has(subgraph.id)) continue
      if (!candidateSubgraphs.some(child => child.parentId === subgraph.id && retainedSubgraphIds.has(child.id))) continue
      retainedSubgraphIds.add(subgraph.id)
      retainedParent = true
    }
  }
  const projectedSubgraphs: UserSubgraph[] = candidateSubgraphs
    .filter(subgraph => retainedSubgraphIds.has(subgraph.id))
    .map(subgraph => ({
      ...subgraph,
      parentId: subgraph.parentId && retainedSubgraphIds.has(subgraph.parentId)
        ? subgraph.parentId
        : null,
    }))

  const sourceMetadata = readSourceLayerGraphMetadata(sourceGraph)
  const graphDataRevision = graphMetadata.graphDataRevision
  const projectedGraph: GraphData = {
    ...sourceGraph,
    type: sourceGraph.type || args.graphData.type || 'Graph',
    nodes: projectedNodes,
    edges: projectedEdges,
    metadata: {
      ...sourceMetadata,
      ...(typeof graphDataRevision === 'number' && Number.isFinite(graphDataRevision) ? { graphDataRevision } : {}),
    } as GraphData['metadata'],
  }
  return writeSubgraphs(projectedGraph, projectedSubgraphs)
}
