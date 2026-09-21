import { PYTHON_LIMITS, PYTHON_RUNTIME_REVISION, pythonError, sourceBytes, type SourceSpan } from './pythonModel'
import { gradeLearningLesson, learningLesson, type LearningSceneSnapshot } from './learningLessons'
import type { ExecutionMetrics } from './pythonEvaluator'

export type LearningRunIdentity = Readonly<{
  runId: string; generation: number; workspaceId: string; documentId: string; sourceDigest: string; sceneDigest: string
  lessonId: string; lessonRevision: string; runtimeRevision: string; seed: 0
}>
export type LearningRunState = 'ready' | 'running' | 'paused' | 'completed' | 'failed'
export type LearningWorkerSnapshot = Readonly<{
  kind: 'snapshot'; identity: LearningRunIdentity; sequence: number; state: LearningRunState
  span: SourceSpan; scene: LearningSceneSnapshot; output: string; variables: Record<string, string>
  metrics: ExecutionMetrics; grade: ReturnType<typeof gradeLearningLesson>; computeMs: number
  error: ReturnType<typeof pythonError> | null; trace?: readonly (readonly number[])[]
}>
export type LearningWorkerRequest =
  | { kind: 'start'; identity: LearningRunIdentity; source: string; mode: 'run' | 'step' | 'validate' }
  | { kind: 'control'; runId: string; generation: number; operation: 'run' | 'step' | 'pause' }

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const count = (value: unknown, max: number) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max
const smallText = (value: unknown, max: number) => typeof value === 'string' && sourceBytes(value) <= max
export function validLearningError(value: unknown): value is ReturnType<typeof pythonError> {
  return record(value) && smallText(value.code, 64) && smallText(value.message, 4096) && validSpan(value.span)
}
const validSpan = (value: unknown) => record(value) && count(value.line, PYTHON_LIMITS.sourceBytes) && value.line > 0 && count(value.column, PYTHON_LIMITS.sourceBytes) && value.column > 0
export function validRunIdentity(value: unknown): value is LearningRunIdentity {
  if (!record(value) || !count(value.generation, Number.MAX_SAFE_INTEGER) || value.generation < 1
    || value.runtimeRevision !== PYTHON_RUNTIME_REVISION || value.seed !== 0 || typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceDigest)
    || typeof value.sceneDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sceneDigest)
    || ![value.runId, value.workspaceId, value.documentId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 1024)) return false
  try { return value.lessonRevision === learningLesson(value.lessonId).revision } catch { return false }
}
export function sameRun(a: LearningRunIdentity, b: LearningRunIdentity): boolean {
  return ['runId', 'generation', 'workspaceId', 'documentId', 'sourceDigest', 'sceneDigest', 'lessonId', 'lessonRevision', 'runtimeRevision', 'seed'].every(key => a[key] === b[key])
}
export function validLearningSnapshot(value: unknown): value is LearningWorkerSnapshot {
  if (!record(value) || value.kind !== 'snapshot' || !validRunIdentity(value.identity) || !count(value.sequence, 1_000_000) || value.sequence < 1
    || !['ready', 'running', 'paused', 'completed', 'failed'].includes(value.state) || !validSpan(value.span)
    || !smallText(value.output, PYTHON_LIMITS.outputBytes) || !finite(value.computeMs) || value.computeMs < 0
    || !record(value.scene) || !record(value.metrics) || !record(value.variables) || !record(value.grade)) return false
  const scene = value.scene
  if (!['x', 'z', 'heading', 'distance'].every(key => finite(scene[key])) || Math.abs(scene.x) > 8 || Math.abs(scene.z) > 8
    || scene.heading < 0 || scene.heading >= 360 || scene.distance < 0 || typeof scene.atGoal !== 'boolean'
    || !count(scene.ticks, PYTHON_LIMITS.ticks) || !count(scene.collisions, PYTHON_LIMITS.ticks)) return false
  if (!['statements', 'assignments', 'loops', 'branches', 'functions', 'sensors'].every(key => count(value.metrics[key], PYTHON_LIMITS.steps))
    || Object.keys(value.variables).length > PYTHON_LIMITS.variables || !Object.entries(value.variables).every(([key, text]) => /^[a-zA-Z_]\w*$/.test(key) && smallText(text, PYTHON_LIMITS.stringLength * 4 + 4))) return false
  if (value.error !== null && !validLearningError(value.error)) return false
  if (value.state === 'failed' && value.error === null) return false
  const expected = gradeLearningLesson(learningLesson(value.identity.lessonId), scene as LearningSceneSnapshot, value.metrics as ExecutionMetrics, value.state === 'completed')
  if (value.grade.passed !== expected.passed || value.grade.score !== expected.score || !Array.isArray(value.grade.criteria)
    || value.grade.criteria.length !== expected.criteria.length || !expected.criteria.every((criterion, index) => {
      const actual = value.grade.criteria[index]
      return record(actual) && actual.id === criterion.id && actual.label === criterion.label && actual.passed === criterion.passed
    })) return false
  if (value.trace !== undefined && (!Array.isArray(value.trace) || value.trace.length > PYTHON_LIMITS.ticks
    || !value.trace.every(row => Array.isArray(row) && row.length === 4 && row.every(finite)) || sourceBytes(JSON.stringify(value.trace)) > PYTHON_LIMITS.traceBytes)) return false
  return true
}
