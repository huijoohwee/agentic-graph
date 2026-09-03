import assert from 'node:assert/strict'
import test from 'node:test'

import fc from 'fast-check'

import {
  appendAgenticGraphPaymentRecordDocument,
  buildAgenticGraphPublicPaymentStatus,
  AGENTIC_OS_PAYMENT_TERMINAL_STATES,
  parseAgenticGraphPaymentRecordDocument,
  serializeAgenticGraphPaymentRecordDocument,
  validateAgenticGraphTerminalPaymentRecord,
} from '../dist/payments/paymentRecordDocument.js'

const baseRecord = Object.freeze({
  intentId: 'intent_001',
  clientIntentKey: '00000000-0000-4000-8000-000000000001',
  rail: 'stripe',
  amountMinor: 1250,
  currency: 'sgd',
  settlementAsset: 'fiat',
  terminalState: 'paid',
  providerObjectId: 'cs_test_001',
  terminalTimestamp: '2026-07-28T00:00:00.000Z',
})

test('payment record document is canonical, round-trippable, minimal, and PII rejecting', () => {
  const secondRecord = {
    ...baseRecord,
    intentId: 'intent_002',
    clientIntentKey: '00000000-0000-4000-8000-000000000002',
    rail: 'straitsx',
    providerObjectId: null,
    terminalState: 'reconciliation_unresolved',
    terminalTimestamp: '2026-07-28T00:00:01.000Z',
  }
  const document = serializeAgenticGraphPaymentRecordDocument([secondRecord, baseRecord])
  assert.equal(document.endsWith('\n'), true)
  assert.equal(document.includes('\r'), false)
  const parsed = parseAgenticGraphPaymentRecordDocument(document)
  assert.equal(parsed.ok, true)
  assert.equal(serializeAgenticGraphPaymentRecordDocument(parsed.records), document)
  const publicStatus = buildAgenticGraphPublicPaymentStatus(baseRecord)
  assert.deepEqual(publicStatus, {
    intentId: 'intent_001',
    state: 'paid',
    amountMinor: 1250,
    currency: 'sgd',
  })
  assert.equal(Object.isFrozen(publicStatus), true)
  assert.throws(() => {
    publicStatus.providerObjectId = baseRecord.providerObjectId
  }, TypeError)

  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, providerObjectId: 'buyer@example.com' }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, intentId: 'buyer@example.com' }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, providerObjectId: 'cus_12345' }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, intentId: 'sk_test_1234567890' }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, intentId: '4242424242424242' }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({
      ...baseRecord,
      intentId: '4242-4242-4242-4242',
    }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({
      ...baseRecord,
      providerObjectId: '1234-5678-9012',
    }),
    /non-personal opaque identifier/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({ ...baseRecord, providerObjectId: null }),
    /must be present for a paid record/,
  )
  assert.match(
    validateAgenticGraphTerminalPaymentRecord({
      ...baseRecord,
      rail: 'stripe',
      settlementAsset: 'xsgd',
    }),
    /must use fiat settlement/,
  )
  assert.throws(
    () => buildAgenticGraphPublicPaymentStatus({ ...baseRecord, intentId: 'buyer@example.com' }),
    /non-personal opaque identifier/,
  )
  assert.doesNotMatch(document, /buyer|email|customer|card|bank|credential/i)

  const malformed = `${document.slice(0, document.indexOf('\n'))}\nnot-json\n`
  const malformedResult = parseAgenticGraphPaymentRecordDocument(malformed)
  assert.deepEqual(malformedResult, {
    ok: false,
    error: {
      code: 'payment_record_parse_error',
      line: 2,
      reason: 'invalid_json',
      message: 'Line is not valid JSON.',
    },
  })
  assert.equal(malformed.endsWith('not-json\n'), true, 'parser must not mutate input bytes')

  const appended = appendAgenticGraphPaymentRecordDocument('', baseRecord)
  assert.equal(appended.ok, true)
  assert.equal(appended.document, serializeAgenticGraphPaymentRecordDocument([baseRecord]))
  assert.deepEqual(appendAgenticGraphPaymentRecordDocument(appended.document, baseRecord), {
    ok: false,
    error: {
      code: 'payment_record_parse_error',
      line: 2,
      reason: 'duplicate_intent',
      message: 'Intent intent_001 appears more than once.',
    },
  })
  const duplicateClientIntent = {
    ...baseRecord,
    intentId: 'intent_002',
  }
  assert.equal(
    appendAgenticGraphPaymentRecordDocument(appended.document, duplicateClientIntent).error.reason,
    'duplicate_client_intent',
  )
})

test('payment record serialization properties hold across 100 generated record sets', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          amountMinor: fc.integer({ min: 0, max: 10_000_000 }),
          rail: fc.constantFrom('stripe', 'straitsx'),
          currency: fc.constantFrom('sgd', 'usd', 'eur'),
          settlementAsset: fc.constantFrom('fiat', 'xsgd'),
          terminalState: fc.constantFrom(
            'paid',
            'refunded',
            'no_payment_required',
            'failed',
            'expired',
            'cancelled',
            'reconciliation_unresolved',
          ),
          hasProviderObject: fc.boolean(),
          seconds: fc.integer({ min: 0, max: 86_399 }),
        }),
        { minLength: 1, maxLength: 12 },
      ),
      generated => {
        const records = generated.map((item, index) => {
          const suffix = String(index + 1).padStart(12, '0')
          return {
            intentId: `intent_${index + 1}`,
            clientIntentKey: `00000000-0000-4000-8000-${suffix}`,
            rail: item.rail,
            amountMinor: item.amountMinor,
            currency: item.rail === 'straitsx' ? 'sgd' : item.currency,
            settlementAsset: item.rail === 'straitsx' ? item.settlementAsset : 'fiat',
            terminalState: item.terminalState,
            providerObjectId:
              item.terminalState === 'paid'
                || item.terminalState === 'refunded'
                || item.terminalState === 'expired'
                || item.hasProviderObject
                ? `provider_${index + 1}`
                : null,
            terminalTimestamp: new Date(Date.UTC(2026, 6, 28, 0, 0, item.seconds)).toISOString(),
          }
        })
        const first = serializeAgenticGraphPaymentRecordDocument(records)
        const parsed = parseAgenticGraphPaymentRecordDocument(first)
        assert.equal(parsed.ok, true)
        if (!parsed.ok) return
        assert.equal(serializeAgenticGraphPaymentRecordDocument(parsed.records), first)
      },
    ),
    { numRuns: 100 },
  )
})

test('terminal state SSOT is immutable at runtime', () => {
  assert.equal(Object.isFrozen(AGENTIC_OS_PAYMENT_TERMINAL_STATES), true)
  assert.throws(() => AGENTIC_OS_PAYMENT_TERMINAL_STATES.push('forged_paid'), TypeError)
  assert.equal(validateAgenticGraphTerminalPaymentRecord(baseRecord), null)
})
