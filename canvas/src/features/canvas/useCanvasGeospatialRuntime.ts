import React from 'react'
import { LS_KEYS } from '@/lib/config'
import { resolveBrowserStorageKey } from '@/lib/persistence'
import { onGeospatialModeChanged } from '@/features/geospatial/events'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import {
  buildConsumedGeoCommandUrl,
  claimGeoCommandDeepLink,
  type GeoCommandDeepLinkClaimState,
} from '@/features/geospatial/geoCommandDeepLink'
import { applyGeoCommandFromGraph } from '@/features/geospatial/geoInvocationRuntime'
import { setGeospatialModeEnabled as setGeospatialModeEnabledThroughBridge } from '@/features/geospatial/gympgrphBridge'

const reportGeospatialDeepLinkError = (error: unknown): void => {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Geospatial deep link failed.')
  const message = (rawMessage.trim() || 'Geospatial deep link failed.').slice(0, 140)
  try {
    useGraphStore.getState().upsertUiToast({
      id: 'geospatial-deep-link-error',
      kind: 'error',
      message,
      ttlMs: 6_000,
    })
  } catch {
    void 0
  }
  console.error(`[kg-geo] ${message}`)
}

export function shouldEnsureCanvasGeospatialMode(
  floatingPanelOpen: boolean,
  floatingPanelView: string,
): boolean {
  return floatingPanelOpen && floatingPanelView === 'geo'
}

export function resolveCanvasGeospatialModeEnabled(
  persistedEnabled: boolean,
  floatingPanelOpen: boolean,
  floatingPanelView: string,
): boolean {
  return persistedEnabled
    || shouldEnsureCanvasGeospatialMode(floatingPanelOpen, floatingPanelView)
}

export function useCanvasGeospatialRuntime(): boolean {
  const floatingPanelOpen = useGraphStore(state => state.floatingPanelOpen === true)
  const floatingPanelView = useGraphStore(state => state.floatingPanelView)
  const geospatialHostViewportSnapshotRef = React.useRef<null | {
    zoomState: null | { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }
    zoomStateByKey: Record<string, { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }>
    viewPinned: boolean
    fitToScreenMode: boolean
    zoomToSelectionMode: boolean
  }>(null)

  const [geospatialModeEnabled, setGeospatialModeEnabled] = React.useState<boolean>(() => readGeospatialOverlayEnabledPreference())
  const lastHandledGeospatialModeEnabledRef = React.useRef(geospatialModeEnabled)
  const geospatialDeepLinkClaimRef = React.useRef<GeoCommandDeepLinkClaimState>({ handled: false })

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
    const claim = claimGeoCommandDeepLink(
      window.location.search,
      geospatialDeepLinkClaimRef.current,
    )
    if (!claim) return
    if (claim.kind !== 'enable') {
      try {
        window.history.replaceState(
          window.history.state,
          '',
          buildConsumedGeoCommandUrl(window.location.href),
        )
      } catch {
        void 0
      }
    }
    if (claim.kind === 'invalid') {
      reportGeospatialDeepLinkError(claim.message)
      return
    }
    void (async () => {
      if (claim.kind === 'enable') {
        await setGeospatialModeEnabledThroughBridge(true)
        return
      }
      const result = await applyGeoCommandFromGraph({
        command: claim.envelope.command,
        graphData: useGraphStore.getState().graphData,
      })
      if (result.ok === false) throw new Error(result.rejection.message)
    })().catch(reportGeospatialDeepLinkError)
  }, [])

  React.useEffect(() => {
    if (!shouldEnsureCanvasGeospatialMode(floatingPanelOpen, floatingPanelView)) return
    let cancelled = false
    void setGeospatialModeEnabledThroughBridge(true)
      .then(enabled => {
        if (cancelled) return
        lastHandledGeospatialModeEnabledRef.current = enabled
        setGeospatialModeEnabled(previous => (
          previous === enabled ? previous : enabled
        ))
      })
      .catch(reportGeospatialDeepLinkError)
    return () => {
      cancelled = true
    }
  }, [floatingPanelOpen, floatingPanelView])

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

  return resolveCanvasGeospatialModeEnabled(
    geospatialModeEnabled,
    floatingPanelOpen,
    floatingPanelView,
  )
}
