import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import type {
  D1DatabaseLike,
  D1StatementLike,
} from '../../shared/d1'
import {
  claimAgenticPurchaseAuthorization,
  closeAgenticPurchaseCardWhenSafe,
  consumeAgenticPurchaseApproval,
  createAgenticPurchaseLifecycle,
  registerAgenticPurchaseApproval,
  releaseAgenticPurchaseFundingReservation,
  reserveAgenticPurchaseFunding,
} from '../agenticPurchaseSafetyPersistence'
import { requireHumanConfirmationForPaymentCall } from '../travelAgency/confirmationGate'
import { prepareTravelAgencyIssuance } from '../travelAgency/issuanceService'

const MIGRATION_URL = new URL(
  '../../../d1/migrations/0010_agenticgraph_agentic_purchase_lifecycle.sql',
  import.meta.url,
)
const NOW = '2026-07-29T01:00:00.000Z'
const LATER = '2026-07-29T01:05:00.000Z'

class SqliteD1 implements D1DatabaseLike {
  prepareCount = 0

  constructor(readonly sqlite: DatabaseSync) {}

  prepare(query: string): D1StatementLike {
    this.prepareCount += 1
    let values: unknown[] = []
    const statement = this.sqlite.prepare(query)
    const bound: D1StatementLike = {
      bind: (...nextValues: unknown[]) => {
        values = nextValues
        return bound
      },
      run: async () => {
        const result = statement.run(...values)
        return {
          success: true,
          meta: { changes: Number(result.changes) },
        }
      },
      all: async <T = Record<string, unknown>>() => ({
        results: statement.all(...values) as T[],
      }),
    }
    return bound
  }
}

const createDatabase = (): {
  sqlite: DatabaseSync
  db: SqliteD1
} => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(readFileSync(MIGRATION_URL, 'utf8'))
  return { sqlite, db: new SqliteD1(sqlite) }
}

const lifecycleArgs = Object.freeze({
  lifecycleId: 'lifecycle_01',
  lifecycleKey: 'purchase_01',
  envelopeDigest: 'envelope_digest_01',
  envelopeJson: '{"schemaId":"agentic-graph-agentic-purchase-envelope/v1"}',
  now: NOW,
})

const approvalArgs = Object.freeze({
  approvalRef: 'approval_01',
  lifecycleId: lifecycleArgs.lifecycleId,
  envelopeDigest: lifecycleArgs.envelopeDigest,
  candidateDigest: 'candidate_digest_01',
  amountMinor: 12_500,
  merchantPolicyDigest: 'merchant_policy_digest_01',
  expiresAt: '2026-07-29T01:30:00.000Z',
  createdAt: NOW,
})

const seedLifecycle = async (db: D1DatabaseLike): Promise<void> => {
  const result = await createAgenticPurchaseLifecycle(db, lifecycleArgs)
  assert.equal(result.ok, true)
}

test('migration owns only minimized lifecycle records and no credential material', () => {
  const { sqlite } = createDatabase()
  const tables = sqlite.prepare(
    `SELECT name, sql
       FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'payment_purchase_%'
      ORDER BY name`,
  ).all() as Array<{ name: string; sql: string }>
  assert.deepEqual(tables.map(row => row.name), [
    'payment_purchase_approvals',
    'payment_purchase_authorizations',
    'payment_purchase_cards',
    'payment_purchase_funding_reservations',
    'payment_purchase_lifecycles',
    'payment_purchase_receipts',
  ])
  const schema = tables.map(row => row.sql).join('\n').toLowerCase()
  for (const prohibited of [
    'private_key',
    'signer_secret',
    'card_number',
    'card_cvv',
    'card_cvc',
    'deposit_address',
    'kyc_payload',
  ]) {
    assert.equal(schema.includes(prohibited), false, prohibited)
  }
})

test('concurrent lifecycle creation is one-write idempotent and digest-bound', async () => {
  const { sqlite, db } = createDatabase()
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      createAgenticPurchaseLifecycle(db, lifecycleArgs)),
  )
  assert.equal(results.filter(result =>
    result.ok && result.idempotentReplay === false).length, 1)
  assert.equal(results.filter(result =>
    result.ok && result.idempotentReplay === true).length, 99)
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM payment_purchase_lifecycles')
      .get()?.count,
    1,
  )
  assert.deepEqual(
    await createAgenticPurchaseLifecycle(db, {
      ...lifecycleArgs,
      envelopeDigest: 'changed_digest',
    }),
    {
      ok: false,
      code: 'purchase_instruction_conflict',
      lifecycleId: lifecycleArgs.lifecycleId,
    },
  )
})

test('approval survives a runtime restart and consumes atomically once', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  assert.deepEqual(await registerAgenticPurchaseApproval(db, approvalArgs), {
    ok: true,
    approvalRef: approvalArgs.approvalRef,
    idempotentReplay: false,
    consumedNow: false,
  })
  const restartedDb = new SqliteD1(sqlite)
  const consumeArgs = {
    approvalRef: approvalArgs.approvalRef,
    lifecycleId: approvalArgs.lifecycleId,
    envelopeDigest: approvalArgs.envelopeDigest,
    candidateDigest: approvalArgs.candidateDigest,
    amountMinor: approvalArgs.amountMinor,
    merchantPolicyDigest: approvalArgs.merchantPolicyDigest,
    now: LATER,
  }
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      consumeAgenticPurchaseApproval(restartedDb, consumeArgs)),
  )
  assert.equal(results.filter(result =>
    result.ok && result.consumedNow).length, 1)
  assert.equal(results.filter(result =>
    result.ok && result.idempotentReplay).length, 99)
  assert.equal(
    sqlite.prepare(
      'SELECT consumed_at FROM payment_purchase_approvals WHERE approval_ref = ?',
    ).get(approvalArgs.approvalRef)?.consumed_at,
    LATER,
  )
  assert.deepEqual(
    await consumeAgenticPurchaseApproval(restartedDb, {
      ...consumeArgs,
      candidateDigest: 'changed_candidate',
    }),
    { ok: false, code: 'approval_conflict' },
  )
})

test('approval TTL and amount reject before D1', async () => {
  const { db } = createDatabase()
  const before = db.prepareCount
  assert.deepEqual(await registerAgenticPurchaseApproval(db, {
    ...approvalArgs,
    amountMinor: 0,
  }), { ok: false, code: 'approval_invalid' })
  assert.deepEqual(await registerAgenticPurchaseApproval(db, {
    ...approvalArgs,
    expiresAt: '2026-07-29T01:30:00.001Z',
  }), { ok: false, code: 'approval_invalid' })
  assert.equal(db.prepareCount, before)
})

test('expired approval is rejected without consumption', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  await registerAgenticPurchaseApproval(db, {
    ...approvalArgs,
    createdAt: '2026-07-29T00:30:00.000Z',
    expiresAt: NOW,
  })
  assert.deepEqual(
    await consumeAgenticPurchaseApproval(db, {
      ...approvalArgs,
      now: LATER,
    }),
    { ok: false, code: 'approval_expired' },
  )
  assert.equal(
    sqlite.prepare(
      'SELECT consumed_at FROM payment_purchase_approvals WHERE approval_ref = ?',
    ).get(approvalArgs.approvalRef)?.consumed_at,
    null,
  )
})

test('funding reservation releases once and never creates a return transfer', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  const reservationArgs = {
    lifecycleId: lifecycleArgs.lifecycleId,
    fundingKey: 'funding_01',
    amountMinor: approvalArgs.amountMinor,
    createdAt: NOW,
  }
  const reservations = await Promise.all(
    Array.from({ length: 100 }, () =>
      reserveAgenticPurchaseFunding(db, reservationArgs)),
  )
  assert.equal(reservations.filter(result =>
    result.ok && !result.idempotentReplay).length, 1)
  const releases = await Promise.all(
    Array.from({ length: 100 }, () =>
      releaseAgenticPurchaseFundingReservation(db, lifecycleArgs.lifecycleId, LATER)),
  )
  assert.equal(releases.filter(result => result.releasedNow).length, 1)
  assert.equal(releases.every(result =>
    result.returnTransferCreated === false), true)
  assert.deepEqual(
    { ...sqlite.prepare(
      `SELECT state, transfer_hash
         FROM payment_purchase_funding_reservations
        WHERE lifecycle_id = ?`,
    ).get(lifecycleArgs.lifecycleId) },
    { state: 'released', transfer_hash: null },
  )
})

test('authorization rejects unauthenticated input before D1 and claims one identity', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  const before = db.prepareCount
  assert.deepEqual(await claimAgenticPurchaseAuthorization(db, {
    authenticated: false,
    lifecycleId: lifecycleArgs.lifecycleId,
    providerAuthorizationId: 'authorization_01',
    requestDigest: 'authorization_digest_01',
    amountMinor: approvalArgs.amountMinor,
    decision: 'approved',
    now: NOW,
  }), {
    ok: false,
    code: 'authorization_unauthenticated',
  })
  assert.equal(db.prepareCount, before)

  const args = {
    authenticated: true,
    lifecycleId: lifecycleArgs.lifecycleId,
    providerAuthorizationId: 'authorization_01',
    requestDigest: 'authorization_digest_01',
    amountMinor: approvalArgs.amountMinor,
    decision: 'approved' as const,
    now: NOW,
  }
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      claimAgenticPurchaseAuthorization(db, args)),
  )
  assert.equal(results.filter(result =>
    result.ok && result.reservationCreated).length, 1)
  assert.equal(results.filter(result =>
    result.ok && result.idempotentReplay).length, 99)
  assert.equal(
    sqlite.prepare(
      'SELECT COUNT(*) AS count FROM payment_purchase_authorizations',
    ).get()?.count,
    1,
  )
  assert.deepEqual(await claimAgenticPurchaseAuthorization(db, {
    ...args,
    providerAuthorizationId: 'authorization_02',
    requestDigest: 'authorization_digest_02',
  }), {
    ok: false,
    code: 'authorization_identity_conflict',
  })
})

test('card closure remains pending while local financial state exists and closes once', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  sqlite.prepare(
    `INSERT INTO payment_purchase_cards (
       lifecycle_id, issue_key, card_ref, status, controls_digest,
       disposal_at, closed_at, revision, created_at, updated_at
     ) VALUES (?, 'issue_01', 'card_opaque_01', 'closure_pending',
       'controls_digest_01', ?, NULL, 0, ?, ?)`,
  ).run(lifecycleArgs.lifecycleId, LATER, NOW, NOW)
  await reserveAgenticPurchaseFunding(db, {
    lifecycleId: lifecycleArgs.lifecycleId,
    fundingKey: 'funding_01',
    amountMinor: approvalArgs.amountMinor,
    createdAt: NOW,
  })
  assert.deepEqual(await closeAgenticPurchaseCardWhenSafe(db, {
    lifecycleId: lifecycleArgs.lifecycleId,
    safeToClose: true,
    closedAt: LATER,
  }), {
    ok: false,
    closedNow: false,
    idempotentReplay: false,
    code: 'card_closure_pending',
  })
  await releaseAgenticPurchaseFundingReservation(
    db,
    lifecycleArgs.lifecycleId,
    LATER,
  )
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      closeAgenticPurchaseCardWhenSafe(db, {
        lifecycleId: lifecycleArgs.lifecycleId,
        safeToClose: true,
        closedAt: LATER,
      })),
  )
  assert.equal(results.filter(result => result.closedNow).length, 1)
  assert.equal(results.filter(result =>
    result.ok && result.idempotentReplay).length, 99)
  assert.deepEqual(
    { ...sqlite.prepare(
      'SELECT status, revision FROM payment_purchase_cards WHERE lifecycle_id = ?',
    ).get(lifecycleArgs.lifecycleId) },
    { status: 'closed', revision: 1 },
  )
})

test('Confirmation_Gate blocks every Payment_Call before Human_Confirm_Event', async () => {
  const { sqlite, db } = createDatabase()
  await seedLifecycle(db)
  const request = {
    approvalRef: approvalArgs.approvalRef,
    lifecycleId: approvalArgs.lifecycleId,
    envelopeDigest: approvalArgs.envelopeDigest,
    candidateDigest: approvalArgs.candidateDigest,
    amountMinor: approvalArgs.amountMinor,
    merchantPolicyDigest: approvalArgs.merchantPolicyDigest,
  }

  assert.deepEqual(
    await requireHumanConfirmationForPaymentCall(db, request, LATER),
    { ok: false, code: 'human_confirmation_missing' },
  )
  assert.equal(
    sqlite.prepare(
      'SELECT COUNT(*) AS count FROM payment_purchase_approvals WHERE consumed_at IS NOT NULL',
    ).get()?.count,
    0,
  )

  await registerAgenticPurchaseApproval(db, approvalArgs)
  assert.deepEqual(
    await requireHumanConfirmationForPaymentCall(db, request, LATER),
    {
      ok: true,
      approvalRef: approvalArgs.approvalRef,
      idempotentReplay: false,
      consumedNow: true,
    },
  )
  assert.deepEqual(
    await requireHumanConfirmationForPaymentCall(db, request, LATER),
    {
      ok: true,
      approvalRef: approvalArgs.approvalRef,
      idempotentReplay: true,
      consumedNow: false,
    },
  )
})

test('Issuance_Service fails closed before provider dispatch for cap, confirmation, and closed production boundary', async () => {
  const { db } = createDatabase()
  await seedLifecycle(db)
  const env = {
    TRAVEL_ISSUANCE_MCP_SERVER_KEY: 'straitsx-sandbox',
    TRAVEL_ISSUANCE_MCP_TRANSPORT: 'sse',
    TRAVEL_ISSUANCE_MCP_TOOL_NAME: 'cards.issue',
    TRAVEL_ISSUANCE_RESPONSE_DEADLINE_MS: '30000',
    TRAVEL_ISSUANCE_PER_CARD_CAP_MINOR: '20000',
    TRAVEL_ISSUANCE_CURRENCY: 'SGD',
  }
  const request = {
    approvalRef: approvalArgs.approvalRef,
    lifecycleId: approvalArgs.lifecycleId,
    envelopeDigest: approvalArgs.envelopeDigest,
    candidateDigest: approvalArgs.candidateDigest,
    amountMinor: approvalArgs.amountMinor,
    merchantPolicyDigest: approvalArgs.merchantPolicyDigest,
    transactionId: 'tx_001',
    currency: 'SGD',
  }

  assert.deepEqual(
    await prepareTravelAgencyIssuance({ db, env: { ...env, TRAVEL_ISSUANCE_PER_CARD_CAP_MINOR: '100' }, request, now: LATER }),
    { ok: false, code: 'amount-exceeds-per-card-cap', configuredCapMinor: 100, approvedAmountMinor: approvalArgs.amountMinor },
  )
  assert.deepEqual(
    await prepareTravelAgencyIssuance({ db, env, request, now: LATER }),
    { ok: false, code: 'confirmation-required' },
  )

  await registerAgenticPurchaseApproval(db, approvalArgs)
  assert.deepEqual(
    await prepareTravelAgencyIssuance({ db, env, request, now: LATER }),
    { ok: false, code: 'production-issuance-blocked' },
  )
})

test('Confirmation_Gate rejects malformed or mismatched Payment_Call input before provider dispatch', async () => {
  const { db } = createDatabase()
  await seedLifecycle(db)
  await registerAgenticPurchaseApproval(db, approvalArgs)
  assert.deepEqual(
    await requireHumanConfirmationForPaymentCall(db, { ...approvalArgs, amountMinor: 0 }, LATER),
    { ok: false, code: 'payment_call_invalid' },
  )
  assert.deepEqual(
    await requireHumanConfirmationForPaymentCall(db, {
      approvalRef: approvalArgs.approvalRef,
      lifecycleId: approvalArgs.lifecycleId,
      envelopeDigest: approvalArgs.envelopeDigest,
      candidateDigest: 'changed_candidate',
      amountMinor: approvalArgs.amountMinor,
      merchantPolicyDigest: approvalArgs.merchantPolicyDigest,
    }, LATER),
    { ok: false, code: 'approval_conflict' },
  )
})
