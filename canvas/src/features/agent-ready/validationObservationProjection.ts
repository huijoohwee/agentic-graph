import { record, type RunTrace, type TraceSpan, type ResourceMetrics } from './missionControlProjection'

type FeedbackRow = { id: string; samples: number; meanMs: number; sourceRevision: string | null; resourceMeans: Partial<ResourceMetrics> & { queueWaitMs?: number } }
export type ValidationObservation = {
  schema: 'agentic-os/validation-observation/v1'; authority: false; exportedAt: number; runId: string; status: string;
  source: { repository: string; revision: string; tree: string; dirty: boolean | null };
  ci?: { runId: number; attempt: number; url: string; queueWaitMs: number | null };
  feedbackUnavailable?: boolean;
  feedback?: { ranking: FeedbackRow[] };
  executionOrder?: 'sequential' | 'concurrent' | 'unknown';
  coverage?: { totalStages: number; expectedStages: number; offset: number; partial: boolean };
  startedAt: number; finishedAt: number | null; elapsedMs: number | null;
  stages: { id: string; status: string; startedAt: number | null; finishedAt: number | null; elapsedMs: number | null;
    observedOutputBytes: number | null; outputTruncated: boolean; resources?: ResourceMetrics }[];
  resources: Partial<ResourceMetrics> & { observedOutputBytes: number | null; emittedDiagnosticBytes: number | null; coverage?: Record<string, number> };
}
function fail(): never { throw Error('Invalid or oversized validation observation.') }
const finite = (v: unknown, nullable = false): number | null => v === null && nullable ? null
  : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : fail()
const id = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9.-]{0,95}$/u.test(v) ? v : fail()
const metricKeys = ['cpuMs', 'peakMemoryBytes', 'tokens', 'costUsd'] as const
function metrics(raw: unknown): ResourceMetrics {
  const v = record(raw)
  if (v.costUsd != null && v.costBasis !== 'estimated'
    || (v.cpuMs != null || v.peakMemoryBytes != null) && v.memoryScope !== 'maximum-single-process-rss') fail()
  if (v.costBasis !== undefined && !['estimated', 'unreported'].includes(String(v.costBasis))
    || v.memoryScope !== undefined && v.memoryScope !== 'maximum-single-process-rss'
    || v.measurement !== undefined && !['wait4', 'unavailable'].includes(String(v.measurement))) fail()
  const result: ResourceMetrics = { cpuMs: finite(v.cpuMs ?? null, true), peakMemoryBytes: finite(v.peakMemoryBytes ?? null, true),
    tokens: finite(v.tokens ?? null, true), costUsd: finite(v.costUsd ?? null, true) }
  if ([result.peakMemoryBytes, result.tokens].some(n => n !== null && !Number.isSafeInteger(n))) fail()
  return { ...result, ...(v.costBasis === undefined ? {} : { costBasis: v.costBasis as ResourceMetrics['costBasis'] }),
    ...(v.memoryScope === undefined ? {} : { memoryScope: 'maximum-single-process-rss' as const }),
    ...(v.measurement === undefined ? {} : { measurement: v.measurement as ResourceMetrics['measurement'] }) }
}
function feedback(raw: unknown): { ranking: FeedbackRow[] } {
  const v = record(raw), seen = new Set<string>()
  if (v.status !== 'advisory' || v.authority !== false || !Array.isArray(v.ranking) || v.ranking.length > 5) fail()
  return { ranking: v.ranking.map(raw => {
    const r = record(raw), name = id(r.id), samples = finite(r.samples)!, meanMs = finite(r.meanMs)!
    if (seen.has(name) || !Number.isInteger(samples) || samples < 1 || samples > 32 || meanMs > 86400000
      || r.sourceRevision !== null && (typeof r.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/u.test(r.sourceRevision))) fail()
    seen.add(name)
    const resourceMeans = Object.fromEntries(Object.entries(record(r.resourceMeans)).map(([key, n]) => {
      if (![...metricKeys, 'queueWaitMs'].includes(key)) fail()
      return [key, finite(n)!]
    }))
    return { id: name, samples, meanMs, sourceRevision: r.sourceRevision as string | null, resourceMeans }
  }) }
}
export function readValidationObservation(text: string): ValidationObservation {
  if (new TextEncoder().encode(text).length > 128000) fail()
  const value = record(JSON.parse(text)), source = record(value.source), resources = record(value.resources)
  if (value.schema !== 'agentic-os/validation-observation/v1' || value.authority !== false
    || !Array.isArray(value.stages) || value.stages.length > 128
    || !['running', 'passed', 'failed', 'blocked'].includes(String(value.status))
    || typeof source.repository !== 'string' || !/^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/iu.test(source.repository)
    || source.repository.split('/').some(part => ['.', '..'].includes(part))
    || typeof source.revision !== 'string' || !/^[a-f0-9]{40}$/u.test(source.revision)
    || typeof source.tree !== 'string' || !/^[a-f0-9]{40}$/u.test(source.tree) || source.dirty !== null && typeof source.dirty !== 'boolean') fail()
  const coverage = record(value.coverage)
  if (value.executionOrder !== undefined && !['sequential', 'concurrent', 'unknown'].includes(String(value.executionOrder))) fail()
  const ids = new Set<string>()
  const stages = value.stages.map(raw => {
    const s = record(raw), name = id(s.id), elapsedMs = finite(s.elapsedMs, true)
    const startedAt = finite(s.startedAt, true), finishedAt = finite(s.finishedAt, true)
    if (ids.has(name) || !['running', 'passed', 'failed', 'reused'].includes(String(s.status))
      || elapsedMs !== null && elapsedMs > 86400000 || startedAt !== null && finishedAt !== null && finishedAt < startedAt) fail()
    ids.add(name)
    return { id: name, status: String(s.status), startedAt, finishedAt, elapsedMs,
      observedOutputBytes: finite(s.observedOutputBytes, true), outputTruncated: s.outputTruncated === true, resources: metrics(s.resources) }
  })
  let ci: ValidationObservation['ci']
  if (value.ci !== undefined) {
    const c = record(value.ci), runId = finite(c.runId)!, attempt = finite(c.attempt)!
    if (![runId, attempt].every(n => Number.isSafeInteger(n) && n > 0)
      || c.url !== `https://${source.repository}/actions/runs/${runId}`) fail()
    ci = { runId, attempt, url: String(c.url), queueWaitMs: finite(c.queueWaitMs, true) }
  }
  const metricCoverage = resources.coverage === undefined ? undefined : Object.fromEntries(Object.entries(record(resources.coverage)).map(([key, value]) => {
    if (![...metricKeys, 'queueWaitMs', 'expectedStages'].includes(key)) fail()
    const n = finite(value)!; if (!Number.isSafeInteger(n) || n > 256) fail()
    return [key, n]
  }))
  return { schema: 'agentic-os/validation-observation/v1', authority: false, exportedAt: finite(value.exportedAt)!,
    ...(value.feedbackUnavailable === true ? { feedbackUnavailable: true } : {}),
    ...(ci ? { ci } : {}), ...(value.feedback === undefined ? {} : { feedback: feedback(value.feedback) }),
    executionOrder: (value.executionOrder ?? 'unknown') as ValidationObservation['executionOrder'],
    ...(value.coverage === undefined ? {} : { coverage: { totalStages: finite(coverage.totalStages)!, expectedStages: finite(coverage.expectedStages)!,
      offset: finite(coverage.offset)!, partial: coverage.partial === true } }),
    runId: id(value.runId), status: String(value.status), source: { repository: source.repository, revision: source.revision,
      tree: source.tree, dirty: source.dirty === null ? null : source.dirty === true }, startedAt: finite(value.startedAt)!, finishedAt: finite(value.finishedAt, true),
    elapsedMs: finite(value.elapsedMs, true), stages,
    resources: { ...metrics(resources), ...(metricCoverage ? { coverage: metricCoverage } : {}), observedOutputBytes: finite(resources.observedOutputBytes, true), emittedDiagnosticBytes: finite(resources.emittedDiagnosticBytes, true) } }
}
export function validationTrace(observation: ValidationObservation, offset = 0, now = Date.now()): RunTrace {
  if (!Number.isInteger(offset) || offset < 0 || offset % 32 || offset > Math.max(0, observation.stages.length - 1)) fail()
  const source = observation.source, component = { id: source.repository, revision: source.revision, digest: '' }
  const evaluation = { status: 'unevaluated', score: null, reason: 'Local process exit observations; no provider evaluation.', evidence: null }
  const spans: TraceSpan[] = observation.stages.slice(offset, offset + 32).map((stage, index) => ({
    spanId: stage.id, parentSpanId: null, kind: 'check', operation: stage.id, taskId: '', attempt: null,
    status: stage.status, subjectDigest: null, component, evaluation,
    links: observation.executionOrder === 'sequential' && offset + index > 0 ? [{ spanId: observation.stages[offset + index - 1]!.id, kind: 'sequence' }] : [],
    timing: { offset: stage.startedAt === null || stage.status === 'reused' ? null : Math.max(0, stage.startedAt - observation.startedAt),
      inclusive: stage.elapsedMs, exclusive: null }, cost: null, resources: stage.resources,
  }))
  return { runId: observation.runId, status: observation.status, spans, subjectDigest: null, context: null,
    candidate: component, cohortId: '', profile: {}, evaluation, resources: null, observedAt: now, expiresAt: now + 60000,
    partial: observation.coverage?.partial === true || observation.status !== 'passed' || observation.stages.length > 32, dropped: null,
    expected: observation.coverage?.expectedStages ?? null, total: observation.stages.length, offset, nextCursor: null,
    localObservation: observation }
}
