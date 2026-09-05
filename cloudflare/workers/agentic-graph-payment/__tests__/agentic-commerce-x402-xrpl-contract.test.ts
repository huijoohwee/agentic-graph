import assert from 'node:assert/strict'
import test from 'node:test'

import { encodePaymentSignatureHeader } from '@x402/core/http'
import { PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT } from '../agenticCommercePaidResourcePersistence'

import {
  ALTERNATE_SIGNED_TX_BLOB,
  createRuntime,
  issueChallenge,
  paidRequest,
  paymentPayload,
} from './agenticCommerceXrplRouteTestSupport'

test('alternating rejected transaction hashes retain every earlier tombstone', async (t) => {
  const runtime = await createRuntime({
    settlements: ['permanent-failure', 'permanent-failure'],
  })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const first = encodePaymentSignatureHeader(paymentPayload(challenge))
  const second = encodePaymentSignatureHeader(paymentPayload(
    challenge,
    {},
    ALTERNATE_SIGNED_TX_BLOB,
  ))

  assert.equal((await paidRequest(runtime, first)).status, 402)
  assert.equal((await paidRequest(runtime, second)).status, 402)
  const rejections = runtime.sqlite.prepare(
    'SELECT COUNT(*) AS count FROM agentic_commerce_paid_resource_rejections',
  ).get() as { count: number }
  assert.equal(rejections.count, 2)
  runtime.resetCounts()
  assert.equal((await paidRequest(runtime, first)).status, 402)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
})

test('facilitator failure admission follows settlementAttempted and HTTP status', async (t) => {
  const cases = [
    {
      name: '2xx absent attempt evidence is terminal',
      settlement: 'absent-failure-200' as const,
      status: 402,
      state: 'challenged',
      rpc: 0,
    },
    {
      name: '4xx absent attempt evidence remains unknown',
      settlement: 'absent-failure-4xx' as const,
      status: 503,
      state: 'settlement_unknown',
      rpc: 2,
    },
    {
      name: '4xx explicit attempted evidence remains unknown',
      settlement: 'attempted-failure' as const,
      status: 503,
      state: 'settlement_unknown',
      rpc: 2,
    },
    {
      name: '4xx explicit unattempted evidence is terminal',
      settlement: 'permanent-failure' as const,
      status: 402,
      state: 'challenged',
      rpc: 0,
    },
    {
      name: 'wrong transaction cannot release a possibly submitted payment',
      settlement: 'wrong-hash-failure' as const,
      status: 503,
      state: 'settlement_unknown',
      rpc: 2,
    },
    {
      name: 'wrong network cannot release a possibly submitted payment',
      settlement: 'wrong-network-failure' as const,
      status: 503,
      state: 'settlement_unknown',
      rpc: 2,
    },
  ]

  for (const entry of cases) {
    await t.test(entry.name, async (context) => {
      const runtime = await createRuntime({
        settlement: entry.settlement,
        reconciliation: ['pending'],
      })
      context.after(() => runtime.sqlite.close())
      const challenge = await issueChallenge(runtime)
      runtime.resetCounts()
      const response = await paidRequest(
        runtime,
        encodePaymentSignatureHeader(paymentPayload(challenge)),
      )
      assert.equal(response.status, entry.status)
      assert.equal(runtime.counts.verify, 1)
      assert.equal(runtime.counts.resource, 1)
      assert.equal(runtime.counts.settle, 1)
      assert.equal(runtime.counts.rpc, entry.rpc)
      const row = runtime.sqlite.prepare(
        'SELECT state FROM agentic_commerce_paid_resources',
      ).get() as { state: string }
      assert.equal(row.state, entry.state)
    })
  }
})

test('one challenge bounds invalid and transient verification attempts', async (t) => {
  for (const verification of ['invalid', 'unavailable'] as const) {
    await t.test(verification, async (context) => {
      const runtime = await createRuntime({ verification })
      context.after(() => runtime.sqlite.close())
      const challenge = await issueChallenge(runtime)
      const signature = encodePaymentSignatureHeader(paymentPayload(challenge))
      runtime.resetCounts()
      for (let attempt = 0; attempt < PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT; attempt += 1) {
        const response = await paidRequest(runtime, signature)
        assert.equal(response.status, verification === 'invalid' ? 402 : 503)
      }
      const exhausted = await paidRequest(runtime, signature)
      assert.equal(exhausted.status, 429)
      assert.equal((await exhausted.json() as { code: string }).code, 'paid_resource_verification_exhausted')
      assert.deepEqual(runtime.counts, {
        ready: 0, supported: 0, verify: PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT,
        resource: 0, settle: 0, rpc: 0,
      })
      const row = runtime.sqlite.prepare(
        'SELECT state, revision, verification_attempts FROM agentic_commerce_paid_resources',
      ).get() as { state: string; revision: number; verification_attempts: number }
      assert.deepEqual({ ...row }, {
        state: 'challenged',
        revision: PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT * 2,
        verification_attempts: PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT,
      })
      const replay = await paidRequest(runtime, signature)
      assert.equal(replay.status, 429)
      const unchanged = runtime.sqlite.prepare(
        'SELECT revision, verification_attempts FROM agentic_commerce_paid_resources',
      ).get()
      assert.deepEqual({ ...unchanged as object }, {
        revision: row.revision,
        verification_attempts: row.verification_attempts,
      })
      assert.equal(runtime.counts.verify, PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT)
    })
  }
})

test('deep signed-header JSON re-challenges without writes or egress', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const marker = '__DEEPLY_NESTED_EXTENSION__'
  const source = JSON.stringify({ ...paymentPayload(challenge), extensions: marker })
  const nested = `${'{"next":'.repeat(64)}null${'}'.repeat(64)}`
  const header = Buffer.from(source.replace(`"${marker}"`, nested)).toString('base64')
  runtime.resetCounts()
  const response = await paidRequest(runtime, header)
  assert.equal(response.status, 402)
  assert.deepEqual(await response.json(), challenge)
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 0, resource: 0, settle: 0, rpc: 0,
  })
  const row = runtime.sqlite.prepare(
    'SELECT state, revision, verification_attempts FROM agentic_commerce_paid_resources',
  ).get()
  assert.deepEqual({ ...row as object }, {
    state: 'challenged', revision: 0, verification_attempts: 0,
  })
})

test('a 200 response with an invalid verified quote expires without settlement', async (t) => {
  const runtime = await createRuntime({
    resourceBody: { offerId: 'unverified-body' },
  })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  runtime.resetCounts()

  const response = await paidRequest(
    runtime,
    encodePaymentSignatureHeader(paymentPayload(challenge)),
  )
  assert.equal(response.status, 503)
  assert.equal((await response.json() as { code: string }).code, 'paid_resource_execution_failed')
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 1,
    resource: 1,
    settle: 0,
    rpc: 0,
  })
  const row = runtime.sqlite.prepare(
    'SELECT state, error_code, response_json FROM agentic_commerce_paid_resources',
  ).get() as { state: string; error_code: string; response_json: string | null }
  assert.deepEqual({ ...row }, {
    state: 'expired',
    error_code: 'paid_resource_execution_failed',
    response_json: null,
  })
})

test('minimal facilitator success synthesizes the exact requirement amount', async (t) => {
  const runtime = await createRuntime({ settlement: 'minimal-success' })
  t.after(() => runtime.sqlite.close())
  const challenge = await issueChallenge(runtime)
  const response = await paidRequest(
    runtime,
    encodePaymentSignatureHeader(paymentPayload(challenge)),
  )
  assert.equal(response.status, 200)
  const row = runtime.sqlite.prepare(
    'SELECT settlement_json FROM agentic_commerce_paid_resources',
  ).get() as { settlement_json: string }
  assert.deepEqual(JSON.parse(row.settlement_json), {
    amount: '1000',
    network: 'xrpl:1',
    success: true,
    transaction: runtime.transactionHash,
  })
})

test('missing ledger success evidence retains settlement uncertainty without resubmission', async (t) => {
  for (const reconciliation of ['missing-meta', 'missing-delivered'] as const) {
    await t.test(reconciliation, async (context) => {
      const runtime = await createRuntime({
        settlement: 'ambiguous',
        reconciliation: [reconciliation],
      })
      context.after(() => runtime.sqlite.close())
      const challenge = await issueChallenge(runtime)
      runtime.resetCounts()
      const response = await paidRequest(
        runtime,
        encodePaymentSignatureHeader(paymentPayload(challenge)),
      )
      assert.equal(response.status, 503)
      assert.equal(response.headers.has('PAYMENT-REQUIRED'), false)
      assert.equal((await response.json() as { code: string }).code, 'settlement_unknown')
      assert.deepEqual(runtime.counts, {
        ready: 0,
        supported: 0,
        verify: 1,
        resource: 1,
        settle: 1,
        rpc: 2,
      })
      assert.equal(runtime.settleRequests.length, 1)
      const row = runtime.sqlite.prepare(
        'SELECT state, settlement_attempts FROM agentic_commerce_paid_resources',
      ).get() as { state: string; settlement_attempts: number }
      assert.deepEqual({ ...row }, {
        state: 'settlement_unknown',
        settlement_attempts: 1,
      })
    })
  }
})

test('reconciliation requests API v2 and accepts v1 root or v2 tx_json shapes', async (t) => {
  for (const reconciliation of ['fulfilled-v1', 'fulfilled'] as const) {
    await t.test(reconciliation, async (context) => {
      const runtime = await createRuntime({
        settlement: 'ambiguous',
        reconciliation: [reconciliation],
      })
      context.after(() => runtime.sqlite.close())
      const challenge = await issueChallenge(runtime)
      runtime.resetCounts()
      const response = await paidRequest(
        runtime,
        encodePaymentSignatureHeader(paymentPayload(challenge)),
      )
      assert.equal(response.status, 200)
      assert.deepEqual(runtime.rpcRequests, [
        { method: 'server_info', params: [{}] },
        {
          method: 'tx',
          params: [{
            api_version: 2,
            transaction: runtime.transactionHash,
            binary: false,
          }],
        },
      ])
      assert.equal(runtime.counts.settle, 1)
      assert.equal(runtime.counts.resource, 1)
      const row = runtime.sqlite.prepare(
        'SELECT state FROM agentic_commerce_paid_resources',
      ).get() as { state: string }
      assert.equal(row.state, 'fulfilled')
    })
  }
})
