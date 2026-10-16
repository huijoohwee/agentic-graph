import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'

export type XrKitTimelineClock = Readonly<{ seconds: number; durationSeconds: number; phase: number }>
export type XrKitPolylineSample = Readonly<{ x: number; z: number; heading: number }>

const FALLBACK_DURATION_SECONDS = 12

/**
 * Kit motion is a pure function of the shared Timeline playhead, so scrubbing
 * and playback land on the same pose anywhere across the full duration.
 */
export function readXrKitTimelineClock(): XrKitTimelineClock {
  const runtime = readXrMotionReferenceRuntime()
  const duration = Number.isFinite(runtime.plan.durationSeconds) && runtime.plan.durationSeconds > 0
    ? runtime.plan.durationSeconds
    : FALLBACK_DURATION_SECONDS
  const seconds = Math.min(duration, Math.max(0, Number.isFinite(runtime.playheadSeconds) ? runtime.playheadSeconds : 0))
  return Object.freeze({ seconds, durationSeconds: duration, phase: seconds / duration })
}

/** Folds 0..1 into a there-and-back sweep (0 → 1 → 0). */
export function pingPongPhase(phase: number): number {
  const clamped = Math.min(1, Math.max(0, phase))
  return clamped <= 0.5 ? clamped * 2 : (1 - clamped) * 2
}

/** Samples an XZ polyline by arc length; heading follows the XR yaw convention (east = 0, z south). */
export function sampleXrKitPolyline(points: readonly (readonly [number, number])[], phase: number): XrKitPolylineSample {
  if (points.length === 0) return Object.freeze({ x: 0, z: 0, heading: 0 })
  if (points.length === 1) return Object.freeze({ x: points[0][0], z: points[0][1], heading: 0 })
  const lengths: number[] = []
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
    lengths.push(length)
    total += length
  }
  let remaining = Math.min(1, Math.max(0, phase)) * total
  for (let index = 0; index < lengths.length; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] > 0 ? Math.min(1, remaining / lengths[index]) : 0
      return Object.freeze({
        x: from[0] + (to[0] - from[0]) * t,
        z: from[1] + (to[1] - from[1]) * t,
        heading: Math.atan2(-(to[1] - from[1]), to[0] - from[0]),
      })
    }
    remaining -= lengths[index]
  }
  return Object.freeze({ x: points[0][0], z: points[0][1], heading: 0 })
}

/** Deterministic 0..1 pulse keyed by playhead seconds and a per-item seed. */
export function xrKitPulse(seconds: number, hertz: number, seed = 0): number {
  return 0.5 + 0.5 * Math.sin((seconds * hertz + seed) * Math.PI * 2)
}
