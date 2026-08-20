import { stableJson } from './bundle-runtime'
import type { BundleSeed, Rejection } from './bundle-types'
import { readAnyMeta, readEdges, readLegs } from './bundle-graph-storage'
import { committedPositions, edgeKey, validateSeed } from './bundle-graph-validation'
import { topologicalOrder } from './topo-order'

export async function initializeBundle(
  ctx: DurableObjectState,
  env: TravelCommerceEnv,
  seed: BundleSeed,
): Promise<{ kind: 'initialized' | 'idempotent' } | Rejection> {
  const validation = validateSeed(seed)
  if (validation) return validation
  const topology = topologicalOrder(seed.legs.map((leg) => leg.legId), seed.edges)
  if (!topology.ok) return { kind: 'rejected', reason: topology.reason }
  const fingerprint = seedFingerprint(seed)
  const existing = readAnyMeta(ctx)
  if (existing) {
    if (
      existing.bundle_id !== seed.bundleId
      || existing.principal_id !== seed.principalId
      || existing.total_budget_minor !== seed.totalBudgetMinor
      || (existing.seed_fingerprint !== '' && existing.seed_fingerprint !== fingerprint)
      || (existing.seed_fingerprint === '' && !matchesStoredSeed(ctx, seed))
    ) return { kind: 'rejected', reason: 'bundle-initialization-conflict' }
    if (existing.initialization_state === 'ready' && existing.seed_fingerprint !== '') {
      return { kind: 'idempotent' }
    }
    ctx.storage.sql.exec(
      "UPDATE bundle_meta SET initialization_state = 'pending', seed_fingerprint = ? WHERE bundle_id = ?",
      fingerprint, seed.bundleId,
    )
  } else {
    ctx.storage.transactionSync(() => persistPendingSeed(ctx, seed, topology.order, fingerprint))
  }

  const ledger = env.ENVELOPE_LEDGER.getByName(seed.principalId)
  const seeded = await ledger.init(seed.principalId, seed.totalBudgetMinor, committedPositions(seed))
  if (seeded.kind === 'rejected') {
    clearPendingSeed(ctx, fingerprint)
    return seeded
  }
  const pending = readAnyMeta(ctx)
  if (!pending || pending.seed_fingerprint !== fingerprint) {
    return { kind: 'rejected', reason: 'bundle-initialization-conflict' }
  }
  if (pending.initialization_state === 'ready') return { kind: 'idempotent' }
  ctx.storage.sql.exec(
    "UPDATE bundle_meta SET initialization_state = 'ready' WHERE seed_fingerprint = ?",
    fingerprint,
  )
  return existing ? { kind: 'idempotent' } : { kind: 'initialized' }
}

function persistPendingSeed(
  ctx: DurableObjectState,
  seed: BundleSeed,
  topology: readonly string[],
  fingerprint: string,
): void {
  ctx.storage.sql.exec(
    `INSERT INTO bundle_meta (
      bundle_id, principal_id, total_budget_minor, initialization_state, seed_fingerprint
    ) VALUES (?, ?, ?, 'pending', ?)`,
    seed.bundleId, seed.principalId, seed.totalBudgetMinor, fingerprint,
  )
  for (const leg of seed.legs) {
    ctx.storage.sql.exec(
      `INSERT INTO legs (
        leg_id, principal_id, category, committed_offer_id, committed_amount_minor, last_cascade_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      leg.legId, leg.principalId, leg.category, leg.committedOfferId,
      leg.committedAmountMinor, leg.lastCascadeId,
    )
  }
  for (const edge of seed.edges) {
    ctx.storage.sql.exec(
      'INSERT INTO edges (from_leg_id, to_leg_id) VALUES (?, ?)', edge.fromLegId, edge.toLegId,
    )
  }
  topology.forEach((legId, position) => {
    ctx.storage.sql.exec('INSERT INTO topology (position, leg_id) VALUES (?, ?)', position, legId)
  })
}

function clearPendingSeed(ctx: DurableObjectState, fingerprint: string): void {
  const pending = readAnyMeta(ctx)
  if (pending?.initialization_state !== 'pending' || pending.seed_fingerprint !== fingerprint) return
  ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec('DELETE FROM topology')
    ctx.storage.sql.exec('DELETE FROM edges')
    ctx.storage.sql.exec('DELETE FROM legs')
    ctx.storage.sql.exec('DELETE FROM bundle_meta')
  })
}

function matchesStoredSeed(ctx: DurableObjectState, seed: BundleSeed): boolean {
  return stableJson({ legs: readLegs(ctx), edges: readEdges(ctx) }) === stableJson(normalizedStructure(seed))
}

function seedFingerprint(seed: BundleSeed): string {
  return stableJson({
    bundleId: seed.bundleId,
    principalId: seed.principalId,
    totalBudgetMinor: seed.totalBudgetMinor,
    ...normalizedStructure(seed),
  })
}

function normalizedStructure(seed: BundleSeed) {
  return {
    legs: [...seed.legs].sort((left, right) => left.legId.localeCompare(right.legId)),
    edges: [...seed.edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))),
  }
}
