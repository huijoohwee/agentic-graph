import assert from 'node:assert/strict'
import test from 'node:test'

import fc from 'fast-check'

import {
  PAYMENT_RAIL_IDS,
  PAYMENT_RAIL_SELECTION_REASONS,
  PAYMENT_SETTLEMENT_ASSETS,
  selectPaymentRail,
} from '../dist/payments/paymentRailSsot.js'

test('rail selection is compatibility-first, fail-closed, and deterministic', () => {
  const cases = [
    {
      input: { currency: 'sgd', settlementAsset: 'fiat', readiness: { stripe: true, straitsx: true }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: { ok: true, rail: 'straitsx', reason: 'sgd_fiat' },
    },
    {
      input: { currency: 'sgd', settlementAsset: 'xsgd', readiness: { stripe: true, straitsx: true }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: { ok: true, rail: 'straitsx', reason: 'xsgd' },
    },
    {
      input: { currency: 'usd', settlementAsset: 'fiat', readiness: { stripe: true, straitsx: true }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: { ok: true, rail: 'stripe', reason: 'card_currency' },
    },
    {
      input: { currency: 'sgd', settlementAsset: 'fiat', readiness: { stripe: true, straitsx: false }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: { ok: true, rail: 'stripe', reason: 'only_ready_rail' },
    },
    {
      input: { currency: 'usd', settlementAsset: 'fiat', readiness: { stripe: false, straitsx: true }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: {
        ok: false,
        rail: null,
        code: 'rail_unavailable',
        reason: 'no_ready_compatible_rail',
        compatibleRails: ['stripe'],
      },
    },
    {
      input: { currency: 'sgd', settlementAsset: 'fiat', readiness: { stripe: false, straitsx: false }, cardSettledCurrencies: ['usd', 'eur'] },
      expected: {
        ok: false,
        rail: null,
        code: 'rail_unavailable',
        reason: 'no_ready_compatible_rail',
        compatibleRails: ['stripe', 'straitsx'],
      },
    },
    {
      input: {
        currency: 'eur',
        settlementAsset: 'fiat',
        readiness: { stripe: true, straitsx: true },
        cardSettledCurrencies: ['usd'],
      },
      expected: {
        ok: false,
        rail: null,
        code: 'rail_unavailable',
        reason: 'no_ready_compatible_rail',
        compatibleRails: [],
      },
    },
  ]
  cases.forEach(({ input, expected }) => {
    const before = structuredClone(input)
    assert.deepEqual(selectPaymentRail(input), expected)
    assert.deepEqual(input, before)
  })

  fc.assert(
    fc.property(
      fc.constantFrom('sgd', 'usd', 'eur'),
      fc.constantFrom('fiat', 'xsgd', 'unsupported'),
      fc.boolean(),
      fc.boolean(),
      (currency, settlementAsset, stripe, straitsx) => {
        const input = {
          currency,
          settlementAsset,
          readiness: { stripe, straitsx },
          cardSettledCurrencies: ['usd', 'eur'],
        }
        assert.deepEqual(selectPaymentRail(input), selectPaymentRail(input))
      },
    ),
    { numRuns: 100 },
  )
})

test('rail SSOT collections and unavailable results cannot mutate later decisions', () => {
  assert.equal(Object.isFrozen(PAYMENT_RAIL_IDS), true)
  assert.equal(Object.isFrozen(PAYMENT_SETTLEMENT_ASSETS), true)
  assert.equal(Object.isFrozen(PAYMENT_RAIL_SELECTION_REASONS), true)
  assert.throws(() => PAYMENT_RAIL_IDS.pop(), TypeError)

  const input = {
    currency: 'sgd',
    settlementAsset: 'fiat',
    readiness: { stripe: false, straitsx: false },
    cardSettledCurrencies: ['usd', 'eur'],
  }
  const unavailable = selectPaymentRail(input)
  assert.equal(unavailable.ok, false)
  assert.equal(Object.isFrozen(unavailable), true)
  assert.equal(Object.isFrozen(unavailable.compatibleRails), true)
  assert.throws(() => unavailable.compatibleRails.pop(), TypeError)
  assert.throws(() => {
    unavailable.rail = 'straitsx'
  }, TypeError)
  assert.deepEqual(selectPaymentRail(input), unavailable)

  const selected = selectPaymentRail({
    ...input,
    readiness: { stripe: true, straitsx: false },
  })
  assert.equal(Object.isFrozen(selected), true)
  assert.throws(() => {
    selected.rail = 'straitsx'
  }, TypeError)
})
