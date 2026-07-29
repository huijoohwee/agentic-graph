import type { FlightGeoOverlaySnapshot } from '../../flightGeoOverlay.js'

export function clearFlightGeoPresentationDebug(root: HTMLElement): void {
  for (const key of Object.keys(root.dataset)) {
    if (
      key.startsWith('kgFlightGeospatialPresentation')
      || key.startsWith('kgFlightGeospatialStopped')
      || key === 'kgFlightGeospatialPresentedRevision'
    ) delete root.dataset[key]
  }
}

export function writeFlightGeoPresentationDebug(
  root: HTMLElement,
  overlay: FlightGeoOverlaySnapshot,
  attempts: number,
): void {
  const sameStoppedPresentation = (
    root.dataset.kgFlightGeospatialStoppedProfileId === overlay.profileId
    && root.dataset.kgFlightGeospatialStoppedRevision === overlay.revision
    && root.dataset.kgFlightGeospatialStoppedRunId === String(overlay.runId)
  )
  // Cleanup clears inactive roots. If a different stopped identity arrives,
  // start a new pre-Start record without erasing the same settled request as
  // it receives harmless MapLibre re-applies.
  if (overlay.phase === 'stopped' && !sameStoppedPresentation) {
    clearFlightGeoPresentationDebug(root)
  }
  root.dataset.kgFlightGeospatialPresentationPhase = overlay.phase
  root.dataset.kgFlightGeospatialPresentationRequest = String(
    overlay.readyFrameRequestId ?? '',
  )
  root.dataset.kgFlightGeospatialPresentationRevision = overlay.revision
  root.dataset.kgFlightGeospatialRenderAttempts = String(attempts)
}

export function recordFlightGeoStoppedPresentation(
  root: HTMLElement,
  overlay: FlightGeoOverlaySnapshot,
): void {
  root.dataset.kgFlightGeospatialStoppedEnvironmentLoaded = '1'
  root.dataset.kgFlightGeospatialStoppedOverlayLoaded = '1'
  root.dataset.kgFlightGeospatialStoppedProfileId = overlay.profileId
  root.dataset.kgFlightGeospatialStoppedRevision = overlay.revision
  root.dataset.kgFlightGeospatialStoppedRunId = String(overlay.runId)
}
