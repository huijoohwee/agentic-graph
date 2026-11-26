import { readDb, normalizeString, type D1DatabaseLike } from './db'

export const D1_BLOB_CHUNK_BYTES = 1024 * 1024
export const D1_BLOB_MAX_OBJECT_BYTES = 16 * 1024 * 1024

type BlobMetadata = { object_key: string; content_type: string; content_hash: string | null; custom_metadata_json: string; size_bytes: number; etag: string; updated_at: string }
type BlobChunk = { chunk_index: number; body: ArrayBuffer | Uint8Array }
type BlobReadRow = BlobMetadata & { chunk_index: number | null; body: ArrayBuffer | Uint8Array | null }

export const readD1BlobDatabase = (env: { DB?: unknown }): D1DatabaseLike | null => {
  const db = readDb(env)
  return db?.batch ? db : null
}

export const readD1BlobRequest = async (request: Request, maxBytes = D1_BLOB_MAX_OBJECT_BYTES) => {
  const rawLength = request.headers.get('content-length')
  if (rawLength !== null && !/^\d+$/.test(rawLength.trim())) return { ok: false as const, reason: 'invalid-length' as const }
  const length = rawLength === null ? null : Number(rawLength)
  if (length !== null && (!Number.isSafeInteger(length) || length < 0)) return { ok: false as const, reason: 'invalid-length' as const }
  if (length !== null && length > maxBytes) return { ok: false as const, reason: 'too-large' as const }
  const bytes = length === null ? null : new Uint8Array(length)
  const reader = request.body?.getReader()
  if (!reader) return length === 0 || length === null
    ? { ok: true as const, body: bytes || new Uint8Array() }
    : { ok: false as const, reason: 'length-mismatch' as const }
  const parts: Uint8Array[] = []
  let offset = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.byteLength > maxBytes) {
        await reader.cancel('D1 blob body exceeds its declared bounded length')
        return { ok: false as const, reason: 'too-large' as const }
      }
      if (length !== null && offset + value.byteLength > length) {
        await reader.cancel('D1 blob body exceeds its declared length')
        return { ok: false as const, reason: 'length-mismatch' as const }
      }
      if (bytes) bytes.set(value, offset)
      else parts.push(value)
      offset += value.byteLength
    }
  } catch {
    return { ok: false as const, reason: 'body-read-failed' as const }
  } finally {
    try { reader.releaseLock() } catch { /* stream already released */ }
  }
  if (length !== null && offset !== length) return { ok: false as const, reason: 'length-mismatch' as const }
  if (bytes) return { ok: true as const, body: bytes }
  const measured = new Uint8Array(offset)
  let cursor = 0
  for (const part of parts) { measured.set(part, cursor); cursor += part.byteLength }
  return { ok: true as const, body: measured }
}

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const payload = new Uint8Array(bytes.byteLength)
  payload.set(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload.buffer))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const writeD1Blob = async (args: {
  db: D1DatabaseLike
  objectKey: string
  body: Uint8Array
  contentType: string
  contentHash: string | null
  customMetadata?: Record<string, string>
  nowMs?: number
}): Promise<{ etag: string; sizeBytes: number; uploadedAtMs: number }> => {
  const { db, objectKey, body } = args
  if (!db.batch) throw new Error('D1 atomic batch unavailable')
  if (body.byteLength > D1_BLOB_MAX_OBJECT_BYTES) throw new Error('D1 blob object limit exceeded')
  const uploadedAtMs = args.nowMs ?? Date.now()
  const etag = await sha256(body)
  const statements = [
    db.prepare('DELETE FROM agentic_graph_d1_blob_chunks WHERE object_key = ?').bind(objectKey),
    db.prepare('DELETE FROM agentic_graph_d1_blob_objects WHERE object_key = ?').bind(objectKey),
    db.prepare(`INSERT INTO agentic_graph_d1_blob_objects
      (object_key, content_type, content_hash, custom_metadata_json, size_bytes, etag, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(objectKey, normalizeString(args.contentType) || 'application/octet-stream', args.contentHash,
        JSON.stringify(args.customMetadata || {}), body.byteLength, etag, new Date(uploadedAtMs).toISOString()),
  ]
  for (let offset = 0, index = 0; offset < body.byteLength; offset += D1_BLOB_CHUNK_BYTES, index += 1) {
    statements.push(db.prepare(`INSERT INTO agentic_graph_d1_blob_chunks (object_key, chunk_index, body)
      VALUES (?, ?, ?)`).bind(objectKey, index, body.slice(offset, Math.min(offset + D1_BLOB_CHUNK_BYTES, body.byteLength))))
  }
  await db.batch(statements)
  return { etag, sizeBytes: body.byteLength, uploadedAtMs }
}

export const readD1Blob = async (db: D1DatabaseLike, objectKey: string, includeBody = true) => {
  const result = includeBody
    ? await db.prepare(`SELECT o.object_key, o.content_type, o.content_hash, o.custom_metadata_json, o.size_bytes, o.etag, o.updated_at,
        c.chunk_index, c.body FROM agentic_graph_d1_blob_objects o
        LEFT JOIN agentic_graph_d1_blob_chunks c ON c.object_key = o.object_key
        WHERE o.object_key = ? ORDER BY c.chunk_index`).bind(objectKey).all<BlobReadRow>()
    : await db.prepare(`SELECT object_key, content_type, content_hash, custom_metadata_json, size_bytes, etag, updated_at,
        NULL AS chunk_index, NULL AS body FROM agentic_graph_d1_blob_objects WHERE object_key = ?`)
      .bind(objectKey).all<BlobReadRow>()
  const rows = result.results || []
  const row = rows[0]
  if (!row) return null
  if (!Number.isSafeInteger(row.size_bytes) || row.size_bytes < 0 || row.size_bytes > D1_BLOB_MAX_OBJECT_BYTES) {
    throw new Error('D1 blob metadata exceeds the bounded object contract')
  }
  let customMetadata: Record<string, string>
  try {
    const value = JSON.parse(row.custom_metadata_json)
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.values(value).some(item => typeof item !== 'string')) throw new Error('invalid metadata')
    customMetadata = value as Record<string, string>
  } catch { throw new Error('D1 blob custom metadata is malformed') }
  const object = { ...row, custom_metadata: customMetadata }
  if (!includeBody) return { object, body: null }
  const chunks: BlobChunk[] = rows.flatMap(row => row.chunk_index === null || row.body === null
    ? [] : [{ chunk_index: row.chunk_index, body: row.body }])
  const expectedCount = Math.ceil(object.size_bytes / D1_BLOB_CHUNK_BYTES)
  if (chunks.length !== expectedCount) throw new Error('D1 blob chunk inventory is incomplete')
  const body = new Uint8Array(object.size_bytes)
  let offset = 0
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    if (chunk.chunk_index !== index) throw new Error('D1 blob chunk sequence is invalid')
    const bytes = chunk.body instanceof Uint8Array ? chunk.body : new Uint8Array(chunk.body)
    if (bytes.byteLength > D1_BLOB_CHUNK_BYTES || offset + bytes.byteLength > body.byteLength) {
      throw new Error('D1 blob chunk exceeds its bounded contract')
    }
    body.set(bytes, offset)
    offset += bytes.byteLength
  }
  if (offset !== object.size_bytes || await sha256(body) !== object.etag) throw new Error('D1 blob readback digest mismatch')
  return { object, body }
}

export const deleteD1Blob = async (db: D1DatabaseLike, objectKey: string): Promise<void> => {
  if (!db.batch) throw new Error('D1 atomic batch unavailable')
  await db.batch([
    db.prepare('DELETE FROM agentic_graph_d1_blob_chunks WHERE object_key = ?').bind(objectKey),
    db.prepare('DELETE FROM agentic_graph_d1_blob_objects WHERE object_key = ?').bind(objectKey),
  ])
}
