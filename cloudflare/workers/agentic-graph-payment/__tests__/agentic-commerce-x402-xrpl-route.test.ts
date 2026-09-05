import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import type { PaymentRequired } from '@x402/core/types'

import type { D1DatabaseLike } from '../../shared/d1'
import {
  handleAgenticCommercePaidResourceRoute,
  type AgenticCommercePaidResourceWorkerEnv,
} from '../agenticCommercePaidResource'
import { claimPaidResourcePayment } from '../agenticCommercePaidResourcePersistence'
import { parseXrplPaymentSignature } from '../agenticCommerceX402Xrpl'
import { createAgenticGraphPaymentWorker } from '../index'
import {
  ALTERNATE_SIGNED_TX_BLOB,
  CORS_HEADERS,
  DISCOVERY_REQUEST,
  NOW,
  PAY_TO,
  ROUTE,
  SIGNED_TX_BLOB,
  createRuntime,
  issueChallenge,
  paidRequest,
  paymentPayload,
  routeRequest,
} from './agenticCommerceXrplRouteTestSupport'

const MAX_REQUEST_BYTES = 16 * 1024

test('malformed and oversized requests fail before D1 or egress', async (t) => {
  for (const fixture of [
    { name: 'malformed JSON', body: '{' },
    {
      name: 'one byte over the 16 KiB limit',
      body: `${JSON.stringify(DISCOVERY_REQUEST)}${' '.repeat(
        MAX_REQUEST_BYTES + 1 - new TextEncoder().encode(JSON.stringify(DISCOVERY_REQUEST)).byteLength,
      )}`,
    },
  ]) {
    await t.test(fixture.name, async () => {
      let d1Calls = 0
      let outboundCalls = 0
      let bindingCalls = 0
      const db = {
        prepare() {
          d1Calls += 1
          throw new Error('D1 must not be touched')
        },
      } as unknown as D1DatabaseLike
      const env: AgenticCommercePaidResourceWorkerEnv = {
        XRPL_X402_NETWORK: 'xrpl:1',
        XRPL_X402_PAY_TO_ADDRESS: PAY_TO,
        XRPL_X402_AMOUNT_DROPS: '1000',
        XRPL_X402_SOURCE_TAG: '804681468',
        XRPL_X402_DESTINATION_TAG: '',
        XRPL_X402_FACILITATOR_URL: 'https://facilitator.test',
        XRPL_X402_RPC_URL: 'https://rpc.test',
        XRPL_X402_MAX_TIMEOUT_SECONDS: '300',
        TRAVEL_DISCOVERY_HARNESS: {
          fetch: async () => {
            bindingCalls += 1
            throw new Error('resource must not be touched')
          },
        },
      }
      const response = await handleAgenticCommercePaidResourceRoute(
        routeRequest({ body: fixture.body }),
        env,
        db,
        CORS_HEADERS,
        {
          fetchFn: async () => {
            outboundCalls += 1
            throw new Error('facilitator must not be touched')
          },
          now: () => new Date(NOW),
        },
      )
      assert.equal(response.status, 400)
      assert.equal((await response.json() as { code: string }).code, 'paid_resource_request_invalid')
      assert.deepEqual({ d1Calls, outboundCalls, bindingCalls }, {
        d1Calls: 0,
        outboundCalls: 0,
        bindingCalls: 0,
      })
    })
  }
})

test('an exactly 16 KiB ready request returns the standard 402 and exact headers', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const encoded = JSON.stringify(DISCOVERY_REQUEST)
  const body = `${encoded}${' '.repeat(MAX_REQUEST_BYTES - new TextEncoder().encode(encoded).byteLength)}`
  assert.equal(new TextEncoder().encode(body).byteLength, MAX_REQUEST_BYTES)

  const response = await handleAgenticCommercePaidResourceRoute(
    routeRequest({ body }),
    runtime.env,
    runtime.db,
    CORS_HEADERS,
    runtime.dependencies,
  )
  assert.equal(response.status, 402)
  const required = await response.json() as PaymentRequired
  const requiredHeader = response.headers.get('PAYMENT-REQUIRED')
  assert.ok(requiredHeader)
  assert.equal(requiredHeader, encodePaymentRequiredHeader(required))
  assert.deepEqual(decodePaymentRequiredHeader(requiredHeader), required)
  assert.deepEqual([...response.headers.entries()], [
    ['access-control-allow-origin', 'https://canvas.test'],
    ['access-control-expose-headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE'],
    ['cache-control', 'no-store'],
    ['content-type', 'application/json; charset=utf-8'],
    ['payment-required', requiredHeader],
  ])
  assert.equal(response.headers.has('PAYMENT-RESPONSE'), false)
  assert.equal(required.x402Version, 2)
  assert.equal(required.accepts.length, 1)
  assert.deepEqual(required.accepts[0], {
    scheme: 'exact',
    network: 'xrpl:1',
    amount: '1000',
    asset: 'XRP',
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: {
      invoiceId: required.accepts[0]?.extra?.invoiceId,
      sourceTag: 804681468,
    },
  })
  assert.deepEqual(runtime.counts, {
    ready: 1,
    supported: 1,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
})

test('an accepted-requirement mismatch returns the stored challenge before any paid effect', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  runtime.resetCounts()
  const mismatched = paymentPayload(challenge, { amount: '1001' })
  const response = await paidRequest(runtime, encodePaymentSignatureHeader(mismatched))

  assert.equal(response.status, 402)
  assert.deepEqual(await response.json(), challenge)
  const requiredHeader = response.headers.get('PAYMENT-REQUIRED')
  assert.ok(requiredHeader)
  assert.deepEqual(decodePaymentRequiredHeader(requiredHeader), challenge)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
  const row = runtime.sqlite.prepare(
    'SELECT state, revision FROM agentic_commerce_paid_resources',
  ).get() as { state: string; revision: number }
  assert.equal(row.state, 'challenged')
  assert.equal(row.revision, 0)
})

test('malformed signatures re-challenge while live and expire closed after the deadline', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  runtime.resetCounts()

  const live = await paidRequest(runtime, 'not-a-payment-payload')
  assert.equal(live.status, 402)
  assert.deepEqual(await live.json(), challenge)
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 0, resource: 0, settle: 0, rpc: 0,
  })

  runtime.setNow(new Date(NOW.getTime() + 301_000))
  const expired = await paidRequest(runtime, 'not-a-payment-payload')
  assert.equal(expired.status, 409)
  assert.equal((await expired.json() as { code: string }).code, 'paid_resource_expired')
  assert.equal(expired.headers.has('PAYMENT-REQUIRED'), false)
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 0, resource: 0, settle: 0, rpc: 0,
  })
})

test('stale invalid verification releases its payment identity for a legitimate retry', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const stalePayload = paymentPayload(challenge, {}, ALTERNATE_SIGNED_TX_BLOB)
  const parsed = await parseXrplPaymentSignature({
    header: encodePaymentSignatureHeader(stalePayload),
    requirements: challenge.accepts[0],
    paymentRequired: challenge,
  })
  if (!parsed.ok) assert.fail(parsed.code)
  const invoiceId = challenge.accepts[0]?.extra?.invoiceId
  assert.equal(typeof invoiceId, 'string')
  const poisoned = await claimPaidResourcePayment(runtime.db, {
    id: invoiceId as string,
    expectedRevision: 0,
    paymentPayloadDigest: parsed.payment.paymentPayloadDigest,
    signedBlobDigest: parsed.payment.signedTxBlobDigest,
    transactionHash: parsed.payment.transactionHash,
    claimToken: 'stale-invalid-claim',
    claimExpiresAt: new Date(NOW.getTime() + 1_000).toISOString(),
    now: NOW.toISOString(),
  })
  assert.equal(poisoned.ok && poisoned.claimed, true)

  runtime.setNow(new Date(NOW.getTime() + 31_000))
  runtime.resetCounts()
  const poll = await handleAgenticCommercePaidResourceRoute(
    routeRequest(),
    runtime.env,
    runtime.db,
    CORS_HEADERS,
    runtime.dependencies,
  )
  assert.equal(poll.status, 402)
  assert.deepEqual(await poll.json(), challenge)
  const recovered = runtime.sqlite.prepare(
    `SELECT state, payment_payload_digest, signed_blob_digest, transaction_hash
       FROM agentic_commerce_paid_resources`,
  ).get() as Record<string, unknown>
  assert.deepEqual({ ...recovered }, {
    state: 'challenged',
    payment_payload_digest: null,
    signed_blob_digest: null,
    transaction_hash: null,
  })
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 0, resource: 0, settle: 0, rpc: 0,
  })

  const legitimate = encodePaymentSignatureHeader(paymentPayload(challenge))
  assert.equal((await paidRequest(runtime, legitimate)).status, 200)
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 1, resource: 1, settle: 1, rpc: 0,
  })
  const owner = runtime.sqlite.prepare(
    'SELECT state, transaction_hash FROM agentic_commerce_paid_resources',
  ).get() as { state: string; transaction_hash: string }
  assert.deepEqual({ ...owner }, {
    state: 'fulfilled',
    transaction_hash: runtime.transactionHash,
  })
})

test('32 exact signed retries coalesce to one effect chain and identical fulfilled replay', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
  runtime.resetCounts()

  const responses = await Promise.all(
    Array.from({ length: 32 }, () => paidRequest(runtime, signature)),
  )
  const snapshots = await Promise.all(responses.map(async response => ({
    status: response.status,
    paymentResponse: response.headers.get('PAYMENT-RESPONSE'),
    body: await response.text(),
  })))
  assert.equal(snapshots.length, 32)
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0])
  assert.equal(snapshots[0]?.status, 200)
  assert.ok(snapshots[0]?.paymentResponse)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 1,
    rpc: 0,
  })

  const replay = await paidRequest(runtime, signature)
  assert.deepEqual({
    status: replay.status,
    paymentResponse: replay.headers.get('PAYMENT-RESPONSE'),
    body: await replay.text(),
  }, snapshots[0])
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 1,
    rpc: 0,
  })

  const row = runtime.sqlite.prepare(
    'SELECT state, transaction_hash FROM agentic_commerce_paid_resources',
  ).get() as { state: string; transaction_hash: string }
  assert.equal(row.state, 'fulfilled')
  assert.equal(row.transaction_hash, runtime.transactionHash)
})

test('ambiguous settlement persists unknown and reconciles without a second settle', async (t) => {
  const runtime = await createRuntime({
    settlement: 'ambiguous',
    reconciliation: ['pending', 'fulfilled'],
  })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
  runtime.resetCounts()

  const first = await paidRequest(runtime, signature)
  assert.equal(first.status, 503)
  assert.deepEqual(await first.json(), {
    ok: false,
    contract: 'agentic-commerce.paid-resource/v1',
    code: 'settlement_unknown',
    retryable: true,
    phase: 'settle',
    settlementAttempted: true,
    transaction: runtime.transactionHash,
  })
  const unknown = runtime.sqlite.prepare(
    'SELECT state, response_json, settlement_json FROM agentic_commerce_paid_resources',
  ).get() as { state: string; response_json: string; settlement_json: string | null }
  assert.equal(unknown.state, 'settlement_unknown')
  assert.ok(unknown.response_json)
  assert.equal(unknown.settlement_json, null)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 1,
    rpc: 2,
  })

  const recovered = await paidRequest(runtime, signature)
  assert.equal(recovered.status, 200, await recovered.clone().text())
  const responseHeader = recovered.headers.get('PAYMENT-RESPONSE')
  assert.ok(responseHeader)
  assert.deepEqual(decodePaymentResponseHeader(responseHeader), {
    success: true,
    transaction: runtime.transactionHash,
    network: 'xrpl:1',
    payer: 'rBuyer',
    amount: '1000',
    extra: { reconciled: true },
  })
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 1,
    rpc: 4,
  })

  const replay = await paidRequest(runtime, signature)
  assert.equal(replay.status, 200)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 1,
    rpc: 4,
  })
})

test('the raw signed transaction is neither persisted nor logged', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
  const captured: unknown[][] = []
  const methods = ['debug', 'error', 'info', 'log', 'warn'] as const
  const originals = Object.fromEntries(methods.map(method => [method, console[method]])) as Record<
    typeof methods[number],
    typeof console.log
  >
  for (const method of methods) console[method] = (...args: unknown[]) => { captured.push(args) }
  try {
    const response = await paidRequest(runtime, signature)
    assert.equal(response.status, 200)
  } finally {
    for (const method of methods) console[method] = originals[method]
  }

  const persisted = runtime.sqlite.prepare(
    'SELECT * FROM agentic_commerce_paid_resources',
  ).get() as Record<string, unknown>
  assert.equal(Object.hasOwn(persisted, 'signed_tx_blob'), false)
  assert.equal(Object.hasOwn(persisted, 'signedTxBlob'), false)
  for (const value of Object.values(persisted)) {
    assert.equal(String(value ?? '').includes(SIGNED_TX_BLOB), false)
  }
  assert.equal(JSON.stringify(captured).includes(SIGNED_TX_BLOB), false)
})

test('worker OPTIONS admits and exposes the x402 headers', async () => {
  const response = await createAgenticGraphPaymentWorker().fetch(
    new Request(ROUTE, { method: 'OPTIONS' }),
    {} as never,
  )
  assert.equal(response.status, 204)
  const allow = response.headers.get('access-control-allow-headers')?.split(',') ?? []
  const expose = response.headers.get('access-control-expose-headers')?.split(',') ?? []
  assert.ok(allow.includes('payment-signature'))
  assert.ok(expose.includes('payment-required'))
  assert.ok(expose.includes('payment-response'))
})
