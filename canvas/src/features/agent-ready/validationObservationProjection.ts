import { record, type RunTrace, type TraceSpan } from './missionControlProjection'

export type ValidationObservation = {
  schema: 'agentic-os/validation-observation/v1'; authority: false; exportedAt: number; runId: string; status: string;
  source: { repository: string; revision: string; tree: string; dirty: boolean };
  startedAt: number; finishedAt: number | null; elapsedMs: number | null;
  stages: { id: string; status: string; startedAt: number | null; finishedAt: number | null; elapsedMs: number | null;
    observedOutputBytes: number | null; outputTruncated: boolean }[];
  resources: { observedOutputBytes: number | null; emittedDiagnosticBytes: number | null };
}
function fail(): never { throw Error('Invalid or oversized validation observation.') }
const finite = (v: unknown, nullable = false): number | null => v === null && nullable ? null
  : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : fail()
const id = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9.-]{0,95}$/u.test(v) ? v : fail()
export function readValidationObservation(text: string): ValidationObservation {
  if (new TextEncoder().encode(text).length > 128000) fail()
  const value = record(JSON.parse(text)), source = record(value.source), resources = record(value.resources)
  if (value.schema !== 'agentic-os/validation-observation/v1' || value.authority !== false
    || !Array.isArray(value.stages) || value.stages.length > 128
    || !['running', 'passed', 'failed', 'blocked'].includes(String(value.status))
    || typeof source.repository !== 'string' || !/^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/iu.test(source.repository)
    || source.repository.split('/').some(part => ['.', '..'].includes(part))
    || typeof source.revision !== 'string' || !/^[a-f0-9]{40}$/u.test(source.revision)
    || typeof source.tree !== 'string' || !/^[a-f0-9]{40}$/u.test(source.tree) || typeof source.dirty !== 'boolean') fail()
  const ids = new Set<string>()
  const stages = value.stages.map(raw => {
    const s = record(raw), name = id(s.id), elapsedMs = finite(s.elapsedMs, true)
    const startedAt = finite(s.startedAt, true), finishedAt = finite(s.finishedAt, true)
    if (ids.has(name) || !['running', 'passed', 'failed', 'reused'].includes(String(s.status))
      || elapsedMs !== null && elapsedMs > 86400000 || startedAt !== null && finishedAt !== null && finishedAt < startedAt) fail()
    ids.add(name)
    return { id: name, status: String(s.status), startedAt, finishedAt, elapsedMs,
      observedOutputBytes: finite(s.observedOutputBytes, true), outputTruncated: s.outputTruncated === true }
  })
  return { schema: 'agentic-os/validation-observation/v1', authority: false, exportedAt: finite(value.exportedAt)!,
    runId: id(value.runId), status: String(value.status), source: { repository: source.repository, revision: source.revision,
      tree: source.tree, dirty: source.dirty }, startedAt: finite(value.startedAt)!, finishedAt: finite(value.finishedAt, true),
    elapsedMs: finite(value.elapsedMs, true), stages,
    resources: { observedOutputBytes: finite(resources.observedOutputBytes, true), emittedDiagnosticBytes: finite(resources.emittedDiagnosticBytes, true) } }
}
export function validationTrace(observation: ValidationObservation, offset = 0, now = Date.now()): RunTrace {
  if (!Number.isInteger(offset) || offset < 0 || offset % 32 || offset > Math.max(0, observation.stages.length - 1)) fail()
  const source = observation.source, component = { id: source.repository, revision: source.revision, digest: '' }
  const evaluation = { status: 'unevaluated', score: null, reason: 'Local process exit observations; no provider evaluation.', evidence: null }
  const spans: TraceSpan[] = observation.stages.slice(offset, offset + 32).map((stage, index) => ({
    spanId: stage.id, parentSpanId: null, kind: 'check', operation: stage.id, taskId: '', attempt: null,
    status: stage.status, subjectDigest: null, component, evaluation,
    links: offset + index > 0 ? [{ spanId: observation.stages[offset + index - 1]!.id, kind: 'sequence' }] : [],
    timing: { offset: stage.startedAt === null || stage.status === 'reused' ? null : Math.max(0, stage.startedAt - observation.startedAt),
      inclusive: stage.elapsedMs, exclusive: null }, cost: null,
  }))
  return { runId: observation.runId, status: observation.status, spans, subjectDigest: null, context: null,
    candidate: component, cohortId: '', profile: {}, evaluation, resources: null, observedAt: now, expiresAt: now + 60000,
    partial: observation.status !== 'passed' || observation.stages.length > 32, dropped: null,
    expected: observation.stages.length, total: observation.stages.length, offset, nextCursor: null,
    localObservation: observation }
}
