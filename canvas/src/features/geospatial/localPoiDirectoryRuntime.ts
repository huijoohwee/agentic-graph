import type { LocalPoiFeatureCollection, LocalPoiManifest } from './localPoiDirectoryModel'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { buildGraphDataFromFeatureCollection } from '@/lib/graph/io/geojsonToGraphData'

export type LocalPoiDirectoryDataset = {
  featureCollection: LocalPoiFeatureCollection
  manifest: LocalPoiManifest
}

type Listener = () => void

const LOCAL_POI_SOURCE_PATH = 'local-poi-directory.geojson'
const projectionCache = new WeakMap<LocalPoiFeatureCollection, GraphData>()
let datasetSnapshot: LocalPoiDirectoryDataset | null = null
const listeners = new Set<Listener>()

export function getLocalPoiDirectoryDatasetSnapshot(): LocalPoiDirectoryDataset | null {
  return datasetSnapshot
}

export function subscribeLocalPoiDirectoryDataset(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishLocalPoiDirectoryDataset(dataset: LocalPoiDirectoryDataset | null): void {
  if (datasetSnapshot === dataset) return
  datasetSnapshot = dataset
  for (const listener of listeners) listener()
}

export function buildLocalPoiDirectoryGraphData(dataset: LocalPoiDirectoryDataset | null): GraphData | null {
  if (!dataset) return null
  const { featureCollection, manifest } = dataset
  if (!/^[a-f0-9]{64}$/u.test(manifest.outputSha256)) return null
  const cached = projectionCache.get(featureCollection)
  if (cached) return cached

  const graph = buildGraphDataFromFeatureCollection({
    featureCollection,
    sourcePath: LOCAL_POI_SOURCE_PATH,
    sourceHash: manifest.outputSha256,
  })
  if (!graph) return null

  const regionFeatures = featureCollection.features.filter(feature => feature.properties.localPoiRole === 'region')
  const mapNodes = (graph.nodes || []).map(node => {
    const properties = (node.properties || {}) as Record<string, JSONValue>
    if (properties.localPoiRole !== 'region') return node
    const { geo: _centroid, ...regionProperties } = properties
    return { ...node, properties: regionProperties }
  })
  const projected: GraphData = {
    ...graph,
    nodes: mapNodes as GraphNode[],
    metadata: {
      ...(graph.metadata || {}),
      kgGeospatialAreaFeatures: {
        type: 'FeatureCollection',
        features: regionFeatures,
      } as unknown as JSONValue,
    },
  }
  projectionCache.set(featureCollection, projected)
  return projected
}
