import type { WorkspaceAgentGraphCounts, WorkspaceAgentGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import { normalizeAgentGraphObservation } from '../../../../contracts/agent-graph-observation.mjs'
import { styleAgentGraphNode, styleAgentGraphProjection } from './agentGraphVisualEvidence'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { agentGraphProjectionByteLength, AGENT_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES, AGENT_GRAPH_PROJECTION_MAX_BYTES } from '../../../../mcp/agent-graph/projection-budget.mjs'

export const AGENT_GRAPH_CANVAS_PROJECTION_SCHEMA = 'agentic-graph-canvas-agent-graph-projection/v1'
export const AGENT_GRAPH_CANVAS_PREVIEW_SCHEMA = 'agentic-graph-canvas-agent-graph-preview/v1'
export const AGENT_GRAPH_CANVAS_MAX_NODES = 2_000
export const AGENT_GRAPH_CANVAS_MAX_EDGES = 5_000
export const AGENT_GRAPH_CANVAS_MAX_BYTES = AGENT_GRAPH_PROJECTION_MAX_BYTES
export const AGENT_GRAPH_CANVAS_MAX_RECORD_BYTES = 64 * 1024
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

export class AgentGraphProjectionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentGraphProjectionError'
    this.code = code
  }
}
export const cleanString = (value: unknown): string => String(value || '').trim()
const isPlainRecord = (value: unknown): value is Record<string, JSONValue> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)
const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
)
export const isPositiveInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value > 0
)
const byteLength = agentGraphProjectionByteLength
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
export const isLogicalRelativePath = (value: string): boolean => {
  if (!value || value === '.') return true
  const normalized = value.replaceAll('\\', '/')
  return !normalized.startsWith('/')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.startsWith('file:')
    && !normalized.split('/').includes('..')
}

function validateJsonValue(value: unknown, path: string, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new AgentGraphProjectionError('projection-depth-limit', `${path} exceeds the projection nesting limit.`)
  }
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AgentGraphProjectionError('invalid-projection-value', `${path} contains a non-finite number.`)
    }
    return
  }
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING_LENGTH) {
      throw new AgentGraphProjectionError('projection-string-limit', `${path} exceeds the projection string limit.`)
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_LENGTH) {
      throw new AgentGraphProjectionError('projection-array-limit', `${path} exceeds the projection array limit.`)
    }
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, depth + 1))
    return
  }
  if (!isPlainRecord(value)) {
    throw new AgentGraphProjectionError('invalid-projection-value', `${path} is not JSON data.`)
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_JSON_OBJECT_KEYS) {
    throw new AgentGraphProjectionError('projection-object-limit', `${path} exceeds the projection object-key limit.`)
  }
  for (const [key, nested] of entries) {
    if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor' || PRIVATE_PATH_KEY.test(key)) {
      throw new AgentGraphProjectionError('private-path-rejected', `${path}.${key || '<empty>'} is not allowed.`)
    }
    if (LOGICAL_PATH_KEY.test(key) && (typeof nested !== 'string' || !isLogicalRelativePath(nested))) {
      throw new AgentGraphProjectionError('absolute-path-rejected', `${path}.${key} must be repository-relative.`)
    }
    validateJsonValue(nested, `${path}.${key}`, depth + 1)
  }
}
export const cloneJsonRecord = (value: Record<string, JSONValue> | undefined, path: string): Record<string, JSONValue> => {
  if (!value) return {}
  validateJsonValue(value, path)
  return JSON.parse(JSON.stringify(value)) as Record<string, JSONValue>
}
export const cloneNode = (node: GraphNode): GraphNode => ({
  ...node,
  properties: cloneJsonRecord(node.properties, `node:${node.id}.properties`),
  ...(node.metadata ? { metadata: cloneJsonRecord(node.metadata, `node:${node.id}.metadata`) } : {}),
})
export const cloneEdge = (edge: GraphEdge): GraphEdge => ({
  ...edge,
  properties: cloneJsonRecord(edge.properties, `edge:${edge.id}.properties`),
  ...(edge.metadata ? { metadata: cloneJsonRecord(edge.metadata, `edge:${edge.id}.metadata`) } : {}),
})

export function validateCounts(counts: WorkspaceAgentGraphCounts | undefined): WorkspaceAgentGraphCounts {
  if (
    !counts
    || !isNonNegativeInteger(counts.sources)
    || !isNonNegativeInteger(counts.nodes)
    || !isNonNegativeInteger(counts.edges)
  ) {
    throw new AgentGraphProjectionError(
      'invalid-counts',
      'Knowledge graph import did not return valid source, node, and edge counts.',
    )
  }
  return counts
}

export function validateGraphData(
  graphData: GraphData | undefined,
  counts: WorkspaceAgentGraphCounts,
  maxBytes = AGENT_GRAPH_PROJECTION_GRAPH_DATA_MAX_BYTES,
): GraphData {
  if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
    throw new AgentGraphProjectionError(
      'invalid-projection',
      'Knowledge graph import did not return a GraphData projection.',
    )
  }
  if (
    graphData.type !== 'Graph'
    || Object.keys(graphData).some(key => !SAFE_GRAPH_KEYS.has(key))
    || (graphData.context !== undefined && graphData.context !== 'agentic-graph-agent-graph-projection')
  ) {
    throw new AgentGraphProjectionError(
      'invalid-projection-shape',
      'Knowledge graph projection contains unsupported graph fields.',
    )
  }
  if (graphData.nodes.length > AGENT_GRAPH_CANVAS_MAX_NODES) {
    throw new AgentGraphProjectionError(
      'projection-node-limit',
      `Knowledge graph Canvas projection exceeds ${AGENT_GRAPH_CANVAS_MAX_NODES} nodes.`,
    )
  }
  if (graphData.edges.length > AGENT_GRAPH_CANVAS_MAX_EDGES) {
    throw new AgentGraphProjectionError(
      'projection-edge-limit',
      `Knowledge graph Canvas projection exceeds ${AGENT_GRAPH_CANVAS_MAX_EDGES} edges.`,
    )
  }
  if (graphData.nodes.length > counts.nodes || graphData.edges.length > counts.edges) {
    throw new AgentGraphProjectionError(
      'projection-count-mismatch',
      'Knowledge graph projection contains more records than the canonical snapshot counts.',
    )
  }
  if (byteLength(graphData) > maxBytes) {
    throw new AgentGraphProjectionError(
      'projection-byte-limit',
      `Knowledge graph Canvas projection exceeds ${AGENT_GRAPH_CANVAS_MAX_BYTES} bytes.`,
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
      || byteLength(node) > AGENT_GRAPH_CANVAS_MAX_RECORD_BYTES
    ) {
      throw new AgentGraphProjectionError(
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
      || byteLength(edge) > AGENT_GRAPH_CANVAS_MAX_RECORD_BYTES
    ) {
      throw new AgentGraphProjectionError(
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
      throw new AgentGraphProjectionError(
        'edge-evidence-required',
        `Knowledge graph edge ${edgeId} lacks canonical source and explanation evidence.`,
      )
    }
    edgeIds.add(edgeId)
  }
  return graphData
}

export function buildAgentGraphCanvasProjection(
  result: WorkspaceAgentGraphImportResult,
): GraphData {
  if (!result || result.handled !== true || result.kind !== 'agent-graph') {
    throw new AgentGraphProjectionError(
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
    throw new AgentGraphProjectionError(
      'invalid-snapshot-identity',
      'Knowledge graph import returned an invalid graph, snapshot, or parser-registry identity.',
    )
  }
  if (result.complete !== true) {
    throw new AgentGraphProjectionError(
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
    throw new AgentGraphProjectionError(
      'invalid-projection-identity',
      'Knowledge graph import did not return an identified read-only projection.',
    )
  }
  const graphData = validateGraphData(result.projection.graphData, counts)
  const metadata = cloneJsonRecord(graphData.metadata, 'graph.metadata')
  const projected: GraphData = {
    ...graphData,
    metadata: {
      ...metadata,
      kind: 'agent-graph',
      source: graphId,
      agentGraphProjection: {
        schema: AGENT_GRAPH_CANVAS_PROJECTION_SCHEMA,
        owner: 'agent-graph-runtime',
        readOnly: true,
        graphId,
        snapshotDigest: snapshotDigest.toLowerCase(),
        parserRegistryDigest: parserRegistryDigest.toLowerCase(),
        ...(result.observation ? { observation: normalizeAgentGraphObservation(result.observation) } : {}),
        ...(result.acquisition ? { acquisition: result.acquisition } : {}),
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
    nodes: graphData.nodes.map(cloneAgentGraphNodeWithDirectory),
    edges: graphData.edges.map(cloneEdge),
  }
  return validateGraphData(styleAgentGraphProjection(projected), counts, AGENT_GRAPH_CANVAS_MAX_BYTES)
}
/** Source grouping is view metadata, derived equally for new and retained projections. */
export function cloneAgentGraphNodeWithDirectory(node: GraphNode): GraphNode {
  return styleAgentGraphNode(cloneNode(node))
}

