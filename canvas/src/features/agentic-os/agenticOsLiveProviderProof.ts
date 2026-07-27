export type AgenticOsLiveProviderProofSummary = {
  schema: 'agent-live-provider-proof-summary/v1'
  status: 'verified-bounded-live' | 'unavailable'
  evidenceSchema: string
  sourceStatus: string
  sourceRevision: string
  proofRevision: string
  sourcePath: string
  sourceUrl: string
  model: string
  reasoningEffort: string
  providerCalls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  estimatedCostUsd: number
  finalAnswerOwners: {
    delegation: string
    handoff: string
  }
  continuationContext: string
  defaultWorkerConfigured: boolean
}

const normalizeString = (value: unknown): string => String(value || '').trim()

export const emptyLiveProviderProof = (sourceRevision = ''): AgenticOsLiveProviderProofSummary => ({
  schema: 'agent-live-provider-proof-summary/v1',
  status: 'unavailable',
  evidenceSchema: '',
  sourceStatus: '',
  sourceRevision,
  proofRevision: '',
  sourcePath: 'docs/LIVE-AGENT-PROVIDER-PROOF.md',
  sourceUrl: '',
  model: '',
  reasoningEffort: '',
  providerCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  estimatedCostUsd: 0,
  finalAnswerOwners: { delegation: '', handoff: '' },
  continuationContext: '',
  defaultWorkerConfigured: false,
})

export const normalizeLiveProviderProof = (
  value: unknown,
  sourceRevision: string,
): AgenticOsLiveProviderProofSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyLiveProviderProof(sourceRevision)
  const proof = value as Record<string, unknown>
  const owners = proof.finalAnswerOwners && typeof proof.finalAnswerOwners === 'object' && !Array.isArray(proof.finalAnswerOwners)
    ? proof.finalAnswerOwners as Record<string, unknown>
    : {}
  const numberValue = (candidate: unknown): number => Number.isFinite(Number(candidate)) ? Number(candidate) : 0
  const proofRevision = normalizeString(proof.proofRevision)
  const proofSourceRevision = normalizeString(proof.sourceRevision)
  const evidenceSchema = normalizeString(proof.evidenceSchema)
  const sourceStatus = normalizeString(proof.sourceStatus)
  const model = normalizeString(proof.model)
  const reasoningEffort = normalizeString(proof.reasoningEffort)
  const providerCalls = numberValue(proof.providerCalls)
  const inputTokens = numberValue(proof.inputTokens)
  const outputTokens = numberValue(proof.outputTokens)
  const cachedInputTokens = numberValue(proof.cachedInputTokens)
  const estimatedCostUsd = numberValue(proof.estimatedCostUsd)
  const delegationOwner = normalizeString(owners.delegation)
  const handoffOwner = normalizeString(owners.handoff)
  const continuationContext = normalizeString(proof.continuationContext)
  const verified = proof.schema === 'agent-live-provider-proof-summary/v1'
    && proof.status === 'verified-bounded-live'
    && proofSourceRevision === sourceRevision
    && /^[0-9a-f]{40}$/.test(proofRevision)
    && evidenceSchema === 'agent-live-provider-proof-contract/v1'
    && sourceStatus === 'runtime-ready-dev'
    && Boolean(model && reasoningEffort)
    && Number.isInteger(providerCalls) && providerCalls > 0
    && Number.isInteger(inputTokens) && inputTokens >= 0
    && Number.isInteger(outputTokens) && outputTokens >= 0
    && Number.isInteger(cachedInputTokens) && cachedInputTokens >= 0
    && estimatedCostUsd >= 0
    && delegationOwner === 'manager'
    && handoffOwner === 'specialist'
    && continuationContext === 'all_turns'
    && proof.defaultWorkerConfigured === false
  return {
    schema: 'agent-live-provider-proof-summary/v1',
    status: verified ? 'verified-bounded-live' : 'unavailable',
    evidenceSchema,
    sourceStatus,
    sourceRevision: proofSourceRevision || sourceRevision,
    proofRevision,
    sourcePath: 'docs/LIVE-AGENT-PROVIDER-PROOF.md',
    sourceUrl: /^[0-9a-f]{40}$/.test(proofRevision)
      ? `https://github.com/huijoohwee/agentic-canvas-os/blob/${proofRevision}/docs/LIVE-AGENT-PROVIDER-PROOF.md`
      : '',
    model,
    reasoningEffort,
    providerCalls,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    estimatedCostUsd,
    finalAnswerOwners: {
      delegation: delegationOwner,
      handoff: handoffOwner,
    },
    continuationContext,
    defaultWorkerConfigured: proof.defaultWorkerConfigured === true,
  }
}
