import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { isJsonValue } from '@/lib/graph/jsonValue'
import { isPlainObject } from '@/lib/graph/value'

type GeoJsonGeometry = { type?: unknown; coordinates?: unknown }

type GeoJsonFeature = {
  id?: unknown
  type?: unknown
  geometry?: unknown
  properties?: unknown
}

type GeoJsonFeatureCollection = {
  type?: unknown
  features?: unknown
}

const readPlainObject = (value: unknown): Record<string, unknown> | null => {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null
}

const collectCoordinatePoints = (coords: unknown, out: Array<[number, number]>): void => {
  if (!coords) return
  if (Array.isArray(coords)) {
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0]
      const y = coords[1]
      if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y])
      return
    }
    for (const c of coords) collectCoordinatePoints(c, out)
  }
}

const computeLngLatFromGeometry = (geom: unknown): { lng: number; lat: number } | null => {
  const g = readPlainObject(geom) as GeoJsonGeometry | null
  if (!g) return null
  const points: Array<[number, number]> = []
  collectCoordinatePoints(g.coordinates, points)
  if (points.length === 0) return null
  let sumX = 0
  let sumY = 0
  for (const [x, y] of points) {
    sumX += x
    sumY += y
  }
  const lng = sumX / points.length
  const lat = sumY / points.length
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

const nodeLabelFromProperties = (props: Record<string, unknown>, fallback: string): string => {
  const candidates = ['label', 'name', 'title', 'id']
  for (const key of candidates) {
    const v = props[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return fallback
}

const toJsonProps = (props: Record<string, unknown>): Record<string, JSONValue> => {
  const out: Record<string, JSONValue> = {}
  for (const [k, v] of Object.entries(props)) {
    if (isJsonValue(v)) out[k] = v
  }
  return out
}

export function buildGraphDataFromFeatureCollection(args: {
  featureCollection: unknown
  sourcePath: string
  sourceHash: string
}): GraphData | null {
  const fcRaw = args.featureCollection
  if (!readPlainObject(fcRaw)) return null
  const fc = fcRaw as GeoJsonFeatureCollection
  if (String(fc.type || '') !== 'FeatureCollection') return null
  const featuresRaw = fc.features
  if (!Array.isArray(featuresRaw) || featuresRaw.length === 0) return null

  const nodes: GraphNode[] = []
  for (let i = 0; i < featuresRaw.length; i += 1) {
    const f = readPlainObject(featuresRaw[i]) as GeoJsonFeature | null
    if (!f) continue
    if (String(f.type || 'Feature') !== 'Feature') continue
    const props = readPlainObject(f.properties) || {}
    const geom = f.geometry
    const lngLat = computeLngLatFromGeometry(geom)

    const baseId = (() => {
      const fid = f.id
      if (typeof fid === 'string' && fid.trim()) return fid.trim()
      if (typeof fid === 'number' && Number.isFinite(fid)) return String(fid)
      const pid = props.id
      if (typeof pid === 'string' && pid.trim()) return pid.trim()
      if (typeof pid === 'number' && Number.isFinite(pid)) return String(pid)
      return `f:${i + 1}`
    })()
    const id = `geo:${hashStringToHex(`${args.sourcePath}:${args.sourceHash}:${baseId}`)}`
    const label = nodeLabelFromProperties(props, baseId)

    const nextProps: Record<string, JSONValue> = toJsonProps(props)
    nextProps.kgSourceFeatureId = baseId
    if (lngLat) {
      const existingGeo = readPlainObject(nextProps.geo) as Record<string, JSONValue> | null
      nextProps.geo = {
        ...(existingGeo || {}),
        lng: lngLat.lng,
        lat: lngLat.lat,
      }
    }

    nodes.push({
      id,
      type: 'GeoFeature',
      label,
      properties: nextProps,
      metadata: {
        geojson: {
          sourcePath: args.sourcePath,
          index: i,
        },
      },
    })
  }

  if (nodes.length === 0) return null

  const graph: GraphData = {
    type: 'Graph',
    context: 'geojson',
    metadata: {
      kind: 'workspace',
      source: args.sourcePath,
      graphId: `workspace:${args.sourcePath}`,
    },
    nodes,
    edges: [],
  }
  return graph
}
