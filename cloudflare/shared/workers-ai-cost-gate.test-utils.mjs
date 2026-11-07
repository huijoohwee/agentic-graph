export function createWorkersAiTestVerifier({ mode = 'free-fail-closed' } = {}) {
  return async request => ({
    schema: 'agentic-os/verified-effect-cost-evidence/v1',
    status: 'verified-zero-cost',
    provider: request.provider,
    mode,
    billingPlan: mode === 'non-billable' ? 'none' : 'free',
    providerHardCapUsd: mode === 'provider-hard-cap' ? 0 : null,
    quotaExhaustion: mode === 'free-fail-closed' ? 'deny' : 'not-applicable',
    paidPlanActive: false,
    addOnsActive: false,
    overagesEnabled: false,
    autoUpgradeEnabled: false,
    evidenceDigest: 'b'.repeat(64),
    scopeDigest: request.scopeDigest,
    verifiedAt: request.observedAt,
    expiresAt: new Date(Date.parse(request.observedAt) + 60_000).toISOString(),
  })
}
