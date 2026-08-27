import { useGraphStore } from '@/hooks/useGraphStore'

type GraphDataTableSelectionPerfDetail = {
  subscriber: 'graphDataTable'
  durationMs: number
  ts: number
}

type GraphDataTableSelectionPerfEvent = CustomEvent<GraphDataTableSelectionPerfDetail>

const samples: { durationMs: number; ts: number }[] = []
let listener: ((event: Event) => void) | null = null
let sumMs = 0
let maxMs = 0
let version = 0
let cachedVersion = -1
let cachedSummary: { count: number; avgMs: number; p95Ms: number; maxMs: number } = {
  count: 0,
  avgMs: 0,
  p95Ms: 0,
  maxMs: 0,
}

export const initGraphDataTablePerfHarness = () => {
  const g = globalThis as unknown as Window & typeof globalThis
  const state = useGraphStore.getState()
  if (state.setGraphDataTableVirtualDebugLogRanges) {
    state.setGraphDataTableVirtualDebugLogRanges(true)
  }
  const anyWindow = g as unknown as { __AG_SELECTION_PERF_ENABLED__?: boolean }
  anyWindow.__AG_SELECTION_PERF_ENABLED__ = true
  if (listener && g.removeEventListener) {
    g.removeEventListener('kg-selection-perf', listener as EventListener)
  }
  samples.length = 0
  sumMs = 0
  maxMs = 0
  version = 0
  cachedVersion = -1
  listener = (event: Event) => {
    const e = event as GraphDataTableSelectionPerfEvent
    const detail = e.detail
    if (!detail || typeof detail.durationMs !== 'number' || detail.subscriber !== 'graphDataTable') return
    samples.push({ durationMs: detail.durationMs, ts: detail.ts })
    sumMs += detail.durationMs
    if (detail.durationMs > maxMs) maxMs = detail.durationMs
    version++
  }
  if (g.addEventListener && listener) {
    g.addEventListener('kg-selection-perf', listener as EventListener)
  }
}

export const readGraphDataTablePerfHarness = () => {
  if (samples.length === 0) return cachedSummary
  if (version === cachedVersion) return cachedSummary

  const count = samples.length
  const avgMs = sumMs / count
  const sorted = samples.map(s => s.durationMs).sort((a, b) => a - b)
  const p95Index = Math.floor(0.95 * (count - 1))
  const p95Ms = sorted[p95Index] ?? sorted[count - 1]

  cachedSummary = { count, avgMs, p95Ms, maxMs }
  cachedVersion = version
  return cachedSummary
}

