import React from 'react'
import type { FeatureCollection } from 'geojson'
import {
  normalizeGeoPoiRichMediaProperties,
  resolveGeoPoiAddressFromProperties,
  resolveGeoPoiCategoryFromProperties,
  type GeoPoiRichMediaProperties,
} from 'grph-shared/geospatial/poiRichMedia'
import { emitGraphMapFeatureSelected } from './graphFeatureSelectionEvent.js'
import { pickNearestPointFeature, type ProjectedPoint } from './pickNearestPointFeature.js'

export type RichMediaPoiDetail = {
  label: string
  lng: number
  lat: number
  address?: string
  category?: string
  properties?: GeoPoiRichMediaProperties
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getOverlayHandlers(snapshot: unknown, handlers: unknown): Record<string, unknown> | null {
  if (isRecord(handlers)) return handlers
  const snapshotHandlers = isRecord(snapshot) ? snapshot.handlers : null
  return isRecord(snapshotHandlers) ? snapshotHandlers : null
}

export function readGraphFeaturePoiDetail(feature: FeatureCollection['features'][number]): RichMediaPoiDetail | null {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null
  const [lngRaw, latRaw] = feature.geometry.coordinates
  const lng = Number(lngRaw)
  const lat = Number(latRaw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const rawProperties = isRecord(feature.properties) ? feature.properties : {}
  const properties = normalizeGeoPoiRichMediaProperties({
    ...rawProperties,
    kgSourceFeatureId: rawProperties.kgSourceFeatureId ?? String(feature.id ?? rawProperties.id ?? ''),
  })
  const label = String(rawProperties.label ?? rawProperties.name ?? rawProperties.title ?? feature.id ?? 'POI').trim()
  return {
    label: label || 'POI', lng, lat,
    address: resolveGeoPoiAddressFromProperties(properties),
    category: resolveGeoPoiCategoryFromProperties(properties),
    properties,
  }
}

export function useGraphFeatureActivation(
  snapshot: unknown,
  handlers: unknown,
  onPoiClick: (detail: RichMediaPoiDetail) => void,
) {
  return React.useCallback((feature: unknown) => {
    const record = isRecord(feature) ? feature : null
    const properties = isRecord(record?.properties) ? record.properties : {}
    const nodeId = String(record?.id ?? properties.id ?? '').trim()
    const overlayHandlers = getOverlayHandlers(snapshot, handlers)
    const selectNode = overlayHandlers?.selectNode
    if (nodeId && typeof selectNode === 'function') {
      const setSource = overlayHandlers?.setSelectionSource
      if (typeof setSource === 'function') (setSource as (source: 'canvas') => void)('canvas')
      const selectGraphNode = selectNode as (id: string) => void
      selectGraphNode(nodeId)
    }
    if (!record) return
    const graphFeatureId = String(record.id ?? properties.id ?? '').trim()
    const sourceFeatureId = String(properties.kgSourceFeatureId ?? graphFeatureId).trim()
    if (graphFeatureId && sourceFeatureId) emitGraphMapFeatureSelected({ sourceFeatureId, graphFeatureId })
    const detail = readGraphFeaturePoiDetail(feature as FeatureCollection['features'][number])
    if (detail) onPoiClick(detail)
  }, [handlers, onPoiClick, snapshot])
}

export function pickNearestGraphFeatureForClick(
  features: FeatureCollection['features'],
  point: unknown,
  project: (coordinate: [number, number]) => ProjectedPoint,
  pickFeature: (features: unknown[], point: unknown) => unknown | null,
): unknown | null {
  if (!isRecord(point)) return null
  const x = Number(point.x)
  const y = Number(point.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const nearest = pickNearestPointFeature(features, { x, y }, (lng, lat) => {
    try {
      const projected = project([lng, lat])
      return projected ? { x: Number(projected.x), y: Number(projected.y) } : null
    } catch {
      return null
    }
  })
  return nearest ? pickFeature([nearest], point) : null
}
