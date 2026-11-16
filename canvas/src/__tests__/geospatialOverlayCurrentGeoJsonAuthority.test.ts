import type { GraphData } from '@/lib/graph/types'
import { buildGeospatialOverlayGraphData, mergeGraphDataUnique } from '@/features/geospatial/geospatialOverlayGraphData'

export function testCurrentEmbeddedGeoJsonReplacesStaleMapFeatures() {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'markdown',
    metadata: {
      graphId: 'workspace:geostack-current-fixture.md',
      kgGeospatialAreaFeatures: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          id: 'legacy:area',
          properties: { name: 'Archived Area', role: 'region', precision: 'coarse' },
          geometry: { type: 'Polygon', coordinates: [[[103.8, 1.3], [103.9, 1.3], [103.9, 1.4], [103.8, 1.3]]] },
        }],
      },
    },
    nodes: [
      { id: 'legacy:cafe', type: 'GeoFeature', label: 'Archived Cafe', properties: { geo: { lat: 1.35, lng: 103.82 } } },
      { id: 'note:one', type: 'Note', label: 'Keep this note', properties: {} },
      { id: 'note:two', type: 'Note', label: 'Keep this relation', properties: {} },
    ],
    edges: [
      { id: 'legacy:edge', source: 'legacy:cafe', target: 'note:one', label: 'historical', properties: {} },
      { id: 'note:edge', source: 'note:one', target: 'note:two', label: 'retained', properties: {} },
    ],
  }
  const featureCollection = {
    type: 'FeatureCollection',
    features: [
      ...([
        ['synthetic:one', 'Synthetic Place One', [103.847, 1.296]],
        ['synthetic:two', 'Synthetic Place Two', [103.852, 1.286]],
        ['synthetic:three', 'Synthetic Place Three', [103.843, 1.277]],
      ] as const).map(([id, name, coordinates]) => ({
        type: 'Feature',
        id,
        properties: { name, category: 'f&b', precision: 'exact', kgCategory: 'poi', kgLabelVisible: true, kgColor: '#ea580c' },
        geometry: { type: 'Point', coordinates },
      })),
      {
        type: 'Feature',
        id: 'synthetic:region',
        properties: {
          name: 'Synthetic Demo Area', category: 'Region', role: 'region', precision: 'coarse',
          geo: { lat: 1.285, lng: 103.85 },
          kgFillColor: '#2563eb', kgFillOpacity: 0.2, kgStrokeColor: '#2563eb', kgStrokeWidth: 2,
        },
        geometry: { type: 'Polygon', coordinates: [[[103.83, 1.26], [103.87, 1.26], [103.87, 1.31], [103.83, 1.31], [103.83, 1.26]]] },
      },
      {
        type: 'Feature', id: 'synthetic:multi-region',
        properties: { name: 'Synthetic Demo Multi Area', role: 'region', precision: 'coarse' },
        geometry: { type: 'MultiPolygon', coordinates: [[[[103.8, 1.2], [103.9, 1.2], [103.9, 1.3], [103.8, 1.2]]]] },
      },
    ],
  }
  const markdownText = ['# Current fixture', '', '```geojson', JSON.stringify(featureCollection), '```', ''].join('\n')
  const overlay = buildGeospatialOverlayGraphData({
    graphData,
    graphRevision: 17,
    markdownText,
    sourceDocumentPath: '/sandbox/geostack-current-fixture.md',
    sourceFiles: [],
  })
  const nodes = Array.isArray(overlay.nodes) ? overlay.nodes : []
  const geoNodes = nodes.filter(node => {
    const properties = node?.properties as Record<string, unknown> | undefined
    const geo = properties?.geo as Record<string, unknown> | undefined
    return Number.isFinite(Number(geo?.lat)) && Number.isFinite(Number(geo?.lng))
  })
  const labels = new Set(geoNodes.map(node => String(node.label || '')))
  if (geoNodes.length !== 3 || new Set(geoNodes.map(node => node.id)).size !== 3) {
    throw new Error(`Expected exactly three current point features, got ${geoNodes.length}`)
  }
  if (labels.has('Archived Cafe') || labels.has('Synthetic Demo Area') || !labels.has('Synthetic Place One')) {
    throw new Error(`Expected current synthetic map labels without archived markers, got ${JSON.stringify([...labels])}`)
  }
  const firstPoint = geoNodes.find(node => node.label === 'Synthetic Place One')
  const firstPointProperties = firstPoint?.properties as Record<string, unknown> | undefined
  if (firstPointProperties?.kgCategory !== 'poi' || firstPointProperties?.kgLabelVisible !== true) {
    throw new Error('Expected the live map contract to show the synthetic POI label and category')
  }
  const areaCollection = overlay.metadata?.kgGeospatialAreaFeatures as { features?: unknown[] } | undefined
  const areaFeatures = areaCollection?.features || []
  const area = areaFeatures[0] as { id?: unknown; properties?: { name?: unknown } } | undefined
  const multiArea = areaFeatures[1] as { id?: unknown; geometry?: { type?: unknown } } | undefined
  if (areaFeatures.length !== 2 || area?.id !== 'synthetic:region' || area.properties?.name !== 'Synthetic Demo Area'
    || multiArea?.id !== 'synthetic:multi-region' || multiArea.geometry?.type !== 'MultiPolygon') {
    throw new Error(`Expected the active coarse region to replace the archived area, got ${JSON.stringify(areaFeatures)}`)
  }
  if (!nodes.some(node => node.id === 'note:one') || !nodes.some(node => node.id === 'note:two')) {
    throw new Error('Expected current GeoJSON replacement to preserve non-geospatial graph nodes')
  }
  const edges = Array.isArray(overlay.edges) ? overlay.edges : []
  if (edges.some(edge => edge.id === 'legacy:edge') || !edges.some(edge => edge.id === 'note:edge')) {
    throw new Error('Expected replacement to remove stale geo edges and preserve unrelated graph edges')
  }
  const debug = overlay.metadata?.kgGeospatialOverlayDebug as Record<string, unknown> | undefined
  if (debug?.resolvedFrom !== 'direct' || debug?.embeddedGeoBlockCount !== 1) {
    throw new Error(`Expected the active document to own the map overlay, got ${JSON.stringify(debug)}`)
  }
}
