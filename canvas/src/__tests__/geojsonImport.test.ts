import { parseGraph } from '@/lib/graph/io/adapter'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const testGeoJsonImport = () => {
  const geoJsonText = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Test Point' },
        geometry: { type: 'Point', coordinates: [103.8, 1.3] },
      },
    ],
  })

  const { data } = parseGraph('test.geojson', geoJsonText)

  if (data.context !== 'geojson') {
    throw new Error(`Expected context=geojson, got ${data.context}`)
  }
  if (!data.nodes || data.nodes.length !== 1) {
    throw new Error(`Expected 1 node, got ${data.nodes?.length}`)
  }
  const n = data.nodes[0]
  const props = n.properties as Record<string, unknown>
  const geo = props.geo as { lat: number; lng: number } | undefined
  if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
    throw new Error('Node missing valid geo properties')
  }
  if (Math.abs(geo.lng - 103.8) > 0.0001 || Math.abs(geo.lat - 1.3) > 0.0001) {
    throw new Error(`Geo coordinates mismatch: ${JSON.stringify(geo)}`)
  }
}

export const testGeoJsonImportWithForeignMembers = () => {
  const geoJsonText = JSON.stringify({
    type: 'FeatureCollection',
    metadata: { name: 'singapoly-like' },
    agentGraph: { edges: [{ source: 1, target: 2, type: 'district' }] },
    features: [
      {
        type: 'Feature',
        id: 1,
        properties: { name: 'Point A' },
        geometry: { type: 'Point', coordinates: [103.81, 1.31] },
      },
      {
        type: 'Feature',
        id: 2,
        properties: { name: 'Point B' },
        geometry: { type: 'Point', coordinates: [103.91, 1.35] },
      },
    ],
  })

  const { data } = parseGraph('singapoly-like.json', geoJsonText)
  if (data.context !== 'geojson') {
    throw new Error(`Expected context=geojson for foreign-member FeatureCollection, got ${data.context}`)
  }
  if (!Array.isArray(data.nodes) || data.nodes.length !== 2) {
    throw new Error(`Expected 2 geojson nodes, got ${data.nodes?.length}`)
  }
  const hasGeo = data.nodes.every(node => {
    const props = (node.properties || {}) as Record<string, unknown>
    const geo = props.geo as Record<string, unknown> | undefined
    return !!geo && Number.isFinite(geo.lat as number) && Number.isFinite(geo.lng as number)
  })
  if (!hasGeo) throw new Error('Expected all nodes to include properties.geo.{lat,lng}')
}

export const testGraphIoAdapterReusesSharedPlainObjectGuardForGeoJsonRoots = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'graph', 'io', 'adapter.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes('const jsonRecord = readPlainObject(json)')) {
    throw new Error('expected graph io adapter to reuse the shared local plain-object helper for json roots')
  }
  if (!text.includes("if (t === 'FeatureCollection' || t === 'Feature')")) {
    throw new Error('expected geojson root detection to stay centralized in the adapter parse funnel')
  }
  if (!text.includes('const t = jsonRecord.type')) {
    throw new Error('expected geojson type reads to flow through the shared local plain-object helper')
  }
  if (text.includes("const t = (json as Record<string, unknown>).type")) {
    throw new Error('expected geojson type reads to stop coercing the json root inline')
  }
}

export const testGeoJsonBuilderReusesSharedPlainObjectGuard = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'graph', 'io', 'geojsonToGraphData.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected geojson graph builder to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('const readPlainObject = (value: unknown): Record<string, unknown> | null => {')) {
    throw new Error('expected geojson graph builder to centralize plain-object coercion in one local helper')
  }
  if (!text.includes('const g = readPlainObject(geom) as GeoJsonGeometry | null')) {
    throw new Error('expected geojson geometry reads to reuse the shared local plain-object helper')
  }
  if (!text.includes('const f = readPlainObject(featuresRaw[i]) as GeoJsonFeature | null')) {
    throw new Error('expected geojson feature reads to reuse the shared local plain-object helper')
  }
  if (text.includes('const isRecord = (v: unknown): v is Record<string, unknown> =>')) {
    throw new Error('expected geojson graph builder to stop defining a local record guard')
  }
}

export const testGeoJsonExporterReusesSharedPlainObjectGuard = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'graph', 'io', 'geojson.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected geojson exporter to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('if (!isPlainObject(geoRaw)) return null')) {
    throw new Error('expected geojson exporter geo point reads to reuse the shared plain-object guard')
  }
  if (text.includes("if (!geoRaw || typeof geoRaw !== 'object' || Array.isArray(geoRaw)) return null")) {
    throw new Error('expected geojson exporter to stop coercing geo objects inline')
  }
}
