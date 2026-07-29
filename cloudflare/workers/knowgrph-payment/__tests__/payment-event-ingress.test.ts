import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import {
  STRAITSX_CALLBACK_SOURCE_ADDRESSES,
  STRAITSX_ENV_KEYS,
  STRAITSX_HEADER_NAMES,
} from '../../../../grph-shared/src/payments/straitsxPaymentSsot'
import {
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
} from '../../../../grph-shared/src/payments/stripePaymentSsot'
import type {
  PaymentIntentRecord,
} from '../../../../grph-shared/src/payments/paymentRuntimeContract'
import { handlePaymentProviderEvent } from '../paymentEventIngress'
import type { PaymentProviderReadResult } from '../paymentRailAdapters'
import { createPaymentRuntimeService } from '../paymentRuntimeService'
import {
  buildAdapter,
  MemoryPaymentRuntimeStore,
  TEST_COMMAND,
  TEST_READINESS,
} from './paymentRuntimeHarness'

const NOW = new Date('2026-07-29T00:10:00.000Z')
const STRIPE_SECRET = 'whsec_runtime_readiness_test'
const STRAITSX_SECRET = 'straitsx-runtime-readiness-test'

const stripeBody = (args: {
  eventId: string
  eventType?: string
  providerObjectId: string
}): string => JSON.stringify({
  id: args.eventId,
  type: args.eventType || 'checkout.session.completed',
  api_version: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
  data: { object: { id: args.providerObjectId } },
})

const stripeRequest = (args: {
  rawBody: string
  timestamp?: number
  signedBody?: string
  signingSecret?: string
}): Request => {
  const timestamp = args.timestamp || Math.floor(NOW.getTime() / 1000)
  const signature = createHmac('sha256', args.signingSecret || STRIPE_SECRET)
    .update(`${timestamp}.${args.signedBody || args.rawBody}`)
    .digest('hex')
  return new Request('https://payments.test/events/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: args.rawBody,
  })
}

const straitsxRequest = (args: {
  rawBody: string
  signedBody?: string
  sourceAddress?: string
}): Request => {
  const signature = createHmac('sha256', STRAITSX_SECRET)
    .update(args.signedBody || args.rawBody)
    .digest('hex')
  return new Request('https://payments.test/events/straitsx', {
    method: 'POST',
    headers: {
      [STRAITSX_HEADER_NAMES.callbackSignature]: signature,
      'cf-connecting-ip':
        args.sourceAddress || STRAITSX_CALLBACK_SOURCE_ADDRESSES[0],
    },
    body: args.rawBody,
  })
}

const buildRuntime = async (args: {
  rail: 'stripe' | 'straitsx'
  read?: (record: PaymentIntentRecord) => Promise<PaymentProviderReadResult>
}) => {
  const store = new MemoryPaymentRuntimeStore()
  const selectedAdapter = buildAdapter({ store, read: args.read })
  const command = args.rail === 'stripe'
    ? { ...TEST_COMMAND, currency: 'usd' }
    : TEST_COMMAND
  const service = createPaymentRuntimeService({
    store,
    adapters: {
      stripe: args.rail === 'stripe' ? selectedAdapter : buildAdapter({ store }),
      straitsx: args.rail === 'straitsx' ? selectedAdapter : buildAdapter({ store }),
    },
    readiness: TEST_READINESS,
    buyerProduct: {
      amountMinor: command.amountMinor,
      currency: command.currency,
      settlementAsset: command.settlementAsset,
    },
    now: () => NOW,
  })
  const created = await service.createIntent(command)
  assert.equal(created.ok, true)
  const record = await store.findIntentById(created.intent.intentId)
  assert.equal(record?.rail, args.rail)
  assert.ok(record?.providerObjectId)
  return { store, service, created, record: record! }
}

const invoke = (args: {
  provider: 'stripe' | 'straitsx'
  request: Request
  runtime: Awaited<ReturnType<typeof buildRuntime>>
  now?: Date
}) => handlePaymentProviderEvent({
  request: args.request,
  provider: args.provider,
  env: args.provider === 'stripe'
    ? { [STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret]: STRIPE_SECRET }
    : { [STRAITSX_ENV_KEYS.sandboxCallbackSecret]: STRAITSX_SECRET },
  store: args.runtime.store,
  service: args.runtime.service,
  corsHeaders: {},
  now: () => args.now || NOW,
})

test('Stripe rejects altered bytes, wrong secrets, and stale timestamps before state change', async () => {
  let reads = 0
  const runtime = await buildRuntime({
    rail: 'stripe',
    async read(record) {
      reads += 1
      return buildAdapter().read(record)
    },
  })
  const providerObjectId = runtime.record.providerObjectId || ''
  const body = stripeBody({ eventId: 'evt_auth', providerObjectId })
  const attempts = [
    stripeRequest({ rawBody: body, signingSecret: 'whsec_wrong' }),
    stripeRequest({ rawBody: `${body} `, signedBody: body }),
    stripeRequest({
      rawBody: body,
      timestamp: Math.floor(NOW.getTime() / 1000) - 301,
    }),
  ]
  for (const request of attempts) {
    const response = await invoke({ provider: 'stripe', request, runtime })
    assert.equal(response.status, 400)
    assert.equal((await response.json() as { code: string }).code, 'signature_verification_failed')
  }
  assert.equal(reads, 0)
  assert.equal(runtime.store.events.size, 0)
  assert.equal(
    (await runtime.store.findIntentById(runtime.created.intent.intentId))?.state,
    'pending_provider',
  )
})

test('Stripe event identity, semantic dedupe, and delivery order settle once', async () => {
  let reads = 0
  const runtime = await buildRuntime({
    rail: 'stripe',
    async read(record) {
      reads += 1
      return {
        ok: true,
        state: 'paid',
        amountMinor: record.amountMinor,
        currency: record.currency,
        providerObjectId: record.providerObjectId || '',
        clientIntentReference:
          `knowgrph:${record.rail}:create:${record.clientIntentKey}`,
        providerRequestId: `request_read_${reads}`,
        refundTargetId: 'payment_intent_1',
        calls: [],
      }
    },
  })
  const providerObjectId = runtime.record.providerObjectId || ''
  const firstBody = stripeBody({ eventId: 'evt_primary', providerObjectId })
  const first = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: firstBody }),
    runtime,
  })
  assert.equal(first.status, 200)
  assert.equal((await first.json() as { duplicate: boolean }).duplicate, false)

  const repeated = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: firstBody }),
    runtime,
  })
  assert.equal(repeated.status, 200)
  assert.equal((await repeated.json() as { duplicate: boolean }).duplicate, true)

  const semanticBody = stripeBody({
    eventId: 'evt_semantic_duplicate',
    providerObjectId,
  })
  const semantic = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: semanticBody }),
    runtime,
  })
  assert.equal(semantic.status, 200)
  assert.equal((await semantic.json() as { duplicate: boolean }).duplicate, true)

  const reorderedBody = stripeBody({
    eventId: 'evt_reordered',
    eventType: 'checkout.session.async_payment_succeeded',
    providerObjectId,
  })
  const reordered = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: reorderedBody }),
    runtime,
  })
  assert.equal(reordered.status, 200)
  assert.equal(reads, 1)
  assert.equal(
    runtime.store.operationLog.filter(item => item === 'update:paid').length,
    1,
  )

  const conflictingBody = stripeBody({
    eventId: 'evt_primary',
    eventType: 'checkout.session.expired',
    providerObjectId,
  })
  const conflicting = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: conflictingBody }),
    runtime,
  })
  assert.equal(conflicting.status, 409)
  assert.equal(
    (await conflicting.json() as { code: string }).code,
    'event_identity_conflict',
  )
})

test('StraitsX sample callback authenticates, minimizes sender data, and dedupes by status delivery', async () => {
  let reads = 0
  const runtime = await buildRuntime({
    rail: 'straitsx',
    async read(record) {
      reads += 1
      return buildAdapter().read(record)
    },
  })
  const body = JSON.stringify({
    id: 'contract_a1b2c3d4e5f6789012345678abcdef01',
    type: 'paynowTransaction',
    status: 'completed',
    currency: 'xsgd',
    payment_method: {
      id: runtime.record.providerObjectId,
      reference_id: 'merchant-payment-reference',
    },
    sender_information: {
      account_holder_name: 'Sensitive Sender',
      account_number: '1234567890',
    },
  })
  const wrongBody = await invoke({
    provider: 'straitsx',
    request: straitsxRequest({ rawBody: `${body} `, signedBody: body }),
    runtime,
  })
  const wrongSource = await invoke({
    provider: 'straitsx',
    request: straitsxRequest({ rawBody: body, sourceAddress: '203.0.113.10' }),
    runtime,
  })
  assert.equal(wrongBody.status, 400)
  assert.equal(wrongSource.status, 400)
  assert.equal(reads, 0)
  assert.equal(runtime.store.events.size, 0)

  const accepted = await invoke({
    provider: 'straitsx',
    request: straitsxRequest({ rawBody: body }),
    runtime,
  })
  assert.equal(accepted.status, 200)
  assert.equal(reads, 1)
  assert.equal(
    (await runtime.store.findIntentById(runtime.created.intent.intentId))?.state,
    'paid',
  )
  const persistedEvents = JSON.stringify([...runtime.store.events.values()])
  assert.equal(persistedEvents.includes('Sensitive Sender'), false)
  assert.equal(persistedEvents.includes('1234567890'), false)

  const repeated = await invoke({
    provider: 'straitsx',
    request: straitsxRequest({ rawBody: body }),
    runtime,
  })
  assert.equal(repeated.status, 200)
  assert.equal((await repeated.json() as { duplicate: boolean }).duplicate, true)

  const refundedBody = JSON.stringify({
    ...JSON.parse(body) as Record<string, unknown>,
    status: 'refunded',
  })
  const laterStatus = await invoke({
    provider: 'straitsx',
    request: straitsxRequest({ rawBody: refundedBody }),
    runtime,
  })
  assert.equal(laterStatus.status, 200)
  assert.equal((await laterStatus.json() as { duplicate: boolean }).duplicate, false)
  assert.equal(runtime.store.events.size, 2)
  assert.equal(reads, 1)
})

test('failed and stale event claims remain reprocessable', async () => {
  let reads = 0
  const runtime = await buildRuntime({
    rail: 'stripe',
    async read(record) {
      reads += 1
      if (reads === 1) {
        return {
          ok: false,
          code: 'provider_outcome_unknown',
          error: null,
          calls: [],
        }
      }
      return buildAdapter().read(record)
    },
  })
  const providerObjectId = runtime.record.providerObjectId || ''
  const failedBody = stripeBody({ eventId: 'evt_failed', providerObjectId })
  const failed = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: failedBody }),
    runtime,
  })
  assert.equal(failed.status, 503)
  assert.equal(runtime.store.events.get('stripe:evt_failed')?.status, 'failed')

  const redelivered = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: failedBody }),
    runtime,
  })
  assert.equal(redelivered.status, 200)
  assert.equal(runtime.store.events.get('stripe:evt_failed')?.status, 'processed')
  assert.equal(reads, 2)

  const staleRuntime = await buildRuntime({ rail: 'stripe' })
  const staleObjectId = staleRuntime.record.providerObjectId || ''
  const staleBody = stripeBody({ eventId: 'evt_stale', providerObjectId: staleObjectId })
  await staleRuntime.store.claimProviderEvent({
    provider: 'stripe',
    eventId: 'evt_stale',
    semanticKey: `checkout.session.completed:${staleObjectId}`,
    rawBodyHash: createHash('sha256').update(staleBody).digest('hex'),
    receivedAt: new Date(NOW.getTime() - 301_000).toISOString(),
  })
  const reclaimed = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: staleBody }),
    runtime: staleRuntime,
  })
  assert.equal(reclaimed.status, 200)
  assert.equal(staleRuntime.store.events.get('stripe:evt_stale')?.status, 'processed')
})

test('an active claim dedupes concurrent delivery before the provider read completes', async () => {
  const pendingRead: {
    record?: PaymentIntentRecord
    resolve?: (result: PaymentProviderReadResult) => void
  } = {}
  let markReadStarted: (() => void) | null = null
  const readStarted = new Promise<void>(resolve => {
    markReadStarted = resolve
  })
  const runtime = await buildRuntime({
    rail: 'stripe',
    async read(record) {
      pendingRead.record = record
      markReadStarted?.()
      return new Promise<PaymentProviderReadResult>(resolve => {
        pendingRead.resolve = resolve
      })
    },
  })
  const body = stripeBody({
    eventId: 'evt_concurrent',
    providerObjectId: runtime.record.providerObjectId || '',
  })
  const firstDelivery = invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: body }),
    runtime,
  })
  await readStarted
  assert.ok(pendingRead.record)

  const duplicate = await invoke({
    provider: 'stripe',
    request: stripeRequest({ rawBody: body }),
    runtime,
  })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true)

  const record = pendingRead.record
  const resolveRead = pendingRead.resolve
  if (!record || !resolveRead) {
    throw new Error('Expected the first provider read to remain pending.')
  }
  resolveRead({
    ok: true,
    state: 'paid',
    amountMinor: record.amountMinor,
    currency: record.currency,
    providerObjectId: record.providerObjectId || '',
    clientIntentReference:
      `knowgrph:${record.rail}:create:${record.clientIntentKey}`,
    providerRequestId: 'request_concurrent_winner',
    refundTargetId: 'payment_intent_1',
    calls: [],
  })
  const completed = await firstDelivery
  assert.equal(completed.status, 200)
  assert.equal((await completed.json() as { duplicate: boolean }).duplicate, false)
  assert.equal(
    runtime.store.operationLog.filter(item => item.startsWith('provider-read')).length,
    1,
  )
})

test('only one stale claimant wins and the superseded claim token cannot finalize', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const oldClaim = await store.claimProviderEvent({
    provider: 'stripe',
    eventId: 'evt_claim_fence',
    semanticKey: 'checkout.session.completed:cs_claim_fence',
    rawBodyHash: 'raw_hash',
    receivedAt: new Date(NOW.getTime() - 301_000).toISOString(),
  })
  assert.equal(oldClaim.ok, true)
  assert.equal(oldClaim.shouldProcess, true)
  if (!oldClaim.ok || !oldClaim.shouldProcess) {
    throw new Error('Expected the initial provider-event claim.')
  }

  const claimArgs = {
    provider: 'stripe' as const,
    eventId: 'evt_claim_fence',
    semanticKey: 'checkout.session.completed:cs_claim_fence',
    rawBodyHash: 'raw_hash',
    receivedAt: NOW.toISOString(),
  }
  const claims = await Promise.all([
    store.claimProviderEvent(claimArgs),
    store.claimProviderEvent(claimArgs),
  ])
  const winners = claims.filter(claim => claim.ok && claim.shouldProcess)
  const duplicates = claims.filter(claim => claim.ok && !claim.shouldProcess)
  assert.equal(winners.length, 1)
  assert.equal(duplicates.length, 1)
  const winner = winners[0]
  if (!winner.ok || !winner.shouldProcess) {
    throw new Error('Expected one stale-claim winner.')
  }

  const oldCompletion = await store.completeProviderEvent({
    provider: 'stripe',
    eventId: oldClaim.claimEventId,
    claimToken: oldClaim.claimToken,
    processedAt: NOW.toISOString(),
  })
  assert.equal(oldCompletion, false)
  assert.equal(store.events.get('stripe:evt_claim_fence')?.status, 'processing')

  const winnerCompletion = await store.completeProviderEvent({
    provider: 'stripe',
    eventId: winner.claimEventId,
    claimToken: winner.claimToken,
    processedAt: NOW.toISOString(),
  })
  assert.equal(winnerCompletion, true)
  assert.equal(store.events.get('stripe:evt_claim_fence')?.status, 'processed')
})
