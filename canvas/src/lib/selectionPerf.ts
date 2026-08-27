export type SelectionPerfSubscriber = 'canvas' | 'three' | 'nodeEditor' | 'graphDataTable'

export type SelectionPerfWindow = Window & { __AG_SELECTION_PERF_ENABLED__?: boolean }

export type SelectionPerfDetail = {
  subscriber: SelectionPerfSubscriber
  durationMs: number
  ts: number
}

export function setSelectionPerfEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  const anyWindow = window as SelectionPerfWindow
  anyWindow.__AG_SELECTION_PERF_ENABLED__ = enabled
}

export function selectionPerfStart(): number | null {
  if (typeof window === 'undefined') return null
  const anyWindow = window as SelectionPerfWindow
  if (!anyWindow.__AG_SELECTION_PERF_ENABLED__) return null
  return performance.now()
}

export function selectionPerfEnd(
  subscriber: SelectionPerfSubscriber,
  t0: number | null,
): void {
  if (t0 == null) return
  if (typeof window === 'undefined') return
  const anyWindow = window as SelectionPerfWindow
  if (!anyWindow.__AG_SELECTION_PERF_ENABLED__) return
  try {
    const durationMs = performance.now() - t0
    const event = new CustomEvent<SelectionPerfDetail>('kg-selection-perf', {
      detail: { subscriber, durationMs, ts: performance.now() },
    })
    window.dispatchEvent(event)
  } catch {
    void 0
  }
}

