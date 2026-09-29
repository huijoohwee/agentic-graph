import React from 'react'
import {
  colorForDataset,
  useMapLibreBasemap,
} from 'gympgrph/map-preview'
import { geoGraticule10, geoMercator, geoPath } from 'd3'
import { shouldSuppressBasemapErrorMessage } from './basemapErrorSuppression'
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

function GeoJsonSvgPreview(args: {
  fc: MarkdownGeoParsedFeatureCollection
  color: string
  height: number | string
  className?: string
}) {
  const { fc, color, height, className } = args
  const width = 1000
  const viewHeight = 600
  const projection = React.useMemo(() => {
    try {
      return geoMercator().fitSize([width, viewHeight], fc as never)
    } catch {
      return geoMercator()
    }
  }, [fc])
  const pathGen = React.useMemo(() => {
    try {
      return geoPath(projection).pointRadius(3)
    } catch {
      return null
    }
  }, [projection])
  const paths = React.useMemo(() => {
    if (!pathGen) return [] as Array<{ key: string; d: string }>
    const out: Array<{ key: string; d: string }> = []
    const features = Array.isArray(fc.features) ? fc.features : []
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
      out.push({ key, d })
    }
    return out
  }, [fc.features, pathGen])

  return (
    <svg
      className={className || ''}
      style={{ height }}
      viewBox={`0 0 ${width} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label="GeoJSON preview"
      role="img"
    >
      <rect x="0" y="0" width={width} height={viewHeight} fill="transparent" />
      <g>
        {paths.map(p => (
          <path key={p.key} d={p.d} fill="none" stroke={color} strokeWidth={2} opacity={0.85} />
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
  className?: string
  heightPx?: number
  useContainerHeight?: boolean
}) {
  const { geojsonText, datasetId, featureCollection = null, className, heightPx = 320, useContainerHeight = false } = args
  const rootRef = React.useRef<HTMLElement | null>(null)
  const containerRef = React.useRef<HTMLElement | null>(null)
  const [shouldLoadMap, setShouldLoadMap] = React.useState(false)
  const [isInView, setIsInView] = React.useState(true)
  const [mapEverEnabled, setMapEverEnabled] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [basemapWarning, setBasemapWarning] = React.useState<string | null>(null)

  const targetStyleUrl = SAFE_SVG_FALLBACK_STYLE_SENTINEL
  const parsed = React.useMemo(() => {
    return resolveMarkdownGeoTextParseResult({ geojsonText, featureCollection })
  }, [featureCollection, geojsonText])

  const isJsdom = React.useMemo(() => {
    const ua = typeof window !== 'undefined' ? String(window.navigator?.userAgent || '') : ''
    return /jsdom/i.test(ua)
  }, [])

  React.useEffect(() => {
    if (shouldLoadMap) return
    if (isJsdom) return
    if (!parsed.featureCollection) return
    const isPositiveSize = (el: HTMLElement | null): boolean => {
      if (!el) return false
      try {
        const rect = el.getBoundingClientRect()
        const w = Number.isFinite(rect.width) ? Math.max(0, Math.floor(rect.width)) : 0
        const h = Number.isFinite(rect.height) ? Math.max(0, Math.floor(rect.height)) : 0
        return w > 0 && h > 0
      } catch {
        return false
      }
    }

    if (isPositiveSize(containerRef.current) || isPositiveSize(rootRef.current)) {
      setShouldLoadMap(true)
      return
    }

    if (typeof ResizeObserver === 'undefined') {
      setShouldLoadMap(true)
      return
    }

    let cancelled = false
    const ro = new ResizeObserver(() => {
      if (cancelled) return
      if (isPositiveSize(containerRef.current) || isPositiveSize(rootRef.current)) {
        setShouldLoadMap(true)
        try {
          ro.disconnect()
        } catch {
          void 0
        }
      }
    })

    try {
      if (rootRef.current) ro.observe(rootRef.current)
      if (containerRef.current && containerRef.current !== rootRef.current) ro.observe(containerRef.current)
    } catch {
      try {
        ro.disconnect()
      } catch {
        void 0
      }
      setShouldLoadMap(true)
      return
    }

    return () => {
      cancelled = true
      try {
        ro.disconnect()
      } catch {
        void 0
      }
    }
  }, [isJsdom, parsed.featureCollection, shouldLoadMap])

  React.useEffect(() => {
    if (isJsdom) return
    const el = rootRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return
    let cancelled = false
    const io = new IntersectionObserver(
      entries => {
        if (cancelled) return
        const entry = entries && entries.length > 0 ? entries[0] : null
        if (!entry) return
        setIsInView(entry.isIntersecting || entry.intersectionRatio > 0)
      },
      { root: null, rootMargin: '200px 0px 200px 0px', threshold: [0, 0.01] },
    )
    try {
      io.observe(el)
    } catch {
      try {
        io.disconnect()
      } catch {
        void 0
      }
      return
    }
    return () => {
      cancelled = true
      try {
        io.disconnect()
      } catch {
        void 0
      }
    }
  }, [isJsdom])

  React.useEffect(() => {
    if (mapEverEnabled) return
    if (!shouldLoadMap || !isInView) return
    if (!parsed.featureCollection) return
    setMapEverEnabled(true)
  }, [isInView, mapEverEnabled, parsed.featureCollection, shouldLoadMap])

  React.useEffect(() => {
    if (!parsed.featureCollection && mapEverEnabled) setMapEverEnabled(false)
  }, [mapEverEnabled, parsed.featureCollection])

  const mapEnabled = mapEverEnabled

  const basemap = useMapLibreBasemap({
    enabled: mapEnabled,
    rootRef,
    containerRef,
    targetStyleUrl,
    canvasRenderMode: '2d',
    projectionMode: 'mercator',
    viewportSizingMode: 'none',
    vectorFallbackMs: 2_000,
  })

  React.useEffect(() => {
    const msg = String(basemap.mapError || '').trim()
    if (!msg) return
    const lower = msg.toLowerCase()
    const isWebglError = lower.includes('webgl')
    if (isWebglError) setError(prev => prev || msg)

    if (shouldSuppressBasemapErrorMessage(msg)) {
      setBasemapWarning(prev => prev || 'Basemap unavailable')
      return
    }
    setError(prev => prev || msg)
  }, [basemap.mapError])

  const containerGridStyle = React.useMemo(() => {
    return {
      backgroundColor: 'rgba(15,23,42,1)',
      backgroundImage:
        'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      backgroundPosition: '0 0, 0 0',
    } as const
  }, [])

  const lastFitDataKeyRef = React.useRef<string>('')
  React.useEffect(() => {
    const map = basemap.map
    if (!map) return
    if (basemap.styleRevision <= 0) return
    if (!parsed.featureCollection) {
      setError('GeoJSON render: invalid or unsupported shape')
      return
    }
    const safeDatasetId = sanitizeId(datasetId)
    const dataKey = `${basemap.styleRevision}:${safeDatasetId}:${parsed.textHash}`
    if (lastFitDataKeyRef.current === dataKey) return
    if (parsed.bounds) {
      try {
        map.fitBounds(parsed.bounds, { padding: 24, duration: 0 })
        lastFitDataKeyRef.current = dataKey
        setError(null)
      } catch {
        setError('GeoJSON preview fit failed')
      }
      return
    }
    lastFitDataKeyRef.current = dataKey
    setError(null)
  }, [basemap.map, basemap.styleRevision, datasetId, parsed.bounds, parsed.featureCollection, parsed.textHash])

  React.useEffect(() => {
    const map = basemap.map
    if (!map) return
    try {
      map.resize()
    } catch {
      void 0
    }
  }, [basemap.map, heightPx, className])

  const overlayMessage = React.useMemo(() => {
    if (error && String(error).trim()) return String(error).trim()
    if (basemapWarning && String(basemapWarning).trim()) return String(basemapWarning).trim()
    if (!parsed.featureCollection) return null
    if (basemap.map) return null
    if (!shouldLoadMap) return 'Preparing map preview…'
    if (!isInView) return null
    return 'Loading map preview…'
  }, [error, basemapWarning, basemap.map, isInView, parsed.featureCollection, shouldLoadMap])

  const svgColor = React.useMemo(() => {
    const safeDatasetId = sanitizeId(datasetId)
    return colorForDataset(safeDatasetId)
  }, [datasetId])

  const rootHeight = useContainerHeight ? '100%' : heightPx
  const rootMinHeight = useContainerHeight ? heightPx : undefined
  const hasInputText = React.useMemo(() => Boolean(parsed.normalizedText), [parsed.normalizedText])

  return (
    <section ref={el => {
      rootRef.current = el
    }} className={`relative ${className || ''}`} style={{ height: rootHeight, minHeight: rootMinHeight }}>
      <section className={UI_RESPONSIVE_PASSIVE_BASE_LAYER_SURFACE_CLASSNAME}>
        <GeoGraticuleSvg height={rootHeight} className="w-full" />
        {parsed.featureCollection ? <GeoJsonSvgPreview fc={parsed.featureCollection} color={svgColor} height={rootHeight} className="w-full" /> : null}
      </section>
      <section ref={el => {
        containerRef.current = el
      }} data-testid="geojson-map-container" className="absolute inset-0 z-10" style={containerGridStyle} />
      {overlayMessage && (
        <section
          data-testid="geojson-map-overlay"
          className={geoJsonOverlayBadgeClassName}
        >
          {overlayMessage}
        </section>
      )}
      {!overlayMessage && hasInputText && !parsed.featureCollection ? (
        <section className={geoJsonOverlayBadgeClassName}>
          Invalid GeoJSON
        </section>
      ) : null}
    </section>
  )
}
