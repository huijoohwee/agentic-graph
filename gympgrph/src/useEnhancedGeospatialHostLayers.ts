import React from 'react'
import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import { useEnhancedGeospatialLayers } from './useEnhancedGeospatialLayers.js'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const resolveHandlers = (snapshot: unknown, handlers: unknown): Record<string, unknown> | null => {
  if (isRecord(handlers)) return handlers
  if (!isRecord(snapshot)) return null
  return isRecord(snapshot.handlers) ? snapshot.handlers : null
}

export function useEnhancedGeospatialHostLayers(args: {
  enabled: boolean
  map: any | null
  styleRevision: number
  snapshot: unknown
  handlers: unknown
  autoFitEnabled: boolean
  show3d: boolean
  fitPadding: number
  selectedBounds: GeospatialBounds | null
  graphBounds: GeospatialBounds | null
}): GeospatialBounds | null {
  const notify = React.useCallback((toast: {
    id: string
    kind: 'neutral' | 'success' | 'warning' | 'error'
    message: string
    ttlMs?: number
  }) => {
    const handlers = resolveHandlers(args.snapshot, args.handlers)
    const upsert = handlers?.upsertUiToast
    if (typeof upsert !== 'function') return
    upsert({ ...toast, dismissible: true, log: toast.kind === 'error' })
  }, [args.handlers, args.snapshot])
  const enhancedBounds = useEnhancedGeospatialLayers({
    enabled: args.enabled,
    map: args.map,
    styleRevision: args.styleRevision,
    notify,
  })
  React.useEffect(() => {
    if (!args.map || !args.enabled || !args.show3d || !args.autoFitEnabled) return
    const targetBounds = args.selectedBounds || args.graphBounds || enhancedBounds
    if (!targetBounds) return
    try {
      args.map.fitBounds(targetBounds, { padding: args.fitPadding, duration: 0 })
    } catch {
      void 0
    }
  }, [
    args.autoFitEnabled,
    args.enabled,
    args.fitPadding,
    args.graphBounds,
    args.map,
    args.selectedBounds,
    args.show3d,
    enhancedBounds,
  ])
  return enhancedBounds
}
