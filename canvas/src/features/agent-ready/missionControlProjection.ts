import type { ValidationObservation } from './validationObservationProjection'
import type { DashboardMetric } from '@/components/DashboardCanvas/dashboardModel'
import type { GraphData } from '@/lib/graph/types'
import type { GraphRecordColumnDoc } from '@/lib/graph-record-db'

export type ResourceMetrics = { cpuMs: number | null; peakMemoryBytes: number | null; tokens: number | null; costUsd: number | null;
  costBasis?: 'estimated' | 'unreported'; memoryScope?: 'maximum-single-process-rss'; measurement?: 'wait4' | 'unavailable' }
type RecordValue = Record<string, unknown>
export type EvidenceRef = { id: string; revision: string; digest: string }
export type Evaluation = { status: string; score: number | null; reason: string; evidence: unknown }
export type RunContext = { taskId: string; projectId: string; goalId: string; receipt: unknown;
  plan: { repository: string; path: string; revision: string; digest: string; continuityId: string; revisions: RecordValue } }
export type RunSummary = { runId: string; status: string; agent: string; context: RunContext | null;
  expiresAt: number; duration: number | null; tokens: number | null; cost: number | null; evaluation: string }
export type RunIndex = { items: RunSummary[]; total: number; offset: number; nextCursor: string | null;
  observedAt: number; access: { scope: string; expiresAt: number }; partial: boolean; window: RecordValue;
  metrics: DashboardMetric[] }
export type TraceSpan = { spanId: string; parentSpanId: string | null; kind: string; operation: string;
  taskId: string; attempt: number | null; status: string; subjectDigest: string | null; component: EvidenceRef;
  links: { spanId: string; kind: string }[]; timing: { offset: number | null; inclusive: number | null; exclusive: number | null; scope?: string; basis?: string };
  cost: unknown; resources?: ResourceMetrics; historicalResources?: ResourceMetrics; model?: string | null; modelIdentityBasis?: string; evaluation: Evaluation }
export type RunTrace = { workflowManifest?: { value: RecordValue; digest: string; text: string }; workspaceObservation?: { manifestPath: string; manifestDigest: string }; localImport?: { fileName: string; importedAt: number }; localObservation?: ValidationObservation; runId: string; status: string; spans: TraceSpan[]; subjectDigest: string | null;
  context: RunContext | null; candidate: EvidenceRef; cohortId: string; profile: RecordValue;
  evaluation: Evaluation; resources: RecordValue | null; expiresAt: number; observedAt: number;
  partial: boolean; dropped: number | null; expected: number | null; total: number; offset: number; nextCursor: string | null }

export const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as RecordValue : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
export const known = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
export const numberLabel = (value: number | null, suffix = '') => value === null ? 'Unknown' : `${value.toLocaleString()}${suffix}`
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null
const cursor = (value: unknown) => typeof value === 'string' && value.length <= 2048 ? value : null
const ref = (value: unknown): EvidenceRef => {
  const v = record(value)
  return { id: text(v.id), revision: text(v.revision), digest: digest(v.digest) ?? '' }
}
function context(value: unknown): RunContext | null {
  if (!value) return null
  const v = record(value), p = record(v.plan)
  if (!v.taskId || !v.projectId || !v.goalId || !p.revision) throw Error('Run context is incomplete.')
  return { taskId: text(v.taskId), projectId: text(v.projectId), goalId: text(v.goalId), receipt: v.receipt ?? null,
    plan: { repository: text(p.repository), path: text(p.path), revision: text(p.revision), digest: text(p.digest),
      continuityId: text(p.continuityId), revisions: record(p.revisions) } }
}
function evaluation(value: unknown): Evaluation {
  const v = record(value)
  return { status: text(v.status) || 'unevaluated', score: typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : null,
    reason: text(v.reasonCode), evidence: v.evidence ?? v.subjectEvidence ?? null }
}
function page(value: unknown): RecordValue {
  const v = record(value)
  if (v.status === 'blocked' || v.httpStatus === 401 || v.httpStatus === 403 || v.writeResultUnknown)
    throw Object.assign(Error(text(v.reasonCode) || text(v.code) || 'Runtime access unavailable.'),
      { denied: v.httpStatus === 401 || v.httpStatus === 403 || ['principal_expired', 'run_forbidden', 'toolkit_denied'].includes(text(v.reasonCode)),
        uncertain: v.writeResultUnknown === true })
  return v
}
export function readRunIndex(value: unknown): RunIndex {
  const v = page(value), access = record(v.access), metrics = record(v.metrics), latency = record(metrics.runLatencyMs)
  if (v.schema !== 'agent-toolkit-query/v1' || !Array.isArray(v.items) || v.items.length > 32
    || !text(access.scope) || known(access.expiresAt) === null || known(v.observedAt) === null) throw Error('Run discovery is unavailable.')
  const items = v.items.map(item => {
    const r = record(item), profile = record(r.profile), tokens = record(profile.tokenUsage)
    if (!text(r.runId)) throw Error('Run identity is missing.')
    return { runId: text(r.runId), status: text(r.status), agent: text(record(r.target).id), context: context(r.context),
      expiresAt: known(r.expiresAt) ?? 0, duration: known(profile.runDurationMs),
      tokens: tokens.status === 'reported' && known(tokens.promptTokens) !== null && known(tokens.completionTokens) !== null
        ? Number(tokens.promptTokens) + Number(tokens.completionTokens) : null,
      cost: known(profile.estimatedCostUsd), evaluation: text(record(r.evaluation).status) || 'unevaluated' }
  })
  if (new Set(items.map(r => r.runId)).size !== items.length) throw Error('Duplicate run identity.')
  return { items, total: known(v.total) ?? items.length, offset: known(v.offset) ?? 0, nextCursor: cursor(v.nextCursor),
    observedAt: Number(v.observedAt), access: { scope: text(access.scope), expiresAt: Number(access.expiresAt) },
    partial: record(v.coverage).partial === true, window: record(v.window), metrics: [
      { id: 'runs', label: 'Observed runs', value: numberLabel(known(metrics.runs)), detail: `${numberLabel(known(metrics.failed))} failed · retained authorized population`, tone: 'blue' },
      { id: 'latency', label: 'Run latency p50', value: numberLabel(known(latency.p50), ' ms'),
        detail: `p95 ${numberLabel(known(latency.p95), ' ms')} · p99 ${numberLabel(known(latency.p99), ' ms')} · n=${numberLabel(known(latency.count))}`, tone: 'slate' },
      { id: 'tokens', label: 'Known model tokens', value: metrics.knownTokenRuns === 0 && Number(metrics.runs) > 0 ? 'Unknown' : numberLabel(known(metrics.knownTokens)),
        detail: `${numberLabel(known(metrics.knownTokenRuns))}/${numberLabel(known(metrics.runs))} runs reported usage; document statistics are separate`, tone: 'green' },
    ] }
}
export function readRunTrace(value: unknown, runId: string): RunTrace {
  const v = page(value), p = record(v.page), coverage = record(v.coverage)
  if (v.schema !== 'agent-toolkit-run/v1' || v.runId !== runId || !Array.isArray(v.spans) || v.spans.length > 32)
    throw Error('Trace identity or bounded page is unavailable.')
  const spans = v.spans.map(value => {
    const s = record(value), t = record(s.timing)
    if (!text(s.spanId)) throw Error('Span identity is missing.')
    return { spanId: text(s.spanId), parentSpanId: text(s.parentSpanId) || null, kind: text(s.kind),
      operation: text(s.operation), taskId: text(s.taskId), attempt: known(s.attempt), status: text(s.status),
      ...(s.resources ? { resources: { cpuMs: known(record(s.resources).cpuMs), peakMemoryBytes: known(record(s.resources).peakMemoryBytes), tokens: known(record(s.resources).tokens), costUsd: known(record(s.resources).costUsd) } } : {}),
      subjectDigest: digest(s.subjectDigest), component: ref(s.component), cost: s.cost ?? null, evaluation: evaluation(s.evaluation),
      model: text(s.model) || text(record(s.cost).model) || null, modelIdentityBasis: text(s.modelIdentityBasis) || (text(s.model) ? 'reported-span' : text(record(s.cost).model) ? 'reported-cost-log' : 'unreported'),
      ...(s.historicalResources ? { historicalResources: { cpuMs: known(record(s.historicalResources).cpuMs), peakMemoryBytes: known(record(s.historicalResources).peakMemoryBytes), tokens: known(record(s.historicalResources).tokens), costUsd: known(record(s.historicalResources).costUsd) } } : {}),
      links: (Array.isArray(s.links) ? s.links.slice(0, 32) : []).map(link => ({ spanId: text(record(link).spanId), kind: text(record(link).kind) })),
      timing: { offset: known(t.startOffsetMs), inclusive: known(t.inclusiveMs), exclusive: known(t.exclusiveObservedMs), ...(text(t.scope) ? { scope: text(t.scope) } : {}), ...(text(t.basis) ? { basis: text(t.basis) } : {}) } }
  })
  if (new Set(spans.map(s => s.spanId)).size !== spans.length) throw Error('Duplicate span identity.')
  return { runId, status: text(v.status), spans, subjectDigest: digest(v.subjectDigest), context: context(v.context),
    candidate: ref(v.candidate), cohortId: text(v.cohortId), profile: record(v.profile), evaluation: evaluation(v.evaluation),
    resources: v.resources ? record(v.resources) : null, expiresAt: known(v.expiresAt) ?? 0, observedAt: known(v.observedAt) ?? 0,
    partial: coverage.partial === true, dropped: known(coverage.droppedEvents), expected: known(coverage.expectedSpans),
    total: known(p.total) ?? spans.length, offset: known(p.offset) ?? 0, nextCursor: cursor(p.nextCursor) }
}

/** Shared display projection: retain known zero; do not infer machine or cash charges. */
export function spanResources(span: TraceSpan): ResourceMetrics {
  const cost = record(span.cost), input = known(cost.prompt_tokens), output = known(cost.completion_tokens)
  return span.resources ?? { cpuMs: null, peakMemoryBytes: null,
    tokens: cost.status === 'reported' && Number.isSafeInteger(input) && Number.isSafeInteger(output)
      && Number.isSafeInteger(Number(input) + Number(output)) ? Number(input) + Number(output) : null,
    costUsd: cost.status === 'reported' ? known(cost.estimated_cost_usd) : null }
}
export function traceResources(trace: RunTrace, selected?: TraceSpan | null): ResourceMetrics {
  if (selected) return selected.status === 'reused' && selected.historicalResources ? selected.historicalResources : spanResources(selected)
  if (trace.profile.workflow) {
    const byId = new Map(trace.spans.map(s => [s.spanId,s]))
    const result: ResourceMetrics = { cpuMs:null,peakMemoryBytes:null,tokens:null,costUsd:null }
    for (const key of ['cpuMs','peakMemoryBytes','tokens','costUsd'] as const) {
      const values = trace.spans.filter(s => s.status !== 'reused').flatMap(s => {
        const value = spanResources(s)[key]; if (value === null) return []
        let parent = s.parentSpanId; const seen = new Set([s.spanId])
        while (parent && byId.has(parent) && !seen.has(parent)) {
          seen.add(parent); const ancestor = byId.get(parent)!
          if (ancestor.status !== 'reused' && spanResources(ancestor)[key] !== null) return []
          parent = ancestor.parentSpanId
        }
        return [value]
      })
      if (values.length) result[key] = key === 'peakMemoryBytes' ? Math.max(...values) : values.reduce((sum,n)=>sum+n,0)
    }
    return result
  }
  const v = trace.localObservation?.resources, tokens = record(trace.profile.tokenUsage)
  return v ? { cpuMs: v.cpuMs ?? null, peakMemoryBytes: v.peakMemoryBytes ?? null,
    tokens: v.tokens ?? null, costUsd: v.costUsd ?? null }
    : spanResources({ cost: { status: tokens.status, prompt_tokens: tokens.promptTokens,
      completion_tokens: tokens.completionTokens, estimated_cost_usd: trace.profile.estimatedCostUsd } } as TraceSpan)
}
export const resourceLabels = (v: ResourceMetrics) => ({ 'CPU ms': numberLabel(v.cpuMs),
  'Peak process RSS bytes': numberLabel(v.peakMemoryBytes), Tokens: numberLabel(v.tokens), 'Estimated USD': numberLabel(v.costUsd) })

export const spanLabel = (span: TraceSpan) => `${span.operation} · ${span.taskId || span.component.id}${span.attempt === null ? '' : ` · attempt ${span.attempt}`}`
/** Filtering retains visible ancestors and terminates even on malformed remote cycles. */
export function visibleSpanTree(spans: TraceSpan[], search: string) {
  const byId = new Map(spans.map(s => [s.spanId, s])), keep = new Set<string>()
  for (const span of spans) if (`${spanLabel(span)} ${span.kind} ${span.status} ${span.spanId}`.toLowerCase().includes(search.toLowerCase().trim())) {
    let current: TraceSpan | undefined = span
    const visited = new Set<string>()
    while (current && !visited.has(current.spanId)) { visited.add(current.spanId); keep.add(current.spanId); current = byId.get(current.parentSpanId ?? '') }
  }
  const rows: { span: TraceSpan; depth: number; missingParent: boolean }[] = [], visited = new Set<string>()
  function visit(span: TraceSpan, depth: number) {
    if (visited.has(span.spanId) || !keep.has(span.spanId)) return
    visited.add(span.spanId); rows.push({ span, depth, missingParent: Boolean(span.parentSpanId && !byId.has(span.parentSpanId)) })
    for (const child of spans) if (child.parentSpanId === span.spanId) visit(child, depth + 1)
  }
  for (const span of spans) if (!span.parentSpanId || !byId.has(span.parentSpanId)) visit(span, 0)
  for (const span of spans) visit(span, 0)
  return rows
}
export const spanNodeId = (runId: string, spanId: string) => `agentic-os/${encodeURIComponent(runId)}/${encodeURIComponent(spanId)}`
export function traceGraph(trace: RunTrace, search: string, detail: 'all' | 'agents' = 'all'): GraphData {
  let spans = visibleSpanTree(trace.spans, search).map(r => r.span)
  if (detail === 'agents' && spans.some(span => span.kind === 'agent')) {
    const byId = new Map(trace.spans.map(span => [span.spanId, span]))
    const parentAgent = (id: string | null) => {
      const seen = new Set<string>()
      while (id && byId.has(id) && !seen.has(id)) {
        seen.add(id); const parent = byId.get(id)!
        if (parent.kind === 'agent') return id
        id = parent.parentSpanId
      }
      return id && !byId.has(id) ? id : null
    }
    spans = spans.filter(span => span.kind === 'agent').map(span => ({ ...span,
      parentSpanId: parentAgent(span.parentSpanId), links: span.links.filter(link => byId.get(link.spanId)?.kind === 'agent') }))
  }
  const names = new Set(spans.map(s => s.spanId))
  const graph: GraphData = { type: 'agentic-os-observation', nodes: [], edges: [], metadata: { readOnly: true } }
  for (const s of spans) graph.nodes.push({ id: spanNodeId(trace.runId, s.spanId), label: s.operation, type: s.kind,
    properties: { status: s.status, ...resourceLabels(spanResources(s)), 'inspection:label': spanLabel(s), 'visual:shape': s.kind === 'tool' ? 'hex' : 'circle',
      'visual:fill': s.status === 'failed' ? '#fee2e2' : s.kind === 'tool' ? '#fef9c3' : s.kind === 'retrieval' ? '#ccfbf1' : '#e0e7ff',
      'visual:stroke': s.status === 'failed' ? '#be123c' : '#4f46e5', 'visual:strokeWidth': 2 } })
  function edge(source: string, target: string, kind: string) {
    if (!source || source === target) return
    if (!names.has(source)) { names.add(source); graph.nodes.push({ id: spanNodeId(trace.runId, source),
      label: 'Outside this page', type: 'unavailable', properties: { observed: false } }) }
    graph.edges.push({ id: `${kind}:${source}:${target}`, source: spanNodeId(trace.runId, source),
      target: spanNodeId(trace.runId, target), type: kind, label: kind, properties: { 'visual:stroke': '#a8a29e', 'visual:strokeWidth': 1.5 } })
  }
  for (const s of spans) {
    if (s.parentSpanId) edge(s.parentSpanId, s.spanId, 'contains')
    for (const link of s.links) edge(link.spanId, s.spanId, link.kind)
  }
  return graph
}
export const RUN_COLUMNS: GraphRecordColumnDoc[] = ['Run', 'Agent', 'State', 'Latency', 'Tokens', 'Estimated USD', 'Evaluation'].map((name, order) => ({
  pk: `agentic-os/${name}`, tableId: 'nodes', columnId: name, name, kind: 'text', order, hidden: false, createdAtMs: 0, updatedAtMs: 0,
}))
export function runRows(index: RunIndex) {
  return index.items.map((r, i) => ({ id: r.runId, __order: i + index.offset + 1, Run: r.runId, Agent: r.agent,
    State: r.status, Latency: numberLabel(r.duration, ' ms'), Tokens: numberLabel(r.tokens), 'Estimated USD': numberLabel(r.cost), Evaluation: r.evaluation }))
}
export const SPAN_COLUMNS: GraphRecordColumnDoc[] = ['Span', 'Operation', 'State', 'Model', 'Clock', 'Start offset ms', 'Measurement', 'Inclusive ms', 'Exclusive observed ms', 'CPU ms', 'Peak process RSS bytes', 'Tokens', 'Estimated USD', 'Evaluation'].map((name, order) => ({
  pk: `agentic-os/span/${name}`, tableId: 'nodes', columnId: name, name, kind: 'text', order, hidden: false, createdAtMs: 0, updatedAtMs: 0,
}))
export function spanRows(spans: TraceSpan[]) {
  return spans.map((s, i) => ({ id: s.spanId, __order: i + 1, Span: s.spanId, Operation: spanLabel(s), State: s.status, Model: s.model || 'Not recorded', Clock: s.timing.scope || 'run',
    'Start offset ms': numberLabel(s.timing.offset), Measurement: s.status === 'reused' ? 'historical' : 'current',
    'Inclusive ms': numberLabel(s.timing.inclusive), 'Exclusive observed ms': numberLabel(s.timing.exclusive), ...resourceLabels(s.status === 'reused' && s.historicalResources ? s.historicalResources : spanResources(s)), Evaluation: s.evaluation.status }))
}
export function sourceLink(context: RunContext | null): string | null {
  const p = context?.plan
  if (!p || !/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repository)
    || !/^[a-f0-9]{40}$/.test(p.revision) || p.path.split('/').some(part => !part || ['.', '..'].includes(part))) return null
  return `https://${p.repository}/blob/${p.revision}/${p.path.split('/').map(encodeURIComponent).join('/')}`
}
/** Workflow receipts carry a source revision without inventing an authored PRD context. */
export function workflowSourceLink(trace: RunTrace): string | null {
  const source = record(record(trace.profile.workflow).source), repository = String(source.repository || ''), revision = String(source.revision || '')
  if (!/^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(part => ['.', '..'].includes(part))
    || !/^[a-f0-9]{40}$/.test(revision)) return null
  return `https://${repository}/tree/${revision}`
}
export function comparable(baseline: RunTrace | null, candidate: RunTrace | null): boolean {
  return Boolean(baseline && candidate && !baseline.localObservation && !candidate.localObservation && baseline.cohortId === candidate.cohortId
    && JSON.stringify(baseline.profile) === JSON.stringify(candidate.profile)
    && JSON.stringify(baseline.candidate) !== JSON.stringify(candidate.candidate))
}
