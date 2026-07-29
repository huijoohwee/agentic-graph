import React from 'react'
import type { GeospatialViewMode } from 'grph-shared/geospatial/events'
import { GEOSPATIAL_STYLE_URL_CHANGED_EVENT } from 'grph-shared/geospatial/constants'
import { UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import { coercePanelTypography, type PanelTypography } from 'grph-shared/ui/panelTypography'
import { requestGeospatialCurrentLocation, requestGeospatialFitToData, requestGeospatialFitToSelection } from './geospatialFit.js'
import { LS_KEYS } from './lib/config.js'
import { useGympgrphStore } from './store.js'
import {
  GRABMAPS_DEFAULT_STYLE_URL,
  MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  MAPLIBRE_GLOBE_DEFAULT_STYLE_URL,
  getBuiltInDefaultStyleUrl,
  isGrabMapsStyleUrl,
  normalizePersistedGeospatialStyleUrl,
  normalizeGeospatialViewMode,
  resolveStandardViewModeStyleUrl,
} from './features/geospatial/basemapStyle.js'
import {
  MAIN_PANEL_DEFAULT_GEOSPATIAL_POINT_STYLE_CONFIG,
  normalizeGeospatialPointStyleConfig,
  readGeospatialPointStyleConfig,
  type GeospatialPointStyleConfig,
  writeGeospatialPointStyleConfig,
} from './features/geospatial/pointStyleConfig.js'
import { GeospatialPanelDisplayControls } from './GeospatialPanelDisplayControls.js'
import { GeospatialPanelDatasetControls } from './GeospatialPanelDatasetControls.js'
import {
  GEOSPATIAL_PANEL_ROOT_CLASS_NAME,
  GeoPanelKtvRow,
  GeoPanelTypeIconProvider,
  type GeoPanelTypeIconRenderer,
} from './geospatialPanelUi.js'

type GeospatialPanelHostProps = {
  active?: boolean
  enhancedLayerCatalog?: React.ReactNode
  panelTypography?: unknown
  renderTypeIcon?: GeoPanelTypeIconRenderer
  snapshot?: unknown
  handlers?: unknown
}

const GEOSPATIAL_COMMIT_DEBOUNCE_MS = 120

const readPreferredGrabMapsStyleUrl = (): string => {
  return readLsString(LS_KEYS.grabMapsBasemapStyleUrl, GRABMAPS_DEFAULT_STYLE_URL)
}

const persistPreferredGrabMapsStyleUrl = (styleUrl: string): void => {
  if (!isGrabMapsStyleUrl(styleUrl)) return
  writeLsString(LS_KEYS.grabMapsBasemapStyleUrl, styleUrl)
}

const readLsString = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    if (v == null) return fallback
    if (key === LS_KEYS.geospatialStyleUrl) {
      const normalized = normalizePersistedGeospatialStyleUrl(v)
      return normalized || fallback
    }
    return String(v)
  } catch {
    return fallback
  }
}

const writeLsString = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    void 0
  }
}

export function GeospatialPanelHost(props: GeospatialPanelHostProps): React.ReactElement {
  const active = props.active !== false
  const disabled = !active
  const panelTypography = React.useMemo(
    () => coercePanelTypography(props.panelTypography as Partial<PanelTypography> | null | undefined),
    [props.panelTypography],
  )
  const geospatialViewMode = useGympgrphStore(s => s.geospatialViewMode)
  const geospatialAutoFitEnabled = useGympgrphStore(s => s.geospatialAutoFitEnabled)
  const geospatialDatasetTimeoutMs = useGympgrphStore(s => s.geospatialDatasetTimeoutMs)
  const geospatialDatasetMaxBytes = useGympgrphStore(s => s.geospatialDatasetMaxBytes)
  const setGeospatialViewMode = useGympgrphStore(s => s.setGeospatialViewMode)
  const setGeospatialAutoFitEnabled = useGympgrphStore(s => s.setGeospatialAutoFitEnabled)
  const setGeospatialDatasetTimeoutMs = useGympgrphStore(s => s.setGeospatialDatasetTimeoutMs)
  const setGeospatialDatasetMaxBytes = useGympgrphStore(s => s.setGeospatialDatasetMaxBytes)
  const builtInStyleUrl = getBuiltInDefaultStyleUrl(geospatialViewMode)

  const [styleUrlDraft, setStyleUrlDraft] = React.useState<string>(
    () => readLsString(LS_KEYS.geospatialStyleUrl, builtInStyleUrl),
  )
  const [committedStyleUrl, setCommittedStyleUrl] = React.useState<string>(
    () => readLsString(LS_KEYS.geospatialStyleUrl, builtInStyleUrl),
  )
  const [pointStyleDraft, setPointStyleDraft] = React.useState<GeospatialPointStyleConfig>(() => readGeospatialPointStyleConfig())
  const modeCommitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const styleCommitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointStyleCommitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const committedStyleUrlRef = React.useRef(committedStyleUrl)
  React.useEffect(() => {
    committedStyleUrlRef.current = committedStyleUrl
  }, [committedStyleUrl])

  React.useEffect(() => {
    return () => {
      if (modeCommitTimerRef.current) clearTimeout(modeCommitTimerRef.current)
      if (styleCommitTimerRef.current) clearTimeout(styleCommitTimerRef.current)
      if (pointStyleCommitTimerRef.current) clearTimeout(pointStyleCommitTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onChanged = () => {
      const next = readLsString(LS_KEYS.geospatialStyleUrl, builtInStyleUrl)
      setCommittedStyleUrl(next)
      setStyleUrlDraft(prev => (
        prev === MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL ||
        prev === MAPLIBRE_GLOBE_DEFAULT_STYLE_URL ||
        prev === MAPLIBRE_MODERN_DEFAULT_STYLE_URL ||
        prev === committedStyleUrlRef.current
          ? next
          : prev
      ))
    }
    window.addEventListener(GEOSPATIAL_STYLE_URL_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener(GEOSPATIAL_STYLE_URL_CHANGED_EVENT, onChanged)
    }
  }, [builtInStyleUrl])

  const selectGeospatialViewMode = React.useCallback(
    (nextMode: GeospatialViewMode) => {
      const next = normalizeGeospatialViewMode(nextMode)
      if (modeCommitTimerRef.current) clearTimeout(modeCommitTimerRef.current)
      modeCommitTimerRef.current = setTimeout(() => {
        if (typeof window !== 'undefined' && next !== '2d-svg') {
          const nextBuiltInStyle = resolveStandardViewModeStyleUrl(
            next,
            readLsString(LS_KEYS.geospatialStyleUrl, builtInStyleUrl),
          )
          const currentStyle = readLsString(LS_KEYS.geospatialStyleUrl, builtInStyleUrl)
          if (currentStyle !== nextBuiltInStyle) {
            writeLsString(LS_KEYS.geospatialStyleUrl, nextBuiltInStyle)
            setCommittedStyleUrl(nextBuiltInStyle)
            setStyleUrlDraft(prev => (
              prev === MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL ||
              prev === MAPLIBRE_GLOBE_DEFAULT_STYLE_URL ||
              prev === MAPLIBRE_MODERN_DEFAULT_STYLE_URL ||
              prev === committedStyleUrlRef.current
                ? nextBuiltInStyle
                : prev
            ))
            window.dispatchEvent(new Event(GEOSPATIAL_STYLE_URL_CHANGED_EVENT))
          }
        }
        setGeospatialViewMode(next)
      }, GEOSPATIAL_COMMIT_DEBOUNCE_MS)
    },
    [builtInStyleUrl, setGeospatialViewMode],
  )

  const applyStyleUrl = React.useCallback(() => {
    const next =
      String(styleUrlDraft || '').trim() === ''
        ? getBuiltInDefaultStyleUrl(geospatialViewMode)
        : normalizePersistedGeospatialStyleUrl(styleUrlDraft)
    if (styleCommitTimerRef.current) clearTimeout(styleCommitTimerRef.current)
    styleCommitTimerRef.current = setTimeout(() => {
      const resolvedNext = next || builtInStyleUrl
      writeLsString(LS_KEYS.geospatialStyleUrl, resolvedNext)
      persistPreferredGrabMapsStyleUrl(resolvedNext)
      setCommittedStyleUrl(resolvedNext)
      setStyleUrlDraft(resolvedNext)
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new Event(GEOSPATIAL_STYLE_URL_CHANGED_EVENT))
        } catch {
          void 0
        }
      }
    }, GEOSPATIAL_COMMIT_DEBOUNCE_MS)
  }, [builtInStyleUrl, geospatialViewMode, styleUrlDraft])

  const resetStyleUrl = React.useCallback(() => {
    const next = getBuiltInDefaultStyleUrl(geospatialViewMode)
    setStyleUrlDraft(next)
    if (styleCommitTimerRef.current) clearTimeout(styleCommitTimerRef.current)
    styleCommitTimerRef.current = setTimeout(() => {
      writeLsString(LS_KEYS.geospatialStyleUrl, next)
      setCommittedStyleUrl(next)
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new Event(GEOSPATIAL_STYLE_URL_CHANGED_EVENT))
        } catch {
          void 0
        }
      }
    }, GEOSPATIAL_COMMIT_DEBOUNCE_MS)
  }, [geospatialViewMode])

  const applyGrabMapsPreset = React.useCallback(() => {
    if (!active) return
    if (modeCommitTimerRef.current) clearTimeout(modeCommitTimerRef.current)
    setGeospatialViewMode('2d-modern')
    if (styleCommitTimerRef.current) clearTimeout(styleCommitTimerRef.current)
    const next = readPreferredGrabMapsStyleUrl()
    setStyleUrlDraft(next)
    styleCommitTimerRef.current = setTimeout(() => {
      writeLsString(LS_KEYS.geospatialStyleUrl, next)
      persistPreferredGrabMapsStyleUrl(next)
      setCommittedStyleUrl(next)
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new Event(GEOSPATIAL_STYLE_URL_CHANGED_EVENT))
        } catch {
          void 0
        }
      }
    }, GEOSPATIAL_COMMIT_DEBOUNCE_MS)
  }, [active, setGeospatialViewMode])

  const applyPointStyle = React.useCallback(() => {
    if (pointStyleCommitTimerRef.current) clearTimeout(pointStyleCommitTimerRef.current)
    pointStyleCommitTimerRef.current = setTimeout(() => {
      writeGeospatialPointStyleConfig(normalizeGeospatialPointStyleConfig(pointStyleDraft))
    }, GEOSPATIAL_COMMIT_DEBOUNCE_MS)
  }, [pointStyleDraft])

  const resetPointStyle = React.useCallback(() => {
    setPointStyleDraft(MAIN_PANEL_DEFAULT_GEOSPATIAL_POINT_STYLE_CONFIG)
    writeGeospatialPointStyleConfig(MAIN_PANEL_DEFAULT_GEOSPATIAL_POINT_STYLE_CONFIG)
  }, [])

  const timeoutDraft = React.useMemo(() => String(Math.floor(geospatialDatasetTimeoutMs)), [geospatialDatasetTimeoutMs])
  const maxBytesMbDraft = React.useMemo(() => String(Math.round(geospatialDatasetMaxBytes / (1024 * 1024))), [geospatialDatasetMaxBytes])

  const [timeoutMsInput, setTimeoutMsInput] = React.useState(timeoutDraft)
  const [maxBytesMbInput, setMaxBytesMbInput] = React.useState(maxBytesMbDraft)
  const [currentLocationState, setCurrentLocationState] = React.useState<'idle' | 'locating' | 'error' | 'done'>('idle')
  const [currentLocationMessage, setCurrentLocationMessage] = React.useState<string>('')

  React.useEffect(() => {
    setTimeoutMsInput(timeoutDraft)
  }, [timeoutDraft])

  React.useEffect(() => {
    setMaxBytesMbInput(maxBytesMbDraft)
  }, [maxBytesMbDraft])

  const commitTimeoutMs = React.useCallback(() => {
    const n = Number(String(timeoutMsInput).trim())
    if (!Number.isFinite(n)) return
    setGeospatialDatasetTimeoutMs(n)
  }, [setGeospatialDatasetTimeoutMs, timeoutMsInput])

  const commitMaxBytes = React.useCallback(() => {
    const mb = Number(String(maxBytesMbInput).trim())
    if (!Number.isFinite(mb)) return
    setGeospatialDatasetMaxBytes(mb * 1024 * 1024)
  }, [maxBytesMbInput, setGeospatialDatasetMaxBytes])

  const useCurrentLocation = React.useCallback(() => {
    if (!active || disabled) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCurrentLocationState('error')
      setCurrentLocationMessage('Current location is unavailable in this browser.')
      return
    }
    setCurrentLocationState('locating')
    setCurrentLocationMessage('Resolving current location...')
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = Number(position.coords?.latitude)
        const lng = Number(position.coords?.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setCurrentLocationState('error')
          setCurrentLocationMessage('Current location returned invalid coordinates.')
          return
        }
        requestGeospatialCurrentLocation({ lat, lng, zoom: 14 })
        setCurrentLocationState('done')
        setCurrentLocationMessage(`Centered on current location (${lat.toFixed(5)}, ${lng.toFixed(5)}).`)
      },
      error => {
        const message = typeof error?.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'Unable to read current location.'
        setCurrentLocationState('error')
        setCurrentLocationMessage(message)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [active, disabled])

  const styleStatusLabel =
    committedStyleUrl === MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL ||
    committedStyleUrl === MAPLIBRE_MODERN_DEFAULT_STYLE_URL ||
    committedStyleUrl === MAPLIBRE_GLOBE_DEFAULT_STYLE_URL
      ? 'default'
      : 'custom'

  return (
    <GeoPanelTypeIconProvider renderTypeIcon={props.renderTypeIcon}>
      <article className={`${GEOSPATIAL_PANEL_ROOT_CLASS_NAME} flex min-h-full flex-col space-y-0`}>
        <header className={`sticky top-0 z-20 border-b ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}>
          <GeoPanelKtvRow
            keyNode="Key"
            typeNode="Type"
            valueNode="Value"
            panelTypography={panelTypography}
            header
          />
        </header>

        <section className="space-y-2 px-1 py-2">
          <GeospatialPanelDisplayControls
            committedStyleUrl={committedStyleUrl}
            currentLocationMessage={currentLocationMessage}
            currentLocationState={currentLocationState}
            disabled={disabled}
            geospatialAutoFitEnabled={geospatialAutoFitEnabled}
            geospatialViewMode={geospatialViewMode}
            panelTypography={panelTypography}
            pointStyleDraft={pointStyleDraft}
            setPointStyleDraft={setPointStyleDraft}
            styleStatusLabel={styleStatusLabel}
            styleUrlDraft={styleUrlDraft}
            onApplyGrabMapsPreset={applyGrabMapsPreset}
            onApplyPointStyle={applyPointStyle}
            onApplyStyleUrl={applyStyleUrl}
            onFitToData={requestGeospatialFitToData}
            onFitToSelection={requestGeospatialFitToSelection}
            onResetPointStyle={resetPointStyle}
            onResetStyleUrl={resetStyleUrl}
            onSelectViewMode={selectGeospatialViewMode}
            onSetStyleUrlDraft={setStyleUrlDraft}
            onToggleAutoFit={() => setGeospatialAutoFitEnabled(!geospatialAutoFitEnabled)}
            onUseCurrentLocation={useCurrentLocation}
          />
          <GeospatialPanelDatasetControls
            disabled={disabled}
            enhancedLayerCatalog={props.enhancedLayerCatalog}
            maxBytesMbInput={maxBytesMbInput}
            panelTypography={panelTypography}
            timeoutMsInput={timeoutMsInput}
            onCommitMaxBytes={commitMaxBytes}
            onCommitTimeoutMs={commitTimeoutMs}
            onSetMaxBytesMbInput={setMaxBytesMbInput}
            onSetTimeoutMsInput={setTimeoutMsInput}
          />
        </section>
      </article>
    </GeoPanelTypeIconProvider>
  )
}
