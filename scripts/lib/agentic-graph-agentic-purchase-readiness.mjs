const blocker = (id, gate, detail) => Object.freeze({
  id,
  gate,
  detail,
  evidence: Object.freeze([
    '.kiro/specs/agentic-graph-payments/requirements.md',
    'docs/documents/agentic-graph-payments-prd-tad.md',
  ]),
})

const EXTERNAL_BLOCKERS = Object.freeze([
  blocker(
    'agentic-purchase-xsgd-account-and-bridge',
    'providerSandbox',
    'OQ-9 and OQ-18 require an authenticated KYC account, exact Avalanche XSGD deposit tuple, provider credit, external signer, and XSGD-to-card settlement authority.',
  ),
  blocker(
    'agentic-purchase-card-program',
    'providerSandbox',
    'OQ-17 and OQ-21 require Card Program grants plus a provider-reviewed authorization and safe-disposal contract.',
  ),
  blocker(
    'agentic-purchase-secure-card-broker',
    'providerSandbox',
    'OQ-19 requires an approved PCI-scoped credential broker and planted-secret proof.',
  ),
  blocker(
    'agentic-purchase-merchant-browser',
    'browser',
    'OQ-20 and OQ-23 require an approved merchant fixture and canonical browser-control owner before Discovery or Execution browser proof.',
  ),
  blocker(
    'agentic-purchase-external-invocation',
    'protectedIntegration',
    'OQ-24 requires Agentic Canvas OS owner acceptance before any external slash, semantic, binding, or MCP lifecycle identity is exposed.',
  ),
])

export const inspectAgenticGraphAgenticPurchaseReadiness = source => Object.freeze({
  status: 'blocked',
  requiredForExit: true,
  boundary: 'deterministic-local',
  localDeterministicStatus: source.localVcc.status,
  sourceEvidenceDigest: source.evidenceDigest,
  providerCallCount: 0,
  modelCallCount: 0,
  modelCostUsd: 0,
  claims: Object.freeze({
    providerSandboxProven: false,
    browserProven: false,
    protectedIntegrationProven: false,
    deployed: false,
  }),
  blockers: EXTERNAL_BLOCKERS,
})
