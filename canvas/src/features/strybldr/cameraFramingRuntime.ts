import {
  readStrybldrCameraSettings,
  type StrybldrCameraSettings,
} from '@/features/strybldr/strybldrCamera'

export type CameraFramingRuntimeSource = 'document' | 'panel' | 'canvas' | 'axis'

export type CameraFramingRuntimeSnapshot = Readonly<{
  anchorId: string
  claimed: boolean
  settings: Readonly<StrybldrCameraSettings>
  source: CameraFramingRuntimeSource
  revision: number
}>

export type CameraFramingRuntimePublish = {
  anchorId: unknown
  settings: unknown
  source: CameraFramingRuntimeSource
}

type CameraFramingRuntimeListener = () => void

const CAMERA_FRAMING_RUNTIME_SOURCES = new Set<CameraFramingRuntimeSource>([
  'document',
  'panel',
  'canvas',
  'axis',
])

const listeners = new Set<CameraFramingRuntimeListener>()
const SHARED_CANVAS_CAMERA_ANCHOR_ID = 'canvas-camera'
let activeDocumentKey = ''

function normalizeAnchorId(value: unknown): string {
  try {
    return String(value ?? '').trim()
  } catch {
    return ''
  }
}

function normalizeSource(value: unknown): CameraFramingRuntimeSource {
  return CAMERA_FRAMING_RUNTIME_SOURCES.has(value as CameraFramingRuntimeSource)
    ? value as CameraFramingRuntimeSource
    : 'document'
}

function normalizeSettings(value: unknown): Readonly<StrybldrCameraSettings> {
  let settings: StrybldrCameraSettings
  try {
    settings = readStrybldrCameraSettings(value)
  } catch {
    settings = readStrybldrCameraSettings(null)
  }
  return Object.freeze({ ...settings })
}

function createSnapshot(args: {
  anchorId: unknown
  claimed: unknown
  settings: unknown
  source: unknown
  revision: number
}): CameraFramingRuntimeSnapshot {
  return Object.freeze({
    anchorId: normalizeAnchorId(args.anchorId),
    claimed: args.claimed === true,
    settings: normalizeSettings(args.settings),
    source: normalizeSource(args.source),
    revision: args.revision,
  })
}

function settingsEqual(
  left: Readonly<StrybldrCameraSettings>,
  right: Readonly<StrybldrCameraSettings>,
): boolean {
  return left.angle === right.angle
    && left.level === right.level
    && left.shot === right.shot
    && left.note === right.note
    && left.orbitX === right.orbitX
    && left.orbitY === right.orbitY
    && left.sensorId === right.sensorId
    && left.focalLengthMm === right.focalLengthMm
    && left.focusDistanceMeters === right.focusDistanceMeters
    && left.aspectRatio === right.aspectRatio
}

let snapshot = createSnapshot({
  anchorId: '',
  claimed: false,
  settings: null,
  source: 'document',
  revision: 0,
})

export function readCameraFramingRuntime(): CameraFramingRuntimeSnapshot {
  return snapshot
}

export function readCameraFramingRuntimeDocumentKey(): string {
  return activeDocumentKey
}

export function resetCameraFramingRuntimeForDocument(documentKeyValue: unknown): CameraFramingRuntimeSnapshot {
  const documentKey = normalizeAnchorId(documentKeyValue)
  if (documentKey === activeDocumentKey) return snapshot
  activeDocumentKey = documentKey
  snapshot = createSnapshot({
    anchorId: SHARED_CANVAS_CAMERA_ANCHOR_ID,
    claimed: false,
    settings: null,
    source: 'document',
    revision: snapshot.revision + 1,
  })
  for (const listener of [...listeners]) listener()
  return snapshot
}

export function publishCameraFramingRuntime(
  value: CameraFramingRuntimePublish,
): CameraFramingRuntimeSnapshot {
  const candidate = createSnapshot({
    anchorId: value.anchorId,
    claimed: true,
    settings: value.settings,
    source: value.source,
    revision: snapshot.revision + 1,
  })
  if (
    candidate.anchorId === snapshot.anchorId
    && candidate.claimed === snapshot.claimed
    && candidate.source === snapshot.source
    && settingsEqual(candidate.settings, snapshot.settings)
  ) {
    return snapshot
  }
  snapshot = candidate
  for (const listener of [...listeners]) listener()
  return snapshot
}

export function subscribeCameraFramingRuntime(
  listener: CameraFramingRuntimeListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
