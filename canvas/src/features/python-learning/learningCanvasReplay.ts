/** Animation timestamps may precede the effect's clock within the first frame. */
export function learningCanvasReplayTick(started: number, timestamp: number, first: number, last: number): number {
  return Math.min(last, first + Math.max(0, Math.floor((timestamp - started) * 60 / 1000)))
}
