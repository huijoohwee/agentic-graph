import { abortAllDurableObjects } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../index'
import {
  runtimeEnv, request, authHeaders, createCheckout, eventFor, signature, sendRaw,
  sendEvent, state, expectRejected, userId, installStrytreeNativeFixture, providerEnv, readReply, type ProviderEvent,
} from './helpers/strytree-native-fixture'

installStrytreeNativeFixture()

describe('Strytree native checkout provider fulfillment', () => {
  it('keeps production local checkout disabled before any payment state is written', async () => {
    const before = await state()
    for (const [path, code] of [
      ['/checkout/sessions', 'local_checkout_disabled'],
      ['/checkout/sessions/nonexistent/complete', 'local_checkout_completion_disabled'],
    ]) {
      const reply = await request(path, {
        method: 'POST', headers: authHeaders('production-must-not-credit'), body: '{"package_id":"credits_20"}',
      })
      expect(reply.status).toBe(403)
      expect(reply.body.code).toBe(code)
      expect(await state()).toEqual(before)
    }
  })

  it('credits one paid checkout and replays both signature aliases across an actor restart', async () => {
    const checkout = await createCheckout()
    const pending = await state()
    expect(pending.sessions).toHaveLength(1)
    expect(pending.ledger).toEqual([])
    expect(pending.claims).toEqual([])
    expect(pending.balance).toMatchObject({ balance_credits: 0, authority_version: 0 })
    expect(pending.wallet).toMatchObject({ wallet_status: 'pending_payment', balance_credits: 0,
      pending_payment: true, pending_credit_amount: 20 })
    const createReplay = await request('/checkout/sessions', {
      method: 'POST', headers: authHeaders('checkout-contract-create'), body: '{"package_id":"credits_20"}',
    }, true)
    expect(createReplay.status).toBe(200)
    expect(createReplay.body).toMatchObject({ ...checkout, idempotent_replay: true })
    expect(await state()).toEqual(pending)

    const event = eventFor(checkout)
    const payload = JSON.stringify(event)
    const signed = await signature(payload)
    const [accepted, duplicate] = await Promise.all([
      sendRaw(payload, 'strytree-signature', signed),
      sendRaw(payload, 'stripe-signature', signed),
    ])
    for (const reply of [accepted, duplicate]) {
      expect(reply.status, JSON.stringify(reply.body)).toBe(200)
      expect(reply.body).toMatchObject({ provider_event_id: event.id, payment_session_id: checkout.payment_session_id,
        status: 'completed', balance_after_credits: 20 })
    }
    expect(duplicate.body.ledger_event_id).toBe(accepted.body.ledger_event_id)
    expect([accepted.body.idempotent_replay, duplicate.body.idempotent_replay].sort()).toEqual([false, true])
    expect(typeof accepted.body.ledger_event_id).toBe('string')
    const committed = await state()
    expect(committed.ledger).toHaveLength(1)
    expect(committed.ledger[0]).toMatchObject({ id: accepted.body.ledger_event_id, user_id: userId,
      event_type: 'purchase_credit', amount_credits: 20, balance_after_credits: 20,
      related_object_id: checkout.payment_session_id, provider_event_id: event.id, authority_version: 1 })
    expect(committed.claims).toHaveLength(1)
    expect(committed.claims[0]).toMatchObject({ provider_event_id: event.id,
      payment_session_id: checkout.payment_session_id, state: 'applied', applied_event_id: accepted.body.ledger_event_id })
    expect(committed.sessions[0]).toMatchObject({ id: checkout.payment_session_id, status: 'completed' })
    expect(committed.balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
    expect(committed.wallet).toMatchObject({ wallet_status: 'settled', balance_credits: 20,
      pending_payment: false, pending_credit_amount: 0, pending_payment_sessions: [] })

    await abortAllDurableObjects()
    const replay = await sendEvent(event, 'stripe-signature')
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ ledger_event_id: accepted.body.ledger_event_id,
      balance_after_credits: 20, idempotent_replay: true })
    expect(await state()).toEqual(committed)
  })

  it('accepts a paid asynchronous-success event through the same settlement owner', async () => {
    const event = eventFor(await createCheckout())
    event.type = 'checkout.session.async_payment_succeeded'
    Object.assign(event, { event_id: event.id, event_type: event.type, object: 'event' })
    const reply = await sendEvent(event, 'stripe-signature')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const after = await state()
    expect(after.ledger).toHaveLength(1)
    expect(after.claims).toHaveLength(1)
    expect(after.balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
  })

  it.each(['invalid', 'expired'])('rejects an %s signature without financial mutation', async kind => {
    const payload = JSON.stringify(eventFor(await createCheckout()))
    const before = await state()
    const stamp = Math.floor(Date.now() / 1000)
    const header = kind === 'invalid' ? `t=${stamp},v1=${'0'.repeat(64)}` : await signature(payload, stamp - 600)
    const reply = await sendRaw(payload, 'strytree-signature', header)
    expect(reply.status).toBe(400)
    expect(reply.body.code).toBe('invalid_checkout_webhook_signature')
    expect(await state()).toEqual(before)
  })

  it.each(['unpaid', 'missing-status', 'unknown-type', 'failed-type'])(
    'does not credit signed %s events even when status is complete', async kind => {
      const event = eventFor(await createCheckout())
      event.data.object.status = 'complete'
      if (kind === 'unpaid') event.data.object.payment_status = 'unpaid'
      if (kind === 'missing-status') delete event.data.object.payment_status
      if (kind === 'unknown-type') event.type = 'checkout.session.unrecognized'
      if (kind === 'failed-type') event.type = 'checkout.session.async_payment_failed'
      const before = await state()
      const reply = await sendEvent(event)
      expect(reply.status, JSON.stringify(reply.body)).toBeLessThan(500)
      expect(reply.body.status).not.toBe('completed')
      expect(reply.body.ledger_event_id).toBeUndefined()
      expect(await state()).toEqual(before)
    },
  )

  const invalidFields: Array<[string, (event: ProviderEvent) => void]> = [
    ['missing amount', event => { delete event.data.object.amount_total }],
    ['wrong amount', event => { event.data.object.amount_total = 499 }],
    ['non-numeric amount', event => { event.data.object.amount_total = '500' }],
    ['fractional amount', event => { event.data.object.amount_total = 500.5 }],
    ['missing currency', event => { delete event.data.object.currency }],
    ['wrong currency', event => { event.data.object.currency = 'eur' }],
    ['missing package', event => { delete event.data.object.metadata.package_id }],
    ['wrong package', event => { event.data.object.metadata.package_id = 'credits_50' }],
    ['missing user', event => { delete event.data.object.metadata.user_id }],
    ['wrong user', event => { event.data.object.metadata.user_id = 'another-buyer' }],
    ['missing provider session', event => { delete event.data.object.id }],
    ['wrong provider session', event => { event.data.object.id = 'another-provider-session' }],
  ]
  it.each(invalidFields)('rejects signed %s without changing pending payment state', async (_name, alter) => {
    const event = eventFor(await createCheckout())
    alter(event)
    const before = await state()
    expectRejected(await sendEvent(event))
    expect(await state()).toEqual(before)
  })

  it.each(['invalid-json', 'array-root', 'null-object', 'missing-event-id', 'missing-event-type'])(
    'rejects signed malformed %s without financial mutation', async kind => {
      const event = eventFor(await createCheckout())
      const before = await state()
      let payload: string
      if (kind === 'invalid-json') payload = '{'
      else if (kind === 'array-root') payload = '[]'
      else if (kind === 'null-object') payload = JSON.stringify({ id: event.id, type: event.type, data: { object: null } })
      else {
        if (kind === 'missing-event-id') delete event.id
        else delete event.type
        payload = JSON.stringify(event)
      }
      expectRejected(await sendRaw(payload))
      expect(await state()).toEqual(before)
    },
  )

  it('rejects a different provider event for an already completed checkout without semantic drift', async () => {
    const event = eventFor(await createCheckout())
    const accepted = await sendEvent(event)
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    const committed = await state()
    event.id = 'evt-checkout-contract-different-effect'
    const conflicting = await sendEvent(event)
    expect(conflicting.status, JSON.stringify(conflicting.body)).toBe(409)
    expect(await state()).toEqual(committed)
  })

  it.each(invalidFields)('revalidates same-event %s after settlement', async (_name, alter) => {
    const event = eventFor(await createCheckout())
    const accepted = await sendEvent(event)
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    const committed = await state()
    alter(event)
    expectRejected(await sendEvent(event))
    expect(await state()).toEqual(committed)
  })

  it('accepts a single alternate event identity and payload envelope', async () => {
    const event = eventFor(await createCheckout())
    const reply = await sendRaw(JSON.stringify({
      event_id: event.id, event_type: event.type, object: event.data.object,
    }))
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect((await state()).balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
  })

  it.each(['id', 'type', 'malformed-id', 'malformed-type', 'payload'])(
    'rejects ambiguous or malformed event %s aliases before any credit', async field => {
      const event = eventFor(await createCheckout())
      if (field === 'id') Object.assign(event, { event_id: 'a-different-provider-event' })
      if (field === 'type') Object.assign(event, { event_type: 'checkout.session.async_payment_failed' })
      if (field === 'malformed-id') Object.assign(event, { event_id: event.id, id: 0 })
      if (field === 'malformed-type') Object.assign(event, { event_type: event.type, type: 0 })
      if (field === 'payload') Object.assign(event, { object: { ...event.data.object, amount_total: 1 } })
      const before = await state()
      expectRejected(await sendEvent(event))
      expect(await state()).toEqual(before)
    },
  )

  it('repairs an interrupted settlement audit before marking checkout completed', async () => {
    const checkout = await createCheckout()
    const event = eventFor(checkout)
    await runtimeEnv.DB.prepare('ALTER TABLE strytree_audit_events RENAME TO strytree_audit_events_unavailable').run()
    try {
      const interrupted = await sendEvent(event)
      expect(interrupted.status).toBe(500)
    } finally {
      await runtimeEnv.DB.prepare('ALTER TABLE strytree_audit_events_unavailable RENAME TO strytree_audit_events').run()
    }
    const interrupted = await state()
    expect(interrupted.sessions[0]).toMatchObject({ status: 'open' })
    expect(interrupted.balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
    expect(interrupted.ledger).toHaveLength(1)
    expect(interrupted.audit.filter(row => row.action === 'checkout_session_settle')).toEqual([])
    const retry = await sendEvent(event)
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(retry.body).toMatchObject({ idempotent_replay: true, balance_after_credits: 20 })
    const repaired = await state()
    expect(repaired.sessions[0]).toMatchObject({ status: 'completed' })
    expect(repaired.balance).toMatchObject({ balance_credits: 20, authority_version: 1 })
    expect(repaired.ledger).toHaveLength(1)
    expect(repaired.claims).toHaveLength(1)
    expect(repaired.audit.filter(row => row.action === 'checkout_session_settle')).toHaveLength(1)
    expect(repaired.wallet).toMatchObject({ pending_payment: false, balance_credits: 20 })
  })
})

describe('Strytree native paid unlock completion', () => {
  const storyId = 'unlock-contract-story', nodeId = 'unlock-contract-node'
  const key = 'unlock-contract-request', creatorId = 'unlock-contract-creator'
  const unlock = async (overrides: Record<string, unknown> = {}, requestKey = key, headers = authHeaders(requestKey)) => readReply(
    await worker.fetch(new Request(`https://payment.test/api/strytree/nodes/${nodeId}/unlock`, {
      method: 'POST', headers, body: '{}',
    }), { ...providerEnv(), ...overrides }),
  )
  const seed = async (funded = true) => {
    if (funded) {
      const paid = await sendEvent(eventFor(await createCheckout()))
      expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    }
    const now = new Date().toISOString()
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`INSERT INTO strytree_users
        (id, display_name, role, created_at, updated_at) VALUES (?, 'Native unlock creator', 'creator', ?, ?)`)
        .bind(creatorId, now, now),
      runtimeEnv.DB.prepare(`INSERT INTO strytree_stories
        (id, slug, title, status, root_node_id, created_at, updated_at)
        VALUES (?, ?, 'Paid unlock completion', 'active', ?, ?, ?)`)
        .bind(storyId, storyId, nodeId, now, now),
      runtimeEnv.DB.prepare(`INSERT INTO strytree_nodes
        (id, story_id, creator_user_id, title, synopsis, status, visibility, is_free_window,
         unlock_price_credits, video_object_key, moderation_status, created_at, updated_at)
        VALUES (?, ?, ?, 'Protected branch', 'Costs exactly the purchased balance.', 'active', 'public', 0,
          20, 'r2://unlock-contract/paid-branch.mp4', 'approved', ?, ?)`)
        .bind(nodeId, storyId, creatorId, now, now),
    ])
  }
  const snapshot = async () => ({
    financial: await state(),
    unlocks: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_unlocks ORDER BY id').all()).results,
    node: (await runtimeEnv.DB.prepare('SELECT * FROM strytree_nodes WHERE id = ?').bind(nodeId).all()).results[0],
    nodes: (await request(`/stories/${storyId}/tree`, { headers: authHeaders() })).body.nodes,
  })
  const expectPending = async () => {
    const current = await snapshot()
    expect(current.financial.balance).toMatchObject({ balance_credits: 0, authority_version: 2 })
    expect(current.financial.ledger.filter(row => row.event_type === 'unlock_debit')).toHaveLength(1)
    expect(current.unlocks).toEqual([])
    expect(current.node.paid_unlocks_count).toBe(0)
    expect(current.financial.audit.filter(row => row.action === 'unlock')).toEqual([])
    expect(current.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: nodeId, entitlement_hint: 'locked', video_object_key: null }),
    ]))
    return current
  }
  const expectComplete = async (ledgerId: unknown) => {
    const current = await snapshot()
    const debit = current.financial.ledger.find(row => row.id === ledgerId)
    expect(typeof debit?.idempotency_key).toBe('string')
    expect(debit?.idempotency_key).not.toBe(key)
    const storedKey = debit?.idempotency_key
    expect(current.financial.balance).toMatchObject({ balance_credits: 0, authority_version: 2 })
    expect(current.financial.ledger.filter(row => row.event_type === 'unlock_debit')).toEqual([
      expect.objectContaining({ id: ledgerId, user_id: userId, related_object_id: nodeId,
        amount_credits: -20, balance_after_credits: 0, authority_version: 2 }),
    ])
    expect(current.unlocks).toEqual([expect.objectContaining({ user_id: userId, node_id: nodeId,
      ledger_event_id: ledgerId, idempotency_key: storedKey })])
    expect(current.node.paid_unlocks_count).toBe(1)
    const audits = current.financial.audit.filter(row => row.action === 'unlock')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ actor_user_id: userId, object_type: 'strytree_node',
      object_id: nodeId, status: 'succeeded', idempotency_key: storedKey })
    expect(JSON.parse(String(audits[0].metadata_json))).toEqual({ ledger_event_id: ledgerId, price_credits: 20 })
    expect(current.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: nodeId, entitlement_hint: 'full', video_object_key: 'r2://unlock-contract/paid-branch.mp4' }),
    ]))
    return current
  }

  it.each([
    ['entitlement', 'BEFORE INSERT ON strytree_unlocks'],
    ['counter', 'BEFORE UPDATE OF paid_unlocks_count ON strytree_nodes'],
    ['audit', "BEFORE INSERT ON strytree_audit_events WHEN NEW.action = 'unlock'"],
  ])('recovers the same key at zero balance after native %s failure', async (_name, trigger) => {
    await seed()
    await runtimeEnv.DB.prepare(`CREATE TRIGGER unlock_contract_abort ${trigger}
      BEGIN SELECT RAISE(ABORT, 'native unlock completion fault'); END`).run()
    try {
      const failed = await unlock()
      expect(failed.status, JSON.stringify(failed.body)).toBe(503)
      expect(failed.body.code).toBe('unlock_completion_unavailable')
      await expectPending()
    } finally { await runtimeEnv.DB.prepare('DROP TRIGGER unlock_contract_abort').run() }
    await abortAllDurableObjects()
    const retry = await unlock()
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(retry.body).toMatchObject({ entitlement: 'full', creator_credit_credits: 16,
      platform_fee_credits: 4, balance_after_credits: 0 })
    const complete = await expectComplete(retry.body.ledger_event_id)
    const replay = await unlock()
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ ledger_event_id: retry.body.ledger_event_id, already_unlocked: true })
    expect(await expectComplete(replay.body.ledger_event_id)).toEqual(complete)
  })

  it('rejects a missing transactional binding before debit', async () => {
    await seed()
    const before = await snapshot()
    const reply = await unlock({ DB: { prepare: runtimeEnv.DB.prepare.bind(runtimeEnv.DB) } })
    expect(reply.status, JSON.stringify(reply.body)).toBe(503)
    expect(await snapshot()).toEqual(before)
  })

  it('lets the authoritative ledger reject insufficient funds without delivery effects', async () => {
    await seed(false)
    const before = await snapshot()
    const reply = await unlock()
    expect(reply.status, JSON.stringify(reply.body)).toBe(402)
    expect(reply.body).toMatchObject({ code: 'insufficient_balance', required_credits: 20 })
    expect(await snapshot()).toEqual(before)
  })

  it('coalesces concurrent same-key requests into one debit and one complete delivery', async () => {
    await seed()
    const native = runtimeEnv.DB
    let release!: () => void, arrivals = 0
    const hold = new Promise<void>(resolve => { release = resolve })
    const db = { batch: native.batch.bind(native), prepare(sql: string) {
      const statement = native.prepare(sql)
      if (!sql.includes('SELECT ledger_event_id FROM strytree_unlocks')) return statement
      const wrap = (target: D1PreparedStatement): D1PreparedStatement => new Proxy(target, {
        get(value, property) {
          if (property === 'bind') return (...values: unknown[]) => wrap(value.bind(...values))
          if (property === 'all') return async <T,>() => {
            const result = await value.all<T>()
            if (result.results.length === 0) {
              arrivals += 1
              if (arrivals === 2) release()
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
    let timer: ReturnType<typeof setTimeout> | undefined
    const jobs = [unlock({ DB: db }), unlock({ DB: db })]
    let replies: Awaited<ReturnType<typeof unlock>>[]
    try {
      replies = await Promise.race([Promise.all(jobs), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { release(); reject(new Error('native unlock read barrier timed out')) }, 2_000)
      })])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      release()
      await Promise.allSettled(jobs)
    }
    expect(arrivals).toBe(2)
    expect(replies.map(reply => reply.status)).toEqual([200, 200])
    expect(replies[0].body.ledger_event_id).toBe(replies[1].body.ledger_event_id)
    await expectComplete(replies[0].body.ledger_event_id)
  })

  it('recovers a lost native batch acknowledgement from the exact committed effect', async () => {
    await seed()
    let committed = 0
    const native = runtimeEnv.DB
    const reply = await unlock({ DB: {
      prepare: native.prepare.bind(native),
      async batch(statements: D1PreparedStatement[]) {
        await native.batch(statements)
        committed += 1
        throw new Error('native unlock batch acknowledgement lost')
      },
    } })
    expect(committed).toBe(1)
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const completed = await expectComplete(reply.body.ledger_event_id)
    expect((await unlock()).status).toBe(200)
    expect(await expectComplete(reply.body.ledger_event_id)).toEqual(completed)
  })

  it.each([null, 'null', '[]', '{'])('rejects incomplete delivery proof %s without changing state', async metadata => {
    await seed()
    const accepted = await unlock()
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    if (metadata === null) {
      await runtimeEnv.DB.prepare("DELETE FROM strytree_audit_events WHERE action = 'unlock'").run()
    } else {
      await runtimeEnv.DB.prepare("UPDATE strytree_audit_events SET metadata_json = ? WHERE action = 'unlock'")
        .bind(metadata).run()
    }
    const before = await snapshot()
    const retry = await unlock()
    expect(retry.status, JSON.stringify(retry.body)).toBe(503)
    expect(await snapshot()).toEqual(before)
  })

  it.each(['higher-price', 'free-window'])('recovers the original paid terms after %s and creator changes', async change => {
    await seed()
    await runtimeEnv.DB.prepare(`CREATE TRIGGER unlock_contract_abort BEFORE INSERT ON strytree_unlocks
      BEGIN SELECT RAISE(ABORT, 'native unlock delivery interruption'); END`).run()
    try { expect((await unlock()).status).toBe(503) }
    finally { await runtimeEnv.DB.prepare('DROP TRIGGER unlock_contract_abort').run() }
    const pending = await expectPending()
    const debit = pending.financial.ledger.find(row => row.event_type === 'unlock_debit')!
    expect(JSON.parse(String(debit.metadata_json))).toEqual({ creator_user_id: creatorId,
      creator_credit_credits: 16, platform_fee_credits: 4, unlock_client_key: key })
    await runtimeEnv.DB.prepare(`UPDATE strytree_nodes SET creator_user_id = ?, unlock_price_credits = ?,
      is_free_window = ? WHERE id = ?`).bind(userId, change === 'free-window' ? 0 : 35,
      change === 'free-window' ? 1 : 0, nodeId).run()
    await abortAllDurableObjects()
    const retry = await unlock()
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(retry.body).toMatchObject({ ledger_event_id: debit.id, entitlement: 'full',
      creator_credit_credits: 16, platform_fee_credits: 4, balance_after_credits: 0 })
    const completed = await expectComplete(debit.id)
    expect(completed.financial.ledger.find(row => row.id === debit.id)).toEqual(debit)
  })

  it('recovers the authoritative debit when its D1 projection was interrupted', async () => {
    await seed()
    await runtimeEnv.DB.prepare(`CREATE TRIGGER unlock_projection_abort BEFORE INSERT ON strytree_token_ledger
      WHEN NEW.event_type = 'unlock_debit' BEGIN SELECT RAISE(ABORT, 'native projection interruption'); END`).run()
    try { expect((await unlock()).status).toBe(503) }
    finally { await runtimeEnv.DB.prepare('DROP TRIGGER unlock_projection_abort').run() }
    const pending = await snapshot()
    expect(pending.financial.balance).toMatchObject({ balance_credits: 0, authority_version: 2 })
    expect(pending.financial.ledger.filter(row => row.event_type === 'unlock_debit')).toEqual([])
    expect(pending.unlocks).toEqual([])
    await runtimeEnv.DB.prepare('UPDATE strytree_nodes SET unlock_price_credits = 35, creator_user_id = ? WHERE id = ?')
      .bind(userId, nodeId).run()
    await abortAllDurableObjects()
    const retry = await unlock()
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(retry.body).toMatchObject({ creator_credit_credits: 16, platform_fee_credits: 4, balance_after_credits: 0 })
    await expectComplete(retry.body.ledger_event_id)
  })

  it('finishes a legacy raw-key debit using its original event and allocation', async () => {
    await seed()
    const actor = runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(userId)
    const accepted = await readReply(await actor.fetch(new Request('https://strytree-credit-ledger.internal/mutations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        id: 'legacy-unlock-contract-event', user_id: userId, event_type: 'unlock_debit', amount_credits: -20,
        related_object_type: 'strytree_node', related_object_id: nodeId, provider_event_id: null,
        idempotency_key: key, created_at: new Date().toISOString(),
        metadata_json: JSON.stringify({ creator_user_id: creatorId, creator_credit_credits: 16, platform_fee_credits: 4 }),
      }),
    })))
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    await runtimeEnv.DB.prepare('UPDATE strytree_nodes SET unlock_price_credits = 35 WHERE id = ?').bind(nodeId).run()
    const retry = await unlock()
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(retry.body).toMatchObject({ ledger_event_id: 'legacy-unlock-contract-event',
      creator_credit_credits: 16, platform_fee_credits: 4, balance_after_credits: 0 })
    const current = await snapshot()
    expect(current.financial.ledger.filter(row => row.event_type === 'unlock_debit')).toHaveLength(1)
    expect(current.unlocks).toEqual([expect.objectContaining({ ledger_event_id: 'legacy-unlock-contract-event', idempotency_key: key })])
    expect(current.node.paid_unlocks_count).toBe(1)
    expect(current.financial.audit.filter(row => row.action === 'unlock')).toHaveLength(1)
  })

  it('isolates the same client key across two authenticated buyers', async () => {
    await seed()
    const otherUser = 'unlock-contract-other-buyer', otherSession = 'unlock-contract-other-session'
    const now = new Date().toISOString(), expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`INSERT INTO strytree_users (id, display_name, role, created_at, updated_at)
        VALUES (?, 'Other unlock buyer', 'user', ?, ?)`).bind(otherUser, now, now),
      runtimeEnv.DB.prepare('INSERT INTO strytree_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(otherSession, otherUser, now, expires),
    ])
    const headers = { ...authHeaders('other-buyer-checkout'), authorization: `Bearer ${otherSession}` }
    const checkout = await request('/checkout/sessions', {
      method: 'POST', headers, body: '{"package_id":"credits_20"}',
    }, true)
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(201)
    const event = eventFor({ payment_session_id: String(checkout.body.payment_session_id),
      checkout_session_id: String(checkout.body.checkout_session_id) })
    event.id = 'evt-other-unlock-buyer-paid'
    event.data.object.metadata.user_id = otherUser
    expect((await sendEvent(event)).status).toBe(200)
    const replies = await Promise.all([unlock(), unlock({}, key, { ...headers, 'idempotency-key': key })])
    expect(replies.map(reply => reply.status)).toEqual([200, 200])
    const current = await snapshot()
    const debits = current.financial.ledger.filter(row => row.event_type === 'unlock_debit')
    expect(debits).toHaveLength(2)
    expect(new Set(debits.map(row => row.idempotency_key)).size).toBe(2)
    expect(debits.map(row => row.user_id).sort()).toEqual([userId, otherUser].sort())
    expect(debits.every(row => row.amount_credits === -20 && row.balance_after_credits === 0)).toBe(true)
    const otherBalance = await readReply(await runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(otherUser).fetch(
      new Request(`https://strytree-credit-ledger.internal/balance?user_id=${encodeURIComponent(otherUser)}`),
    ))
    expect(otherBalance.body).toMatchObject({ balance_credits: 0, authority_version: 2 })
    expect(current.unlocks).toHaveLength(2)
    expect(current.node.paid_unlocks_count).toBe(2)
    expect(current.financial.audit.filter(row => row.action === 'unlock')).toHaveLength(2)
    for (const [index, buyerHeaders] of [authHeaders(key), { ...headers, 'idempotency-key': key }].entries()) {
      const replay = await unlock({}, key, buyerHeaders)
      expect(replay.status, JSON.stringify(replay.body)).toBe(200)
      expect(replay.body.ledger_event_id).toBe(replies[index].body.ledger_event_id)
    }
    expect(await snapshot()).toEqual(current)
  })
})
