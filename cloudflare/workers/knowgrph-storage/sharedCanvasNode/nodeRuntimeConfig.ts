import type { SharedNodeConfig } from './nodeDeltaContract'

export type SharedNodeRuntimeEnv = Record<string, unknown> & {
  SHARED_NODE_MAX_DELTA_BYTES?: unknown
  SHARED_NODE_MAX_PAYLOAD_BYTES?: unknown
  SHARED_NODE_REPLAY_LOG_MAX_ENTRIES?: unknown
}

const parsePositiveInteger = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const parseNonNegativeInteger = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export const resolveSharedNodeConfig = (env: SharedNodeRuntimeEnv): SharedNodeConfig | null => {
  const maxDeltaBytes = parsePositiveInteger(env.SHARED_NODE_MAX_DELTA_BYTES)
  const maxPayloadBytes = parsePositiveInteger(env.SHARED_NODE_MAX_PAYLOAD_BYTES)
  const replayLogMaxEntries = parseNonNegativeInteger(env.SHARED_NODE_REPLAY_LOG_MAX_ENTRIES)
  if (maxDeltaBytes == null || maxPayloadBytes == null || replayLogMaxEntries == null) return null
  return { maxDeltaBytes, maxPayloadBytes, replayLogMaxEntries }
}
