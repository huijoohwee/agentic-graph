import { useSyncExternalStore } from 'react'
import type { RunTrace } from './missionControlProjection'

export type AgentRunInspection = { trace: RunTrace; scope: string; expiresAt: number; spanId: string | null; search: string }
let snapshot: AgentRunInspection | null = null
let cleanup: (() => void) | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const emit = () => { for (const listener of listeners) listener() }
const read = () => snapshot
export const useAgentRunInspection = () => useSyncExternalStore(subscribe, read, () => null)

/** One explicit handoff, never a source file, persistent cache, credential or execution capability. */
export function closeAgentRunInspection(): void {
  cleanup?.(); cleanup = null; snapshot = null; emit()
}
export function openAgentRunInspection(input: AgentRunInspection): void {
  const expiresAt = Math.min(input.expiresAt, input.trace.expiresAt, input.trace.observedAt + 60_000, Date.now() + 60_000)
  const bytes = JSON.stringify(input)
  if (!input.scope || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || input.trace.spans.length > 32
    || new TextEncoder().encode(bytes).length > 262144) throw Error('Run inspection is unavailable or expired. Refresh its authorized snapshot.')
  closeAgentRunInspection()
  snapshot = { ...JSON.parse(bytes), expiresAt }
  const expire = () => { if (snapshot && snapshot.expiresAt <= Date.now()) closeAgentRunInspection() }
  const timer = window.setTimeout(expire, expiresAt - Date.now())
  window.addEventListener('agentic-os:authority-change', closeAgentRunInspection)
  window.addEventListener('pagehide', closeAgentRunInspection)
  document.addEventListener('visibilitychange', expire)
  cleanup = () => {
    window.clearTimeout(timer)
    window.removeEventListener('agentic-os:authority-change', closeAgentRunInspection)
    window.removeEventListener('pagehide', closeAgentRunInspection)
    document.removeEventListener('visibilitychange', expire)
  }
  emit()
}
export function selectAgentRunInspection(spanId: string | null): void {
  if (!snapshot) return
  if (snapshot.expiresAt <= Date.now()) return closeAgentRunInspection()
  if (spanId !== null && !snapshot.trace.spans.some(span => span.spanId === spanId)) return
  snapshot = { ...snapshot, spanId }; emit()
}
export function filterAgentRunInspection(search: string): void {
  if (!snapshot) return
  if (snapshot.expiresAt <= Date.now()) return closeAgentRunInspection()
  snapshot = { ...snapshot, search: search.slice(0, 256) }; emit()
}
