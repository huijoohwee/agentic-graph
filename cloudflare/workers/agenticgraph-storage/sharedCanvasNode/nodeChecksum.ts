import * as Y from 'yjs'
import {
  formatCollaborationJson,
  serializeCollaborationYDoc,
} from '../../../../grph-shared/src/collaboration/yjsSnapshot'

export const NODE_CHECKSUM_EXCLUDED_FIELDS = Object.freeze([
  'viewerSide',
  'viewerMembershipId',
  'subscriptionId',
  'servedAtMs',
  'remainingWindowSeconds',
  'activePeerCount',
])

const EXCLUDED_FIELD_SET = new Set<string>(NODE_CHECKSUM_EXCLUDED_FIELDS)

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const omitDeep = (value: unknown): JsonValue => {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(item => omitDeep(item))
  if (!isRecord(value)) return null
  const out: Record<string, JsonValue> = {}
  for (const key of Object.keys(value).sort()) {
    if (!EXCLUDED_FIELD_SET.has(key)) out[key] = omitDeep(value[key])
  }
  return out
}

export const canonicalizeSharedCanvasNodePayload = (payload: unknown): string =>
  formatCollaborationJson(omitDeep(payload))

export const canonicalizeSharedCanvasYDoc = (doc: Y.Doc): string =>
  canonicalizeSharedCanvasNodePayload(JSON.parse(serializeCollaborationYDoc({
    doc,
    documentKind: 'json',
  })))

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const computeSharedCanvasNodeChecksum = async (doc: Y.Doc): Promise<string> =>
  sha256Hex(canonicalizeSharedCanvasYDoc(doc))
