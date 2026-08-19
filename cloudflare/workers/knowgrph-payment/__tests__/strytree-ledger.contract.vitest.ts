import { reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { D1DatabaseLike } from '../../shared/d1'
import { inspectStrytreeReadiness } from '../strytreeReadiness'

type RuntimeEnv = {
  DB: D1Database
  STRYTREE_CREDIT_LEDGER: DurableObjectNamespace
}

const runtimeEnv = env as unknown as RuntimeEnv
const now = '2026-08-20T00:00:00.000Z'

const SCHEMA = [
  'CREATE TABLE strytree_users (id TEXT PRIMARY KEY)',
  'CREATE TABLE strytree_payment_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)',
  `CREATE TABLE strytree_token_ledger (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL,
    amount_credits INTEGER NOT NULL, balance_after_credits INTEGER NOT NULL,
    related_object_type TEXT, related_object_id TEXT, provider_event_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE, metadata_json TEXT, created_at TEXT NOT NULL,
    semantic_digest TEXT, authority_version INTEGER
  )`,
  `CREATE UNIQUE INDEX idx_strytree_ledger_authority_version
    ON strytree_token_ledger(user_id, authority_version) WHERE authority_version IS NOT NULL`,
  `CREATE UNIQUE INDEX idx_strytree_ledger_effect
    ON strytree_token_ledger(user_id, event_type, related_object_type, related_object_id)`,
  `CREATE UNIQUE INDEX idx_strytree_ledger_provider_event
    ON strytree_token_ledger(provider_event_id) WHERE provider_event_id IS NOT NULL`,
  `CREATE TABLE strytree_provider_effect_claims (
    provider_event_id TEXT PRIMARY KEY, payment_session_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
    semantic_digest TEXT NOT NULL, state TEXT NOT NULL,
    claimed_at TEXT NOT NULL, applied_event_id TEXT
  )`,
] as const

beforeEach(async () => {
  await reset()
  await runtimeEnv.DB.batch(SCHEMA.map((statement) => runtimeEnv.DB.prepare(statement)))
})

const seedUser = async (userId: string, sessionId: string) => {
  await runtimeEnv.DB.batch([
    runtimeEnv.DB.prepare('INSERT INTO strytree_users (id) VALUES (?)').bind(userId),
    runtimeEnv.DB.prepare('INSERT INTO strytree_payment_sessions (id, user_id) VALUES (?, ?)')
      .bind(sessionId, userId),
  ])
}

const stubFor = (userId: string) => runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)

const mutate = async (userId: string, body: Record<string, unknown>) => stubFor(userId).fetch(new Request(
  'https://strytree-credit-ledger.internal/mutations',
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
))

const purchase = (userId: string, sessionId: string, eventId: string, key = eventId) => ({
  id: `ledger-${userId}-${eventId}`,
  user_id: userId,
  event_type: 'purchase_credit',
  amount_credits: 100,
  related_object_type: 'strytree_payment_session',
  related_object_id: sessionId,
  provider_event_id: eventId,
  idempotency_key: key,
  metadata_json: JSON.stringify({ currency: 'USD', amount_total: 999 }),
  created_at: now,
})

const debit = (userId: string, suffix: string, amount = -80) => ({
  id: `debit-${suffix}`,
  user_id: userId,
  event_type: 'generation_debit',
  amount_credits: amount,
  related_object_type: 'strytree_generation_job',
  related_object_id: `job-${suffix}`,
  provider_event_id: null,
  idempotency_key: `debit-key-${suffix}`,
  metadata_json: '{}',
  created_at: now,
})

describe('Strytree authoritative credit ledger', () => {
  it('reports ready only when safe checkout, D1 schema, and actor SQLite are live', async () => {
    const ready = await inspectStrytreeReadiness(
      env as unknown as Record<string, unknown>, runtimeEnv.DB as unknown as D1DatabaseLike, {},
    )
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toMatchObject({
      ok: true,
      dependencies: {
        checkout: 'provider-webhook',
        ledger: 'durable-object-sqlite',
        projection: 'd1-versioned',
      },
    })

    const unsafe = await inspectStrytreeReadiness(
      { ...(env as unknown as Record<string, unknown>), STRYTREE_CHECKOUT_MODE: 'local-development' },
      runtimeEnv.DB as unknown as D1DatabaseLike,
      {},
    )
    expect(unsafe.status).toBe(503)
  })

  it('requires provider proof for production purchase credits', async () => {
    await seedUser('user-proof', 'session-proof')
    const response = await mutate('user-proof', {
      ...purchase('user-proof', 'session-proof', 'event-proof'),
      provider_event_id: null,
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'provider-proof-required' })
  })

  it('persists a canonical digest and rejects same-key semantic drift', async () => {
    await seedUser('user-idempotency', 'session-idempotency')
    const body = purchase('user-idempotency', 'session-idempotency', 'event-idempotency', 'key-owned')
    const first = await mutate('user-idempotency', body)
    expect(first.status).toBe(200)
    const firstBody = await first.json() as Record<string, unknown>
    expect(firstBody.idempotent_replay).toBe(false)
    expect(firstBody.semantic_digest).toMatch(/^[0-9a-f]{64}$/)

    const replay = await mutate('user-idempotency', body)
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toMatchObject({ idempotent_replay: true })

    const drift = await mutate('user-idempotency', { ...body, amount_credits: 101 })
    expect(drift.status).toBe(409)
    await expect(drift.json()).resolves.toMatchObject({ code: 'idempotency-conflict' })
  })

  it('serializes concurrent debits against one versioned authoritative balance', async () => {
    await seedUser('user-race', 'session-race')
    expect((await mutate('user-race', purchase('user-race', 'session-race', 'event-race'))).status).toBe(200)
    const responses = await Promise.all([
      mutate('user-race', debit('user-race', 'a')),
      mutate('user-race', debit('user-race', 'b')),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 402])

    const balance = await stubFor('user-race').fetch(
      new Request('https://strytree-credit-ledger.internal/balance?user_id=user-race'),
    )
    await expect(balance.json()).resolves.toMatchObject({
      balance_credits: 20,
      authority_version: 2,
      authority: 'durable-object-sqlite',
    })
  })

  it('globally fences provider events and payment sessions before either account is credited', async () => {
    await Promise.all([
      seedUser('user-global-a', 'session-global-a'),
      seedUser('user-global-b', 'session-global-b'),
    ])
    const [left, right] = await Promise.all([
      mutate('user-global-a', purchase('user-global-a', 'session-global-a', 'event-global')),
      mutate('user-global-b', purchase('user-global-b', 'session-global-b', 'event-global')),
    ])
    expect([left.status, right.status].sort()).toEqual([200, 409])

    const winner = left.status === 200 ? 'user-global-a' : 'user-global-b'
    const loser = winner === 'user-global-a' ? 'user-global-b' : 'user-global-a'
    const winnerBalance = await stubFor(winner).fetch(
      new Request(`https://strytree-credit-ledger.internal/balance?user_id=${winner}`),
    )
    const loserBalance = await stubFor(loser).fetch(
      new Request(`https://strytree-credit-ledger.internal/balance?user_id=${loser}`),
    )
    await expect(winnerBalance.json()).resolves.toMatchObject({ balance_credits: 100 })
    await expect(loserBalance.json()).resolves.toMatchObject({ balance_credits: 0 })
  })

  it('rejects a second provider effect for an already credited payment session', async () => {
    await seedUser('user-session', 'session-owned')
    expect((await mutate('user-session', purchase('user-session', 'session-owned', 'event-one'))).status).toBe(200)
    const conflict = await mutate('user-session', purchase('user-session', 'session-owned', 'event-two'))
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({ code: 'provider-effect-conflict' })
  })

  it('retries a failed D1 projection without applying the local balance mutation twice', async () => {
    await seedUser('user-projection', 'session-projection')
    expect((await mutate(
      'user-projection', purchase('user-projection', 'session-projection', 'event-projection'),
    )).status).toBe(200)
    const actor = stubFor('user-projection')
    await runtimeEnv.DB.prepare('ALTER TABLE strytree_token_ledger RENAME TO strytree_token_ledger_offline').run()
    const body = debit('user-projection', 'projection', -10)
    const unavailable = await mutate('user-projection', body)
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toMatchObject({ code: 'ledger-authority-unavailable' })

    await runtimeEnv.DB.prepare('ALTER TABLE strytree_token_ledger_offline RENAME TO strytree_token_ledger').run()
    const retried = await mutate('user-projection', body)
    expect(retried.status).toBe(200)
    await expect(retried.json()).resolves.toMatchObject({
      idempotent_replay: true,
      balance_after_credits: 90,
      authority_version: 2,
    })
    const balance = await actor.fetch(
      new Request('https://strytree-credit-ledger.internal/balance?user_id=user-projection'),
    )
    await expect(balance.json()).resolves.toMatchObject({ balance_credits: 90, authority_version: 2 })
  })

  it('fails closed when legacy D1 balance history cannot be reconciled', async () => {
    await seedUser('user-legacy', 'session-legacy')
    await runtimeEnv.DB.prepare(`
      INSERT INTO strytree_token_ledger (
        id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        metadata_json, created_at, semantic_digest, authority_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, '{}', ?, NULL, NULL)
    `).bind(
      'legacy-event', 'user-legacy', 'refund_credit', 50, 49,
      'strytree_generation_job', 'legacy-job', 'legacy-key', now,
    ).run()
    const response = await stubFor('user-legacy').fetch(
      new Request('https://strytree-credit-ledger.internal/balance?user_id=user-legacy'),
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'legacy-ledger-reconciliation-required' })
  })

  it('bootstraps and backfills a semantically valid legacy provider effect idempotently', async () => {
    await seedUser('user-bootstrap', 'session-bootstrap')
    const body = purchase('user-bootstrap', 'session-bootstrap', 'event-bootstrap', 'key-bootstrap')
    await runtimeEnv.DB.prepare(`
      INSERT INTO strytree_token_ledger (
        id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        metadata_json, created_at, semantic_digest, authority_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).bind(
      body.id, body.user_id, body.event_type, body.amount_credits, body.amount_credits,
      body.related_object_type, body.related_object_id, body.provider_event_id,
      body.idempotency_key, body.metadata_json, body.created_at,
    ).run()
    const response = await mutate('user-bootstrap', body)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      idempotent_replay: true,
      balance_after_credits: 100,
      authority_version: 1,
    })
    const row = await runtimeEnv.DB.prepare(`
      SELECT semantic_digest, authority_version FROM strytree_token_ledger WHERE id = ?
    `).bind(body.id).first<{ semantic_digest: string; authority_version: number }>()
    expect(row?.semantic_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.authority_version).toBe(1)
  })
})
