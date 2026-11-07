import { load as parseYaml } from 'js-yaml'
import { useGraphStore } from '@/hooks/useGraphStore'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { extractYamlFrontmatterHeaderBlock } from '@/lib/markdown/frontmatter'
import { prepareAgentGraphCanvasView } from '@/features/agent-graph/agentGraphCanvasProjection'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'

const PROJECTION_PATH = '/docs/hackamap/manifest.graph.json'
const PROJECTION_SCHEMA = 'hackamap-domain-graph-projection/v1'
const PROJECTION_BYTE_LIMIT = 500_000
const NODE_LIMIT = 5_000
const EDGE_LIMIT = 20_000

function graphSourceForManifest(name: string): string {
  return `hackamap-domain:${String(name || '').trim().replace(/^\/+/, '')}`
}

type DomainProjection = {
  schema: string
  source_path: string
  source_sha256: string
  node_count: number
  edge_count: number
  node_types: string[]
  link_types: string[]
  nodes: unknown[]
  edges: unknown[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isCount = (value: unknown, limit: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= limit

async function sha256(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable for the HackaMap graph projection.')
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
}

function graphFromProjection(projection: DomainProjection, documentName: string): GraphData {
  if (!Array.isArray(projection.node_types) || !Array.isArray(projection.link_types)
    || !Array.isArray(projection.nodes) || !Array.isArray(projection.edges)
    || projection.nodes.length !== projection.node_count || projection.edges.length !== projection.edge_count) {
    throw new Error('HackaMap graph projection record counts do not match its manifest.')
  }
  const nodeIds = new Set<string>()
  const nodes: GraphNode[] = projection.nodes.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 4) throw new Error(`Invalid HackaMap node record at index ${index}.`)
    const [id, typeIndex, label, properties] = row
    const type = isCount(typeIndex, projection.node_types.length - 1) ? projection.node_types[typeIndex] : null
    if (typeof id !== 'string' || !id || id.length > 512 || nodeIds.has(id)
      || typeof type !== 'string' || !type || type.length > 80
      || typeof label !== 'string' || label.length > 2_000 || !isRecord(properties)) {
      throw new Error(`Invalid HackaMap node identity at index ${index}.`)
    }
    nodeIds.add(id)
    const community = typeof properties['visual:community'] === 'string' ? properties['visual:community'] : ''
    return {
      id,
      type,
      label,
      properties: {
        ...properties as Record<string, JSONValue>,
        ...(community ? { 'visual:communityLabel': community } : {}),
      },
    }
  })
  const edges: GraphEdge[] = projection.edges.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 3) throw new Error(`Invalid HackaMap relationship record at index ${index}.`)
    const [sourceIndex, targetIndex, typeIndex] = row
    const type = isCount(typeIndex, projection.link_types.length - 1) ? projection.link_types[typeIndex] : null
    if (!isCount(sourceIndex, nodes.length - 1) || !isCount(targetIndex, nodes.length - 1)
      || typeof type !== 'string' || !type || type.length > 120) {
      throw new Error(`Invalid HackaMap relationship endpoint at index ${index}.`)
    }
    return {
      id: `hackamap-edge:${index + 1}`,
      source: nodes[sourceIndex]!.id,
      target: nodes[targetIndex]!.id,
      label: type,
      type,
      properties: {},
    }
  })
  return {
    type: 'Graph',
    context: 'hackamap-domain-graph',
    metadata: {
      kind: 'hackamap-domain',
      graphKind: 'hackamap-domain',
      source: graphSourceForManifest(documentName),
      hackamapDomainProjection: {
        schema: PROJECTION_SCHEMA,
        owner: 'hackamap-domain-workspace',
        readOnly: true,
        sourcePath: projection.source_path,
        sourceSha256: projection.source_sha256,
        nodeCount: projection.node_count,
        edgeCount: projection.edge_count,
      },
    },
    nodes,
    edges,
  }
}

/** Restores the HackaMap source graph from its bounded, digest-bound workspace companion. */
export async function restoreHackamapDomainWorkspaceDocument(name: string, text: string): Promise<boolean | null> {
  const header = extractYamlFrontmatterHeaderBlock(text)
  if (!header || header.yamlText.length > 40_000) return null
  const meta = parseYaml(header.yamlText) as Record<string, unknown> | null
  if (meta?.document_type !== 'hackamap-domain-manifest') return null
  if (meta.hackamap_projection !== PROJECTION_PATH
    || typeof meta.hackamap_projection_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(meta.hackamap_projection_sha256)
    || !isCount(meta.hackamap_node_count, NODE_LIMIT)
    || !isCount(meta.hackamap_edge_count, EDGE_LIMIT)) {
    throw new Error('Invalid HackaMap graph manifest identity or projection bounds.')
  }

  const current = useGraphStore.getState().graphData
  const identity = current?.metadata?.hackamapDomainProjection as Record<string, unknown> | undefined
  if (identity?.owner === 'hackamap-domain-workspace'
    && identity.digest === meta.hackamap_projection_sha256
    && identity.nodeCount === meta.hackamap_node_count
    && identity.edgeCount === meta.hackamap_edge_count
    && current?.nodes.length === meta.hackamap_node_count
    && current?.edges.length === meta.hackamap_edge_count) {
    const source = graphSourceForManifest(name)
    if (current.metadata?.source !== source) {
      useGraphStore.getState().setGraphData({
        ...current,
        metadata: {
          ...current.metadata,
          source,
          markdownDocumentName: name,
        },
      })
    }
    prepareAgentGraphCanvasView()
    useGraphStore.getState().requestZoom('fit', { intent: 'fitToView' })
    return true
  }

  const projectionText = await (await getWorkspaceFs()).readFileText(PROJECTION_PATH)
  if (!projectionText || new TextEncoder().encode(projectionText).byteLength >= PROJECTION_BYTE_LIMIT) {
    throw new Error('HackaMap domain projection is missing or exceeds its 500 kB budget.')
  }
  if (await sha256(projectionText) !== meta.hackamap_projection_sha256) {
    throw new Error('HackaMap domain projection digest does not match its manifest.')
  }
  const projection = JSON.parse(projectionText) as DomainProjection
  if (!isRecord(projection) || projection.schema !== PROJECTION_SCHEMA
    || projection.source_path !== meta.hackamap_source_path
    || typeof projection.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(projection.source_sha256)
    || projection.node_count !== meta.hackamap_node_count
    || projection.edge_count !== meta.hackamap_edge_count
    || !isCount(projection.node_count, NODE_LIMIT) || !isCount(projection.edge_count, EDGE_LIMIT)) {
    throw new Error('HackaMap domain projection metadata is invalid.')
  }
  const graph = graphFromProjection(projection, name)
  const active = useGraphStore.getState()
  if (active.markdownDocumentName !== name || active.markdownDocumentText !== text) return false
  graph.metadata!.hackamapDomainProjection = {
    ...graph.metadata!.hackamapDomainProjection as Record<string, JSONValue>,
    digest: meta.hackamap_projection_sha256,
  }
  prepareAgentGraphCanvasView()
  active.setGraphData(graph)
  const committed = useGraphStore.getState().graphData!
  persistGraphDataToLocalStorage(committed)
  useGraphStore.getState().requestZoom('fit', { intent: 'fitToView' })
  return true
}
