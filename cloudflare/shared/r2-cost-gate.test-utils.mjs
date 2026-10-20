export function createZeroCostR2TestVerifier(overrides = {}) {
  return async request => {
    const mode = overrides.mode ?? 'provider-hard-cap'
    return {
      schema: 'agentic-os/verified-effect-cost-evidence/v1',
      status: 'verified-zero-cost',
      provider: request.provider,
      mode,
      billingPlan: mode === 'free-fail-closed' ? 'free' : mode === 'non-billable' ? 'none' : 'free',
      providerHardCapUsd: mode === 'provider-hard-cap' ? 0 : null,
      quotaExhaustion: mode === 'free-fail-closed' ? 'deny' : 'not-applicable',
      paidPlanActive: false,
      addOnsActive: false,
      overagesEnabled: false,
      autoUpgradeEnabled: false,
      evidenceDigest: 'a'.repeat(64),
      scopeDigest: request.scopeDigest,
      verifiedAt: request.observedAt,
      expiresAt: new Date(Date.parse(request.observedAt) + 60_000).toISOString(),
    }
  }
}
