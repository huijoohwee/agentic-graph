import React from 'react'
import {
  applyGameModeGeoOverlayMapFrame,
  applyGameModeGeoOverlayToMap,
  clearGameModeGeoOverlayFromMap,
  GAME_MODE_GEO_OVERLAY_LAYER_IDS,
  type GameModeGeoOverlayOrigin,
  type GameModeGeoOverlaySnapshot,
} from '../../gameModeGeoOverlayMapLibre.js'

type MapOriginOwner = Readonly<{
  map: any
  runId: number
  origin: GameModeGeoOverlayOrigin
}>

type MapFrameOwner = Readonly<{ map: any; key: string }>

function readMapOrigin(map: any, snapshot: GameModeGeoOverlaySnapshot): GameModeGeoOverlayOrigin | null {
  try {
    const coordinate = snapshot.mapFrame?.origin
    if (
      Array.isArray(coordinate)
      && coordinate.length === 2
      && coordinate.every(Number.isFinite)
    ) return Object.freeze({ lng: coordinate[0], lat: coordinate[1] })
    const center = map?.getCenter?.()
    const lng = Number(center?.lng)
    const lat = Number(center?.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    return Object.freeze({ lng, lat })
  } catch {
    return null
  }
}

function applyLatestGameModeMapPresentation(options: Readonly<{
  active: boolean
  map: any
  mapLibreRuntimeEnabled: boolean
  mode: '2d' | '3d'
  snapshot: GameModeGeoOverlaySnapshot | null
  originOwnerRef: React.MutableRefObject<MapOriginOwner | null>
  frameOwnerRef: React.MutableRefObject<MapFrameOwner | null>
}>): void {
  if (!options.active || !options.mapLibreRuntimeEnabled || !options.map) return
  const snapshot = options.snapshot
  if (!snapshot?.active) {
    clearGameModeGeoOverlayFromMap(options.map)
    return
  }
  const originOwner = options.originOwnerRef.current
  const origin = originOwner
    && originOwner.map === options.map
    && originOwner.runId === snapshot.runId
    ? originOwner.origin
    : readMapOrigin(options.map, snapshot)
  if (!origin) return
  options.originOwnerRef.current = { map: options.map, runId: snapshot.runId, origin }

  const frame = snapshot.mapFrame
  if (!frame) {
    options.frameOwnerRef.current = null
  } else {
    const container = options.map?.getContainer?.()
    const width = Number(container?.clientWidth) || Number(options.map?.transform?.width) || 0
    const height = Number(container?.clientHeight) || Number(options.map?.transform?.height) || 0
    const key = `${frame.id}:${options.mode}:${width}x${height}`
    const frameOwner = options.frameOwnerRef.current
    if (!frameOwner || frameOwner.map !== options.map || frameOwner.key !== key) {
      if (applyGameModeGeoOverlayMapFrame(options.map, frame, options.mode)) {
        options.frameOwnerRef.current = { map: options.map, key }
      }
    }
  }
  applyGameModeGeoOverlayToMap(options.map, snapshot, origin)
  const assetLabelLayer = GAME_MODE_GEO_OVERLAY_LAYER_IDS.assetLabels
  if (options.map.getLayer?.(assetLabelLayer)) {
    // In a composed 3D scene the shared Media meshes are the asset labels;
    // retain map anchors for selection without duplicating their names.
    const hasSharedMediaMeshes = (snapshot.assets?.length || 0) > 0
    const visibility = hasSharedMediaMeshes ? 'none' : 'visible'
    if (options.map.getLayoutProperty?.(assetLabelLayer, 'visibility') !== visibility) {
      options.map.setLayoutProperty?.(assetLabelLayer, 'visibility', visibility)
    }
  }
}

export function useGameModeGeoOverlayMapLibrePresentation(options: Readonly<{
  active: boolean
  map: any | null
  mapLibreRuntimeEnabled: boolean
  viewMode: '2d' | '3d'
  snapshot: GameModeGeoOverlaySnapshot | null
  onActorSelect?: (actorId: string) => boolean
}>): void {
  const originOwnerRef = React.useRef<MapOriginOwner | null>(null)
  const frameOwnerRef = React.useRef<MapFrameOwner | null>(null)
  const optionsRef = React.useRef(options)
  optionsRef.current = options
  const snapshotRef = React.useRef(options.snapshot)
  snapshotRef.current = options.snapshot

  React.useEffect(() => {
    const map = options.map
    if (!options.active || !options.mapLibreRuntimeEnabled || !map) {
      if (map) clearGameModeGeoOverlayFromMap(map)
      originOwnerRef.current = null
      return
    }

    let disposed = false
    const applyLatest = () => {
      if (disposed) return
      const latest = optionsRef.current
      applyLatestGameModeMapPresentation({
        active: latest.active,
        map,
        mapLibreRuntimeEnabled: latest.mapLibreRuntimeEnabled,
        mode: latest.viewMode,
        snapshot: snapshotRef.current,
        originOwnerRef,
        frameOwnerRef,
      })
    }
    applyLatest()
    map.on?.('style.load', applyLatest)
    map.on?.('resize', applyLatest)
    return () => {
      disposed = true
      map.off?.('style.load', applyLatest)
      map.off?.('resize', applyLatest)
      clearGameModeGeoOverlayFromMap(map)
      if (originOwnerRef.current?.map === map) originOwnerRef.current = null
      if (frameOwnerRef.current?.map === map) frameOwnerRef.current = null
    }
  }, [options.active, options.map, options.mapLibreRuntimeEnabled])

  React.useEffect(() => {
    const map = options.map
    const snapshot = options.snapshot
    if (!options.active || !options.mapLibreRuntimeEnabled || !map || !snapshot?.active) return
    applyLatestGameModeMapPresentation({
      active: options.active,
      map,
      mapLibreRuntimeEnabled: options.mapLibreRuntimeEnabled,
      mode: options.viewMode,
      snapshot,
      originOwnerRef,
      frameOwnerRef,
    })
  }, [
    options.active,
    options.map,
    options.mapLibreRuntimeEnabled,
    options.snapshot,
    options.viewMode,
  ])

  React.useEffect(() => {
    const map = options.map
    if (!options.active || !options.mapLibreRuntimeEnabled || !map || !options.onActorSelect) return
    const onAssetClick = (event: any) => {
      try {
        const point = event?.point
        const layers = [GAME_MODE_GEO_OVERLAY_LAYER_IDS.assets, GAME_MODE_GEO_OVERLAY_LAYER_IDS.assetLabels]
          .filter(layer => map.getLayer?.(layer))
        if (!point || layers.length === 0 || typeof map.queryRenderedFeatures !== 'function') return
        const queried = map.queryRenderedFeatures(point, { layers })
        const properties = queried.find((feature: any) => feature?.properties?.actorKind === 'asset')?.properties
        const actorId = String(properties?.actorId || '').trim()
        if (actorId) options.onActorSelect?.(actorId)
      } catch {
        // A stale or removed overlay is not a selectable target.
      }
    }
    map.on?.('click', onAssetClick)
    return () => {
      map.off?.('click', onAssetClick)
    }
  }, [options.active, options.map, options.mapLibreRuntimeEnabled, options.onActorSelect])
}
