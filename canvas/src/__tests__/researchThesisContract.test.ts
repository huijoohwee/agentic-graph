import fs from 'node:fs'
import path from 'node:path'
import {
  RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER,
  RESEARCH_THESIS_SOURCE_OWNER_PATHS,
  buildResearchThesisReviewAudit,
  compileResearchThesisSpec,
} from '@/features/research-agent/researchThesisContract'

const repoRoot = path.resolve(process.cwd(), '..')

const source = (text = 'Revenue grew while margins compressed. Later guidance flagged demand uncertainty.') => ({
  canonicalPath: '/workspace/research/source-a.md',
  text,
})

export async function testResearchThesisCompileWritesManifestAndRejectsInvalidInputBeforeModelCall() {
  let providerCalls = 0
  const invalid = await compileResearchThesisSpec({
    thesisPrompt: 'thesis',
    sources: [],
  }, {
    provider: async args => {
      providerCalls += 1
      return {
        schema_version: 'research-thesis-spec/v1',
        run_id: args.manifest.run_id,
        thesis_title: 'invalid',
        thesis_summary: 'invalid',
        source_refs: [],
        claims: [],
        evidence: [],
        logic_edges: [],
        monitoring: [],
      }
    },
  })
  if (invalid.ok === true) throw new Error('expected empty source selection to fail without explicit assumption-draft mode')
  if (invalid.error.model_call_count !== 0 || providerCalls !== 0) {
    throw new Error('expected invalid input to avoid model calls')
  }

  const valid = await compileResearchThesisSpec({
    thesisPrompt: 'Evaluate whether the operating leverage story is investable after the latest source review.',
    sources: [source()],
    createdAtIso: '2026-06-03T00:00:00.000Z',
  })
  if (valid.ok === false) throw new Error(`expected valid research thesis compile, got ${valid.error.message}`)
  if (!valid.manifest.run_id.startsWith('kgra_run_')) throw new Error(`expected semantic run id, got ${valid.manifest.run_id}`)
  if (valid.manifest.source_refs.length !== 1) throw new Error('expected manifest to contain selected source refs')
  if (!valid.manifest.source_refs[0].content_hash.startsWith('sha256:')) {
    throw new Error(`expected source hash to be sha256-prefixed, got ${valid.manifest.source_refs[0].content_hash}`)
  }
  if (valid.spec.schema_version !== 'research-thesis-spec/v1') throw new Error('expected schema-valid thesis spec')
  if (valid.candidate_delta.active_graph_mutated !== false) throw new Error('expected candidate delta to avoid active graph mutation')
}

export async function testResearchThesisBudgetAndCacheGuardrailsStopChurn() {
  let providerCalls = 0
  const overBudget = await compileResearchThesisSpec({
    thesisPrompt: 'Evaluate whether the operating leverage story is investable.',
    sources: [source('x'.repeat(2000))],
    budget: { maxInputTokens: 10 },
  }, {
    provider: async args => {
      providerCalls += 1
      return {
        schema_version: 'research-thesis-spec/v1',
        run_id: args.manifest.run_id,
        thesis_title: 'over budget',
        thesis_summary: 'over budget',
        source_refs: args.manifest.source_refs,
        claims: [],
        evidence: [],
        logic_edges: [],
        monitoring: [],
      }
    },
  })
  if (overBudget.ok === true || overBudget.error.code !== 'budget_exceeded') {
    throw new Error('expected budget cap to stop before compile')
  }
  if (providerCalls !== 0) throw new Error('expected budget cap to avoid provider calls')

  const cache = new Map()
  const first = await compileResearchThesisSpec({
    thesisPrompt: 'Evaluate the monitored thesis from the selected sources.',
    sources: [source()],
  }, { summaryCache: cache })
  const second = await compileResearchThesisSpec({
    thesisPrompt: 'Evaluate the monitored thesis from the selected sources.',
    sources: [source()],
  }, { summaryCache: cache })
  if (first.ok === false || second.ok === false) throw new Error('expected cached compile fixtures to pass')
  if (first.cost_log.cache_hits !== 0) throw new Error('expected first compile to build source summary')
  if (second.cost_log.cache_hits !== 1 || second.manifest.source_hash_reuse !== true) {
    throw new Error('expected unchanged source hash to reuse cached extraction artifact before compile')
  }
}

export async function testResearchThesisEvidenceLedgerAndReviewAuditStayStaged() {
  const result = await compileResearchThesisSpec({
    thesisPrompt: 'Evaluate whether the risk-adjusted thesis is investable.',
    sources: [source()],
  })
  if (result.ok === false) throw new Error('expected research thesis compile to pass')
  const labels = new Set(result.evidence_ledger.map(row => row.label))
  for (const required of ['sourced', 'assumption', 'open_question'] as const) {
    if (!labels.has(required)) throw new Error(`expected evidence ledger to include ${required}`)
  }
  if (!labels.has('contradicted')) throw new Error('expected contradiction relation to be represented in ledger')
  const acceptedNodeId = result.candidate_delta.graph.nodes[0]?.id
  const rejectedNodeId = result.candidate_delta.graph.nodes[1]?.id
  const audit = buildResearchThesisReviewAudit({
    spec: result.spec,
    acceptedCandidateIds: [acceptedNodeId],
    rejectedCandidateIds: [rejectedNodeId],
  })
  if (audit.apply_owner !== RESEARCH_THESIS_AGENTIC_OS_APPLY_OWNER) {
    throw new Error('expected accepted research candidates to name the existing AGENTIC_OS apply owner')
  }
  if (audit.active_graph_mutated !== false) throw new Error('expected review audit to stay staged')
  if (audit.accepted_delta.nodes.length !== 1) throw new Error('expected accepted delta to contain only accepted candidates')
  if (audit.accepted_delta.nodes.some(node => node.id === rejectedNodeId)) {
    throw new Error('expected rejected candidate to stay out of accepted graph delta')
  }
}

export function testResearchThesisSourceOwnerMapExistsAndAvoidsAliases() {
  for (const owner of RESEARCH_THESIS_SOURCE_OWNER_PATHS) {
    const abs = path.resolve(repoRoot, owner)
    if (!fs.existsSync(abs)) throw new Error(`expected research thesis owner to exist: ${owner}`)
  }
  const ownerText = RESEARCH_THESIS_SOURCE_OWNER_PATHS.join('\n')
  for (const forbidden of ['AGENTIC_OSSeedPipeline', 'AGENTIC_OSReasoner', 'AGENTIC_OSSkillLoop', 'AGENTIC_OSSimulator', 'scripts/agenticOs_seed.py']) {
    if (ownerText.includes(forbidden)) throw new Error(`expected research thesis owner map to avoid legacy owner ${forbidden}`)
  }
}
