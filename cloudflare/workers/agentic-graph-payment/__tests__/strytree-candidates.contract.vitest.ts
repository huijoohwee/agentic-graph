import { describe, expect, it } from 'vitest'
import { runtimeEnv, userId, authHeaders, installCandidateNativeFixture } from './helpers/strytree-native-fixture'

const { storyId, nodeId, otherStoryId, otherNodeId, alternateNodeId, key, body, submit, snapshot,
  createRun, route, expectCompleted, concurrentAtAbsentRead, withInsertFailure, expectUnavailable,
  loseBatchAcknowledgement } = installCandidateNativeFixture()

describe('candidate settled replay', () => {
  it('preserves exact replay without another debit, dispatch or candidate write', async () => {
    const { reply: created, current } = await createRun()
    const replay = await submit()
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body).toMatchObject({ candidate_run_id: created.body.candidate_run_id, idempotent_replay: true })
    expect(await snapshot()).toEqual(current)
  })

  it('treats object key order as equivalent while preserving the stored request bytes', async () => {
    const { current } = await createRun()
    const reordered = {
      context: { preferences: { tone: 'clear', language: 'en' }, tags: ['archive', 'recovery'] },
      prompt: body().prompt, max_candidates: 2, parent_node_id: nodeId, story_id: storyId,
    }
    const replay = await submit(reordered)
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body.idempotent_replay).toBe(true)
    expect(await snapshot()).toEqual(current)
  })

  it('keeps the resolved idempotency key equivalent across header and body transport', async () => {
    const { current } = await createRun()
    const replay = await submit({ ...body(), idempotency_key: key }, {}, null)
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body.idempotent_replay).toBe(true)
    expect(await snapshot()).toEqual(current)
  })

  const drift: Array<[string, (payload: Record<string, unknown>) => Record<string, unknown>]> = [
    ['prompt', value => ({ ...value, prompt: 'A different paid continuation.' })],
    ['candidate count', value => ({ ...value, max_candidates: 1 })],
    ['parent', value => ({ ...value, parent_node_id: alternateNodeId })],
    ['story', value => ({ ...value, story_id: otherStoryId, parent_node_id: otherNodeId })],
    ['nested field', value => ({ ...value, context: { tags: ['archive', 'recovery'], preferences: { language: 'fr', tone: 'clear' } } })],
    ['array order', value => ({ ...value, context: { tags: ['recovery', 'archive'], preferences: { language: 'en', tone: 'clear' } } })],
    ['removed field', value => { const next = { ...value }; delete next.prompt; return next }],
  ]
  it.each(drift)('rejects changed %s before any settled financial or delivery effect', async (_name, change) => {
    const { current } = await createRun()
    const changed = await submit(change(body()))
    expect(changed.status, JSON.stringify(changed.body)).toBe(409)
    expect(changed.body).toMatchObject({ ok: false, code: 'idempotency_conflict' })
    expect(await snapshot()).toEqual(current)
  })

  it('fails closed for unreadable stored request identity', async () => {
    await createRun()
    await runtimeEnv.DB.prepare('UPDATE strytree_candidate_runs SET request_json = ? WHERE user_id = ?')
      .bind('{unreadable', userId).run()
    const before = await snapshot()
    for (const payload of [body(), {}]) {
      const replay = await submit(payload)
      expect(replay.status, JSON.stringify(replay.body)).toBe(409)
      expect(replay.body.code).toBe('idempotency_conflict')
      expect(await snapshot()).toEqual(before)
    }
  })
})

describe('candidate concurrent creation', () => {
  it.each(['identical', 'changed prompt'])('settles concurrent %s requests with one paid result', async mode => {
    const other = mode === 'identical' ? body() : { ...body(), prompt: 'A concurrent different paid continuation.' }
    const replies = await concurrentAtAbsentRead('strytree_candidate_runs', overrides => [
      submit(body(), overrides), submit(other, overrides),
    ])
    if (mode === 'identical') {
      expect(replies.every(reply => [200, 202].includes(reply.status))).toBe(true)
      expect(replies[0].body.candidate_run_id).toBe(replies[1].body.candidate_run_id)
    } else {
      expect(replies.filter(reply => [200, 202].includes(reply.status))).toHaveLength(1)
      const conflict = replies.find(reply => reply.status === 409)
      expect(conflict?.body).toMatchObject({ ok: false, code: 'idempotency_conflict' })
    }
    const current = await expectCompleted()
    const winner = JSON.parse(String(current.runs[0].request_json))
    expect([body().prompt, other.prompt]).toContain(winner.prompt)
    expect(current.candidates.every(candidate => String(candidate.synopsis).includes(String(winner.prompt)))).toBe(true)
    const replay = await submit(winner)
    expect(replay.status).toBe(200)
    expect(await snapshot()).toEqual(current)
  })
})

describe('candidate route boundaries', () => {
  it('requires authentication before creating or replaying a paid run', async () => {
    const { reply, current } = await createRun()
    const denied = await route('/candidate-runs', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body()),
    })
    expect(denied.status).toBe(401)
    expect((await route(`/candidate-runs/${reply.body.candidate_run_id}`)).status).toBe(401)
    expect(await snapshot()).toEqual(current)
  })

  it.each([0, 4])('rejects a candidate count of %i before effects', async count => {
    const before = await snapshot()
    const rejected = await submit({ ...body(), max_candidates: count })
    expect(rejected.status).toBe(400)
    expect(rejected.body.code).toBe('candidate_bound_exceeded')
    expect(await snapshot()).toEqual(before)
  })

  it('rejects a missing key and malformed request without financial or delivery effects', async () => {
    const before = await snapshot()
    expect((await submit(body(), {}, null)).status).toBe(400)
    expect((await submit([])).status).toBe(400)
    expect((await route('/candidate-runs', { method: 'POST', headers: authHeaders(key), body: '{' })).status).toBe(400)
    expect(await snapshot()).toEqual(before)
  })

  it('rejects a mismatched story parent and a nonextendable parent before debit', async () => {
    const before = await snapshot()
    const mismatch = await submit({ ...body(), parent_node_id: otherNodeId })
    expect(mismatch.status).toBe(404)
    expect(await snapshot()).toEqual(before)
    await runtimeEnv.DB.prepare('UPDATE strytree_nodes SET moderation_status = ? WHERE id = ?').bind('rejected', nodeId).run()
    expect((await submit()).status).toBe(409)
    expect(await snapshot()).toEqual(before)
  })

  it('does not require or invoke a queue for a completed deterministic candidate result', async () => {
    const rejectedQueue = { async send() { throw new Error('candidate_queue_must_not_be_used') } }
    const first = await submit(body(), { STRYTREE_GENERATION_QUEUE: rejectedQueue })
    expect(first.status, JSON.stringify(first.body)).toBe(202)
    const before = await expectCompleted()
    expect((await submit(body(), { STRYTREE_GENERATION_QUEUE: undefined })).status).toBe(200)
    expect(await snapshot()).toEqual(before)
  })
})

describe('candidate native partial failure recovery', () => {
  it('does not debit when the durable intent cannot be inserted', async () => {
    const before = await snapshot()
    await withInsertFailure('strytree_candidate_runs', '', async () => {
      expectUnavailable(await submit())
      expect(await snapshot()).toEqual(before)
    })
    expect((await submit()).status).toBe(202)
    await expectCompleted()
  })

  it('recovers an authoritative debit whose native D1 projection failed', async () => {
    const payload = { ...body(), max_candidates: 3 }
    await withInsertFailure('strytree_token_ledger', "NEW.event_type = 'candidate_run_debit'", async () => {
      expectUnavailable(await submit(payload))
      const pending = await snapshot()
      expect(pending.runs).toHaveLength(1)
      expect(pending.runs[0].status).not.toBe('completed')
      expect(pending.candidates).toEqual([])
      expect(pending.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')).toEqual([])
      expect(pending.financial.balance).toMatchObject({ balance_credits: 5, authority_version: 2 })
      expect(pending.messages).toEqual([])
    })
    const retry = await submit(payload)
    expect([200, 202], JSON.stringify(retry.body)).toContain(retry.status)
    const completed = await expectCompleted(3)
    expect((await submit(payload)).status).toBe(200)
    expect(await snapshot()).toEqual(completed)
  })

  it.each([
    ['candidate child', 'strytree_branch_candidates', "json_extract(NEW.result_json, '$.ordinal') = 2"],
    ['completion audit', 'strytree_audit_events', "NEW.action = 'candidate_run'"],
  ])('recovers a failed %s transaction after debit without charging again', async (_label, table, condition) => {
    const payload = { ...body(), max_candidates: 3 }
    let pending!: Awaited<ReturnType<typeof snapshot>>
    await withInsertFailure(table, condition, async () => {
      expectUnavailable(await submit(payload))
      pending = await snapshot()
      expect(pending.runs).toHaveLength(1)
      expect(pending.runs[0].status).not.toBe('completed')
      expect(pending.candidates).toEqual([])
      expect(pending.financial.audit.filter(row => row.action === 'candidate_run')).toEqual([])
      expect(pending.financial.ledger.filter(row => row.event_type === 'candidate_run_debit')).toHaveLength(1)
      expect(pending.financial.balance).toMatchObject({ balance_credits: 5, authority_version: 2 })
      expect(pending.messages).toEqual([])
      const drift = await submit({ ...payload, prompt: 'Different after payment.' })
      expect(drift.status).toBe(409)
      expect(drift.body.code).toBe('idempotency_conflict')
      expect(await snapshot()).toEqual(pending)
    })
    await runtimeEnv.DB.prepare('UPDATE strytree_nodes SET title = ?, synopsis = ? WHERE id = ?')
      .bind('Mutated root after payment', 'This text was not part of the paid intent.', nodeId).run()
    const retry = await submit(payload)
    expect([200, 202], JSON.stringify(retry.body)).toContain(retry.status)
    const completed = await expectCompleted(3)
    expect(completed.runs[0].id).toBe(pending.runs[0].id)
    expect(completed.financial.ledger).toEqual(pending.financial.ledger)
    expect(completed.candidates.every(candidate => String(candidate.title).endsWith(': Root'))).toBe(true)
    expect((await submit(payload)).status).toBe(200)
    expect(await snapshot()).toEqual(completed)
  })
})


describe('candidate admission and completion proof', () => {
  it('requires a native batch before admitting an intent or debit', async () => {
    const before = await snapshot()
    const rejected = await submit(body(), { DB: { prepare: runtimeEnv.DB.prepare.bind(runtimeEnv.DB) } })
    expect(rejected.status).toBe(503)
    expect(rejected.body.code).toBe('candidate_batch_unavailable')
    expect(await snapshot()).toEqual(before)
  })

  it('rejects a body over 32 KiB in UTF-8 bytes before durable effects', async () => {
    const payload = { ...body(), prompt: '界'.repeat(11_000) }
    expect(JSON.stringify(payload).length).toBeLessThan(32_768)
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeGreaterThan(32_768)
    const before = await snapshot()
    expect((await submit(payload)).status).toBe(400)
    expect(await snapshot()).toEqual(before)
  })

  it('rejects an idempotency key longer than 512 characters before durable effects', async () => {
    const before = await snapshot()
    const rejected = await submit(body(), {}, 'k'.repeat(513))
    expect(rejected.status).toBe(400)
    expect(rejected.body.code).toBe('invalid_idempotency_key')
    expect(await snapshot()).toEqual(before)
  })

  it.each([1.5, '2'])('rejects a non-integer numeric candidate count %s without effects', async max_candidates => {
    const before = await snapshot()
    const rejected = await submit({ ...body(), max_candidates })
    expect(rejected.status).toBe(400)
    expect(rejected.body.code).toBe('candidate_bound_exceeded')
    expect(await snapshot()).toEqual(before)
  })

  it('keeps partial candidate rows hidden while their run is preparing', async () => {
    const { reply, current } = await createRun()
    await runtimeEnv.DB.batch([
      runtimeEnv.DB.prepare('UPDATE strytree_candidate_runs SET status = ? WHERE id = ?')
        .bind('preparing', reply.body.candidate_run_id),
      runtimeEnv.DB.prepare('DELETE FROM strytree_branch_candidates WHERE id = ?').bind(current.candidates[0].id),
    ])
    const before = await snapshot()
    expect(before.candidates).toHaveLength(1)
    const pending = await route(`/candidate-runs/${reply.body.candidate_run_id}`, { headers: authHeaders() })
    expect(pending.status).toBe(200)
    expect(pending.body).toMatchObject({ status: 'preparing', scorecards: [] })
    expect(await snapshot()).toEqual(before)
  })

  it.each(['legacy child', 'legacy audit', 'legacy debit', 'versioned child'])(
    'fails closed without rewriting a completed run missing its %s proof', async missing => {
      const { reply, current } = await createRun()
      if (missing.startsWith('legacy')) {
        await runtimeEnv.DB.prepare('UPDATE strytree_candidate_runs SET scorecard_json = ? WHERE id = ?')
          .bind('{}', reply.body.candidate_run_id).run()
      }
      if (missing.endsWith('child')) {
        await runtimeEnv.DB.prepare('DELETE FROM strytree_branch_candidates WHERE id = ?').bind(current.candidates[0].id).run()
      } else if (missing.endsWith('audit')) {
        await runtimeEnv.DB.prepare("DELETE FROM strytree_audit_events WHERE action = 'candidate_run'").run()
      } else {
        await runtimeEnv.DB.prepare("DELETE FROM strytree_token_ledger WHERE event_type = 'candidate_run_debit'").run()
      }
      const before = await snapshot()
      const replay = await submit()
      expect(replay.status).toBe(503)
      expect(replay.body.code).toBe('candidate_reconciliation_required')
      const view = await route(`/candidate-runs/${reply.body.candidate_run_id}`, { headers: authHeaders() })
      expect(view.status).toBe(503)
      expect(view.body.code).toBe('candidate_reconciliation_required')
      expect(await snapshot()).toEqual(before)
    },
  )

  it('observes a real committed native batch after its acknowledgement is lost', async () => {
    const lost = loseBatchAcknowledgement()
    const created = await submit(body(), lost.overrides)
    expect([200, 202], JSON.stringify(created.body)).toContain(created.status)
    expect(lost.commits).toBe(1)
    const completed = await expectCompleted()
    const replay = await submit(body(), lost.overrides)
    expect(replay.status).toBe(200)
    expect(replay.body.candidate_run_id).toBe(created.body.candidate_run_id)
    expect(lost.commits).toBe(1)
    expect(await snapshot()).toEqual(completed)
  })
})
