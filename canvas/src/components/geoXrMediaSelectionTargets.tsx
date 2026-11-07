import React from 'react'
import {
  deriveGameModeCityMapFrame,
  deriveXrEnvironmentMapFrame,
  gameModeGeoOverlayFeatureCollection,
  type CityGeoOverlaySnapshot,
} from 'gympgrph'
import { readActiveMapLibreMap, regionalPoiProfileBounds } from '@/lib/gympgrph/api'
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
import {
  resolveXrMotionReferenceStage,
  resolveXrMotionReferenceStagePreviewBounds,
} from '@/features/three/xrSceneLibrary'
import { sampleXrMotionReferenceSubjectPlayback } from '@/features/three/xrMotionReferenceSubjectPlayback'
import {
  readCinemaShotSchedule,
  resolveCinemaShotStaging,
  subscribeCinemaShotFocus,
} from '@/features/cinema/cinemaShotFocus'

type GeoXrMediaSelectionAsset = Readonly<{
  id: string
  label: string
  coordinate: readonly [number, number]
  elevationMeters?: number
  category?: string
  color?: string
  footprintMeters?: number
  selected?: boolean
}>

// map.project() only resolves sea-level points; staged rooftop cast need their altitude so the
// targets track the XR overlay, which places them through the same custom-layer matrix.
function projectGeoXrPointWithElevation(
  map: any,
  mapRect: DOMRect,
  coordinate: readonly [number, number],
  elevationMeters: number,
): { x: number, y: number } | null {
  const transform = map?.transform || map?._camera?.transform
  const projectionData = transform?.getProjectionDataForCustomLayer?.(false)
  const matrix = projectionData?.mainMatrix as ArrayLike<number> | undefined
  if (!matrix || matrix.length !== 16 || projectionData.projectionTransition !== 0) return null
  const longitude = Number(coordinate[0])
  const latitude = Number(coordinate[1])
  const sinLatitude = Math.sin(latitude * Math.PI / 180)
  const mx = (longitude + 180) / 360
  const my = 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)
  const mz = elevationMeters / (2 * Math.PI * 6_371_008.8 * Math.max(0.01, Math.cos(latitude * Math.PI / 180)))
  const m = Array.from(matrix, Number)
  const clipX = m[0] * mx + m[4] * my + m[8] * mz + m[12]
  const clipY = m[1] * mx + m[5] * my + m[9] * mz + m[13]
  const clipW = m[3] * mx + m[7] * my + m[11] * mz + m[15]
  if (!Number.isFinite(clipW) || clipW <= 0) return null
  return {
    x: (clipX / clipW + 1) * 0.5 * mapRect.width,
    y: (1 - clipY / clipW) * 0.5 * mapRect.height,
  }
}

type GeoXrMediaSelectionTarget = Readonly<{
  id: string
  label: string
  category: string
  color: string
  left: number
  top: number
  size: number
  selected: boolean
}>

const GEO_XR_MEDIA_TARGET_MAP_EVENTS = Object.freeze(['load', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'styledata'])
const GEO_XR_MEDIA_TARGET_MIN_PX = 28
const GEO_XR_MEDIA_TARGET_MAX_PX = 64
const GEO_XR_MEDIA_TARGET_FALLBACK_COLOR = '#38bdf8'
const WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL = 156543.03392

/** Screen diameter for an asset footprint at the current map zoom/latitude. */
function resolveGeoXrMediaSelectionTargetSize(footprintMeters: number, zoom: number, latitude: number): number {
  const metersPerPixel = WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL * Math.cos((latitude * Math.PI) / 180) / 2 ** zoom
  const pixels = metersPerPixel > 0 && Number.isFinite(metersPerPixel) ? footprintMeters / metersPerPixel : 0
  if (!Number.isFinite(pixels)) return GEO_XR_MEDIA_TARGET_MIN_PX
  return Math.round(Math.min(GEO_XR_MEDIA_TARGET_MAX_PX, Math.max(GEO_XR_MEDIA_TARGET_MIN_PX, pixels)))
}

function normalizeTargetColor(value: string | undefined): string {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : GEO_XR_MEDIA_TARGET_FALLBACK_COLOR
}

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
    let frame: number | null = null
    const updatePositions = () => {
      frame = null
      if (disposed) return
      const root = rootRef.current
      const map = attachedMap
      const mapCanvas = map?.getCanvas?.() as HTMLCanvasElement | undefined
      if (!root || !mapCanvas || typeof map?.project !== 'function') return
      const rootRect = root.getBoundingClientRect()
      const mapRect = mapCanvas.getBoundingClientRect()
      const zoom = Number(map.getZoom?.())
      const pad = GEO_XR_MEDIA_TARGET_MAX_PX
      const next = assets.flatMap(asset => {
        try {
          const elevation = Number(asset.elevationMeters) || 0
          const point = (elevation !== 0
            ? projectGeoXrPointWithElevation(map, mapRect, asset.coordinate, elevation)
            : null) || map.project(asset.coordinate)
          const x = Number(point?.x)
          const y = Number(point?.y)
          if (!Number.isFinite(x) || !Number.isFinite(y)) return []
          if (x < -pad || y < -pad || x > mapRect.width + pad || y > mapRect.height + pad) return []
          return [{
            id: asset.id,
            label: asset.label,
            category: String(asset.category || ''),
            color: normalizeTargetColor(asset.color),
            left: mapRect.left - rootRect.left + x,
            top: mapRect.top - rootRect.top + y,
            size: resolveGeoXrMediaSelectionTargetSize(
              Math.max(0.5, Number(asset.footprintMeters) || 1.5),
              Number.isFinite(zoom) ? zoom : 0,
              Number(asset.coordinate[1]) || 0,
            ),
            selected: Boolean(asset.selected),
          }]
        } catch {
          return []
        }
      })
      setTargets(previous => {
        if (previous.length === next.length && previous.every((target, index) => {
          const candidate = next[index]
          return target.id === candidate?.id
            && target.label === candidate?.label
            && target.color === candidate?.color
            && target.selected === candidate?.selected
            && target.size === candidate?.size
            && Math.abs(target.left - Number(candidate?.left)) < 0.5
            && Math.abs(target.top - Number(candidate?.top)) < 0.5
        })) return previous
        return next
      })
    }
    const schedule = () => {
      if (disposed || frame !== null) return
      frame = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(updatePositions)
        : (setTimeout(updatePositions, 16) as unknown as number)
    }
    const onMapChange = () => schedule()
    const detach = () => {
      if (!attachedMap) return
      for (const eventName of GEO_XR_MEDIA_TARGET_MAP_EVENTS) attachedMap.off?.(eventName, onMapChange)
    }
    const updateMap = () => {
      if (disposed) return
      const nextMap = readActiveMapLibreMap()
      if (nextMap !== attachedMap) {
        detach()
        attachedMap = nextMap
        if (attachedMap) {
          for (const eventName of GEO_XR_MEDIA_TARGET_MAP_EVENTS) attachedMap.on?.(eventName, onMapChange)
        }
      }
      schedule()
      retryGeoXrSharedMediaAssetFocus()
    }
    interval = setInterval(updateMap, 500)
    updateMap()
    return () => {
      disposed = true
      if (interval) clearInterval(interval)
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      detach()
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
          className={[
            'group pointer-events-auto absolute flex cursor-pointer items-center justify-center rounded-full border',
            'transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out',
            'hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            target.selected ? 'z-[5] border-2 border-white' : 'border-white/45 hover:border-white/90',
          ].join(' ')}
          style={{
            left: target.left,
            top: target.top,
            width: target.size,
            height: target.size,
            translate: '-50% -50%',
            backgroundColor: `${target.color}${target.selected ? '33' : '14'}`,
            boxShadow: target.selected
              ? `0 0 0 2px ${target.color}, 0 0 18px 2px ${target.color}99`
              : `0 0 0 1px ${target.color}b3, 0 0 10px ${target.color}55`,
          }}
          aria-label={`Select ${target.label} in Geo+XR and move the view to it`}
          aria-pressed={target.selected}
          title={target.category ? `${target.label} · ${target.category}` : target.label}
          data-kg-xr-geo-media-selection-target={target.id}
          data-kg-xr-geo-media-selection-selected={target.selected ? '1' : '0'}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(target.id)
          }}
        >
          <span
            aria-hidden="true"
            className="block rounded-full border border-white/80"
            style={{ width: 8, height: 8, backgroundColor: target.color, boxShadow: `0 0 6px ${target.color}` }}
          />
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-slate-950/85 px-2 py-0.5 text-[10px] font-medium leading-4 text-white shadow-overlay backdrop-blur-sm transition-opacity',
              target.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            ].join(' ')}
          >
            {target.label}
          </span>
        </button>
      ))}
    </nav>
  )
}


function readFlightSimActive(): boolean {
  return readFlightSimSnapshot().active
}

export function useGeoXrGameModePresentation(args: { active: boolean; composedWithXr: boolean }) {
  const { active, composedWithXr } = args
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
    const profileBounds = stage.regionalPoiProfile
      ? regionalPoiProfileBounds(stage.regionalPoiProfile)
      : null
    const stagePreviewBounds = resolveXrMotionReferenceStagePreviewBounds(stage.id)
    const stageBounds = profileBounds || (stagePreviewBounds
      ? Object.freeze([
        Object.freeze([stagePreviewBounds[0], stagePreviewBounds[1]] as const),
        Object.freeze([stagePreviewBounds[2], stagePreviewBounds[3]] as const),
      ] as const)
      : null)
    if (!stageBounds) return null
    const stageAnchor = stage.geospatialContext?.previewAnchor || Object.freeze([
      (stageBounds[0][0] + stageBounds[1][0]) / 2,
      (stageBounds[0][1] + stageBounds[1][1]) / 2,
    ] as const)
    // An explicit stage context takes precedence over any inactive city-sim
    // frame so a Hong Kong blockout cannot inherit a stale Singapore origin.
    const anchor = stage.geospatialContext
      ? stageAnchor
      : cityMapFrame?.origin || stageAnchor
    const presentationBounds = stage.geospatialContext
      ? stageBounds
      : cityMapFrame?.bounds || stageBounds
    try {
      const projected = projectXrEnvironmentToFlightGeo(
        xrMotion.plan,
        { anchor, presentationBounds },
        {
          fitLocalContentToPresentationBounds: Boolean(
            cityMapFrame || stage.regionalPoiProfile,
          ),
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
  const stageContextOwnsMapFrame = Boolean(
    resolveXrMotionReferenceStage(xrMotion.plan.stageId).geospatialContext,
  )
  const activeCityMapFrame = stageContextOwnsMapFrame ? null : cityMapFrame
  const gameModeMapFrame = React.useMemo(
    () => deriveXrEnvironmentMapFrame(sharedMediaEnvironment, activeCityMapFrame),
    [activeCityMapFrame, sharedMediaEnvironment],
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
      cityContext: citySimActive && !stageContextOwnsMapFrame ? gameModeCityContext : null,
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
  }, [composedWithXr, citySimActive, stageContextOwnsMapFrame, gameModeActive, gameFpsSnapshot, gameModeMapFrame, gameModeCityContext, sharedMediaEnvironment, xrMotion.plan.cast, xrMotion.plan.subjects, xrMotion.playheadSeconds])
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
  const shotSchedule = React.useSyncExternalStore(
    subscribeCinemaShotFocus,
    readCinemaShotSchedule,
    readCinemaShotSchedule,
  )
  const geoXrMediaSelectionAssets = React.useMemo(() => {
    const selectedAssetId = inspectXrSharedAssetControls().selectedTargetId
    const staging = resolveCinemaShotStaging(xrMotion.plan.stageId, xrMotion.playheadSeconds, shotSchedule)
    const stagedCast = staging && staging.cast.length > 0 ? staging.cast : null
    // Mirrors the XR overlay: a staged shot shows only its cast, gathered on the shot's sheet location.
    return sharedMediaGeoProjection.flatMap(asset => {
      if (stagedCast && !stagedCast.includes(asset.id)) return []
      const subject = xrMotion.plan.subjects.find(candidate => candidate.id === asset.id)
      return [{
        ...asset,
        coordinate: stagedCast && staging ? staging.location.coordinate : asset.coordinate,
        elevationMeters: stagedCast && staging ? staging.location.elevationMeters : undefined,
        label: subject?.label || asset.id,
        category: subject?.category,
        color: subject?.color,
        footprintMeters: 1.5 * Math.max(0.25, Number(subject?.scale) || 1),
        selected: selectedAssetId === asset.id,
      }]
    })
    // xrMotion identity changes whenever the shared selection is published.
  }, [sharedMediaGeoProjection, shotSchedule, xrMotion])
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
