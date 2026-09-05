import assert from 'node:assert/strict'
import test from 'node:test'

import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http'
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types'

import {
  canonicalizeAgenticCommercePaidResourceJson,
  sha256AgenticCommercePaidResourceHex,
} from '../../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import {
  cachePaidResourceResponse,
  claimPaidResourcePayment,
  markPaidResourceExecuting,
} from '../agenticCommercePaidResourcePersistence'
import {
  parseXrplPaymentSignature,
  reconcileXrplTransaction,
  sha256Hex,
  type XrplX402Transport,
} from '../agenticCommerceX402Xrpl'
import {
  ALTERNATE_SIGNED_TX_BLOB,
  NOW,
  PAY_TO,
  SIGNED_TX_BLOB,
  createRuntime,
  issueChallenge,
  paidRequest,
  paymentPayload,
  responseJson,
  type EffectCounts,
  type Runtime,
} from './agenticCommerceXrplRouteTestSupport'

const ZERO_EFFECTS: EffectCounts = Object.freeze({
  ready: 0,
  supported: 0,
  verify: 0,
  resource: 0,
  settle: 0,
  rpc: 0,
})

const assertPaymentConflict = async (response: Response): Promise<void> => {
  assert.equal(response.status, 409)
  assert.equal(response.headers.has('PAYMENT-RESPONSE'), false)
  const text = await response.text()
  assert.equal(text.includes('offer-live-01'), false)
  assert.deepEqual(JSON.parse(text), {
    ok: false,
    contract: 'agentic-commerce.paid-resource/v1',
    code: 'paid_resource_payment_conflict',
  })
}

const driftRuntimeConfiguration = (runtime: Runtime): void => {
  Object.assign(runtime.env as unknown as Record<string, unknown>, {
    XRPL_X402_NETWORK: 'xrpl:2',
    XRPL_X402_AMOUNT_DROPS: '2000',
    XRPL_X402_SOURCE_TAG: '804681469',
    XRPL_X402_FACILITATOR_URL: 'https://changed-facilitator.test',
    XRPL_X402_RPC_URL: 'https://changed-rpc.test',
    XRPL_X402_MAX_TIMEOUT_SECONDS: '240',
  })
}

test('fulfilled replay rejects a different valid signed transaction without cached output', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const exactSignature = encodePaymentSignatureHeader(paymentPayload(challenge))
  assert.equal((await paidRequest(runtime, exactSignature)).status, 200)
  runtime.resetCounts()

  const conflictingSignature = encodePaymentSignatureHeader(paymentPayload(
    challenge,
    {},
    ALTERNATE_SIGNED_TX_BLOB,
  ))
  await assertPaymentConflict(await paidRequest(runtime, conflictingSignature))
  assert.deepEqual(runtime.counts, ZERO_EFFECTS)
  const row = runtime.sqlite.prepare(
    'SELECT state FROM agentic_commerce_paid_resources',
  ).get() as { state: string }
  assert.equal(row.state, 'fulfilled')
})

test('settlement-unknown replay rejects a different valid transaction before reconciliation', async (t) => {
  const runtime = await createRuntime({
    settlement: 'ambiguous',
    reconciliation: ['pending'],
  })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const exactSignature = encodePaymentSignatureHeader(paymentPayload(challenge))
  assert.equal((await paidRequest(runtime, exactSignature)).status, 503)
  runtime.resetCounts()

  const conflictingSignature = encodePaymentSignatureHeader(paymentPayload(
    challenge,
    {},
    ALTERNATE_SIGNED_TX_BLOB,
  ))
  await assertPaymentConflict(await paidRequest(runtime, conflictingSignature))
  assert.deepEqual(runtime.counts, ZERO_EFFECTS)
  const row = runtime.sqlite.prepare(
    'SELECT state FROM agentic_commerce_paid_resources',
  ).get() as { state: string }
  assert.equal(row.state, 'settlement_unknown')
})

test('terminal replays use integrity-checked challenge authority after runtime config drift', async (t) => {
  await t.test('fulfilled', async (context) => {
    const runtime = await createRuntime()
    context.after(() => runtime.sqlite.close())
    const challenge = await issueChallenge(runtime)
    const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
    const first = await paidRequest(runtime, signature)
    const expected = {
      status: first.status,
      paymentResponse: first.headers.get('PAYMENT-RESPONSE'),
      body: await first.text(),
    }
    assert.equal(expected.status, 200)

    driftRuntimeConfiguration(runtime)
    runtime.resetCounts()
    const replay = await paidRequest(runtime, signature)
    assert.deepEqual({
      status: replay.status,
      paymentResponse: replay.headers.get('PAYMENT-RESPONSE'),
      body: await replay.text(),
    }, expected)
    assert.deepEqual(runtime.counts, ZERO_EFFECTS)
  })

  await t.test('settlement_unknown', async (context) => {
    const runtime = await createRuntime({
      settlement: 'ambiguous',
      reconciliation: ['pending', 'fulfilled'],
    })
    context.after(() => runtime.sqlite.close())
    const challenge = await issueChallenge(runtime)
    const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
    assert.equal((await paidRequest(runtime, signature)).status, 503)

    driftRuntimeConfiguration(runtime)
    runtime.resetCounts()
    const replay = await paidRequest(runtime, signature)
    assert.equal(replay.status, 200, await replay.clone().text())
    assert.deepEqual(runtime.counts, { ...ZERO_EFFECTS, rpc: 2 })
    const row = runtime.sqlite.prepare(
      'SELECT state FROM agentic_commerce_paid_resources',
    ).get() as { state: string }
    assert.equal(row.state, 'fulfilled')
  })
})

test('terminal replay rejects corrupt stored requirements and transport authority', async (t) => {
  const corruptions = [
    { column: 'requirements_json', value: '{}' },
    { column: 'payment_required_json', value: '{"x402Version":2}' },
    { column: 'rpc_url', value: 'https://wrong-rpc.test' },
    { column: 'facilitator_url', value: 'https://wrong-facilitator.test' },
  ] as const
  for (const corruption of corruptions) {
    await t.test(corruption.column, async (context) => {
      const runtime = await createRuntime()
      context.after(() => runtime.sqlite.close())
      const signature = await fulfill(runtime)
      runtime.sqlite.prepare(
        `UPDATE agentic_commerce_paid_resources SET ${corruption.column} = ?`,
      ).run(corruption.value)

      const response = await paidRequest(runtime, signature)
      assert.equal(response.status, 503)
      assert.equal(response.headers.has('PAYMENT-RESPONSE'), false)
      assert.equal((await response.json() as { code: string }).code, 'paid_resource_receipt_corrupt')
      assert.deepEqual(runtime.counts, ZERO_EFFECTS)
    })
  }
})

test('settle success false distinguishes a fresh challenge from pending uncertainty', async (t) => {
  await t.test('permanent rejection re-challenges and reuses the cached resource once', async (context) => {
    const runtime = await createRuntime({
      settlements: ['permanent-failure', 'success'],
      reconciliation: ['pending'],
    })
    context.after(() => runtime.sqlite.close())
    const challenge = await issueChallenge(runtime)
    runtime.resetCounts()
    const response = await paidRequest(
      runtime,
      encodePaymentSignatureHeader(paymentPayload(challenge)),
    )
    assert.equal(response.status, 402)
    const required = response.headers.get('PAYMENT-REQUIRED')
    assert.ok(required)
    assert.deepEqual(decodePaymentRequiredHeader(required), challenge)
    assert.deepEqual(runtime.counts, {
      ready: 0, supported: 0, verify: 1, resource: 1, settle: 1, rpc: 0,
    })
    const row = runtime.sqlite.prepare(
      `SELECT state, error_code, response_json, payment_payload_digest,
              signed_blob_digest, transaction_hash, settlement_attempts
         FROM agentic_commerce_paid_resources`,
    ).get() as Record<string, unknown>
    assert.equal(row.state, 'challenged')
    assert.equal(row.error_code, 'settlement_failed')
    assert.equal(typeof row.response_json, 'string')
    assert.equal(row.payment_payload_digest, null)
    assert.equal(row.signed_blob_digest, null)
    assert.equal(row.transaction_hash, null)
    assert.equal(row.settlement_attempts, 0)

    const sameTransactionVariant = {
      ...paymentPayload(challenge),
      extensions: { tombstoneProbe: true },
    }
    const tombstoned = await paidRequest(
      runtime,
      encodePaymentSignatureHeader(sameTransactionVariant),
    )
    assert.equal(tombstoned.status, 402)
    assert.deepEqual(runtime.counts, {
      ready: 0, supported: 0, verify: 1, resource: 1, settle: 1, rpc: 0,
    })
    const rejection = runtime.sqlite.prepare(
      `SELECT state, (SELECT transaction_hash
         FROM agentic_commerce_paid_resource_rejections) AS rejected_transaction_hash
         FROM agentic_commerce_paid_resources`,
    ).get() as { state: string; rejected_transaction_hash: string }
    assert.deepEqual({ ...rejection }, {
      state: 'challenged',
      rejected_transaction_hash: runtime.transactionHash,
    })

    const retried = await paidRequest(
      runtime,
      encodePaymentSignatureHeader(paymentPayload(challenge, {}, ALTERNATE_SIGNED_TX_BLOB)),
    )
    assert.equal(retried.status, 200)
    assert.equal(await retried.text(), row.response_json)
    assert.deepEqual(runtime.counts, {
      ready: 0, supported: 0, verify: 2, resource: 1, settle: 2, rpc: 0,
    })
  })

  await t.test('a re-challenged rejection expires at the original deadline', async (context) => {
    const runtime = await createRuntime({ settlement: 'permanent-failure' })
    context.after(() => runtime.sqlite.close())
    const challenge = await issueChallenge(runtime)
    const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
    assert.equal((await paidRequest(runtime, signature)).status, 402)
    runtime.setNow(new Date(NOW.getTime() + 301_000))
    runtime.resetCounts()

    const expired = await paidRequest(runtime, signature)
    assert.equal(expired.status, 409)
    assert.equal((await expired.json() as { code: string }).code, 'paid_resource_expired')
    assert.deepEqual(runtime.counts, ZERO_EFFECTS)
    const row = runtime.sqlite.prepare(
      'SELECT state FROM agentic_commerce_paid_resources',
    ).get() as { state: string }
    assert.equal(row.state, 'expired')
  })

  await t.test('settlement_pending remains reconcile-only uncertainty', async (context) => {
    const runtime = await createRuntime({
      settlement: 'pending-failure',
      reconciliation: ['pending'],
    })
    context.after(() => runtime.sqlite.close())
    const challenge = await issueChallenge(runtime)
    runtime.resetCounts()
    const response = await paidRequest(
      runtime,
      encodePaymentSignatureHeader(paymentPayload(challenge)),
    )
    assert.equal(response.status, 503)
    assert.equal((await response.json() as { code: string }).code, 'settlement_unknown')
    assert.deepEqual(runtime.counts, {
      ready: 0, supported: 0, verify: 1, resource: 1, settle: 1, rpc: 2,
    })
    const row = runtime.sqlite.prepare(
      'SELECT state FROM agentic_commerce_paid_resources',
    ).get() as { state: string }
    assert.equal(row.state, 'settlement_unknown')
  })
})

const seedStaleCachedResponse = async (
  runtime: Runtime,
  challenge: PaymentRequired,
): Promise<{ signature: string; responseJson: string }> => {
  assert.equal(challenge.x402Version, 2)
  if (challenge.x402Version !== 2) throw new Error('v2 challenge required')
  const payload = paymentPayload(challenge)
  const signature = encodePaymentSignatureHeader(payload)
  const parsed = await parseXrplPaymentSignature({
    header: signature,
    requirements: challenge.accepts[0],
    paymentRequired: challenge,
  })
  if (!parsed.ok) assert.fail(parsed.code)
  const invoiceId = challenge.accepts[0]?.extra?.invoiceId
  assert.equal(typeof invoiceId, 'string')
  const claim = await claimPaidResourcePayment(runtime.db, {
    id: invoiceId as string,
    expectedRevision: 0,
    paymentPayloadDigest: parsed.payment.paymentPayloadDigest,
    signedBlobDigest: parsed.payment.signedTxBlobDigest,
    transactionHash: parsed.payment.transactionHash,
    claimToken: 'crashed-claim',
    claimExpiresAt: new Date(NOW.getTime() + 1_000).toISOString(),
    now: NOW.toISOString(),
  })
  if (!claim.ok || !claim.claimed) assert.fail('initial payment claim must succeed')
  const executing = await markPaidResourceExecuting(runtime.db, {
    id: invoiceId as string,
    expectedRevision: claim.record.revision,
    claimToken: 'crashed-claim',
    payer: 'rBuyer',
    now: NOW.toISOString(),
  })
  if (!executing.ok) assert.fail('executing transition must succeed')
  const responseJson = canonicalizeAgenticCommercePaidResourceJson({
    ok: true,
    contract: 'agentic-commerce.paid-resource/v1',
    resource: 'agentic-commerce.travel-requote/v1',
    provider: 'agent-flight',
    invoiceId,
    quote: { offerId: 'cached-before-settle-crash', amountMinor: 125_00, currency: 'USD' },
  })
  const cached = await cachePaidResourceResponse(runtime.db, {
    id: invoiceId as string,
    expectedRevision: executing.record.revision,
    claimToken: 'crashed-claim',
    responseJson,
    responseDigest: await sha256AgenticCommercePaidResourceHex(responseJson),
    claimExpiresAt: new Date(NOW.getTime() + 1_000).toISOString(),
    now: NOW.toISOString(),
  })
  if (!cached.ok) assert.fail('response cache transition must succeed')
  assert.equal(cached.record.state, 'settling')
  return { signature, responseJson }
}

test('32 stale post-cache retries reconcile without repeating paid effects', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const seeded = await seedStaleCachedResponse(runtime, challenge)
  runtime.setNow(new Date(NOW.getTime() + 31_000))
  runtime.resetCounts()

  const responses = await Promise.all(
    Array.from({ length: 32 }, () => paidRequest(runtime, seeded.signature)),
  )
  const snapshots = await Promise.all(responses.map(async response => ({
    status: response.status,
    paymentResponse: response.headers.get('PAYMENT-RESPONSE'),
    body: await response.text(),
  })))
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0])
  assert.equal(snapshots[0]?.status, 200)
  assert.equal(snapshots[0]?.body, seeded.responseJson)
  assert.ok(snapshots[0]?.paymentResponse)
  assert.deepEqual({ ...runtime.counts, rpc: 0 }, {
    ready: 0,
    supported: 0,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
  assert.ok(runtime.counts.rpc >= 2 && runtime.counts.rpc <= responses.length * 2)
  const row = runtime.sqlite.prepare(
    'SELECT state, transaction_hash FROM agentic_commerce_paid_resources',
  ).get() as { state: string; transaction_hash: string }
  assert.equal(row.state, 'fulfilled')
  assert.equal(row.transaction_hash, runtime.transactionHash)
})

test('txnNotFound resubmits the interrupted attempt once and stops at the bound', async (t) => {
  const runtime = await createRuntime({
    settlement: 'pending-failure',
    reconciliation: ['pending', 'pending', 'pending'],
  })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const seeded = await seedStaleCachedResponse(runtime, challenge)
  runtime.setNow(new Date(NOW.getTime() + 31_000))
  runtime.resetCounts()

  const retried = await paidRequest(runtime, seeded.signature)
  assert.equal(retried.status, 503)
  assert.equal((await retried.json() as { code: string }).code, 'settlement_unknown')
  const retriedRow = runtime.sqlite.prepare(
    'SELECT state, settlement_attempts FROM agentic_commerce_paid_resources',
  ).get() as { state: string; settlement_attempts: number }
  assert.deepEqual({ ...retriedRow }, { state: 'settlement_unknown', settlement_attempts: 2 })
  assert.equal(runtime.counts.settle, 1)

  const bounded = await paidRequest(runtime, seeded.signature)
  assert.equal(bounded.status, 503)
  assert.equal((await bounded.json() as { code: string }).code, 'settlement_unknown')
  assert.equal(runtime.counts.settle, 1)
  assert.equal(runtime.settleRequests.length, 1)
  for (const request of runtime.settleRequests) {
    assert.equal(request.url, 'https://facilitator.test/settle')
    assert.deepEqual(request.body, {
      x402Version: 2,
      paymentPayload: paymentPayload(challenge),
      paymentRequirements: challenge.accepts[0],
    })
  }
  assert.equal(runtime.counts.verify, 0)
  assert.equal(runtime.counts.resource, 0)
  const terminal = runtime.sqlite.prepare(
    'SELECT state, settlement_attempts FROM agentic_commerce_paid_resources',
  ).get() as { state: string; settlement_attempts: number }
  assert.deepEqual({ ...terminal }, { state: 'settlement_unknown', settlement_attempts: 2 })
})

const TRANSACTION_HASH = 'AB'.repeat(32)
const INVOICE_ID = 'cd'.repeat(32)
const REQUIREMENTS: PaymentRequirements = Object.freeze({
  scheme: 'exact',
  network: 'xrpl:1',
  amount: '1000',
  asset: 'XRP',
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  extra: Object.freeze({ invoiceId: INVOICE_ID, sourceTag: 804681468 }),
})

const reconcile = async (
  result: unknown,
  rpcNetwork: 'matches' | 'mismatch' | 'missing' | 'unavailable' = 'matches',
) => {
  const transport: XrplX402Transport = {
    facilitatorUrl: 'https://facilitator.test',
    facilitatorTimeoutMs: 1_000,
    rpcUrl: 'https://rpc.test',
    rpcTimeoutMs: 1_000,
    fetchFn: async (_input, init) => {
      const request = typeof init?.body === 'string'
        ? JSON.parse(init.body) as { method?: string }
        : null
      if (request?.method === 'server_info') {
        if (rpcNetwork === 'unavailable') return responseJson({}, 503)
        if (rpcNetwork === 'missing') return responseJson({ result: { info: {} } })
        return responseJson({
          result: { info: { network_id: rpcNetwork === 'mismatch' ? 2 : 1 } },
        })
      }
      assert.equal(request?.method, 'tx')
      return responseJson({ result })
    },
  }
  return await reconcileXrplTransaction({
    transport,
    requirements: REQUIREMENTS,
    transactionHash: TRANSACTION_HASH,
  })
}

const apiV2Transaction = async (deliveredAmount: string) => ({
  validated: true,
  hash: TRANSACTION_HASH,
  meta: { TransactionResult: 'tesSUCCESS', delivered_amount: deliveredAmount },
  tx_json: {
    hash: TRANSACTION_HASH,
    Account: 'rBuyer',
    TransactionType: 'Payment',
    Destination: PAY_TO,
    DeliverMax: '1000',
    SourceTag: 804681468,
    InvoiceID: (await sha256Hex(INVOICE_ID)).toUpperCase(),
  },
})

test('reconciliation requires an exact response hash', async () => {
  const missing = await apiV2Transaction('1000')
  delete (missing as { hash?: string }).hash
  delete (missing.tx_json as { hash?: string }).hash
  assert.deepEqual(await reconcile(missing), {
    status: 'unavailable',
    transactionHash: TRANSACTION_HASH,
  })

  const mismatched = await apiV2Transaction('1000')
  mismatched.hash = 'EF'.repeat(32)
  assert.deepEqual(await reconcile(mismatched), {
    status: 'unavailable',
    transactionHash: TRANSACTION_HASH,
  })
})

test('reconciliation accepts API-v2 DeliverMax only for the exact delivered amount', async () => {
  const exact = await reconcile(await apiV2Transaction('1000'))
  assert.equal(exact.status, 'fulfilled')
  if (exact.status === 'fulfilled') {
    assert.equal(exact.response.transaction, TRANSACTION_HASH)
    assert.equal(exact.response.amount, '1000')
  }

  assert.deepEqual(await reconcile(await apiV2Transaction('999')), {
    status: 'failed',
    transactionHash: TRANSACTION_HASH,
  })
})

test('reconciliation requires explicit matching RPC network identity', async (t) => {
  const transaction = await apiV2Transaction('1000')
  for (const rpcNetwork of ['mismatch', 'missing', 'unavailable'] as const) {
    await t.test(rpcNetwork, async () => {
      assert.deepEqual(await reconcile(transaction, rpcNetwork), {
        status: 'unavailable',
        transactionHash: TRANSACTION_HASH,
      })
    })
  }
})

const fulfill = async (runtime: Runtime): Promise<string> => {
  const challenge = await issueChallenge(runtime)
  const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
  assert.equal((await paidRequest(runtime, signature)).status, 200)
  runtime.resetCounts()
  return signature
}

test('parseable response and settlement corruption is never served', async (t) => {
  await t.test('response JSON', async (context) => {
    const runtime = await createRuntime()
    context.after(() => runtime.sqlite.close())
    const signature = await fulfill(runtime)
    runtime.sqlite.prepare(
      'UPDATE agentic_commerce_paid_resources SET response_json = ?',
    ).run('{"ok":true,"quote":{"offerId":"tampered"}}')

    const response = await paidRequest(runtime, signature)
    assert.equal(response.status, 503)
    assert.equal(response.headers.has('PAYMENT-RESPONSE'), false)
    const body = await response.json() as { code: string }
    assert.equal(body.code, 'paid_resource_receipt_corrupt')
    assert.equal(JSON.stringify(body).includes('tampered'), false)
    assert.deepEqual(runtime.counts, ZERO_EFFECTS)
  })

  await t.test('settlement JSON', async (context) => {
    const runtime = await createRuntime()
    context.after(() => runtime.sqlite.close())
    const signature = await fulfill(runtime)
    runtime.sqlite.prepare(
      'UPDATE agentic_commerce_paid_resources SET settlement_json = ?',
    ).run(JSON.stringify({
      success: true,
      transaction: 'EF'.repeat(32),
      network: 'xrpl:1',
      amount: '1000',
    }))

    const response = await paidRequest(runtime, signature)
    assert.equal(response.status, 503)
    assert.equal(response.headers.has('PAYMENT-RESPONSE'), false)
    assert.equal((await response.json() as { code: string }).code, 'paid_resource_receipt_corrupt')
    assert.deepEqual(runtime.counts, ZERO_EFFECTS)
  })
})

test('adversarial fixtures use distinct deterministic signed transaction hashes', async () => {
  const runtime = await createRuntime()
  try {
    const challenge = await issueChallenge(runtime)
    const alternate = await parseXrplPaymentSignature({
      header: encodePaymentSignatureHeader(paymentPayload(challenge, {}, ALTERNATE_SIGNED_TX_BLOB)),
      requirements: challenge.accepts[0] as PaymentRequirements,
      paymentRequired: challenge,
    })
    if (!alternate.ok) assert.fail(alternate.code)
    assert.notEqual(alternate.payment.transactionHash, runtime.transactionHash)
    assert.notEqual(ALTERNATE_SIGNED_TX_BLOB, SIGNED_TX_BLOB)
  } finally {
    runtime.sqlite.close()
  }
})
