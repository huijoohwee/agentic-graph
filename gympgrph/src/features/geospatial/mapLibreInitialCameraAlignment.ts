import {
  alignMapToSingaporePresentation,
  type SingaporeMapCameraPolicy,
} from './singaporeMapPolicy.js'

type FrameScheduler = (callback: () => void) => unknown

export type MapLibreInitialCameraAlignmentOptions = Readonly<{
  canvasRenderMode: '2d' | '3d'
  // This must be read at each load/resize/rAF boundary. A Flight bootstrap
  // can claim the already-mounted map while its initial provider style is
  // still loading, so a construction-time boolean would be stale.
  flightBootstrapActive: () => boolean
  isCurrent: () => boolean
  map: () => any | null
  requestFrame?: FrameScheduler
  singaporeCamera: SingaporeMapCameraPolicy
}>

/**
 * The generic Singapore camera belongs to a non-Flight map's first paint.
 * Flight's bootstrap owns the camera from creation through stopped staging, so
 * it must never be realigned by a late load, resize, or queued frame.
 */
export function createMapLibreInitialCameraAlignment(
  options: MapLibreInitialCameraAlignmentOptions,
): () => boolean {
  let aligned = false

  return () => {
    if (
      aligned
      || options.flightBootstrapActive()
      || options.canvasRenderMode !== '3d'
      || !options.isCurrent()
    ) return false
    const map = options.map()
    if (!map) return false
    aligned = true
    const applied = alignMapToSingaporePresentation(map, options.singaporeCamera)
    const requestFrame = options.requestFrame
    if (!applied || !requestFrame) return applied
    requestFrame(() => {
      if (
        options.flightBootstrapActive()
        || !options.isCurrent()
        || options.map() !== map
      ) return
      alignMapToSingaporePresentation(map, options.singaporeCamera)
    })
    return true
  }
}
