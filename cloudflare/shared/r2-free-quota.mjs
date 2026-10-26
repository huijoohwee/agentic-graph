import { sha256JsonDigest } from 'agentic-os/context/json'

const TABLE = 'agentic_graph_r2_free_quota'
const SCOPE = 'agentic-graph-r2-free-quota-v1'
const EVIDENCE_SCHEMA = 'agentic-os/verified-effect-cost-evidence/v1'
const RELEASE_SQL = `UPDATE ${TABLE}
  SET uploaded_bytes_lifetime = uploaded_bytes_lifetime - ?, updated_at = ?
  WHERE scope_id = ? AND uploaded_bytes_lifetime >= ?
  RETURNING uploaded_bytes_lifetime`
const RESERVE_SQL = `
  INSERT INTO ${TABLE} (
    scope_id, month_key, day_key, class_a_used, class_b_used,
    uploaded_bytes_lifetime, daily_reservations, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(scope_id) DO UPDATE SET
    month_key = excluded.month_key,
    day_key = excluded.day_key,
    class_a_used = CASE WHEN ${TABLE}.month_key = excluded.month_key
      THEN ${TABLE}.class_a_used + excluded.class_a_used ELSE excluded.class_a_used END,
    class_b_used = CASE WHEN ${TABLE}.month_key = excluded.month_key
      THEN ${TABLE}.class_b_used + excluded.class_b_used ELSE excluded.class_b_used END,
    uploaded_bytes_lifetime = ${TABLE}.uploaded_bytes_lifetime + excluded.uploaded_bytes_lifetime,
    daily_reservations = CASE WHEN ${TABLE}.day_key = excluded.day_key
      THEN ${TABLE}.daily_reservations + 1 ELSE 1 END,
    updated_at = excluded.updated_at
  WHERE
    (CASE WHEN ${TABLE}.month_key = excluded.month_key
      THEN ${TABLE}.class_a_used + excluded.class_a_used ELSE excluded.class_a_used END) <= ?
    AND (CASE WHEN ${TABLE}.month_key = excluded.month_key
      THEN ${TABLE}.class_b_used + excluded.class_b_used ELSE excluded.class_b_used END) <= ?
    AND ${TABLE}.uploaded_bytes_lifetime + excluded.uploaded_bytes_lifetime <= ?
    AND (CASE WHEN ${TABLE}.day_key = excluded.day_key
      THEN ${TABLE}.daily_reservations + 1 ELSE 1 END) <= ?
  RETURNING class_a_used, class_b_used, uploaded_bytes_lifetime, daily_reservations
`

export const R2_FREE_QUOTA_LIMITS = Object.freeze({
  classA: 50_000,
  classB: 500_000,
  uploadedBytesLifetime: 500_000_000,
  reservationsPerDay: 5_000,
})
export const R2_FREE_QUOTA_MAX_STREAM_BYTES = 100 * 1024 * 1024

const BILLABLE_CLASSES = Object.freeze({
  get: 'classB', head: 'classB',
  put: 'classA', list: 'classA', createMultipartUpload: 'classA',
  uploadPart: 'classA', complete: 'classA', resumeMultipartUpload: null,
  delete: null, abort: null,
})

function operationCost({ method, args, key }, maxStreamBytes) {
  if (!Object.hasOwn(BILLABLE_CLASSES, method)) throw new Error('R2 operation has no Free quota classification.')
  const quotaClass = BILLABLE_CLASSES[method]
  const options = method === 'put' ? args[2] : method === 'createMultipartUpload' ? args[1] : null
  if (options?.storageClass !== undefined && options.storageClass !== 'Standard') {
    throw new Error('R2 Infrequent Access is outside the Free quota and is blocked.')
  }
  const storageClassPreflight = ['get', 'put', 'createMultipartUpload', 'delete', 'complete'].includes(method)
  if (storageClassPreflight && (typeof key !== 'string' || !key)) {
    throw new Error('R2 object key is required for the Standard storage preflight.')
  }
  const body = method === 'put' ? args[1] : method === 'uploadPart' ? args[1] : null
  const bodyBytes = bodySummary(body).bytes
  const reservedBytes = body ? bodyBytes ?? maxStreamBytes : 0
  if (!Number.isSafeInteger(reservedBytes) || reservedBytes < 0) {
    throw new Error('R2 upload size is unknown; Free quota reservation is blocked.')
  }
  return {
    classA: quotaClass === 'classA' ? 1 : 0,
    classB: (quotaClass === 'classB' ? 1 : 0) + (storageClassPreflight ? 1 : 0),
    bytes: reservedBytes,
  }
}

export function createR2FreeQuotaVerifier(database, {
  now = Date.now, limits = R2_FREE_QUOTA_LIMITS, maxStreamBytes = R2_FREE_QUOTA_MAX_STREAM_BYTES,
} = {}) {
  if (!database || typeof database.prepare !== 'function') throw new TypeError('A shared D1 quota ledger is required.')
  limits = { ...R2_FREE_QUOTA_LIMITS, ...limits }
  for (const key of Object.keys(R2_FREE_QUOTA_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > R2_FREE_QUOTA_LIMITS[key]) {
      throw new TypeError(`R2 Free quota limit ${key} is invalid.`)
    }
  }
  if (!Number.isSafeInteger(maxStreamBytes) || maxStreamBytes < 1
    || maxStreamBytes > R2_FREE_QUOTA_MAX_STREAM_BYTES) throw new TypeError('R2 Free quota stream limit is invalid.')
  const pendingStreamReservations = new Map()
  return Object.freeze({ maxStreamBytes, async verify(request, operation) {
      const cost = operationCost(operation, maxStreamBytes)
      if (cost.classA > limits.classA || cost.classB > limits.classB
        || cost.bytes > limits.uploadedBytesLifetime) {
        throw new Error('R2 operation exceeds its Free quota allocation and is blocked.')
      }
      const instant = now()
      if (!Number.isSafeInteger(instant) || instant < 0) throw new TypeError('R2 Free quota clock is invalid.')
      const date = new Date(instant).toISOString()
      const month = date.slice(0, 7)
      const day = date.slice(0, 10)
      let reservation
      try {
        reservation = await database.prepare(RESERVE_SQL).bind(
          SCOPE, month, day, cost.classA, cost.classB, cost.bytes, date,
          limits.classA, limits.classB, limits.uploadedBytesLifetime, limits.reservationsPerDay,
        ).first()
      } catch {
        throw new Error('R2 Free quota ledger is unavailable; operation is blocked.')
      }
      if (!reservation) throw new Error('R2 Free quota allocation is exhausted; operation is blocked.')
      if (bodySummary(operation.method === 'put' ? operation.args[1]
        : operation.method === 'uploadPart' ? operation.args[1] : null).bytes === null) {
        const pending = pendingStreamReservations.get(request.scopeDigest) ?? []
        pending.push(cost.bytes)
        pendingStreamReservations.set(request.scopeDigest, pending)
      }
      const evidenceDigest = await sha256JsonDigest({
        scopeId: SCOPE, scopeDigest: request.scopeDigest, requestDigest: request.requestDigest,
        method: operation.method, bytes: cost.bytes, maxStreamBytes, month, day, limits, reservation,
      })
      return {
        schema: EVIDENCE_SCHEMA,
        status: 'verified-zero-cost',
        provider: 'cloudflare-r2',
        mode: 'free-fail-closed',
        billingPlan: 'free',
        providerHardCapUsd: null,
        quotaExhaustion: 'deny',
        paidPlanActive: false,
        addOnsActive: false,
        overagesEnabled: false,
        autoUpgradeEnabled: false,
        evidenceDigest,
        scopeDigest: request.scopeDigest,
        verifiedAt: date,
        expiresAt: new Date(instant + 30_000).toISOString(),
      }
    }, async release(scopeDigest, actualBytes) {
      const pending = pendingStreamReservations.get(scopeDigest)
      const reservedBytes = pending?.shift()
      if (pending?.length === 0) pendingStreamReservations.delete(scopeDigest)
      if (!Number.isSafeInteger(actualBytes) || actualBytes < 0 || reservedBytes === undefined
        || actualBytes > reservedBytes) return false
      const unused = reservedBytes - actualBytes
      if (unused === 0) return true
      const instant = now()
      if (!Number.isSafeInteger(instant) || instant < 0) return false
      try {
        const released = await database.prepare(RELEASE_SQL).bind(
          unused, new Date(instant).toISOString(), SCOPE, unused,
        ).first()
        return Boolean(released)
      } catch {
        return false
      }
    } })
}

function bodySummary(value) {
  if (value == null) return { bytes: 0 }
  if (typeof value === 'string') return { bytes: new TextEncoder().encode(value).byteLength }
  if (value instanceof ArrayBuffer) return { bytes: value.byteLength }
  if (ArrayBuffer.isView(value)) return { bytes: value.byteLength }
  if (typeof Blob !== 'undefined' && value instanceof Blob) return { bytes: value.size }
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return { bytes: null }
  return { bytes: Number.isSafeInteger(value?.size) ? value.size : null }
}
