import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseTravelAgencyIntent } from '../travelAgency/intentParser'
import { evaluateTravelAgencyGuardrail } from '../travelAgency/guardrailGate'
import { createAgenticGraphPaymentWorker } from '../index'

const env = {
  OPENAI_API_KEY: 'test-key',
  TRAVEL_INTENT_OPENAI_RESPONSES_URL: 'https://api.openai.test/v1/responses',
  TRAVEL_INTENT_OPENAI_MODEL: 'gpt-test',
  TRAVEL_INTENT_MAX_INPUT_CHARS: '2000',
  TRAVEL_INTENT_MAX_DATE_SPAN_DAYS: '90',
  TRAVEL_INTENT_MIN_BUDGET_MINOR: '1',
  TRAVEL_INTENT_MAX_BUDGET_MINOR: '100000000',
  TRAVEL_GUARDRAIL_RETRY_BOUND: '2',
}

const okOpenAiResponse = {
  output_text: JSON.stringify({
    kind: 'flight',
    origin: 'SIN',
    destination: 'NRT',
    dateRangeStart: '2026-09-01',
    dateRangeEnd: '2026-09-10',
    budgetCeiling: { amountMinor: 50000, currency: 'SGD' },
  }),
  usage: { input_tokens: 12, output_tokens: 18 },
}

test('travel intent parser uses OpenAI Responses API config and validates typed flight intent', async () => {
  const calls: Request[] = []
  const result = await parseTravelAgencyIntent({
    env,
    input: 'Find a flight from Singapore to Tokyo below SGD 500 in early September.',
    requestDateIso: '2026-08-18',
    fetchFn: async (request, init) => {
      calls.push(new Request(request, init))
      return new Response(JSON.stringify(okOpenAiResponse), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.ok && result.intent.budgetCeiling, { amountMinor: 50000, currency: 'SGD' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.url, env.TRAVEL_INTENT_OPENAI_RESPONSES_URL)
  assert.equal(calls[0]!.headers.get('authorization'), `Bearer ${env.OPENAI_API_KEY}`)
  assert.deepEqual(result.costLog, {
    model: 'gpt-test',
    prompt_tokens: 12,
    completion_tokens: 18,
    cache_hits: 0,
    estimated_cost_usd: 0,
    incomplete: false,
  })
})

test('travel intent parser rejects missing runtime-owned OpenAI configuration without network calls', async () => {
  let calls = 0
  const result = await parseTravelAgencyIntent({
    env: {},
    input: 'Find a flight.',
    requestDateIso: '2026-08-18',
    fetchFn: async () => {
      calls += 1
      return new Response('{}')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
  assert.equal(!result.ok && result.error.code, 'configuration-missing')
})

test('guardrail blocks over-budget offers and performs bounded flexible-date retry', async () => {
  const intent = {
    kind: 'flight' as const,
    origin: 'SIN',
    destination: 'NRT',
    dateRangeStart: '2026-09-01',
    dateRangeEnd: '2026-09-10',
    budgetCeiling: { amountMinor: 50000, currency: 'SGD' },
  }
  const attempts: number[] = []
  const decision = await evaluateTravelAgencyGuardrail({
    env,
    intent,
    offer: { offerId: 'offer-1', amountMinor: 70000, currency: 'SGD', date: '2026-09-01' },
    probe: {
      evolve: async ({ attempt }) => {
        attempts.push(attempt)
        return attempt === 1
          ? { offerId: 'offer-2', amountMinor: 60000, currency: 'SGD', date: '2026-09-02' }
          : { offerId: 'offer-3', amountMinor: 45000, currency: 'SGD', date: '2026-09-03' }
      },
    },
  })
  assert.equal(decision.ok, true)
  assert.equal(decision.ok && decision.offer.offerId, 'offer-3')
  assert.deepEqual(attempts, [1, 2])
})

test('guardrail returns a typed block when retry bound is exhausted', async () => {
  const intent = {
    kind: 'flight' as const,
    origin: 'SIN',
    destination: 'NRT',
    dateRangeStart: '2026-09-01',
    dateRangeEnd: '2026-09-10',
    budgetCeiling: { amountMinor: 50000, currency: 'SGD' },
  }
  let calls = 0
  const decision = await evaluateTravelAgencyGuardrail({
    env: { ...env, TRAVEL_GUARDRAIL_RETRY_BOUND: '1' },
    intent,
    offer: { offerId: 'offer-1', amountMinor: 70000, currency: 'SGD', date: '2026-09-01' },
    probe: {
      evolve: async () => {
        calls += 1
        return { offerId: 'offer-2', amountMinor: 65000, currency: 'SGD', date: '2026-09-02' }
      },
    },
  })
  assert.equal(decision.ok, false)
  assert.equal(!decision.ok && decision.code, 'budget-exceeded')
  assert.equal(calls, 1)
})

test('guardrail accepts zero budgets and rejects unsafe or inverted runtime bounds', async () => {
  const zeroIntent = {
    kind: 'flight' as const,
    origin: 'SIN',
    destination: 'NRT',
    dateRangeStart: '2026-09-01',
    dateRangeEnd: '2026-09-10',
    budgetCeiling: { amountMinor: 0, currency: 'SGD' },
  }
  const zero = await evaluateTravelAgencyGuardrail({
    env: {
      TRAVEL_GUARDRAIL_RETRY_BOUND: '0',
      TRAVEL_INTENT_MIN_BUDGET_MINOR: '0',
      TRAVEL_INTENT_MAX_BUDGET_MINOR: '0',
    },
    intent: zeroIntent,
    offer: { offerId: 'zero-offer', amountMinor: 0, currency: 'SGD', date: '2026-09-01' },
    probe: { evolve: async () => null },
  })
  assert.equal(zero.ok, true)

  for (const bounds of [
    {},
    { TRAVEL_INTENT_MIN_BUDGET_MINOR: '0', TRAVEL_INTENT_MAX_BUDGET_MINOR: '9007199254740992' },
    { TRAVEL_INTENT_MIN_BUDGET_MINOR: '2', TRAVEL_INTENT_MAX_BUDGET_MINOR: '1' },
  ]) {
    const rejected = await evaluateTravelAgencyGuardrail({
      env: { TRAVEL_GUARDRAIL_RETRY_BOUND: '0', ...bounds },
      intent: zeroIntent,
      offer: { offerId: 'invalid-config-offer', amountMinor: 0, currency: 'SGD', date: '2026-09-01' },
      probe: { evolve: async () => null },
    })
    assert.equal(rejected.ok, false)
    assert.equal(!rejected.ok && rejected.code, 'configuration-missing')
  }
})

test('payment Worker routes travel-agency intent before DB-backed payment paths', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(okOpenAiResponse), { status: 200 })) as typeof fetch
  try {
    const worker = createAgenticGraphPaymentWorker()
    const response = await worker.fetch(new Request('https://airvio.co/api/payments/travel-agency/intent', {
      method: 'POST',
      body: JSON.stringify({
        input: 'Find a flight from Singapore to Tokyo below SGD 500 in early September.',
        requestDateIso: '2026-08-18',
      }),
      headers: { 'content-type': 'application/json' },
    }), env)
    const body = await response.json() as { ok?: boolean; intent?: unknown }
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.ok(body.intent)
  } finally {
    globalThis.fetch = previousFetch
  }
})
