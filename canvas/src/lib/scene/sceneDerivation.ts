import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { createLayoutGroupKeyOfNode, selectLayoutGroups } from '@/components/GraphCanvas/layout/layoutGroupKey'
import { getGraphDataForDisplay } from '@/components/GraphCanvas/displayFilter'
import { LRUCache } from '@/lib/cache/LRUCache'
import { buildGraphMetaKey } from '@/lib/graph/graphMetaKey'
import { applySchemaGroupBoundsOverrides, readSchemaGroupBoundsOverrides } from '@/lib/canvas/groupBoundsOverrides'
import { SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES } from '@/lib/config.render'
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { isPlainObject } from '@/lib/graph/value'
import { buildSubgraphsKey } from '@/lib/graph/subgraphs'

export type SceneGroupsDerivation = {
  key: string
  allGroups: GraphGroup[]
  layoutGroups: GraphGroup[]
  layoutGroupKeyByNodeId: Record<string, string>
}

export type SceneDisplayGraphDerivation = {
  graphData: GraphData
  displayGraphData: GraphData
  displayNodes: GraphNode[]
  displayEdges: GraphEdge[]
  displayNodeIdSet: Set<string>
  nodeIndexById: Map<string, number>
  edgeIndexById: Map<string, number>
  nodeById: Map<string, GraphNode>
}

const cache = new LRUCache<string, SceneGroupsDerivation>(128)

const EMPTY_EDGES: GraphEdge[] = []

const displayGraphCache = new WeakMap<object, WeakMap<GraphEdge[], SceneDisplayGraphDerivation>>()

const buildKey = (args: {
  graphData: GraphData
  graphDataRevision: number
  schema: GraphSchema
  documentSemanticMode: string
  frontmatterModeEnabled: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
  resolvedThemeMode?: 'light' | 'dark'
}): string => {
  const g = args.graphData
  const nodesLen = Array.isArray(g.nodes) ? g.nodes.length : 0
  const edgesLen = Array.isArray(g.edges) ? g.edges.length : 0
  const metaKey = buildGraphMetaKey(g)
  const meta = toMetadataRecord(g.metadata)
  const layerHash = typeof meta.sourceLayerHash === 'string' ? meta.sourceLayerHash.trim() : ''
  const revKey = `rev:${String(args.graphDataRevision || 0)}`
  const layerKey = layerHash ? `h:${layerHash}` : ''
  const schemaGroupsKey = JSON.stringify(args.schema?.layout?.groups || null)
  const subgraphsKey = buildSubgraphsKey(g)
  const boundsOverridesKey = (() => {
    const schemaMeta = toMetadataRecord((args.schema as unknown as { metadata?: unknown })?.metadata)
    const raw = schemaMeta[SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES]
    if (!isPlainObject(raw)) return ''
    try {
      return JSON.stringify(raw)
    } catch {
      return ''
    }
  })()
  const documentViewMode = readDocumentViewModeContext({
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentSemanticMode: String(args.documentSemanticMode || 'document'),
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
  })
  const semanticViewModeKey = documentViewMode.documentSemanticViewModeKey
  return [
    revKey,
    layerKey,
    `meta:${metaKey}`,
    `n:${String(nodesLen)}`,
    `e:${String(edgesLen)}`,
    `view:${semanticViewModeKey}`,
    `theme:${String(args.resolvedThemeMode || '')}`,
    `groups:${schemaGroupsKey}`,
    `subgraphs:${subgraphsKey}`,
    boundsOverridesKey ? `groupBounds:${boundsOverridesKey}` : '',
  ].filter(Boolean).join('|')
}

export const deriveSceneGroups = (args: {
  graphData: GraphData | null
  graphDataRevision: number
  schema: GraphSchema
  documentSemanticMode: string
  frontmatterModeEnabled: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
  resolvedThemeMode?: 'light' | 'dark'
}): SceneGroupsDerivation | null => {
  const g = args.graphData
  if (!g) return null
  const key = buildKey({
    graphData: g,
    graphDataRevision: args.graphDataRevision,
    schema: args.schema,
    documentSemanticMode: args.documentSemanticMode,
    frontmatterModeEnabled: args.frontmatterModeEnabled,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled,
    documentStructureBaselineLock: args.documentStructureBaselineLock,
    resolvedThemeMode: args.resolvedThemeMode,
  })
  const cached = cache.get(key)
  if (cached) return cached

  const documentViewMode = readDocumentViewModeContext({
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentSemanticMode: String(args.documentSemanticMode || 'document'),
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
  })
  const boundsById = readSchemaGroupBoundsOverrides(args.schema)
  const allGroupsBase = deriveGraphGroups(g, {
    forceDocumentStructure: documentViewMode.forceDocumentStructureGroups,
    themeMode: args.resolvedThemeMode,
  })
  const allGroups = applySchemaGroupBoundsOverrides(allGroupsBase, boundsById)
  const layoutGroupsBase = selectLayoutGroups({ graphData: g, schema: args.schema, groups: allGroups })
  const layoutGroups = applySchemaGroupBoundsOverrides(layoutGroupsBase, boundsById)
  const keyOfNode = createLayoutGroupKeyOfNode({ graphData: g, schema: args.schema, groups: allGroups })

  const nodes = Array.isArray(g.nodes) ? (g.nodes as GraphNode[]) : ([] as GraphNode[])
  const byId: Record<string, string> = {}
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    const id = String(n?.id || '').trim()
    if (!id) continue
    const k = keyOfNode(n)
    if (k) byId[id] = k
  }

  const derived: SceneGroupsDerivation = {
    key,
    allGroups,
    layoutGroups,
    layoutGroupKeyByNodeId: byId,
  }
  cache.set(key, derived)
  return derived
}

const getEdgesSource = (args: { graphData: GraphData; edges?: GraphEdge[] | null }): GraphEdge[] => {
  if (Array.isArray(args.edges)) return args.edges
  if (Array.isArray(args.graphData.edges)) return args.graphData.edges as GraphEdge[]
  return EMPTY_EDGES
}

export const deriveSceneDisplayGraph = (args: {
  graphData: GraphData | null
  edges?: GraphEdge[] | null
}): SceneDisplayGraphDerivation | null => {
  const graphData = args.graphData
  if (!graphData) return null

  const edgesSource = getEdgesSource({ graphData, edges: args.edges })
  const graphKey = graphData as unknown as object

  const perGraph = displayGraphCache.get(graphKey) || new WeakMap<GraphEdge[], SceneDisplayGraphDerivation>()
  if (!displayGraphCache.has(graphKey)) displayGraphCache.set(graphKey, perGraph)

  const cached = perGraph.get(edgesSource)
  if (cached) return cached

  const overrideEdges = Array.isArray(args.edges) ? args.edges : null
  const displayGraphData = getGraphDataForDisplay({ graphData, edges: overrideEdges })
  const displayNodes = Array.isArray(displayGraphData.nodes) ? (displayGraphData.nodes as GraphNode[]) : ([] as GraphNode[])
  const displayEdges = Array.isArray(displayGraphData.edges) ? (displayGraphData.edges as GraphEdge[]) : ([] as GraphEdge[])

  const displayLookup = getCachedGraphLookup({
    cacheScope: 'scene-derivation-display-graph',
    graphData: displayGraphData,
  })
  const displayNodeIdSet = new Set<string>()
  const nodeIndexById = new Map<string, number>()
  const nodeById = displayLookup?.nodeById || new Map<string, GraphNode>()
  for (let i = 0; i < displayNodes.length; i += 1) {
    const n = displayNodes[i]
    const id = String(n?.id || '').trim()
    if (!id) continue
    displayNodeIdSet.add(id)
    if (!nodeIndexById.has(id)) nodeIndexById.set(id, i)
  }

  const edgeIndexById = new Map<string, number>()
  for (let i = 0; i < displayEdges.length; i += 1) {
    const e = displayEdges[i] as unknown as { id?: unknown }
    const id = typeof e?.id === 'string' ? e.id.trim() : String(e?.id || '').trim()
    if (!id) continue
    if (!edgeIndexById.has(id)) edgeIndexById.set(id, i)
  }

  const derived: SceneDisplayGraphDerivation = {
    graphData,
    displayGraphData,
    displayNodes,
    displayEdges,
    displayNodeIdSet,
    nodeIndexById,
    edgeIndexById,
    nodeById,
  }

  perGraph.set(edgesSource, derived)
  return derived
}
