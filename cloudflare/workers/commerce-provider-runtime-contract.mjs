export const COMMERCE_PROVIDER_RUNTIME_SPECS = Object.freeze({
  discovery: Object.freeze({
    id: 'discovery',
    contract: 'commerce.discovery-provider/v1',
    storageRevision: 'commerce-discovery-mcp-v1',
    checks: Object.freeze([
      'invocation_catalog_parity', 'offer_receipt_binding', 'registered_agent_dispatch',
    ]),
    capabilities: Object.freeze({
      ok: true,
      contract: 'commerce.discovery-provider/v1',
      transport: 'mcp/streamable-http',
      tools: Object.freeze(['commerce.flight.discover', 'commerce.experience.discover']),
    }),
  }),
  checkout: Object.freeze({
    id: 'checkout',
    contract: 'commerce.checkout-provider/v1',
    storageRevision: 'commerce-checkout-do-sqlite-v1',
    checks: Object.freeze([
      'guardrail_before_confirmation', 'human_confirmation_before_issuance',
      'issuance_only_payment_caller', 'settlement_readback',
    ]),
    capabilities: Object.freeze({
      ok: true,
      contract: 'commerce.checkout-provider/v1',
      operations: Object.freeze(['prepare', 'confirm', 'status', 'offer-observe']),
    }),
  }),
  marketplace: Object.freeze({
    id: 'marketplace',
    contract: 'commerce.marketplace-provider/v1',
    storageRevision: 'marketplace-d1-0017',
    checks: Object.freeze([
      'active_vendor_at_dispatch', 'authoring_fence_atomic', 'commission_reproduction',
      'payout_idempotency', 'registry_canvas_parity', 'same_transaction_split_projection',
      'settlement_verified_before_payout', 'stored_row_reconstruction',
    ]),
    capabilities: Object.freeze({
      ok: true,
      contract: 'commerce.marketplace-provider/v1',
      operations: Object.freeze(['vendor-list', 'vendor-transition-fenced', 'settlement-read']),
    }),
  }),
})
