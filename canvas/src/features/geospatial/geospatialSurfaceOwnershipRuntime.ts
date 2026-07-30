import { importGympgrph } from '@/features/geospatial/gympgrphBridge'
import { commitCanvasGeospatialModeEnabled } from '@/features/geospatial/geospatialModeCommit'

// A cold MapLibre owner can finish mounting while a shared XR handoff is in
// progress. Keep the handoff bounded and wait for the owned map to release
// before another exclusive canvas claims the viewport.
export const GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS = 2_000
const STABLE_RELEASE_FRAME_COUNT = 2
let geospatialSurfaceOwnershipTail: Promise<void> = Promise.resolve()

export type CanvasGeospatialSurfaceOwnershipOptions = Readonly<{
  afterCommit?: () => boolean | void | Promise<boolean | void>
  isCurrent?: () => boolean
  waitFor?: Promise<void>
}>

class SupersededGeospatialSurfaceOwnershipError extends Error {
  constructor() {
    super('The Geo surface ownership request was superseded.')
    this.name = 'SupersededGeospatialSurfaceOwnershipError'
  }
}

export class GeospatialSurfaceOwnershipRestorationError extends Error {
  constructor(ownershipFailure: string, restorationFailure: string) {
    super(
      `${ownershipFailure} Prior Geo ownership could not be restored: ${restorationFailure}`,
    )
    this.name = 'GeospatialSurfaceOwnershipRestorationError'
  }
}

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

async function waitForFlightSourceSettlement(
  ownedLease: Readonly<{
    isCurrent: () => boolean
    isPreparedForDisposal: () => boolean
    prepareForDisposal: () => boolean
  }> | null,
  deadline: number,
  isRequestCurrent: () => boolean,
): Promise<void> {
  if (
    !ownedLease
    || typeof window === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  const timeoutMessage =
    'MapLibre Flight sources did not settle before the exclusive Canvas handoff.'
  while (ownedLease.isCurrent()) {
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    try {
      if (ownedLease.isPreparedForDisposal()) return
    } catch {
      throw new Error(timeoutMessage)
    }
    await waitForSurfaceFrame(deadline, timeoutMessage)
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    if (!ownedLease.isCurrent()) return
    try {
      if (ownedLease.isPreparedForDisposal()) return
      if (ownedLease.prepareForDisposal() !== true) {
        throw new Error(timeoutMessage)
      }
    } catch {
      throw new Error(timeoutMessage)
    }
  }
}

async function prepareMapLibreForExclusiveCanvas(
  ownedLease: Readonly<{
    isCurrent: () => boolean
    isPreparedForDisposal: () => boolean
    prepareForDisposal: () => boolean
  }> | null,
  deadline: number,
  isRequestCurrent: () => boolean,
): Promise<void> {
  if (!ownedLease) return
  // Flight remains active while the first source clear settles. Re-clear once
  // more before committing Geo off so a concurrent overlay publication cannot
  // survive into the exclusive City canvas.
  for (let pass = 0; pass < 2 && ownedLease.isCurrent(); pass += 1) {
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    if (ownedLease.prepareForDisposal() !== true) {
      throw new Error(
        'MapLibre Flight sources could not be cleared before the exclusive Canvas handoff.',
      )
    }
    await waitForFlightSourceSettlement(
      ownedLease,
      deadline,
      isRequestCurrent,
    )
  }
}

async function waitForGeospatialSurfaceDisposal(
  ownedLease: Readonly<{ isCurrent: () => boolean }> | null,
  ownedCanvas: HTMLCanvasElement | null,
  deadline: number,
  isRequestCurrent: () => boolean,
): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  let stableFrames = 0
  while (Date.now() <= deadline) {
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    await waitForSurfaceFrame(
      deadline,
      'MapLibre did not release the restored non-Geo Canvas surface.',
    )
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
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
async function performCanvasGeospatialSurfaceOwnershipCommit(
  enabled: boolean,
  options: CanvasGeospatialSurfaceOwnershipOptions,
): Promise<void> {
  await options.waitFor
  const isRequestCurrent = () => options.isCurrent?.() !== false
  if (!isRequestCurrent()) return
  const gympgrph = await importGympgrph()
  if (!isRequestCurrent()) return
  const previousEnabled = typeof gympgrph.isGeospatialModeEnabled === 'function'
    ? Boolean(gympgrph.isGeospatialModeEnabled())
    : !enabled
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
  let modeCommitted = false
  try {
    if (!enabled) {
      while (true) {
        const preparedLease = ownedLease
        if (preparedLease) preparedLeases.add(preparedLease)
        await prepareMapLibreForExclusiveCanvas(
          preparedLease,
          deadline,
          isRequestCurrent,
        )
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
    if (!isRequestCurrent()) {
      for (const preparedLease of preparedLeases) {
        preparedLease.cancelDisposalPreparation()
      }
      return
    }
    const committed = await commitCanvasGeospatialModeEnabled(enabled)
    if (committed !== enabled) {
      throw new Error(`Geo mode committed ${String(committed)} instead of ${String(enabled)}.`)
    }
    modeCommitted = true
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    if (!enabled) {
      await waitForGeospatialSurfaceDisposal(
        ownedLease,
        ownedCanvas,
        deadline,
        isRequestCurrent,
      )
    }
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
    const presentationCommitted = await options.afterCommit?.()
    if (presentationCommitted === false) {
      throw new Error('The requested Canvas surface could not claim ownership.')
    }
    if (!isRequestCurrent()) {
      throw new SupersededGeospatialSurfaceOwnershipError()
    }
  } catch (error) {
    for (const preparedLease of preparedLeases) {
      preparedLease.cancelDisposalPreparation()
    }
    if (modeCommitted) {
      try {
        const restored =
          await commitCanvasGeospatialModeEnabled(previousEnabled)
        if (restored !== previousEnabled) {
          throw new Error(
            `Geo mode restored ${String(restored)} instead of ${String(previousEnabled)}.`,
          )
        }
      } catch (restorationError) {
        const failure = error instanceof Error ? error.message : String(error)
        const restorationFailure = restorationError instanceof Error
          ? restorationError.message
          : String(restorationError)
        throw new GeospatialSurfaceOwnershipRestorationError(
          failure,
          restorationFailure,
        )
      }
    }
    if (error instanceof SupersededGeospatialSurfaceOwnershipError) return
    throw error
  }
}

export function commitCanvasGeospatialSurfaceOwnership(
  enabled: boolean,
  options: CanvasGeospatialSurfaceOwnershipOptions = {},
): Promise<void> {
  const operation = geospatialSurfaceOwnershipTail.then(() => (
    performCanvasGeospatialSurfaceOwnershipCommit(enabled, options)
  ))
  // A failed owner remains visible to its caller but cannot poison every later
  // recovery attempt queued through the canonical surface owner.
  geospatialSurfaceOwnershipTail = operation.catch(() => undefined)
  return operation
}
