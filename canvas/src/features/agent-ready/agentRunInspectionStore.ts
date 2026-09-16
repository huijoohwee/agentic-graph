import { useSyncExternalStore } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { RunTrace } from './missionControlProjection'
import { AGENT_RUN_CANVAS_VIEWS, parseCanvasViewInvocation } from '@/lib/canvas/canvasViewInvocationContract.mjs'

export type AgentRunView = Extract<keyof typeof AGENT_RUN_CANVAS_VIEWS, string>
export type AgentRunInspection = { trace: RunTrace; scope: string; expiresAt: number; spanId: string | null; search: string; view: AgentRunView }
let snapshot: AgentRunInspection | null = null
let workspace: { view: AgentRunView } | null = null
let cleanup: (() => void) | null = null
let restoreView: (() => void) | null = null
let timer: number | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const emit = () => { for (const listener of listeners) listener() }
const read = () => snapshot
export const useAgentRunInspection = () => useSyncExternalStore(subscribe, read, () => null)
export const useAgentRunWorkspace = () => useSyncExternalStore(subscribe, () => workspace, () => null)

/** Explicit entry can discover runs without holding private evidence or executing work. */
export function activateAgentRunWorkspace(view: AgentRunView = 'topology', surface: 'editor' | 'canvas' = 'canvas'): void {
  if (!Object.hasOwn(AGENT_RUN_CANVAS_VIEWS, view)) return
  if (!workspace) {
    const state = useGraphStore.getState()
    const previous = { mode: state.workspaceViewMode, paneOpen: state.workspaceCanvasPaneOpen }
    restoreView = () => useGraphStore.getState().setWorkspaceViewState(previous)
    listenForRevocation()
  }
  workspace = { view }
  if (snapshot) snapshot = { ...snapshot, view }
  useGraphStore.getState().setWorkspaceViewState({ mode: surface,
    paneOpen: surface === 'editor' && !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches })
  emit()
}
function listenForRevocation() {
  const expire = () => { if (snapshot && snapshot.expiresAt <= Date.now()) closeAgentRunInspection() }
  window.addEventListener('agentic-os:authority-change', closeAgentRunInspection)
  window.addEventListener('pagehide', closeAgentRunInspection)
  document.addEventListener('visibilitychange', expire)
  cleanup = () => {
    window.clearTimeout(timer)
    window.removeEventListener('agentic-os:authority-change', closeAgentRunInspection)
    window.removeEventListener('pagehide', closeAgentRunInspection)
    document.removeEventListener('visibilitychange', expire)
  }
}

/** One explicit handoff, never a source file, persistent cache, credential or execution capability. */
export function closeAgentRunInspection(): void {
  cleanup?.(); cleanup = null; snapshot = null; workspace = null
  const restore = restoreView; restoreView = null; restore?.(); emit()
}
function validated(input: Omit<AgentRunInspection, 'view'> & { view?: AgentRunView }): AgentRunInspection {
  const expiresAt = Math.min(input.expiresAt, input.trace.expiresAt, input.trace.observedAt + 60_000, Date.now() + 60_000)
  const bytes = JSON.stringify(input)
  if (!input.scope || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || input.trace.spans.length > 32
    || new TextEncoder().encode(bytes).length > 262144) throw Error('Run inspection is unavailable or expired. Refresh its authorized snapshot.')
  return { ...JSON.parse(bytes), expiresAt, view: input.view ?? 'topology' }
}
function scheduleExpiry() {
  window.clearTimeout(timer)
  if (snapshot) timer = window.setTimeout(closeAgentRunInspection, Math.max(0, snapshot.expiresAt - Date.now()))
}
export function openAgentRunInspection(input: Omit<AgentRunInspection, 'view'> & { view?: AgentRunView }, onClose?: () => void): void {
  const value = validated(input)
  if (!workspace) {
    closeAgentRunInspection(); workspace = { view: value.view }
    restoreView = onClose ?? null; listenForRevocation()
  }
  snapshot = { ...value, view: input.view ?? workspace.view }
  workspace = { view: snapshot.view }
  scheduleExpiry()
  emit()
}
/** A fresh authenticated read may renew the active handoff; a response cannot reopen it. */
export function updateAgentRunInspection(input: Pick<AgentRunInspection, 'trace' | 'scope' | 'expiresAt' | 'spanId'>): void {
  if (!workspace) return
  if (!snapshot) {
    snapshot = validated({ ...input, search: '', view: workspace.view })
    scheduleExpiry(); emit(); return
  }
  if (snapshot.scope !== input.scope || snapshot.expiresAt <= Date.now()) return closeAgentRunInspection()
  if (input.trace.runId === snapshot.trace.runId && input.trace.observedAt < snapshot.trace.observedAt) return
  snapshot = validated({ ...snapshot, ...input }); scheduleExpiry(); emit()
}
export function selectAgentRunView(view: string): void {
  if (!workspace || !Object.hasOwn(AGENT_RUN_CANVAS_VIEWS, view)) return
  if (snapshot && snapshot.expiresAt <= Date.now()) return closeAgentRunInspection()
  workspace = { view: view as AgentRunView }
  if (snapshot) snapshot = { ...snapshot, view: view as AgentRunView }
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

/** Shared explicit preset/Chat entry; malformed or unrelated options never execute. */
export function activateAgentRunPrompt(prompt: string): void {
  const { optionId } = parseCanvasViewInvocation(prompt)
  if (!optionId.startsWith('agent-run:')) throw Error('Choose an agent observability view.')
  activateAgentRunWorkspace(optionId.slice('agent-run:'.length) as AgentRunView)
}
