import {
  createWorkspaceDecisionStore,
  type WorkspaceDecisionStoreSnapshot,
} from '@/features/workspace-fs/workspaceDecisionStore'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { GameFpsDecisionRecord } from './gameFpsModel'
import { validateGameFpsDecisions } from './gameFpsMission'

export type { GameFpsDecisionRecord } from './gameFpsModel'

export const GAME_FPS_SAVE_PATH = normalizeWorkspacePath('/game-fps/mission-1-decisions.md')

export type GameFpsDecisionStoreSnapshot = WorkspaceDecisionStoreSnapshot

const gameFpsDecisionStore = createWorkspaceDecisionStore<GameFpsDecisionRecord>({
  savePath: GAME_FPS_SAVE_PATH,
  title: 'Knowgrph FPS Mission 1 Decisions',
  body: [
    '# Mission 1 Decisions',
    '',
    'Only validated `EcsDecision` nodes are persisted in this document.',
  ].join('\n'),
  validateDecisions: validateGameFpsDecisions,
})

export function readGameFpsDecisionStore(): GameFpsDecisionStoreSnapshot {
  return gameFpsDecisionStore.read()
}

export function subscribeGameFpsDecisionStore(listener: () => void): () => void {
  return gameFpsDecisionStore.subscribe(listener)
}

export function reportGameFpsDecisionLoadFailure(error: unknown): GameFpsDecisionStoreSnapshot {
  return gameFpsDecisionStore.reportLoadFailure(error)
}

export function queueGameFpsDecisions(decisions: readonly GameFpsDecisionRecord[]): void {
  gameFpsDecisionStore.queue(decisions)
}

export async function loadGameFpsSavedDecisions(
  options: { workspace?: WorkspaceFs } = {},
): Promise<GameFpsDecisionRecord[]> {
  return gameFpsDecisionStore.load(options)
}

export function resetGameFpsLocalSave(
  options: { workspace?: WorkspaceFs } = {},
): Promise<GameFpsDecisionStoreSnapshot> {
  return gameFpsDecisionStore.reset(options)
}

export function persistPendingGameFpsDecisions(
  options: { workspace?: WorkspaceFs } = {},
): Promise<GameFpsDecisionStoreSnapshot> {
  return gameFpsDecisionStore.persistPending(options)
}

export function resetGameFpsDecisionStoreForTests(): void {
  gameFpsDecisionStore.resetForTests()
}
