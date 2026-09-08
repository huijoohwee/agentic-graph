import { abortAllDurableObjects } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../index'
import {
  runtimeEnv, userId, providerEnv, readReply, authHeaders, createCheckout, eventFor,
  sendEvent, state, installStrytreeNativeFixture,
} from './helpers/strytree-native-fixture'

installStrytreeNativeFixture()

const storyId = 'generation-contract-story'
const nodeId = 'generation-contract-root'
const generationKey = 'generation-contract-request'
const generationBody = () => ({
  story_id: storyId, parent_node_id: nodeId, prompt: 'A buyer-owned archival continuation.',
  image_references: [{ type: 'subject', img_id: 101, ref_name: 'archivist' }],
})
const submit = async (overrides: Record<string, unknown>, body = generationBody()) => readReply(
  await worker.fetch(new Request('https://payment.test/api/strytree/generation-jobs', {
    method: 'POST', headers: authHeaders(generationKey), body: JSON.stringify(body),
  }), { ...providerEnv(), ...overrides }),
)
const jobs = async () => (await runtimeEnv.DB.prepare('SELECT * FROM strytree_generation_jobs ORDER BY id').all()).results
const generationState = async () => ({ financial: await state(), jobs: await jobs() })
const media = () => runtimeEnv.STRYTREE_MEDIA_BUCKET as R2Bucket
const mediaKeys = async () => (await media().list({ prefix: 'strytree/generation/' })).objects.map(({ key }) => key).sort()
const queueCapture = () => {
  const messages: unknown[] = []
  return { messages, binding: { async send(body: unknown) { messages.push(structuredClone(body)) } } }
}
const fundBuyerAndStory = async () => {
  const checkout = await createCheckout()
  const paid = await sendEvent(eventFor(checkout))
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
  expect((await state()).balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
  const now = new Date().toISOString()
  await runtimeEnv.DB.batch([
    runtimeEnv.DB.prepare(`INSERT INTO strytree_stories
      (id, slug, title, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind(storyId, storyId, 'Paid native generation', now, now),
    runtimeEnv.DB.prepare(`INSERT INTO strytree_nodes
      (id, story_id, creator_user_id, title, synopsis, status, visibility, moderation_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 'public', 'approved', ?, ?)`)
      .bind(nodeId, storyId, userId, 'Root', 'A seeded native story root.', now, now),
  ])
}
const expectOneDebit = async () => {
  const financial = await state()
  const debits = financial.ledger.filter(row => row.event_type === 'generation_debit')
  expect(debits).toHaveLength(1)
  expect(debits[0]).toMatchObject({ amount_credits: -5, balance_after_credits: 15, authority_version: 2 })
  expect(financial.balance).toMatchObject({ balance_credits: 15, authority_version: 2 })
  expect(await jobs()).toHaveLength(1)
  return debits[0]
}
const consume = async (body: unknown, overrides: Record<string, unknown>) => {
  let acked = 0; let retried = 0; let error: unknown = null
  try {
    await worker.queue({ messages: [{ body, ack() { acked += 1 }, retry() { retried += 1 } }] },
      { ...providerEnv(), ...overrides })
  } catch (caught) { error = caught }
  return { acked, retried, error }
}
const expectAck = (delivery: Awaited<ReturnType<typeof consume>>) => {
  expect(delivery.error).toBeNull()
  expect(delivery.acked).toBe(1)
  expect(delivery.retried).toBe(0)
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
const untilEntered = async (entered: Promise<void>, operation: Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      entered,
      operation.then(() => { throw new Error('owned_operation_finished_before_controlled_stage') }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('controlled_stage_not_entered')), 2_000) }),
    ])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}
const liveProvider = (fetcher: (input: string | Request, init?: RequestInit) => Promise<Response>) => ({
  STRYTREE_PROVIDER_MODE: 'live',
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY: 'test-only-generation-provider-key',
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH: fetcher,
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS: '1',
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS: '0',
})

describe('Strytree native purchased-credit generation delivery', () => {
  it('does not debit or create a job when the queue binding is missing', async () => {
    await fundBuyerAndStory()
    const before = await generationState()
    const reply = await submit({ STRYTREE_GENERATION_QUEUE: undefined })
    expect(reply.status, JSON.stringify(reply.body)).toBe(503)
    expect(await generationState()).toEqual(before)
    expect(await mediaKeys()).toEqual([])
  })

  it('recovers rejected queue sending on the same request without another debit or effective job', async () => {
    await fundBuyerAndStory()
    const accepted: unknown[] = []
    let sends = 0
    const binding = { async send(body: unknown) {
      sends += 1
      if (sends === 1) throw new Error('test_queue_rejected_before_acceptance')
      accepted.push(structuredClone(body))
    } }
    const interrupted = await submit({ STRYTREE_GENERATION_QUEUE: binding })
    expect(interrupted.status, JSON.stringify(interrupted.body)).toBe(503)
    expect(accepted).toEqual([])
    await expectOneDebit()
    const retry = await submit({ STRYTREE_GENERATION_QUEUE: binding })
    expect([200, 202]).toContain(retry.status)
    expect(accepted).toHaveLength(1)
    expect(sends).toBe(2)
    const debit = await expectOneDebit()
    expect(accepted[0]).toMatchObject({ job_id: debit.related_object_id, type: 'strytree.generation_job.created' })
    const delivered = await generationState()
    const replay = await submit({ STRYTREE_GENERATION_QUEUE: binding })
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(sends).toBe(2)
    expect(await generationState()).toEqual(delivered)
  })

  it('rejects a changed payload under the same generation key without dispatch or financial drift', async () => {
    await fundBuyerAndStory()
    const queue = queueCapture()
    const first = await submit({ STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(first.status, JSON.stringify(first.body)).toBe(202)
    const before = await generationState()
    const conflict = await submit({ STRYTREE_GENERATION_QUEUE: queue.binding }, {
      ...generationBody(), prompt: 'A different paid continuation under the same key.',
    })
    expect(conflict.status, JSON.stringify(conflict.body)).toBe(409)
    expect(queue.messages).toHaveLength(1)
    expect(await generationState()).toEqual(before)
  })

  it('coalesces concurrent identical creation into one dispatch and one authoritative debit', async () => {
    await fundBuyerAndStory()
    const queue = queueCapture()
    const replies = await Promise.all([
      submit({ STRYTREE_GENERATION_QUEUE: queue.binding }),
      submit({ STRYTREE_GENERATION_QUEUE: queue.binding }),
    ])
    for (const reply of replies) expect([200, 202], JSON.stringify(reply.body)).toContain(reply.status)
    expect(replies[0].body.job_id).toBe(replies[1].body.job_id)
    expect(queue.messages).toHaveLength(1)
    await expectOneDebit()
  })

  it('admits one provider submit when a duplicate consumer arrives while provider response is deferred', async () => {
    await fundBuyerAndStory()
    const queue = queueCapture()
    const created = await submit({ STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(created.status, JSON.stringify(created.body)).toBe(202)
    await expectOneDebit()
    expect(queue.messages).toHaveLength(1)
    const entered = deferred<void>(); const release = deferred<void>()
    let submits = 0; let polls = 0
    const provider = liveProvider(async (_input, init) => {
      if (init?.method === 'POST') {
        submits += 1; entered.resolve(); await release.promise
        return Response.json({ ErrCode: 0, Resp: { video_id: 707 } })
      }
      polls += 1
      return Response.json({ ErrCode: 0, Resp: { id: 707, status: 1, url: 'https://provider.example/fixture707.mp4' } })
    })
    const first = consume(queue.messages[0], provider)
    let duplicate: ReturnType<typeof consume> | undefined
    let firstResult: Awaited<ReturnType<typeof consume>> | undefined
    const failures: unknown[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await untilEntered(entered.promise, first)
      duplicate = consume(structuredClone(queue.messages[0]), provider)
      const duplicateResult = await Promise.race([
        duplicate,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('duplicate_delivery_did_not_return_retry')), 2_000)
        }),
      ])
      expect(duplicateResult.error).toBeInstanceOf(Error)
      expect((duplicateResult.error as Error).message).toMatch(/\bgeneration_in_progress\b/)
      expect(duplicateResult.retried).toBe(1)
      expect(duplicateResult.acked).toBe(0)
      expect(submits).toBe(1)
      expect(polls).toBe(0)
      await expectOneDebit()
      expect((await state()).ledger.filter(row => row.event_type === 'refund_credit')).toEqual([])
    } catch (error) { failures.push(error) } finally {
      if (timer !== undefined) clearTimeout(timer)
      release.resolve()
      firstResult = await first
      if (duplicate) await duplicate
      if (firstResult.error) failures.push(firstResult.error)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'generation delivery and owned cleanup failed')
    expectAck(firstResult!)
    expect(submits).toBe(1)
    expect(polls).toBe(1)
    await expectOneDebit()
    const completed = await jobs()
    expect(completed[0]).toMatchObject({ status: 'succeeded', refund_ledger_event_id: null })
    expect(await mediaKeys()).toHaveLength(2)
    expectAck(await consume(queue.messages[0], provider))
    expect(submits).toBe(1)
    expect(await jobs()).toEqual(completed)
  })

  it('refunds a provider failure once and preserves that refund on consumer replay', async () => {
    await fundBuyerAndStory()
    const queue = queueCapture()
    const created = await submit({ STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(created.status, JSON.stringify(created.body)).toBe(202)
    const debit = await expectOneDebit()
    let providerCalls = 0
    const provider = liveProvider(async (_input, init) => {
      providerCalls += 1
      return init?.method === 'POST'
        ? Response.json({ ErrCode: 0, Resp: { video_id: 808 } })
        : Response.json({ ErrCode: 0, Resp: { id: 808, status: 7 } })
    })
    expectAck(await consume(queue.messages[0], provider))
    const failed = await generationState()
    expect(failed.financial.balance).toMatchObject({ balance_credits: 20, authority_version: 3 })
    const refunds = failed.financial.ledger.filter(row => row.event_type === 'refund_credit')
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({ amount_credits: 5, related_object_id: debit.related_object_id })
    expect(JSON.parse(String(refunds[0].metadata_json))).toMatchObject({ debit_ledger_event_id: debit.id })
    expect(failed.jobs[0]).toMatchObject({ status: 'failed', refund_ledger_event_id: refunds[0].id })
    expect(failed.jobs[0].fallback_artifact_json).toBeTruthy()
    expect(await mediaKeys()).toEqual([])
    expectAck(await consume(queue.messages[0], provider))
    expect(providerCalls).toBe(2)
    expect(await generationState()).toEqual(failed)
  })
})

const paidQueuedJob = async () => {
  await fundBuyerAndStory()
  const queue = queueCapture()
  const reply = await submit({ STRYTREE_GENERATION_QUEUE: queue.binding })
  expect(reply.status, JSON.stringify(reply.body)).toBe(202)
  expect(queue.messages).toHaveLength(1)
  await expectOneDebit()
  return queue.messages[0]
}
const expectReconciliation = (delivery: Awaited<ReturnType<typeof consume>>) => {
  expect(delivery.error).toBeInstanceOf(Error)
  expect(delivery.error).toMatchObject({
    code: 'generation_reconciliation_required', reconciliation: true, retryable: false,
  })
  expect(delivery.acked).toBe(0)
  expect(delivery.retried).toBe(1)
}
const expectPendingDebit = async (providerId: string | null) => {
  await expectOneDebit()
  expect((await jobs())[0]).toMatchObject({
    status: 'reconciliation_required', provider_job_id: providerId,
    refund_ledger_event_id: null, error_code: 'generation_reconciliation_required',
  })
  expect((await state()).ledger.filter(row => row.event_type === 'refund_credit')).toEqual([])
  expect(await mediaKeys()).toEqual([])
}
const expiredCheckpoint = () => JSON.stringify({
  kind: 'strytree-generation-claim', version: 1, token: 'test-only-expired-owner',
  expiresAtMs: Date.now() - 60_000,
})

describe('Strytree native ambiguous delivery recovery', () => {
  it('retains the debit after a rejected POST and never automatically resubmits the unknown effect', async () => {
    const message = await paidQueuedJob()
    const methods: string[] = []
    const provider = liveProvider(async (_input, init) => {
      methods.push(init?.method || 'GET')
      throw new TypeError('test_submission_connection_lost')
    })
    expectReconciliation(await consume(message, provider))
    await expectPendingDebit(null)
    const interrupted = await generationState()
    expectReconciliation(await consume(message, provider))
    expect(methods).toEqual(['POST'])
    expect(await generationState()).toEqual(interrupted)
  })

  it('resumes a recorded provider job with GET only after credentials recover and the ledger actor restarts', async () => {
    const message = await paidQueuedJob()
    const methods: string[] = []; const pollPaths: string[] = []
    let firstPoll = true
    const provider = liveProvider(async (input, init) => {
      methods.push(init?.method || 'GET')
      if (init?.method === 'POST') return Response.json({ ErrCode: 0, Resp: { video_id: 909 } })
      pollPaths.push(new URL(String(input)).pathname)
      if (firstPoll) { firstPoll = false; return Response.json({ ErrMsg: 'test_poll_unavailable' }, { status: 503 }) }
      return Response.json({ ErrCode: 0, Resp: { id: 909, status: 1, url: 'https://provider.example/fixture909.mp4' } })
    })
    expectReconciliation(await consume(message, provider))
    await expectPendingDebit('909')
    const financial = await state()
    expectReconciliation(await consume(message, {
      ...provider, STRYTREE_PROVIDER_MODE: 'local',
      STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY: undefined, EXTERNAL_VIDEO_PROVIDER_API_KEY: undefined,
    }))
    await expectPendingDebit('909')
    expect(await state()).toEqual(financial)
    expect(methods).toEqual(['POST', 'GET'])
    await abortAllDurableObjects()
    await expectOneDebit()
    // A known live job cannot switch to the failure simulator and refund its debit.
    expectAck(await consume(message, { ...provider, STRYTREE_PROVIDER_MODE: 'fail' }))
    expect(methods).toEqual(['POST', 'GET', 'GET'])
    expect(pollPaths).toEqual(['/openapi/v2/video/result/909', '/openapi/v2/video/result/909'])
    await expectOneDebit()
    expect((await jobs())[0]).toMatchObject({ status: 'succeeded', provider_job_id: '909', refund_ledger_event_id: null })
    expect(await mediaKeys()).toHaveLength(2)
    const completed = await generationState()
    expectAck(await consume(message, provider))
    expect(await generationState()).toEqual(completed)
    expect(methods).toHaveLength(3)
  })

  it('withholds resubmission for an explicitly modelled expired processing checkpoint with no provider identity', async () => {
    const message = await paidQueuedJob()
    // This seeds a durable checkpoint; it does not claim to crash a running Worker.
    await runtimeEnv.DB.prepare(`UPDATE strytree_generation_jobs SET status = 'processing', result_json = ? WHERE id = ?`)
      .bind(expiredCheckpoint(), (await jobs())[0].id).run()
    let calls = 0
    const provider = liveProvider(async () => { calls += 1; throw new Error('unexpected_provider_call') })
    expectReconciliation(await consume(message, provider))
    await expectPendingDebit(null)
    const interrupted = await generationState()
    expectReconciliation(await consume(message, provider))
    expect(calls).toBe(0)
    expect(await generationState()).toEqual(interrupted)
  })

  it('resumes an explicitly modelled expired refund checkpoint without crediting the buyer twice', async () => {
    const message = await paidQueuedJob()
    let calls = 0
    const provider = liveProvider(async (_input, init) => {
      calls += 1
      return init?.method === 'POST' ? Response.json({ ErrCode: 0, Resp: { video_id: 808 } })
        : Response.json({ ErrCode: 0, Resp: { id: 808, status: 7 } })
    })
    expectAck(await consume(message, provider))
    const refunded = await state()
    expect(refunded.balance).toMatchObject({ balance_credits: 20, authority_version: 3 })
    const refunds = refunded.ledger.filter(row => row.event_type === 'refund_credit')
    expect(refunds).toHaveLength(1)
    // Model a refund already committed to the ledger, before its terminal job write.
    await runtimeEnv.DB.prepare(`UPDATE strytree_generation_jobs SET status = 'refunding', result_json = ?,
      refund_ledger_event_id = NULL, fallback_artifact_json = NULL WHERE id = ?`)
      .bind(expiredCheckpoint(), (await jobs())[0].id).run()
    await abortAllDurableObjects()
    expectAck(await consume(message, provider))
    expect(await state()).toEqual(refunded)
    expect((await jobs())[0]).toMatchObject({ status: 'failed', refund_ledger_event_id: refunds[0].id })
    expect((await jobs())[0].fallback_artifact_json).toBeTruthy()
    expect(await mediaKeys()).toEqual([])
    const completed = await generationState()
    expectAck(await consume(message, provider))
    expect(await generationState()).toEqual(completed)
    expect(calls).toBe(2)
  })

  it.each(['provider', 'local'] as const)('resumes persisted %s artifact bytes without another provider call after R2 failure', async mode => {
    const message = await paidQueuedJob()
    const methods: string[] = []
    const provider = liveProvider(async (_input, init) => {
      methods.push(init?.method || 'GET')
      return init?.method === 'POST' ? Response.json({ ErrCode: 0, Resp: { video_id: 919 } })
        : Response.json({ ErrCode: 0, Resp: { id: 919, status: 1, url: 'https://provider.example/fixture919.mp4' } })
    })
    const initial = mode === 'provider' ? provider : {
      ...provider, STRYTREE_PROVIDER_MODE: 'local',
      STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY: undefined, EXTERNAL_VIDEO_PROVIDER_API_KEY: undefined,
    }
    const written: string[] = []; const persistedBeforePut: unknown[] = []
    expectReconciliation(await consume(message, { ...initial, STRYTREE_MEDIA_BUCKET: {
      async put(_key: string, value: string) {
        written.push(value)
        persistedBeforePut.push(JSON.parse(String((await jobs())[0].result_json)).finalization)
        throw new Error('test_artifact_storage_unavailable')
      },
    } }))
    expect(written).toHaveLength(1)
    expect(persistedBeforePut).toEqual([expect.objectContaining({ mode, artifact: written[0] })])
    const interrupted = (await jobs())[0]
    const intent = JSON.parse(String(interrupted.result_json)).finalization
    expect(intent).toEqual(persistedBeforePut[0])
    expect(typeof intent.resultJson).toBe('string')
    expect(typeof intent.providerJobId).toBe('string')
    await expectOneDebit()
    expect(interrupted).toMatchObject({ status: 'reconciliation_required', refund_ledger_event_id: null })
    expect(await mediaKeys()).toEqual([])
    const firstMethods = mode === 'provider' ? ['POST', 'GET'] : []
    expect(methods).toEqual(firstMethods)
    await abortAllDurableObjects()
    // Even a changed live configuration must complete the original local intent.
    expectAck(await consume(message, provider))
    expect(methods).toEqual(firstMethods)
    await expectOneDebit()
    const completed = (await jobs())[0]
    expect(completed).toMatchObject({ status: 'succeeded', refund_ledger_event_id: null, provider_job_id: intent.providerJobId })
    expect(completed.result_json).toBe(intent.resultJson)
    const keys = await mediaKeys()
    expect(keys).toHaveLength(2)
    for (const key of keys) expect(await (await media().get(key))!.text()).toBe(written[0])
    const settled = await generationState()
    expectAck(await consume(message, provider))
    expect(await generationState()).toEqual(settled)
    expect(methods).toEqual(firstMethods)
  })

  it('caps configured polling at sixty attempts while retaining the pending provider identity and debit', async () => {
    const message = await paidQueuedJob()
    const methods: string[] = []
    const provider = liveProvider(async (_input, init) => {
      methods.push(init?.method || 'GET')
      return init?.method === 'POST' ? Response.json({ ErrCode: 0, Resp: { video_id: 929 } })
        : Response.json({ ErrCode: 0, Resp: { id: 929, status: 5 } })
    })
    expectReconciliation(await consume(message, { ...provider, STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS: '1000' }))
    expect(methods).toEqual(['POST', ...Array.from({ length: 60 }, () => 'GET')])
    await expectPendingDebit('929')
  })

  it('preserves winner bytes when a modelled expired owner completes its already-started R2 write late', async () => {
    const message = await paidQueuedJob()
    const entered = deferred<void>(); const release = deferred<void>()
    const methods: string[] = []
    const provider = liveProvider(async (_input, init) => {
      methods.push(init?.method || 'GET')
      return init?.method === 'POST' ? Response.json({ ErrCode: 0, Resp: { video_id: 939 } })
        : Response.json({ ErrCode: 0, Resp: { id: 939, status: 1, url: 'https://provider.example/fixture939.mp4' } })
    })
    let blockedBytes: string | undefined; let puts = 0; let lateWrites = 0
    const first = consume(message, { ...provider, STRYTREE_MEDIA_BUCKET: {
      async put(key: string, value: string, options?: R2PutOptions) {
        puts += 1
        if (puts === 1) { blockedBytes = value; entered.resolve(); await release.promise }
        const result = await media().put(key, value, options)
        lateWrites += 1
        return result
      },
    } })
    const readArtifacts = async () => Promise.all((await mediaKeys()).map(async key => {
      const object = await media().get(key)
      expect(object).not.toBeNull()
      return { key, etag: object!.etag, body: await object!.text() }
    }))
    let winner: Awaited<ReturnType<typeof generationState>> | undefined
    let winnerArtifacts: Awaited<ReturnType<typeof readArtifacts>> | undefined
    const failures: unknown[] = []
    try {
      await untilEntered(entered.promise, first)
      const blocked = (await jobs())[0]
      const checkpoint = JSON.parse(String(blocked.result_json))
      expect(checkpoint.finalization).toMatchObject({ mode: 'provider', artifact: blockedBytes, providerJobId: '939' })
      expect(await mediaKeys()).toEqual([])
      // Model only lease expiry while the first native write is blocked; no Worker crash is claimed.
      const expiredAt = Date.now() - 60_000
      const changed = await runtimeEnv.DB.prepare(`UPDATE strytree_generation_jobs
        SET result_json = json_set(result_json, '$.expiresAtMs', ?)
        WHERE id = ? AND status = 'processing' AND result_json = ?`)
        .bind(expiredAt, blocked.id, blocked.result_json).run()
      expect(changed.meta.changes).toBe(1)
      const expired = (await jobs())[0]
      expect(expired).toEqual({ ...blocked, result_json: expired.result_json })
      expect(JSON.parse(String(expired.result_json))).toEqual({ ...checkpoint, expiresAtMs: expiredAt })
      expectAck(await consume(structuredClone(message), provider))
      expect(methods).toEqual(['POST', 'GET'])
      await expectOneDebit()
      winner = await generationState()
      expect(winner.jobs[0]).toMatchObject({ status: 'succeeded', provider_job_id: '939', refund_ledger_event_id: null })
      winnerArtifacts = await readArtifacts()
      expect(winnerArtifacts).toHaveLength(2)
      for (const artifact of winnerArtifacts) expect(artifact.body).toBe(blockedBytes)
      expect(lateWrites).toBe(0)
    } catch (error) { failures.push(error) } finally {
      release.resolve()
      const firstResult = await first
      try {
        expect(firstResult.error).toBeInstanceOf(Error)
        expect(firstResult.error).toMatchObject({ code: 'generation_claim_lost', retryable: true, reconciliation: false })
        expect(firstResult.retried).toBe(1)
        expect(firstResult.acked).toBe(0)
      } catch (error) { failures.push(error) }
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'stale R2 scenario and owned delivery cleanup failed')
    expect(puts).toBe(1)
    expect(lateWrites).toBe(1)
    expect(methods).toEqual(['POST', 'GET'])
    expect(await readArtifacts()).toEqual(winnerArtifacts)
    expect(await generationState()).toEqual(winner)
  })
})
