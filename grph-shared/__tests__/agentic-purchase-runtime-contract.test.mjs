import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENTIC_PURCHASE_AVALANCHE_NETWORK,
  AGENTIC_PURCHASE_LIMITS,
  AGENTIC_PURCHASE_PHASES,
  assertAgenticPurchaseDataMinimized,
  buildAgenticPurchaseEnvelopeDigestInput,
  validateAgenticPurchaseCandidate,
  validateAgenticPurchaseDiscoveryObservation,
  validateAgenticPurchaseEnvelope,
} from '../dist/payments/agenticPurchaseRuntimeContract.js'
import {
  buildAgenticPurchaseLifecyclePreview,
  buildAgenticPurchaseReadiness,
  cancelAgenticPurchaseLifecycle,
} from '../dist/payments/agenticPurchaseReadinessContract.js'

const NOW_MS = Date.parse('2026-07-29T04:00:00.000Z')
const ENVELOPE_INPUT = Object.freeze({
  lifecycleKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  allowedOrigins: ['https://merchant.example'],
  item: {
    query: 'noise-cancelling headphones',
    requiredAttributes: ['black', 'wireless'],
  },
  quantity: 1,
  maximumTotalMinor: 20_000,
  currency: 'sgd',
  expiresAt: '2026-07-29T05:00:00.000Z',
})

const CANDIDATE_INPUT = Object.freeze({
  merchantOrigin: 'https://merchant.example',
  canonicalProductUrl: 'https://merchant.example/products/headphones',
  product: 'Noise-cancelling headphones',
  variant: 'Black',
  quantity: 1,
  itemAmountMinor: 18_000,
  shippingMinor: 1_000,
  taxMinor: 1_000,
  totalMinor: 20_000,
  currency: 'sgd',
  observedAt: '2026-07-29T03:59:00.000Z',
  evidenceSelectors: ['script[type="application/ld+json"]', '[data-total]'],
})

const readEnvelope = () => {
  const result = validateAgenticPurchaseEnvelope(ENVELOPE_INPUT, NOW_MS)
  assert.equal(result.ok, true)
  return result.value
}

test('purchase envelope freezes one bounded HTTPS-origin SGD instruction', () => {
  const envelope = readEnvelope()
  assert.deepEqual(envelope.allowedOrigins, ['https://merchant.example'])
  assert.equal(envelope.quantity, 1)
  assert.equal(envelope.currency, 'sgd')

  const digestInput = buildAgenticPurchaseEnvelopeDigestInput(envelope)
  assert.equal(digestInput, buildAgenticPurchaseEnvelopeDigestInput({
    ...envelope,
    allowedOrigins: [...envelope.allowedOrigins].reverse(),
    item: {
      ...envelope.item,
      requiredAttributes: [...envelope.item.requiredAttributes].reverse(),
    },
  }))
  assert.equal(AGENTIC_PURCHASE_AVALANCHE_NETWORK.chainId, 43114)
})

test('malformed, expired, unsafe-origin, and changed-quantity instructions reject before calls', () => {
  const rejected = [
    { ...ENVELOPE_INPUT, lifecycleKey: 'not-a-uuid' },
    { ...ENVELOPE_INPUT, allowedOrigins: ['http://merchant.example'] },
    { ...ENVELOPE_INPUT, allowedOrigins: ['https://merchant.example/path'] },
    { ...ENVELOPE_INPUT, quantity: 2 },
    { ...ENVELOPE_INPUT, currency: 'usd' },
    { ...ENVELOPE_INPUT, expiresAt: '2026-07-29T03:59:59.000Z' },
    {
      ...ENVELOPE_INPUT,
      expiresAt: new Date(
        NOW_MS + AGENTIC_PURCHASE_LIMITS.maximumEnvelopeTtlMs + 1,
      ).toISOString(),
    },
  ]
  for (const input of rejected) {
    const result = validateAgenticPurchaseEnvelope(input, NOW_MS)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'purchase_instruction_rejected')
  }
})

test('candidate validation binds origin, URL, quantity, exact total, currency, and freshness', () => {
  const envelope = readEnvelope()
  const valid = validateAgenticPurchaseCandidate(
    CANDIDATE_INPUT,
    envelope,
    NOW_MS,
  )
  assert.equal(valid.ok, true)

  const rejected = [
    { ...CANDIDATE_INPUT, merchantOrigin: 'https://attacker.example' },
    {
      ...CANDIDATE_INPUT,
      canonicalProductUrl: 'https://attacker.example/products/headphones',
    },
    { ...CANDIDATE_INPUT, quantity: 2 },
    { ...CANDIDATE_INPUT, totalMinor: 19_999 },
    { ...CANDIDATE_INPUT, shippingMinor: 1_001 },
    { ...CANDIDATE_INPUT, currency: 'usd' },
    { ...CANDIDATE_INPUT, observedAt: '2026-07-29T03:49:59.999Z' },
    { ...CANDIDATE_INPUT, evidenceSelectors: [] },
  ]
  for (const input of rejected) {
    const result = validateAgenticPurchaseCandidate(input, envelope, NOW_MS)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'purchase_candidate_rejected')
  }
})

test('discovery aborts on cancellation, injection, bounds, and missing model cost logs', () => {
  const envelope = readEnvelope()
  const baseline = {
    candidate: CANDIDATE_INPUT,
    productPagesVisited: 1,
    browserActionCount: 2,
    modelCallCount: 0,
    modelCostLogCount: 0,
    injectionSignals: [],
    cancelled: false,
  }
  assert.equal(
    validateAgenticPurchaseDiscoveryObservation(
      baseline,
      envelope,
      NOW_MS,
    ).ok,
    true,
  )

  const cases = [
    [{ ...baseline, cancelled: true }, 'discovery_cancelled'],
    [
      { ...baseline, injectionSignals: ['page_requested_policy_change'] },
      'discovery_injection_detected',
    ],
    [
      {
        ...baseline,
        productPagesVisited:
          AGENTIC_PURCHASE_LIMITS.maximumProductPages + 1,
      },
      'discovery_bound_exceeded',
    ],
    [
      {
        ...baseline,
        browserActionCount:
          AGENTIC_PURCHASE_LIMITS.maximumBrowserActions + 1,
      },
      'discovery_bound_exceeded',
    ],
    [
      {
        ...baseline,
        modelCallCount: AGENTIC_PURCHASE_LIMITS.maximumModelCalls + 1,
      },
      'discovery_bound_exceeded',
    ],
    [
      { ...baseline, modelCallCount: 1, modelCostLogCount: 0 },
      'model_cost_log_missing',
    ],
  ]
  for (const [observation, expectedCode] of cases) {
    const result = validateAgenticPurchaseDiscoveryObservation(
      observation,
      envelope,
      NOW_MS,
    )
    assert.equal(result.ok, false)
    assert.equal(result.code, expectedCode)
  }
})

test('readiness exposes every external blocker and never infers provider capability', () => {
  const baseline = buildAgenticPurchaseReadiness({
    requirementsAuthority: true,
    trustedInvocation: true,
    durableLifecycleStore: true,
    discoveryCancellation: true,
    modelCostObserver: true,
    durableApprovalStore: true,
  })
  assert.equal(baseline.runtimeReady, false)
  assert.equal(baseline.phases.length, AGENTIC_PURCHASE_PHASES.length)
  assert.equal(baseline.providerCallCount, 0)
  assert.equal(baseline.modelCallCount, 0)
  assert.ok(baseline.unavailableSources.includes('kycAccountGrant'))
  assert.ok(baseline.unavailableSources.includes('cardSettlementBridge'))
  assert.ok(baseline.unavailableSources.includes('secureCardBroker'))

  const allChecks = Object.fromEntries(
    baseline.unavailableSources.map(check => [check, true]),
  )
  const complete = buildAgenticPurchaseReadiness({
    requirementsAuthority: true,
    trustedInvocation: true,
    durableLifecycleStore: true,
    discoveryCancellation: true,
    modelCostObserver: true,
    durableApprovalStore: true,
    ...allChecks,
  })
  assert.equal(complete.runtimeReady, true)
  assert.ok(complete.phases.every(phase => phase.ready))
})

test('existing-Paywall preview renders four phases and pre-financial cancel is zero-call', () => {
  const envelope = readEnvelope()
  const readiness = buildAgenticPurchaseReadiness({
    requirementsAuthority: true,
    trustedInvocation: true,
    durableLifecycleStore: true,
  })
  const snapshot = buildAgenticPurchaseLifecyclePreview(envelope, readiness)
  assert.equal(snapshot.lifecycleId, `purchase_${envelope.lifecycleKey}`)
  assert.deepEqual(
    snapshot.phases.map(phase => phase.phase),
    AGENTIC_PURCHASE_PHASES,
  )
  assert.equal(snapshot.phase, 'funding')
  assert.equal(snapshot.phaseState, 'blocked')
  assert.equal(snapshot.providerCallCount, 0)
  assert.equal(snapshot.financialCallCount, 0)

  const cancelled = cancelAgenticPurchaseLifecycle(snapshot)
  assert.equal(cancelled.cancelled, true)
  assert.equal(cancelled.phaseState, 'cancelled')
  assert.deepEqual(cancelled.cleanupActions, [])
  assert.equal(cancelled.providerCallCount, 0)
  assert.equal(cancelled.financialCallCount, 0)

  const postFinancial = cancelAgenticPurchaseLifecycle({
    ...snapshot,
    financialStateExists: true,
  })
  assert.deepEqual(postFinancial.cleanupActions, [
    'release_unused_funding_reservation',
    'reconcile_provider_outcome',
    'block_new_authorizations',
    'safe_close_card',
  ])
})

test('post-financial cancellation preserves call counts and permits cleanup only', () => {
  const readiness = buildAgenticPurchaseReadiness({
    requirementsAuthority: true,
    trustedInvocation: true,
    durableLifecycleStore: true,
  })
  const preview = buildAgenticPurchaseLifecyclePreview(readEnvelope(), readiness)
  for (const phase of AGENTIC_PURCHASE_PHASES) {
    const cancelled = cancelAgenticPurchaseLifecycle({
      ...preview,
      phase,
      phaseState: 'in_progress',
      financialStateExists: true,
      providerCallCount: 3,
      financialCallCount: 2,
    })
    assert.equal(cancelled.cancelled, true)
    assert.equal(cancelled.phaseState, 'cancelled')
    assert.equal(cancelled.providerCallCount, 3)
    assert.equal(cancelled.financialCallCount, 2)
    assert.deepEqual(cancelled.cleanupActions, [
      'release_unused_funding_reservation',
      'reconcile_provider_outcome',
      'block_new_authorizations',
      'safe_close_card',
    ])
  }
})

test('secret, card, signer, and identity canaries cannot enter lifecycle records', () => {
  const forbidden = [
    { cardNumber: '4242424242424242' },
    { cvv: '123' },
    { fullExpiry: '12/30' },
    { privateKey: 'not-even-a-real-key' },
    { seedPhrase: 'not-even-a-real-seed' },
    { kycDocument: 'identity bytes' },
    { nested: { rawSignedTransaction: '0xdeadbeef' } },
  ]
  for (const value of forbidden) {
    assert.throws(
      () => assertAgenticPurchaseDataMinimized(value),
      /Prohibited/,
    )
  }
  assert.doesNotThrow(() => assertAgenticPurchaseDataMinimized({
    lifecycleId: 'purchase_019fac4b',
    cardRef: 'opaque_card_reference',
    disposalState: 'closure_pending',
  }))
})
