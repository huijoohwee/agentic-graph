import {
  alignMapToSingaporePresentation,
  type SingaporeMapCameraPolicy,
} from './singaporeMapPolicy.js'

type FrameScheduler = (callback: () => void) => unknown

export type MapLibreInitialCameraAlignmentOptions = Readonly<{
  canvasRenderMode: '2d' | '3d'
  // This must be read at each load/resize/rAF boundary. Gameplay can claim an
  // already-mounted map while its presentation is still loading, so a
  // construction-time boolean would be stale.
  hasPresentationCameraClaim: () => boolean
  isCurrent: () => boolean
  map: () => any | null
  requestFrame?: FrameScheduler
  singaporeCamera: SingaporeMapCameraPolicy
}>

/**
 * The generic Singapore camera belongs only to an unclaimed map's first paint.
 * A gameplay presentation owns its authored camera from activation, so a late
 * load, resize, or queued frame must not overwrite City or Flight framing.
 */
export function createMapLibreInitialCameraAlignment(
  options: MapLibreInitialCameraAlignmentOptions,
): () => boolean {
  let aligned = false

  return () => {
    if (
      aligned
      || options.hasPresentationCameraClaim()
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
        options.hasPresentationCameraClaim()
        || !options.isCurrent()
        || options.map() !== map
      ) return
      alignMapToSingaporePresentation(map, options.singaporeCamera)
    })
    return true
  }
}
