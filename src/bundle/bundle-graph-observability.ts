import type { CascadeRecord, RuntimeCascadeOutcome } from './bundle-types'

export type SessionLogEntry = Readonly<Record<string, string | number | null>>
export type CostLogEntry = Readonly<Record<string, string | number>>

export function readSessionLog(ctx: DurableObjectState): readonly SessionLogEntry[] {
  return ctx.storage.sql.exec<{
    cascade_id: string; bundle_id: string; event_type: string; changed_leg_id: string; affected_json: string
    outcome: string | null; reason: string | null; recorded_at: number
  }>(
    `SELECT cascade_id, bundle_id, event_type, changed_leg_id, affected_json, outcome, reason, recorded_at
     FROM session_log ORDER BY seq`,
  ).toArray().map((row) => Object.freeze({
    cascadeId: row.cascade_id, bundleId: row.bundle_id,
    eventType: row.event_type, changedLegId: row.changed_leg_id,
    affected: row.affected_json, outcome: row.outcome, reason: row.reason, recordedAt: row.recorded_at,
  }))
}

export function readCostLog(ctx: DurableObjectState): readonly CostLogEntry[] {
  return ctx.storage.sql.exec<{
    cascade_id: string; component: string; prompt_tokens: number; completion_tokens: number
    dollar_cost: number; recorded_at: number
  }>(
    `SELECT cascade_id, component, prompt_tokens, completion_tokens, dollar_cost, recorded_at
     FROM cost_log ORDER BY seq`,
  ).toArray().map((row) => Object.freeze({
    cascadeId: row.cascade_id, component: row.component, promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens, dollarCost: row.dollar_cost, recordedAt: row.recorded_at,
  }))
}

export function appendSessionLog(
  ctx: DurableObjectState,
  record: CascadeRecord,
  eventType: string,
  reason: string | null,
  now: number,
): void {
  ctx.storage.sql.exec(
    `INSERT INTO session_log (
      cascade_id, bundle_id, event_type, changed_leg_id, affected_json, outcome, reason, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cascade_id) DO UPDATE SET
      bundle_id = excluded.bundle_id, event_type = excluded.event_type,
      changed_leg_id = excluded.changed_leg_id, affected_json = excluded.affected_json,
      outcome = excluded.outcome, reason = excluded.reason, recorded_at = excluded.recorded_at`,
    record.cascadeId, record.bundleId, eventType, record.changedLegId,
    JSON.stringify(record.affected), record.outcome?.kind ?? null, reason, now,
  )
}

export function appendCostLog(
  ctx: DurableObjectState,
  cascadeId: string,
  component: string,
  promptTokens: number,
  completionTokens: number,
  dollarCost: number,
  now: number,
): void {
  ctx.storage.sql.exec(
    `INSERT INTO cost_log (
      cascade_id, component, prompt_tokens, completion_tokens, dollar_cost, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cascade_id, component) DO UPDATE SET
      prompt_tokens = excluded.prompt_tokens, completion_tokens = excluded.completion_tokens,
      dollar_cost = excluded.dollar_cost, recorded_at = excluded.recorded_at`,
    cascadeId, component, promptTokens, completionTokens, dollarCost, now,
  )
}

export function broadcast(ctx: DurableObjectState, outcome: RuntimeCascadeOutcome): void {
  const message = JSON.stringify({ type: 'cascade-outcome', outcome })
  for (const socket of ctx.getWebSockets()) {
    try { socket.send(message) } catch { socket.close(1011, 'delivery-failed') }
  }
}
