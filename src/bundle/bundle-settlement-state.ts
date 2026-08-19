import { CASCADE_RECOVERY_DELAY_MS, isIdentifier } from './bundle-runtime'
import type { CascadeRecord, Rejection } from './bundle-types'
import type { SettlementClaimRow } from './bundle-graph-records'
import { appendSessionLog } from './bundle-graph-observability'
import { readCascade, scheduleNextAlarm, updateCascade } from './bundle-graph-storage'

export type SettlementClaimResult =
  Readonly<{ kind: 'claimed' | 'busy' | 'not-required'; expiresAt?: number }> | Rejection

export function claimSettlement(
  ctx: DurableObjectState,
  cascadeId: string,
  owner: string,
  now: number,
  leaseMs: number,
): SettlementClaimResult {
  const record = readCascade(ctx, cascadeId)
  if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (!isIdentifier(owner) || !Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 60_000) {
    return { kind: 'rejected', reason: 'settlement-claim-malformed' }
  }
  if (record.netAmountMinor === 0 || record.phase === 'finalizing' || record.outcome) {
    return { kind: 'not-required' }
  }
  if (record.phase !== 'settlement_pending' && record.phase !== 'settling') {
    return { kind: 'rejected', reason: 'cascade-not-settleable' }
  }
  const current = readClaim(ctx, cascadeId)
  if (current && current.owner !== owner && current.expires_at > now) {
    const next = Object.freeze({ ...record, updatedAt: now, nextRecoveryAt: current.expires_at })
    ctx.storage.transactionSync(() => {
      updateCascade(ctx, next)
      appendSessionLog(ctx, next, 'settlement-claim-busy', null, now)
    })
    ctx.waitUntil(scheduleNextAlarm(ctx))
    return { kind: 'busy', expiresAt: current.expires_at }
  }
  const expiresAt = now + leaseMs
  const next = Object.freeze({ ...record, phase: 'settling' as const, updatedAt: now, nextRecoveryAt: expiresAt })
  ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec(
      `INSERT INTO settlement_claims (cascade_id, owner, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(cascade_id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`,
      cascadeId, owner, expiresAt,
    )
    updateCascade(ctx, next)
  })
  ctx.waitUntil(scheduleNextAlarm(ctx))
  return { kind: 'claimed', expiresAt }
}

export function recordSettlementAttempt(
  ctx: DurableObjectState,
  cascadeId: string,
  owner: string,
  now: number,
): CascadeRecord | Rejection {
  const claim = readClaim(ctx, cascadeId)
  if (!claim || claim.owner !== owner) return { kind: 'rejected', reason: 'settlement-claim-lost' }
  const record = readCascade(ctx, cascadeId)
  if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (record.phase !== 'settling') return { kind: 'rejected', reason: 'cascade-not-settling' }
  const next = Object.freeze({
    ...record, settlementAttempts: record.settlementAttempts + 1, updatedAt: now,
  })
  ctx.storage.transactionSync(() => {
    updateCascade(ctx, next)
    appendSessionLog(ctx, next, 'settlement-attempted', null, now)
  })
  return next
}

export function markSettlementComplete(
  ctx: DurableObjectState,
  cascadeId: string,
  owner: string,
  now: number,
): CascadeRecord | Rejection {
  const claim = readClaim(ctx, cascadeId)
  if (!claim || claim.owner !== owner) return { kind: 'rejected', reason: 'settlement-claim-lost' }
  const record = readCascade(ctx, cascadeId)
  if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (record.phase !== 'settling') return { kind: 'rejected', reason: 'cascade-not-settling' }
  if (record.netAmountMinor !== 0 && record.settlementAttempts === 0) {
    return { kind: 'rejected', reason: 'settlement-not-attempted' }
  }
  const next = Object.freeze({
    ...record, phase: 'finalizing' as const, updatedAt: now,
    nextRecoveryAt: now + CASCADE_RECOVERY_DELAY_MS,
  })
  ctx.storage.transactionSync(() => {
    updateCascade(ctx, next)
    ctx.storage.sql.exec('DELETE FROM settlement_claims WHERE cascade_id = ?', cascadeId)
  })
  ctx.waitUntil(scheduleNextAlarm(ctx))
  return next
}

function readClaim(ctx: DurableObjectState, cascadeId: string): SettlementClaimRow | undefined {
  return ctx.storage.sql.exec<SettlementClaimRow>(
    'SELECT owner, expires_at FROM settlement_claims WHERE cascade_id = ?', cascadeId,
  ).toArray()[0]
}
