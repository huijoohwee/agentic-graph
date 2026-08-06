import {
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
} from 'three'

import type { XrV2StoredCaptureFrame } from './xrV2CaptureArtifactStore'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import {
  createXrV2TemporalPlayhead,
  resolveXrV2TemporalDepthSequence,
  type XrV2TemporalFrameObservation,
} from './xrV2SavedAssetTemporalPlayback'

export type XrV2SavedAssetThreePresentation = Readonly<{
  geometry: PlaneGeometry
  material: MeshBasicMaterial
  texture: DataTexture
  depthDisplaced: true
  start(nowMs: number): XrV2TemporalFrameObservation | null
  advance(nowMs: number): XrV2TemporalFrameObservation | null
  readFrame(): XrV2TemporalFrameObservation | null
  stop(): void
  release(): void
}>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function textureBytes(frame: XrV2StoredCaptureFrame): Uint8Array {
  const rgba = new Uint8Array(frame.frame.data.length)
  rgba.set(frame.frame.data)
  return rgba
}

function displaceGeometry(
  geometry: PlaneGeometry,
  frame: XrV2StoredCaptureFrame,
  segmentsX: number,
  segmentsY: number,
): void {
  const depth = frame.estimate?.depth
  if (!depth) return
  const positions = geometry.getAttribute('position')
  for (let index = 0; index < positions.count; index += 1) {
    const column = index % (segmentsX + 1)
    const row = Math.floor(index / (segmentsX + 1))
    const depthX = Math.min(depth.width - 1, Math.round(column * (depth.width - 1) / segmentsX))
    const depthY = Math.min(depth.height - 1, Math.round(row * (depth.height - 1) / segmentsY))
    const rawDepth = depth.values[depthY * depth.width + depthX]
    const normalized = Number.isFinite(rawDepth) ? clamp(rawDepth, 0, 1) : 0.5
    positions.setZ(index, (0.5 - normalized) * 0.18)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
}

export function createXrV2SavedAssetThreePresentation(
  resource: XrV2SavedSpatialAssetResource,
): XrV2SavedAssetThreePresentation | null {
  const sequence = resolveXrV2TemporalDepthSequence(resource)
  if (!sequence) return null
  const first = sequence.frames[0]
  const maximumDepthWidth = Math.max(...sequence.frames.map(frame => frame.estimate?.depth.width || 1))
  const maximumDepthHeight = Math.max(...sequence.frames.map(frame => frame.estimate?.depth.height || 1))
  const segmentsX = Math.max(1, Math.min(63, maximumDepthWidth - 1))
  const segmentsY = Math.max(1, Math.min(63, maximumDepthHeight - 1))
  const width = 1.6
  const height = width * first.frame.height / first.frame.width
  const geometry = new PlaneGeometry(width, height, segmentsX, segmentsY)
  displaceGeometry(geometry, first, segmentsX, segmentsY)
  const texture = new DataTexture(textureBytes(first), first.frame.width, first.frame.height, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  const material = new MeshBasicMaterial({ map: texture, side: DoubleSide })
  const playhead = createXrV2TemporalPlayhead(sequence)
  let playing = false
  let released = false
  let current: XrV2TemporalFrameObservation = Object.freeze({
    frame: first,
    frameIndex: first.frameIndex,
    capturedAtMs: first.capturedAtMs,
    loop: 0,
  })
  const apply = (observation: XrV2TemporalFrameObservation) => {
    if (observation.frameIndex === current.frameIndex
      && observation.capturedAtMs === current.capturedAtMs) return
    current = observation
    const frame = observation.frame
    texture.image = {
      data: textureBytes(frame),
      width: frame.frame.width,
      height: frame.frame.height,
    }
    texture.needsUpdate = true
    displaceGeometry(geometry, frame, segmentsX, segmentsY)
  }
  return Object.freeze({
    geometry,
    material,
    texture,
    depthDisplaced: true,
    start: nowMs => {
      if (released || playing) return null
      const observation = playhead.start(nowMs)
      playing = observation !== null
      if (observation) apply(observation)
      return observation
    },
    advance: nowMs => {
      if (released || !playing) return null
      const observation = playhead.advance(nowMs)
      if (observation) apply(observation)
      return observation
    },
    readFrame: () => released ? null : current,
    stop: () => {
      playing = false
      playhead.stop()
    },
    release: () => {
      if (released) return
      playing = false
      released = true
      playhead.release()
    },
  })
}
