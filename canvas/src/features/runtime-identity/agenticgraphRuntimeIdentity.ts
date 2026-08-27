import { useSyncExternalStore } from 'react'
import type { AgenticOsRemoteGrammarSnapshot } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { emptyProgressiveAgentsReadiness } from '@/features/agentic-os/agenticOsProgressiveAgentsReadiness'

declare const __AGENTICGRAPH_SOURCE_REVISION__: string | undefined
declare const __AGENTICGRAPH_RUNTIME_DEVICE__: string | undefined
declare const __AGENTICGRAPH_SOURCE_BRANCH__: string | undefined

const SHA_PATTERN = /^[0-9a-f]{40}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const EMPTY_CATALOG_COUNTS = { slash: 0, hash: 0, at: 0 } as const
const EMPTY_LIVE_PROVIDER_PROOF: AgenticOsRemoteGrammarSnapshot['liveAgentProviderProof'] = {
  schema: 'agent-live-provider-proof-summary/v1',
  status: 'unavailable',
  evidenceSchema: '',
  sourceStatus: '',
  sourceRevision: '',
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
}

const readBuildConstant = (value: unknown): string => String(value || '').trim()

export type AgenticGraphRuntimeIdentity = {
  schema: 'agenticgraph-runtime-identity/v1'
  device: string
  branch: string
  agenticgraphRevision: string
  agenticCanvasOsRevision: string
  catalogRevision: string
  catalogDigest: string
  catalogHydration: {
    status: AgenticOsRemoteGrammarSnapshot['hydration']['status']
    attempts: number
  }
  catalogCounts: AgenticOsRemoteGrammarSnapshot['counts']
  agentLiveProviderProof: AgenticOsRemoteGrammarSnapshot['liveAgentProviderProof']
  progressiveAgentsReadiness: AgenticOsRemoteGrammarSnapshot['progressiveAgentsReadiness']
}

export const readAgenticGraphSourceRevision = (): string => readBuildConstant(
  typeof __AGENTICGRAPH_SOURCE_REVISION__ === 'string' ? __AGENTICGRAPH_SOURCE_REVISION__ : '',
)

export const readAgenticGraphRuntimeDevice = (): string => readBuildConstant(
  typeof __AGENTICGRAPH_RUNTIME_DEVICE__ === 'string' ? __AGENTICGRAPH_RUNTIME_DEVICE__ : 'unknown-device',
) || 'unknown-device'

export const readAgenticGraphSourceBranch = (): string => readBuildConstant(
  typeof __AGENTICGRAPH_SOURCE_BRANCH__ === 'string' ? __AGENTICGRAPH_SOURCE_BRANCH__ : 'unknown',
) || 'unknown'

const buildBaseAgenticGraphRuntimeIdentity = (): AgenticGraphRuntimeIdentity => ({
  schema: 'agenticgraph-runtime-identity/v1',
  device: readAgenticGraphRuntimeDevice(),
  branch: readAgenticGraphSourceBranch(),
  agenticgraphRevision: readAgenticGraphSourceRevision(),
  agenticCanvasOsRevision: '',
  catalogRevision: '',
  catalogDigest: '',
  catalogHydration: { status: 'idle', attempts: 0 },
  catalogCounts: EMPTY_CATALOG_COUNTS,
  agentLiveProviderProof: EMPTY_LIVE_PROVIDER_PROOF,
  progressiveAgentsReadiness: emptyProgressiveAgentsReadiness(),
})

export function buildAgenticGraphRuntimeIdentity(snapshot: AgenticOsRemoteGrammarSnapshot): AgenticGraphRuntimeIdentity {
  return {
    ...buildBaseAgenticGraphRuntimeIdentity(),
    agenticCanvasOsRevision: snapshot.sourceRevision,
    catalogRevision: snapshot.sourceRevision,
    catalogDigest: snapshot.catalogDigest,
    catalogHydration: {
      status: snapshot.hydration.status,
      attempts: snapshot.hydration.attempts,
    },
    catalogCounts: snapshot.counts,
    agentLiveProviderProof: snapshot.liveAgentProviderProof,
    progressiveAgentsReadiness: snapshot.progressiveAgentsReadiness,
  }
}

let canonicalIdentity = buildBaseAgenticGraphRuntimeIdentity()
const identityListeners = new Set<() => void>()

export function publishAgenticGraphAgenticOsIdentity(snapshot: AgenticOsRemoteGrammarSnapshot): void {
  canonicalIdentity = buildAgenticGraphRuntimeIdentity(snapshot)
  identityListeners.forEach(listener => listener())
}

const subscribeAgenticGraphRuntimeIdentity = (listener: () => void): (() => void) => {
  identityListeners.add(listener)
  return () => identityListeners.delete(listener)
}

export const getAgenticGraphRuntimeIdentity = (): AgenticGraphRuntimeIdentity => canonicalIdentity

export function useAgenticGraphRuntimeIdentity(): AgenticGraphRuntimeIdentity {
  return useSyncExternalStore(
    subscribeAgenticGraphRuntimeIdentity,
    getAgenticGraphRuntimeIdentity,
    getAgenticGraphRuntimeIdentity,
  )
}

export function isAgentLiveProviderProofVerified(
  proof: AgenticGraphRuntimeIdentity['agentLiveProviderProof'],
  agenticCanvasOsRevision: string,
): boolean {
  const expectedSourceUrl = `https://github.com/huijoohwee/agentic-canvas-os/blob/${proof.proofRevision}/docs/LIVE-AGENT-PROVIDER-PROOF.md`
  return proof.schema === 'agent-live-provider-proof-summary/v1'
    && proof.status === 'verified-bounded-live'
    && proof.evidenceSchema === 'agent-live-provider-proof-contract/v1'
    && proof.sourceStatus === 'runtime-ready-dev'
    && proof.sourceRevision === agenticCanvasOsRevision
    && SHA_PATTERN.test(proof.proofRevision)
    && proof.sourcePath === 'docs/LIVE-AGENT-PROVIDER-PROOF.md'
    && proof.sourceUrl === expectedSourceUrl
    && Boolean(proof.model && proof.reasoningEffort)
    && Number.isInteger(proof.providerCalls) && proof.providerCalls > 0
    && Number.isInteger(proof.inputTokens) && proof.inputTokens >= 0
    && Number.isInteger(proof.outputTokens) && proof.outputTokens >= 0
    && Number.isInteger(proof.cachedInputTokens) && proof.cachedInputTokens >= 0
    && Number.isFinite(proof.estimatedCostUsd) && proof.estimatedCostUsd >= 0
    && proof.finalAnswerOwners.delegation === 'manager'
    && proof.finalAnswerOwners.handoff === 'specialist'
    && proof.continuationContext === 'all_turns'
    && proof.defaultWorkerConfigured === false
}

export function isAgenticGraphRuntimeIdentityFresh(identity: AgenticGraphRuntimeIdentity): boolean {
  return SHA_PATTERN.test(identity.agenticgraphRevision)
    && SHA_PATTERN.test(identity.agenticCanvasOsRevision)
    && identity.catalogRevision === identity.agenticCanvasOsRevision
    && SHA256_PATTERN.test(identity.catalogDigest)
    && identity.catalogHydration.status === 'fresh'
    && identity.catalogHydration.attempts >= 0
    && identity.catalogHydration.attempts <= 2
    && isAgentLiveProviderProofVerified(identity.agentLiveProviderProof, identity.agenticCanvasOsRevision)
    && isProgressiveAgentsReadinessVerified(identity.progressiveAgentsReadiness, identity.agenticCanvasOsRevision)
}

export function isProgressiveAgentsReadinessVerified(
  readiness: AgenticGraphRuntimeIdentity['progressiveAgentsReadiness'],
  agenticCanvasOsRevision: string,
): boolean {
  const expectedSourceUrl = `https://github.com/huijoohwee/agentic-canvas-os/blob/${agenticCanvasOsRevision}/docs/PROGRESSIVE-AGENTS.md`
  return readiness.schema === 'progressive-agents-readiness-summary/v1'
    && readiness.status === 'runtime-ready-dev'
    && readiness.sourceRevision === agenticCanvasOsRevision
    && readiness.sourcePath === 'docs/PROGRESSIVE-AGENTS.md'
    && readiness.sourceUrl === expectedSourceUrl
    && readiness.contractSchema === 'progressive-agents-runtime-contract/v1'
    && Boolean(readiness.runtimeScope)
    && readiness.runtimeOwner === '../agent-api/src/progressive-agents.js'
    && readiness.runtimeProof === '../__tests__/progressive-agents.test.mjs'
    && readiness.contractReady
    && readiness.configured === false
    && readiness.progressionPolicy === 'single-agent-then-tools-then-specialists'
    && readiness.growthStages.join(',') === 'single-agent,tool-enabled-agent,specialist-workflow'
    && readiness.externalSdkDependency === false
    && readiness.providerExecutionStatus === 'unverified'
    && readiness.defaultWorkerConfigured === false
    && readiness.deployPolicy === 'Dev-only until explicit operator approval'
}

export const serializeAgenticGraphRuntimeIdentity = (identity: AgenticGraphRuntimeIdentity): string => `${JSON.stringify(identity, null, 2)}\n`
