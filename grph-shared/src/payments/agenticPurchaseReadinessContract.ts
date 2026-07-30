import {
  AGENTIC_PURCHASE_PHASES,
  AGENTIC_PURCHASE_READINESS_CHECKS,
  AGENTIC_PURCHASE_SCHEMA_ID,
  type AgenticPurchaseCleanupAction,
  type AgenticPurchaseEnvelope,
  type AgenticPurchaseLifecycleSnapshot,
  type AgenticPurchasePhase,
  type AgenticPurchaseReadinessCheck,
  type AgenticPurchaseReadinessSnapshot,
} from './agenticPurchaseRuntimeContract.js'

const PHASE_REQUIRED_CHECKS = Object.freeze({
  funding: Object.freeze([
    'requirementsAuthority',
    'trustedInvocation',
    'durableLifecycleStore',
    'kycAccountGrant',
    'xsgdAvalancheTuple',
    'externalSigner',
    'providerCreditAuthority',
    'cardSettlementBridge',
  ] as const),
  discovery: Object.freeze([
    'requirementsAuthority',
    'trustedInvocation',
    'durableLifecycleStore',
    'browserControlOwner',
    'allowedMerchantFixture',
    'discoveryCancellation',
    'modelCostObserver',
  ] as const),
  issuance: Object.freeze([
    'requirementsAuthority',
    'durableLifecycleStore',
    'durableApprovalStore',
    'cardProgramGrant',
    'virtualCardProduct',
    'cardPool',
    'remoteHostAuthorization',
    'secureCardBroker',
    'cardSettlementBridge',
  ] as const),
  execution: Object.freeze([
    'requirementsAuthority',
    'durableLifecycleStore',
    'allowedMerchantFixture',
    'remoteHostAuthorization',
    'secureCardBroker',
    'cardDisposalContract',
    'browserProof',
    'cardSettlementBridge',
  ] as const),
}) satisfies Readonly<
  Record<AgenticPurchasePhase, readonly AgenticPurchaseReadinessCheck[]>
>

const PHASE_PRESENTATION: Readonly<
  Record<AgenticPurchasePhase, Readonly<{ label: string; nextAction: string }>>
> = Object.freeze({
  funding: Object.freeze({
    label: 'Funding',
    nextAction: 'Verify the XSGD account and Avalanche funding tuple',
  }),
  discovery: Object.freeze({
    label: 'Discovery',
    nextAction: 'Find one item inside the frozen purchase envelope',
  }),
  issuance: Object.freeze({
    label: 'Issuance',
    nextAction: 'Approve and issue one bounded virtual card',
  }),
  execution: Object.freeze({
    label: 'Execution',
    nextAction: 'Revalidate and complete one secure checkout',
  }),
})

export const AGENTIC_PURCHASE_LOCAL_DETERMINISTIC_CHECKS = Object.freeze({
  requirementsAuthority: true,
  trustedInvocation: true,
  durableLifecycleStore: true,
  xsgdAvalancheTuple: true,
  discoveryCancellation: true,
  modelCostObserver: true,
  durableApprovalStore: true,
  cardDisposalContract: true,
}) satisfies Partial<Record<AgenticPurchaseReadinessCheck, boolean>>

export const buildAgenticPurchaseReadiness = (
  checks: Partial<Record<AgenticPurchaseReadinessCheck, boolean>> = {},
): AgenticPurchaseReadinessSnapshot => {
  const phases = AGENTIC_PURCHASE_PHASES.map(phase => {
    const requiredChecks = PHASE_REQUIRED_CHECKS[phase]
    const missingChecks = requiredChecks.filter(check => checks[check] !== true)
    return Object.freeze({
      phase,
      ready: missingChecks.length === 0,
      status: missingChecks.length === 0
        ? 'ready' as const
        : 'blocked' as const,
      requiredChecks,
      missingChecks: Object.freeze(missingChecks),
    })
  })
  const unavailableSources = AGENTIC_PURCHASE_READINESS_CHECKS
    .filter(check => checks[check] !== true)
  return Object.freeze({
    schemaId: AGENTIC_PURCHASE_SCHEMA_ID,
    runtimeReady: phases.every(phase => phase.ready),
    phases: Object.freeze(phases),
    unavailableSources: Object.freeze(unavailableSources),
    providerCallCount: 0 as const,
    modelCallCount: 0 as const,
    modelCostUsd: 0 as const,
  })
}

export const buildAgenticPurchaseLifecyclePreview = (
  envelope: AgenticPurchaseEnvelope,
  readiness: AgenticPurchaseReadinessSnapshot,
): AgenticPurchaseLifecycleSnapshot => {
  const fundingReady = readiness.phases[0]?.ready === true
  return Object.freeze({
    schemaId: AGENTIC_PURCHASE_SCHEMA_ID,
    lifecycleId: `purchase_${envelope.lifecycleKey.toLowerCase()}`,
    lifecycleKey: envelope.lifecycleKey,
    phase: 'funding' as const,
    phaseState: fundingReady ? 'ready' as const : 'blocked' as const,
    nextAction: fundingReady
      ? PHASE_PRESENTATION.funding.nextAction
      : 'Resolve every Funding readiness blocker before approval',
    cancelled: false,
    financialStateExists: false,
    cleanupActions: Object.freeze([]),
    phases: Object.freeze(AGENTIC_PURCHASE_PHASES.map((phase, index) => {
      const phaseReadiness = readiness.phases[index]
      return Object.freeze({
        phase,
        state: phase === 'funding'
          ? phaseReadiness?.ready ? 'ready' as const : 'blocked' as const
          : 'waiting' as const,
        ...PHASE_PRESENTATION[phase],
      })
    })),
    providerCallCount: 0,
    financialCallCount: 0,
  })
}

export const cancelAgenticPurchaseLifecycle = (
  snapshot: AgenticPurchaseLifecycleSnapshot,
): AgenticPurchaseLifecycleSnapshot => {
  const cleanupActions: AgenticPurchaseCleanupAction[] =
    snapshot.financialStateExists
      ? [
          'release_unused_funding_reservation',
          'reconcile_provider_outcome',
          'block_new_authorizations',
          'safe_close_card',
        ]
      : []
  return Object.freeze({
    ...snapshot,
    phaseState: 'cancelled' as const,
    nextAction: cleanupActions.length === 0
      ? 'No financial call was made'
      : 'New spend is blocked while mandatory cleanup completes',
    cancelled: true,
    cleanupActions: Object.freeze(cleanupActions),
    phases: Object.freeze(snapshot.phases.map(phase => Object.freeze({
      ...phase,
      state: phase.phase === snapshot.phase
        ? 'cancelled' as const
        : phase.state,
    }))),
    providerCallCount: snapshot.providerCallCount,
    financialCallCount: snapshot.financialCallCount,
  })
}
