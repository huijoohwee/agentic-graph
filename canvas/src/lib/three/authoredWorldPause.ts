export function resolveAuthoredWorldPaused(paused: boolean, gameplayOverlayActive: boolean): boolean {
  return paused || gameplayOverlayActive
}
