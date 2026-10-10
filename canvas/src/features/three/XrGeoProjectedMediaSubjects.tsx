import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, Quaternion, Vector3, type Camera, type Group } from 'three'
import { GAME_MODE_GEO_OVERLAY_SOURCE_ID } from 'gympgrph'
import { readActiveMapLibreMap } from '@/lib/gympgrph/api'
import {
  readGeoXrSharedMediaProjection,
  subscribeGeoXrSharedMediaProjection,
} from './geoXrSharedMediaProjectionRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { resolveMotionControlSubjectPose, useMotionControlAnimationPose } from './useMotionControlAnimationPose'
import { sampleXrMotionReferenceSubjectPlayback } from './xrMotionReferenceSubjectPlayback'
import {
  inspectXrSharedAssetControls,
  readXrSharedAssetControlRevision,
  subscribeXrSharedAssetControlRuntime,
} from './xrSharedAssetControlRuntime'
import { XrSceneLibrarySubject } from './XrSceneLibrarySubject'

const SHARED_MEDIA_MAP_SOURCE_ID = GAME_MODE_GEO_OVERLAY_SOURCE_ID
const SHARED_MEDIA_ACTOR_QUERY_INTERVAL_MS = 250
const SHARED_MEDIA_CAMERA_PLANE_DISTANCE = 100
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * 6_371_008.8
const MAX_MERCATOR_LATITUDE = 85.051129

type MercatorCoordinate = Readonly<{ x: number; y: number }>
type CameraState = Readonly<{
  matrixAutoUpdate: boolean
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
  projectionMatrix: Matrix4
  projectionMatrixInverse: Matrix4
}>

type ProjectedPoint = Readonly<{ x: number; y: number }>
type MapFeature = Readonly<{
  geometry?: { type?: unknown; coordinates?: unknown }
  properties?: { actorKind?: unknown; actorId?: unknown }
}>

function readSharedMediaCoordinates(map: any): Map<string, readonly [number, number]> {
  const output = new Map<string, readonly [number, number]>()
  try {
    const features = map.querySourceFeatures?.(SHARED_MEDIA_MAP_SOURCE_ID) as MapFeature[] | undefined
    for (const feature of features || []) {
      const properties = feature.properties
      const coordinates = feature.geometry?.coordinates
      if (properties?.actorKind !== 'asset' || !Array.isArray(coordinates) || coordinates.length < 2) continue
      const actorId = String(properties.actorId || '').trim()
      const lng = Number(coordinates[0])
      const lat = Number(coordinates[1])
      if (!actorId || !Number.isFinite(lng) || !Number.isFinite(lat) || output.has(actorId)) continue
      output.set(actorId, Object.freeze([lng, lat] as const))
    }
  } catch {
    // A source may be between style replacement and its next committed frame.
  }
  return output
}

function mapPointToOverlayPixel(map: any, canvas: HTMLCanvasElement, point: readonly [number, number]): ProjectedPoint | null {
  try {
    const mapCanvas = map.getCanvas?.() as HTMLCanvasElement | undefined
    if (!mapCanvas || typeof map.project !== 'function') return null
    const mapRect = mapCanvas.getBoundingClientRect()
    const overlayRect = canvas.getBoundingClientRect()
    const projected = map.project(point)
    const x = mapRect.left - overlayRect.left + Number(projected?.x)
    const y = mapRect.top - overlayRect.top + Number(projected?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

function pointOnCameraPlane(
  camera: Camera,
  x: number,
  y: number,
  width: number,
  height: number,
  output = new Vector3(),
): Vector3 {
  const ndcX = (x / Math.max(1, width)) * 2 - 1
  const ndcY = 1 - (y / Math.max(1, height)) * 2
  const rayPoint = new Vector3(ndcX, ndcY, 0.5).unproject(camera)
  const direction = rayPoint.sub(camera.position).normalize()
  const forward = camera.getWorldDirection(new Vector3())
  const facingDistance = Math.max(0.001, direction.dot(forward))
  return output.copy(camera.position).addScaledVector(direction, SHARED_MEDIA_CAMERA_PLANE_DISTANCE / facingDistance)
}

function mapPixelsPerMeter(map: any, coordinate: readonly [number, number]): number {
  try {
    const [lng, lat] = coordinate
    const base = map.project(coordinate)
    const metersPerDegree = 111_320
    const longitudeMetersPerDegree = metersPerDegree * Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180)))
    const east = map.project([lng + 1 / longitudeMetersPerDegree, lat])
    const north = map.project([lng, lat + 1 / metersPerDegree])
    const eastScale = Math.hypot(Number(east.x) - Number(base.x), Number(east.y) - Number(base.y))
    const northScale = Math.hypot(Number(north.x) - Number(base.x), Number(north.y) - Number(base.y))
    const scale = (eastScale + northScale) / 2
    return Number.isFinite(scale) && scale > 0 ? scale : 1
  } catch {
    return 1
  }
}

function mercatorCoordinate(coordinate: readonly [number, number]): MercatorCoordinate {
  const longitude = Number(coordinate[0])
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, Number(coordinate[1])))
  const latitudeRadians = latitude * Math.PI / 180
  return Object.freeze({
    x: (180 + longitude) / 360,
    y: (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))) / 360,
  })
}

function localMetersFromMercatorCoordinate(
  coordinate: readonly [number, number],
  origin: readonly [number, number],
): Readonly<{ east: number; south: number }> | null {
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, Number(origin[1])))
  const latitudeCosine = Math.max(0.01, Math.cos(latitude * Math.PI / 180))
  const originMercator = mercatorCoordinate(origin)
  const targetMercator = mercatorCoordinate(coordinate)
  const longitudeDelta = ((Number(coordinate[0]) - Number(origin[0]) + 540) % 360) - 180
  const metersPerMercatorUnit = EARTH_CIRCUMFERENCE_METERS * latitudeCosine
  const east = longitudeDelta / 360 * metersPerMercatorUnit
  const south = (targetMercator.y - originMercator.y) * metersPerMercatorUnit
  return Number.isFinite(east) && Number.isFinite(south) ? Object.freeze({ east, south }) : null
}

function readMapWorldProjectionMatrix(
  map: any,
  canvas: HTMLCanvasElement,
  origin: readonly [number, number],
): Matrix4 | null {
  try {
    const mapCanvas = map.getCanvas?.() as HTMLCanvasElement | undefined
    const projectionData = map.transform?.getProjectionDataForCustomLayer?.()
    const matrix = projectionData?.mainMatrix as ArrayLike<number> | undefined
    if (
      !mapCanvas
      || !matrix
      || matrix.length !== 16
      || projectionData.projectionTransition !== 0
      || Array.from(matrix).some(value => !Number.isFinite(Number(value)))
    ) return null
    const mapRect = mapCanvas.getBoundingClientRect()
    const overlayRect = canvas.getBoundingClientRect()
    if (mapRect.width <= 0 || mapRect.height <= 0 || overlayRect.width <= 0 || overlayRect.height <= 0) return null

    const latitude = Number(origin[1])
    const originMercator = mercatorCoordinate(origin)
    const metersPerMercatorUnit = EARTH_CIRCUMFERENCE_METERS
      * Math.max(0.01, Math.cos(latitude * Math.PI / 180))
    const localMetersToMercator = new Matrix4().set(
      1 / metersPerMercatorUnit, 0, 0, originMercator.x,
      0, 0, 1 / metersPerMercatorUnit, originMercator.y,
      0, 1 / metersPerMercatorUnit, 0, 0,
      0, 0, 0, 1,
    )
    const mapProjection = new Matrix4().fromArray(Array.from(matrix, Number)).multiply(localMetersToMercator)

    // The MapLibre matrix targets its own canvas viewport. Adjust clip space
    // when the transparent Three canvas does not exactly cover that viewport.
    const scaleX = mapRect.width / overlayRect.width
    const scaleY = mapRect.height / overlayRect.height
    const translateX = 2 * (mapRect.left - overlayRect.left) / overlayRect.width + scaleX - 1
    const translateY = 1 - scaleY - 2 * (mapRect.top - overlayRect.top) / overlayRect.height
    const clipAdjustment = new Matrix4().set(
      scaleX, 0, 0, translateX,
      0, scaleY, 0, translateY,
      0, 0, 1, 0,
      0, 0, 0, 1,
    )
    return clipAdjustment.multiply(mapProjection)
  } catch {
    return null
  }
}

function captureCameraState(camera: Camera): CameraState {
  return Object.freeze({
    matrixAutoUpdate: camera.matrixAutoUpdate,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    scale: camera.scale.clone(),
    projectionMatrix: camera.projectionMatrix.clone(),
    projectionMatrixInverse: camera.projectionMatrixInverse.clone(),
  })
}

function setMapCameraProjection(camera: Camera, projection: Matrix4): void {
  camera.position.set(0, 0, 0)
  camera.quaternion.identity()
  camera.scale.set(1, 1, 1)
  camera.matrixAutoUpdate = true
  camera.updateMatrix()
  camera.updateMatrixWorld(true)
  camera.matrixWorldInverse.identity()
  camera.projectionMatrix.copy(projection)
  camera.projectionMatrixInverse.copy(projection).invert()
}

function restoreCameraState(camera: Camera, state: CameraState): void {
  camera.position.copy(state.position)
  camera.quaternion.copy(state.quaternion)
  camera.scale.copy(state.scale)
  camera.matrixAutoUpdate = state.matrixAutoUpdate
  camera.projectionMatrix.copy(state.projectionMatrix)
  camera.projectionMatrixInverse.copy(state.projectionMatrixInverse)
  camera.updateMatrix()
  camera.updateMatrixWorld(true)
}

/**
 * Draws the exact shared Media catalog geometry in the Geo+XR MapLibre world.
 * Its projection matrix matches MapLibre's 3D layers and its local origin,
 * position, height, and scale are expressed in the same Mercator space.
 */
export function XrGeoProjectedMediaSubjects() {
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  const selectedTargetId = inspectXrSharedAssetControls().selectedTargetId
  const { motionActorId, livePose } = useMotionControlAnimationPose()
  const sharedMediaProjection = React.useSyncExternalStore(
    subscribeGeoXrSharedMediaProjection,
    readGeoXrSharedMediaProjection,
    readGeoXrSharedMediaProjection,
  )
  const canonicalCoordinates = React.useMemo(
    () => new Map(sharedMediaProjection.assets.map(asset => [asset.id, asset.coordinate] as const)),
    [sharedMediaProjection],
  )
  const playbackBySubjectId = React.useMemo(() => new Map(runtime.plan.subjects.map(subject => {
    const track = runtime.plan.cast.find(candidate => candidate.actorId === subject.id)
    return [subject.id, sampleXrMotionReferenceSubjectPlayback(
      subject,
      track,
      runtime.playheadSeconds,
      resolveMotionControlSubjectPose(subject, motionActorId, livePose),
    )] as const
  })), [livePose, motionActorId, runtime.plan.cast, runtime.plan.subjects, runtime.playheadSeconds])
  const groupRefs = React.useRef(new Map<string, Group>())
  const activeMapRef = React.useRef<any | null>(null)
  const coordinatesRef = React.useRef(new Map<string, readonly [number, number]>())
  const coordinatesReadAtRef = React.useRef(0)
  const invalidateRef = React.useRef<(() => void) | null>(null)
  const cameraStateRef = React.useRef<CameraState | null>(null)
  const { camera, gl, invalidate } = useThree()
  invalidateRef.current = invalidate

  React.useEffect(() => {
    let disposed = false
    let interval: ReturnType<typeof setInterval> | null = null
    let attachedMap: any | null = null
    const updateMap = () => {
      if (disposed) return
      const nextMap = readActiveMapLibreMap()
      if (nextMap === attachedMap) return
      if (attachedMap) {
        for (const eventName of ['render', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'sourcedata', 'styledata']) {
          attachedMap.off?.(eventName, onMapChange)
        }
      }
      attachedMap = nextMap
      activeMapRef.current = nextMap
      coordinatesRef.current = new Map()
      coordinatesReadAtRef.current = 0
      if (attachedMap) {
        for (const eventName of ['render', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'sourcedata', 'styledata']) {
          attachedMap.on?.(eventName, onMapChange)
        }
      }
      invalidateRef.current?.()
      return Boolean(attachedMap)
    }
    const onMapChange = (event: { type?: string }) => {
      if (event?.type === 'sourcedata' || event?.type === 'styledata') coordinatesReadAtRef.current = 0
      invalidateRef.current?.()
    }
    interval = setInterval(updateMap, 500)
    updateMap()
    return () => {
      disposed = true
      if (interval) clearInterval(interval)
      if (attachedMap) {
        for (const eventName of ['render', 'move', 'zoom', 'rotate', 'pitch', 'resize', 'sourcedata', 'styledata']) {
          attachedMap.off?.(eventName, onMapChange)
        }
      }
      activeMapRef.current = null
    }
  }, [])

  useFrame(() => {
    const map = activeMapRef.current
    const canvas = gl.domElement
    if (!map || !canvas.isConnected) {
      if (cameraStateRef.current) restoreCameraState(camera, cameraStateRef.current)
      for (const group of groupRefs.current.values()) group.visible = false
      return
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - coordinatesReadAtRef.current >= SHARED_MEDIA_ACTOR_QUERY_INTERVAL_MS) {
      coordinatesRef.current = readSharedMediaCoordinates(map)
      coordinatesReadAtRef.current = now
    }
    if (!cameraStateRef.current) cameraStateRef.current = captureCameraState(camera)
    const firstSubjectCoordinate = runtime.plan.subjects
      .map(subject => canonicalCoordinates.get(subject.id) || coordinatesRef.current.get(subject.id))
      .find((coordinate): coordinate is readonly [number, number] => Boolean(coordinate))
    const origin = sharedMediaProjection.origin || firstSubjectCoordinate || null
    const mapWorldProjection = origin ? readMapWorldProjectionMatrix(map, canvas, origin) : null
    if (mapWorldProjection && origin) {
      setMapCameraProjection(camera, mapWorldProjection)
      for (const subject of runtime.plan.subjects) {
        const group = groupRefs.current.get(subject.id)
        const coordinate = canonicalCoordinates.get(subject.id) || coordinatesRef.current.get(subject.id)
        if (!group || !coordinate) {
          if (group) group.visible = false
          continue
        }
        const localPosition = localMetersFromMercatorCoordinate(coordinate, origin)
        if (!localPosition) {
          group.visible = false
          continue
        }
        // Geo+XR local axes are east, up, south, matching the subject's
        // authored XR position and MapLibre's Mercator world transform.
        group.visible = true
        const playback = playbackBySubjectId.get(subject.id)
        group.position.set(localPosition.east, Number(playback?.position[1]) || 0, localPosition.south)
        group.quaternion.identity()
        group.scale.setScalar(1)
        group.renderOrder = 0
      }
      return
    }
    if (cameraStateRef.current) restoreCameraState(camera, cameraStateRef.current)
    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width <= 0 || height <= 0) return
    camera.updateMatrixWorld()
    const cameraQuaternion = camera.getWorldQuaternion(new Quaternion())
    const centerPlanePoint = pointOnCameraPlane(camera, width / 2, height / 2, width, height)
    const adjacentPlanePoint = pointOnCameraPlane(camera, width / 2 + 1, height / 2, width, height)
    const worldUnitsPerPixel = centerPlanePoint.distanceTo(adjacentPlanePoint)
    if (!Number.isFinite(worldUnitsPerPixel) || worldUnitsPerPixel <= 0) return

    for (const subject of runtime.plan.subjects) {
      const group = groupRefs.current.get(subject.id)
      // The projection runtime is derived from the same snapshot used to build
      // the MapLibre source. Source queries remain a fallback for older maps,
      // but must never make the shared catalog vanish during a style reload.
      const coordinate = canonicalCoordinates.get(subject.id) || coordinatesRef.current.get(subject.id)
      if (!group || !coordinate) {
        if (group) group.visible = false
        continue
      }
      const projected = mapPointToOverlayPixel(map, canvas, coordinate)
      if (!projected || projected.x < -width || projected.x > width * 2 || projected.y < -height || projected.y > height * 2) {
        group.visible = false
        continue
      }
      const location = pointOnCameraPlane(camera, projected.x, projected.y, width, height)
      // Use physical map scale in the fallback projection as well. The full
      // Mercator projection path above is preferred when the map supports it.
      const pixelsPerMeter = mapPixelsPerMeter(map, coordinate)
      group.visible = true
      group.position.copy(location)
      const playback = playbackBySubjectId.get(subject.id)
      if (playback?.position[1]) {
        group.position.addScaledVector(
          new Vector3(0, 1, 0).applyQuaternion(cameraQuaternion),
          playback.position[1] * worldUnitsPerPixel * pixelsPerMeter,
        )
      }
      group.quaternion.copy(cameraQuaternion)
      group.scale.setScalar(worldUnitsPerPixel * pixelsPerMeter)
      group.renderOrder = 100
    }
  })

  return (
    <group name="agentic_os_geo_xr_shared_media_subjects" userData={{ source: 'shared-media-catalog', subjectCount: runtime.plan.subjects.length }}>
      <ambientLight intensity={1.3} />
      <directionalLight position={[4, 8, 10]} intensity={1.7} />
      {runtime.plan.subjects.map(subject => {
        const playback = playbackBySubjectId.get(subject.id)
        return (
        <group
          key={subject.id}
          ref={node => {
            if (node) {
              node.matrixAutoUpdate = true
              groupRefs.current.set(subject.id, node)
            }
            else groupRefs.current.delete(subject.id)
          }}
          visible={false}
          name={`agentic_os_geo_xr_media_subject_${subject.id}`}
          userData={{ assetId: subject.assetId, category: subject.category, label: subject.label }}
        >
          <XrSceneLibrarySubject
            animationPose={playback?.animationPose}
            presentation={playback?.presentation}
            facingYRadians={playback?.facingYRadians}
            subject={subject}
            position={[0, 0, 0]}
            stageScale={1}
            selected={selectedTargetId === subject.id}
          />
        </group>
        )
      })}
    </group>
  )
}
