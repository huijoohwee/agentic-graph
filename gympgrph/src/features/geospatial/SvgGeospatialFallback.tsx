import React from 'react'
import type { FeatureCollection } from 'geojson'
import { geoEquirectangular, geoGraticule, geoPath } from 'd3'
import { computeBoundsFromCollections } from '../../geo.js'
import { bindMapLibreCanvasSemanticOwner, type MapLibreCanvasSemanticOwner } from './mapLibreCanvasSemanticOwner.js'
import { HIGH_FIDELITY_WORLD_SVG_HEIGHT, HIGH_FIDELITY_WORLD_SVG_INNER, HIGH_FIDELITY_WORLD_SVG_WIDTH } from './worldSvgBasemap.js'

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

export default function SvgGeospatialFallback(args: {
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

