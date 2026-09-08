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

type UnlockReplay = {
  ok: boolean
  found: boolean
  scoped_key: string
  code?: string
  event?: Record<string, unknown> & { metadata_json: string }
}

const replayUnlock = async (owner: string, nodeId: string, key: string, userId = owner) => {
  const response = await stubFor(owner).fetch(new Request('https://strytree-credit-ledger.internal/unlock-replay', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: userId, node_id: nodeId, idempotency_key: key }),
  }))
  return { status: response.status, body: await response.json() as UnlockReplay }
}

const fundUnlockBuyer = async (userId: string) => {
  await seedUser(userId, `session-${userId}`)
  expect((await mutate(userId, purchase(userId, `session-${userId}`, `event-${userId}`))).status).toBe(200)
}

const accountState = async (userId: string) => {
  const response = await stubFor(userId).fetch(new Request(
    `https://strytree-credit-ledger.internal/balance?user_id=${encodeURIComponent(userId)}`,
  ))
  expect(response.status).toBe(200)
  return response.json() as Promise<Record<string, unknown>>
}

const unlockMutation = (userId: string, nodeId: string, key: string, clientKey?: string) => ({
  id: `unlock-${userId}-${nodeId}`, user_id: userId, event_type: 'unlock_debit', amount_credits: -80,
  related_object_type: 'strytree_node', related_object_id: nodeId, provider_event_id: null,
  idempotency_key: key, created_at: now,
  metadata_json: JSON.stringify({ creator_user_id: 'original-creator', creator_credit_credits: 64,
    platform_fee_credits: 16, ...(clientKey === undefined ? {} : { unlock_client_key: clientKey }) }),
})

const scopedUnlockMutation = async (userId: string, nodeId: string, clientKey: string) => {
  const pending = await replayUnlock(userId, nodeId, clientKey)
  expect(pending.status, JSON.stringify(pending.body)).toBe(200)
  expect(pending.body).toMatchObject({ ok: true, found: false })
  expect(pending.body.scoped_key).toMatch(/^strytree-unlock-v1:[0-9a-f]{64}$/)
  return unlockMutation(userId, nodeId, pending.body.scoped_key, clientKey)
}

const unlockRows = async (userId: string) => (await runtimeEnv.DB.prepare(
  "SELECT * FROM strytree_token_ledger WHERE user_id = ? AND event_type = 'unlock_debit' ORDER BY id",
).bind(userId).all<Record<string, unknown>>()).results

describe('Strytree authoritative unlock recovery', () => {
  it('recovers the frozen unlock after a real D1 projection failure without another debit', async () => {
    const userId = 'unlock-projection', nodeId = 'paid-node', clientKey = 'original-request'
    await fundUnlockBuyer(userId)
    const body = await scopedUnlockMutation(userId, nodeId, clientKey)
    await runtimeEnv.DB.prepare(`CREATE TRIGGER reject_unlock_projection
      BEFORE INSERT ON strytree_token_ledger WHEN NEW.event_type = 'unlock_debit'
      BEGIN SELECT RAISE(ABORT, 'blocked_unlock_projection'); END`).run()
    try {
      const failed = await mutate(userId, body)
      expect(failed.status).toBe(503)
      expect(await unlockRows(userId)).toEqual([])
      expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
    } finally {
      await runtimeEnv.DB.prepare('DROP TRIGGER reject_unlock_projection').run()
    }
    const changedTerms = await mutate(userId, { ...body, amount_credits: -90,
      metadata_json: JSON.stringify({ unlock_client_key: clientKey, creator_user_id: 'later-creator',
        creator_credit_credits: 72, platform_fee_credits: 18 }) })
    expect(changedTerms.status).toBe(409)
    const recovered = await replayUnlock(userId, nodeId, clientKey)
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200)
    expect(recovered.body).toMatchObject({ ok: true, found: true, scoped_key: body.idempotency_key,
      event: { id: body.id, user_id: userId, event_type: 'unlock_debit', amount_credits: -80,
        balance_after_credits: 20, related_object_type: 'strytree_node', related_object_id: nodeId,
        idempotency_key: body.idempotency_key, created_at: now, authority_version: 2 } })
    expect(JSON.parse(recovered.body.event?.metadata_json || '')).toEqual(JSON.parse(body.metadata_json))
    expect(recovered.body.event?.semantic_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(await unlockRows(userId)).toHaveLength(1)
    expect((await replayUnlock(userId, nodeId, clientKey)).body).toEqual(recovered.body)
    expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
  })

  it('converges concurrent identical unlock mutations and replay reads on one event', async () => {
    const userId = 'unlock-concurrent', nodeId = 'concurrent-node', key = 'concurrent-key'
    await fundUnlockBuyer(userId)
    const body = await scopedUnlockMutation(userId, nodeId, key)
    const mutations = await Promise.all([mutate(userId, body), mutate(userId, body)])
    expect(mutations.map(response => response.status)).toEqual([200, 200])
    const replies = await Promise.all([replayUnlock(userId, nodeId, key), replayUnlock(userId, nodeId, key)])
    expect(replies.map(reply => reply.status)).toEqual([200, 200])
    expect(replies[0].body).toEqual(replies[1].body)
    expect(replies[0].body).toMatchObject({ found: true, event: { id: body.id, authority_version: 2 } })
    expect(await unlockRows(userId)).toHaveLength(1)
    expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
  })

  it('binds an unlock replay to its actor, node and original client key', async () => {
    const userId = 'unlock-identity', nodeId = 'owned-node', key = 'owned-key'
    await fundUnlockBuyer(userId)
    const body = await scopedUnlockMutation(userId, nodeId, key)
    expect((await mutate(userId, body)).status).toBe(200)
    const before = await unlockRows(userId)
    expect((await replayUnlock(userId, 'other-node', key)).status).toBe(409)
    expect((await replayUnlock(userId, nodeId, key, 'other-buyer')).status).toBe(409)
    expect((await replayUnlock(userId, nodeId, body.idempotency_key)).status).toBe(409)
    const wrongKey = await replayUnlock(userId, nodeId, 'unrelated-key')
    expect(wrongKey.status).toBe(200)
    expect(wrongKey.body).toMatchObject({ found: false })
    expect(wrongKey.body.event).toBeUndefined()
    expect(await unlockRows(userId)).toEqual(before)
    expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
  })

  it('recovers a legacy raw-key unlock while rejecting a non-unlock event at the requested key', async () => {
    const userId = 'unlock-legacy', nodeId = 'legacy-node', key = 'legacy-raw-key'
    await fundUnlockBuyer(userId)
    const body = unlockMutation(userId, nodeId, key)
    expect((await mutate(userId, body)).status).toBe(200)
    const replay = await replayUnlock(userId, nodeId, key)
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ found: true, event: { id: body.id, idempotency_key: key } })
    expect(JSON.parse(replay.body.event?.metadata_json || '')).toEqual(JSON.parse(body.metadata_json))
    const other = 'unlock-wrong-type'
    await fundUnlockBuyer(other)
    const generation = debit(other, 'existing-generation')
    expect((await mutate(other, generation)).status).toBe(200)
    const wrongType = await replayUnlock(other, nodeId, generation.idempotency_key)
    expect(wrongType.status).toBe(409)
    expect(wrongType.body.code).toBe('idempotency-conflict')
    expect(await unlockRows(other)).toEqual([])
    expect(await accountState(other)).toMatchObject({ balance_credits: 20, authority_version: 2 })
  })

  it.each([
    { name: 'amount', column: 'amount_credits', value: -1 },
    { name: 'creator allocation', column: 'metadata_json', value: JSON.stringify({
      creator_user_id: 'corrupted-creator', creator_credit_credits: 79, platform_fee_credits: 1,
    }) },
  ])('fails closed on corrupted D1 $name even with the original digest and version', async ({ column, value }) => {
    const userId = 'unlock-corrupt', nodeId = 'corrupt-node', key = 'corrupt-key'
    await fundUnlockBuyer(userId)
    const body = await scopedUnlockMutation(userId, nodeId, key)
    expect((await mutate(userId, body)).status).toBe(200)
    await runtimeEnv.DB.prepare(`UPDATE strytree_token_ledger SET ${column} = ? WHERE id = ?`)
      .bind(value, body.id).run()
    const corrupted = await unlockRows(userId)
    const replay = await replayUnlock(userId, nodeId, key)
    expect(replay.status).toBe(503)
    expect(replay.body.code).toBe('ledger-projection-unavailable')
    expect(await unlockRows(userId)).toEqual(corrupted)
    expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
  })

  it('rejects misuse of the reserved scoped-key namespace before a financial mutation', async () => {
    const userId = 'unlock-namespace', nodeId = 'namespace-node', key = 'namespace-key'
    await fundUnlockBuyer(userId)
    const body = await scopedUnlockMutation(userId, nodeId, key)
    for (const invalid of [
      { ...body, metadata_json: '{}' },
      { ...body, metadata_json: JSON.stringify({ ...JSON.parse(body.metadata_json), unlock_client_key: 'other-key' }) },
      { ...body, idempotency_key: 'strytree-unlock-v1:not-a-digest' },
      { ...body, event_type: 'generation_debit', related_object_type: 'strytree_generation_job' },
    ]) {
      const response = await mutate(userId, invalid)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({ code: 'unlock-key-conflict' })
    }
    expect(await unlockRows(userId)).toEqual([])
    expect(await accountState(userId)).toMatchObject({ balance_credits: 100, authority_version: 1 })
  })

  it('isolates the same client key across buyers and rejects another buyer scoped key before debit', async () => {
    const left = 'unlock-buyer-a', right = 'unlock-buyer-b', nodeId = 'shared-node', key = 'shared-client-key'
    await Promise.all([fundUnlockBuyer(left), fundUnlockBuyer(right)])
    const [a, b] = await Promise.all([scopedUnlockMutation(left, nodeId, key), scopedUnlockMutation(right, nodeId, key)])
    expect(a.idempotency_key).not.toBe(b.idempotency_key)
    const stolen = await mutate(right, { ...b, idempotency_key: a.idempotency_key })
    expect(stolen.status).toBe(409)
    expect(await accountState(right)).toMatchObject({ balance_credits: 100, authority_version: 1 })
    const valid = await Promise.all([mutate(left, a), mutate(right, b)])
    expect(valid.map(response => response.status)).toEqual([200, 200])
    for (const userId of [left, right]) {
      expect(await unlockRows(userId)).toHaveLength(1)
      expect(await accountState(userId)).toMatchObject({ balance_credits: 20, authority_version: 2 })
    }
  })

  it('rejects a scoped key occupied by another D1 buyer before charging its rightful actor', async () => {
    const left = 'unlock-occupied-a', right = 'unlock-occupied-b', nodeId = 'occupied-node', key = 'occupied-key'
    await Promise.all([fundUnlockBuyer(left), fundUnlockBuyer(right)])
    const [a, b] = await Promise.all([scopedUnlockMutation(left, nodeId, key), scopedUnlockMutation(right, nodeId, key)])
    expect((await mutate(left, a)).status).toBe(200)
    await runtimeEnv.DB.prepare('UPDATE strytree_token_ledger SET idempotency_key = ? WHERE id = ?')
      .bind(b.idempotency_key, a.id).run()
    const before = await unlockRows(left)
    const blocked = await mutate(right, b)
    expect(blocked.status).toBe(409)
    await expect(blocked.json()).resolves.toMatchObject({ code: 'unlock-key-conflict' })
    expect(await unlockRows(left)).toEqual(before)
    expect(await unlockRows(right)).toEqual([])
    expect(await accountState(right)).toMatchObject({ balance_credits: 100, authority_version: 1 })
  })

  it('bounds replay payloads and requires valid request identity without creating an unlock', async () => {
    const userId = 'unlock-input-bound'
    await fundUnlockBuyer(userId)
    for (const body of [
      { user_id: userId, node_id: '', idempotency_key: 'key' },
      { user_id: userId, node_id: 'node', idempotency_key: 'k'.repeat(513) },
      { user_id: userId, node_id: 'node', idempotency_key: 'key', ignored: 'x'.repeat(32 * 1024) },
    ]) {
      const response = await stubFor(userId).fetch(new Request('https://strytree-credit-ledger.internal/unlock-replay', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      expect(response.status).toBe(400)
    }
    expect(await unlockRows(userId)).toEqual([])
    expect(await accountState(userId)).toMatchObject({ balance_credits: 100, authority_version: 1 })
  })
})
