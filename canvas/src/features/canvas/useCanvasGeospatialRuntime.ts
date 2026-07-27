import React from 'react'
import { LS_KEYS } from '@/lib/config'
import { resolveBrowserStorageKey } from '@/lib/persistence'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference, writeGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import {
  applyGeoCommand,
  parseGeoCommandEnvelope,
} from '@/features/geospatial/geoInvocationDispatcher'
import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'

export function useCanvasGeospatialRuntime(): boolean {
  const geospatialHostViewportSnapshotRef = React.useRef<null | {
    zoomState: null | { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }
    zoomStateByKey: Record<string, { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }>
    viewPinned: boolean
    fitToScreenMode: boolean
    zoomToSelectionMode: boolean
  }>(null)

  const [geospatialModeEnabled, setGeospatialModeEnabled] = React.useState<boolean>(() => readGeospatialOverlayEnabledPreference())
  const lastHandledGeospatialModeEnabledRef = React.useRef(geospatialModeEnabled)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const storageKey = resolveBrowserStorageKey(LS_KEYS.geospatialOverlayEnabled)
    const handler = (ev: StorageEvent) => {
      if (!ev || ev.key !== storageKey) return
      try {
        const nextEnabled = readGeospatialOverlayEnabledPreference()
        lastHandledGeospatialModeEnabledRef.current = nextEnabled
        setGeospatialModeEnabled(prev => (prev === nextEnabled ? prev : nextEnabled))
      } catch {
        lastHandledGeospatialModeEnabledRef.current = false
        setGeospatialModeEnabled(prev => (prev === false ? prev : false))
      }
    }
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('storage', handler)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(String(window.location.search || ''))
      if (params.get('kgGeo') !== '1') return
      void import('gympgrph')
        .then(async m => {
          const gm = m as unknown as { setGeospatialModeEnabled?: (enabled: boolean) => void }
          if (typeof gm.setGeospatialModeEnabled === 'function') {
            gm.setGeospatialModeEnabled(true)
          } else {
            writeGeospatialOverlayEnabledPreference(true)
            lastHandledGeospatialModeEnabledRef.current = true
            setGeospatialModeEnabled(prev => (prev === true ? prev : true))
          }
          const commandRaw = params.get('kgGeoCommand')
          if (!commandRaw) return
          let parsedRaw: unknown = null
          try {
            parsedRaw = JSON.parse(commandRaw)
          } catch {
            return
          }
          const envelope = parseGeoCommandEnvelope(parsedRaw)
          const readConfig = (m as unknown as { readEnhancedLayerConfig?: () => NormalizedEnhancedConfig }).readEnhancedLayerConfig
          if (!envelope || typeof readConfig !== 'function') return
          await applyGeoCommand(envelope.command, {
            config: readConfig(),
            resolveNodeBounds: () => null,
          })
        })
        .catch(error => {
          writeGeospatialOverlayEnabledPreference(false)
          lastHandledGeospatialModeEnabledRef.current = false
          setGeospatialModeEnabled(prev => (prev === false ? prev : false))
          console.error('[kg-geo] Geospatial runtime unavailable; Canvas remains active.', error)
        })
    } catch {
      void 0
    }
  }, [])

  React.useEffect(() => {
    return onGeospatialModeChanged(detail => {
      const enabled = typeof detail.enabled === 'boolean' ? detail.enabled : null
      if (enabled == null) return
      if (lastHandledGeospatialModeEnabledRef.current === enabled) {
        setGeospatialModeEnabled(prev => (prev === enabled ? prev : enabled))
        return
      }
      lastHandledGeospatialModeEnabledRef.current = enabled
      if (enabled) {
        try {
          const s = useGraphStore.getState()
          geospatialHostViewportSnapshotRef.current = {
            zoomState: s.zoomState,
            zoomStateByKey: s.zoomStateByKey,
            viewPinned: s.viewPinned,
            fitToScreenMode: s.fitToScreenMode,
            zoomToSelectionMode: s.zoomToSelectionMode,
          }
        } catch {
          geospatialHostViewportSnapshotRef.current = null
        }
      } else {
        const snap = geospatialHostViewportSnapshotRef.current
        geospatialHostViewportSnapshotRef.current = null
        if (snap) {
          try {
            const s = useGraphStore.getState()
            s.setViewPinned(snap.viewPinned)
            s.setFitToScreenMode(snap.fitToScreenMode)
            s.setZoomToSelectionMode(snap.zoomToSelectionMode)
            if (snap.zoomState) s.setZoomState(snap.zoomState)
            else useGraphStore.setState(() => ({ zoomState: null }))
            useGraphStore.setState(() => ({ zoomStateByKey: snap.zoomStateByKey || {}, zoomRequest: null, threeCameraRequest: null }))
          } catch {
            void 0
          }
        }
      }
      setGeospatialModeEnabled(prev => (prev === enabled ? prev : enabled))
    })
  }, [])

  return geospatialModeEnabled
}
