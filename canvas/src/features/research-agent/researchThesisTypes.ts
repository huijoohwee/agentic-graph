import type { GraphData } from '../../lib/graph/types'

export const RESEARCH_THESIS_SPEC_SCHEMA_VERSION = 'research-thesis-spec/v1'
export const RESEARCH_THESIS_RUN_SCHEMA_VERSION = 'research-thesis-run/v1'
export const RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION = 'research-thesis-candidate-delta/v1'
export const RESEARCH_THESIS_REVIEW_AUDIT_SCHEMA_VERSION = 'research-thesis-review-audit/v1'

export const RESEARCH_THESIS_KGC_APPLY_OWNER = 'canvas/src/features/chat/chatKgcCanvasApply.ts'

export const RESEARCH_THESIS_SOURCE_OWNER_PATHS = [
  'canvas/src/features/research-agent/researchThesisContract.ts',
  'canvas/src/features/research-agent/researchCompilerPanelModel.ts',
  'canvas/src/features/panels/views/ResearchCompilerView.tsx',
  'canvas/src/features/research-agent/researchThesisTypes.ts',
  'cloudflare/workers/agenticgraph-research/index.ts',
  'canvas/src/features/queryable-corpus/corpusGraph.ts',
  'canvas/src/features/queryable-corpus/queryEvidencePack.ts',
  'canvas/src/features/source-files/sourceFilesRuntimeActive.ts',
  RESEARCH_THESIS_KGC_APPLY_OWNER,
  'docs/documents/agenticgraph-research-agent-prd-tad.md',
] as const

export type ResearchThesisClaimType = 'fact' | 'assumption' | 'calculation' | 'forecast' | 'risk' | 'open_question'
export type ResearchThesisConfidence = 'high' | 'medium' | 'low'
export type ResearchThesisEvidenceType = 'source_quote' | 'derived_metric' | 'user_input'
export type ResearchThesisRelation = 'supports' | 'contradicts' | 'depends_on' | 'quantifies' | 'risks'
export type ResearchThesisEvidenceLabel = 'sourced' | 'assumption' | 'calculated' | 'contradicted' | 'open_question'

export type ResearchThesisBounds = {
  maxSourceFiles: number
  maxExtractedWindowsPerSource: number
  maxCompileIterations: number
  maxVerificationFanOut: number
  maxWallClockMs: number
  maxInputTokens: number
  maxOutputTokens: number
}

export const DEFAULT_RESEARCH_THESIS_BOUNDS: ResearchThesisBounds = {
  maxSourceFiles: 5,
  maxExtractedWindowsPerSource: 12,
  maxCompileIterations: 2,
  maxVerificationFanOut: 30,
  maxWallClockMs: 10 * 60 * 1000,
  maxInputTokens: 80_000,
  maxOutputTokens: 12_000,
}

export type ResearchThesisSourceInput = {
  sourceId?: string | null
  canonicalPath: string
  text: string
  contentHash?: string | null
}

export type ResearchThesisSourceRef = {
  source_id: string
  canonical_path: string
  content_hash: string
}

export type ResearchThesisSourceSummary = ResearchThesisSourceRef & {
  excerpt: string
  locator: string
  input_tokens_estimate: number
  cache_hit: boolean
}

export type ResearchThesisCompileRequest = {
  thesisPrompt: string
  sources?: ResearchThesisSourceInput[]
  budget?: Partial<Pick<ResearchThesisBounds, 'maxInputTokens' | 'maxOutputTokens' | 'maxCompileIterations'>> | null
  allowAssumptionDraft?: boolean
  runId?: string | null
  createdAtIso?: string | null
}

export type ResearchThesisRunManifest = {
  schema_version: typeof RESEARCH_THESIS_RUN_SCHEMA_VERSION
  run_id: string
  status: 'manifested'
  created_at: string
  source_refs: ResearchThesisSourceRef[]
  prompt_hash: string
  budget: {
    max_input_tokens: number
    max_output_tokens: number
    estimated_input_tokens: number
  }
  bounds: {
    max_source_files: number
    max_extracted_windows_per_source: number
    max_compile_iterations: number
    max_verification_fan_out: number
    max_wall_clock_ms: number
  }
  source_hash_reuse: boolean
}

export type ResearchThesisClaim = {
  claim_id: string
  text: string
  claim_type: ResearchThesisClaimType
  confidence: ResearchThesisConfidence
  evidence_refs: string[]
}

export type ResearchThesisEvidence = {
  evidence_id: string
  source_id: string
  locator: string
  evidence_type: ResearchThesisEvidenceType
  source_hash: string
  excerpt: string
}

export type ResearchThesisLogicEdge = {
  edge_id: string
  from_claim_id: string
  to_claim_id: string
  relation: ResearchThesisRelation
}

export type ResearchThesisMonitoringMetric = {
  metric_id: string
  label: string
  source_hint: string
  refresh_cadence: 'manual' | 'daily' | 'weekly' | 'monthly'
}

export type ResearchThesisSpec = {
  schema_version: typeof RESEARCH_THESIS_SPEC_SCHEMA_VERSION
  run_id: string
  thesis_title: string
  thesis_summary: string
  source_refs: ResearchThesisSourceRef[]
  claims: ResearchThesisClaim[]
  evidence: ResearchThesisEvidence[]
  logic_edges: ResearchThesisLogicEdge[]
  monitoring: ResearchThesisMonitoringMetric[]
}

export type ResearchThesisEvidenceLedgerRow = {
  claim_id: string
  label: ResearchThesisEvidenceLabel
  evidence_refs: string[]
  source_hashes: string[]
}

export type ResearchThesisCandidateGraphDelta = {
  schema_version: typeof RESEARCH_THESIS_CANDIDATE_DELTA_SCHEMA_VERSION
  run_id: string
  status: 'staged'
  active_graph_mutated: false
  apply_owner: typeof RESEARCH_THESIS_KGC_APPLY_OWNER
  graph: GraphData
}

export type ResearchThesisReviewAudit = {
  schema_version: typeof RESEARCH_THESIS_REVIEW_AUDIT_SCHEMA_VERSION
  run_id: string
  accepted_candidate_ids: string[]
  rejected_candidate_ids: string[]
  active_graph_mutated: false
  apply_owner: typeof RESEARCH_THESIS_KGC_APPLY_OWNER
  accepted_delta: GraphData
}

export type ResearchThesisCostLog = {
  run_id: string
  stage: 'preflight' | 'compile'
  model: string
  prompt_tokens: number
  completion_tokens: number
  cache_hits: number
  estimated_cost_usd: number
  source_hash_reuse: boolean
}

export type ResearchThesisCompileErrorCode =
  | 'invalid_input'
  | 'source_limit_exceeded'
  | 'budget_exceeded'
  | 'schema_validation_failed'

export type ResearchThesisCompileError = {
  code: ResearchThesisCompileErrorCode
  message: string
  estimated_input_tokens: number
  model_call_count: 0
}

export type ResearchThesisCompileResult =
  | {
      ok: true
      manifest: ResearchThesisRunManifest
      source_summaries: ResearchThesisSourceSummary[]
      spec: ResearchThesisSpec
      evidence_ledger: ResearchThesisEvidenceLedgerRow[]
      candidate_delta: ResearchThesisCandidateGraphDelta
      cost_log: ResearchThesisCostLog
      model_call_count: number
    }
  | {
      ok: false
      error: ResearchThesisCompileError
      cost_log: ResearchThesisCostLog
    }

export type ResearchThesisProvider = (args: {
  manifest: ResearchThesisRunManifest
  thesisPrompt: string
  sourceSummaries: ResearchThesisSourceSummary[]
}) => Promise<ResearchThesisSpec> | ResearchThesisSpec

export type ResearchThesisSummaryCache = {
  get?: (contentHash: string) => ResearchThesisSourceSummary | undefined
  set?: (contentHash: string, summary: ResearchThesisSourceSummary) => void
}
