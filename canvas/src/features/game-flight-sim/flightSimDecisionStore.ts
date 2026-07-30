import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  createWorkspaceDecisionStore,
  type WorkspaceDecisionStoreSnapshot,
} from '@/features/workspace-fs/workspaceDecisionStore'
import {
  type FlightSimDecisionRecord,
  validateFlightSimDecisions,
} from './flightSimModel'

export type { FlightSimDecisionRecord } from './flightSimModel'

export const FLIGHT_SIM_SAVE_PATH = normalizeWorkspacePath(
  '/game-flight-sim/mission-1-decisions.md',
)

export type FlightSimDecisionStoreSnapshot = WorkspaceDecisionStoreSnapshot
export type FlightSimEffectiveSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'pending'

export function resolveFlightSimEffectiveSaveStatus(
  storeStatus: FlightSimDecisionStoreSnapshot['status'],
  pendingDecisionCount: number,
): FlightSimEffectiveSaveStatus {
  if (storeStatus === 'saving' || storeStatus === 'error') return storeStatus
  if (pendingDecisionCount > 0) return 'pending'
  return storeStatus
}

const flightSimDecisionStore = createWorkspaceDecisionStore<FlightSimDecisionRecord>({
  savePath: FLIGHT_SIM_SAVE_PATH,
  title: 'Knowgrph Flight Sim Mission 1 Decisions',
  body: [
    '# Flight Sim Mission 1 Decisions',
    '',
    'Only validated `EcsDecision` nodes are persisted in this document.',
  ].join('\n'),
  validateDecisions: validateFlightSimDecisions,
  validatePendingDecisions: validateFlightSimDecisions,
})

export function readFlightSimDecisionStore(): FlightSimDecisionStoreSnapshot {
  return flightSimDecisionStore.read()
}

export function subscribeFlightSimDecisionStore(listener: () => void): () => void {
  return flightSimDecisionStore.subscribe(listener)
}

export function reportFlightSimDecisionLoadFailure(error: unknown): FlightSimDecisionStoreSnapshot {
  return flightSimDecisionStore.reportLoadFailure(error)
}

export function queueFlightSimDecisions(decisions: readonly FlightSimDecisionRecord[]): void {
  flightSimDecisionStore.queue(decisions)
}

export function loadFlightSimSavedDecisions(
  options: { workspace?: WorkspaceFs; signal?: AbortSignal } = {},
): Promise<FlightSimDecisionRecord[]> {
  return flightSimDecisionStore.load(options)
}

export function resetFlightSimLocalSave(
  options: { workspace?: WorkspaceFs; signal?: AbortSignal } = {},
): Promise<FlightSimDecisionStoreSnapshot> {
  return flightSimDecisionStore.reset(options)
}

export function persistPendingFlightSimDecisions(
  options: { workspace?: WorkspaceFs; signal?: AbortSignal } = {},
): Promise<FlightSimDecisionStoreSnapshot> {
  return flightSimDecisionStore.persistPending(options)
}

export function resetFlightSimDecisionStoreForTests(): void {
  flightSimDecisionStore.resetForTests()
}
