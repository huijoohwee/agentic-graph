import { createWorkspaceDecisionStore, type WorkspaceDecisionRecord } from '../workspace-fs/workspaceDecisionStore'
import type { WorkspaceFs } from '../workspace-fs/types'
import { digestLearningSource, type LearningRuntimeSnapshot } from './learningRuntime'
import { validLearningSnapshot, type LearningWorkerSnapshot } from './learningProtocol'
import { learningSceneDescriptor } from './learningLessons'
import { PYTHON_LIMITS, sourceBytes } from './pythonModel'

export const LEARNING_RECORD_ROOT = '/learning-debriefs'
export const LEARNING_RECORD_BYTES = 2 * 1024 * 1024
export type LearningDebrief = Readonly<{ schema: 'python-learning-debrief/v1'; source: string; result: LearningWorkerSnapshot; savedAt: string; hintStage: number }>
type Decision = WorkspaceDecisionRecord & { payload: LearningDebrief & Readonly<Record<string, unknown>> }
let persistedWorkspace: Promise<WorkspaceFs> | undefined
export function getLearningWorkspace(): Promise<WorkspaceFs> {
  persistedWorkspace ||= import('../workspace-fs/workspaceFsPersisted').then(({ createWorkspacePersistedFs }) => {
    const owner = createWorkspacePersistedFs()
    return asLearningLocalWorkspace(owner)
  }).catch(error => { persistedWorkspace = undefined; throw error })
  return persistedWorkspace
}
export function asLearningLocalWorkspace(owner: WorkspaceFs): WorkspaceFs {
    // Contract-only view over the native database: local root initialization, no seed refresh,
    // no host mirror and no volatile fallback. Failures propagate to the save/read caller.
    return { ...owner, ensureSeed: async () => { await owner.listEntries(); return false },
      writeFileText: (path, text) => owner.writeFileText(path, text, { mirrorToHost: false }),
      createFile: args => owner.createFile({ ...args, mirrorToHost: false }),
      createFolder: args => owner.createFolder({ ...args, mirrorToHost: false }),
      deleteEntry: path => owner.deleteEntry(path, { mirrorToHost: false }),
    }
}
export function validateDebrief(value: unknown): asserts value is LearningDebrief {
  const v = value as LearningDebrief
  if (!v || !Number.isInteger(v.hintStage) || v.hintStage < 0 || v.hintStage > 3 || v.schema !== 'python-learning-debrief/v1' || typeof v.source !== 'string' || sourceBytes(v.source) > PYTHON_LIMITS.sourceBytes
    || !validLearningSnapshot(v.result) || !['completed', 'failed'].includes(v.result.state) || !v.result.trace
    || typeof v.savedAt !== 'string' || !Number.isFinite(Date.parse(v.savedAt)) || sourceBytes(JSON.stringify(v)) > LEARNING_RECORD_BYTES) throw new Error('Invalid or oversized learning debrief.')
}
export async function parseLearningDebrief(text: string): Promise<LearningDebrief> {
  if (sourceBytes(text) > LEARNING_RECORD_BYTES) throw new Error('Import exceeds two MiB.')
  const value = JSON.parse(text); validateDebrief(value)
  if (await digestLearningSource(learningSceneDescriptor(value.result.identity.lessonId)) !== value.result.identity.sceneDigest) throw new Error('Debrief scene digest does not match this runtime.')
  if (await digestLearningSource(value.source) !== value.result.identity.sourceDigest) throw new Error('Debrief source digest does not match its source.')
  return value
}
export async function captureLearningDebrief(snapshot: LearningRuntimeSnapshot): Promise<LearningDebrief> {
  if (snapshot.stale || !snapshot.document || !snapshot.result || snapshot.error && snapshot.state !== 'failed'
    || snapshot.result.identity.documentId !== snapshot.document.documentId || !['completed', 'failed'].includes(snapshot.state)) throw new Error('Finish a current run before saving a debrief.')
  const value = { schema: 'python-learning-debrief/v1' as const, source: snapshot.document.source, result: snapshot.result, savedAt: new Date().toISOString(), hintStage: snapshot.hint }
  return parseLearningDebrief(JSON.stringify(value))
}
function decisionStore(id: string) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new Error('Invalid local run identifier.')
  return createWorkspaceDecisionStore<Decision>({ savePath: `${LEARNING_RECORD_ROOT}/${id}.md`, title: 'Python learning debrief',
    body: 'Local learning evidence. Imported records are observations and never execute source or prove a current result.',
    validateDecisions: records => {
      if (records.length > 1) throw new Error('A run file contains one immutable debrief.')
      records.forEach(record => {
        validateDebrief(record.payload)
        if (record.decisionId !== id || record.decisionType !== 'world_tick_result' || record.payload.result.identity.runId !== id
          || record.entityRef !== record.payload.result.identity.documentId) throw new Error('Debrief identity mismatch.')
      })
    },
  })
}
export async function saveLearningDebrief(debrief: LearningDebrief, signal: AbortSignal, workspace?: WorkspaceFs): Promise<string> {
  validateDebrief(debrief)
  const fs = workspace || await getLearningWorkspace(), store = decisionStore(debrief.result.identity.runId)
  if (signal.aborted) throw new Error('Save cancelled.')
  const existing = await store.load({ workspace: fs, signal })
  if (store.read().status === 'error') throw new Error(store.read().error || 'Stored debrief cannot be read.')
  if (existing.length) {
    if (JSON.stringify(existing[0].payload.result) !== JSON.stringify(debrief.result) || existing[0].payload.source !== debrief.source) throw new Error('A different debrief already occupies this run identifier.')
    return store.savePath
  }
  store.queue([{ decisionId: debrief.result.identity.runId, decisionType: 'world_tick_result', entityRef: debrief.result.identity.documentId, payload: debrief, producedAt: debrief.savedAt }])
  const saved = await store.persistPending({ workspace: fs, signal })
  if (saved.status !== 'saved') throw new Error(saved.error || 'Debrief was not saved.')
  return store.savePath
}
export async function loadLearningDebriefs(documentId: string, signal: AbortSignal, workspace?: WorkspaceFs): Promise<LearningDebrief[]> {
  const fs = workspace || await getLearningWorkspace()
  const entries = (await fs.listEntries()).filter(e => e.kind === 'file' && e.parentPath === LEARNING_RECORD_ROOT).sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 20)
  const results: LearningDebrief[] = []
  for (const entry of entries) {
    if (signal.aborted) throw new Error('Debrief read cancelled.')
    if (sourceBytes(entry.text || '') > LEARNING_RECORD_BYTES * 2) throw new Error('Stored debrief exceeds its document limit.')
    const store = decisionStore(entry.name.replace(/\.md$/, ''))
    const records = await store.load({ workspace: fs, signal })
    if (store.read().status === 'error') throw new Error(store.read().error || 'Stored debrief is unreadable.')
    for (const record of records) if (record.entityRef === documentId) results.push(await parseLearningDebrief(JSON.stringify(record.payload)))
  }
  return results
}
