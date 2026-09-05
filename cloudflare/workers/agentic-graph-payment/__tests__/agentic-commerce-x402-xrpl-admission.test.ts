import assert from 'node:assert/strict'
import test from 'node:test'

import { handleAgenticCommercePaidResourceRoute } from '../agenticCommercePaidResource'
import { prunePaidResourceRetention } from '../agenticCommercePaidResourcePersistence'
import {
  CORS_HEADERS,
  NOW,
  createRuntime,
  routeRequest,
} from './agenticCommerceXrplRouteTestSupport'

const unsignedRequest = async (runtime: Awaited<ReturnType<typeof createRuntime>>, key: string) =>
  await handleAgenticCommercePaidResourceRoute(
    routeRequest({ idempotencyKey: key }),
    runtime.env,
    runtime.db,
    CORS_HEADERS,
    runtime.dependencies,
  )

test('the atomic admission window allows ten new challenges before any rejected egress', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())

  const responses = await Promise.all(Array.from(
    { length: 32 },
    (_, index) => unsignedRequest(runtime, `new-challenge-${index}`),
  ))
  assert.equal(responses.filter(response => response.status === 402).length, 10)
  assert.equal(responses.filter(response => response.status === 429).length, 22)
  assert.deepEqual(runtime.counts, {
    ready: 10,
    supported: 10,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
  const challenges = runtime.sqlite.prepare(
    'SELECT COUNT(*) AS count FROM agentic_commerce_paid_resources',
  ).get() as { count: number }
  const admission = runtime.sqlite.prepare(
    'SELECT request_count FROM agentic_commerce_paid_resource_admission_windows',
  ).get() as { request_count: number }
  assert.equal(challenges.count, 10)
  assert.equal(admission.request_count, 10)
  for (const response of responses.filter(candidate => candidate.status === 429)) {
    assert.deepEqual(await response.json(), {
      ok: false,
      contract: 'agentic-commerce.paid-resource/v1',
      code: 'paid_resource_rate_limited',
      retryable: true,
      retryAfterSeconds: 60,
    })
  }
})

test('an identical unsigned challenge replays without readiness or facilitator probes', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const first = await unsignedRequest(runtime, 'same-challenge')
  const firstSnapshot = {
    status: first.status,
    paymentRequired: first.headers.get('PAYMENT-REQUIRED'),
    body: await first.text(),
  }
  assert.equal(firstSnapshot.status, 402)
  assert.ok(firstSnapshot.paymentRequired)
  assert.equal(runtime.counts.ready, 1)
  assert.equal(runtime.counts.supported, 1)
  runtime.resetCounts()

  const replay = await unsignedRequest(runtime, 'same-challenge')
  assert.deepEqual({
    status: replay.status,
    paymentRequired: replay.headers.get('PAYMENT-REQUIRED'),
    body: await replay.text(),
  }, firstSnapshot)
  assert.deepEqual(runtime.counts, {
    ready: 0,
    supported: 0,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  })
  const counts = runtime.sqlite.prepare(
    `SELECT
       (SELECT COUNT(*) FROM agentic_commerce_paid_resources) AS resources,
       (SELECT request_count FROM agentic_commerce_paid_resource_admission_windows) AS admitted`,
  ).get() as { resources: number; admitted: number }
  assert.equal(counts.resources, 1)
  assert.equal(counts.admitted, 1)
})

type SeedState = 'challenged' | 'expired' | 'fulfilled' | 'settlement_unknown'

const seedRetentionRow = (
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  args: { id: string; state: SeedState; updatedAt: string; expiresAt: string },
): void => {
  const terminal = args.state === 'fulfilled'
  const hasResponse = terminal || args.state === 'settlement_unknown'
  runtime.sqlite.prepare(
    `INSERT INTO agentic_commerce_paid_resources (
       id, resource_id, idempotency_key, network,
       request_digest, request_json, requirements_digest, requirements_json,
       payment_required_digest, payment_required_json, facilitator_url, rpc_url, transport_digest,
       payment_payload_digest, signed_blob_digest, transaction_hash,
       state, revision, response_json, response_digest,
       settlement_json, settlement_digest, settlement_attempts,
       created_at, updated_at, expires_at, fulfilled_at
     ) VALUES (?, 'agentic-commerce.travel-requote/v1', ?, 'xrpl:1',
       'request-digest', '{}', 'requirements-digest', '{}',
       'payment-required-digest', '{}', 'https://facilitator.test', 'https://rpc.test', 'transport-digest',
       ?, ?, ?, ?, 1, ?, ?, ?, ?,
       ?, '2026-07-01T00:00:00.000Z', ?, ?, ?)`,
  ).run(
    args.id,
    args.id,
    hasResponse ? `payment-${args.id}` : null,
    hasResponse ? `blob-${args.id}` : null,
    hasResponse ? `transaction-${args.id}` : null,
    args.state,
    hasResponse ? '{"ok":true}' : null,
    hasResponse ? `response-${args.id}` : null,
    terminal ? '{"success":true}' : null,
    terminal ? `settlement-${args.id}` : null,
    hasResponse ? 1 : 0,
    args.updatedAt,
    args.expiresAt,
    terminal ? args.updatedAt : null,
  )
}

test('retention deletes only expired unpaid and old expired evidence', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  const now = '2026-09-05T01:00:00.000Z'
  const expiredBefore = '2026-08-06T01:00:00.000Z'
  seedRetentionRow(runtime, {
    id: 'expired-unpaid', state: 'challenged',
    updatedAt: '2026-09-05T00:00:00.000Z', expiresAt: '2026-09-05T00:59:59.000Z',
  })
  seedRetentionRow(runtime, {
    id: 'active-unpaid', state: 'challenged',
    updatedAt: '2026-09-05T00:00:00.000Z', expiresAt: '2026-09-05T01:00:01.000Z',
  })
  seedRetentionRow(runtime, {
    id: 'old-expired', state: 'expired',
    updatedAt: '2026-08-06T01:00:00.000Z', expiresAt: '2026-08-01T00:00:00.000Z',
  })
  seedRetentionRow(runtime, {
    id: 'recent-expired', state: 'expired',
    updatedAt: '2026-08-06T01:00:01.000Z', expiresAt: '2026-08-01T00:00:00.000Z',
  })
  seedRetentionRow(runtime, {
    id: 'fulfilled-old', state: 'fulfilled',
    updatedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-01T00:00:00.000Z',
  })
  seedRetentionRow(runtime, {
    id: 'settlement-unknown-old', state: 'settlement_unknown',
    updatedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-01T00:00:00.000Z',
  })
  runtime.sqlite.exec(`
    INSERT INTO agentic_commerce_paid_resource_admission_windows
      (bucket_key, request_count, expires_at, updated_at)
    VALUES
      ('expired-window', 1, '2026-09-05T00:59:59.000Z', '2026-09-05T00:00:00.000Z'),
      ('active-window', 1, '2026-09-05T01:00:01.000Z', '2026-09-05T00:00:00.000Z')
  `)

  await prunePaidResourceRetention(runtime.db, { now, expiredBefore })
  const rows = runtime.sqlite.prepare(
    'SELECT id FROM agentic_commerce_paid_resources ORDER BY id',
  ).all().map(row => row.id)
  assert.deepEqual(rows, [
    'active-unpaid',
    'fulfilled-old',
    'recent-expired',
    'settlement-unknown-old',
  ])
  const windows = runtime.sqlite.prepare(
    'SELECT bucket_key FROM agentic_commerce_paid_resource_admission_windows ORDER BY bucket_key',
  ).all().map(row => row.bucket_key)
  assert.deepEqual(windows, ['active-window'])
})

test('retention pruning is capped at 64 rows per class and skipped on rejected admission', async (t) => {
  const runtime = await createRuntime()
  t.after(() => runtime.sqlite.close())
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await unsignedRequest(runtime, `fill-admission-${index}`)).status, 402)
  }
  runtime.resetCounts()

  const now = NOW.toISOString()
  const expiredBefore = '2026-08-06T00:15:00.000Z'
  for (let index = 0; index < 65; index += 1) {
    seedRetentionRow(runtime, {
      id: `backlog-challenged-${index}`,
      state: 'challenged',
      updatedAt: '2026-09-04T00:00:00.000Z',
      expiresAt: '2026-09-05T00:14:59.000Z',
    })
    seedRetentionRow(runtime, {
      id: `backlog-expired-${index}`,
      state: 'expired',
      updatedAt: '2026-08-06T00:14:59.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
    })
    runtime.sqlite.prepare(
      `INSERT INTO agentic_commerce_paid_resource_admission_windows
        (bucket_key, request_count, expires_at, updated_at) VALUES (?, 1, ?, ?)`,
    ).run(
      `backlog-window-${index}`,
      '2026-09-05T00:14:59.000Z',
      '2026-09-05T00:00:00.000Z',
    )
    runtime.sqlite.prepare(
      `INSERT INTO agentic_commerce_paid_resource_rejections
        (paid_resource_id, network, transaction_hash, expires_at, created_at)
       VALUES (?, 'xrpl:1', ?, ?, ?)`,
    ).run(
      `backlog-rejection-owner-${index}`,
      index.toString(16).padStart(64, '0'),
      '2026-09-05T00:14:59.000Z',
      '2026-09-05T00:00:00.000Z',
    )
  }
  const backlogCounts = () => {
    const resources = runtime.sqlite.prepare(
      `SELECT
         SUM(CASE WHEN state = 'challenged' AND expires_at <= ? THEN 1 ELSE 0 END) AS challenged,
         SUM(CASE WHEN state = 'expired' AND updated_at <= ? THEN 1 ELSE 0 END) AS expired
       FROM agentic_commerce_paid_resources`,
    ).get(now, expiredBefore) as { challenged: number; expired: number }
    const admission = runtime.sqlite.prepare(
      `SELECT COUNT(*) AS count
         FROM agentic_commerce_paid_resource_admission_windows WHERE expires_at <= ?`,
    ).get(now) as { count: number }
    const rejections = runtime.sqlite.prepare(
      `SELECT COUNT(*) AS count
         FROM agentic_commerce_paid_resource_rejections WHERE expires_at <= ?`,
    ).get(now) as { count: number }
    return { ...resources, admission: admission.count, rejections: rejections.count }
  }
  const fullBacklog = { challenged: 65, expired: 65, admission: 65, rejections: 65 }
  assert.deepEqual(backlogCounts(), fullBacklog)

  const rejected = await unsignedRequest(runtime, 'over-limit-no-prune')
  assert.equal(rejected.status, 429)
  assert.deepEqual(backlogCounts(), fullBacklog)
  assert.deepEqual(runtime.counts, {
    ready: 0, supported: 0, verify: 0, resource: 0, settle: 0, rpc: 0,
  })

  await prunePaidResourceRetention(runtime.db, { now, expiredBefore })
  assert.deepEqual(backlogCounts(), {
    challenged: 1, expired: 1, admission: 1, rejections: 1,
  })
})
