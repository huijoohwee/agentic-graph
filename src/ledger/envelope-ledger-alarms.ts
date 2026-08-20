import { compactReleasedHolds } from './envelope-ledger-records'

export type EnvelopeAlarmStorage = {
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number): Promise<void>
  deleteAlarm(): Promise<void>
}

export function bindEnvelopeAlarmStorage(ctx: DurableObjectState): EnvelopeAlarmStorage {
  return {
    getAlarm: () => ctx.storage.getAlarm(),
    setAlarm: (scheduledTime) => ctx.storage.setAlarm(scheduledTime),
    deleteAlarm: () => ctx.storage.deleteAlarm(),
  }
}

export function releaseExpiredReservations(
  ctx: DurableObjectState,
  now: number,
  preserveCascadeId?: string,
): number {
  const result = preserveCascadeId === undefined
    ? ctx.storage.sql.exec(
        `UPDATE holds SET state = 'released'
         WHERE state = 'reserved' AND quarantined = 0 AND custody_pending = 0
           AND expires_at <= ?`, now,
      )
    : ctx.storage.sql.exec(
        `UPDATE holds SET state = 'released'
         WHERE state = 'reserved' AND quarantined = 0 AND custody_pending = 0 AND expires_at <= ?
           AND NOT (reservation_kind = 'cascade' AND cascade_id = ?)`, now, preserveCascadeId,
      )
  if (result.rowsWritten > 0) compactReleasedHolds(ctx, now)
  return result.rowsWritten
}

export async function scheduleEnvelopeExpiry(
  alarmStorage: EnvelopeAlarmStorage,
  expiresAt: number,
): Promise<void> {
  const current = await alarmStorage.getAlarm()
  if (current == null || expiresAt < current) await alarmStorage.setAlarm(expiresAt)
}

export async function scheduleNextEnvelopeAlarm(
  ctx: DurableObjectState,
  alarmStorage: EnvelopeAlarmStorage,
): Promise<void> {
  const next = ctx.storage.sql.exec<{ expires_at: number | null }>(
    `SELECT MIN(expires_at) AS expires_at FROM holds
     WHERE state = 'reserved' AND quarantined = 0 AND custody_pending = 0`,
  ).one().expires_at
  if (next == null) await alarmStorage.deleteAlarm()
  else await alarmStorage.setAlarm(next)
}

export async function repairEnvelopeAlarm(
  ctx: DurableObjectState,
  alarmStorage: EnvelopeAlarmStorage,
  preferredExpiry?: number,
): Promise<void> {
  try {
    if (preferredExpiry === undefined) await scheduleNextEnvelopeAlarm(ctx, alarmStorage)
    else await scheduleEnvelopeExpiry(alarmStorage, preferredExpiry)
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'envelope expiry alarm scheduling deferred',
      reason: error instanceof Error ? error.message : 'alarm-storage-unavailable',
    }))
  }
}
