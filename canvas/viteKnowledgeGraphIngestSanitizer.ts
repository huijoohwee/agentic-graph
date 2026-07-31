import { SOURCE_PARSER_REGISTRY } from '../mcp/knowledge-graph/source-parser-registry.mjs'

const MAX_PROJECTION_BYTES = 2 * 1024 * 1024
const MAX_PROJECTION_NODES = 2_000
const MAX_PROJECTION_EDGES = 5_000
const KNOWLEDGE_GRAPH_IMPORT_PROGRESS_SCHEMA = 'knowgrph-knowledge-graph-import-progress/v1'
const PRIVATE_PATH_KEY = /^(?:artifactPath|outputPath|rootPath|storePath|absolutePath|createdPaths|removedPaths)$/i
const LOGICAL_PATH_KEY = /(?:^|:)(?:sourcePath|repositoryPath)$/
const MAX_PROGRESS_DEPTH = 8
const MAX_PROGRESS_STRING_LENGTH = 16_384
const MAX_PROGRESS_ARRAY_LENGTH = 2_048
const MAX_PROGRESS_OBJECT_KEYS = 256

export type KnowledgeGraphIngestSanitizerFailure = (
  code: string,
  message: string,
  status?: number,
) => never

type SanitizerOptions = {
  fail: KnowledgeGraphIngestSanitizerFailure
  expectedParserRegistryDigest?: string
}

const invalidResult = (options: SanitizerOptions, message: string): never => (
  options.fail('invalid-runtime-result', message, 502)
)

const invalidProgress = (options: SanitizerOptions, message: string): never => (
  options.fail('invalid-progress-frame', message, 502)
)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isLogicalRelativePath(value: string): boolean {
  if (!value || value === '.') return true
  const normalized = value.replaceAll('\\', '/')
  return !normalized.startsWith('/')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.startsWith('file:')
    && !normalized.split('/').includes('..')
}

export function sanitizeKnowledgeGraphImportResult(
  value: unknown,
  options: SanitizerOptions,
): Record<string, unknown> {
  const expectedParserRegistryDigest = options.expectedParserRegistryDigest || SOURCE_PARSER_REGISTRY.digest
  const result = value as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    const error = result?.error as { code?: unknown; message?: unknown } | undefined
    options.fail(
      String(error?.code || 'ingest-failed'),
      String(error?.message || 'Knowledge graph ingestion failed.'),
      422,
    )
  }
  const graphId = String(result.graphId || '')
  const snapshotDigest = String(result.snapshotDigest || '')
  const parserRegistryDigest = String(result.parserRegistryDigest || '')
  const counts = result.counts as Record<string, unknown> | undefined
  const projection = result.projection as Record<string, unknown> | undefined
  const graphData = projection?.graphData as Record<string, unknown> | undefined
  if (
    !/^kg:graph:[0-9a-f]{32}$/.test(graphId)
    || !/^[0-9a-f]{64}$/.test(snapshotDigest)
    || !/^[0-9a-f]{64}$/.test(parserRegistryDigest)
    || parserRegistryDigest !== expectedParserRegistryDigest
    || typeof result.complete !== 'boolean'
    || !counts
    || !projection
    || projection.readOnly !== true
    || !/^kg:projection:[0-9a-f]{24}$/.test(String(projection.token || ''))
    || typeof projection.complete !== 'boolean'
    || typeof projection.truncated !== 'boolean'
    || !Number.isInteger(Number(projection.limit))
    || Number(projection.limit) < 1
    || Number(projection.limit) > 1_000
    || (projection.reason !== undefined && typeof projection.reason !== 'string')
    || graphData?.type !== 'Graph'
    || !Array.isArray(graphData.nodes)
    || !Array.isArray(graphData.edges)
    || graphData.nodes.length > MAX_PROJECTION_NODES
    || graphData.edges.length > MAX_PROJECTION_EDGES
  ) {
    return invalidResult(options, 'The canonical runtime returned an invalid ingest result.')
  }
  const sourceCount = Number(counts.sources)
  const nodeCount = Number(counts.nodes)
  const edgeCount = Number(counts.edges)
  if (![sourceCount, nodeCount, edgeCount].every(entry => Number.isInteger(entry) && entry >= 0)) {
    return invalidResult(options, 'The canonical runtime returned invalid graph counts.')
  }
  const safeProjection = {
    token: String(projection.token),
    readOnly: true,
    graphData: {
      context: graphData.context,
      type: 'Graph',
      nodes: graphData.nodes,
      edges: graphData.edges,
    },
    complete: projection.complete,
    truncated: projection.truncated,
    limit: Number(projection.limit),
    ...(projection.reason ? { reason: String(projection.reason).slice(0, 200) } : {}),
  }
  if (Buffer.byteLength(JSON.stringify(safeProjection)) > MAX_PROJECTION_BYTES) {
    return invalidResult(options, 'The canonical runtime projection exceeded its browser byte limit.')
  }
  return {
    handled: true,
    kind: 'knowledge-graph',
    graphId,
    snapshotDigest,
    parserRegistryDigest,
    complete: result.complete,
    counts: { sources: sourceCount, nodes: nodeCount, edges: edgeCount },
    projection: safeProjection,
  }
}

function cloneProgressJson(value: unknown, pathLabel: string, options: SanitizerOptions, depth = 0): unknown {
  if (depth > MAX_PROGRESS_DEPTH) {
    return invalidProgress(options, `${pathLabel} exceeded the progress nesting limit.`)
  }
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return invalidProgress(options, `${pathLabel} contained a non-finite number.`)
    return value
  }
  if (typeof value === 'string') {
    if (value.length > MAX_PROGRESS_STRING_LENGTH) {
      return invalidProgress(options, `${pathLabel} exceeded the progress string limit.`)
    }
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PROGRESS_ARRAY_LENGTH) {
      return invalidProgress(options, `${pathLabel} exceeded the progress array limit.`)
    }
    return value.map((entry, index) => cloneProgressJson(entry, `${pathLabel}[${index}]`, options, depth + 1))
  }
  if (!isPlainRecord(value)) return invalidProgress(options, `${pathLabel} was not JSON data.`)
  const entries = Object.entries(value)
  if (entries.length > MAX_PROGRESS_OBJECT_KEYS) {
    return invalidProgress(options, `${pathLabel} exceeded the progress object-key limit.`)
  }
  const cloned: Record<string, unknown> = {}
  for (const [key, nested] of entries) {
    if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor' || PRIVATE_PATH_KEY.test(key)) {
      return invalidProgress(options, `${pathLabel}.${key || '<empty>'} is not allowed.`)
    }
    if (LOGICAL_PATH_KEY.test(key) && (typeof nested !== 'string' || !isLogicalRelativePath(nested))) {
      return invalidProgress(options, `${pathLabel}.${key} must be repository-relative.`)
    }
    cloned[key] = cloneProgressJson(nested, `${pathLabel}.${key}`, options, depth + 1)
  }
  return cloned
}

function requiredProgressString(
  value: unknown,
  pathLabel: string,
  options: SanitizerOptions,
  maxLength = 1_024,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value !== value.trim()) {
    return invalidProgress(options, `${pathLabel} must be a canonical string.`)
  }
  return value
}

function stableRecordOrder(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function sanitizeProgressNode(
  value: unknown,
  index: number,
  options: SanitizerOptions,
): Record<string, unknown> & { id: string } {
  if (!isPlainRecord(value)) return invalidProgress(options, `fragment.nodes[${index}] must be an object.`)
  const id = requiredProgressString(value.id, `fragment.nodes[${index}].id`, options)
  const label = requiredProgressString(value.label, `fragment.nodes[${index}].label`, options, MAX_PROGRESS_STRING_LENGTH)
  const type = requiredProgressString(value.type, `fragment.nodes[${index}].type`, options)
  if (!isPlainRecord(value.properties)) {
    return invalidProgress(options, `fragment.nodes[${index}].properties must be an object.`)
  }
  const node: Record<string, unknown> & { id: string } = {
    id,
    label,
    type,
    properties: cloneProgressJson(value.properties, `fragment.nodes[${index}].properties`, options),
  }
  if (value.metadata !== undefined) {
    node.metadata = cloneProgressJson(value.metadata, `fragment.nodes[${index}].metadata`, options)
  }
  return node
}

function sanitizeProgressEdge(
  value: unknown,
  index: number,
  options: SanitizerOptions,
): Record<string, unknown> & { id: string; source: string; target: string } {
  if (!isPlainRecord(value)) return invalidProgress(options, `fragment.edges[${index}] must be an object.`)
  const id = requiredProgressString(value.id, `fragment.edges[${index}].id`, options)
  const source = requiredProgressString(value.source, `fragment.edges[${index}].source`, options)
  const target = requiredProgressString(value.target, `fragment.edges[${index}].target`, options)
  const label = requiredProgressString(value.label, `fragment.edges[${index}].label`, options, MAX_PROGRESS_STRING_LENGTH)
  if (value.type !== undefined) requiredProgressString(value.type, `fragment.edges[${index}].type`, options)
  if (!isPlainRecord(value.properties)) {
    return invalidProgress(options, `fragment.edges[${index}].properties must be an object.`)
  }
  const edge: Record<string, unknown> & { id: string; source: string; target: string } = {
    id,
    source,
    target,
    label,
    properties: cloneProgressJson(value.properties, `fragment.edges[${index}].properties`, options),
  }
  if (value.type !== undefined) edge.type = value.type
  if (value.metadata !== undefined) {
    edge.metadata = cloneProgressJson(value.metadata, `fragment.edges[${index}].metadata`, options)
  }
  return edge
}

export function sanitizeKnowledgeGraphImportProgress(
  value: unknown,
  options: SanitizerOptions,
): Record<string, unknown> {
  const expectedParserRegistryDigest = options.expectedParserRegistryDigest || SOURCE_PARSER_REGISTRY.digest
  const progress = value as Record<string, unknown> | null
  const fragment = progress?.fragment
  if (
    !progress
    || progress.schema !== KNOWLEDGE_GRAPH_IMPORT_PROGRESS_SCHEMA
    || progress.kind !== 'source-parsed'
    || !/^kg:graph:[0-9a-f]{32}$/.test(String(progress.graphId || ''))
    || !/^[0-9a-f]{64}$/.test(String(progress.parserRegistryDigest || ''))
    || progress.parserRegistryDigest !== expectedParserRegistryDigest
    || typeof progress.sourcePath !== 'string'
    || !progress.sourcePath
    || !isLogicalRelativePath(progress.sourcePath)
    || !Number.isInteger(progress.sourceIndex)
    || Number(progress.sourceIndex) < 1
    || !Number.isInteger(progress.sourceTotal)
    || Number(progress.sourceTotal) < Number(progress.sourceIndex)
    || !isPlainRecord(fragment)
    || !Array.isArray(fragment.nodes)
    || !Array.isArray(fragment.edges)
  ) {
    return invalidProgress(options, 'The canonical runtime returned an invalid ingest progress frame.')
  }
  const nodeById = new Map<string, Record<string, unknown> & { id: string }>()
  for (const [index, candidate] of fragment.nodes.entries()) {
    const node = sanitizeProgressNode(candidate, index, options)
    if (nodeById.has(node.id)) return invalidProgress(options, 'The canonical runtime returned duplicate progress nodes.')
    nodeById.set(node.id, node)
  }
  const edgeById = new Map<string, Record<string, unknown> & { id: string; source: string; target: string }>()
  for (const [index, candidate] of fragment.edges.entries()) {
    const edge = sanitizeProgressEdge(candidate, index, options)
    if (edgeById.has(edge.id)) return invalidProgress(options, 'The canonical runtime returned duplicate progress edges.')
    edgeById.set(edge.id, edge)
  }
  let truncated = false
  let nodes = [...nodeById.values()].sort(stableRecordOrder)
  if (nodes.length > MAX_PROJECTION_NODES) {
    nodes = nodes.slice(0, MAX_PROJECTION_NODES)
    truncated = true
  }
  const nodeIds = new Set(nodes.map(node => node.id))
  const candidateEdges = [...edgeById.values()].sort(stableRecordOrder)
  let edges = candidateEdges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  if (edges.length !== candidateEdges.length) truncated = true
  if (edges.length > MAX_PROJECTION_EDGES) {
    edges = edges.slice(0, MAX_PROJECTION_EDGES)
    truncated = true
  }
  const graphData = () => ({
    context: 'knowgrph-knowledge-graph-projection',
    type: 'Graph',
    nodes,
    edges,
  })
  while (Buffer.byteLength(JSON.stringify(graphData())) > MAX_PROJECTION_BYTES) {
    truncated = true
    if (edges.length) {
      edges = edges.slice(0, -1)
      continue
    }
    if (nodes.length) {
      nodes = nodes.slice(0, -1)
      const retainedNodeIds = new Set(nodes.map(node => node.id))
      edges = edges.filter(edge => retainedNodeIds.has(edge.source) && retainedNodeIds.has(edge.target))
      continue
    }
    return invalidProgress(options, 'The canonical runtime returned an oversized empty progress frame.')
  }
  return {
    schema: KNOWLEDGE_GRAPH_IMPORT_PROGRESS_SCHEMA,
    kind: 'source-parsed',
    graphId: String(progress.graphId),
    parserRegistryDigest: String(progress.parserRegistryDigest),
    sourcePath: progress.sourcePath,
    sourceIndex: Number(progress.sourceIndex),
    sourceTotal: Number(progress.sourceTotal),
    truncated,
    graphData: graphData(),
  }
}
