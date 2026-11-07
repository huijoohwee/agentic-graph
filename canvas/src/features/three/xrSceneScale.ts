/** Convert a metric stage footprint to the shared preview span. */
export function resolveXrStageFitScale(
  sizeMeters: readonly [number, number],
  displaySpan: number,
): number {
  const stageExtent = Math.max(sizeMeters[0], sizeMeters[1], 1)
  return Number.isFinite(displaySpan) && displaySpan > 0 && Number.isFinite(stageExtent)
    ? displaySpan / stageExtent
    : 1
}
