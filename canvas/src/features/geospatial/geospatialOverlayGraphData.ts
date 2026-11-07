import type { GraphData, GraphNode, GraphEdge, JSONValue } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import { buildGraphDataFromFeatureCollection } from '@/lib/graph/io/geojsonToGraphData'
import { hashSignatureParts } from '@/lib/hash/signature'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { buildSourceFilesGeospatialSelectionSignature } from '@/features/source-files/sourceFilesSignatures'
import {
  analyzeMarkdownGeodataSources,
  buildMarkdownGeodataAnalysisCacheSignature,
  buildMarkdownGeodataCandidateProfile,
  type MarkdownGeodataAnalysis,
  type MarkdownGeodataCandidateProfile,
} from '@/lib/markdown/markdownGeodataAnalysis'
import { normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'
import { resolveGeospatialSourceContext } from '@/features/source-files/geospatialSourceContext'
import { buildMarkdownGeoFeatureCollectionGraphSourceHash } from './markdownGeoContentSignature'

const GEOSPATIAL_OVERLAY_GRAPH_CACHE_LIMIT = 12
const GEOSPATIAL_OVERLAY_SUPPLEMENT_GRAPH_CACHE_LIMIT = 24
const geospatialOverlayGraphCache = new Map<string, GraphData>()
const geospatialOverlaySupplementGraphCache = new Map<string, GraphData>()

const hasGeoCoordinates = (graphData: GraphData | null | undefined): boolean => {
  const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
  for (let i = 0; i < nodes.length; i += 1) {
    const props = (nodes[i]?.properties || {}) as Record<string, unknown>
    const geo = props.geo as Record<string, unknown> | null
    if (!geo || typeof geo !== 'object') continue
    const lat = Number(geo.lat)
    const lng = Number(geo.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return true
  }
  return false
}

const withoutGeoCoordinateNodes = (graphData: GraphData): GraphData => {
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes as GraphNode[] : []
  const removedIds = new Set<string>()
  let removedAny = false
  const retainedNodes = nodes.filter(node => {
    const props = (node?.properties || {}) as Record<string, unknown>
    const geo = props.geo as Record<string, unknown> | null
    const hasCoordinates = !!geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng))
    if (hasCoordinates) {
      removedAny = true
      if (node.id) removedIds.add(String(node.id))
    }
    return !hasCoordinates
  })
  const retainedEdges = removedAny
    ? (Array.isArray(graphData.edges) ? graphData.edges : []).filter(edge =>
        !removedIds.has(String(edge.source || '')) && !removedIds.has(String(edge.target || '')),
      )
    : graphData.edges
  const metadata = graphData.metadata && typeof graphData.metadata === 'object'
    ? { ...graphData.metadata }
    : null
  if (metadata) delete metadata.kgGeospatialAreaFeatures
  const clearedAreaFeatures = !!graphData.metadata?.kgGeospatialAreaFeatures
  if (!removedAny && !clearedAreaFeatures) return graphData
  return {
    ...graphData,
    nodes: removedAny ? retainedNodes : graphData.nodes,
    edges: retainedEdges,
    ...(metadata ? { metadata } : {}),
  }
}

export type GeospatialOverlayGraphDebugInfo = {
  resolvedFrom: 'direct' | 'sourceFiles' | 'sourceFiles-graph' | 'none'
  sourceDocumentPath: string
  embeddedGeoBlockCount: number
  supplementedNodeCount: number
  sourceFilesCount: number
}

const normalizeWorkspaceDocLike = (value: string): string => normalizeComposedSourcePath(value)

const readCachedGeospatialOverlayGraphData = (cacheKey: string): GraphData | null => {
  const cached = geospatialOverlayGraphCache.get(cacheKey) || null
  if (!cached) return null
  geospatialOverlayGraphCache.delete(cacheKey)
  geospatialOverlayGraphCache.set(cacheKey, cached)
  return cached
}

const writeCachedGeospatialOverlayGraphData = (cacheKey: string, graphData: GraphData): GraphData => {
  geospatialOverlayGraphCache.set(cacheKey, graphData)
  if (geospatialOverlayGraphCache.size > GEOSPATIAL_OVERLAY_GRAPH_CACHE_LIMIT) {
    const oldestKey = geospatialOverlayGraphCache.keys().next().value
    if (typeof oldestKey === 'string') geospatialOverlayGraphCache.delete(oldestKey)
  }
  return graphData
}

const readCachedGeospatialOverlaySupplementGraphData = (cacheKey: string): GraphData | null => {
  const cached = geospatialOverlaySupplementGraphCache.get(cacheKey) || null
  if (!cached) return null
  geospatialOverlaySupplementGraphCache.delete(cacheKey)
  geospatialOverlaySupplementGraphCache.set(cacheKey, cached)
  return cached
}

const writeCachedGeospatialOverlaySupplementGraphData = (cacheKey: string, graphData: GraphData): GraphData => {
  geospatialOverlaySupplementGraphCache.set(cacheKey, graphData)
  if (geospatialOverlaySupplementGraphCache.size > GEOSPATIAL_OVERLAY_SUPPLEMENT_GRAPH_CACHE_LIMIT) {
    const oldestKey = geospatialOverlaySupplementGraphCache.keys().next().value
    if (typeof oldestKey === 'string') geospatialOverlaySupplementGraphCache.delete(oldestKey)
  }
  return graphData
}

const buildGeospatialOverlayGraphCacheKey = (args: {
  graphData: GraphData
  graphRevision?: number | null
  graphSemanticKey?: string | null
  markdownText?: string | null
  sourceDocumentPath?: string | null
  sourceFiles?: SourceFile[] | null
  markdownAnalysisCacheSignature?: string | null
  skipMarkdownAnalysis?: boolean | null
  skipSourceFiles?: boolean | null
}): string => {
  const baseGraphKey = buildScopedGraphSemanticKey('geospatial-overlay-base-graph', {
    graphData: args.graphData,
    graphRevision: args.graphRevision,
    graphSemanticKey: args.graphSemanticKey,
  })
  const markdownText = args.skipMarkdownAnalysis ? '' : String(args.markdownText || '')
  const sourceDocumentPath = normalizeWorkspaceDocLike(String(args.sourceDocumentPath || ''))
  const sourceFilesSignature = args.skipSourceFiles
    ? `source-files-count:${Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0}`
    : buildSourceFilesGeospatialSelectionSignature(args.sourceFiles)
  return hashSignatureParts([
    'geospatial-overlay-graph-data',
    baseGraphKey,
    sourceDocumentPath,
    markdownText
      ? String(args.markdownAnalysisCacheSignature || '').trim() || buildMarkdownGeodataAnalysisCacheSignature({
          markdownText,
          sourceDocumentPath,
          embeddedGeoLimit: 8,
          poiTableLimit: 3,
          poiRowLimit: 400,
        })
      : '',
    sourceFilesSignature,
  ])
}

const buildGeospatialOverlaySupplementGraphCacheKey = (args: {
  sourceDocumentPath: string
  analysisCacheSignature: string
}): string => {
  return hashSignatureParts([
    'geospatial-overlay-supplement-graph',
    normalizeWorkspaceDocLike(args.sourceDocumentPath),
    args.analysisCacheSignature,
  ])
}

const normalizeSemanticGeoText = (value: unknown): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const readGeoNodeSemanticKey = (node: GraphNode | null | undefined): string | null => {
  if (!node || typeof node !== 'object') return null
  const props = (node.properties || {}) as Record<string, unknown>
  const geo = props.geo as Record<string, unknown> | null
  if (!geo || typeof geo !== 'object') return null
  const lat = Number(geo.lat)
  const lng = Number(geo.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const identityRaw =
    props.poi_id
    ?? props.poiId
    ?? props.id
    ?? props.name
    ?? props.label
    ?? props.title
    ?? node.label
    ?? ''
  const identity = normalizeSemanticGeoText(identityRaw)
  const latKey = lat.toFixed(6)
  const lngKey = lng.toFixed(6)
  return identity ? `geo:${identity}:${latKey}:${lngKey}` : `geo:${latKey}:${lngKey}`
}

const buildGraphNodeDedupKeySet = (nodes: GraphNode[]): Set<string> => {
  const dedupKeys = new Set<string>()
  for (const node of nodes) {
    const id = String(node?.id || '')
    if (id) dedupKeys.add(`id:${id}`)
    const semanticKey = readGeoNodeSemanticKey(node)
    if (semanticKey) dedupKeys.add(semanticKey)
  }
  return dedupKeys
}

const readAreaFeatures = (graphData: GraphData): unknown[] => {
  const metadata = graphData.metadata as Record<string, unknown> | null | undefined
  const collection = metadata?.kgGeospatialAreaFeatures as { features?: unknown[] } | null | undefined
  return Array.isArray(collection?.features) ? collection.features : []
}

const mergeAreaFeatures = (base: GraphData, extra: GraphData): JSONValue | null => {
  const extraFeatures = readAreaFeatures(extra)
  if (extraFeatures.length === 0) return null
  const merged = new Map<string, unknown>()
  for (const feature of [...readAreaFeatures(base), ...extraFeatures]) {
    const record = feature && typeof feature === 'object' ? feature as Record<string, unknown> : null
    const properties = record?.properties && typeof record.properties === 'object'
      ? record.properties as Record<string, unknown>
      : null
    const id = String(record?.id ?? properties?.id ?? '').trim()
    const key = id ? `id:${id}` : `feature:${hashSignatureParts([JSON.stringify(feature)])}`
    merged.set(key, feature)
  }
  return { type: 'FeatureCollection', features: [...merged.values()] } as unknown as JSONValue
}

export const mergeGraphDataUnique = (base: GraphData, extra: GraphData): GraphData => {
  const existingNodeDedupKeys = buildGraphNodeDedupKeySet(Array.isArray(base.nodes) ? (base.nodes as GraphNode[]) : [])
  const extraNodes: GraphNode[] = []
  for (const node of Array.isArray(extra.nodes) ? (extra.nodes as GraphNode[]) : []) {
    const id = String(node?.id || '')
    const semanticKey = readGeoNodeSemanticKey(node)
    if (!id && !semanticKey) continue
    if ((id && existingNodeDedupKeys.has(`id:${id}`)) || (semanticKey && existingNodeDedupKeys.has(semanticKey))) continue
    if (id) existingNodeDedupKeys.add(`id:${id}`)
    if (semanticKey) existingNodeDedupKeys.add(semanticKey)
    extraNodes.push(node)
  }
  const existingEdgeIds = new Set<string>((Array.isArray(base.edges) ? base.edges : []).map(e => String((e as GraphEdge)?.id || '')))
  const extraEdges: GraphEdge[] = []
  for (const edge of Array.isArray(extra.edges) ? (extra.edges as GraphEdge[]) : []) {
    const id = String(edge?.id || '')
    if (!id || existingEdgeIds.has(id)) continue
    existingEdgeIds.add(id)
    extraEdges.push(edge)
  }
  const mergedAreaFeatures = mergeAreaFeatures(base, extra)
  if (extraNodes.length === 0 && extraEdges.length === 0 && mergedAreaFeatures === null) return base
  return {
    ...base,
    nodes: [...(Array.isArray(base.nodes) ? base.nodes : []), ...extraNodes],
    edges: [...(Array.isArray(base.edges) ? base.edges : []), ...extraEdges],
    ...(mergedAreaFeatures ? {
      metadata: {
        ...(base.metadata && typeof base.metadata === 'object' ? base.metadata : {}),
        kgGeospatialAreaFeatures: mergedAreaFeatures,
      } as GraphData['metadata'],
    } : {}),
  }
}

const readGeoSelectionRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

const readGeoSourceFeatureId = (node: unknown): string => {
  const properties = readGeoSelectionRecord(readGeoSelectionRecord(node)?.properties)
  const richMedia = readGeoSelectionRecord(properties?.richMediaPoiProperties)
  return String(properties?.kgSourceFeatureId ?? richMedia?.kgSourceFeatureId ?? '').trim()
}

export function resolveSelectedGeoGraphNodeIds(
  graphData: unknown,
  selectedNodeIds: ReadonlySet<string>,
): Set<string> {
  const result = new Set(selectedNodeIds)
  const nodes = readGeoSelectionRecord(graphData)?.nodes
  if (!Array.isArray(nodes) || result.size === 0) return result
  const selectedSourceIds = new Set<string>()
  for (const node of nodes) {
    const id = String(readGeoSelectionRecord(node)?.id ?? '').trim()
    if (id && result.has(id)) {
      const sourceId = readGeoSourceFeatureId(node)
      if (sourceId) selectedSourceIds.add(sourceId)
    }
  }
  if (selectedSourceIds.size === 0) return result
  for (const node of nodes) {
    const id = String(readGeoSelectionRecord(node)?.id ?? '').trim()
    const sourceId = readGeoSourceFeatureId(node)
    if (id && sourceId && selectedSourceIds.has(sourceId)) result.add(id)
  }
  return result
}

export function applyLocalPoiGraphSelection(
  graphData: GraphData,
  selectedNodeIds: ReadonlySet<string>,
): GraphData {
  const selected = resolveSelectedGeoGraphNodeIds(graphData, selectedNodeIds)
  let changed = false
  const nodes = (graphData.nodes ?? []).map(node => {
    const properties = (node.properties ?? {}) as Record<string, JSONValue>
    if (properties.localPoiRole !== 'place') return node
    const kgSelected = selected.has(String(node.id ?? '').trim())
    if (properties.kgSelected === kgSelected) return node
    changed = true
    return { ...node, properties: { ...properties, kgSelected } }
  })
  return changed ? { ...graphData, nodes } : graphData
}

const attachOverlayDebugInfo = (graphData: GraphData, info: GeospatialOverlayGraphDebugInfo): GraphData => ({
  ...graphData,
  metadata: {
    ...(graphData.metadata && typeof graphData.metadata === 'object' ? graphData.metadata : {}),
    kgGeospatialOverlayDebug: info,
  } as GraphData['metadata'],
})

const buildMarkdownGeodataSupplementGraph = (args: {
  sourceDocumentPath: string
  analysisCacheSignature: string
  geodataAnalysis: MarkdownGeodataAnalysis
}): GraphData | null => {
  const supplementCacheKey = buildGeospatialOverlaySupplementGraphCacheKey(args)
  const cached = readCachedGeospatialOverlaySupplementGraphData(supplementCacheKey)
  if (cached) return cached

  const geodataAnalysis = args.geodataAnalysis

  let supplementGraph: GraphData | null = null
  for (let i = 0; i < geodataAnalysis.poiFeatureCollections.length; i += 1) {
    const { featureCollection: fc, sourceDescriptor } = geodataAnalysis.poiFeatureCollections[i]!
    const built = buildGraphDataFromFeatureCollection({
      featureCollection: fc,
      sourcePath: sourceDescriptor.sourcePath,
      sourceHash: buildMarkdownGeoFeatureCollectionGraphSourceHash(fc),
    })
    if (!built) continue
    supplementGraph = supplementGraph ? mergeGraphDataUnique(supplementGraph, built) : built
  }

  for (const req of geodataAnalysis.embeddedGeoJsonGraphDataRequests) {
    const built = buildGraphDataFromFeatureCollection({
      featureCollection: req.featureCollection,
      sourcePath: req.sourceDescriptor.sourcePath,
      sourceHash: buildMarkdownGeoFeatureCollectionGraphSourceHash(req.featureCollection),
    })
    if (!built) continue
    supplementGraph = supplementGraph ? mergeGraphDataUnique(supplementGraph, built) : built
  }

  if (!supplementGraph) return null
  return writeCachedGeospatialOverlaySupplementGraphData(supplementCacheKey, supplementGraph)
}

export function buildGeospatialOverlayGraphData(args: {
  graphData: GraphData
  graphRevision?: number | null
  graphSemanticKey?: string | null
  markdownText?: string | null
  sourceDocumentPath?: string | null
  sourceFiles?: SourceFile[] | null
}): GraphData {
  const graphData = args.graphData
  const graphHasGeoCoordinates = hasGeoCoordinates(graphData)
  const directMarkdownText = String(args.markdownText || '')
  const directSourceDocumentPath = normalizeWorkspaceDocLike(String(args.sourceDocumentPath || ''))
  const directCandidateProfile: MarkdownGeodataCandidateProfile | null =
    directMarkdownText
      ? buildMarkdownGeodataCandidateProfile(directMarkdownText)
      : null
  const directGeoJsonIsAuthoritative = !!directSourceDocumentPath && directCandidateProfile?.mayContainEmbeddedGeoJson === true
  const directAnalysisCacheSignature =
    directCandidateProfile && directSourceDocumentPath
      ? buildMarkdownGeodataAnalysisCacheSignature({
          markdownText: directMarkdownText,
          sourceDocumentPath: directSourceDocumentPath,
          embeddedGeoLimit: 8,
          poiTableLimit: 3,
          poiRowLimit: 400,
          candidateProfile: directCandidateProfile,
        })
      : ''
  const directGeoJsonAnalysisCacheSignature =
    directCandidateProfile && directSourceDocumentPath
      ? buildMarkdownGeodataAnalysisCacheSignature({
          markdownText: directMarkdownText,
          sourceDocumentPath: directSourceDocumentPath,
          embeddedGeoLimit: 8,
          poiTableLimit: 0,
          poiRowLimit: 0,
          candidateProfile: directCandidateProfile,
        })
      : ''
  const cacheKey = buildGeospatialOverlayGraphCacheKey({
    ...args,
    markdownAnalysisCacheSignature: directAnalysisCacheSignature,
    skipMarkdownAnalysis: graphHasGeoCoordinates && !directGeoJsonIsAuthoritative,
    skipSourceFiles: graphHasGeoCoordinates,
  })
  const cached = readCachedGeospatialOverlayGraphData(cacheKey)
  if (cached) return cached
  if (directGeoJsonIsAuthoritative && directCandidateProfile) {
    const directAnalysis = analyzeMarkdownGeodataSources({
      markdownText: directMarkdownText,
      sourceDocumentPath: directSourceDocumentPath,
      embeddedGeoLimit: 8,
      poiTableLimit: 0,
      poiRowLimit: 0,
      candidateProfile: directCandidateProfile,
      cacheSignature: directGeoJsonAnalysisCacheSignature,
    })
    const authoritativeGeoJsonGraph = buildMarkdownGeodataSupplementGraph({
      sourceDocumentPath: directSourceDocumentPath,
      analysisCacheSignature: `${directGeoJsonAnalysisCacheSignature}:active-geojson`,
      geodataAnalysis: {
        ...directAnalysis,
        poiFeatureCollections: [],
        matchedPoiTables: 0,
        matchedPoiRows: 0,
      },
    })
    const baseWithoutOldGeo = withoutGeoCoordinateNodes(graphData)
    const mergedCurrentGraph = authoritativeGeoJsonGraph
      ? mergeGraphDataUnique(baseWithoutOldGeo, authoritativeGeoJsonGraph)
      : baseWithoutOldGeo
    const areaFeatures = authoritativeGeoJsonGraph?.metadata?.kgGeospatialAreaFeatures
    const currentGraph = areaFeatures === undefined
      ? mergedCurrentGraph
      : {
          ...mergedCurrentGraph,
          metadata: {
            ...(mergedCurrentGraph.metadata || {}),
            kgGeospatialAreaFeatures: areaFeatures,
          },
        }
    const addedNodes = Math.max(0, (currentGraph.nodes?.length || 0) - (baseWithoutOldGeo.nodes?.length || 0))
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(currentGraph, {
      resolvedFrom: 'direct',
      sourceDocumentPath: directSourceDocumentPath,
      embeddedGeoBlockCount: directAnalysis.embeddedGeoBlockCount,
      supplementedNodeCount: addedNodes,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  if (graphHasGeoCoordinates) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom: 'none',
      sourceDocumentPath: '',
      embeddedGeoBlockCount: 0,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  const resolvedOverlayContext = resolveGeospatialSourceContext(args)
  const { bestSourceFile, sourceGraph, markdownContext } = resolvedOverlayContext
  if (sourceGraph && hasGeoCoordinates(sourceGraph)) {
    const merged = mergeGraphDataUnique(graphData, sourceGraph)
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(merged, {
      resolvedFrom: 'sourceFiles-graph',
      sourceDocumentPath: normalizeWorkspaceDocLike(String(bestSourceFile?.source?.path || bestSourceFile?.name || '')),
      embeddedGeoBlockCount: 0,
      supplementedNodeCount: Math.max(0, (Array.isArray(merged.nodes) ? merged.nodes.length : 0) - (Array.isArray(graphData.nodes) ? graphData.nodes.length : 0)),
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  if (!markdownContext) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom: 'none',
      sourceDocumentPath: '',
      embeddedGeoBlockCount: 0,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  const { markdownText, sourceDocumentPath } = markdownContext
  const resolvedFrom = resolvedOverlayContext.resolvedFrom === 'direct' ? 'direct' : 'sourceFiles'
  const contextSourceDocumentPath = normalizeWorkspaceDocLike(sourceDocumentPath)
  const reuseDirectAnalysisProfile =
    !!directCandidateProfile
    && markdownText === directMarkdownText
    && contextSourceDocumentPath === directSourceDocumentPath
  const geodataCandidateProfile = reuseDirectAnalysisProfile
    ? directCandidateProfile
    : buildMarkdownGeodataCandidateProfile(markdownText)
  if (!geodataCandidateProfile.mayContainEmbeddedGeoJson && !geodataCandidateProfile.mayContainPoiTables) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom,
      sourceDocumentPath,
      embeddedGeoBlockCount: 0,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  const geodataAnalysisCacheSignature = reuseDirectAnalysisProfile && directAnalysisCacheSignature
    ? directAnalysisCacheSignature
    : buildMarkdownGeodataAnalysisCacheSignature({
        markdownText,
        sourceDocumentPath,
        embeddedGeoLimit: 8,
        poiTableLimit: 3,
        poiRowLimit: 400,
        candidateProfile: geodataCandidateProfile,
      })
  const geodataAnalysis = analyzeMarkdownGeodataSources({
    markdownText,
    sourceDocumentPath,
    embeddedGeoLimit: 8,
    poiTableLimit: 3,
    poiRowLimit: 400,
    candidateProfile: geodataCandidateProfile,
    cacheSignature: geodataAnalysisCacheSignature,
  })
  if (geodataAnalysis.embeddedGeoJsonGraphDataRequests.length === 0 && geodataAnalysis.poiFeatureCollections.length === 0) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom,
      sourceDocumentPath,
      embeddedGeoBlockCount: geodataAnalysis.embeddedGeoBlockCount,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  const supplementGraph = buildMarkdownGeodataSupplementGraph({
    sourceDocumentPath,
    analysisCacheSignature: geodataAnalysisCacheSignature,
    geodataAnalysis,
  })
  if (!supplementGraph) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom,
      sourceDocumentPath,
      embeddedGeoBlockCount: geodataAnalysis.embeddedGeoBlockCount,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  const mergedGraph = mergeGraphDataUnique(graphData, supplementGraph)
  const addedNodes = Math.max(
    0,
    (Array.isArray(mergedGraph.nodes) ? mergedGraph.nodes.length : 0) - (Array.isArray(graphData.nodes) ? graphData.nodes.length : 0),
  )
  if (addedNodes === 0) {
    return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(graphData, {
      resolvedFrom,
      sourceDocumentPath,
      embeddedGeoBlockCount: geodataAnalysis.embeddedGeoBlockCount,
      supplementedNodeCount: 0,
      sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
    }))
  }
  return writeCachedGeospatialOverlayGraphData(cacheKey, attachOverlayDebugInfo(mergedGraph, {
    resolvedFrom,
    sourceDocumentPath,
    embeddedGeoBlockCount: geodataAnalysis.embeddedGeoBlockCount,
    supplementedNodeCount: addedNodes,
    sourceFilesCount: Array.isArray(args.sourceFiles) ? args.sourceFiles.length : 0,
  }))
}
