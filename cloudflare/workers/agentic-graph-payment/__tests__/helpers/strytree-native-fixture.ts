import { applyD1Migrations, reset, type D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, expect } from 'vitest'

import worker, { type AgenticGraphPaymentWorkerEnv } from '../../index'

export type RuntimeEnv = AgenticGraphPaymentWorkerEnv & {
  DB: D1Database
  STRYTREE_CREDIT_LEDGER: DurableObjectNamespace
  STRYTREE_TEST_MIGRATIONS: D1Migration[]
}
export type Checkout = { payment_session_id: string; checkout_session_id: string }
export type ProviderEvent = {
  id?: unknown
  type?: unknown
  data: { object: Record<string, unknown> & { metadata: Record<string, unknown> } }
}
export type Reply = { status: number; body: Record<string, unknown> }

export const runtimeEnv = env as RuntimeEnv
export const userId = 'checkout-contract-buyer'
const authSession = 'checkout-contract-auth-session'
const fixtureSecret = 'test-only-strytree-checkout-webhook-secret'
const origin = 'https://payment.test'
export const providerEnv = () => ({
  ...runtimeEnv,
  STRYTREE_CHECKOUT_MODE: 'provider-webhook',
  STRYTREE_CHECKOUT_WEBHOOK_SECRET: fixtureSecret,
})
export const readReply = async (response: Response): Promise<Reply> => ({
  status: response.status,
  body: await response.json() as Record<string, unknown>,
})
export const request = async (path: string, init: RequestInit = {}, localFixture = false) => readReply(
  await worker.fetch(new Request(`${origin}/api/strytree${path}`, init), {
    ...providerEnv(),
    ...(localFixture ? { STRYTREE_CHECKOUT_MODE: 'local-development' } : {}),
  }),
)
export const authHeaders = (key?: string) => ({
  authorization: `Bearer ${authSession}`,
  'content-type': 'application/json',
  ...(key ? { 'idempotency-key': key } : {}),
})

export const installStrytreeNativeFixture = () => {
  beforeEach(async () => {
    await reset()
    expect(runtimeEnv.STRYTREE_TEST_MIGRATIONS.map(({ name }) => name)).toEqual([
      '0004_strytree_storytree.sql', '0014_strytree_ledger_authority.sql',
    ])
    await applyD1Migrations(runtimeEnv.DB, runtimeEnv.STRYTREE_TEST_MIGRATIONS)
    const now = new Date().toISOString()
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`INSERT INTO strytree_users
        (id, display_name, role, created_at, updated_at) VALUES (?, ?, 'user', ?, ?)`)
        .bind(userId, 'Checkout contract buyer', now, now),
      runtimeEnv.DB.prepare(`INSERT INTO strytree_sessions
        (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
        .bind(authSession, userId, now, expires),
    ])
  })
  afterEach(async () => { await reset() })
}


export const createCheckout = async (): Promise<Checkout> => {
  const reply = await request('/checkout/sessions', {
    method: 'POST', headers: authHeaders('checkout-contract-create'),
    body: JSON.stringify({ package_id: 'credits_20' }),
  }, true)
  expect(reply.status, JSON.stringify(reply.body)).toBe(201)
  expect(reply.body).toMatchObject({
    ok: true, status: 'open', package_id: 'credits_20',
    credit_amount: 20, amount_total: 500, currency: 'usd',
  })
  expect(typeof reply.body.payment_session_id).toBe('string')
  expect(typeof reply.body.checkout_session_id).toBe('string')
  expect(reply.body.payment_session_id).not.toBe('')
  expect(reply.body.checkout_session_id).not.toBe('')
  return { payment_session_id: reply.body.payment_session_id as string,
    checkout_session_id: reply.body.checkout_session_id as string }
}
export const eventFor = (checkout: Checkout): ProviderEvent => ({
  id: 'evt-checkout-contract-paid', type: 'checkout.session.completed',
  data: { object: {
    id: checkout.checkout_session_id, payment_status: 'paid', amount_total: 500, currency: 'usd',
    metadata: {
      strytree_payment_session_id: checkout.payment_session_id,
      package_id: 'credits_20', user_id: userId,
    },
  } },
})
export const signature = async (payload: string, timestamp = Math.floor(Date.now() / 1000)) => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(fixtureSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)))
  return `t=${timestamp},v1=${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}
export const sendRaw = async (payload: string, header = 'strytree-signature', value?: string) => request(
  '/checkout/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', [header]: value ?? await signature(payload) },
    body: payload,
  },
)
export const sendEvent = (event: ProviderEvent, header?: string) => sendRaw(JSON.stringify(event), header)
export const wallet = async () => {
  const reply = await request('/wallet', { headers: authHeaders() })
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return reply.body
}
export const state = async () => {
  const actor = runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)
  const balance = await readReply(await actor.fetch(new Request(
    `https://strytree-credit-ledger.internal/balance?user_id=${encodeURIComponent(userId)}`,
  )))
  expect(balance.status, JSON.stringify(balance.body)).toBe(200)
  const [sessions, ledger, claims, audit, walletBody] = await Promise.all([
    runtimeEnv.DB.prepare('SELECT * FROM strytree_payment_sessions ORDER BY id').all(),
    runtimeEnv.DB.prepare('SELECT * FROM strytree_token_ledger ORDER BY id').all(),
    runtimeEnv.DB.prepare('SELECT * FROM strytree_provider_effect_claims ORDER BY provider_event_id').all(),
    runtimeEnv.DB.prepare('SELECT * FROM strytree_audit_events ORDER BY id').all(),
    wallet(),
  ])
  return { sessions: sessions.results, ledger: ledger.results, claims: claims.results, audit: audit.results,
    balance: balance.body, wallet: walletBody }
}
export const expectRejected = (reply: Reply) => {
  expect(reply.status, JSON.stringify(reply.body)).toBeGreaterThanOrEqual(400)
  expect(reply.status, JSON.stringify(reply.body)).toBeLessThan(500)
}

export const installCandidateNativeFixture = () => {
  installStrytreeNativeFixture()
  const storyId = 'candidate-replay-story', nodeId = 'candidate-replay-root'
  const otherStoryId = 'candidate-replay-other-story', otherNodeId = 'candidate-replay-other-root'
  const alternateNodeId = 'candidate-replay-alternate-root'
  const key = 'candidate-replay-request'
  const body = (): Record<string, unknown> => ({
    story_id: storyId, parent_node_id: nodeId, max_candidates: 2,
    prompt: 'A buyer-owned archival continuation.',
    context: { tags: ['archive', 'recovery'], preferences: { language: 'en', tone: 'clear' } },
  })
  let messages: unknown[] = []
  const queue = { async send(message: unknown) { messages.push(structuredClone(message)) } }
  const submit = async (payload: unknown = body(), overrides: Record<string, unknown> = {}, headerKey: string | null = key) => readReply(
    await worker.fetch(new Request('https://payment.test/api/strytree/candidate-runs', {
      method: 'POST', headers: authHeaders(headerKey ?? undefined), body: JSON.stringify(payload),
    }), { ...providerEnv(), STRYTREE_GENERATION_QUEUE: queue, ...overrides }),
  )
  const snapshot = async () => ({
    financial: await state(),
    runs: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_candidate_runs ORDER BY id').all()).results,
    candidates: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_branch_candidates ORDER BY id').all()).results,
    messages: structuredClone(messages),
  })

  beforeEach(async () => {
    messages = []
    const paid = await sendEvent(eventFor(await createCheckout()))
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    expect((await state()).balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
    const now = new Date().toISOString()
    await runtimeEnv.DB.batch([
      ...[storyId, otherStoryId].map(id => runtimeEnv.DB.prepare(`INSERT INTO strytree_stories
        (id, slug, title, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`)
        .bind(id, id, 'Paid candidate replay', now, now)),
      ...[[nodeId, storyId], [alternateNodeId, storyId], [otherNodeId, otherStoryId]].map(([id, story]) =>
        runtimeEnv.DB.prepare(`INSERT INTO strytree_nodes
          (id, story_id, creator_user_id, title, synopsis, status, visibility, moderation_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', 'public', 'approved', ?, ?)`)
          .bind(id, story, userId, 'Root', 'A native story root.', now, now)),
    ])
  })

  const createRun = async (payload = body()) => {
    const reply = await submit(payload)
    expect(reply.status, JSON.stringify(reply.body)).toBe(202)
    expect(reply.body).toMatchObject({ ok: true, status: 'completed', max_candidates: 2, quoted_cost_credits: 10 })
    const current = await snapshot()
    expect(current.runs).toHaveLength(1)
    expect(current.runs[0]).toMatchObject({ status: 'completed' })
    expect(JSON.parse(String(current.runs[0].request_json))).toEqual(payload)
    expect(current.candidates).toHaveLength(2)
    expect(current.messages).toEqual([])
    const debits = current.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')
    expect(debits).toHaveLength(1)
    expect(debits[0]).toMatchObject({ amount_credits: -10, balance_after_credits: 10, authority_version: 2 })
    expect(current.financial.balance).toMatchObject({ balance_credits: 10, authority_version: 2 })
    return { reply, current }
  }

  const route = async (path: string, init: RequestInit = {}, overrides: Record<string, unknown> = {}) => readReply(
    await worker.fetch(new Request(`https://payment.test/api/strytree${path}`, init), {
      ...providerEnv(), STRYTREE_GENERATION_QUEUE: queue, ...overrides,
    }),
  )
  const publishBody = () => ({ title: 'A selected continuation', merge_notes: 'Buyer selection' })
  const publish = (candidateId: unknown, overrides: Record<string, unknown> = {},
    payload: Record<string, unknown> = publishBody(), publishKey = 'candidate-publish-request') => route(
    `/candidates/${candidateId}/publish`, {
      method: 'POST', headers: authHeaders(publishKey), body: JSON.stringify(payload),
    }, overrides,
  )
  const publicationState = async () => ({
    candidates: await snapshot(),
    nodes: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_nodes ORDER BY id').all()).results,
    plans: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_candidate_merge_plans ORDER BY id').all()).results,
    stories: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_stories ORDER BY id').all()).results,
  })
  const expectCompleted = async (count = 2) => {
    const current = await snapshot()
    expect(current.runs).toHaveLength(1)
    expect(current.runs[0]).toMatchObject({ status: 'completed', max_candidates: count, quoted_cost_credits: count * 5 })
    expect(current.candidates).toHaveLength(count)
    expect(new Set(current.candidates.map(row => row.id)).size).toBe(count)
    expect(current.messages).toEqual([])
    expect(current.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')).toEqual([
      expect.objectContaining({ amount_credits: -count * 5, balance_after_credits: 20 - count * 5, authority_version: 2 }),
    ])
    expect(current.financial.balance).toMatchObject({ balance_credits: 20 - count * 5, authority_version: 2 })
    expect(current.financial.audit.filter(row => row.action === 'candidate_run')).toHaveLength(1)
    return current
  }

  // Hold two completed native reads of the same absent record. Every SQL statement,
  // constraint, transaction and ledger mutation still executes in the native runtime.
  const concurrentAtAbsentRead = async (
    table: string,
    start: (overrides: Record<string, unknown>) => Array<Promise<Awaited<ReturnType<typeof submit>>>>,
  ) => {
    let release!: () => void, entered!: () => void, arrivals = 0
    const hold = new Promise<void>(resolve => { release = resolve })
    const bothEntered = new Promise<void>(resolve => { entered = resolve })
    const native = runtimeEnv.DB
    const db = { batch: native.batch.bind(native), prepare(sql: string) {
      const statement = native.prepare(sql)
      if (!/^\s*SELECT\b/i.test(sql) || !sql.includes(table) || !/WHERE/i.test(sql)) return statement
      const wrap = (target: D1PreparedStatement): D1PreparedStatement => new Proxy(target, {
        get(value, property) {
          if (property === 'bind') return (...values: unknown[]) => wrap(value.bind(...values))
          if (property === 'all') return async <T,>() => {
            const result = await value.all<T>()
            if (result.results.length === 0 && arrivals < 2) {
              arrivals += 1
              if (arrivals === 2) entered()
              await hold
            }
            return result
          }
          const member = Reflect.get(value, property, value)
          return typeof member === 'function' ? member.bind(value) : member
        },
      })
      return wrap(statement)
    } }
    const jobs = start({ DB: db })
    let timer: ReturnType<typeof setTimeout> | undefined, barrierError: unknown
    try {
      await Promise.race([
        bothEntered,
        Promise.all(jobs).then(() => { throw new Error('requests_finished_before_native_read_barrier') }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('native_read_barrier_not_reached')), 2_000) }),
      ])
    } catch (error) { barrierError = error } finally {
      if (timer !== undefined) clearTimeout(timer)
      release()
    }
    const replies = await Promise.all(jobs)
    if (barrierError) throw barrierError
    return replies
  }

  const withInsertFailure = async (table: string, condition: string, operation: () => Promise<void>) => {
    const trigger = 'candidate_contract_insert_failure'
    await runtimeEnv.DB.prepare(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table}
      ${condition ? `WHEN ${condition}` : ''}
      BEGIN SELECT RAISE(ABORT, 'candidate_contract_native_insert_failure'); END`).run()
    try { await operation() } finally {
      await runtimeEnv.DB.prepare(`DROP TRIGGER IF EXISTS ${trigger}`).run()
    }
  }
  const expectUnavailable = (reply: Awaited<ReturnType<typeof submit>>) => {
    expect(reply.status, JSON.stringify(reply.body)).toBeGreaterThanOrEqual(500)
    expect(reply.status).toBeLessThan(600)
    expect(reply.body.ok).not.toBe(true)
  }

  const loseBatchAcknowledgement = () => {
    let commits = 0
    const native = runtimeEnv.DB
    return { get commits() { return commits }, overrides: { DB: {
      prepare: native.prepare.bind(native),
      async batch(statements: D1PreparedStatement[]) {
        await native.batch(statements)
        commits += 1
        throw new Error('candidate_contract_committed_batch_acknowledgement_lost')
      },
    } } }
  }
  return { storyId, nodeId, otherStoryId, otherNodeId, alternateNodeId, key, body, submit, snapshot,
    createRun, route, publish, publishBody, publicationState, expectCompleted, concurrentAtAbsentRead,
    withInsertFailure, expectUnavailable, loseBatchAcknowledgement }
}
