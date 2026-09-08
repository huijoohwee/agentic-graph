import { describe, expect, it } from 'vitest'
import {
  runtimeEnv, authHeaders, eventFor, sendEvent, readReply, installCandidateNativeFixture,
} from './helpers/strytree-native-fixture'

const { storyId, key, body, createRun, route, publish, publishBody, publicationState, concurrentAtAbsentRead,
  withInsertFailure, expectUnavailable, loseBatchAcknowledgement } = installCandidateNativeFixture()

describe('candidate purchased credit publish loop', () => {
  it('reads all paid scorecards then publishes and replays one selection without another debit', async () => {
    const { reply: created } = await createRun()
    const view = await route(`/candidate-runs/${created.body.candidate_run_id}`, { headers: authHeaders() })
    expect(view.status).toBe(200)
    expect(view.body).toMatchObject({ status: 'completed', max_candidates: 2, quoted_cost_credits: 10 })
    expect(view.body.scorecards).toHaveLength(2)
    const scorecards = view.body.scorecards as Array<Record<string, unknown>>
    const selected = scorecards[0].candidate_id
    expect(typeof selected).toBe('string')
    const first = await publish(selected)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const completed = await publicationState()
    expect(completed.plans).toHaveLength(1)
    expect(completed.nodes.filter(row => row.selected_candidate_id === selected)).toHaveLength(1)
    expect(completed.candidates.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')).toHaveLength(1)
    expect(completed.candidates.financial.balance).toMatchObject({ balance_credits: 10, authority_version: 2 })
    expect(completed.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    const replay = await publish(selected)
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({ published_node_id: first.body.published_node_id, idempotent_replay: true })
    expect(await publicationState()).toEqual(completed)
  })

  it('keeps another buyer outside the paid result and rejects global request-key collision before debit', async () => {
    const { reply: created, current } = await createRun()
    const now = new Date().toISOString(), expires = new Date(Date.now() + 3_600_000).toISOString()
    const otherUser = 'candidate-other-buyer', otherSession = 'candidate-other-session'
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare(`INSERT INTO strytree_users (id, display_name, role, created_at, updated_at)
        VALUES (?, 'Other buyer', 'user', ?, ?)`).bind(otherUser, now, now),
      runtimeEnv.DB.prepare(`INSERT INTO strytree_sessions (id, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)`).bind(otherSession, otherUser, now, expires),
    ])
    const headers = { ...authHeaders('candidate-other-checkout'), authorization: `Bearer ${otherSession}` }
    const checkout = await route('/checkout/sessions', {
      method: 'POST', headers, body: JSON.stringify({ package_id: 'credits_20' }),
    }, { STRYTREE_CHECKOUT_MODE: 'local-development' })
    expect(checkout.status).toBe(201)
    const event = eventFor(checkout.body as { payment_session_id: string; checkout_session_id: string })
    event.id = 'candidate-other-paid-event'
    event.data.object.metadata.user_id = otherUser
    expect((await sendEvent(event)).status).toBe(200)
    const before = await publicationState()
    expect((await route(`/candidate-runs/${created.body.candidate_run_id}`, { headers })).status).toBe(404)
    expect((await route(`/candidates/${current.candidates[0].id}/publish`, {
      method: 'POST', headers, body: '{}',
    })).status).toBe(404)
    const collision = await route('/candidate-runs', {
      method: 'POST', headers: { ...headers, 'idempotency-key': key }, body: JSON.stringify(body()),
    })
    expect(collision.status, JSON.stringify(collision.body)).toBe(409)
    expect(await publicationState()).toEqual(before)
    const balance = await readReply(await runtimeEnv.STRYTREE_CREDIT_LEDGER.getByName(otherUser).fetch(new Request(
      `https://strytree-credit-ledger.internal/balance?user_id=${otherUser}`,
    )))
    expect(balance.body).toMatchObject({ balance_credits: 20, authority_version: 1 })
    expect((await publish(current.candidates[0].id)).status).toBe(200)
    const otherRun = await route('/candidate-runs', {
      method: 'POST', headers: { ...headers, 'idempotency-key': 'candidate-other-run' },
      body: JSON.stringify({ ...body(), max_candidates: 1 }),
    })
    expect(otherRun.status).toBe(202)
    const otherView = await route(`/candidate-runs/${otherRun.body.candidate_run_id}`, { headers })
    expect(otherView.status).toBe(200)
    const otherCandidate = (otherView.body.scorecards as Array<Record<string, unknown>>)[0].candidate_id
    const beforeKeyCollision = await publicationState()
    const publishCollision = await route(`/candidates/${otherCandidate}/publish`, {
      method: 'POST', headers: { ...headers, 'idempotency-key': 'candidate-publish-request' },
      body: JSON.stringify(publishBody()),
    })
    expect(publishCollision.status).toBe(409)
    expect(await publicationState()).toEqual(beforeKeyCollision)
  })
})

describe('candidate concurrent publication', () => {
  it('converges two simultaneous selections to one node, plan, audit and snapshot increment', async () => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    const before = await publicationState()
    const replies = await concurrentAtAbsentRead('strytree_candidate_merge_plans', overrides => [
      publish(selected, overrides), publish(selected, overrides),
    ])
    expect(replies.map(reply => reply.status)).toEqual([200, 200])
    expect(replies[0].body.published_node_id).toBe(replies[1].body.published_node_id)
    const after = await publicationState()
    expect(after.plans).toHaveLength(1)
    expect(after.nodes.filter(row => row.selected_candidate_id === selected)).toHaveLength(1)
    expect(after.candidates.financial.ledger).toEqual(before.candidates.financial.ledger)
    expect(after.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    expect(Number(after.stories.find(row => row.id === storyId)?.snapshot_version)).toBe(
      Number(before.stories.find(row => row.id === storyId)?.snapshot_version) + 1,
    )
  })
})

describe('candidate atomic publication and replay identity', () => {
  it.each([
    ['merge plan', 'strytree_candidate_merge_plans', ''],
    ['publication audit', 'strytree_audit_events', "NEW.action = 'candidate_publish'"],
  ])('rolls back a rejected %s insert and completes the retry once', async (_name, table, condition) => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    const before = await publicationState()
    await withInsertFailure(table, condition, async () => {
      expectUnavailable(await publish(selected))
      expect(await publicationState()).toEqual(before)
    })
    const completed = await publish(selected)
    expect(completed.status, JSON.stringify(completed.body)).toBe(200)
    const after = await publicationState()
    expect(after.plans).toHaveLength(1)
    expect(after.nodes.filter(row => row.selected_candidate_id === selected)).toHaveLength(1)
    expect(after.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    expect(after.candidates.financial.ledger).toEqual(before.candidates.financial.ledger)
    expect((await publish(selected)).status).toBe(200)
    expect(await publicationState()).toEqual(after)
  })

  it.each(['title', 'synopsis', 'merge_notes'])('rejects changed publication %s before any settled effect', async field => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    expect((await publish(selected)).status).toBe(200)
    const before = await publicationState()
    const changed = await publish(selected, {}, { ...publishBody(), [field]: 'Different requested value' })
    expect(changed.status).toBe(409)
    expect(await publicationState()).toEqual(before)
  })

  it('reserves one winning key when equivalent selections race with different keys', async () => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    const before = await publicationState()
    const keys = ['candidate-publish-key-one', 'candidate-publish-key-two']
    const replies = await concurrentAtAbsentRead('strytree_candidate_merge_plans', overrides => [
      publish(selected, overrides, publishBody(), keys[0]),
      publish(selected, overrides, publishBody(), keys[1]),
    ])
    expect(replies.map(reply => reply.status).sort((a, b) => a - b)).toEqual([200, 409])
    const after = await publicationState()
    expect(after.plans).toHaveLength(1)
    expect(after.nodes.filter(row => row.selected_candidate_id === selected)).toHaveLength(1)
    expect(after.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    expect(after.candidates.financial.ledger).toEqual(before.candidates.financial.ledger)
    expect(Number(after.stories.find(row => row.id === storyId)?.snapshot_version)).toBe(
      Number(before.stories.find(row => row.id === storyId)?.snapshot_version) + 1,
    )
    const winner = String(after.plans[0].idempotency_key)
    expect(keys).toContain(winner)
    expect((await publish(selected, {}, publishBody(), winner)).status).toBe(200)
    const loser = keys.find(candidate => candidate !== winner)!
    expect((await publish(selected, {}, publishBody(), loser)).status).toBe(409)
    expect(await publicationState()).toEqual(after)
  })

  it('rejects reuse of a publication key for a different candidate', async () => {
    const { current } = await createRun()
    expect((await publish(current.candidates[0].id)).status).toBe(200)
    const before = await publicationState()
    const collision = await publish(current.candidates[1].id)
    expect(collision.status).toBe(409)
    expect(await publicationState()).toEqual(before)
  })

  it('replays omitted publication defaults after the parent text changes', async () => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    const first = await publish(selected, {}, {})
    expect(first.status).toBe(200)
    await runtimeEnv.DB.prepare('UPDATE strytree_nodes SET title = ?, synopsis = ? WHERE id = ?')
      .bind('Later root title', 'Later root synopsis', current.candidates[0].parent_node_id).run()
    const before = await publicationState()
    const replay = await publish(selected, {}, {})
    expect(replay.status).toBe(200)
    expect(replay.body.published_node_id).toBe(first.body.published_node_id)
    expect(await publicationState()).toEqual(before)
  })

  it('recovers a lost native publication acknowledgement by observing the committed winner', async () => {
    const { current } = await createRun()
    const lost = loseBatchAcknowledgement()
    const selected = current.candidates[0].id
    const first = await publish(selected, lost.overrides)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(lost.commits).toBe(1)
    const before = await publicationState()
    expect(before.plans).toHaveLength(1)
    expect(before.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    const replay = await publish(selected, lost.overrides)
    expect(replay.status).toBe(200)
    expect(replay.body.published_node_id).toBe(first.body.published_node_id)
    expect(lost.commits).toBe(1)
    expect(await publicationState()).toEqual(before)
  })
})

describe('candidate publication completion proof', () => {
  it.each(['preparing run', 'missing run audit', 'missing run child'])(
    'refuses publication with a %s and preserves the observed state', async missing => {
      const { reply, current } = await createRun()
      const selected = current.candidates[0].id
      if (missing === 'preparing run') {
        await runtimeEnv.DB.prepare('UPDATE strytree_candidate_runs SET status = ? WHERE id = ?')
          .bind('preparing', reply.body.candidate_run_id).run()
      } else if (missing === 'missing run audit') {
        await runtimeEnv.DB.prepare("DELETE FROM strytree_audit_events WHERE action = 'candidate_run'").run()
      } else {
        await runtimeEnv.DB.prepare('DELETE FROM strytree_branch_candidates WHERE id = ?').bind(current.candidates[1].id).run()
      }
      const before = await publicationState()
      const rejected = await publish(selected)
      expect(rejected.status).toBe(503)
      expect(rejected.body.code).toBe('candidate_reconciliation_required')
      expect(await publicationState()).toEqual(before)
    },
  )

  it.each(['candidate status', 'publication audit', 'merge plan'])(
    'does not replay success for a partial publication missing its %s', async missing => {
      const { current } = await createRun()
      const selected = current.candidates[0].id
      expect((await publish(selected)).status).toBe(200)
      if (missing === 'candidate status') {
        await runtimeEnv.DB.prepare('UPDATE strytree_branch_candidates SET status = ? WHERE id = ?')
          .bind('succeeded', selected).run()
      } else if (missing === 'publication audit') {
        await runtimeEnv.DB.prepare("DELETE FROM strytree_audit_events WHERE action = 'candidate_publish'").run()
      } else {
        await runtimeEnv.DB.prepare('DELETE FROM strytree_candidate_merge_plans WHERE selected_candidate_id = ?').bind(selected).run()
      }
      const before = await publicationState()
      const replay = await publish(selected)
      expect(replay.status).toBe(503)
      expect(replay.body.code).toBe('candidate_publish_reconciliation_required')
      expect(await publicationState()).toEqual(before)
    },
  )
})


describe('candidate publication failed-batch response race', () => {
  it('returns the committed winner when publication completes after an empty orphan observation', async () => {
    const { current } = await createRun()
    const selected = current.candidates[0].id
    const before = await publicationState()
    const native = runtimeEnv.DB
    let failedBatches = 0, interleavedWinners = 0
    let winner: Awaited<ReturnType<typeof publish>> | undefined
    const db = {
      async batch(statements: D1PreparedStatement[]) {
        if (failedBatches > 0) return native.batch(statements)
        await native.prepare(`CREATE TRIGGER candidate_contract_first_publish_abort
          BEFORE INSERT ON strytree_audit_events WHEN NEW.action = 'candidate_publish'
          BEGIN SELECT RAISE(ABORT, 'candidate_contract_first_publish_abort'); END`).run()
        try { return await native.batch(statements) } catch (error) {
          failedBatches += 1
          throw error
        } finally {
          await native.prepare('DROP TRIGGER IF EXISTS candidate_contract_first_publish_abort').run()
        }
      },
      prepare(sql: string) {
        const statement = native.prepare(sql)
        if (!/^\s*SELECT id FROM strytree_nodes/i.test(sql)
          || !sql.includes('UNION ALL SELECT id FROM strytree_audit_events')) return statement
        const wrap = (target: D1PreparedStatement): D1PreparedStatement => new Proxy(target, {
          get(value, property) {
            if (property === 'bind') return (...values: unknown[]) => wrap(value.bind(...values))
            if (property === 'all') return async <T,>() => {
              const observed = await value.all<T>()
              if (failedBatches === 1 && interleavedWinners === 0 && observed.results.length === 0) {
                interleavedWinners += 1
                // The native read has finished. Commit the second request before
                // returning that original empty observation to the failed request.
                winner = await publish(selected)
              }
              return observed
            }
            const member = Reflect.get(value, property, value)
            return typeof member === 'function' ? member.bind(value) : member
          },
        })
        return wrap(statement)
      },
    }
    const recovered = await publish(selected, { DB: db })
    expect(failedBatches).toBe(1)
    expect(interleavedWinners).toBe(1)
    expect(winner?.status, JSON.stringify(winner?.body)).toBe(200)
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200)
    expect(recovered.body.published_node_id).toBe(winner?.body.published_node_id)
    const after = await publicationState()
    expect(after.plans).toHaveLength(1)
    expect(after.nodes.filter(row => row.selected_candidate_id === selected)).toHaveLength(1)
    expect(after.candidates.financial.audit.filter(row => row.action === 'candidate_publish')).toHaveLength(1)
    expect(after.candidates.financial.ledger).toEqual(before.candidates.financial.ledger)
    expect(Number(after.stories.find(row => row.id === storyId)?.snapshot_version)).toBe(
      Number(before.stories.find(row => row.id === storyId)?.snapshot_version) + 1,
    )
  })
})
