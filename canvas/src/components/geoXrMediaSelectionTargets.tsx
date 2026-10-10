import React from 'react'
import {
  deriveGameModeCityMapFrame,
  deriveXrEnvironmentMapFrame,
  gameModeGeoOverlayFeatureCollection,
  type CityGeoOverlaySnapshot,
} from 'gympgrph'
import { readActiveMapLibreMap, regionalPoiProfileBounds, SINGAPORE_FLIGHT_GEO_REFERENCE } from '@/lib/gympgrph/api'
import {
  readFlightSimSnapshot,
  readFlightSimSpatialProfile,
  subscribeFlightSimSnapshot,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  readGameFpsRunId,
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from '@/features/game-fps/gameFpsRuntime'
import { readGameModeSnapshot, subscribeGameModeSnapshot } from '@/features/game-fps/gameModeRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { inspectXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import {
  publishGeoXrSharedMediaProjection,
  readGeoXrSharedMediaProjection,
  retryGeoXrSharedMediaAssetFocus,
  subscribeGeoXrSharedMediaAssetFocus,
} from '@/features/three/geoXrSharedMediaProjectionRuntime'
import { projectXrEnvironmentToFlightGeo } from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import {
  readFlightSimGeospatialBootstrapRequested,
  subscribeFlightSimGeospatialBootstrapRequest,
} from '@/features/game-flight-sim/flightSimSurfaceOpenLifecycle'
import { readCitySimSnapshot, subscribeCitySimSnapshot } from '@/features/game-city-sim/citySimRuntime'
import { projectCitySimToGeospatialOverlay } from '@/features/game-city-sim/citySimGeospatialProjection'
import { readImmersiveMediaSnapshot, subscribeImmersiveMediaSnapshot } from '@/features/immersive-media/immersiveMediaRuntime'
import { resolveXrMotionReferenceStage } from '@/features/three/xrSceneLibrary'
import { sampleXrMotionReferenceSubjectPlayback } from '@/features/three/xrMotionReferenceSubjectPlayback'

type GeoXrMediaSelectionAsset = Readonly<{
  id: string
  label: string
  coordinate: readonly [number, number]
}>

type GeoXrMediaSelectionTarget = Readonly<{
  id: string
  label: string
  left: number
  top: number
}>

/**
 * Adds semantic selection targets over the existing shared XR meshes. These
 * buttons have no duplicate artwork: the canvas remains the single renderer,
 * while selection tools and keyboard users get a named control per asset.
 */
export function GeoXrMediaSelectionTargets({
  active,
  assets,
  onSelect,
}: {
  active: boolean
  assets: readonly GeoXrMediaSelectionAsset[]
  onSelect: (targetId: string) => void
}) {
  const rootRef = React.useRef<HTMLElement | null>(null)
  const [targets, setTargets] = React.useState<readonly GeoXrMediaSelectionTarget[]>([])

  React.useEffect(() => {
    if (!active) {
      setTargets([])
      return
    }
    let disposed = false
    let attachedMap: any | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    const updatePositions = () => {
      if (disposed) return
      const root = rootRef.current
      const map = attachedMap
      const mapCanvas = map?.getCanvas?.() as HTMLCanvasElement | undefined
      if (!root || !mapCanvas || typeof map?.project !== 'function') return
      const rootRect = root.getBoundingClientRect()
      const mapRect = mapCanvas.getBoundingClientRect()
      const next = assets.flatMap(asset => {
        try {
          const point = map.project(asset.coordinate)
          const left = mapRect.left - rootRect.left + Number(point?.x)
          const top = mapRect.top - rootRect.top + Number(point?.y)
          return Number.isFinite(left) && Number.isFinite(top) ? [{ id: asset.id, label: asset.label, left, top }] : []
        } catch {
          return []
        }
      })
      setTargets(previous => {
        if (previous.length === next.length && previous.every((target, index) => {
          const candidate = next[index]
          return target.id === candidate?.id
            && target.label === candidate?.label
            && Math.abs(target.left - Number(candidate?.left)) < 0.5
            && Math.abs(target.top - Number(candidate?.top)) < 0.5
        })) return previous
        return next
      })
    }
    const onMapChange = () => updatePositions()
    const updateMap = () => {
      if (disposed) return
      const nextMap = readActiveMapLibreMap()
      if (nextMap !== attachedMap) {
        if (attachedMap) {
          for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
            attachedMap.off?.(eventName, onMapChange)
          }
        }
        attachedMap = nextMap
        if (attachedMap) {
          for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
            attachedMap.on?.(eventName, onMapChange)
          }
        }
      }
      updatePositions()
      retryGeoXrSharedMediaAssetFocus()
    }
    interval = setInterval(updateMap, 500)
    updateMap()
    return () => {
      disposed = true
      if (interval) clearInterval(interval)
      if (attachedMap) {
        for (const eventName of ['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata']) {
          attachedMap.off?.(eventName, onMapChange)
        }
      }
    }
  }, [active, assets])

  if (!active) return null
  return (
    <nav
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-label="Geo+XR shared Media assets"
      data-kg-geo-xr-media-selection-targets="1"
    >
      {targets.map(target => (
        <button
          key={target.id}
          type="button"
          className="pointer-events-auto absolute rounded-full border border-blue-500/30 bg-transparent focus-visible:border-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          style={{ left: target.left, top: target.top, width: 40, height: 40, transform: 'translate(-50%, -50%)' }}
          aria-label={`Select ${target.label} in Geo+XR and move the view to it`}
          title={`Select ${target.label} in Geo+XR`}
          data-kg-xr-geo-media-selection-target={target.id}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(target.id)
          }}
        />
      ))}
    </nav>
  )
}


function readFlightSimActive(): boolean {
  return readFlightSimSnapshot().active
}

export function useGeoXrGameModePresentation(args: { active: boolean; composedWithXr: boolean }) {
  const flightBootstrapRequested = React.useSyncExternalStore(
    subscribeFlightSimGeospatialBootstrapRequest,
    readFlightSimGeospatialBootstrapRequested,
    readFlightSimGeospatialBootstrapRequested,
  )
  const flightSimActive = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSimActive,
    readFlightSimActive,
  )
  const citySimSnapshot = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  const citySimActive = citySimSnapshot.active
  const gameModeActive = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    () => readGameModeSnapshot().active,
    () => readGameModeSnapshot().active,
  )
  const gameFpsSnapshot = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const xrMotion = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const gameModeCityContext = React.useMemo<CityGeoOverlaySnapshot | null>(() => {
    if (
      !composedWithXr
      || !citySimSnapshot.city.regionalPoiProfileId.trim()
    ) return null
    try {
      const cityContext = projectCitySimToGeospatialOverlay({
        ...citySimSnapshot,
        active: true,
      })
      return Object.freeze({
        ...cityContext,
        selectedParcelId: null,
      })
    } catch {
      return null
    }
  }, [citySimSnapshot, composedWithXr])
  const cityMapFrame = React.useMemo(
    () => deriveGameModeCityMapFrame(gameModeCityContext),
    [gameModeCityContext],
  )
  const sharedMediaEnvironment = React.useMemo(() => {
    if (!composedWithXr) return null
    const stage = resolveXrMotionReferenceStage(xrMotion.plan.stageId)
    const stageBounds = stage.regionalPoiProfile
      ? regionalPoiProfileBounds(stage.regionalPoiProfile)
      : SINGAPORE_FLIGHT_GEO_REFERENCE.presentationBounds
    const anchor = cityMapFrame?.origin
      || (stage.regionalPoiProfile
        ? Object.freeze([
          (stageBounds[0][0] + stageBounds[1][0]) / 2,
          (stageBounds[0][1] + stageBounds[1][1]) / 2,
        ] as const)
        : SINGAPORE_FLIGHT_GEO_REFERENCE.anchor)
    const presentationBounds = cityMapFrame?.bounds || stageBounds
    try {
      const projected = projectXrEnvironmentToFlightGeo(
        xrMotion.plan,
        { anchor, presentationBounds },
        {
          fitLocalContentToPresentationBounds: true,
          includeSubjectSurfaces: false,
        },
      )
      if (!gameModeCityContext) return projected
      const surfaces = Object.freeze(projected.surfaces.filter(surface => surface.kind !== 'poi'))
      return Object.freeze({
        ...projected,
        revision: `${projected.revision}|city-pois-shared`,
        surfaces,
      })
    } catch {
      return null
    }
  }, [composedWithXr, gameModeCityContext, cityMapFrame, xrMotion.plan])
  const gameModeMapFrame = React.useMemo(
    () => deriveXrEnvironmentMapFrame(sharedMediaEnvironment, cityMapFrame),
    [cityMapFrame, sharedMediaEnvironment],
  )
  const gameModeGeoOverlay = React.useMemo(() => {
    if (!composedWithXr) return null
    const selectedAssetId = inspectXrSharedAssetControls().selectedTargetId
    return Object.freeze({
      active: true,
      gameplayActive: gameModeActive,
      phase: gameFpsSnapshot.phase,
      runId: readGameFpsRunId(),
      tick: gameFpsSnapshot.tick,
      mapFrame: gameModeMapFrame,
      cityContext: citySimActive ? gameModeCityContext : null,
      environment: sharedMediaEnvironment,
      player: Object.freeze({ x: gameFpsSnapshot.player.x, z: gameFpsSnapshot.player.z }),
      npcs: Object.freeze((gameModeActive ? gameFpsSnapshot.npcs : []).map(npc => Object.freeze({
        id: npc.id,
        x: npc.x,
        z: npc.z,
        health: npc.health,
        action: npc.action,
      }))),
      assets: Object.freeze(xrMotion.plan.subjects.map(subject => {
        const track = xrMotion.plan.cast.find(candidate => candidate.actorId === subject.id)
        const playback = sampleXrMotionReferenceSubjectPlayback(subject, track, xrMotion.playheadSeconds)
        return Object.freeze({
          id: subject.id,
          assetId: subject.assetId,
          category: subject.category,
          label: subject.label,
          color: subject.color,
          x: playback.position[0],
          z: playback.position[2],
          scale: subject.scale,
          selected: selectedAssetId === subject.id,
        })
      })),
    })
  }, [composedWithXr, citySimActive, gameModeActive, gameFpsSnapshot, gameModeMapFrame, gameModeCityContext, sharedMediaEnvironment, xrMotion.plan.cast, xrMotion.plan.subjects, xrMotion.playheadSeconds])
  const sharedMediaGeoProjection = React.useMemo(() => {
    const origin = gameModeGeoOverlay?.mapFrame?.origin
    if (!gameModeGeoOverlay || !origin || origin.length < 2) return []
    const collection = gameModeGeoOverlayFeatureCollection(gameModeGeoOverlay, {
      lng: Number(origin[0]),
      lat: Number(origin[1]),
    })
    return collection.features.flatMap(feature => {
      const properties = feature.properties
      const coordinate = feature.geometry.coordinates
      const id = String(properties.actorId || '').trim()
      const lng = Number(coordinate[0])
      const lat = Number(coordinate[1])
      if (properties.actorKind !== 'asset' || !id || !Number.isFinite(lng) || !Number.isFinite(lat)) return []
      return [Object.freeze({ id, coordinate: Object.freeze([lng, lat] as const) })]
    })
  }, [gameModeGeoOverlay])
  React.useEffect(() => {
    publishGeoXrSharedMediaProjection(
      sharedMediaGeoProjection,
      gameModeGeoOverlay?.mapFrame?.origin || null,
    )
  }, [gameModeGeoOverlay?.mapFrame?.origin, sharedMediaGeoProjection])
  const geoXrMediaSelectionAssets = React.useMemo(() => sharedMediaGeoProjection.map(asset => ({
    ...asset,
    label: xrMotion.plan.subjects.find(subject => subject.id === asset.id)?.label || asset.id,
  })), [sharedMediaGeoProjection, xrMotion.plan.subjects])
  React.useEffect(() => {
    if (!active || !composedWithXr) return
    return subscribeGeoXrSharedMediaAssetFocus(targetId => {
      const asset = readGeoXrSharedMediaProjection().assets.find(candidate => candidate.id === targetId)
      const map = readActiveMapLibreMap() as any
      if (!asset || !map || typeof map.easeTo !== 'function') return false
      const currentZoom = Number(map.getZoom?.())
      map.easeTo({
        center: asset.coordinate,
        zoom: Math.max(Number.isFinite(currentZoom) ? currentZoom : 0, 18),
        duration: 800,
        essential: true,
      })
      return true
    })
  }, [active, composedWithXr])
  const keyboardNavigationEnabled = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    () => readImmersiveMediaSnapshot().navigation.keyboardActions,
    () => readImmersiveMediaSnapshot().navigation.keyboardActions,
  )
  return {
    citySimActive,
    flightBootstrapRequested,
    flightSimActive,
    gameModeActive,
    gameModeGeoOverlay,
    geoXrMediaSelectionAssets,
    keyboardNavigationEnabled,
  }
}
