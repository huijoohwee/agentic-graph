import { importGympgrph } from '@/features/geospatial/gympgrphBridge'
import { commitCanvasGeospatialModeEnabled } from '@/features/geospatial/geospatialModeCommit'

// A cold MapLibre owner can finish mounting while a shared XR handoff is in
// progress. Keep the handoff bounded and wait for the owned map to release
// before another exclusive canvas claims the viewport.
export const GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS = 2_000
const STABLE_RELEASE_FRAME_COUNT = 2

function waitForSurfaceFrame(deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      reject(new Error('MapLibre did not release the restored non-Geo Canvas surface.'))
      return
    }
    let settled = false
    let frameId = 0
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
      reject(new Error('MapLibre did not release the restored non-Geo Canvas surface.'))
    }, remainingMs)
    frameId = window.requestAnimationFrame(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    })
  })
}

async function waitForGeospatialSurfaceDisposal(
  ownedLease: Readonly<{ isCurrent: () => boolean }> | null,
  ownedCanvas: HTMLCanvasElement | null,
): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  const deadline = Date.now() + GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS
  let stableFrames = 0
  while (Date.now() <= deadline) {
    await waitForSurfaceFrame(deadline)
    const mapReleased = ownedLease == null || !ownedLease.isCurrent()
    const ownedCanvasReleased = ownedCanvas == null || !ownedCanvas.isConnected
    const geoCanvasReleased = document.querySelector(
      '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
    ) == null
    if (mapReleased && ownedCanvasReleased && geoCanvasReleased) {
      stableFrames += 1
      if (stableFrames >= STABLE_RELEASE_FRAME_COUNT) return
    } else {
      stableFrames = 0
    }
  }
  throw new Error('MapLibre did not release the restored non-Geo Canvas surface.')
}

/**
 * Commit the event-driven Geo owner, then await disposal when turning it off.
 * Consumers use this for exclusive Canvas handoffs without duplicating
 * MapLibre lease and frame-fencing behavior.
 */
export async function commitCanvasGeospatialSurfaceOwnership(
  enabled: boolean,
): Promise<void> {
  const gympgrph = await importGympgrph()
  const ownedLease = gympgrph.captureNativeGeospatialMapLibreLease?.() ?? null
  const ownedCanvas = ownedLease?.canvas ?? (
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLCanvasElement>(
          '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
        )
  )
  const committed = await commitCanvasGeospatialModeEnabled(enabled)
  if (committed !== enabled) {
    throw new Error(`Geo mode committed ${String(committed)} instead of ${String(enabled)}.`)
  }
  if (!enabled) {
    await waitForGeospatialSurfaceDisposal(ownedLease, ownedCanvas)
  }
}
