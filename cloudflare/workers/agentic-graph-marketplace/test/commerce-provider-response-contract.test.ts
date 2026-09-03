import { describe, expect, it } from 'vitest'

import {
  MARKETPLACE_PROVIDER_RESPONSE_KEYS,
  MARKETPLACE_PROVIDER_RESPONSE_SCHEMA,
  MARKETPLACE_RECOVERY_409_CODES,
  MARKETPLACE_TERMINAL_409_CODES,
  MARKETPLACE_VENDOR_STATES,
} from '../../commerce-marketplace-provider-response-contract.ts'

describe('Commerce marketplace response contract', () => {
  it('pins the owner state vocabulary and exact response keys', () => {
    expect(MARKETPLACE_PROVIDER_RESPONSE_SCHEMA).toBe('commerce.marketplace-provider-response/v1')
    expect(MARKETPLACE_VENDOR_STATES).toEqual(['pending_review', 'approved', 'active', 'suspended'])
    expect(MARKETPLACE_PROVIDER_RESPONSE_KEYS).toEqual({
      vendorList: ['contract', 'ok', 'vendors'],
      vendor: ['actorId', 'mutationId', 'state', 'vendorId'],
      transition: ['actorId', 'contract', 'mutationId', 'ok', 'state', 'vendorId'],
      settlement: ['amountMinor', 'contract', 'currency', 'ok', 'splitId', 'state'],
      error: ['code', 'contract', 'ok'],
    })
  })

  it('keeps terminal reservation retirement disjoint from recovery-required 409s', () => {
    expect(MARKETPLACE_TERMINAL_409_CODES).toEqual([
      'authoring_mutation_lease_expired',
      'authoring_mutation_fence_stale',
      'authoring_mutation_fence_conflict',
      'authoring_mutation_id_conflict',
      'transition_rejected',
    ])
    expect(MARKETPLACE_RECOVERY_409_CODES).toEqual([
      'operational_evidence_binding_invalid',
      'authoring_mutation_permit_invalid',
      'authoring_mutation_payload_mismatch',
      'authoring_mutation_reconciliation_required',
    ])
    expect(MARKETPLACE_TERMINAL_409_CODES.some((code) =>
      MARKETPLACE_RECOVERY_409_CODES.includes(code as never))).toBe(false)
  })
})
