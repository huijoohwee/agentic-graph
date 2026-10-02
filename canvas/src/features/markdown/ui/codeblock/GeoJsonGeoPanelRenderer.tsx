import React from 'react'
import { Database, Map as MapIcon, Network } from 'lucide-react'
import type { RenderOpts } from '@/features/markdown/ui/MarkdownRendererTypes'
import { uiPrimaryIconActiveClassName } from '@/features/graph-data-table/ui/GraphDataTableToolbarStyles'
import IconButton from '@/components/IconButton'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import { ErrorFeedback } from '@/components/ui/ErrorFeedback'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_MARKDOWN_GEO_PANEL_EMPTY_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_GEO_PANEL_FRAME_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_GEO_PANEL_PRESENTATION_FRAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS,
  MARKDOWN_CODE_FENCE_PRE_SURFACE_BASE_CLASS,
} from '@/features/markdown/ui/markdownEditSurfaceLayout'
import { UI_COPY } from '@/lib/config'
import { HighlightedCode } from './HighlightedCode'
import { ensureMapLibreStyles } from '@/lib/ui/lazyStyles'
import {
  buildMarkdownGeoDatasetRequestFingerprint,
} from '@/features/geospatial/markdownGeoDatasetRequest'
import type { MarkdownGeoCodeBlockLanguage } from '@/features/geospatial/markdownGeoCodeBlockContract'
import type { MarkdownGeoDatasetRegistrationRequest } from '@/features/geospatial/markdownGeoDatasetContract'

const AUTO_REGISTER_TTL_MS = 20 * 60 * 1000
const AUTO_REGISTER_MAX_KEYS = 800
const autoRegisterKeyToMs = new globalThis.Map<string, number>()

const markAutoRegisterKey = (key: string): boolean => {
  const now = Date.now()
  const prev = autoRegisterKeyToMs.get(key)
  if (typeof prev === 'number' && now - prev <= AUTO_REGISTER_TTL_MS) return false
  autoRegisterKeyToMs.set(key, now)
  if (autoRegisterKeyToMs.size > AUTO_REGISTER_MAX_KEYS) {
    const entries = Array.from(autoRegisterKeyToMs.entries()).sort((a, b) => a[1] - b[1])
    for (let i = 0; i < Math.ceil(AUTO_REGISTER_MAX_KEYS / 4); i += 1) {
      const k = entries[i]?.[0]
      if (k) autoRegisterKeyToMs.delete(k)
    }
  }
  return true
}

const isRenderableGeoJsonCodeBlock = (args: {
  lang: MarkdownGeoCodeBlockLanguage
  req: MarkdownGeoDatasetRegistrationRequest
  isGeoJsonCodeBlock?: ((req: any) => boolean) | undefined
}): boolean => {
  if (args.lang === 'geojson') return true
  if (args.lang !== 'json') return false
  if (typeof args.isGeoJsonCodeBlock !== 'function') return false
  try {
    return !!args.isGeoJsonCodeBlock(args.req)
  } catch {
    return false
  }
}

export function GeoJsonGeoPanelRenderer(props: {
  lang: MarkdownGeoCodeBlockLanguage
  text: string
  req: MarkdownGeoDatasetRegistrationRequest
  opts: RenderOpts
  monospaceCodeClass: string
}) {
  const { lang, text, req, opts, monospaceCodeClass } = props
  const integration = opts.geoDatasetIntegration
  const isGeoJsonCodeBlock = integration?.isGeoJsonCodeBlock
  const register = integration?.registerGeoJsonFeatureCollection
  const loadGraphData = integration?.loadGeoJsonAsGraphData
  const requestOpen = integration?.requestOpenGeoPanel
  const renderGeo = integration?.renderGeoJsonFeatureCollection

  const [isFullscreenOpen, setIsFullscreenOpen] = React.useState(false)
  const [datasetState, setDatasetState] = React.useState<'idle' | 'registering' | 'registered' | 'error'>('idle')
  const [datasetError, setDatasetError] = React.useState<string | null>(null)
  const [graphState, setGraphState] = React.useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [graphError, setGraphError] = React.useState<string | null>(null)

  const trimmed = String(text || '').trim()

  const shouldTreatAsGeoJson = isRenderableGeoJsonCodeBlock({ lang, req, isGeoJsonCodeBlock })
  const canAttemptRegister = shouldTreatAsGeoJson && !!trimmed && typeof register === 'function'
  const canAttemptLoadGraph = shouldTreatAsGeoJson && !!trimmed && typeof loadGraphData === 'function'
  const canOpenPanel = typeof requestOpen === 'function'

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!shouldTreatAsGeoJson) return
    void ensureMapLibreStyles()
  }, [shouldTreatAsGeoJson])

  const geospatialModeOn = React.useMemo(() => {
    if (typeof integration?.isGeospatialModeEnabled !== 'function') return false
    try {
      return integration.isGeospatialModeEnabled() === true
    } catch {
      return false
    }
  }, [integration])

  const autoRegisterKey = React.useMemo(() => {
    return buildMarkdownGeoDatasetRequestFingerprint(req)
  }, [req])

  React.useEffect(() => {
    if (!geospatialModeOn) return
    if (!canAttemptRegister) return
    if (datasetState !== 'idle') return
    if (!markAutoRegisterKey(autoRegisterKey)) return

    setDatasetState('registering')
    setDatasetError(null)
    Promise.resolve(register?.(req))
      .then(res => {
        if (res && res.ok) {
          setDatasetState('registered')
          return
        }
        setDatasetState('error')
        setDatasetError(res && typeof res.error === 'string' && res.error.trim() ? res.error.trim() : 'Registration failed')
      })
      .catch(err => {
        setDatasetState('error')
        if (err && typeof err === 'object' && 'message' in err) {
          const msg = (err as { message?: unknown }).message
          setDatasetError(String(msg || 'Registration failed'))
          return
        }
        setDatasetError('Registration failed')
      })
  }, [autoRegisterKey, canAttemptRegister, datasetState, geospatialModeOn, register, req])

  const handleRegisterDataset = React.useCallback(() => {
    if (!canAttemptRegister) return
    setDatasetState('registering')
    setDatasetError(null)
    Promise.resolve(register?.(req))
      .then(res => {
        if (res && res.ok) {
          setDatasetState('registered')
          return
        }
        setDatasetState('error')
        setDatasetError(res && typeof res.error === 'string' && res.error.trim() ? res.error.trim() : 'Registration failed')
      })
      .catch(err => {
        setDatasetState('error')
        if (err && typeof err === 'object' && 'message' in err) {
          const msg = (err as { message?: unknown }).message
          setDatasetError(String(msg || 'Registration failed'))
          return
        }
        setDatasetError('Registration failed')
      })
  }, [canAttemptRegister, register, req])

  const handleLoadGraphData = React.useCallback(() => {
    if (!canAttemptLoadGraph) return
    setGraphState('loading')
    setGraphError(null)
    Promise.resolve(loadGraphData?.(req))
      .then(res => {
        if (res && res.ok) {
          setGraphState('loaded')
          return
        }
        setGraphState('error')
        setGraphError(res && typeof res.error === 'string' && res.error.trim() ? res.error.trim() : 'Graph conversion failed')
      })
      .catch(err => {
        setGraphState('error')
        if (err && typeof err === 'object' && 'message' in err) {
          const msg = (err as { message?: unknown }).message
          setGraphError(String(msg || 'Graph conversion failed'))
          return
        }
        setGraphError('Graph conversion failed')
      })
  }, [canAttemptLoadGraph, loadGraphData, req])

  const { mapNode, mapError } = React.useMemo(() => {
    if (typeof window === 'undefined') return { mapNode: null as React.ReactNode | null, mapError: null as unknown }
    if (!trimmed) return { mapNode: null as React.ReactNode | null, mapError: null as unknown }
    if (!shouldTreatAsGeoJson) return { mapNode: null as React.ReactNode | null, mapError: null as unknown }
    if (!renderGeo) {
      return { mapNode: null as React.ReactNode | null, mapError: new Error('Map preview unavailable') }
    }
    try {
      const node = renderGeo(req)
      if (!node) return { mapNode: null as React.ReactNode | null, mapError: new Error('GeoJSON renderer returned no output') }
      return { mapNode: node, mapError: null as unknown }
    } catch (err) {
      return { mapNode: null as React.ReactNode | null, mapError: err }
    }
  }, [renderGeo, req, shouldTreatAsGeoJson, trimmed])
  const codeFenceContentClassName = `${MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS} ${UI_THEME_TOKENS.code.bg} ${UI_THEME_TOKENS.code.text}`
  const codeFencePreClassName = `${MARKDOWN_CODE_FENCE_PRE_SURFACE_BASE_CLASS} whitespace-pre ${monospaceCodeClass}`

  if (typeof window === 'undefined') {
    return (
      <section className={codeFenceContentClassName}>
        <pre className={codeFencePreClassName}>
          <HighlightedCode code={text} lang={lang} highlightLines={null} />
        </pre>
      </section>
    )
  }

  if (!trimmed) {
    return (
      <section className={UI_RESPONSIVE_MARKDOWN_GEO_PANEL_EMPTY_CLASSNAME}>
        <p className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>Empty GeoJSON block.</p>
      </section>
    )
  }

  if (!shouldTreatAsGeoJson) {
    return (
      <section className={codeFenceContentClassName}>
        <pre className={codeFencePreClassName}>
          <HighlightedCode code={text} lang={lang} highlightLines={null} />
        </pre>
      </section>
    )
  }

  

  const fallbackNode = (
    <section className={codeFenceContentClassName}>
      <pre className={codeFencePreClassName}>
        <HighlightedCode code={text} lang={lang} highlightLines={null} />
      </pre>
    </section>
  )

  const effectiveNode = mapNode ?? fallbackNode
  const mapFrameClass = opts.markdownPresentationMode
    ? UI_RESPONSIVE_MARKDOWN_GEO_PANEL_PRESENTATION_FRAME_CLASSNAME
    : UI_RESPONSIVE_MARKDOWN_GEO_PANEL_FRAME_CLASSNAME
  const statusText = (() => {
    if (datasetState === 'registering') return 'Registering GeoJSON as a dataset…'
    if (datasetState === 'registered') return 'GeoJSON registered as a dataset.'
    if (datasetState === 'error') return datasetError || 'GeoJSON dataset registration failed.'
    if (graphState === 'loading') return 'Converting GeoJSON into graph nodes…'
    if (graphState === 'loaded') return 'GeoJSON converted into graph nodes.'
    if (graphState === 'error') return graphError || 'GeoJSON graph conversion failed.'
    return 'GeoJSON ready.'
  })()

  return (
    <section className="w-full">
      {mapError ? (
        <section className="mb-2">
          <ErrorFeedback title="GeoJSON render failed" error={mapError} variant="compact" className="mt-0 mb-2" />
        </section>
      ) : null}

      <section className="w-full">
        {mapNode ? (
          <>
            <figure
              className="m-0 p-0 w-full"
              onDoubleClick={() => {
                if (opts.markdownPresentationMode || opts.previewOverlayScope === 'container') {
                  setIsFullscreenOpen(true)
                  return
                }
                requestOpen?.()
              }}
              aria-label="GeoJSON map"
            >
              <section className={mapFrameClass}>{effectiveNode}</section>
              <figcaption className="sr-only">GeoJSON map preview</figcaption>
            </figure>
            <PreviewOverlay
              open={isFullscreenOpen}
              onClose={() => setIsFullscreenOpen(false)}
              scope={opts.previewOverlayScope}
              portalTarget={opts.previewOverlayPortalTarget}
            >
              <section className="w-full h-full">
                {mapNode ? (
                  <section className="w-full h-full">{mapNode}</section>
                ) : (
                  <ErrorFeedback
                    title="GeoJSON render failed"
                    error="GeoJSON renderer returned no output"
                    className="mt-0"
                  />
                )}
              </section>
            </PreviewOverlay>
          </>
        ) : (
          effectiveNode
        )}
      </section>

      {(canAttemptRegister || canAttemptLoadGraph || canOpenPanel) ? (
        <section className="mt-2 flex items-center justify-between gap-2">
          <p className={`m-0 text-xs ${UI_THEME_TOKENS.text.tertiary}`}>
            {statusText}
          </p>
          <menu className="flex items-center gap-1" aria-label="GeoJSON actions">
            {canAttemptLoadGraph && graphState !== 'loading' ? (
              <IconButton
                className={`App-toolbar__btn ${uiPrimaryIconActiveClassName}`}
                title={UI_COPY.markdownGeoJsonLoadGraphTitle}
                onClick={handleLoadGraphData}
                showTooltip
              >
                <Network className="w-4 h-4 LaunchButton__icon" aria-hidden="true" />
              </IconButton>
            ) : null}
            {canAttemptRegister && datasetState !== 'registering' ? (
              <IconButton
                className={`App-toolbar__btn ${uiPrimaryIconActiveClassName}`}
                title={UI_COPY.markdownGeoJsonAddDatasetTitle}
                onClick={handleRegisterDataset}
                showTooltip
              >
                <Database className="w-4 h-4 LaunchButton__icon" aria-hidden="true" />
              </IconButton>
            ) : null}
            {canOpenPanel ? (
              <IconButton
                className={`App-toolbar__btn ${uiPrimaryIconActiveClassName}`}
                title={UI_COPY.geospatialModeOnTitle}
                onClick={() => requestOpen?.()}
                showTooltip
              >
                <MapIcon className="w-4 h-4 LaunchButton__icon" aria-hidden="true" />
              </IconButton>
            ) : null}
          </menu>
        </section>
      ) : null}
    </section>
  )
}
