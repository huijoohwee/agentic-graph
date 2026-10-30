import React from 'react'
import { colorForDataset, useMapLibreBasemap } from 'gympgrph/map-preview'
import { geoGraticule10, geoMercator, geoPath } from 'd3'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PASSIVE_BASE_LAYER_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import type { MarkdownGeoParsedFeatureCollection } from './markdownGeoParseContract'
import { resolveMarkdownGeoTextParseResult } from './markdownGeoParse'

const sanitizeId = (raw: string): string => {
  const s = String(raw || '').trim()
  if (!s) return 'dataset'
  return s.replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 80) || 'dataset'
}

const SAFE_SVG_FALLBACK_STYLE_SENTINEL = 'kg:style:svg-fallback'
const geoJsonOverlayBadgeClassName = `absolute bottom-2 right-2 z-20 pointer-events-none px-2 py-1 rounded-md text-xs ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.panel.overlayBg} border ${UI_THEME_TOKENS.panel.border}`

function reverseGeoJsonPolygonWindingForD3(fc: MarkdownGeoParsedFeatureCollection): MarkdownGeoParsedFeatureCollection {
  const normalizeRing = <T extends number[]>(ring: T[], isHole: boolean): T[] => {
    const signedArea = ring.reduce((area, position, index) => {
      const next = ring[(index + 1) % ring.length]
      if (!next || typeof position[0] !== 'number' || typeof position[1] !== 'number'
        || typeof next[0] !== 'number' || typeof next[1] !== 'number') return area
      return area + position[0] * next[1] - next[0] * position[1]
    }, 0)
    const needsReverse = isHole ? signedArea < 0 : signedArea > 0
    return needsReverse ? [...ring].reverse() : ring
  }
  return {
    ...fc,
    features: fc.features.map(feature => {
      const geometry = feature.geometry
      if (!geometry) return feature
      if (geometry.type === 'Polygon') {
        return {
          ...feature,
          geometry: {
            ...geometry,
            coordinates: geometry.coordinates.map((ring, index) => normalizeRing(ring, index > 0)),
          },
        }
      }
      if (geometry.type === 'MultiPolygon') {
        return {
          ...feature,
          geometry: {
            ...geometry,
            coordinates: geometry.coordinates.map(polygon => polygon.map((ring, index) => normalizeRing(ring, index > 0))),
          },
        }
      }
      return feature
    }),
  }
}

function GeoJsonSvgPreview(args: {
  fc: MarkdownGeoParsedFeatureCollection
  color: string
  height: number | string
  selectedFeatureId?: string | number | null
  className?: string
}) {
  const { fc, color, height, selectedFeatureId = null, className } = args
  const width = 1000
  const viewHeight = 600
  const previewFeatureCollection = React.useMemo(() => reverseGeoJsonPolygonWindingForD3(fc), [fc])
  const projection = React.useMemo(() => {
    try {
      return geoMercator().fitSize([width, viewHeight], previewFeatureCollection as never)
    } catch {
      return geoMercator()
    }
  }, [previewFeatureCollection])
  const pathGen = React.useMemo(() => {
    try {
      return geoPath(projection).pointRadius(7)
    } catch {
      return null
    }
  }, [projection])
  const paths = React.useMemo(() => {
    if (!pathGen) return [] as Array<{ key: string; d: string; selected: boolean; fill: string; fillOpacity: number }>
    const out: Array<{ key: string; d: string; selected: boolean; fill: string; fillOpacity: number }> = []
    const features = Array.isArray(previewFeatureCollection.features) ? previewFeatureCollection.features : []
    for (let i = 0; i < features.length; i += 1) {
      const f = features[i]
      if (!f) continue
      let d = ''
      try {
        d = String(pathGen(f as never) || '')
      } catch {
        d = ''
      }
      if (!d) continue
      const id = (f as unknown as { id?: unknown }).id
      const key = typeof id === 'string' || typeof id === 'number' ? String(id) : `f${i}`
      const properties = f.properties && typeof f.properties === 'object'
        ? f.properties as Record<string, unknown>
        : {}
      const rawFill = properties.kgFillColor
      const fill = typeof rawFill === 'string' && /^#[0-9a-f]{6}$/iu.test(rawFill)
        ? rawFill
        : f.geometry?.type === 'Point' ? color : 'none'
      const rawOpacity = Number(properties.kgFillOpacity)
      const fillOpacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 0.9
      out.push({
        key,
        d,
        selected: selectedFeatureId !== null && key === String(selectedFeatureId),
        fill,
        fillOpacity,
      })
    }
    return out
  }, [pathGen, previewFeatureCollection.features, selectedFeatureId])

  return (
    <svg
      className={className || ''}
      style={{ height }}
      viewBox={`0 0 ${width} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label={selectedFeatureId === null ? 'GeoJSON preview' : `GeoJSON preview; selected feature ${selectedFeatureId}`}
      role="img"
    >
      <rect x="0" y="0" width={width} height={viewHeight} fill="transparent" />
      <g>
        {paths.map(p => (
          <path key={p.key} d={p.d} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.selected ? '#facc15' : color} strokeWidth={p.selected ? 5 : 2} opacity={p.selected ? 1 : 0.85} />
        ))}
      </g>
    </svg>
  )
}

function GeoGraticuleSvg(args: { height: number | string; className?: string }) {
  const { height, className } = args
  const width = 1000
  const viewHeight = 600
  const projection = React.useMemo(() => {
    try {
      return geoMercator().fitSize([width, viewHeight], { type: 'Sphere' } as never)
    } catch {
      return geoMercator()
    }
  }, [])
  const pathGen = React.useMemo(() => {
    try {
      return geoPath(projection)
    } catch {
      return null
    }
  }, [projection])
  const graticulePath = React.useMemo(() => {
    if (!pathGen) return ''
    try {
      return String(pathGen(geoGraticule10() as never) || '')
    } catch {
      return ''
    }
  }, [pathGen])
  const spherePath = React.useMemo(() => {
    if (!pathGen) return ''
    try {
      return String(pathGen({ type: 'Sphere' } as never) || '')
    } catch {
      return ''
    }
  }, [pathGen])

  return (
    <svg
      className={className || ''}
      style={{ height }}
      viewBox={`0 0 ${width} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="Basemap graticule"
      role="img"
    >
      <rect x="0" y="0" width={width} height={viewHeight} fill="rgba(148,163,184,0.08)" />
      {spherePath ? (
        <path d={spherePath} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth={2} />
      ) : null}
      {graticulePath ? (
        <path d={graticulePath} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth={1} />
      ) : null}
    </svg>
  )
}

export function InlineMarkdownGeoJsonLayerMap(args: {
  geojsonText: string
  datasetId: string
  featureCollection?: MarkdownGeoParsedFeatureCollection | null
  selectedFeatureId?: string | number | null
  attribution?: string
  className?: string
  heightPx?: number
  useContainerHeight?: boolean
}) {
  const {
    geojsonText,
    datasetId,
    featureCollection = null,
    selectedFeatureId = null,
    attribution = '',
    className,
    heightPx = 320,
    useContainerHeight = false,
  } = args
  const rootRef = React.useRef<HTMLElement | null>(null)
  const containerRef = React.useRef<HTMLElement | null>(null)
  // Preserve the shared map host contract while keeping local previews SVG-only and network-free.
  useMapLibreBasemap({
    enabled: false,
    rootRef,
    containerRef,
    targetStyleUrl: SAFE_SVG_FALLBACK_STYLE_SENTINEL,
    canvasRenderMode: '2d',
    projectionMode: 'mercator',
    viewportSizingMode: 'none',
    vectorFallbackMs: 2_000,
  })
  const parsed = React.useMemo(() => {
    return resolveMarkdownGeoTextParseResult({ geojsonText, featureCollection })
  }, [featureCollection, geojsonText])
  const svgColor = React.useMemo(() => {
    const safeDatasetId = sanitizeId(datasetId)
    return colorForDataset(safeDatasetId)
  }, [datasetId])
  const rootHeight = useContainerHeight ? '100%' : heightPx
  const rootMinHeight = useContainerHeight ? heightPx : undefined
  const hasInputText = Boolean(parsed.normalizedText)

  return (
    <section ref={rootRef} className={`relative ${className || ''}`} style={{ height: rootHeight, minHeight: rootMinHeight }}>
      <section className={UI_RESPONSIVE_PASSIVE_BASE_LAYER_SURFACE_CLASSNAME}>
        <GeoGraticuleSvg height={rootHeight} className="w-full" />
        {parsed.featureCollection ? (
          <GeoJsonSvgPreview
            fc={parsed.featureCollection}
            color={svgColor}
            height={rootHeight}
            selectedFeatureId={selectedFeatureId}
            className="w-full"
          />
        ) : null}
      </section>
      {String(attribution || '').trim() ? (
        <section className="absolute bottom-2 left-2 z-20 max-w-[85%] pointer-events-none rounded-md border border-white/20 bg-slate-950/90 px-2 py-1 text-[10px] text-white/90" aria-label={`Data attribution: ${attribution}`}>
          {attribution}
        </section>
      ) : null}
      {hasInputText && !parsed.featureCollection ? (
        <section className={geoJsonOverlayBadgeClassName} role="status">
          Invalid GeoJSON
        </section>
      ) : null}
    </section>
  )
}
