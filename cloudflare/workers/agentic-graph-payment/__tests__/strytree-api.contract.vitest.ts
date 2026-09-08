import { createExecutionContext, createMessageBatch, getQueueResult, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../index'
import {
  runtimeEnv, userId, providerEnv, readReply, authHeaders, createCheckout, eventFor,
  sendEvent, state, installStrytreeNativeFixture,
} from './helpers/strytree-native-fixture'

installStrytreeNativeFixture()

const storyId = 'api-contract-story', rootId = 'api-contract-root', paidId = 'api-contract-paid'
const creatorId = 'api-contract-creator'
const route = async (path: string, init: RequestInit = {}, overrides: Record<string, unknown> = {}) => readReply(
  await worker.fetch(new Request(`https://payment.test/api/strytree${path}`, init), { ...providerEnv(), ...overrides }),
)
const post = (path: string, key: string, body: unknown = {}, overrides: Record<string, unknown> = {}) => route(
  path, { method: 'POST', headers: authHeaders(key), body: JSON.stringify(body) }, overrides,
)
const queueCapture = () => {
  const messages: unknown[] = []
  return { messages, binding: { async send(body: unknown) { messages.push(structuredClone(body)) } } }
}
const seedStory = async () => {
  expect((await sendEvent(eventFor(await createCheckout()))).status).toBe(200)
  const now = new Date().toISOString()
  await runtimeEnv.DB.batch([
    runtimeEnv.DB.prepare(`INSERT INTO strytree_users (id, display_name, role, created_at, updated_at)
      VALUES (?, 'API native creator', 'creator', ?, ?)`).bind(creatorId, now, now),
    runtimeEnv.DB.prepare(`INSERT INTO strytree_stories (id, slug, title, root_node_id, status, created_at, updated_at)
      VALUES (?, ?, 'Native API story', ?, 'active', ?, ?)`).bind(storyId, storyId, rootId, now, now),
    ...[[rootId, 1, 0], [paidId, 0, 5]].map(([id, free, price]) => runtimeEnv.DB.prepare(`INSERT INTO strytree_nodes
      (id, story_id, creator_user_id, title, synopsis, status, visibility, moderation_status,
       is_free_window, unlock_price_credits, video_object_key, created_at, updated_at)
      VALUES (?, ?, ?, 'Native branch', 'A protected continuation.', 'active', 'public', 'approved', ?, ?, ?, ?, ?)`)
      .bind(id, storyId, creatorId, free, price, `r2://api-contract/${id}.mp4`, now, now)),
  ])
}
const rows = async (table: string) => (await runtimeEnv.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results
const apiState = async () => ({
  financial: await state(), nodes: await rows('strytree_nodes'), unlocks: await rows('strytree_unlocks'),
  jobs: await rows('strytree_generation_jobs'), runs: await rows('strytree_candidate_runs'),
  candidates: await rows('strytree_branch_candidates'), plans: await rows('strytree_candidate_merge_plans'),
  media: (await (runtimeEnv.STRYTREE_MEDIA_BUCKET as R2Bucket).list()).objects.map(({ key }) => key).sort(),
})
const generationBody = () => ({ story_id: storyId, parent_node_id: rootId,
  prompt: 'Generate an archival continuation with inherited references.',
  image_references: [
    { type: 'subject', img_id: 101, ref_name: 'archivist' },
    { type: 'background', img_id: 202, ref_name: 'archive_hall' },
  ], model: 'v4.5', duration: 5, quality: '540p', aspect_ratio: '16:9', seed: 112233,
})
const consume = async (body: unknown, overrides: Record<string, unknown>) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch('strytree-native-api', [{ id: 'api-message', timestamp: new Date(), attempts: 1, body }])
  await worker.queue(batch, { ...providerEnv(), ...overrides })
  const result = await getQueueResult(batch, ctx)
  expect(result.explicitAcks).toEqual(['api-message'])
  expect(result.retryMessages).toEqual([])
}

describe('Strytree native public and authenticated API contracts', () => {
  it('hides paid media anonymously and preserves entitlement when an unlocked buyer supplies a new key', async () => {
    await seedStory()
    const publicBefore = await route(`/stories/${storyId}/tree`)
    expect(publicBefore.status).toBe(200)
    expect(publicBefore.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: paidId, entitlement_hint: 'locked', video_object_key: null }),
    ]))
    const first = await post(`/nodes/${paidId}/unlock`, 'api-unlock-first')
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body).toMatchObject({ entitlement: 'full', balance_after_credits: 15,
      creator_credit_credits: 4, platform_fee_credits: 1 })
    const committed = await apiState()
    const debit = committed.financial.ledger.filter(row => row.event_type === 'unlock_debit')
    expect(debit).toHaveLength(1)
    expect(debit[0]).toMatchObject({ amount_credits: -5, balance_after_credits: 15 })
    expect(JSON.parse(String(debit[0].metadata_json))).toMatchObject({ creator_user_id: creatorId,
      creator_credit_credits: 4, platform_fee_credits: 1 })
    const replay = await post(`/nodes/${paidId}/unlock`, 'api-unlock-different-key')
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ already_unlocked: true, ledger_event_id: first.body.ledger_event_id })
    expect(await apiState()).toEqual(committed)
    const privateView = await route(`/stories/${storyId}/tree`, { headers: authHeaders() })
    expect(privateView.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: paidId, entitlement_hint: 'full', video_object_key: `r2://api-contract/${paidId}.mp4` }),
    ]))
    const publicAfter = await route(`/stories/${storyId}/tree`)
    expect(publicAfter.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: paidId, entitlement_hint: 'locked', video_object_key: null }),
    ]))
  })

  it.each([
    ['unlock', `/nodes/${paidId}/unlock`, {}],
    ['checkout create', '/checkout/sessions', { package_id: 'credits_20' }],
    ['local checkout complete', '/checkout/sessions/missing/complete', {}],
    ['generation create', '/generation-jobs', generationBody()],
    ['candidate create', '/candidate-runs', { story_id: storyId, parent_node_id: rootId, max_candidates: 1, prompt: 'Private continuation.' }],
    ['candidate publish', '/candidates/missing/publish', { title: 'Private selection' }],
  ])('rejects unauthenticated %s before financial or delivery effects', async (_name, path, body) => {
    await seedStory()
    const queue = queueCapture(), before = await apiState()
    const denied = await route(String(path), { method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'api-unauthenticated' },
      body: JSON.stringify(body),
    }, { STRYTREE_CHECKOUT_MODE: 'local-development', STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(denied.status, JSON.stringify(denied.body)).toBe(401)
    expect(await apiState()).toEqual(before)
    expect(queue.messages).toEqual([])
  })

  it('returns three publishable scorecards and persists the selected child linkage without a candidate queue effect', async () => {
    await seedStory()
    const queue = queueCapture()
    const created = await post('/candidate-runs', 'api-candidates', {
      story_id: storyId, parent_node_id: rootId, max_candidates: 3, prompt: 'Compare three archive continuations.',
    }, { STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(created.status, JSON.stringify(created.body)).toBe(202)
    expect(created.body).toMatchObject({ status: 'completed', quoted_cost_credits: 15 })
    expect(queue.messages).toEqual([])
    const view = await route(`/candidate-runs/${created.body.candidate_run_id}`, { headers: authHeaders() })
    expect(view.status).toBe(200)
    const scorecards = view.body.scorecards as Array<Record<string, unknown>>
    expect(scorecards).toHaveLength(3)
    expect(scorecards.every(card => card.publish_eligible === true)).toBe(true)
    const selected = scorecards[0].candidate_id
    const published = await post(`/candidates/${selected}/publish`, 'api-publish', {
      title: 'Silent Archive Passage', synopsis: 'Preserve the archive path.', merge_notes: 'Publish one selected branch.',
    })
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(published.body).toMatchObject({ selected_candidate_id: selected, snapshot_version: 2 })
    const after = await apiState()
    expect(after.nodes.find(row => row.id === published.body.published_node_id)).toMatchObject({
      parent_node_id: rootId, selected_candidate_id: selected, title: 'Silent Archive Passage', synopsis: 'Preserve the archive path.',
    })
    expect(after.candidates.find(row => row.id === selected)).toMatchObject({ status: 'published' })
    expect(after.plans).toHaveLength(1)
    expect(after.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')).toEqual([
      expect.objectContaining({ amount_credits: -15, balance_after_credits: 5 }),
    ])
  })
})

describe('Strytree native local-development package contracts', () => {
  it.each([['credits_20', 20, 500], ['credits_50', 50, 1000], ['credits_100', 100, 1800]])(
    'maps %s and completes once across different completion keys', async (packageId, credit, cents) => {
      const local = { STRYTREE_CHECKOUT_MODE: 'local-development' }
      const created = await post('/checkout/sessions', 'api-package-create', { package_id: packageId }, local)
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      expect(created.body).toMatchObject({ package_id: packageId, status: 'open', credit_amount: credit,
        amount_total: cents, currency: 'usd' })
      const pending = await state()
      expect(pending.ledger).toEqual([])
      expect(pending.balance).toMatchObject({ balance_credits: 0, authority_version: 0 })
      expect(pending.wallet).toMatchObject({ wallet_status: 'pending_payment', balance_credits: 0,
        pending_payment: true, pending_credit_amount: credit })
      expect(pending.wallet.pending_payment_sessions).toEqual([
        expect.objectContaining({ payment_session_id: created.body.payment_session_id, credit_amount: credit }),
      ])
      const stub = runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)
      let originalEnv: Record<string, unknown> | undefined
      // Model the whole local deployment, including the real actor's separate environment.
      await runInDurableObject(stub, instance => {
        const owner = instance as unknown as { env: Record<string, unknown> }
        originalEnv = owner.env
        owner.env = { ...owner.env, ...local }
      })
      try {
        const path = `/checkout/sessions/${created.body.payment_session_id}/complete`
        const completed = await post(path, 'api-package-complete', {}, local)
        expect(completed.status, JSON.stringify(completed.body)).toBe(200)
        expect(completed.body).toMatchObject({ status: 'completed', credit_amount: credit, balance_after_credits: credit })
        const committed = await state()
        expect(committed.balance).toMatchObject({ balance_credits: credit, authority_version: 1 })
        expect(committed.ledger).toEqual([expect.objectContaining({ id: completed.body.ledger_event_id,
          event_type: 'purchase_credit', amount_credits: credit, balance_after_credits: credit })])
        expect(committed.sessions[0]).toMatchObject({ status: 'completed' })
        expect(committed.sessions[0].completed_at).toBeTruthy()
        const replay = await post(path, 'api-package-complete-new-key', {}, local)
        expect(replay.status, JSON.stringify(replay.body)).toBe(200)
        expect(replay.body).toMatchObject({ idempotent_replay: true, ledger_event_id: completed.body.ledger_event_id,
          balance_after_credits: credit })
        expect(await state()).toEqual(committed)
      } finally {
        await runInDurableObject(stub, instance => {
          ;(instance as unknown as { env: Record<string, unknown> }).env = originalEnv!
        })
      }
    },
  )
})

describe('Strytree native generation API and provider contracts', () => {
  it.each([
    { name: 'exhausted provider budget', missing: false, status: 429, code: 'provider_budget_exceeded' },
    { name: 'missing provider budget binding', missing: true, status: 503, code: 'provider_budget_unavailable' },
  ])('blocks $name before a debit, durable job or queue message', async ({ missing, status, code }) => {
    await seedStory()
    const queue = queueCapture(), before = await apiState()
    const kv = runtimeEnv.STRYTREE_PROVIDER_BUDGET_KV as KVNamespace
    const budgetKey = 'strytree:native-api-budget'
    await kv.put(budgetKey, JSON.stringify({ spent_cents: 100 }))
    try {
      const denied = await post('/generation-jobs', 'api-budget-blocked', generationBody(), {
        STRYTREE_GENERATION_QUEUE: queue.binding, STRYTREE_DAILY_PROVIDER_BUDGET_CENTS: '100',
        STRYTREE_PROVIDER_SPEND_KV_KEY: budgetKey,
        ...(missing ? { STRYTREE_PROVIDER_BUDGET_KV: undefined } : {}),
      })
      expect(denied.status, JSON.stringify(denied.body)).toBe(status)
      expect(denied.body.code).toBe(code)
      if (!missing) expect(denied.body).toMatchObject({ provider_spend_cents: 100,
        provider_budget_limit_cents: 100, provider_budget_key: budgetKey })
      expect(await apiState()).toEqual(before)
      expect(queue.messages).toEqual([])
    } finally { await kv.delete(budgetKey) }
  })

  it.each(['local', 'provider'])('delivers %s generation through native R2 and the authenticated GET contract', async mode => {
    await seedStory()
    const queue = queueCapture(), payload = generationBody()
    const calls: Array<{ url: string; method: string; apiKey: string | null; body: unknown }> = []
    const provider = {
      STRYTREE_PROVIDER_MODE: mode === 'provider' ? 'live' : 'local',
      STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY: mode === 'provider' ? 'test-only-api-provider-key' : undefined,
      EXTERNAL_VIDEO_PROVIDER_API_KEY: undefined,
      STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL: 'https://provider.test',
      STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS: '1', STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS: '0',
      async STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH(input: string | Request, init?: RequestInit) {
        calls.push({ url: typeof input === 'string' ? input : input.url, method: init?.method || 'GET',
          apiKey: new Headers(init?.headers).get('API-KEY'), body: init?.body ? JSON.parse(String(init.body)) : null })
        return init?.method === 'POST' ? Response.json({ ErrCode: 0, Resp: { video_id: 987654 } })
          : Response.json({ ErrCode: 0, Resp: { id: 987654, status: 1, url: 'https://provider.test/generated/987654.mp4' } })
      },
    }
    const created = await post('/generation-jobs', 'api-generation', payload, { STRYTREE_GENERATION_QUEUE: queue.binding })
    expect(created.status, JSON.stringify(created.body)).toBe(202)
    expect(created.body).toMatchObject({ quoted_cost_credits: 5, ledger_authority: 'durable-object', status: 'queued' })
    expect(queue.messages).toHaveLength(1)
    const before = await state()
    expect(before.ledger.filter(row => row.event_type === 'generation_debit')).toEqual([
      expect.objectContaining({ id: created.body.ledger_event_id, amount_credits: -5, balance_after_credits: 15 }),
    ])
    await consume(queue.messages[0], provider)
    const view = await route(`/generation-jobs/${created.body.job_id}`, { headers: authHeaders() })
    expect(view.status, JSON.stringify(view.body)).toBe(200)
    expect(view.body).toMatchObject({ job_id: created.body.job_id, status: 'succeeded', story_id: storyId,
      parent_node_id: rootId, debit_ledger_event_id: created.body.ledger_event_id, refund_ledger_event_id: null,
      quoted_cost_credits: 5, fallback_artifact: null, error_code: null,
      video_object_key: `strytree/generation/${created.body.job_id}/video.json`,
      thumbnail_object_key: `strytree/generation/${created.body.job_id}/thumbnail.json` })
    expect(typeof view.body.provider_job_id).toBe('string')
    expect(String(view.body.provider_job_id)).not.toBe('')
    expect(view.body.preview_url).toBe(`/api/strytree/media/${encodeURIComponent(String(view.body.video_object_key))}`)
    const bucket = runtimeEnv.STRYTREE_MEDIA_BUCKET as R2Bucket
    expect((await bucket.list()).objects).toHaveLength(2)
    for (const key of [view.body.video_object_key, view.body.thumbnail_object_key]) {
      const object = await bucket.get(String(key))
      expect(object).not.toBeNull()
      const artifact = await object!.json<Record<string, unknown>>()
      expect(artifact).toMatchObject({ job_id: created.body.job_id, provider: 'external_video_provider', prompt: payload.prompt,
        mode: mode === 'provider' ? 'external-video-provider-live-poll' : 'server-side-provider-safe-artifact',
        provider_job_id: mode === 'provider' ? '987654' : null,
        source_url: mode === 'provider' ? 'https://provider.test/generated/987654.mp4' : null })
    }
    if (mode === 'provider') {
      expect(view.body.provider_job_id).toBe('987654')
      expect(calls).toEqual([
        { url: 'https://provider.test/openapi/v2/video/fusion/generate', method: 'POST', apiKey: 'test-only-api-provider-key',
          body: { image_references: payload.image_references, prompt: payload.prompt, model: 'v4.5', duration: 5,
            quality: '540p', aspect_ratio: '16:9', seed: 112233 } },
        { url: 'https://provider.test/openapi/v2/video/result/987654', method: 'GET', apiKey: 'test-only-api-provider-key', body: null },
      ])
    } else expect(calls).toEqual([])
    expect((await route(`/generation-jobs/${created.body.job_id}`)).status).toBe(401)
    const committed = await apiState()
    await consume(queue.messages[0], provider)
    expect(await apiState()).toEqual(committed)
    expect(calls).toHaveLength(mode === 'provider' ? 2 : 0)
  })
})

describe('Strytree native ledger and queue runtime', () => {
  it('replays a changed request event ID under the original key without inserting another debit', async () => {
    await seedStory()
    const actor = runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)
    const body = { id: 'api-ledger-original', user_id: userId, event_type: 'generation_debit', amount_credits: -5,
      related_object_type: 'strytree_generation_job', related_object_id: 'api-ledger-job', provider_event_id: null,
      idempotency_key: 'api-ledger-key', metadata_json: '{}', created_at: new Date().toISOString() }
    const mutate = (payload: unknown) => actor.fetch(new Request('https://ledger.internal/mutations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })).then(readReply)
    const first = await mutate(body)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ ledger_event_id: body.id, balance_after_credits: 15,
      authority: 'durable-object-sqlite', idempotent_replay: false })
    const committed = await state()
    const replay = await mutate({ ...body, id: 'api-ledger-replay-must-not-insert' })
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ ledger_event_id: body.id, balance_after_credits: 15, idempotent_replay: true })
    expect(await state()).toEqual(committed)
  })

  it('runs real actor health and refuses a debit without D1 before changing its balance', async () => {
    const stub = runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)
    const health = await readReply(await stub.fetch(new Request('https://ledger.internal/health')))
    expect(health.status).toBe(200)
    expect(health.body).toMatchObject({ ok: true, service: 'strytree-credit-ledger', authority: 'durable-object-sqlite' })
    const denied = await runInDurableObject(stub, async instance => {
      const owner = instance as unknown as { env: Record<string, unknown>; fetch(request: Request): Promise<Response> }
      const originalEnv = owner.env
      owner.env = { ...owner.env, DB: undefined }
      try { return readReply(await owner.fetch(new Request('https://ledger.internal/debit', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          id: 'api-no-db-debit', user_id: userId, event_type: 'generation_debit', amount_credits: -5,
          related_object_type: 'strytree_generation_job', related_object_id: 'api-no-db-job', provider_event_id: null,
          idempotency_key: 'api-no-db-key', metadata_json: '{}', created_at: new Date().toISOString(),
        }),
      }))) } finally { owner.env = originalEnv }
    })
    expect(denied.status, JSON.stringify(denied.body)).toBe(503)
    expect(denied.body.ok).toBe(false)
    const after = await state()
    expect(after.balance).toMatchObject({ balance_credits: 0, authority_version: 0 })
    expect(after.ledger).toEqual([])
  })

  it('retries every native queue message and throws when the Worker D1 binding is missing', async () => {
    const before = await apiState(), ctx = createExecutionContext()
    const batch = createMessageBatch('strytree-native-api', ['missing-db-one', 'missing-db-two'].map(id => ({
      id, timestamp: new Date(), attempts: 1, body: { type: 'strytree.generation_job.created', job_id: id },
    })))
    await expect(worker.queue(batch, { ...providerEnv(), DB: undefined })).rejects.toThrow('missing Cloudflare D1 binding DB')
    const result = await getQueueResult(batch, ctx)
    expect(result.explicitAcks).toEqual([])
    expect(result.retryMessages.map(message => message.msgId).sort()).toEqual(['missing-db-one', 'missing-db-two'])
    expect(await apiState()).toEqual(before)
  })
})
