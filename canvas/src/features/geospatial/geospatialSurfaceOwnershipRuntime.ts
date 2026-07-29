import { importGympgrph } from '@/features/geospatial/gympgrphBridge'
import { commitCanvasGeospatialModeEnabled } from '@/features/geospatial/geospatialModeCommit'

// A cold MapLibre owner can finish mounting while a shared XR handoff is in
// progress. Keep the handoff bounded and wait for the owned map to release
// before another exclusive canvas claims the viewport.
export const GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS = 2_000
const STABLE_RELEASE_FRAME_COUNT = 2

function waitForSurfaceFrame(
  deadline: number,
  timeoutMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      reject(new Error(timeoutMessage))
      return
    }
    let settled = false
    let frameId = 0
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
      reject(new Error(timeoutMessage))
    }, remainingMs)
    frameId = window.requestAnimationFrame(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    })
  })
}

async function waitForMapLibreStyleSettlement(
  ownedLease: Readonly<{
    isCurrent: () => boolean
    map: any
  }> | null,
  deadline: number,
): Promise<void> {
  if (
    !ownedLease
    || typeof window === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
    || typeof ownedLease.map?.isStyleLoaded !== 'function'
  ) return
  const timeoutMessage =
    'MapLibre style did not settle before the exclusive Canvas handoff.'
  while (ownedLease.isCurrent()) {
    try {
      if (ownedLease.map.isStyleLoaded() === true) return
    } catch {
      throw new Error(timeoutMessage)
    }
    await waitForSurfaceFrame(deadline, timeoutMessage)
  }
}

async function prepareMapLibreForExclusiveCanvas(
  ownedLease: Readonly<{
    isCurrent: () => boolean
    map: any
    prepareForDisposal: () => boolean
  }> | null,
  deadline: number,
): Promise<void> {
  if (!ownedLease) return
  await waitForMapLibreStyleSettlement(ownedLease, deadline)
  // Flight remains active while the first source clear settles. Re-clear once
  // more before committing Geo off so a concurrent overlay publication cannot
  // survive into the exclusive City canvas.
  for (let pass = 0; pass < 2 && ownedLease.isCurrent(); pass += 1) {
    if (ownedLease.prepareForDisposal() !== true) {
      throw new Error(
        'MapLibre Flight sources could not be cleared before the exclusive Canvas handoff.',
      )
    }
    await waitForMapLibreStyleSettlement(ownedLease, deadline)
  }
}

async function waitForGeospatialSurfaceDisposal(
  ownedLease: Readonly<{ isCurrent: () => boolean }> | null,
  ownedCanvas: HTMLCanvasElement | null,
  deadline: number,
): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  let stableFrames = 0
  while (Date.now() <= deadline) {
    await waitForSurfaceFrame(
      deadline,
      'MapLibre did not release the restored non-Geo Canvas surface.',
    )
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
  let ownedLease = gympgrph.captureNativeGeospatialMapLibreLease?.() ?? null
  let ownedCanvas = ownedLease?.canvas ?? (
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLCanvasElement>(
          '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
      )
  )
  const deadline = Date.now() + GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS
  const preparedLeases = new Set<NonNullable<typeof ownedLease>>()
  try {
    if (!enabled) {
      while (true) {
        const preparedLease = ownedLease
        if (preparedLease) preparedLeases.add(preparedLease)
        await prepareMapLibreForExclusiveCanvas(preparedLease, deadline)
        const latestLease =
          gympgrph.captureNativeGeospatialMapLibreLease?.() ?? null
        if (latestLease === preparedLease) break
        if (Date.now() >= deadline) {
          throw new Error(
            'MapLibre owner changed through the exclusive Canvas handoff deadline.',
          )
        }
        ownedLease = latestLease
        ownedCanvas = latestLease?.canvas ?? ownedCanvas
      }
    }
    const committed = await commitCanvasGeospatialModeEnabled(enabled)
    if (committed !== enabled) {
      throw new Error(`Geo mode committed ${String(committed)} instead of ${String(enabled)}.`)
    }
    if (!enabled) {
      await waitForGeospatialSurfaceDisposal(
        ownedLease,
        ownedCanvas,
        deadline,
      )
    }
  } catch (error) {
    for (const preparedLease of preparedLeases) {
      preparedLease.cancelDisposalPreparation()
    }
    throw error
  }
}
