import React from 'react'
import type { FeatureCollection } from 'geojson'
import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'
import { computeBoundsFromCollections } from './geo.js'
import { coerceGeoJsonToFeatureCollection } from './geojson.js'
import { LS_KEYS } from './lib/config.js'
import {
  onEnhancedLayerPersistenceChanged,
  readEnhancedLayerConfig,
} from './enhancedLayerPersistence.js'
import { loadBoundedResource, type LoadFailure, type LoadProgress } from './enhancedLayerLoad.js'
import { normalizeExtrusionFeatures } from './extrusionHeight.js'
import {
  ensureExtrusionLayer,
  isMapLibreStyleReady,
  setGeoJsonSourceData,
} from './maplibreLayers.js'
import {
  applyEnhancedLayerVisibility,
  reconcileRemovedEnhancedLayerResources,
  type RenderedExtrusionResource,
} from './enhancedLayerMapReconciliation.js'
import {
  createAsset3DCustomLayer,
  parseAssetMesh,
  type Asset3DLayerHandle,
  type AssetMesh,
} from './asset3dCustomLayer.js'

type Toast = {
  id: string
  kind: 'neutral' | 'success' | 'warning' | 'error'
  message: string
  ttlMs?: number
}

const boundedMessage = (message: string): string => message.slice(0, 140)

const progressMessage = (target: string, progress: LoadProgress): string => {
  return progress.kind === 'determinate'
    ? boundedMessage(`Loading ${target}: ${progress.percent}%`)
    : boundedMessage(`Loading ${target}: ${progress.receivedBytes.toLocaleString()} bytes`)
}

export const formatEnhancedLayerFailure = (failure: LoadFailure): string => {
  if (failure.code === 'missing-fetch-bound') return `Missing ${failure.key}; layer was not requested.`
  if (failure.code === 'max-bytes-exceeded') return `${failure.target} exceeded ${failure.maxBytes} bytes; prior layers retained.`
  if (failure.code === 'timeout') return `${failure.target} timed out after ${failure.timeoutMs} ms; prior layers retained.`
  if (failure.code === 'parse-failed') return `${failure.target} is not valid geospatial data; prior layers retained.`
  return `${failure.target}: network-unavailable; prior layers retained.`
}

const combineBounds = (boundsById: ReadonlyMap<string, GeospatialBounds>): GeospatialBounds | null => {
  const values = [...boundsById.values()]
  if (values.length === 0) return null
  return values.reduce<GeospatialBounds>((combined, bounds) => [
    Math.min(combined[0], bounds[0]),
    Math.min(combined[1], bounds[1]),
    Math.max(combined[2], bounds[2]),
    Math.max(combined[3], bounds[3]),
  ], values[0])
}

export function useEnhancedGeospatialLayers(args: {
  enabled: boolean
  map: any | null
  styleRevision: number
  notify: (toast: Toast) => void
}): GeospatialBounds | null {
  const [configRevision, setConfigRevision] = React.useState(0)
  const [visibilityChange, setVisibilityChange] = React.useState<{
    revision: number
    ids: readonly string[]
  }>({ revision: 0, ids: [] })
  const [mapReadinessRevision, setMapReadinessRevision] = React.useState(0)
  const [loadedBounds, setLoadedBounds] = React.useState<GeospatialBounds | null>(null)
  const assetHandleRef = React.useRef<Asset3DLayerHandle | null>(null)
  const loadedAssetIdsRef = React.useRef(new Set<string>())
  const renderedExtrusionsRef = React.useRef(new Map<string, RenderedExtrusionResource>())
  const boundsByIdRef = React.useRef(new Map<string, GeospatialBounds>())
  const enableCycleRef = React.useRef(0)
  const assetReplacementRef = React.useRef(0)
  const wasEnabledRef = React.useRef(false)

  React.useEffect(() => {
    const map = args.map
    if (!map || typeof map.on !== 'function' || typeof map.off !== 'function') return
    let published = false
    const publishReady = () => {
      if (published || !isMapLibreStyleReady(map)) return
      published = true
      setMapReadinessRevision(value => value + 1)
    }
    map.on('style.load', publishReady)
    map.on('load', publishReady)
    map.on('idle', publishReady)
    publishReady()
    return () => {
      map.off('style.load', publishReady)
      map.off('load', publishReady)
      map.off('idle', publishReady)
    }
  }, [args.map])

  React.useEffect(() => {
    if (args.enabled && !wasEnabledRef.current) enableCycleRef.current += 1
    wasEnabledRef.current = args.enabled
  }, [args.enabled])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const unsubscribe = onEnhancedLayerPersistenceChanged(change => {
      if (change.kind === 'catalog') {
        setConfigRevision(value => value + 1)
        return
      }
      setVisibilityChange(current => ({
        revision: current.revision + 1,
        ids: change.ids,
      }))
    })
    const onStorage = (event: StorageEvent) => {
      if (event.key === LS_KEYS.geospatialEnhancedLayers) {
        setConfigRevision(value => value + 1)
      } else if (event.key === LS_KEYS.geospatialEnhancedLayerVisibility) {
        setVisibilityChange(current => ({
          revision: current.revision + 1,
          ids: [],
        }))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  React.useEffect(() => {
    if (!args.enabled || typeof window === 'undefined') return
    try {
      const opacity = Number(window.localStorage.getItem(LS_KEYS.geospatialOverlayOpacity))
      if (opacity === 0) window.localStorage.setItem(LS_KEYS.geospatialOverlayOpacity, '1')
    } catch {
      void 0
    }
  }, [args.enabled])

  React.useEffect(() => {
    if (args.enabled) return
    const container = (() => {
      try {
        return args.map?.getContainer?.() as HTMLElement | null
      } catch {
        return null
      }
    })()
    reconcileRemovedEnhancedLayerResources({
      map: args.map,
      container,
      renderedExtrusions: renderedExtrusionsRef.current,
      configuredExtrusionIds: new Set(),
      assetHandle: assetHandleRef.current,
      loadedAssetIds: loadedAssetIdsRef.current,
      configuredAssetIds: new Set(),
    })
    assetHandleRef.current?.dispose()
    assetHandleRef.current = null
    try {
      if (container) delete container.dataset.kgEnhancedLayerIds
    } catch {
      void 0
    }
    boundsByIdRef.current.clear()
    setLoadedBounds(null)
  }, [args.enabled, args.map])

  React.useEffect(() => {
    if (!args.enabled || !args.map || !isMapLibreStyleReady(args.map)) return
    applyEnhancedLayerVisibility({
      map: args.map,
      assetHandle: assetHandleRef.current,
      config: readEnhancedLayerConfig(),
      ids: visibilityChange.ids.length > 0 ? visibilityChange.ids : undefined,
    })
  }, [
    args.enabled,
    args.map,
    args.styleRevision,
    mapReadinessRevision,
    visibilityChange,
  ])

  React.useEffect(() => {
    const map = args.map
    if (!args.enabled || !map || !isMapLibreStyleReady(map)) return
    const config = readEnhancedLayerConfig()
    let cancelled = false
    const configuredExtrusionIds = new Set(config.extrusions.map(entry => entry.id))
    const configuredAssetIds = new Set(config.assets.map(entry => entry.id))
    const configuredIds = new Set([...configuredExtrusionIds, ...configuredAssetIds])
    const container = (() => {
      try {
        return map.getContainer?.() as HTMLElement | null
      } catch {
        return null
      }
    })()
    reconcileRemovedEnhancedLayerResources({
      map,
      container,
      renderedExtrusions: renderedExtrusionsRef.current,
      configuredExtrusionIds,
      assetHandle: assetHandleRef.current,
      loadedAssetIds: loadedAssetIdsRef.current,
      configuredAssetIds,
    })
    for (const id of boundsByIdRef.current.keys()) {
      if (!configuredIds.has(id)) boundsByIdRef.current.delete(id)
    }
    if (config.extrusions.length === 0 && config.assets.length === 0) {
      assetHandleRef.current?.dispose()
      assetHandleRef.current = null
      loadedAssetIdsRef.current.clear()
      try {
        if (container) delete container.dataset.kgEnhancedLayerIds
      } catch {
        void 0
      }
      boundsByIdRef.current.clear()
      setLoadedBounds(null)
      return
    }
    if (config.diagnostics.length > 0) {
      args.notify({
        id: 'kg:geo:enhanced-config',
        kind: 'warning',
        ttlMs: 4_000,
        message: boundedMessage(`${config.diagnostics.length} enhanced layer configuration issue(s); invalid entries skipped.`),
      })
    }

    const notifyProgress = (target: string) => (progress: LoadProgress) => {
      args.notify({
        id: `kg:geo:loading:${target}`,
        kind: 'neutral',
        ttlMs: 1_200,
        message: progressMessage(target, progress),
      })
    }
    const notifyFailure = (target: string, failure: LoadFailure) => {
      args.notify({
        id: `kg:geo:failed:${target}`,
        kind: 'error',
        ttlMs: 5_000,
        message: boundedMessage(formatEnhancedLayerFailure(failure)),
      })
    }

    const loadExtrusions = async () => {
      await Promise.all(config.extrusions.map(async layer => {
        const loaded = await loadBoundedResource({
          target: layer.id,
          url: layer.url,
          bound: layer.fetchBound,
          onProgress: notifyProgress(layer.id),
        })
        if (cancelled) return
        if (!loaded.ok) {
          notifyFailure(layer.id, loaded.failure)
          return
        }
        let collection: FeatureCollection | null = null
        try {
          collection = coerceGeoJsonToFeatureCollection(JSON.parse(new TextDecoder().decode(loaded.bytes)))
        } catch {
          void 0
        }
        if (!collection) {
          notifyFailure(layer.id, { code: 'parse-failed', target: layer.id })
          return
        }
        const normalized = normalizeExtrusionFeatures(collection, layer)
        const sourceId = `kg-enhanced:${layer.id}`
        if (!ensureExtrusionLayer(map, sourceId, layer)) {
          notifyFailure(layer.id, { code: 'parse-failed', target: `${layer.id} render layer` })
          return
        }
        renderedExtrusionsRef.current.set(layer.id, { sourceId })
        setGeoJsonSourceData(map, sourceId, normalized.featureCollection)
        try {
          if (container) {
            const readyIds = new Set(String(container.dataset.kgEnhancedLayerIds || '').split(',').filter(Boolean))
            readyIds.add(layer.id)
            container.dataset.kgEnhancedLayerIds = [...readyIds].join(',')
          }
        } catch {
          void 0
        }
        applyEnhancedLayerVisibility({
          map,
          assetHandle: assetHandleRef.current,
          config: readEnhancedLayerConfig(),
          ids: [layer.id],
        })
        const bounds = computeBoundsFromCollections([normalized.featureCollection])
        if (bounds) boundsByIdRef.current.set(layer.id, bounds as GeospatialBounds)
        args.notify({
          id: `kg:geo:ready:${layer.id}`,
          kind: 'success',
          ttlMs: 2_000,
          message: boundedMessage(`${layer.id} ready: ${collection.features.length} features, ${normalized.diagnostics.length} height fallback(s).`),
        })
      }))
    }

    const loadAssets = async () => {
      if (config.assets.length === 0) {
        assetHandleRef.current?.dispose()
        assetHandleRef.current = null
        loadedAssetIdsRef.current.clear()
        return
      }
      const meshes = new Map<string, AssetMesh>()
      await Promise.all(config.assets.map(async asset => {
        const loaded = await loadBoundedResource({
          target: asset.id,
          url: asset.url,
          bound: asset.fetchBound,
          onProgress: notifyProgress(asset.id),
        })
        if (cancelled) return
        if (!loaded.ok) {
          notifyFailure(asset.id, loaded.failure)
          return
        }
        const mesh = parseAssetMesh(loaded.bytes)
        if (!mesh) {
          notifyFailure(asset.id, { code: 'parse-failed', target: asset.id })
          return
        }
        meshes.set(asset.id, mesh)
        boundsByIdRef.current.set(asset.id, [asset.lng, asset.lat, asset.lng, asset.lat])
      }))
      if (cancelled || meshes.size === 0) return
      assetReplacementRef.current += 1
      const created = createAsset3DCustomLayer({
        contextId: `${enableCycleRef.current}:${args.styleRevision}:${assetReplacementRef.current}`,
        assets: config.assets,
        meshes,
      })
      if (!created) return
      try {
        map.addLayer(created.layer)
        const container = map.getContainer?.() as HTMLElement | undefined
        if (container) container.dataset.kgEnhancedAssetContext = created.handle.contextId
      } catch {
        created.handle.dispose()
        notifyFailure('3D assets', { code: 'network-unavailable', target: '3D asset layer' })
        return
      }
      applyEnhancedLayerVisibility({
        map,
        assetHandle: created.handle,
        config: readEnhancedLayerConfig(),
      })
      const previous = assetHandleRef.current
      assetHandleRef.current = created.handle
      loadedAssetIdsRef.current = new Set(meshes.keys())
      previous?.dispose()
    }

    void Promise.all([loadExtrusions(), loadAssets()]).then(() => {
      if (!cancelled) setLoadedBounds(combineBounds(boundsByIdRef.current))
    })
    return () => {
      cancelled = true
    }
  }, [args.enabled, args.map, args.notify, args.styleRevision, configRevision, mapReadinessRevision])

  React.useEffect(() => () => {
    assetHandleRef.current?.dispose()
    assetHandleRef.current = null
    loadedAssetIdsRef.current.clear()
  }, [])

  return loadedBounds
}
