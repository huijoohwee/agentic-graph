import { hashText } from '../parsers/hash'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '../../lib/graph/types'
import {
  DEFAULT_RESEARCH_THESIS_BOUNDS,
  RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION,
  RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
  RESEARCH_THESIS_REVIEW_AUDIT_SCHEMA_VERSION,
  RESEARCH_THESIS_RUN_SCHEMA_VERSION,
  RESEARCH_THESIS_SPEC_SCHEMA_VERSION,
} from './researchThesisTypes'
import type {
  ResearchThesisBounds,
  ResearchThesisCandidateGraphDelta,
  ResearchThesisClaim,
  ResearchThesisCompileError,
  ResearchThesisCompileErrorCode,
  ResearchThesisCompileRequest,
  ResearchThesisCompileResult,
  ResearchThesisCostLog,
  ResearchThesisEvidence,
  ResearchThesisEvidenceLabel,
  ResearchThesisEvidenceLedgerRow,
  ResearchThesisLogicEdge,
  ResearchThesisProvider,
  ResearchThesisReviewAudit,
  ResearchThesisRunManifest,
  ResearchThesisSourceInput,
  ResearchThesisSourceRef,
  ResearchThesisSourceSummary,
  ResearchThesisSpec,
  ResearchThesisSummaryCache,
} from './researchThesisTypes'

export {
  DEFAULT_RESEARCH_THESIS_BOUNDS,
  RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION,
  RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
  RESEARCH_THESIS_REVIEW_AUDIT_SCHEMA_VERSION,
  RESEARCH_THESIS_RUN_SCHEMA_VERSION,
  RESEARCH_THESIS_SOURCE_OWNER_PATHS,
  RESEARCH_THESIS_SPEC_SCHEMA_VERSION,
} from './researchThesisTypes'
export type * from './researchThesisTypes'

const normalizeText = (value: unknown): string => String(value || '').replace(/\r\n/g, '\n').trim()

const asJson = (value: unknown): JSONValue => value as JSONValue

const estimateTokens = (text: string): number => Math.ceil(String(text || '').length / 4)

const stablePart = (raw: string): string => hashText(raw).slice(0, 12)

export function buildResearchThesisSemanticKey(kind: string, parts: unknown[]): string {
  const normalizedKind = String(kind || 'run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'run'
  const payload = parts.map(part => {
    if (typeof part === 'string') return part
    try {
      return JSON.stringify(part)
    } catch {
      return String(part)
    }
  }).join('\u001f')
  return `kgra_${normalizedKind}_${stablePart(payload)}`
}

export async function sha256TextHash(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')))
    const hex = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
    return `sha256:${hex}`
  }
  return `fnv1a32:${hashText(String(text || ''))}`
}

function mergeBounds(
  base: ResearchThesisBounds,
  requestBudget?: ResearchThesisCompileRequest['budget'],
): ResearchThesisBounds {
  const budget = requestBudget || {}
  return {
    ...base,
    maxInputTokens: Number.isFinite(Number(budget.maxInputTokens))
      ? Math.max(1, Math.floor(Number(budget.maxInputTokens)))
      : base.maxInputTokens,
    maxOutputTokens: Number.isFinite(Number(budget.maxOutputTokens))
      ? Math.max(1, Math.floor(Number(budget.maxOutputTokens)))
      : base.maxOutputTokens,
    maxCompileIterations: Number.isFinite(Number(budget.maxCompileIterations))
      ? Math.max(1, Math.floor(Number(budget.maxCompileIterations)))
      : base.maxCompileIterations,
  }
}

async function normalizeSourceRefs(inputs: ResearchThesisSourceInput[]): Promise<{
  sourceRefs: ResearchThesisSourceRef[]
  sources: Array<ResearchThesisSourceInput & ResearchThesisSourceRef>
}> {
  const sourceRefs: ResearchThesisSourceRef[] = []
  const sources: Array<ResearchThesisSourceInput & ResearchThesisSourceRef> = []
  const seen = new Set<string>()
  for (const input of inputs) {
    const canonicalPath = normalizeText(input.canonicalPath)
    const text = String(input.text || '')
    if (!canonicalPath || !text.trim()) continue
    const contentHash = normalizeText(input.contentHash) || await sha256TextHash(text)
    const sourceId = normalizeText(input.sourceId) || buildResearchThesisSemanticKey('source', [canonicalPath, contentHash])
    const key = `${sourceId}:${contentHash}`
    if (seen.has(key)) continue
    seen.add(key)
    const sourceRef = {
      source_id: sourceId,
      canonical_path: canonicalPath,
      content_hash: contentHash,
    }
    sourceRefs.push(sourceRef)
    sources.push({ ...input, ...sourceRef })
  }
  return { sourceRefs, sources }
}

export async function preflightResearchThesisCompileRequest(
  request: ResearchThesisCompileRequest,
  boundsBase: ResearchThesisBounds = DEFAULT_RESEARCH_THESIS_BOUNDS,
): Promise<
  | { ok: true; manifest: ResearchThesisRunManifest; sources: Array<ResearchThesisSourceInput & ResearchThesisSourceRef>; bounds: ResearchThesisBounds }
  | { ok: false; error: ResearchThesisCompileError; cost_log: ResearchThesisCostLog }
> {
  const bounds = mergeBounds(boundsBase, request.budget)
  const thesisPrompt = normalizeText(request.thesisPrompt)
  const rawSources = Array.isArray(request.sources) ? request.sources : []
  const { sourceRefs, sources } = await normalizeSourceRefs(rawSources)
  const promptTokens = estimateTokens(thesisPrompt)
  const sourceTokens = sources.reduce((sum, source) => sum + estimateTokens(source.text), 0)
  const estimatedInputTokens = promptTokens + sourceTokens
  const runId = normalizeText(request.runId) || buildResearchThesisSemanticKey('run', [
    thesisPrompt,
    sourceRefs.map(ref => `${ref.source_id}:${ref.content_hash}`).sort(),
  ])
  const costLog: ResearchThesisCostLog = {
    run_id: runId,
    stage: 'preflight',
    model: 'offline-mock',
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hits: 0,
    estimated_cost_usd: 0,
    source_hash_reuse: false,
  }
  const error = (code: ResearchThesisCompileErrorCode, message: string) => ({
    ok: false as const,
    error: {
      code,
      message,
      estimated_input_tokens: estimatedInputTokens,
      model_call_count: 0 as const,
    },
    cost_log: costLog,
  })
  if (!thesisPrompt || thesisPrompt.length < 6) {
    return error('invalid_input', 'Research thesis prompt is required before compile.')
  }
  if (sources.length < 1 && request.allowAssumptionDraft !== true) {
    return error('invalid_input', 'At least one selected source is required unless assumption-draft mode is explicit.')
  }
  if (sources.length > bounds.maxSourceFiles) {
    return error('source_limit_exceeded', `Source count exceeds the configured cap of ${bounds.maxSourceFiles}.`)
  }
  if (estimatedInputTokens > bounds.maxInputTokens) {
    return error('budget_exceeded', `Estimated input tokens ${estimatedInputTokens} exceed the configured cap of ${bounds.maxInputTokens}.`)
  }
  const createdAt = normalizeText(request.createdAtIso) || new Date().toISOString()
  const manifest: ResearchThesisRunManifest = {
    schema_version: RESEARCH_THESIS_RUN_SCHEMA_VERSION,
    run_id: runId,
    status: 'manifested',
    created_at: createdAt,
    source_refs: sourceRefs,
    prompt_hash: await sha256TextHash(thesisPrompt),
    budget: {
      max_input_tokens: bounds.maxInputTokens,
      max_output_tokens: bounds.maxOutputTokens,
      estimated_input_tokens: estimatedInputTokens,
    },
    bounds: {
      max_source_files: bounds.maxSourceFiles,
      max_extracted_windows_per_source: bounds.maxExtractedWindowsPerSource,
      max_compile_iterations: bounds.maxCompileIterations,
      max_verification_fan_out: bounds.maxVerificationFanOut,
      max_wall_clock_ms: bounds.maxWallClockMs,
    },
    source_hash_reuse: false,
  }
  return { ok: true, manifest, sources, bounds }
}

function firstMeaningfulExcerpt(text: string, maxLines: number): { excerpt: string; locator: string } {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const selected: string[] = []
  let firstLine = 1
  for (let index = 0; index < lines.length && selected.length < maxLines; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    if (selected.length === 0) firstLine = index + 1
    selected.push(line)
  }
  const excerpt = selected.join('\n').slice(0, 1600) || String(text || '').trim().slice(0, 1600)
  const endLine = firstLine + Math.max(0, selected.length - 1)
  return {
    excerpt,
    locator: selected.length ? `line:${firstLine}-${endLine}` : 'chars:0-0',
  }
}

function cacheGet(cache: ResearchThesisSummaryCache | undefined, key: string): ResearchThesisSourceSummary | undefined {
  if (!cache) return undefined
  if (typeof cache.get === 'function') return cache.get(key)
  if (cache instanceof Map) return cache.get(key)
  return undefined
}

function cacheSet(cache: ResearchThesisSummaryCache | undefined, key: string, value: ResearchThesisSourceSummary): void {
  if (!cache) return
  if (typeof cache.set === 'function') {
    cache.set(key, value)
    return
  }
  if (cache instanceof Map) cache.set(key, value)
}

export function buildResearchThesisSourceSummaries(args: {
  manifest: ResearchThesisRunManifest
  sources: Array<ResearchThesisSourceInput & ResearchThesisSourceRef>
  cache?: ResearchThesisSummaryCache
}): { summaries: ResearchThesisSourceSummary[]; cacheHits: number } {
  const summaries: ResearchThesisSourceSummary[] = []
  let cacheHits = 0
  const maxLines = Math.max(1, args.manifest.bounds.max_extracted_windows_per_source)
  for (const source of args.sources) {
    const cached = cacheGet(args.cache, source.content_hash)
    if (cached) {
      summaries.push({ ...cached, cache_hit: true })
      cacheHits += 1
      continue
    }
    const excerpt = firstMeaningfulExcerpt(source.text, maxLines)
    const summary: ResearchThesisSourceSummary = {
      source_id: source.source_id,
      canonical_path: source.canonical_path,
      content_hash: source.content_hash,
      excerpt: excerpt.excerpt,
      locator: excerpt.locator,
      input_tokens_estimate: estimateTokens(excerpt.excerpt),
      cache_hit: false,
    }
    cacheSet(args.cache, source.content_hash, summary)
    summaries.push(summary)
  }
  return { summaries, cacheHits }
}

function titleFromPrompt(prompt: string): string {
  const firstSentence = normalizeText(prompt).split(/[.!?\n]/)[0]?.trim() || 'Research Thesis'
  return firstSentence.slice(0, 88) || 'Research Thesis'
}

function claimTextFromSource(source: ResearchThesisSourceSummary): string {
  const excerpt = normalizeText(source.excerpt).replace(/\s+/g, ' ')
  return excerpt ? excerpt.slice(0, 220) : `Source ${source.canonical_path} should be reviewed.`
}

export function buildDeterministicResearchThesisSpec(args: {
  manifest: ResearchThesisRunManifest
  thesisPrompt: string
  sourceSummaries: ResearchThesisSourceSummary[]
}): ResearchThesisSpec {
  const sourceSummaries = args.sourceSummaries
  const sourceRefs = args.manifest.source_refs
  const prompt = normalizeText(args.thesisPrompt)
  const title = titleFromPrompt(prompt)
  const evidence: ResearchThesisEvidence[] = []
  const claims: ResearchThesisClaim[] = []
  for (const source of sourceSummaries.slice(0, 3)) {
    const evidenceId = buildResearchThesisSemanticKey('evidence', [args.manifest.run_id, source.source_id, source.content_hash])
    const claimId = buildResearchThesisSemanticKey('claim', [args.manifest.run_id, source.source_id, source.excerpt])
    evidence.push({
      evidence_id: evidenceId,
      source_id: source.source_id,
      locator: source.locator,
      evidence_type: 'source_quote',
      source_hash: source.content_hash,
      excerpt: source.excerpt.slice(0, 900),
    })
    claims.push({
      claim_id: claimId,
      text: claimTextFromSource(source),
      claim_type: 'fact',
      confidence: source.cache_hit ? 'high' : 'medium',
      evidence_refs: [evidenceId],
    })
  }
  const assumptionClaimId = buildResearchThesisSemanticKey('claim', [args.manifest.run_id, 'assumption', prompt])
  claims.push({
    claim_id: assumptionClaimId,
    text: `User thesis to evaluate: ${prompt.slice(0, 260)}`,
    claim_type: 'assumption',
    confidence: 'medium',
    evidence_refs: [],
  })
  const riskClaimId = buildResearchThesisSemanticKey('claim', [args.manifest.run_id, 'risk', prompt, sourceRefs.length])
  claims.push({
    claim_id: riskClaimId,
    text: 'The thesis can weaken if source evidence is incomplete, stale, or contradicted by later operating metrics.',
    claim_type: 'risk',
    confidence: 'low',
    evidence_refs: [],
  })
  const openQuestionClaimId = buildResearchThesisSemanticKey('claim', [args.manifest.run_id, 'open-question', prompt])
  claims.push({
    claim_id: openQuestionClaimId,
    text: 'What disconfirming evidence would make the thesis invalid before capital or execution is committed?',
    claim_type: 'open_question',
    confidence: 'low',
    evidence_refs: [],
  })
  const firstSourced = claims.find(claim => claim.claim_type === 'fact')
  const logicEdges: ResearchThesisLogicEdge[] = []
  if (firstSourced) {
    logicEdges.push({
      edge_id: buildResearchThesisSemanticKey('edge', [args.manifest.run_id, firstSourced.claim_id, assumptionClaimId, 'supports']),
      from_claim_id: firstSourced.claim_id,
      to_claim_id: assumptionClaimId,
      relation: 'supports',
    })
  }
  logicEdges.push({
    edge_id: buildResearchThesisSemanticKey('edge', [args.manifest.run_id, riskClaimId, assumptionClaimId, 'contradicts']),
    from_claim_id: riskClaimId,
    to_claim_id: assumptionClaimId,
    relation: 'contradicts',
  })
  logicEdges.push({
    edge_id: buildResearchThesisSemanticKey('edge', [args.manifest.run_id, openQuestionClaimId, assumptionClaimId, 'depends_on']),
    from_claim_id: openQuestionClaimId,
    to_claim_id: assumptionClaimId,
    relation: 'depends_on',
  })
  return {
    schema_version: RESEARCH_THESIS_SPEC_SCHEMA_VERSION,
    run_id: args.manifest.run_id,
    thesis_title: title,
    thesis_summary: `Review-first thesis spec for: ${prompt.slice(0, 220)}`,
    source_refs: sourceRefs,
    claims,
    evidence,
    logic_edges: logicEdges,
    monitoring: [
      {
        metric_id: buildResearchThesisSemanticKey('metric', [args.manifest.run_id, 'source-refresh']),
        label: 'Source refresh status',
        source_hint: sourceRefs[0]?.canonical_path || 'user-input',
        refresh_cadence: 'weekly',
      },
      {
        metric_id: buildResearchThesisSemanticKey('metric', [args.manifest.run_id, 'disconfirming-evidence']),
        label: 'Disconfirming evidence count',
        source_hint: 'review ledger',
        refresh_cadence: 'manual',
      },
    ],
  }
}

export function validateResearchThesisSpec(spec: ResearchThesisSpec): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (spec.schema_version !== RESEARCH_THESIS_SPEC_SCHEMA_VERSION) errors.push('schema_version must be research-thesis-spec/v1')
  if (!normalizeText(spec.run_id)) errors.push('run_id is required')
  if (!normalizeText(spec.thesis_title)) errors.push('thesis_title is required')
  const sourceIds = new Set<string>()
  for (const source of spec.source_refs || []) {
    if (!normalizeText(source.source_id)) errors.push('source_ref.source_id is required')
    if (!normalizeText(source.canonical_path)) errors.push(`source_ref ${source.source_id || '<missing>'} canonical_path is required`)
    if (!normalizeText(source.content_hash)) errors.push(`source_ref ${source.source_id || '<missing>'} content_hash is required`)
    sourceIds.add(source.source_id)
  }
  const evidenceIds = new Set<string>()
  for (const item of spec.evidence || []) {
    if (!normalizeText(item.evidence_id)) errors.push('evidence_id is required')
    if (!sourceIds.has(item.source_id)) errors.push(`evidence ${item.evidence_id} references unknown source ${item.source_id}`)
    if (!normalizeText(item.locator)) errors.push(`evidence ${item.evidence_id} locator is required`)
    if (!normalizeText(item.source_hash)) errors.push(`evidence ${item.evidence_id} source_hash is required`)
    evidenceIds.add(item.evidence_id)
  }
  const claimIds = new Set<string>()
  for (const claim of spec.claims || []) {
    if (!normalizeText(claim.claim_id)) errors.push('claim_id is required')
    if (!normalizeText(claim.text)) errors.push(`claim ${claim.claim_id || '<missing>'} text is required`)
    claimIds.add(claim.claim_id)
    const evidenceRefs = Array.isArray(claim.evidence_refs) ? claim.evidence_refs : []
    if (claim.claim_type === 'fact' && evidenceRefs.length < 1) errors.push(`sourced claim ${claim.claim_id} requires evidence_refs`)
    for (const evidenceRef of evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`claim ${claim.claim_id} references unknown evidence ${evidenceRef}`)
    }
  }
  for (const edge of spec.logic_edges || []) {
    if (!claimIds.has(edge.from_claim_id)) errors.push(`edge ${edge.edge_id} references unknown from_claim_id ${edge.from_claim_id}`)
    if (!claimIds.has(edge.to_claim_id)) errors.push(`edge ${edge.edge_id} references unknown to_claim_id ${edge.to_claim_id}`)
  }
  if ((spec.monitoring || []).some(metric => !normalizeText(metric.metric_id) || !normalizeText(metric.label))) {
    errors.push('monitoring metrics require metric_id and label')
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}

export function buildResearchThesisEvidenceLedger(spec: ResearchThesisSpec): ResearchThesisEvidenceLedgerRow[] {
  const evidenceById = new Map(spec.evidence.map(item => [item.evidence_id, item]))
  const contradictedClaimIds = new Set<string>()
  for (const edge of spec.logic_edges || []) {
    if (edge.relation === 'contradicts') {
      contradictedClaimIds.add(edge.from_claim_id)
      contradictedClaimIds.add(edge.to_claim_id)
    }
  }
  return (spec.claims || []).map(claim => {
    let label: ResearchThesisEvidenceLabel = 'sourced'
    if (claim.claim_type === 'open_question') label = 'open_question'
    else if (claim.claim_type === 'assumption') label = 'assumption'
    else if (claim.claim_type === 'calculation') label = 'calculated'
    else if (contradictedClaimIds.has(claim.claim_id)) label = 'contradicted'
    else if (!claim.evidence_refs.length) label = 'assumption'
    return {
      claim_id: claim.claim_id,
      label,
      evidence_refs: [...claim.evidence_refs],
      source_hashes: claim.evidence_refs
        .map(evidenceRef => evidenceById.get(evidenceRef)?.source_hash || '')
        .filter(Boolean),
    }
  })
}

export function buildResearchThesisCandidateGraphDelta(spec: ResearchThesisSpec): ResearchThesisCandidateGraphDelta {
  const ledgerByClaim = new Map(buildResearchThesisEvidenceLedger(spec).map(row => [row.claim_id, row]))
  const nodes: GraphNode[] = (spec.claims || []).map((claim, index) => {
    const ledger = ledgerByClaim.get(claim.claim_id)
    return {
      id: `research:claim:${claim.claim_id}`,
      label: claim.text,
      type: 'ResearchThesisClaim',
      x: 120 + (index % 3) * 260,
      y: 120 + Math.floor(index / 3) * 180,
      properties: {
        'research:runId': asJson(spec.run_id),
        'research:candidate': true,
        'research:claimId': asJson(claim.claim_id),
        'research:claimType': asJson(claim.claim_type),
        'research:confidence': asJson(claim.confidence),
        'evidence:label': asJson(ledger?.label || 'assumption'),
        'evidence:refs': asJson(claim.evidence_refs),
      },
    }
  })
  const edges: GraphEdge[] = (spec.logic_edges || []).map(edge => ({
    id: `research:edge:${edge.edge_id}`,
    source: `research:claim:${edge.from_claim_id}`,
    target: `research:claim:${edge.to_claim_id}`,
    label: edge.relation,
    type: 'ResearchThesisLogicEdge',
    properties: {
      'research:runId': asJson(spec.run_id),
      'research:candidate': true,
      'research:edgeId': asJson(edge.edge_id),
      'research:relation': asJson(edge.relation),
    },
  }))
  return {
    schema_version: RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION,
    run_id: spec.run_id,
    status: 'staged',
    active_graph_mutated: false,
    apply_owner: RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
    graph: {
      type: 'ResearchThesisCandidateGraph',
      metadata: {
        schema_version: RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION,
        run_id: spec.run_id,
        active_graph_mutated: false,
        apply_owner: RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
      },
      nodes,
      edges,
    },
  }
}

export function buildResearchThesisReviewAudit(args: {
  spec: ResearchThesisSpec
  acceptedCandidateIds: string[]
  rejectedCandidateIds?: string[]
}): ResearchThesisReviewAudit {
  const delta = buildResearchThesisCandidateGraphDelta(args.spec)
  const nodesById = new Map(delta.graph.nodes.map(node => [node.id, node]))
  const edgesById = new Map(delta.graph.edges.map(edge => [edge.id, edge]))
  const acceptedIds = Array.from(new Set((args.acceptedCandidateIds || []).map(normalizeText).filter(Boolean)))
  const rejectedIds = Array.from(new Set((args.rejectedCandidateIds || []).map(normalizeText).filter(Boolean)))
  const acceptedNodes = acceptedIds.map(id => nodesById.get(id)).filter((node): node is GraphNode => !!node)
  const acceptedEdges = acceptedIds.map(id => edgesById.get(id)).filter((edge): edge is GraphEdge => !!edge)
  return {
    schema_version: RESEARCH_THESIS_REVIEW_AUDIT_SCHEMA_VERSION,
    run_id: args.spec.run_id,
    accepted_candidate_ids: acceptedIds,
    rejected_candidate_ids: rejectedIds,
    active_graph_mutated: false,
    apply_owner: RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
    accepted_delta: {
      type: 'ResearchThesisAcceptedDelta',
      metadata: {
        run_id: args.spec.run_id,
        apply_owner: RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
        active_graph_mutated: false,
      },
      nodes: acceptedNodes,
      edges: acceptedEdges,
    },
  }
}

export async function compileResearchThesisSpec(
  request: ResearchThesisCompileRequest,
  options: {
    bounds?: ResearchThesisBounds
    summaryCache?: ResearchThesisSummaryCache
    provider?: ResearchThesisProvider
  } = {},
): Promise<ResearchThesisCompileResult> {
  const preflight = await preflightResearchThesisCompileRequest(request, options.bounds || DEFAULT_RESEARCH_THESIS_BOUNDS)
  if (preflight.ok === false) return preflight
  const { summaries, cacheHits } = buildResearchThesisSourceSummaries({
    manifest: preflight.manifest,
    sources: preflight.sources,
    cache: options.summaryCache,
  })
  const manifest: ResearchThesisRunManifest = {
    ...preflight.manifest,
    source_hash_reuse: cacheHits > 0,
  }
  const provider = options.provider || buildDeterministicResearchThesisSpec
  const spec = await provider({
    manifest,
    thesisPrompt: request.thesisPrompt,
    sourceSummaries: summaries,
  })
  const validation = validateResearchThesisSpec(spec)
  const costLog: ResearchThesisCostLog = {
    run_id: manifest.run_id,
    stage: 'compile',
    model: options.provider ? 'configured-provider' : 'offline-mock',
    prompt_tokens: summaries.reduce((sum, summary) => sum + summary.input_tokens_estimate, estimateTokens(request.thesisPrompt)),
    completion_tokens: estimateTokens(JSON.stringify(spec)),
    cache_hits: cacheHits,
    estimated_cost_usd: 0,
    source_hash_reuse: cacheHits > 0,
  }
  if (validation.ok === false) {
    return {
      ok: false,
      error: {
        code: 'schema_validation_failed',
        message: validation.errors.join('; '),
        estimated_input_tokens: manifest.budget.estimated_input_tokens,
        model_call_count: 0,
      },
      cost_log: costLog,
    }
  }
  const evidenceLedger = buildResearchThesisEvidenceLedger(spec)
  return {
    ok: true,
    manifest,
    source_summaries: summaries,
    spec,
    evidence_ledger: evidenceLedger,
    candidate_delta: buildResearchThesisCandidateGraphDelta(spec),
    cost_log: costLog,
    model_call_count: 1,
  }
}
