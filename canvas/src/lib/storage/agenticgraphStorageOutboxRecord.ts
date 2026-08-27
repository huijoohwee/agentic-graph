import { getAgenticGraphStorageDeviceId } from '@/lib/storage/agenticgraphStorageDeviceIdentity'
import {
  buildAgenticGraphStorageOutboxId,
  type AgenticGraphStorageMutation,
  type AgenticGraphStorageOutboxRecord,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import type { QueueAgenticGraphStorageMutationArgs } from '@/lib/storage/agenticgraphStorageClientTypes'
import {
  normalizeString,
  sanitizeMutationRecord,
  sanitizeOutboxRecord,
} from '@/lib/storage/agenticgraphStorageClientSupport'

export type BuildAgenticGraphStorageOutboxRecordArgs = QueueAgenticGraphStorageMutationArgs & {
  deviceId: string
  mutationId: string
  nowMs: number
}

export const buildAgenticGraphStorageOutboxRecord = (
  args: BuildAgenticGraphStorageOutboxRecordArgs,
): AgenticGraphStorageOutboxRecord => {
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
    args.record as AgenticGraphStorageMutation['record'],
  )
  const payload: AgenticGraphStorageMutation = {
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

export const createAgenticGraphStorageOutboxRecord = (
  args: QueueAgenticGraphStorageMutationArgs,
): AgenticGraphStorageOutboxRecord => buildAgenticGraphStorageOutboxRecord({
  ...args,
  deviceId: normalizeString(args.deviceId) || getAgenticGraphStorageDeviceId(),
  mutationId: buildAgenticGraphStorageOutboxId('mut'),
  nowMs: Date.now(),
})

export const rebuildAgenticGraphStorageOutboxRecordForRetry = (args: {
  existingRecord: AgenticGraphStorageOutboxRecord
  mutation: AgenticGraphStorageMutation
  nextBaseRevision: number | null
  nextRecord: AgenticGraphStorageMutation['record']
  nowMs: number
}): AgenticGraphStorageOutboxRecord => {
  const recordId = normalizeString(args.nextRecord.id)
  const payload: AgenticGraphStorageMutation = {
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
