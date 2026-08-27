import { getKnowgrphStorageDeviceId } from '@/lib/storage/knowgrphStorageDeviceIdentity'
import {
  buildKnowgrphStorageOutboxId,
  type KnowgrphStorageMutation,
  type KnowgrphStorageOutboxRecord,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { QueueKnowgrphStorageMutationArgs } from '@/lib/storage/knowgrphStorageClientTypes'
import {
  normalizeString,
  sanitizeMutationRecord,
  sanitizeOutboxRecord,
} from '@/lib/storage/knowgrphStorageClientSupport'

export type BuildKnowgrphStorageOutboxRecordArgs = QueueKnowgrphStorageMutationArgs & {
  deviceId: string
  mutationId: string
  nowMs: number
}

export const buildKnowgrphStorageOutboxRecord = (
  args: BuildKnowgrphStorageOutboxRecordArgs,
): KnowgrphStorageOutboxRecord => {
  const workspaceId = normalizeString(args.workspaceId)
  if (!workspaceId) throw new Error('workspaceId is required to queue a storage mutation')
  const deviceId = normalizeString(args.deviceId)
  if (!deviceId) throw new Error('deviceId is required to queue a storage mutation')
  const mutationId = normalizeString(args.mutationId)
  if (!mutationId) throw new Error('mutationId is required to queue a storage mutation')
  const recordId = normalizeString(args.recordId) || normalizeString(args.record.id)
  if (!recordId) throw new Error('recordId is required to queue a storage mutation')
  const record = sanitizeMutationRecord(
    args.entity,
    args.record as KnowgrphStorageMutation['record'],
  )
  const payload: KnowgrphStorageMutation = {
    mutationId,
    workspaceId,
    entity: args.entity,
    op: args.op,
    recordId,
    baseRevision: args.baseRevision ?? null,
    record: record as never,
  }
  return sanitizeOutboxRecord({
    id: mutationId,
    workspaceId,
    deviceId,
    entity: args.entity,
    op: args.op,
    recordId,
    baseRevision: args.baseRevision ?? null,
    payload: payload as unknown as Record<string, unknown>,
    payloadHash: '',
    attemptCount: 0,
    lastAckStatus: '',
    lastAckMessage: null,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
  })
}

export const createKnowgrphStorageOutboxRecord = (
  args: QueueKnowgrphStorageMutationArgs,
): KnowgrphStorageOutboxRecord => buildKnowgrphStorageOutboxRecord({
  ...args,
  deviceId: normalizeString(args.deviceId) || getKnowgrphStorageDeviceId(),
  mutationId: buildKnowgrphStorageOutboxId('mut'),
  nowMs: Date.now(),
})

export const rebuildKnowgrphStorageOutboxRecordForRetry = (args: {
  existingRecord: KnowgrphStorageOutboxRecord
  mutation: KnowgrphStorageMutation
  nextBaseRevision: number | null
  nextRecord: KnowgrphStorageMutation['record']
  nowMs: number
}): KnowgrphStorageOutboxRecord => {
  const recordId = normalizeString(args.nextRecord.id)
  const payload: KnowgrphStorageMutation = {
    ...args.mutation,
    recordId,
    baseRevision: args.nextBaseRevision,
    record: args.nextRecord as never,
  }
  return sanitizeOutboxRecord({
    ...args.existingRecord,
    entity: payload.entity,
    op: payload.op,
    recordId,
    baseRevision: args.nextBaseRevision,
    payload: payload as unknown as Record<string, unknown>,
    payloadHash: '',
    attemptCount: 0,
    lastAckStatus: '',
    lastAckMessage: null,
    updatedAtMs: args.nowMs,
  })
}
