export const MARKETPLACE_PROVIDER_RESPONSE_SCHEMA = 'commerce.marketplace-provider-response/v1'

export const MARKETPLACE_VENDOR_STATES = Object.freeze([
  'pending_review',
  'approved',
  'active',
  'suspended',
] as const)

export const MARKETPLACE_TERMINAL_409_CODES = Object.freeze([
  'authoring_mutation_lease_expired',
  'authoring_mutation_fence_stale',
  'authoring_mutation_fence_conflict',
  'authoring_mutation_id_conflict',
  'transition_rejected',
] as const)

export const MARKETPLACE_RECOVERY_409_CODES = Object.freeze([
  'operational_evidence_binding_invalid',
  'authoring_mutation_permit_invalid',
  'authoring_mutation_payload_mismatch',
  'authoring_mutation_reconciliation_required',
] as const)

export const MARKETPLACE_PROVIDER_RESPONSE_KEYS = Object.freeze({
  vendorList: Object.freeze(['contract', 'ok', 'vendors']),
  vendor: Object.freeze(['actorId', 'mutationId', 'state', 'vendorId']),
  transition: Object.freeze(['actorId', 'contract', 'mutationId', 'ok', 'state', 'vendorId']),
  settlement: Object.freeze(['amountMinor', 'contract', 'currency', 'ok', 'splitId', 'state']),
  error: Object.freeze(['code', 'contract', 'ok']),
})
