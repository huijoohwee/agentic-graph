import { XR_MOTION_REFERENCE_STAGE_PRESETS, type XrMotionReferenceStageLocation } from '../three/xrSceneLibrary'

export type CinemaKitReferenceLocation = XrMotionReferenceStageLocation
type GeoCoordinate = XrMotionReferenceStageLocation['coordinate']

export type CinemaShotGeoCamera = Readonly<{
  center: GeoCoordinate
  elevation: number
  zoom: number
  pitch: number
  bearing: number
}>

export type CinemaShotFocus = Readonly<{
  kitId: string
  shotId: string
  locationIndex: number | null
}>

export function resolveCinemaKitReferenceLocation(
  kitId: string,
  locationIndex: number | null | undefined,
): CinemaKitReferenceLocation | null {
  if (!locationIndex) return null
  const stage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(candidate => candidate.id === kitId)
  return stage?.referenceLocations?.find(location => location.index === locationIndex) || null
}

const SHOT_DOLLY_BEARING_DEGREES = 12
const SHOT_WIDE_ZOOM = 21.35
const SHOT_CLOSE_ZOOM = 22
const SHOT_DOLLY_PITCH_DEGREES = 6
const MAX_MAP_PITCH_DEGREES = 60

export type CinemaCameraPathCue = Readonly<{
  timeSeconds: number
  moveId: string
  settings?: Readonly<{
    angle?: string
    level?: string
    focalLengthMm?: number
    orbitX?: number
    orbitY?: number
  }>
}>

function resolveCameraPathFrame(
  cameraPath: readonly CinemaCameraPathCue[] | undefined,
  startSeconds: number,
  endSeconds: number,
  progress: number,
  shotOrdinal: number,
): Pick<CinemaShotGeoCamera, 'zoom' | 'pitch' | 'bearing'> | null {
  if (!cameraPath?.length) return null
  const ordered = [...cameraPath].sort((left, right) => left.timeSeconds - right.timeSeconds)
  const start = ordered.filter(mark => mark.timeSeconds <= startSeconds).at(-1) || ordered[0]
  const end = ordered.find(mark => mark.timeSeconds >= endSeconds) || ordered[ordered.length - 1]
  const ease = progress * progress * (3 - 2 * progress)
  const interpolate = (left: number, right: number) => left + (right - left) * ease
  const startLens = Math.max(18, Number(start.settings?.focalLengthMm) || 35)
  const endLens = Math.max(18, Number(end.settings?.focalLengthMm) || startLens)
  const lens = interpolate(startLens, endLens)
  const lensRatio = Math.log(Math.max(24, lens) / 24) / Math.log(85 / 24)
  // MapLibre pitch is measured up from the map plane: 0 looks straight down and larger
  // values move toward the horizon. Keep the cinema labels in their usual camera sense.
  const levelPitch = (level: string | undefined, angle: string | undefined) => angle === 'overhead'
    ? 20
    : level === 'high-angle' ? 38 : level === 'low-angle' ? 60 : 56
  const pitch = interpolate(
    levelPitch(start.settings?.level, start.settings?.angle),
    levelPitch(end.settings?.level, end.settings?.angle),
  )
  const angleBearing = (angle: string | undefined) => angle === 'left-side' ? -58 : angle === 'right-side' ? 58 : 0
  const bearing = interpolate(angleBearing(start.settings?.angle), angleBearing(end.settings?.angle))
  const orbit = interpolate(Number(start.settings?.orbitX) || 0, Number(end.settings?.orbitX) || 0)
  const verticalOrbit = interpolate(Number(start.settings?.orbitY) || 0, Number(end.settings?.orbitY) || 0)
  const direction = start.moveId === 'orbit-clockwise' ? 1 : start.moveId === 'orbit-counterclockwise' ? -1 : 0
  return {
    zoom: Math.max(20.2, Math.min(22, 21.35 + lensRatio * 1.05)),
    pitch: Math.max(32, Math.min(MAX_MAP_PITCH_DEGREES, pitch + Math.abs(orbit) * 8 - verticalOrbit * 6)),
    bearing: bearing + orbit * 28 + direction * 58 * ease + (shotOrdinal % 2 ? 4 : -4),
  }
}

/**
 * Frames a reference location at the height the scene plays (`elevation` is the centre's metres
 * above sea level), so rooftop and street scenes alike hold the cast at frame centre.
 * `progress` (0–1 through the shot) pushes from a wide establishing size into a close
 * performance size while orbiting, so every shot keeps moving.
 */
export function resolveCinemaShotGeoCamera(
  location: CinemaKitReferenceLocation,
  shotOrdinal: number,
  progress = 0,
  cameraPath?: readonly CinemaCameraPathCue[],
  shotStartSeconds = 0,
  shotEndSeconds = 0,
): CinemaShotGeoCamera {
  const swing = shotOrdinal % 2 === 0 ? -1 : 1
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
  const eased = t * t * (3 - 2 * t)
  const basePitch = location.elevationMeters >= 250 ? 48 : 52
  const cameraPathFrame = resolveCameraPathFrame(cameraPath, shotStartSeconds, shotEndSeconds, eased, shotOrdinal)
  return {
    center: location.coordinate,
    elevation: Math.max(0, location.elevationMeters),
    zoom: cameraPathFrame?.zoom ?? SHOT_WIDE_ZOOM + (SHOT_CLOSE_ZOOM - SHOT_WIDE_ZOOM) * eased,
    pitch: cameraPathFrame?.pitch ?? Math.min(MAX_MAP_PITCH_DEGREES, basePitch + SHOT_DOLLY_PITCH_DEGREES * eased),
    bearing: cameraPathFrame?.bearing ?? swing * (18 + (shotOrdinal % 3) * 9) + swing * SHOT_DOLLY_BEARING_DEGREES * eased,
  }
}

const listeners = new Set<() => void>()

export type CinemaShotScheduleEntry = Readonly<{
  shotId: string
  startSeconds: number
  endSeconds: number
  locationIndex: number | null
  /** Subject ids staged at the shot location; the first leads the acting. Empty leaves subjects on the stage origin. */
  cast?: readonly string[]
  acting?: string
}>

export type CinemaShotSchedule = Readonly<{
  kitId: string
  durationSeconds: number
  shots: readonly CinemaShotScheduleEntry[]
  cameraPath?: readonly CinemaCameraPathCue[]
}>

/** Same shape as the Geo timeline camera the overlay publisher hands to the map. */
export type CinemaShotTimelineGeoCamera = Readonly<{
  bearingDegrees: number
  centerCoordinate: GeoCoordinate
  centerElevationMeters: number
  pitchDegrees: number
  playheadSeconds: number
  zoom: number
}>

let schedule: CinemaShotSchedule | null = null

export function publishCinemaShotSchedule(next: CinemaShotSchedule | null): void {
  if (schedule === next) return
  if (schedule && next && JSON.stringify(schedule) === JSON.stringify(next)) return
  schedule = next
  listeners.forEach(listener => listener())
}

export function readCinemaShotSchedule(): CinemaShotSchedule | null {
  return schedule
}

export type CinemaShotStaging = Readonly<{
  kitId: string
  shotId: string
  ordinal: number
  progress: number
  localSeconds: number
  location: CinemaKitReferenceLocation
  cast: readonly string[]
  acting: string
  camera: CinemaShotGeoCamera
}>

/**
 * Resolves the shot under the playhead into where (sheet location), who (cast) and how
 * (acting, camera) it plays, or null when the kit or shot has no sheet location.
 */
export function resolveCinemaShotStaging(
  activeKitId: string,
  playheadSeconds: number,
  current: CinemaShotSchedule | null = schedule,
): CinemaShotStaging | null {
  if (!current || current.kitId !== activeKitId || current.shots.length === 0) return null
  const seconds = Math.max(0, Math.min(current.durationSeconds, Number.isFinite(playheadSeconds) ? playheadSeconds : 0))
  let ordinal = current.shots.findIndex(shot => seconds >= shot.startSeconds && seconds < shot.endSeconds)
  if (ordinal < 0) ordinal = seconds >= current.durationSeconds ? current.shots.length - 1 : 0
  const shot = current.shots[ordinal]
  const location = resolveCinemaKitReferenceLocation(current.kitId, shot.locationIndex)
  if (!location) return null
  const span = Math.max(0.001, shot.endSeconds - shot.startSeconds)
  const localSeconds = Math.max(0, Math.min(span, seconds - shot.startSeconds))
  const progress = localSeconds / span
  return Object.freeze({
    kitId: current.kitId,
    shotId: shot.shotId,
    ordinal,
    progress,
    localSeconds,
    location,
    cast: shot.cast || [],
    acting: shot.acting || 'idle',
    camera: resolveCinemaShotGeoCamera(
      location,
      ordinal,
      progress,
      current.cameraPath,
      shot.startSeconds,
      shot.endSeconds,
    ),
  })
}

/**
 * The single Geo camera owner for a cinema timeline: picks the shot under the playhead and
 * returns its framed, dollying camera, or null when the kit or shot has no sheet location.
 */
export function resolveCinemaShotTimelineGeoCamera(
  activeKitId: string,
  playheadSeconds: number,
  current: CinemaShotSchedule | null = schedule,
): CinemaShotTimelineGeoCamera | null {
  const staging = resolveCinemaShotStaging(activeKitId, playheadSeconds, current)
  if (!staging || !current) return null
  const camera = staging.camera
  return Object.freeze({
    bearingDegrees: (camera.bearing + 360) % 360,
    centerCoordinate: camera.center,
    centerElevationMeters: camera.elevation,
    pitchDegrees: camera.pitch,
    playheadSeconds: Math.max(0, Math.min(current.durationSeconds, Number.isFinite(playheadSeconds) ? playheadSeconds : 0)),
    zoom: camera.zoom,
  })
}

let focus: CinemaShotFocus | null = null

export function publishCinemaShotFocus(next: CinemaShotFocus | null): void {
  if (focus === next) return
  if (focus && next && focus.kitId === next.kitId && focus.shotId === next.shotId && focus.locationIndex === next.locationIndex) return
  focus = next
  listeners.forEach(listener => listener())
}

export function readCinemaShotFocus(): CinemaShotFocus | null {
  return focus
}

export function subscribeCinemaShotFocus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
