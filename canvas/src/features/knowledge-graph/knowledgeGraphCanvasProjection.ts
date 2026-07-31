import type {
  WorkspaceKnowledgeGraphCounts,
  WorkspaceKnowledgeGraphImportProgress,
  WorkspaceKnowledgeGraphImportResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'

export const KNOWLEDGE_GRAPH_CANVAS_PROJECTION_SCHEMA = 'knowgrph-canvas-knowledge-graph-projection/v1'
export const KNOWLEDGE_GRAPH_CANVAS_PREVIEW_SCHEMA = 'knowgrph-canvas-knowledge-graph-preview/v1'
export const KNOWLEDGE_GRAPH_CANVAS_MAX_NODES = 2_000
export const KNOWLEDGE_GRAPH_CANVAS_MAX_EDGES = 5_000
export const KNOWLEDGE_GRAPH_CANVAS_MAX_BYTES = 2 * 1024 * 1024
export const KNOWLEDGE_GRAPH_CANVAS_MAX_RECORD_BYTES = 64 * 1024

const MAX_JSON_DEPTH = 8
const MAX_JSON_STRING_LENGTH = 16_384
const MAX_JSON_ARRAY_LENGTH = 2_048
const MAX_JSON_OBJECT_KEYS = 256
const PRIVATE_PATH_KEY = /^(?:artifactPath|outputPath|rootPath|storePath|absolutePath|createdPaths|removedPaths)$/i
const LOGICAL_PATH_KEY = /(?:^|:)(?:sourcePath|repositoryPath)$/
const SAFE_GRAPH_KEYS = new Set(['context', 'metadata', 'type', 'nodes', 'edges'])
const SAFE_NODE_KEYS = new Set(['id', 'label', 'type', 'properties', 'metadata'])
const SAFE_EDGE_KEYS = new Set(['id', 'source', 'target', 'label', 'type', 'properties', 'metadata'])
const REQUIRED_EDGE_EVIDENCE = [
  'evidence:explanation',
  'evidence:sourcePath',
  'evidence:sourceDigest',
  'evidence:excerptHash',
  'evidence:parserId',
  'evidence:parserDigest',
  'evidence:ruleId',
] as const
let nextKnowledgeGraphPreviewSessionId = 1

export class KnowledgeGraphProjectionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'KnowledgeGraphProjectionError'
    this.code = code
  }
}

const cleanString = (value: unknown): string => String(value || '').trim()

const isPlainRecord = (value: unknown): value is Record<string, JSONValue> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
)

const isPositiveInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value > 0
)

const byteLength = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

const hasForbiddenControlCharacter = (value: string, allowLineWhitespace = false): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0
    if (codePoint === 0x7f) return true
    if (codePoint >= 0x20) continue
    if (allowLineWhitespace && (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d)) continue
    return true
  }
  return false
}

const isCanonicalId = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= 1_024
  && value === value.trim()
  && !hasForbiddenControlCharacter(value)
)

const isCanonicalLabel = (value: unknown): value is string => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= MAX_JSON_STRING_LENGTH
  && !hasForbiddenControlCharacter(value, true)
)

const isLogicalRelativePath = (value: string): boolean => {
  if (!value || value === '.') return true
  const normalized = value.replaceAll('\\', '/')
  return !normalized.startsWith('/')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.startsWith('file:')
    && !normalized.split('/').includes('..')
}

function validateJsonValue(value: unknown, path: string, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new KnowledgeGraphProjectionError('projection-depth-limit', `${path} exceeds the projection nesting limit.`)
  }
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new KnowledgeGraphProjectionError('invalid-projection-value', `${path} contains a non-finite number.`)
    }
    return
  }
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING_LENGTH) {
      throw new KnowledgeGraphProjectionError('projection-string-limit', `${path} exceeds the projection string limit.`)
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_LENGTH) {
      throw new KnowledgeGraphProjectionError('projection-array-limit', `${path} exceeds the projection array limit.`)
    }
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, depth + 1))
    return
  }
  if (!isPlainRecord(value)) {
    throw new KnowledgeGraphProjectionError('invalid-projection-value', `${path} is not JSON data.`)
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_JSON_OBJECT_KEYS) {
    throw new KnowledgeGraphProjectionError('projection-object-limit', `${path} exceeds the projection object-key limit.`)
  }
  for (const [key, nested] of entries) {
    if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor' || PRIVATE_PATH_KEY.test(key)) {
      throw new KnowledgeGraphProjectionError('private-path-rejected', `${path}.${key || '<empty>'} is not allowed.`)
    }
    if (LOGICAL_PATH_KEY.test(key) && (typeof nested !== 'string' || !isLogicalRelativePath(nested))) {
      throw new KnowledgeGraphProjectionError('absolute-path-rejected', `${path}.${key} must be repository-relative.`)
    }
    validateJsonValue(nested, `${path}.${key}`, depth + 1)
  }
}

const cloneJsonRecord = (value: Record<string, JSONValue> | undefined, path: string): Record<string, JSONValue> => {
  if (!value) return {}
  validateJsonValue(value, path)
  return JSON.parse(JSON.stringify(value)) as Record<string, JSONValue>
}

const cloneNode = (node: GraphNode): GraphNode => ({
  ...node,
  properties: cloneJsonRecord(node.properties, `node:${node.id}.properties`),
  ...(node.metadata ? { metadata: cloneJsonRecord(node.metadata, `node:${node.id}.metadata`) } : {}),
})

const cloneEdge = (edge: GraphEdge): GraphEdge => ({
  ...edge,
  properties: cloneJsonRecord(edge.properties, `edge:${edge.id}.properties`),
  ...(edge.metadata ? { metadata: cloneJsonRecord(edge.metadata, `edge:${edge.id}.metadata`) } : {}),
})

function validateCounts(counts: WorkspaceKnowledgeGraphCounts | undefined): WorkspaceKnowledgeGraphCounts {
  if (
    !counts
    || !isNonNegativeInteger(counts.sources)
    || !isNonNegativeInteger(counts.nodes)
    || !isNonNegativeInteger(counts.edges)
  ) {
    throw new KnowledgeGraphProjectionError(
      'invalid-counts',
      'Knowledge graph import did not return valid source, node, and edge counts.',
    )
  }
  return counts
}

function validateGraphData(graphData: GraphData | undefined, counts: WorkspaceKnowledgeGraphCounts): GraphData {
  if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
    throw new KnowledgeGraphProjectionError(
      'invalid-projection',
      'Knowledge graph import did not return a GraphData projection.',
    )
  }
  if (
    graphData.type !== 'Graph'
    || Object.keys(graphData).some(key => !SAFE_GRAPH_KEYS.has(key))
    || (graphData.context !== undefined && graphData.context !== 'knowgrph-knowledge-graph-projection')
  ) {
    throw new KnowledgeGraphProjectionError(
      'invalid-projection-shape',
      'Knowledge graph projection contains unsupported graph fields.',
    )
  }
  if (graphData.nodes.length > KNOWLEDGE_GRAPH_CANVAS_MAX_NODES) {
    throw new KnowledgeGraphProjectionError(
      'projection-node-limit',
      `Knowledge graph Canvas projection exceeds ${KNOWLEDGE_GRAPH_CANVAS_MAX_NODES} nodes.`,
    )
  }
  if (graphData.edges.length > KNOWLEDGE_GRAPH_CANVAS_MAX_EDGES) {
    throw new KnowledgeGraphProjectionError(
      'projection-edge-limit',
      `Knowledge graph Canvas projection exceeds ${KNOWLEDGE_GRAPH_CANVAS_MAX_EDGES} edges.`,
    )
  }
  if (graphData.nodes.length > counts.nodes || graphData.edges.length > counts.edges) {
    throw new KnowledgeGraphProjectionError(
      'projection-count-mismatch',
      'Knowledge graph projection contains more records than the canonical snapshot counts.',
    )
  }
  if (byteLength(graphData) > KNOWLEDGE_GRAPH_CANVAS_MAX_BYTES) {
    throw new KnowledgeGraphProjectionError(
      'projection-byte-limit',
      `Knowledge graph Canvas projection exceeds ${KNOWLEDGE_GRAPH_CANVAS_MAX_BYTES} bytes.`,
    )
  }
  if (graphData.metadata) validateJsonValue(graphData.metadata, 'graph.metadata')

  const nodeIds = new Set<string>()
  for (const node of graphData.nodes) {
    const nodeId = node?.id
    if (
      !node
      || Object.keys(node).some(key => !SAFE_NODE_KEYS.has(key))
      || !isCanonicalId(nodeId)
      || !isCanonicalLabel(node.label)
      || !isCanonicalId(node.type)
      || !isPlainRecord(node.properties)
      || nodeIds.has(nodeId)
      || byteLength(node) > KNOWLEDGE_GRAPH_CANVAS_MAX_RECORD_BYTES
    ) {
      throw new KnowledgeGraphProjectionError(
        'invalid-node-id',
        'Knowledge graph Canvas projection contains an invalid, duplicate, or oversized node.',
      )
    }
    validateJsonValue(node.properties, `node:${nodeId}.properties`)
    if (node.metadata) validateJsonValue(node.metadata, `node:${nodeId}.metadata`)
    nodeIds.add(nodeId)
  }

  const edgeIds = new Set<string>()
  for (const edge of graphData.edges) {
    const edgeId = edge?.id
    const source = edge?.source
    const target = edge?.target
    if (
      !edge
      || Object.keys(edge).some(key => !SAFE_EDGE_KEYS.has(key))
      || !isCanonicalId(edgeId)
      || !isCanonicalId(source)
      || !isCanonicalId(target)
      || !isCanonicalId(edge.label)
      || (edge.type !== undefined && !isCanonicalId(edge.type))
      || !isPlainRecord(edge.properties)
      || edgeIds.has(edgeId)
      || !nodeIds.has(source)
      || !nodeIds.has(target)
      || byteLength(edge) > KNOWLEDGE_GRAPH_CANVAS_MAX_RECORD_BYTES
    ) {
      throw new KnowledgeGraphProjectionError(
        'invalid-edge',
        'Knowledge graph Canvas projection contains an invalid, duplicate, dangling, or oversized edge.',
      )
    }
    validateJsonValue(edge.properties, `edge:${edgeId}.properties`)
    if (edge.metadata) validateJsonValue(edge.metadata, `edge:${edgeId}.metadata`)
    if (
      REQUIRED_EDGE_EVIDENCE.some(key => (
        key === 'evidence:explanation'
          ? !isCanonicalLabel(edge.properties[key])
          : !isCanonicalId(edge.properties[key])
      ))
      || !isLogicalRelativePath(String(edge.properties['evidence:sourcePath']))
    ) {
      throw new KnowledgeGraphProjectionError(
        'edge-evidence-required',
        `Knowledge graph edge ${edgeId} lacks canonical source and explanation evidence.`,
      )
    }
    edgeIds.add(edgeId)
  }
  return graphData
}

export function buildKnowledgeGraphCanvasProjection(
  result: WorkspaceKnowledgeGraphImportResult,
): GraphData {
  if (!result || result.handled !== true || result.kind !== 'knowledge-graph') {
    throw new KnowledgeGraphProjectionError(
      'not-handled',
      'Knowledge graph host did not claim the import.',
    )
  }
  const graphId = cleanString(result.graphId)
  const snapshotDigest = cleanString(result.snapshotDigest)
  const parserRegistryDigest = cleanString(result.parserRegistryDigest)
  if (
    !/^kg:graph:[0-9a-f]{32}$/.test(graphId)
    || !/^[0-9a-f]{64}$/.test(snapshotDigest)
    || !/^[0-9a-f]{64}$/.test(parserRegistryDigest)
  ) {
    throw new KnowledgeGraphProjectionError(
      'invalid-snapshot-identity',
      'Knowledge graph import returned an invalid graph, snapshot, or parser-registry identity.',
    )
  }
  if (result.complete !== true) {
    throw new KnowledgeGraphProjectionError(
      'incomplete-snapshot',
      'Knowledge graph import was incomplete; Canvas kept the current graph unchanged.',
    )
  }
  const counts = validateCounts(result.counts)
  const projectionToken = cleanString(result.projection?.token)
  if (
    !/^kg:projection:[0-9a-f]{24}$/.test(projectionToken)
    || result.projection?.readOnly !== true
    || typeof result.projection.complete !== 'boolean'
    || typeof result.projection.truncated !== 'boolean'
    || !isPositiveInteger(result.projection.limit)
    || result.projection.limit > 1_000
    || (result.projection.reason !== undefined && !isCanonicalId(result.projection.reason))
  ) {
    throw new KnowledgeGraphProjectionError(
      'invalid-projection-identity',
      'Knowledge graph import did not return an identified read-only projection.',
    )
  }
  const graphData = validateGraphData(result.projection.graphData, counts)
  const metadata = cloneJsonRecord(graphData.metadata, 'graph.metadata')
  return {
    ...graphData,
    metadata: {
      ...metadata,
      kind: 'knowledge-graph',
      source: graphId,
      knowledgeGraphProjection: {
        schema: KNOWLEDGE_GRAPH_CANVAS_PROJECTION_SCHEMA,
        owner: 'knowledge-graph-runtime',
        readOnly: true,
        graphId,
        snapshotDigest: snapshotDigest.toLowerCase(),
        parserRegistryDigest: parserRegistryDigest.toLowerCase(),
        projectionToken,
        complete: result.complete,
        projectionComplete: result.projection.complete,
        projectionTruncated: result.projection.truncated,
        projectionLimit: result.projection.limit,
        ...(result.projection.reason ? { projectionReason: result.projection.reason } : {}),
        counts: {
          sources: counts.sources,
          nodes: counts.nodes,
          edges: counts.edges,
        },
      },
    },
    nodes: graphData.nodes.map(cloneNode),
    edges: graphData.edges.map(cloneEdge),
  }
}

type ValidatedKnowledgeGraphProgress = Omit<WorkspaceKnowledgeGraphImportProgress, 'graphData'> & { graphData: GraphData }

function validateKnowledgeGraphProgress(
  progress: WorkspaceKnowledgeGraphImportProgress,
): ValidatedKnowledgeGraphProgress {
  if (
    !progress
    || progress.schema !== 'knowgrph-knowledge-graph-import-progress/v1'
    || progress.kind !== 'source-parsed'
    || !/^kg:graph:[0-9a-f]{32}$/.test(cleanString(progress.graphId))
    || !/^[0-9a-f]{64}$/.test(cleanString(progress.parserRegistryDigest))
    || !cleanString(progress.sourcePath)
    || !isLogicalRelativePath(cleanString(progress.sourcePath))
    || !isPositiveInteger(progress.sourceIndex)
    || !isPositiveInteger(progress.sourceTotal)
    || progress.sourceIndex > progress.sourceTotal
    || typeof progress.truncated !== 'boolean'
  ) {
    throw new KnowledgeGraphProjectionError('invalid-progress-frame', 'Knowledge graph import progress did not return a valid source fragment.')
  }
  const graphData = validateGraphData(progress.graphData, {
    sources: progress.sourceIndex,
    nodes: Array.isArray(progress.graphData?.nodes) ? progress.graphData.nodes.length : 0,
    edges: Array.isArray(progress.graphData?.edges) ? progress.graphData.edges.length : 0,
  })
  return {
    ...progress,
    graphData: {
      ...graphData,
      nodes: graphData.nodes.map(cloneNode),
      edges: graphData.edges.map(cloneEdge),
    },
  }
}

function retainBoundedCanonicalRecord<T extends { id: string }>(
  records: Map<string, T>,
  value: T,
  limit: number,
): boolean {
  if (records.has(value.id)) return false
  if (records.size < limit) {
    records.set(value.id, value)
    return false
  }
  let greatestId = ''
  for (const id of records.keys()) {
    if (!greatestId || id > greatestId) greatestId = id
  }
  if (!greatestId || value.id > greatestId) return true
  records.delete(greatestId)
  records.set(value.id, value)
  return true
}

function sortCanonicalRecords<T extends { id: string }>(records: Iterable<T>): T[] {
  return [...records].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

function isKnowledgeGraphPreview(graphData: GraphData | null | undefined, sessionId: string): boolean {
  const preview = graphData?.metadata?.knowledgeGraphPreview as Record<string, unknown> | undefined
  return preview?.owner === 'knowledge-graph-runtime-preview'
    && preview.sessionId === sessionId
}

export function prepareKnowledgeGraphCanvasView(): void {
  const initialState = useGraphStore.getState()
  if (
    initialState.documentStructureBaselineLock === true
    && initialState.canvas2dRenderer !== 'd3'
  ) {
    throw new KnowledgeGraphProjectionError(
      'graph-view-unavailable',
      'Knowledge graph import cannot change the renderer while the document baseline is locked.',
    )
  }
  if (initialState.canvasRenderMode !== '2d') initialState.setCanvasRenderMode('2d')
  const modeState = useGraphStore.getState()
  if (modeState.canvas2dRenderer !== 'd3') modeState.setCanvas2dRenderer('d3')
  const graphViewState = useGraphStore.getState()
  if (graphViewState.canvasRenderMode !== '2d' || graphViewState.canvas2dRenderer !== 'd3') {
    throw new KnowledgeGraphProjectionError(
      'graph-view-unavailable',
      'Knowledge graph import could not open the required 2D Graph view.',
    )
  }
}

export type KnowledgeGraphCanvasPreviewSession = { apply: (progress: WorkspaceKnowledgeGraphImportProgress) => GraphData; commit: (result: WorkspaceKnowledgeGraphImportResult) => GraphData; rollback: () => void }

/** Keeps a bounded verified visual preview; the final immutable snapshot replaces it atomically. */
export function createKnowledgeGraphCanvasPreviewSession(): KnowledgeGraphCanvasPreviewSession {
  const baseline = useGraphStore.getState()
  const baselineGraphData = baseline.graphData
  const baselineGraphDataRevision = baseline.graphDataRevision
  const baselineGraphContentRevision = baseline.graphContentRevision
  const baselineDocLocationRevision = baseline.docLocationRevision
  const baselineCanvasRenderMode = baseline.canvasRenderMode
  const baselineCanvas2dRenderer = baseline.canvas2dRenderer
  const sessionId = `knowledge-graph-preview-${nextKnowledgeGraphPreviewSessionId}`
  nextKnowledgeGraphPreviewSessionId += 1
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  let graphId = ''
  let parserRegistryDigest = ''
  let sourceIndex = 0
  let sourceTotal = 0
  let truncated = false
  let previewPublished = false
  let complete = false

  const buildPreviewGraph = (): GraphData => {
    const previewNodes = sortCanonicalRecords(nodes.values())
    const nodeIds = new Set(previewNodes.map(node => node.id))
    const previewEdges = sortCanonicalRecords(edges.values()).filter(edge => (
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    ))
    const baseGraph = validateGraphData({
      context: 'knowgrph-knowledge-graph-projection',
      type: 'Graph',
      nodes: previewNodes,
      edges: previewEdges,
    }, {
      sources: sourceIndex,
      nodes: previewNodes.length,
      edges: previewEdges.length,
    })
    return {
      ...baseGraph,
      metadata: {
        kind: 'knowledge-graph',
        source: graphId,
        knowledgeGraphPreview: {
          schema: KNOWLEDGE_GRAPH_CANVAS_PREVIEW_SCHEMA,
          owner: 'knowledge-graph-runtime-preview',
          readOnly: true,
          sessionId,
          graphId,
          parserRegistryDigest,
          complete: false,
          sourceIndex,
          sourceTotal,
          truncated,
        },
      },
      nodes: previewNodes.map(cloneNode),
      edges: previewEdges.map(cloneEdge),
    }
  }

  const publishPreview = (graphData: GraphData): void => {
    prepareKnowledgeGraphCanvasView()
    useGraphStore.setState(state => ({
      graphData,
      graphDataRevision: (state.graphDataRevision || 0) + 1,
      graphContentRevision: (state.graphContentRevision || 0) + 1,
      docLocationRevision: (state.docLocationRevision || 0) + 1,
      graphValidationStatus: null,
      graphValidationTimestamp: null,
      lifecycleStage: 'committed',
    }))
    previewPublished = true
  }

  return {
    apply(progress) {
      if (complete) {
        throw new KnowledgeGraphProjectionError('progress-after-complete', 'Knowledge graph preview received progress after completion.')
      }
      const validated = validateKnowledgeGraphProgress(progress)
      if (!graphId) {
        graphId = validated.graphId
        parserRegistryDigest = validated.parserRegistryDigest
      } else if (graphId !== validated.graphId || parserRegistryDigest !== validated.parserRegistryDigest) {
        throw new KnowledgeGraphProjectionError('progress-identity-mismatch', 'Knowledge graph preview changed graph identity mid-import.')
      }
      if (validated.sourceIndex !== sourceIndex + 1 || (sourceTotal && sourceTotal !== validated.sourceTotal)) {
        throw new KnowledgeGraphProjectionError('progress-order-invalid', 'Knowledge graph preview received out-of-order source progress.')
      }
      sourceIndex = validated.sourceIndex
      sourceTotal = validated.sourceTotal
      truncated = truncated || validated.truncated
      for (const node of validated.graphData.nodes) {
        truncated = retainBoundedCanonicalRecord(nodes, node, KNOWLEDGE_GRAPH_CANVAS_MAX_NODES) || truncated
      }
      for (const edge of validated.graphData.edges) {
        truncated = retainBoundedCanonicalRecord(edges, edge, KNOWLEDGE_GRAPH_CANVAS_MAX_EDGES) || truncated
      }
      const graphData = buildPreviewGraph()
      if (graphData.nodes.length || graphData.edges.length) publishPreview(graphData)
      return graphData
    },
    commit(result) {
      const graphData = applyKnowledgeGraphCanvasProjection(result)
      complete = true
      previewPublished = false
      return graphData
    },
    rollback() {
      if (!previewPublished || complete) return
      const current = useGraphStore.getState()
      if (!isKnowledgeGraphPreview(current.graphData, sessionId)) return
      useGraphStore.setState({
        graphData: baselineGraphData,
        graphDataRevision: baselineGraphDataRevision,
        graphContentRevision: baselineGraphContentRevision,
        docLocationRevision: baselineDocLocationRevision,
        graphValidationStatus: null,
        graphValidationTimestamp: null,
        lifecycleStage: 'committed',
      })
      const restored = useGraphStore.getState()
      if (restored.canvasRenderMode !== baselineCanvasRenderMode) {
        restored.setCanvasRenderMode(baselineCanvasRenderMode)
      }
      const rendererState = useGraphStore.getState()
      if (rendererState.canvas2dRenderer !== baselineCanvas2dRenderer) {
        rendererState.setCanvas2dRenderer(baselineCanvas2dRenderer)
      }
      previewPublished = false
    },
  }
}

export function applyKnowledgeGraphCanvasProjection(
  result: WorkspaceKnowledgeGraphImportResult,
  setGraphData: (graphData: GraphData) => void = graphData => {
    prepareKnowledgeGraphCanvasView()
    useGraphStore.getState().setGraphData(graphData)
  },
): GraphData {
  const graphData = buildKnowledgeGraphCanvasProjection(result)
  setGraphData(graphData)
  return graphData
}
