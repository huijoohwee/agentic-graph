import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import test from 'node:test'

import type { D1DatabaseLike, D1StatementLike } from '../../shared/d1'
import {
  cachePaidResourceResponse,
  claimPaidResourcePayment,
  createPaidResourceChallenge,
  findPaidResourceById,
  fulfillPaidResource,
  markPaidResourceExecuting,
  markPaidResourceSettlementUnknown,
  recoverStalePaidResource,
} from '../agenticCommercePaidResourcePersistence'

const MIGRATION = new URL(
  '../../../d1/migrations/0018_agentic_commerce_paid_resources.sql',
  import.meta.url,
)
const NOW = '2026-09-05T00:15:00.000Z'
const CLAIM_EXPIRY = '2026-09-05T00:16:00.000Z'
const RESOURCE_EXPIRY = '2026-09-05T00:25:00.000Z'

class SqliteD1 implements D1DatabaseLike {
  constructor(readonly sqlite: DatabaseSync) {}

  prepare(query: string): D1StatementLike {
    let values: SQLInputValue[] = []
    const statement = this.sqlite.prepare(query)
    const bound: D1StatementLike = {
      bind: (...next: unknown[]) => {
        values = next as SQLInputValue[]
        return bound
      },
      run: async () => {
        const result = statement.run(...values)
        return { success: true, meta: { changes: Number(result.changes) } }
      },
      all: async <T = Record<string, unknown>>() => ({
        results: statement.all(...values) as T[],
      }),
    }
    return bound
  }
}

const createDb = (): { sqlite: DatabaseSync; db: SqliteD1 } => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(MIGRATION, 'utf8'))
  return { sqlite, db: new SqliteD1(sqlite) }
}

const challengeArgs = Object.freeze({
  id: 'invoice_01',
  resourceId: 'agentic-commerce.travel-requote/v1',
  idempotencyKey: 'quote-request-01',
  network: 'xrpl:1',
  requestDigest: 'request-digest-01',
  requestJson: '{"agentId":"agent-flight"}',
  requirementsDigest: 'requirements-digest-01',
  requirementsJson: '{"scheme":"exact"}',
  paymentRequiredDigest: 'payment-required-digest-01',
  paymentRequiredJson: '{"x402Version":2}',
  facilitatorUrl: 'https://facilitator.test',
  rpcUrl: 'https://rpc.test',
  transportDigest: 'transport-digest-01',
  now: NOW,
  expiresAt: RESOURCE_EXPIRY,
})

const paymentArgs = Object.freeze({
  id: challengeArgs.id,
  expectedRevision: 0,
  paymentPayloadDigest: 'payment-digest-01',
  signedBlobDigest: 'signed-blob-digest-01',
  transactionHash: 'A'.repeat(64),
  claimToken: 'claim-01',
  claimExpiresAt: CLAIM_EXPIRY,
  now: NOW,
})

test('migration persists coordination evidence without signed transaction bytes', () => {
  const { sqlite } = createDb()
  const row = sqlite.prepare(
    `SELECT sql FROM sqlite_master
      WHERE type = 'table' AND name = 'agentic_commerce_paid_resources'`,
  ).get() as { sql: string }
  const schema = row.sql.toLowerCase()
  assert.equal(schema.includes('signed_blob_digest'), true)
  assert.equal(schema.includes('signed_tx_blob'), false)
  assert.equal(schema.includes('private_key'), false)
  assert.equal(schema.includes('seed'), false)
})

test('challenge identity is idempotent and digest-bound', async () => {
  const { db } = createDb()
  const first = await createPaidResourceChallenge(db, challengeArgs)
  const replay = await createPaidResourceChallenge(db, challengeArgs)
  assert.equal(first.ok && first.created, true)
  assert.equal(replay.ok && !replay.created, true)

  const conflict = await createPaidResourceChallenge(db, {
    ...challengeArgs,
    requestDigest: 'changed-request',
  })
  assert.equal(conflict.ok, false)
  if (!conflict.ok) assert.equal(conflict.code, 'paid_resource_identity_conflict')
})

test('32 concurrent claimants produce one verifier and bind one transaction', async () => {
  const { sqlite, db } = createDb()
  await createPaidResourceChallenge(db, challengeArgs)
  const results = await Promise.all(
    Array.from({ length: 32 }, (_, index) => claimPaidResourcePayment(db, {
      ...paymentArgs,
      claimToken: `claim-${index}`,
    })),
  )
  assert.equal(results.filter(result => result.ok && result.claimed).length, 1)
  assert.equal(results.filter(result => result.ok && !result.claimed).length, 31)
  const record = await findPaidResourceById(db, challengeArgs.id)
  assert.equal(record?.state, 'verifying')
  assert.equal(record?.revision, 1)
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM agentic_commerce_paid_resources')
      .get()?.count,
    1,
  )
})

test('response is cached before settlement and fulfillment is replayable', async () => {
  const { db } = createDb()
  await createPaidResourceChallenge(db, challengeArgs)
  const claim = await claimPaidResourcePayment(db, paymentArgs)
  assert.equal(claim.ok && claim.claimed, true)
  if (!claim.ok) return
  const executing = await markPaidResourceExecuting(db, {
    id: challengeArgs.id,
    expectedRevision: claim.record.revision,
    claimToken: paymentArgs.claimToken,
    payer: 'rBuyer',
    now: NOW,
  })
  assert.equal(executing.ok, true)
  if (!executing.ok) return
  const settling = await cachePaidResourceResponse(db, {
    id: challengeArgs.id,
    expectedRevision: executing.record.revision,
    claimToken: paymentArgs.claimToken,
    responseJson: '{"quoteId":"quote_01"}',
    responseDigest: 'response-digest-01',
    claimExpiresAt: CLAIM_EXPIRY,
    now: NOW,
  })
  assert.equal(settling.ok, true)
  if (!settling.ok) return
  assert.equal(settling.record.state, 'settling')
  assert.equal(settling.record.settlement_json, null)
  const fulfilled = await fulfillPaidResource(db, {
    id: challengeArgs.id,
    expectedRevision: settling.record.revision,
    claimToken: paymentArgs.claimToken,
    settlementJson: '{"success":true}',
    settlementDigest: 'settlement-digest-01',
    payer: 'rBuyer',
    now: NOW,
  })
  assert.equal(fulfilled.ok, true)
  if (!fulfilled.ok) assert.fail('fulfillment should succeed')
  assert.equal(fulfilled.record.state, 'fulfilled')
  assert.equal(fulfilled.record.response_json, '{"quoteId":"quote_01"}')
})

test('ambiguous settlement retains cached response for reconcile-only recovery', async () => {
  const { db } = createDb()
  await createPaidResourceChallenge(db, challengeArgs)
  const claim = await claimPaidResourcePayment(db, paymentArgs)
  if (!claim.ok) assert.fail('payment claim should succeed')
  const executing = await markPaidResourceExecuting(db, {
    id: challengeArgs.id,
    expectedRevision: claim.record.revision,
    claimToken: paymentArgs.claimToken,
    payer: null,
    now: NOW,
  })
  if (!executing.ok) assert.fail('execution transition should succeed')
  const settling = await cachePaidResourceResponse(db, {
    id: challengeArgs.id,
    expectedRevision: executing.record.revision,
    claimToken: paymentArgs.claimToken,
    responseJson: '{"quoteId":"quote_01"}',
    responseDigest: 'response-digest-01',
    claimExpiresAt: CLAIM_EXPIRY,
    now: NOW,
  })
  if (!settling.ok) assert.fail('settling transition should succeed')
  const unknown = await markPaidResourceSettlementUnknown(db, {
    id: challengeArgs.id,
    expectedRevision: settling.record.revision,
    claimToken: paymentArgs.claimToken,
    now: NOW,
  })
  if (!unknown.ok) assert.fail('unknown transition should succeed')
  assert.equal(unknown.record.claim_token, null)
  assert.equal(unknown.record.response_json, '{"quoteId":"quote_01"}')
  const recovered = await fulfillPaidResource(db, {
    id: challengeArgs.id,
    expectedRevision: unknown.record.revision,
    settlementJson: '{"success":true,"extra":{"reconciled":true}}',
    settlementDigest: 'settlement-digest-reconciled',
    payer: 'rBuyer',
    now: NOW,
  })
  assert.equal(recovered.ok && recovered.record.state === 'fulfilled', true)
})

test('stale claims recover by operation safety', async () => {
  const { db } = createDb()
  await createPaidResourceChallenge(db, challengeArgs)
  const claim = await claimPaidResourcePayment(db, paymentArgs)
  if (!claim.ok) assert.fail('payment claim should succeed')
  const reset = await recoverStalePaidResource(db, {
    id: challengeArgs.id,
    expectedRevision: claim.record.revision,
    now: CLAIM_EXPIRY,
  })
  assert.equal(reset.ok && reset.record.state === 'challenged', true)

  const reclaimed = await claimPaidResourcePayment(db, {
    ...paymentArgs,
    expectedRevision: reset.ok ? reset.record.revision : -1,
    claimToken: 'claim-retry',
  })
  if (!reclaimed.ok) assert.fail('payment reclaim should succeed')
  const executing = await markPaidResourceExecuting(db, {
    id: challengeArgs.id,
    expectedRevision: reclaimed.record.revision,
    claimToken: 'claim-retry',
    payer: null,
    now: NOW,
  })
  if (!executing.ok) assert.fail('execution transition should succeed')
  const expired = await recoverStalePaidResource(db, {
    id: challengeArgs.id,
    expectedRevision: executing.record.revision,
    now: CLAIM_EXPIRY,
  })
  assert.equal(expired.ok && expired.record.state === 'expired', true)
  if (expired.ok) assert.equal(expired.record.error_code, 'resource_execution_abandoned')
})
