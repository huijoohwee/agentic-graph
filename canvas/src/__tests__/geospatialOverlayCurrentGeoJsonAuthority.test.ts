import type { GraphData } from '@/lib/graph/types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildGeospatialOverlayGraphData, mergeGraphDataUnique } from '@/features/geospatial/geospatialOverlayGraphData'
import {
  buildLocalPoiDirectoryGraphData,
  getLocalPoiDirectoryDatasetSnapshot,
  publishLocalPoiDirectoryDataset,
  subscribeLocalPoiDirectoryDataset,
  type LocalPoiDirectoryDataset,
} from '@/features/geospatial/localPoiDirectoryRuntime'
import { limitLocalPoiVisibleFeatures, searchLocalPoiFeatures, validateLocalPoiGeoJson } from '@/features/geospatial/localPoiDirectoryModel'

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
          kgFillColor: '#2563eb', kgFillOpacity: 0.2, kgStrokeColor: '#2563eb', kgStrokeWidth: 2,
        },
        geometry: { type: 'Polygon', coordinates: [[[103.83, 1.26], [103.87, 1.26], [103.87, 1.31], [103.83, 1.31], [103.83, 1.26]]] },
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
  if (areaFeatures.length !== 1 || area?.id !== 'synthetic:region' || area.properties?.name !== 'Synthetic Demo Area') {
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

export function testLocalPoiDirectoryProjectsApprovedFeaturesIntoMapGraph() {
  const place = {
    type: 'Feature', id: 'pilot:place',
    properties: {
      id: 'pilot:place', name: 'Local Cafe', category: 'shop', region: 'Central',
      source: 'pilot', source_ref: 'place', updated: '2026-10-29', license_ref: 'local',
      precision: 'exact', localPoiRole: 'place', label: 'Local Cafe', kgCategory: 'shop', kgLabelVisible: true,
    },
    geometry: { type: 'Point', coordinates: [103.85, 1.29] },
  }
  const region = {
    type: 'Feature', id: 'pilot:region',
    properties: {
      id: 'pilot:region', name: 'Reviewed Area', category: 'Region', region: 'Central',
      source: 'pilot', source_ref: 'region', updated: '2026-10-29', license_ref: 'local',
      precision: 'coarse', localPoiRole: 'region', label: 'Reviewed Area', kgCategory: 'Region',
      kgLabelVisible: false, kgFillColor: '#2563eb', kgFillOpacity: 0.2,
    },
    geometry: { type: 'Polygon', coordinates: [[[103.8, 1.2], [103.9, 1.2], [103.9, 1.4], [103.8, 1.2]]] },
  }
  const dataset = {
    featureCollection: { type: 'FeatureCollection', attribution: 'Pilot attribution', features: [place, region] },
    manifest: { outputSha256: 'a'.repeat(64) },
  } as unknown as LocalPoiDirectoryDataset
  const previousDataset = getLocalPoiDirectoryDatasetSnapshot()
  let notifications = 0
  const unsubscribe = subscribeLocalPoiDirectoryDataset(() => { notifications += 1 })
  try {
    publishLocalPoiDirectoryDataset(dataset)
    if (getLocalPoiDirectoryDatasetSnapshot() !== dataset || notifications !== 1) {
      throw new Error('Expected a validated local dataset publication to notify map subscribers')
    }
    const projected = buildLocalPoiDirectoryGraphData(dataset)
    if (!projected) throw new Error('Expected the approved local collection to produce graph data')
    const base: GraphData = {
      type: 'Graph', context: 'markdown', metadata: {
        kgGeospatialAreaFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'legacy:area' }] },
      },
      nodes: [{ id: 'note:one', type: 'Note', label: 'Keep this note', properties: {} }], edges: [],
    }
    const merged = mergeGraphDataUnique(base, projected)
    const repeated = mergeGraphDataUnique(merged, projected)
    const pointNodes = (repeated.nodes || []).filter(node => {
      const properties = node.properties as Record<string, unknown> | undefined
      const geo = properties?.geo as Record<string, unknown> | undefined
      return Number.isFinite(Number(geo?.lat)) && Number.isFinite(Number(geo?.lng))
    })
    const pointProperties = pointNodes[0]?.properties as Record<string, unknown> | undefined
    if (pointNodes.length !== 1 || pointProperties?.kgSourceFeatureId !== 'pilot:place') {
      throw new Error('Expected one selectable map point carrying its stable source feature ID')
    }
    const regionNode = (repeated.nodes || []).find(node => node.label === 'Reviewed Area')
    const regionProperties = regionNode?.properties as Record<string, unknown> | undefined
    if (regionProperties?.geo !== undefined) throw new Error('Expected coarse region polygons to avoid point-marker projection')
    const areas = repeated.metadata?.kgGeospatialAreaFeatures as { features?: Array<{ id?: unknown; properties?: { name?: unknown } }> } | undefined
    if (areas?.features?.length !== 2 || areas.features[1]?.id !== 'pilot:region'
      || areas.features[1]?.properties?.name !== 'Reviewed Area') {
      throw new Error(`Expected the local region to join current map context once, got ${JSON.stringify(areas?.features)}`)
    }
    if (!repeated.nodes?.some(node => node.id === 'note:one')) throw new Error('Expected local map projection to preserve existing graph nodes')
  } finally {
    publishLocalPoiDirectoryDataset(previousDataset)
    unsubscribe()
  }
}

export async function testLocalPoiGeoJsonApprovalAllowlistAndPrecisionContracts() {
  const features = [
    {
      type: 'Feature', id: 'pilot:place',
      properties: {
        name: 'Local Cafe', category: 'shop', region: 'Central', source_ref: 'cafe-1',
        updated: '2026-10-29', precision: 'exact', phone: '+65 8123 4567', private_note: 'omit this field',
      },
      geometry: { type: 'Point', coordinates: [103.85, 1.29] },
    },
    {
      type: 'Feature', id: 'pilot:region',
      properties: {
        name: 'Central Area', region: 'Central', source_ref: 'area-1', updated: '2026-10-29',
        precision: 'coarse', role: 'region', contact: 'omit this field',
      },
      geometry: { type: 'Polygon', coordinates: [[[103.8, 1.2], [103.9, 1.2], [103.9, 1.4], [103.8, 1.2]]] },
    },
  ]
  const makeInput = (nextFeatures: unknown[] = features) => {
    const text = JSON.stringify({ type: 'FeatureCollection', features: nextFeatures })
    return { text, bytes: new TextEncoder().encode(text) }
  }
  const approval = {
    source: 'Synthetic pilot', license: 'CC BY 4.0', attribution: 'Synthetic pilot attribution',
    rightsAttested: true, publicFieldsReviewed: true, approvedExactPoints: true, approvedRegionPolygons: true,
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('local POI validation must not make network requests') }) as typeof fetch
  try {
    const input = makeInput()
    const accepted = await validateLocalPoiGeoJson(input.text, input.bytes, approval)
    if ('error' in accepted) throw new Error(`Expected a valid local dataset, got ${accepted.error}`)
    if (accepted.manifest.pointCount !== 1 || accepted.manifest.regionCount !== 1 || accepted.manifest.withheldCount !== 0
      || accepted.manifest.inputBytes !== input.bytes.byteLength || accepted.manifest.outputBytes > 500_000
      || accepted.manifest.inputSha256.length !== 64 || accepted.manifest.outputSha256.length !== 64) {
      throw new Error('Expected bounded input/output, exact hashes, and matching accepted-feature counts')
    }
    if (accepted.manifest.sourceAsOf !== '2026-10-29' || accepted.manifest.categories.join(',') !== 'shop') {
      throw new Error('Expected deterministic source date and sorted category counts in the manifest')
    }
    const pointOnlyInput = makeInput([features[0]!])
    const pointOnly = await validateLocalPoiGeoJson(pointOnlyInput.text, pointOnlyInput.bytes, {
      ...approval,
      approvedRegionPolygons: false,
    })
    if ('error' in pointOnly || pointOnly.manifest.pointCount !== 1 || pointOnly.manifest.regionCount !== 0
      || pointOnly.manifest.operatorAttestations.coarseRegionPolygons) {
      throw new Error('Expected exact-point datasets to load without requiring or claiming region approval')
    }
    const repeated = await validateLocalPoiGeoJson(input.text, input.bytes, approval)
    if ('error' in repeated || JSON.stringify(repeated.manifest) !== JSON.stringify(accepted.manifest)
      || JSON.stringify(repeated.featureCollection) !== JSON.stringify(accepted.featureCollection)) {
      throw new Error('Expected identical input bytes and approvals to produce deterministic output and manifest')
    }
    const normalizedPlace = accepted.featureCollection.features.find(feature => feature.properties.localPoiRole === 'place')
    if (!normalizedPlace || Object.keys(normalizedPlace.properties).some(key => ['phone', 'private_note', 'contact'].includes(key))) {
      throw new Error('Expected normalized records to omit arbitrary contact and private input properties')
    }
    if (searchLocalPoiFeatures(accepted.featureCollection, 'Cafe', 'shop').length !== 1
      || searchLocalPoiFeatures(accepted.featureCollection, '', 'shop').length !== 1) {
      throw new Error('Expected local category and text filters to return only the matching point')
    }
    const manyPointInput = makeInput([
      ...Array.from({ length: 55 }, (_, index) => ({
        ...features[0]!,
        id: `pilot:place-${index + 1}`,
        properties: { ...features[0]!.properties, name: `Local Cafe ${index + 1}` },
      })),
      features[1]!,
    ])
    const manyPoints = await validateLocalPoiGeoJson(manyPointInput.text, manyPointInput.bytes, approval)
    if ('error' in manyPoints || searchLocalPoiFeatures(manyPoints.featureCollection, '', 'all').length !== 55
      || limitLocalPoiVisibleFeatures(searchLocalPoiFeatures(manyPoints.featureCollection, '', 'all')).length !== 50) {
      throw new Error('Expected the directory search to retain matches while limiting visible rows to 50')
    }
    const withheldPoint = await validateLocalPoiGeoJson(input.text, input.bytes, { ...approval, approvedExactPoints: false })
    if ('error' in withheldPoint || withheldPoint.manifest.pointCount !== 0 || withheldPoint.manifest.withheldCount !== 1) {
      throw new Error('Expected an unapproved exact point to be withheld while approved region context remains')
    }
    const contactInput = makeInput([
      { ...features[0], properties: { ...features[0]!.properties, name: 'help@example.com' } },
      features[1],
    ])
    const contactRejected = await validateLocalPoiGeoJson(contactInput.text, contactInput.bytes, approval)
    if (!('error' in contactRejected) || !contactRejected.error.includes('email address or phone number')) {
      throw new Error('Expected personal contact data in an emitted name to block the import')
    }
    const provenanceContactInput = makeInput([
      { ...features[0], properties: { ...features[0]!.properties, source: 'team@example.com' } },
      features[1],
    ])
    const provenanceContactRejected = await validateLocalPoiGeoJson(provenanceContactInput.text, provenanceContactInput.bytes, approval)
    if (!('error' in provenanceContactRejected) || !provenanceContactRejected.error.includes('provenance fields')) {
      throw new Error('Expected emitted provenance fields to reject personal contact data')
    }
    const mismatchedBytes = await validateLocalPoiGeoJson('{"type":"FeatureCollection","features":[]}', input.bytes, approval)
    if (!('error' in mismatchedBytes) || !mismatchedBytes.error.includes('does not match the selected file bytes')) {
      throw new Error('Expected the parsed JSON and hashed input bytes to be bound to the same file')
    }
    const declined = await validateLocalPoiGeoJson(input.text, input.bytes, { ...approval, publicFieldsReviewed: false })
    if (!('error' in declined)) throw new Error('Expected a declined public-field review to block the import')
    const paddedInput = makeInput()
    const atLimitText = paddedInput.text + ' '.repeat(500_000 - paddedInput.bytes.byteLength)
    const atLimitBytes = new TextEncoder().encode(atLimitText)
    const atLimit = await validateLocalPoiGeoJson(atLimitText, atLimitBytes, approval)
    if ('error' in atLimit || atLimit.manifest.inputBytes !== 500_000) {
      throw new Error('Expected a valid input exactly at the 500 kB boundary to be accepted')
    }
    const oversized = await validateLocalPoiGeoJson('x', new Uint8Array(500_001), approval)
    if (!('error' in oversized) || !oversized.error.includes('500 kB')) {
      throw new Error('Expected the 500 kB input boundary to fail before parsing')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export function testLocalPoiDirectorySelectionResolvesCurrentDatasetFeatures() {
  const toolbar = readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenuGeoView.tsx'), 'utf8')
  const directory = readFileSync(resolve(process.cwd(), 'src', 'features', 'maps', 'LocalPoiDirectory.tsx'), 'utf8')
  const host = readFileSync(resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx'), 'utf8')
  if (!toolbar.includes('localPoiRuntime.buildLocalPoiDirectoryGraphData(')
    || !toolbar.includes('findGraphNode(graphWithLocalPoi, selectedNodeId)')) {
    throw new Error('Expected selected map overlays to resolve against the current local POI dataset')
  }
  if (!directory.includes('onGraphMapFeatureSelected') || !directory.includes('selectedMapFeatureId')) {
    throw new Error('Expected the directory list to follow map feature selection')
  }
  if (!host.includes('emitGraphMapFeatureSelected({ sourceFeatureId, graphFeatureId })')
    || !host.includes("setSelectionSource?.('canvas')")) {
    throw new Error('Expected map clicks to publish source-feature selection through the shared owner')
  }
}
