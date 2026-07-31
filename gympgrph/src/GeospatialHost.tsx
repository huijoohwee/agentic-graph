import React from 'react'
import { hashStringToHex } from 'grph-shared/hash/stringHash'
import {
  normalizeGeoPoiRichMediaProperties,
  resolveGeoPoiAddressFromProperties,
  resolveGeoPoiCategoryFromProperties,
  type GeoPoiRichMediaProperties,
} from 'grph-shared/geospatial/poiRichMedia'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import { useGympgrphStore } from './store.js'
import { useMapLibreBasemap } from './features/geospatial/useMapLibreBasemap.js'
import {
  bindMapLibreCanvasSemanticOwner,
  type MapLibreCanvasSemanticOwner,
} from './features/geospatial/mapLibreCanvasSemanticOwner.js'
import { NATIVE_GEOSPATIAL_MAPLIBRE_OWNER } from './features/geospatial/mapLibreHostLease.js'
import { useFlightGeoOverlayMapLibrePresentation } from './features/geospatial/useFlightGeoOverlayMapLibrePresentation.js'
import { useCityGeoOverlayMapLibrePresentation } from './features/geospatial/useCityGeoOverlayMapLibrePresentation.js'
import { readGeoMapOcclusionPadding } from './geoMapViewport.js'
import {
  readFlightGeoOverlay,
  subscribeFlightGeoOverlay,
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlayPresentationOwner,
} from './flightGeoOverlay.js'
import { LS_KEYS } from './lib/config.js'
import { onGeospatialModeChanged, type GeospatialViewMode } from 'grph-shared/geospatial/events'
import { GEOSPATIAL_POINT_STYLE_CHANGED_EVENT, GEOSPATIAL_STYLE_URL_CHANGED_EVENT } from 'grph-shared/geospatial/constants'
import { computeBoundsFromCollections } from './geo.js'
import {
  clearGeoJsonSourceData,
  ensureDatasetLayer,
  isMapLibreStyleReady,
  readGeoJsonSourceData,
  setGeoJsonSourceData,
} from './maplibreLayers.js'
import { colorForDataset } from './colors.js'
import { isPointOnlyFeatureCollection } from './selection.js'
import {
  DEFAULT_GEOSPATIAL_VIEW_MODE,
  FLIGHT_GEO_BOOTSTRAP_STYLE,
  isGrabMapsPresetActive,
  normalizeGeospatialViewMode,
  normalizePersistedGeospatialStyleUrl,
  resolveEffectiveGeospatialStyleUrl,
  SAFE_SVG_FALLBACK_STYLE_SENTINEL,
} from './features/geospatial/basemapStyle.js'
import {
  MAIN_PANEL_DEFAULT_GEOSPATIAL_POINT_STYLE_CONFIG,
  pointStyleConfigSignature,
  readGeospatialPointStyleConfig,
} from './features/geospatial/pointStyleConfig.js'
import type { FeatureCollection } from 'geojson'
import { geoEquirectangular, geoGraticule, geoPath } from 'd3'
import {
  HIGH_FIDELITY_WORLD_SVG_HEIGHT,
  HIGH_FIDELITY_WORLD_SVG_INNER,
  HIGH_FIDELITY_WORLD_SVG_WIDTH,
} from './features/geospatial/worldSvgBasemap.js'
import { useEnhancedGeospatialHostLayers } from './useEnhancedGeospatialHostLayers.js'
import { applyGeospatialFitRequest } from './geospatialFitRuntime.js'

type GeospatialOverlayHostProps = {
  active?: boolean
  gameplayPresentationOwner: FlightGeoOverlayPresentationOwner
  semanticMediaOwner?: MapLibreCanvasSemanticOwner | null
  snapshot?: unknown
  handlers?: unknown
  onFlightOverlayPresented?: (
    presentation: FlightGeoOverlayPresentation,
  ) => void
}

type RichMediaPoiDetail = {
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

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function readNestedValue(root: unknown, path: ReadonlyArray<string>): unknown {
  let current: unknown = root
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function getSnapshotGraphData(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return null
  return snapshot.graphData
}

function getSnapshotGraphRevision(snapshot: unknown): number {
  if (!isRecord(snapshot)) return 0
  const raw = snapshot.graphRevision
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
}

function getOverlayHandlers(snapshot: unknown, handlers: unknown): Record<string, unknown> | null {
  if (isRecord(handlers)) return handlers
  if (!isRecord(snapshot)) return null
  const snapshotHandlers = snapshot.handlers
  return isRecord(snapshotHandlers) ? snapshotHandlers : null
}

function getSnapshotSelectedNodeIds(snapshot: unknown): Set<string> {
  if (!isRecord(snapshot)) return new Set<string>()
  const out = new Set<string>()
  const selectedNodeId = snapshot.selectedNodeId
  if (typeof selectedNodeId === 'string' && selectedNodeId.trim()) out.add(selectedNodeId)
  const selectedNodeIds = snapshot.selectedNodeIds
  if (Array.isArray(selectedNodeIds)) {
    for (const raw of selectedNodeIds) {
      if (typeof raw !== 'string') continue
      const id = raw.trim()
      if (!id) continue
      out.add(id)
    }
  }
  return out
}

function getSnapshotGeospatialPanelNodeIds(snapshot: unknown): Set<string> {
  if (!isRecord(snapshot)) return new Set<string>()
  const raw = snapshot.geospatialPanelNodeIds
  if (!Array.isArray(raw)) return new Set<string>()
  const out = new Set<string>()
  for (let i = 0; i < raw.length; i += 1) {
    const id = typeof raw[i] === 'string' ? raw[i].trim() : ''
    if (!id) continue
    out.add(id)
  }
  return out
}

type FeatureProjection = {
  featureCollection: FeatureCollection
  featureById: Map<string, FeatureCollection['features'][number]>
  signature: string
}

function buildIdSetSignature(scope: string, ids: Set<string>): string {
  if (ids.size === 0) return `${scope}:0`
  const normalized = Array.from(ids).map(id => String(id || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
  if (normalized.length === 0) return `${scope}:0`
  return `${scope}:${normalized.length}:${hashStringToHex(`${scope}|${normalized.join('|')}`)}`
}

function GeospatialPointLegend(props: {
  colors: {
    airport: string
    hotel: string
    poi: string
    route: string
  }
  visible: boolean
}): React.ReactElement | null {
  if (!props.visible) return null
  const items: Array<{ key: 'airport' | 'hotel' | 'poi' | 'route'; label: string }> = [
    { key: 'airport', label: 'Airport' },
    { key: 'hotel', label: 'Hotel' },
    { key: 'poi', label: 'POI' },
    { key: 'route', label: 'Route' },
  ]
  return (
    <aside
      className={`absolute left-2 bottom-2 z-20 pointer-events-none rounded-md border px-2 py-1.5 text-[11px] shadow-sm ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.text.secondary}`}
      aria-label="Geospatial point legend"
    >
      <p className={`mb-1 text-[10px] font-medium uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary}`}>Legend</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {items.map(item => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-white/80 shadow-[0_0_0_1px_rgba(15,23,42,0.16)]"
              style={{ backgroundColor: props.colors[item.key] }}
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

const SVG_FALLBACK_VIEWBOX_WIDTH = 1000
const SVG_FALLBACK_VIEWBOX_HEIGHT = 560
const SVG_FALLBACK_STYLE = {
  graticuleMinorStep: [5, 5] as const,
  graticuleMajorStep: [15, 15] as const,
  oceanGradientStops: ['rgb(224 236 245)', 'rgb(196 217 232)', 'rgb(166 191 210)'] as const,
  oceanSheenStops: ['rgba(255,255,255,0.48)', 'rgba(255,255,255,0.20)', 'rgba(30,41,59,0.10)'] as const,
  landWashStops: ['rgba(255,255,255,0.20)', 'rgba(34,197,94,0.09)'] as const,
  frameStrokeStops: ['rgba(255,255,255,0.95)', 'rgba(30,41,59,0.88)'] as const,
  mapFilterMatrix: `
                0.64 0.00 0.00 0 0.24
                0.00 0.68 0.00 0 0.25
                0.00 0.00 0.73 0 0.28
                0.00 0.00 0.00 1 0
              `,
  mapGamma: ['0.79', '0.81', '0.86'] as const,
  sphereShadow: 'rgba(15,23,42,0.20)',
  pointShadow: 'rgba(15,23,42,0.35)',
  minorGridLight: 'rgba(255,255,255,0.09)',
  minorGridDark: 'rgba(100,116,139,0.07)',
  majorGridLight: 'rgba(255,255,255,0.17)',
  majorGridDark: 'rgba(51,65,85,0.15)',
  pointFill: 'rgba(37,99,235,0.92)',
  pointOutline: 'rgba(255,255,255,0.98)',
  pointStroke: 'rgba(29,78,216,0.74)',
  selectedFill: 'rgba(249,115,22,0.98)',
  selectedOutline: 'rgba(255,255,255,1)',
  selectedStroke: 'rgba(154,52,18,0.88)',
} as const

function SvgGeospatialFallback(args: {
  featureCollection: FeatureCollection
  selectedFeatureCollection: FeatureCollection
  className: string
  insetPadding?: { top?: number; right?: number; bottom?: number; left?: number }
  semanticMediaOwner?: MapLibreCanvasSemanticOwner | null
  style?: React.CSSProperties
}): React.ReactElement {
  const width = SVG_FALLBACK_VIEWBOX_WIDTH
  const height = SVG_FALLBACK_VIEWBOX_HEIGHT
  const projection = React.useMemo(() => {
    const equirect = geoEquirectangular()
    const padTop = Math.max(12, Number(args.insetPadding?.top || 0))
    const padRight = Math.max(12, Number(args.insetPadding?.right || 0))
    const padBottom = Math.max(12, Number(args.insetPadding?.bottom || 0))
    const padLeft = Math.max(12, Number(args.insetPadding?.left || 0))
    equirect.fitExtent(
      [
        [padLeft, padTop],
        [Math.max(padLeft + 24, width - padRight), Math.max(padTop + 24, height - padBottom)],
      ],
      { type: 'Sphere' } as never,
    )
    const features = Array.isArray(args.featureCollection.features) ? args.featureCollection.features : []
    const bounds = computeBoundsFromCollections([args.featureCollection])
    const hasRenderableSpan = !!bounds && (
      Math.abs(bounds[2] - bounds[0]) > 1e-6
      || Math.abs(bounds[3] - bounds[1]) > 1e-6
    )
    if (features.length > 0 && hasRenderableSpan) {
      try {
        equirect.fitExtent(
          [
            [32, 32],
            [width - 32, height - 32],
          ],
          args.featureCollection,
        )
      } catch {
        void 0
      }
    }
    return equirect
  }, [args.featureCollection, args.insetPadding?.bottom, args.insetPadding?.left, args.insetPadding?.right, args.insetPadding?.top])

  const areaPathBuilder = React.useMemo(() => geoPath(projection), [projection])
  const pointPathBuilder = React.useMemo(() => geoPath(projection).pointRadius(4), [projection])
  const selectedPointPathBuilder = React.useMemo(() => geoPath(projection).pointRadius(6), [projection])
  const minorGraticule = React.useMemo(
    () => geoGraticule().step([SVG_FALLBACK_STYLE.graticuleMinorStep[0], SVG_FALLBACK_STYLE.graticuleMinorStep[1]]),
    [],
  )
  const majorGraticule = React.useMemo(
    () => geoGraticule().step([SVG_FALLBACK_STYLE.graticuleMajorStep[0], SVG_FALLBACK_STYLE.graticuleMajorStep[1]]),
    [],
  )
  const safeImageBounds = React.useMemo(() => {
    const readPoint = (raw: unknown, fallback: [number, number]): [number, number] => {
      if (!Array.isArray(raw) || raw.length < 2) return fallback
      const x = Number(raw[0])
      const y = Number(raw[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback
      return [x, y]
    }
    const tl = readPoint(projection([-180, 90]), [0, 0])
    const br = readPoint(projection([180, -90]), [width, height])
    const x = Math.min(tl[0], br[0])
    const y = Math.min(tl[1], br[1])
    const w = Math.abs(br[0] - tl[0])
    const hByWidth = (w * HIGH_FIDELITY_WORLD_SVG_HEIGHT) / HIGH_FIDELITY_WORLD_SVG_WIDTH
    const hSpan = Math.abs(br[1] - tl[1])
    const h = Number.isFinite(hByWidth) && hByWidth > 0 ? hByWidth : hSpan
    const yAdjusted = y + (hSpan - h) / 2
    const valid = Number.isFinite(x) && Number.isFinite(yAdjusted) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    return {
      x: valid ? x : 0,
      y: valid ? yAdjusted : 0,
      width: valid ? w : width,
      height: valid ? h : height,
      valid,
    }
  }, [height, projection, width])
  const spherePath = React.useMemo(() => areaPathBuilder({ type: 'Sphere' } as never) || '', [areaPathBuilder])
  const minorGraticulePath = React.useMemo(() => areaPathBuilder(minorGraticule() as never) || '', [areaPathBuilder, minorGraticule])
  const majorGraticulePath = React.useMemo(() => areaPathBuilder(majorGraticule() as never) || '', [areaPathBuilder, majorGraticule])
  const pointsPath = React.useMemo(() => pointPathBuilder(args.featureCollection as never) || '', [pointPathBuilder, args.featureCollection])
  const selectedPath = React.useMemo(
    () => selectedPointPathBuilder(args.selectedFeatureCollection as never) || '',
    [selectedPointPathBuilder, args.selectedFeatureCollection],
  )
  const terrainTransform = React.useMemo(() => {
    if (!safeImageBounds.valid) return ''
    const sx = safeImageBounds.width / HIGH_FIDELITY_WORLD_SVG_WIDTH
    const sy = safeImageBounds.height / HIGH_FIDELITY_WORLD_SVG_HEIGHT
    return `translate(${safeImageBounds.x} ${safeImageBounds.y}) scale(${sx} ${sy})`
  }, [safeImageBounds.height, safeImageBounds.valid, safeImageBounds.width, safeImageBounds.x, safeImageBounds.y])
  const semanticSurfaceRef = React.useRef<SVGSVGElement | null>(null)
  React.useEffect(() => bindMapLibreCanvasSemanticOwner(
    { getCanvas: () => semanticSurfaceRef.current },
    args.semanticMediaOwner,
  ), [args.semanticMediaOwner])
  return (
    <svg
      ref={semanticSurfaceRef}
      viewBox={`0 0 ${width} ${height}`}
      className={args.className}
      role="img"
      style={args.style}
      aria-label="Fallback geospatial basemap"
    >
      <defs>
          <linearGradient id="kg-geo-fallback-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SVG_FALLBACK_STYLE.oceanGradientStops[0]} />
            <stop offset="44%" stopColor={SVG_FALLBACK_STYLE.oceanGradientStops[1]} />
            <stop offset="100%" stopColor={SVG_FALLBACK_STYLE.oceanGradientStops[2]} />
          </linearGradient>
          <radialGradient id="kg-geo-fallback-ocean-sheen" cx="50%" cy="42%" r="78%">
            <stop offset="0%" stopColor={SVG_FALLBACK_STYLE.oceanSheenStops[0]} />
            <stop offset="48%" stopColor={SVG_FALLBACK_STYLE.oceanSheenStops[1]} />
            <stop offset="100%" stopColor={SVG_FALLBACK_STYLE.oceanSheenStops[2]} />
          </radialGradient>
          <linearGradient id="kg-geo-fallback-land-wash" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={SVG_FALLBACK_STYLE.landWashStops[0]} />
            <stop offset="100%" stopColor={SVG_FALLBACK_STYLE.landWashStops[1]} />
          </linearGradient>
          <linearGradient id="kg-geo-fallback-frame-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={SVG_FALLBACK_STYLE.frameStrokeStops[0]} />
            <stop offset="100%" stopColor={SVG_FALLBACK_STYLE.frameStrokeStops[1]} />
          </linearGradient>
          <clipPath id="kg-geo-fallback-sphere-clip">
            <path d={spherePath} />
          </clipPath>
          <filter id="kg-geo-fallback-map-filter" x="-10%" y="-10%" width="120%" height="120%">
            <feColorMatrix
              type="matrix"
              values={SVG_FALLBACK_STYLE.mapFilterMatrix}
            />
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1" exponent={SVG_FALLBACK_STYLE.mapGamma[0]} offset="0" />
              <feFuncG type="gamma" amplitude="1" exponent={SVG_FALLBACK_STYLE.mapGamma[1]} offset="0" />
              <feFuncB type="gamma" amplitude="1" exponent={SVG_FALLBACK_STYLE.mapGamma[2]} offset="0" />
            </feComponentTransfer>
          </filter>
          <filter id="kg-geo-fallback-sphere-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="5" floodColor={SVG_FALLBACK_STYLE.sphereShadow} />
          </filter>
          <filter id="kg-geo-fallback-point-shadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.6" floodColor={SVG_FALLBACK_STYLE.pointShadow} />
          </filter>
          <style>{`
            .kg-geo-fallback-terrain .st0 {
              fill: #91a77d;
              stroke: rgba(15, 23, 42, 0.44);
              stroke-width: 1.2px;
              stroke-linejoin: bevel;
            }
            .kg-geo-fallback-terrain .st1 {
              fill: #a7b78e;
              stroke: rgba(15, 23, 42, 0.28);
              stroke-width: 0.42px;
              stroke-linejoin: bevel;
            }
          `}</style>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="url(#kg-geo-fallback-bg)" />
      <path d={spherePath} fill="url(#kg-geo-fallback-ocean-sheen)" stroke="rgba(255,255,255,0.32)" strokeWidth="3.4" filter="url(#kg-geo-fallback-sphere-shadow)" />
      <g clipPath="url(#kg-geo-fallback-sphere-clip)" opacity="0.98">
        {safeImageBounds.valid ? (
          <>
            <g
              className="kg-geo-fallback-terrain"
              transform={terrainTransform}
              filter="url(#kg-geo-fallback-map-filter)"
              opacity="0.98"
              dangerouslySetInnerHTML={{ __html: HIGH_FIDELITY_WORLD_SVG_INNER }}
            />
            <rect
              x={safeImageBounds.x}
              y={safeImageBounds.y}
              width={safeImageBounds.width}
              height={safeImageBounds.height}
              fill="url(#kg-geo-fallback-land-wash)"
              opacity="0.36"
            />
          </>
        ) : null}
      </g>
      <path d={spherePath} fill="none" stroke="url(#kg-geo-fallback-frame-stroke)" strokeWidth="1.2" />
      <path d={spherePath} fill="none" stroke="rgba(15,23,42,0.28)" strokeWidth="1.75" />
      <path d={minorGraticulePath} fill="none" stroke={SVG_FALLBACK_STYLE.minorGridLight} strokeWidth="0.55" />
      <path d={minorGraticulePath} fill="none" stroke={SVG_FALLBACK_STYLE.minorGridDark} strokeWidth="0.95" />
      <path d={majorGraticulePath} fill="none" stroke={SVG_FALLBACK_STYLE.majorGridLight} strokeWidth="0.95" />
      <path d={majorGraticulePath} fill="none" stroke={SVG_FALLBACK_STYLE.majorGridDark} strokeWidth="1.55" />
      <path d={pointsPath} fill={SVG_FALLBACK_STYLE.pointFill} stroke={SVG_FALLBACK_STYLE.pointOutline} strokeWidth="2.2" filter="url(#kg-geo-fallback-point-shadow)" />
      <path d={pointsPath} fill="none" stroke={SVG_FALLBACK_STYLE.pointStroke} strokeWidth="0.95" />
      <path d={selectedPath} fill={SVG_FALLBACK_STYLE.selectedFill} stroke={SVG_FALLBACK_STYLE.selectedOutline} strokeWidth="3" filter="url(#kg-geo-fallback-point-shadow)" />
      <path d={selectedPath} fill="none" stroke={SVG_FALLBACK_STYLE.selectedStroke} strokeWidth="1.25" />
    </svg>
  )
}

function buildFeatureCollectionFromGraphData(
  graphData: unknown,
  panelNodeIds: Set<string>,
  graphRevision: number,
): FeatureProjection {
  const features: FeatureCollection['features'] = []
  const featureById = new Map<string, FeatureCollection['features'][number]>()
  const signatureParts: string[] = []
  const panelNodeIdsSignature = buildIdSetSignature('panel', panelNodeIds)
  if (!isRecord(graphData)) {
    return {
      featureCollection: { type: 'FeatureCollection', features },
      featureById,
      signature: hashStringToHex(`n:0|${panelNodeIdsSignature}|rev:${graphRevision}`),
    }
  }
  const meta = isRecord(graphData.metadata) ? graphData.metadata : null
  const lineFeaturesRaw = meta ? readNestedValue(meta, ['kgGeospatialLineFeatures']) : null
  if (isRecord(lineFeaturesRaw) && String(lineFeaturesRaw.type || '') === 'FeatureCollection') {
    const inner = (lineFeaturesRaw as Record<string, unknown>).features
    if (Array.isArray(inner)) {
      for (let i = 0; i < inner.length; i += 1) {
        const f = inner[i]
        if (!isRecord(f)) continue
        const g = (f as Record<string, unknown>).geometry
        if (!isRecord(g) || String(g.type || '') !== 'LineString') continue
        const coords = (g as Record<string, unknown>).coordinates
        if (!Array.isArray(coords) || coords.length < 2) continue
        const props = isRecord((f as Record<string, unknown>).properties) ? (f as Record<string, unknown>).properties as Record<string, unknown> : {}
        const idRaw = (f as Record<string, unknown>).id
        const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : ''
        const labelRaw = props.label
        const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : 'Route'
        if (graphRevision <= 0 && signatureParts.length < 500) {
          const firstCoord = Array.isArray(coords[0]) ? coords[0] : null
          const lastCoord = Array.isArray(coords[coords.length - 1]) ? coords[coords.length - 1] : null
          signatureParts.push([
            'line',
            id || `kg-line:${i + 1}`,
            label,
            Array.isArray(coords) ? coords.length : 0,
            Array.isArray(firstCoord) ? `${Number(firstCoord[0] || 0).toFixed(6)}:${Number(firstCoord[1] || 0).toFixed(6)}` : '',
            Array.isArray(lastCoord) ? `${Number(lastCoord[0] || 0).toFixed(6)}:${Number(lastCoord[1] || 0).toFixed(6)}` : '',
          ].join(':'))
        }
        const feature = {
          type: 'Feature',
          id: id || `kg-line:${i + 1}`,
          geometry: { type: 'LineString', coordinates: coords as any },
          properties: {
            ...props,
            label,
            kgCategory: typeof props.kgCategory === 'string' && props.kgCategory.trim() ? props.kgCategory : 'route',
          } as any,
        } satisfies FeatureCollection['features'][number]
        features.push(feature)
        if (feature.id != null) {
          featureById.set(String(feature.id), feature)
        }
      }
    }
  }
  const nodesRaw = graphData.nodes
  if (!Array.isArray(nodesRaw)) {
    return {
      featureCollection: { type: 'FeatureCollection', features },
      featureById,
      signature: hashStringToHex(`n:0|${panelNodeIdsSignature}|rev:${graphRevision}`),
    }
  }
  for (let i = 0; i < nodesRaw.length; i += 1) {
    const node = nodesRaw[i]
    if (!isRecord(node)) continue
    const nodeId = String(node.id || '').trim()
    if (!nodeId) continue
    if (panelNodeIds.has(nodeId)) continue
    const propsRaw = isRecord(node.properties) ? node.properties : {}
    const geoRaw = readNestedValue(propsRaw, ['geo'])
    const lat = readFiniteNumber(readNestedValue(geoRaw, ['lat']))
    const lng = readFiniteNumber(readNestedValue(geoRaw, ['lng']))
    if (lat == null || lng == null) continue
    const labelRaw = node.label
    const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : nodeId
    const nodeTypeRaw = node.type
    const nodeType = typeof nodeTypeRaw === 'string' ? nodeTypeRaw : ''
    const category = (() => {
      const rawCandidates: unknown[] = [
        readNestedValue(propsRaw, ['cat']),
        readNestedValue(propsRaw, ['category']),
        readNestedValue(propsRaw, ['kgCategory']),
        readNestedValue(propsRaw, ['business_type']),
        readNestedValue(propsRaw, ['kind']),
        readNestedValue(propsRaw, ['type']),
        nodeType,
      ]
      for (const raw of rawCandidates) {
        const v = String(raw || '').trim().toLowerCase()
        if (!v) continue
        if (v.includes('airport')) return 'airport'
        if (v.includes('hotel') || v.includes('hostel') || v.includes('accommodation')) return 'hotel'
        if (v.includes('poi') || v.includes('attraction') || v.includes('landmark')) return 'poi'
        if (v.includes('route') || v.includes('line') || v.includes('flight')) return 'route'
      }
      return 'other'
    })()
    if (graphRevision <= 0 && signatureParts.length < 500) {
      signatureParts.push(`${nodeId}:${category}:${lng.toFixed(6)}:${lat.toFixed(6)}`)
    }
    const properties = normalizeGeoPoiRichMediaProperties(propsRaw)
    const feature = {
      type: 'Feature',
      id: nodeId,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        ...properties,
        id: nodeId,
        label,
        type: nodeType,
        kgCategory: category,
      },
    } satisfies FeatureCollection['features'][number]
    features.push(feature)
    featureById.set(nodeId, feature)
  }
  const structureSignature = graphRevision > 0
    ? `rev:${graphRevision}`
    : `sig:${hashStringToHex(`features:${features.length}|${signatureParts.join('|')}`)}`
  return {
    featureCollection: { type: 'FeatureCollection', features },
    featureById,
    signature: `${structureSignature}|${panelNodeIdsSignature}|count:${features.length}`,
  }
}

const readStyleUrl = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LS_KEYS.geospatialStyleUrl) || ''
    const s = normalizePersistedGeospatialStyleUrl(raw)
    if (s !== raw.trim()) {
      if (s) {
        window.localStorage.setItem(LS_KEYS.geospatialStyleUrl, s)
      } else {
        window.localStorage.removeItem(LS_KEYS.geospatialStyleUrl)
      }
    }
    return s || null
  } catch {
    return null
  }
}

const readPersistedViewMode = (): GeospatialViewMode => {
  if (typeof window === 'undefined') return DEFAULT_GEOSPATIAL_VIEW_MODE
  try {
    const raw = String(window.localStorage.getItem(LS_KEYS.geospatialViewMode) || '').trim()
    return normalizeGeospatialViewMode(raw || DEFAULT_GEOSPATIAL_VIEW_MODE)
  } catch {
    return DEFAULT_GEOSPATIAL_VIEW_MODE
  }
}

export function GeospatialOverlayHost(props: GeospatialOverlayHostProps): React.ReactElement | null {
  const active = props.active !== false
  const flightOverlay = React.useSyncExternalStore(
    subscribeFlightGeoOverlay,
    readFlightGeoOverlay,
    readFlightGeoOverlay,
  )
  const flightOverlayActive = flightOverlay.active
  const storeGeospatialViewMode = useGympgrphStore(s => s.geospatialViewMode)
  const geospatialAutoFitEnabled = useGympgrphStore(s => s.geospatialAutoFitEnabled)
  const geospatialFitRequest = useGympgrphStore(s => s.geospatialFitRequest)
  const clearGeospatialFitRequest = useGympgrphStore(s => s.clearGeospatialFitRequest)
  const setGeospatialCursorLngLat = useGympgrphStore(s => s.setGeospatialCursorLngLat)
  const rootRef = React.useRef<HTMLElement | null>(null)
  const mapContainerRef = React.useRef<HTMLElement | null>(null)
  const [targetStyleUrl, setTargetStyleUrl] = React.useState<string | null>(() => readStyleUrl())
  const [pointStyleConfig, setPointStyleConfig] = React.useState(() => readGeospatialPointStyleConfig())
  const [geospatialViewMode, setGeospatialViewMode] = React.useState<GeospatialViewMode>(
    () => normalizeGeospatialViewMode(storeGeospatialViewMode || readPersistedViewMode()),
  )

  React.useEffect(() => {
    const next = normalizeGeospatialViewMode(storeGeospatialViewMode || readPersistedViewMode())
    setGeospatialViewMode(prev => (prev === next ? prev : next))
  }, [storeGeospatialViewMode])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onChanged = () => {
      setTargetStyleUrl(readStyleUrl())
    }
    const onPointStyleChanged = () => {
      setPointStyleConfig(readGeospatialPointStyleConfig())
    }
    window.addEventListener(GEOSPATIAL_STYLE_URL_CHANGED_EVENT, onChanged)
    window.addEventListener(GEOSPATIAL_POINT_STYLE_CHANGED_EVENT, onPointStyleChanged)
    return () => {
      window.removeEventListener(GEOSPATIAL_STYLE_URL_CHANGED_EVENT, onChanged)
      window.removeEventListener(GEOSPATIAL_POINT_STYLE_CHANGED_EVENT, onPointStyleChanged)
    }
  }, [])

  React.useEffect(() => {
    return onGeospatialModeChanged(detail => {
      const next = normalizeGeospatialViewMode(detail.viewMode || readPersistedViewMode())
      setGeospatialViewMode(prev => (prev === next ? prev : next))
    })
  }, [])

  const show2dMapLibreClassic = active && geospatialViewMode === '2d'
  const show2dMapLibreModern = active && geospatialViewMode === '2d-modern'
  const show2dMapLibre = show2dMapLibreClassic || show2dMapLibreModern
  const show2dSvgFallback = active && geospatialViewMode === '2d-svg'
  const show3dClassic = active && geospatialViewMode === '3d'
  const show3dModern = active && geospatialViewMode === '3d-modern'
  const show3d = show3dClassic || show3dModern
  const effectiveTargetStyleUrl = React.useMemo(() => {
    return resolveEffectiveGeospatialStyleUrl(geospatialViewMode, targetStyleUrl)
  }, [geospatialViewMode, targetStyleUrl])
  const fitPadding = show3d ? 0 : 24
  const providerLabel = React.useMemo(() => {
    if (isGrabMapsPresetActive(effectiveTargetStyleUrl, geospatialViewMode)) return 'grabmaps'
    if (show2dSvgFallback) return 'svg'
    return 'maplibre'
  }, [effectiveTargetStyleUrl, geospatialViewMode, show2dSvgFallback])
  const snapshotGraphData = getSnapshotGraphData(props.snapshot)
  const snapshotGraphRevision = getSnapshotGraphRevision(props.snapshot)
  const selectedNodeIds = React.useMemo(() => getSnapshotSelectedNodeIds(props.snapshot), [props.snapshot])
  const selectedNodeIdsKey = React.useMemo(() => buildIdSetSignature('selected', selectedNodeIds), [selectedNodeIds])
  const geospatialPanelNodeIds = React.useMemo(() => getSnapshotGeospatialPanelNodeIds(props.snapshot), [props.snapshot])
  const geospatialPanelNodeIdsKey = React.useMemo(
    () => buildIdSetSignature('panel', geospatialPanelNodeIds),
    [geospatialPanelNodeIds],
  )
  const graphProjection = React.useMemo(() => {
    return buildFeatureCollectionFromGraphData(
      snapshotGraphData,
      geospatialPanelNodeIds,
      snapshotGraphRevision,
    )
  }, [
    geospatialPanelNodeIdsKey,
    snapshotGraphData,
    snapshotGraphRevision,
  ])
  const overlayDebugInfo = React.useMemo(() => {
    if (!isRecord(snapshotGraphData)) return null
    const meta = isRecord(snapshotGraphData.metadata) ? snapshotGraphData.metadata : null
    const raw = meta && isRecord(meta.kgGeospatialOverlayDebug) ? meta.kgGeospatialOverlayDebug : null
    return raw
  }, [snapshotGraphData])
  const graphFeatureCollection = graphProjection.featureCollection
  const graphBounds = React.useMemo(() => computeBoundsFromCollections([graphFeatureCollection]), [graphFeatureCollection])
  const selectedFeatureCollection = React.useMemo(() => {
    const selected: FeatureCollection['features'] = []
    for (const nodeId of selectedNodeIds) {
      const feature = graphProjection.featureById.get(nodeId)
      if (!feature) continue
      selected.push(feature)
    }
    return { type: 'FeatureCollection', features: selected } as FeatureCollection
  }, [graphProjection.featureById, selectedNodeIds, selectedNodeIdsKey])
  const selectedBounds = React.useMemo(() => computeBoundsFromCollections([selectedFeatureCollection]), [selectedFeatureCollection])
  const graphDataKey = React.useMemo(() => graphProjection.signature, [graphProjection.signature])
  const mapLibreRuntimeEnabled = show2dMapLibre || show3d
  const flightBootstrapStyle = props.gameplayPresentationOwner === 'flight'
    ? FLIGHT_GEO_BOOTSTRAP_STYLE
    : null

  const notifyGrabMapsFallback = React.useCallback(() => {
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const upsert = overlayHandlers && typeof overlayHandlers.upsertUiToast === 'function'
      ? overlayHandlers.upsertUiToast as ((toast: { id: string; kind?: 'neutral' | 'success' | 'warning' | 'error'; message: string; ttlMs?: number | null; dismissible?: boolean; log?: boolean }) => void)
      : null
    if (!upsert) return
    upsert({
      id: 'kg:geo:grabmaps-fallback',
      kind: 'warning',
      ttlMs: 3600,
      dismissible: true,
      log: true,
      message: 'GrabMaps basemap unavailable; switched to MapLibre Modern style.',
    })
  }, [props.handlers, props.snapshot])

  const handlePoiClick = React.useCallback((detail: RichMediaPoiDetail) => {
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const renderPoiInRichMediaPanel = overlayHandlers && typeof overlayHandlers.renderPoiInRichMediaPanel === 'function'
      ? overlayHandlers.renderPoiInRichMediaPanel as ((detail: RichMediaPoiDetail) => boolean)
      : null
    const upsert = overlayHandlers && typeof overlayHandlers.upsertUiToast === 'function'
      ? overlayHandlers.upsertUiToast as ((toast: { id: string; kind?: 'neutral' | 'success' | 'warning' | 'error'; message: string; ttlMs?: number | null; dismissible?: boolean; log?: boolean }) => void)
      : null
    const lng = Number(detail.lng)
    const lat = Number(detail.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    const label = String(detail.label || '').trim() || 'POI'
    const coordText = `${lng.toFixed(6)}, ${lat.toFixed(6)}`
    if (renderPoiInRichMediaPanel?.(detail)) {
      if (upsert) {
        upsert({
          id: 'kg:geo:poi-click',
          kind: 'success',
          ttlMs: 2600,
          dismissible: true,
          log: false,
          message: `${label} • rendered in Rich Media Panel`,
        })
      }
      return
    }
    const clipboardText = `${label} (${coordText})`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        void navigator.clipboard.writeText(clipboardText)
          .then(() => {
            if (!upsert) return
            upsert({
              id: 'kg:geo:poi-click',
              kind: 'success',
              ttlMs: 2600,
              dismissible: true,
              log: false,
              message: `${label} • copied ${coordText}`,
            })
          })
          .catch(() => {
            if (!upsert) return
            upsert({
              id: 'kg:geo:poi-click',
              kind: 'neutral',
              ttlMs: 2600,
              dismissible: true,
              log: false,
              message: `${label} • ${coordText}`,
            })
          })
        return
      }
    } catch {
      void 0
    }
    if (upsert) {
      upsert({
        id: 'kg:geo:poi-click',
        kind: 'neutral',
        ttlMs: 2600,
        dismissible: true,
        log: false,
        message: `${label} • ${coordText}`,
      })
    }
  }, [props.handlers, props.snapshot])
  const handleCityParcelSelect = React.useCallback((parcelId: string) => {
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const selectCityParcel = overlayHandlers
      && typeof overlayHandlers.selectCityParcel === 'function'
      ? overlayHandlers.selectCityParcel as ((selectedParcelId: string) => void)
      : null
    selectCityParcel?.(parcelId)
  }, [props.handlers, props.snapshot])
  const clickedGraphNodeCycleRef = React.useRef<{
    pointKey: string
    nodeIds: string[]
    nextIndex: number
  } | null>(null)
  const renderGraphNodeClickInRichMediaPanel = React.useCallback((feature: unknown) => {
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const renderPoiInRichMediaPanel = overlayHandlers && typeof overlayHandlers.renderPoiInRichMediaPanel === 'function'
      ? overlayHandlers.renderPoiInRichMediaPanel as ((detail: RichMediaPoiDetail) => boolean)
      : null
    if (!renderPoiInRichMediaPanel) return
    const record = isRecord(feature) ? (feature as Record<string, unknown>) : null
    const geometry = record && isRecord(record.geometry) ? (record.geometry as Record<string, unknown>) : null
    const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : null
    const lng = coordinates ? Number(coordinates[0]) : NaN
    const lat = coordinates ? Number(coordinates[1]) : NaN
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    const propsRaw = record && isRecord(record.properties) ? (record.properties as Record<string, unknown>) : {}
    const idRaw = record?.id ?? propsRaw.id
    const nodeId = String(idRaw || '').trim()
    if (!nodeId) return
    const label = String(propsRaw.label || nodeId).trim() || nodeId
    const properties = normalizeGeoPoiRichMediaProperties(propsRaw)
    const address = resolveGeoPoiAddressFromProperties(properties)
    const category = resolveGeoPoiCategoryFromProperties(properties)
    renderPoiInRichMediaPanel({
      label,
      lng,
      lat,
      ...(address ? { address } : {}),
      ...(category ? { category } : {}),
      properties,
    })
  }, [props.handlers, props.snapshot])

  const basemap = useMapLibreBasemap({
    enabled: mapLibreRuntimeEnabled,
    rootRef,
    containerRef: mapContainerRef,
    targetStyleUrl: effectiveTargetStyleUrl,
    initialStyleOverride: flightBootstrapStyle,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    canvasRenderMode: show3d ? '3d' : '2d',
    projectionMode: show3d ? 'globe' : 'mercator',
    viewportSizingMode: 'fit',
    vectorFallbackMs: 2_000,
    onGrabMapsFallback: notifyGrabMapsFallback,
    onPoiClick: handlePoiClick,
  })
  const enhancedLayerBounds = useEnhancedGeospatialHostLayers({
    enabled: active && mapLibreRuntimeEnabled,
    map: basemap.map,
    styleRevision: basemap.styleRevision,
    snapshot: props.snapshot,
    handlers: props.handlers,
    autoFitEnabled: geospatialAutoFitEnabled && !flightOverlayActive,
    show3d,
    fitPadding,
    selectedBounds,
    graphBounds,
  })

  const graphSourceIdBase = 'kg-host-graph:nodes'
  const graphSourceIdClustered = `${graphSourceIdBase}:clustered`
  const graphSourceIdUnclustered = `${graphSourceIdBase}:plain`
  const graphDataAppliedRef = React.useRef<{ map2d: string; map3d: string }>({ map2d: '', map3d: '' })
  const debugToastMessageRef = React.useRef<string>('')
  const [basemapGraphRevision, setBasemapGraphRevision] = React.useState(0)

  useCityGeoOverlayMapLibrePresentation({
    active,
    map: basemap.map,
    mapLibreRuntimeEnabled,
    onParcelSelect: handleCityParcelSelect,
    viewMode: show3d ? '3d' : '2d',
  })

  useFlightGeoOverlayMapLibrePresentation({
    active,
    enhancedLayerBounds,
    graphRevision: basemapGraphRevision,
    map: basemap.map,
    mapLibreRuntimeEnabled,
    onPresented: props.onFlightOverlayPresented,
    rootRef,
    styleRevision: basemap.styleRevision,
    viewMode: geospatialViewMode,
  })

  const applyFeatureCollectionToBasemap = React.useCallback(
    (args: { basemapMap: any | null; styleRevision: number; viewMode: 'map2d' | 'map3d' }) => {
      const { basemapMap, styleRevision, viewMode } = args
      if (!basemapMap) return
      if (!isMapLibreStyleReady(basemapMap)) {
        graphDataAppliedRef.current[viewMode] = ''
        return
      }
      const styleRevisionKey = styleRevision > 0 ? styleRevision : 1
      const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
      if (featureCount <= 0) {
        clearGeoJsonSourceData(basemapMap, graphSourceIdClustered)
        clearGeoJsonSourceData(basemapMap, graphSourceIdUnclustered)
        graphDataAppliedRef.current[viewMode] = ''
        setBasemapGraphRevision(prev => prev + 1)
        return
      }
      // Avoid MapLibre clustered GeoJSON buckets on globe/3D until that path is stable.
      const cluster = viewMode === 'map2d' && isPointOnlyFeatureCollection(graphFeatureCollection, 500) && featureCount >= 200
      const activeSourceId = cluster ? graphSourceIdClustered : graphSourceIdUnclustered
      const inactiveSourceId = cluster ? graphSourceIdUnclustered : graphSourceIdClustered
      const applyKey = `${styleRevisionKey}:${activeSourceId}:${graphDataKey}`
      const styleKey = pointStyleConfigSignature(pointStyleConfig || MAIN_PANEL_DEFAULT_GEOSPATIAL_POINT_STYLE_CONFIG)
      const activeSourceExists = (() => {
        try {
          return !!basemapMap.getSource?.(activeSourceId)
        } catch {
          return false
        }
      })()
      const datasetLayersPresent = (() => {
        try {
          return !!(
            basemapMap.getLayer?.(`${activeSourceId}:points`)
            || basemapMap.getLayer?.(`${activeSourceId}:routes`)
            || basemapMap.getLayer?.(`${activeSourceId}:cluster-bubbles`)
          )
        } catch {
          return false
        }
      })()
      if (graphDataAppliedRef.current[viewMode] === `${applyKey}:${styleKey}` && activeSourceExists && datasetLayersPresent) return
      clearGeoJsonSourceData(basemapMap, inactiveSourceId)
      ensureDatasetLayer(
        basemapMap,
        activeSourceId,
        colorForDataset(activeSourceId),
        cluster ? { cluster: true, pointStyleConfig } : { pointStyleConfig },
      )
      setGeoJsonSourceData(basemapMap, activeSourceId, graphFeatureCollection)
      graphDataAppliedRef.current[viewMode] = `${applyKey}:${styleKey}`
      setBasemapGraphRevision(prev => prev + 1)
    },
    [graphDataKey, graphFeatureCollection, graphSourceIdClustered, graphSourceIdUnclustered, pointStyleConfig],
  )

  React.useEffect(() => {
    if (!mapLibreRuntimeEnabled) return
    applyFeatureCollectionToBasemap({
      basemapMap: basemap.map,
      styleRevision: basemap.styleRevision,
      viewMode: show3d ? 'map3d' : 'map2d',
    })
  }, [applyFeatureCollectionToBasemap, basemap.map, basemap.styleRevision, mapLibreRuntimeEnabled, show3d])

  React.useEffect(() => {
    const map = basemap.map
    if (!map || !active) return
    if (typeof map.on !== 'function' || typeof map.off !== 'function' || typeof map.queryRenderedFeatures !== 'function') return
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const canRender = overlayHandlers && typeof overlayHandlers.renderPoiInRichMediaPanel === 'function'
    if (!canRender) return
    const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
    const cluster = !show3d && isPointOnlyFeatureCollection(graphFeatureCollection, 500) && featureCount >= 200
    const sourceId = cluster ? graphSourceIdClustered : graphSourceIdUnclustered
    const pointsLayerId = `${sourceId}:points`
    const hasLayer = (() => {
      try {
        return !!map.getLayer?.(pointsLayerId)
      } catch {
        return false
      }
    })()
    if (!hasLayer) return
    const readFeatureNodeId = (feature: unknown): string => {
      const record = isRecord(feature) ? (feature as Record<string, unknown>) : null
      if (!record) return ''
      const propsRaw = isRecord(record.properties) ? (record.properties as Record<string, unknown>) : {}
      const idRaw = record.id ?? propsRaw.id
      return String(idRaw || '').trim()
    }
    const getClickPointKey = (point: unknown): string => {
      const p = isRecord(point) ? (point as Record<string, unknown>) : null
      if (!p) return ''
      const x = Number(p.x)
      const y = Number(p.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return ''
      return `${Math.round(x)}:${Math.round(y)}`
    }
    const pickFeatureForClick = (features: unknown[], point: unknown): unknown | null => {
      const pointKey = getClickPointKey(point)
      const nodeFeatures = features
        .map(f => ({ feature: f, nodeId: readFeatureNodeId(f) }))
        .filter(entry => !!entry.nodeId)
      if (nodeFeatures.length < 1) {
        clickedGraphNodeCycleRef.current = null
        return null
      }
      const nodeIds = nodeFeatures.map(entry => entry.nodeId)
      const prev = clickedGraphNodeCycleRef.current
      const sameCycle = !!prev
        && prev.pointKey === pointKey
        && prev.nodeIds.length === nodeIds.length
        && prev.nodeIds.every((id, idx) => id === nodeIds[idx])
      const index = sameCycle && prev ? prev.nextIndex % nodeFeatures.length : 0
      clickedGraphNodeCycleRef.current = {
        pointKey,
        nodeIds,
        nextIndex: (index + 1) % nodeFeatures.length,
      }
      return nodeFeatures[index]?.feature ?? null
    }
    const onClick = (ev: any) => {
      try {
        const point = ev && typeof ev === 'object' ? (ev as { point?: unknown }).point : null
        const features = point ? map.queryRenderedFeatures(point, { layers: [pointsLayerId] }) : []
        const first = Array.isArray(features) ? pickFeatureForClick(features, point) : null
        if (!first) return
        renderGraphNodeClickInRichMediaPanel(first)
      } catch {
        void 0
      }
    }
    const onLeave = () => {
      clickedGraphNodeCycleRef.current = null
    }
    map.on('click', onClick)
    map.on('mouseout', onLeave)
    return () => {
      try {
        map.off('click', onClick)
        map.off('mouseout', onLeave)
      } catch {
        void 0
      }
    }
  }, [
    active,
    basemap.map,
    graphFeatureCollection,
    graphSourceIdClustered,
    graphSourceIdUnclustered,
    props.handlers,
    props.snapshot,
    renderGraphNodeClickInRichMediaPanel,
    show3d,
  ])

  const basemapGraphDebug = React.useMemo(() => {
    const basemapMap = basemap.map
    if (!basemapMap) return null
    const styleReady = basemap.styleRevision > 0 || isMapLibreStyleReady(basemapMap)
    const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
    const cluster = active && !show3d && isPointOnlyFeatureCollection(graphFeatureCollection, 500) && featureCount >= 200
    const activeSourceId = cluster ? graphSourceIdClustered : graphSourceIdUnclustered
    const inactiveSourceId = cluster ? graphSourceIdUnclustered : graphSourceIdClustered
    const readSourceFeatureCount = (sourceId: string): number | null => {
      if (!styleReady) return null
      try {
        const sourceData = readGeoJsonSourceData(
          basemapMap.getSource?.(sourceId),
        )
        return sourceData ? sourceData.features.length : null
      } catch {
        return null
      }
    }
    const hasLayer = (layerId: string): boolean => {
      if (!styleReady) return false
      try {
        return !!basemapMap.getLayer?.(layerId)
      } catch {
        return false
      }
    }
    return {
      styleReady,
      activeSourceId,
      activeSourceFeatures: readSourceFeatureCount(activeSourceId),
      inactiveSourceFeatures: readSourceFeatureCount(inactiveSourceId),
      pointsLayer: hasLayer(`${activeSourceId}:points`),
      routesLayer: hasLayer(`${activeSourceId}:routes`),
      clusterLayer: hasLayer(`${activeSourceId}:cluster-bubbles`),
    }
  }, [active, basemap.map, basemap.styleRevision, basemapGraphRevision, graphFeatureCollection, graphSourceIdClustered, graphSourceIdUnclustered, show3d])

  React.useEffect(() => {
    if (!show2dMapLibre) return
    if (!basemap.map) return
    const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
    if (featureCount <= 0) return
    if (basemapGraphDebug?.pointsLayer || basemapGraphDebug?.routesLayer || basemapGraphDebug?.clusterLayer) return
    applyFeatureCollectionToBasemap({ basemapMap: basemap.map, styleRevision: basemap.styleRevision, viewMode: 'map2d' })
  }, [
    applyFeatureCollectionToBasemap,
    basemap.map,
    basemap.styleRevision,
    basemapGraphDebug?.clusterLayer,
    basemapGraphDebug?.pointsLayer,
    basemapGraphDebug?.routesLayer,
    graphFeatureCollection.features,
    show2dMapLibre,
  ])

  const shouldOverlaySvgFallbackBasemap = React.useMemo(() => {
    if (!active) return false
    if (!show2dMapLibre) return false
    // Only overlay the SVG basemap when MapLibre itself is unavailable/failed.
    // Avoid masking a healthy basemap during transient layer sync windows.
    const hasRenderableMapLibreBasemap = !!basemap.map && !basemap.basemapUnavailable && basemap.probe.tilesLoaded
    const hasHardMapUnavailable =
      !basemap.map
      || basemap.basemapUnavailable
      || (!hasRenderableMapLibreBasemap && !!String(basemap.mapError || '').trim())
    if (!hasHardMapUnavailable) return false
    if (!basemapGraphDebug?.styleReady) return true
    return !basemapGraphDebug.pointsLayer && !basemapGraphDebug.routesLayer && !basemapGraphDebug.clusterLayer
  }, [active, basemap.basemapUnavailable, basemap.map, basemap.mapError, basemap.probe.tilesLoaded, basemapGraphDebug, show2dMapLibre])

  const showSvgFallback = show2dSvgFallback || shouldOverlaySvgFallbackBasemap

  React.useEffect(() => {
    if (!mapLibreRuntimeEnabled || showSvgFallback) return
    return bindMapLibreCanvasSemanticOwner(basemap.map, props.semanticMediaOwner)
  }, [basemap.map, mapLibreRuntimeEnabled, props.semanticMediaOwner, showSvgFallback])

  const shouldShowMapLibreErrorOverlay = React.useMemo(() => {
    if (!basemap.mapError) return false
    if (!show2dMapLibre && !show3d) return true
    return !basemap.map || basemap.basemapUnavailable || !basemap.probe.tilesLoaded
  }, [basemap.basemapUnavailable, basemap.map, basemap.mapError, basemap.probe.tilesLoaded, show2dMapLibre, show3d])

  const [svgOverlayInsetRight, setSvgOverlayInsetRight] = React.useState(12)
  React.useEffect(() => {
    const measure = () => {
      const nextInsetRight = Math.max(
        12,
        readGeoMapOcclusionPadding(rootRef.current).right,
      )
      setSvgOverlayInsetRight(prev => (Math.abs(prev - nextInsetRight) > 1 ? nextInsetRight : prev))
    }
    measure()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [])

  const svgFallbackClassName = shouldOverlaySvgFallbackBasemap
    ? 'absolute inset-0 z-[5] h-full w-full pointer-events-auto'
    : 'absolute inset-0 h-full w-full pointer-events-auto'

  const autoFitAppliedForDataKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    const map = basemap.map
    if (!map) return
    if (!active) return
    if (flightOverlayActive) return
    if (show3d) return
    if (!geospatialAutoFitEnabled) return
    if (!graphBounds) return
    const modeKey = show3d ? '3d' : '2d'
    const autoFitKey = `${modeKey}:${graphDataKey}`
    if (autoFitAppliedForDataKeyRef.current === autoFitKey) return
    autoFitAppliedForDataKeyRef.current = autoFitKey
    try {
      map.fitBounds(graphBounds, { padding: fitPadding, duration: 0 })
    } catch {
      void 0
    }
  }, [active, basemap.map, fitPadding, flightOverlayActive, geospatialAutoFitEnabled, graphBounds, graphDataKey, show3d])

  const initialDataFitDoneRef = React.useRef<boolean>(false)
  React.useEffect(() => {
    const map = basemap.map
    if (!map) return
    if (!active) return
    if (flightOverlayActive) return
    if (show3d) return
    const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
    if (featureCount <= 0) {
      initialDataFitDoneRef.current = false
      return
    }
    if (!graphBounds) return
    if (initialDataFitDoneRef.current) return
    initialDataFitDoneRef.current = true
    try {
      map.fitBounds(graphBounds, { padding: fitPadding, duration: 0 })
    } catch {
      void 0
    }
  }, [active, basemap.map, fitPadding, flightOverlayActive, graphBounds, graphFeatureCollection.features, show3d])

  React.useEffect(() => {
    const map = basemap.map
    if (!map || !active) {
      setGeospatialCursorLngLat(null)
      return
    }
    let rafId = 0
    const publish = (lngRaw: unknown, latRaw: unknown, options?: { immediate?: boolean }) => {
      const lng = Number(lngRaw)
      const lat = Number(latRaw)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      const roundedLng = Number(lng.toFixed(6))
      const roundedLat = Number(lat.toFixed(6))
      if (options?.immediate === true) {
        if (rafId) cancelAnimationFrame(rafId)
        setGeospatialCursorLngLat({ lng: roundedLng, lat: roundedLat })
        return
      }
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setGeospatialCursorLngLat({ lng: roundedLng, lat: roundedLat })
      })
    }
    const onMove = (ev: unknown) => {
      const evt = (ev || {}) as { lngLat?: { lng?: unknown; lat?: unknown } }
      publish(evt.lngLat?.lng, evt.lngLat?.lat)
    }
    const onLeave = () => {
      if (rafId) cancelAnimationFrame(rafId)
      setGeospatialCursorLngLat(null)
    }
    const publishFromClientPoint = (clientX: unknown, clientY: unknown, options?: { immediate?: boolean }) => {
      const x = Number(clientX)
      const y = Number(clientY)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const container = mapContainerRef.current || rootRef.current
      if (!container) return
      let rect: DOMRect | null = null
      try {
        rect = container.getBoundingClientRect()
      } catch {
        rect = null
      }
      if (!rect) return
      const localX = x - rect.left
      const localY = y - rect.top
      if (!Number.isFinite(localX) || !Number.isFinite(localY)) return
      if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return
      try {
        const ll = map.unproject?.([localX, localY]) as { lng?: unknown; lat?: unknown } | null
        publish(ll?.lng, ll?.lat, options)
      } catch {
        void 0
      }
    }
    try {
      map.on?.('mousemove', onMove)
      map.on?.('drag', onMove)
      map.on?.('mouseout', onLeave)
    } catch {
      void 0
    }
    const onDocumentDragOver = (ev: DragEvent) => {
      publishFromClientPoint(ev.clientX, ev.clientY)
    }
    const onDocumentDrop = (ev: DragEvent) => {
      publishFromClientPoint(ev.clientX, ev.clientY, { immediate: true })
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('dragover', onDocumentDragOver, true)
      document.addEventListener('drop', onDocumentDrop, true)
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      try {
        map.off?.('mousemove', onMove)
        map.off?.('drag', onMove)
        map.off?.('mouseout', onLeave)
      } catch {
        void 0
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('dragover', onDocumentDragOver, true)
        document.removeEventListener('drop', onDocumentDrop, true)
      }
      setGeospatialCursorLngLat(null)
    }
  }, [active, basemap.map, setGeospatialCursorLngLat])

  React.useEffect(() => {
    const map = basemap.map
    if (!map || !active || !geospatialFitRequest) return
    applyGeospatialFitRequest({
      map,
      request: geospatialFitRequest,
      selectedBounds,
      graphBounds,
      enhancedBounds: enhancedLayerBounds,
      padding: fitPadding,
    })
    clearGeospatialFitRequest()
  }, [active, basemap.map, clearGeospatialFitRequest, enhancedLayerBounds, fitPadding, geospatialFitRequest, graphBounds, selectedBounds])

  const debug = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      return new URLSearchParams(String(window.location.search || '')).get('kgGeoDebug') === '1'
    } catch {
      return false
    }
  }, [])

  React.useEffect(() => {
    if (!debug) return
    const overlayHandlers = getOverlayHandlers(props.snapshot, props.handlers)
    const upsert = overlayHandlers && typeof overlayHandlers.upsertUiToast === 'function' ? overlayHandlers.upsertUiToast as ((toast: { id: string; kind?: 'neutral' | 'success' | 'warning' | 'error'; message: string; ttlMs?: number | null; dismissible?: boolean; log?: boolean }) => void) : null
    if (!upsert) return
    const featureCount = Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0
    const resolvedFrom = String(overlayDebugInfo?.resolvedFrom || 'none')
    const sourcePath = String(overlayDebugInfo?.sourceDocumentPath || '')
    const embeddedBlocks = Number(overlayDebugInfo?.embeddedGeoBlockCount || 0)
    const supplementedNodes = Number(overlayDebugInfo?.supplementedNodeCount || 0)
    const sourceFilesCount = Number(overlayDebugInfo?.sourceFilesCount || 0)
    const message = `Geo overlay: features=${featureCount}, source=${resolvedFrom}, blocks=${embeddedBlocks}, added=${supplementedNodes}, files=${sourceFilesCount}${sourcePath ? `, path=${sourcePath}` : ''}`
    if (debugToastMessageRef.current === message) return
    debugToastMessageRef.current = message
    upsert({
      id: 'kg:geo:overlay-debug',
      kind: featureCount > 0 ? 'success' : 'warning',
      ttlMs: 4000,
      dismissible: true,
      log: false,
      message,
    })
  }, [debug, graphFeatureCollection.features, overlayDebugInfo, props.handlers, props.snapshot])

  return (
    <main
      ref={rootRef}
      className="relative w-full h-full"
      style={{ width: '100%', height: '100%' }}
      data-kg-geo-xr-aerial-geography-boundary={flightOverlayActive ? 'not-rendered' : undefined}
    >
      {showSvgFallback ? (
        <SvgGeospatialFallback
          featureCollection={graphFeatureCollection}
          selectedFeatureCollection={selectedFeatureCollection}
          className={svgFallbackClassName}
          insetPadding={shouldOverlaySvgFallbackBasemap ? { top: 12, right: Math.max(220, svgOverlayInsetRight), bottom: 12, left: 12 } : undefined}
          semanticMediaOwner={props.semanticMediaOwner}
          style={shouldOverlaySvgFallbackBasemap ? { transform: 'translateX(-220px)' } : undefined}
        />
      ) : null}
      {mapLibreRuntimeEnabled ? (
        <section
          ref={mapContainerRef}
          className="absolute inset-0 pointer-events-auto opacity-100"
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          aria-label={`${show3d ? '3D' : '2D'} geospatial map host`}
          data-kg-geospatial-map-host={show3d ? '3d' : '2d'}
        />
      ) : null}
      <GeospatialPointLegend
        visible={(show2dMapLibre || show3d) && Array.isArray(graphFeatureCollection.features) && graphFeatureCollection.features.length > 0}
        colors={{
          airport: pointStyleConfig.colors.airport,
          hotel: pointStyleConfig.colors.hotel,
          poi: pointStyleConfig.colors.poi,
          route: pointStyleConfig.colors.route,
        }}
      />
      {debug ? (
        <aside
          className={`absolute top-2 right-2 z-20 pointer-events-none rounded-md border px-2 py-1 text-[11px] ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.text.secondary}`}
          aria-label="Geospatial debug status"
        >
          <p>map: {basemap.map ? 'yes' : 'no'}</p>
          <p>view: {geospatialViewMode} provider: {providerLabel}</p>
          <p>
            canvas: {basemap.probe.canvasW}×{basemap.probe.canvasH} tilesLoaded: {basemap.probe.tilesLoaded ? 'yes' : 'no'}
          </p>
          <p>basemapUnavailable: {basemap.basemapUnavailable ? 'yes' : 'no'}</p>
          <p>
            zoom: {basemap.probe.zoom.toFixed(2)} center: {basemap.probe.lng.toFixed(4)},{basemap.probe.lat.toFixed(4)}
          </p>
          <p>features: {Array.isArray(graphFeatureCollection.features) ? graphFeatureCollection.features.length : 0}</p>
          <p>enhancedBounds: {enhancedLayerBounds ? enhancedLayerBounds.map(value => value.toFixed(3)).join(',') : 'none'}</p>
          {basemapGraphDebug ? (
            <>
              <p>styleReady: {basemapGraphDebug.styleReady ? 'yes' : 'no'} source: {basemapGraphDebug.activeSourceId}</p>
              <p>sourceFeatures: {String(basemapGraphDebug.activeSourceFeatures ?? 'n/a')} inactive: {String(basemapGraphDebug.inactiveSourceFeatures ?? 'n/a')}</p>
              <p>layers: points={basemapGraphDebug.pointsLayer ? 'yes' : 'no'} routes={basemapGraphDebug.routesLayer ? 'yes' : 'no'} clusters={basemapGraphDebug.clusterLayer ? 'yes' : 'no'}</p>
            </>
          ) : null}
          {basemap.mapError ? <p className="text-red-700 dark:text-red-300">err: {basemap.mapError}</p> : null}
        </aside>
      ) : null}
      {!debug && shouldShowMapLibreErrorOverlay ? (
        <output className={`absolute inset-0 flex items-center justify-center text-xs ${UI_THEME_TOKENS.panel.overlayBg} ${UI_THEME_TOKENS.text.secondary}`} aria-label="Geospatial map error">
          {basemap.mapError}
        </output>
      ) : null}
    </main>
  )
}
