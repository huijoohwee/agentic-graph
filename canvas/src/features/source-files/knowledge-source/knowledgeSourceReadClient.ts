import {
  buildAgenticGraphStorageAbsoluteUrl,
} from '@/lib/storage/agentic-graph-storage-chat-client'
import { readEnvString } from '@/lib/config.env'
import { AGENTIC_OS_SOURCE_IMPORT_LIMITS } from '@/lib/storage/agentic-graph-storage-bounds'
import {
  AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
  buildAgenticGraphKnowledgeSourceReadPath,
  type AgenticGraphKnowledgeSourceSnapshotEnvelope,
  verifyKnowledgeSourceSnapshotEnvelopeDigests,
} from '@/lib/storage/agentic-graph-storage-sync-contract'

export type KnowledgeSourceReadHandoff = {
  sourceId: string
  token: string
}

export type KnowledgeSourceReadConfig = {
  baseUrl: string
  workspaceId: string
}

export type KnowledgeSourceReadClientResult =
  | { ok: true; envelope: AgenticGraphKnowledgeSourceSnapshotEnvelope }
  | {
      ok: false
      code: 'not_configured' | 'invalid_handoff' | 'blocked' | 'request_failed' | 'invalid_response'
      error: string
      retryable: boolean
    }

const RESPONSE_BYTE_LIMIT = AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes + 1_048_576
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i
const BLOCKED_RESPONSE_CODES = new Set([
  'auth_required',
  'membership_forbidden',
  'identity_unresolved',
  'identity_not_available',
  'resources_unresolved',
  'source_not_allowlisted',
  'source_config_drift',
  'provider_auth_failed',
])
const RETRYABLE_RESPONSE_CODES = new Set(['rate_limited', 'timeout', 'upstream_unavailable'])

const normalizeString = (value: unknown): string => String(value || '').trim()

const isValidHandoff = (handoff: KnowledgeSourceReadHandoff): boolean => {
  const sourceId = normalizeString(handoff.sourceId)
  const token = normalizeString(handoff.token)
  return (
    SOURCE_ID_PATTERN.test(sourceId)
    && token.length > 0
    && token.length <= 16_384
    && !/\s/.test(token)
  )
}

const readKnowledgeSourceConfig = (): KnowledgeSourceReadConfig | null => {
  const baseUrl = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', ''))
  const workspaceId = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID', ''))
  return baseUrl && workspaceId ? { baseUrl, workspaceId } : null
}

type BoundedResponseTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

const cancelOversizedResponse = async (
  controller: AbortController,
  body: ReadableStream<Uint8Array> | null,
): Promise<BoundedResponseTextResult> => {
  controller.abort()
  await body?.cancel().catch(() => undefined)
  return { ok: false, error: 'Knowledge-source response exceeds the import limit.' }
}

const readBoundedResponseText = async (
  response: Response,
  controller: AbortController,
): Promise<BoundedResponseTextResult> => {
  const declaredHeader = response.headers.get('content-length')
  if (declaredHeader != null) {
    const normalized = declaredHeader.trim()
    const declaredBytes = Number(normalized)
    if (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(declaredBytes)) {
      controller.abort()
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: 'Knowledge-source response has an invalid byte length.' }
    }
    if (declaredBytes > RESPONSE_BYTE_LIMIT) {
      return await cancelOversizedResponse(controller, response.body)
    }
  }
  if (!response.body) return { ok: true, text: '' }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const chunks: string[] = []
  let receivedBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      receivedBytes += result.value.byteLength
      if (receivedBytes > RESPONSE_BYTE_LIMIT) {
        controller.abort()
        await reader.cancel().catch(() => undefined)
        return { ok: false, error: 'Knowledge-source response exceeds the import limit.' }
      }
      chunks.push(decoder.decode(result.value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return { ok: true, text: chunks.join('') }
  } catch (error) {
    controller.abort()
    await reader.cancel().catch(() => undefined)
    if (error instanceof TypeError) {
      return { ok: false, error: 'Knowledge-source response is not valid UTF-8.' }
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

const parseResponseJson = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const hasOnlyKeys = (value: Record<string, unknown>, allowedKeys: readonly string[]): boolean => {
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every(key => allowed.has(key))
}

const hasValidCounts = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return ['pages', 'fields', 'records', 'documents', 'bytes'].every(key => (
    Number.isSafeInteger(record[key]) && Number(record[key]) >= 0
  ))
}

const isBoundedString = (value: unknown, maxLength: number, allowEmpty = false): value is string => (
  typeof value === 'string'
  && value.length <= maxLength
  && (allowEmpty || value.length > 0)
)

const hasValidBaseSnapshot = (snapshot: Record<string, unknown>): boolean => {
  if (!Array.isArray(snapshot.fields) || snapshot.fields.length > 1_000) return false
  if (!Array.isArray(snapshot.records) || snapshot.records.length > 2_000) return false
  const labelsValid = ['baseTitle', 'tableName', 'viewName'].every(key => (
    snapshot[key] === null || isBoundedString(snapshot[key], 1_000, true)
  ))
  if (!labelsValid) return false
  const fieldsValid = snapshot.fields.every(field => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return false
    const value = field as Record<string, unknown>
    return (
      hasOnlyKeys(value, ['name', 'type', 'isPrimary'])
      && isBoundedString(value.name, 512)
      && (value.type === null || isBoundedString(value.type, 128, true))
      && typeof value.isPrimary === 'boolean'
    )
  })
  if (!fieldsValid) return false
  return snapshot.records.every(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false
    const value = record as Record<string, unknown>
    if (!hasOnlyKeys(value, ['title', 'fields'])) return false
    if (value.title !== null && !isBoundedString(value.title, 1_000, true)) return false
    if (!value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)) return false
    return Object.keys(value.fields as Record<string, unknown>).length <= 1_000
  })
}

const hasValidSnapshot = (value: Record<string, unknown>): boolean => {
  const snapshot = value.snapshot as Record<string, unknown>
  if (snapshot.type === 'base') {
    return (
      value.kind === 'base'
      && hasOnlyKeys(snapshot, ['type', 'baseTitle', 'tableName', 'viewName', 'fields', 'records'])
      && hasValidBaseSnapshot(snapshot)
    )
  }
  return (
    snapshot.type === 'document'
    && hasOnlyKeys(snapshot, ['type', 'name', 'title', 'text', 'contentType'])
    && (value.kind === 'wiki' || value.kind === 'doc')
    && isBoundedString(snapshot.name, 255)
    && (snapshot.title === null || isBoundedString(snapshot.title, 1_000, true))
    && typeof snapshot.text === 'string'
    && new TextEncoder().encode(snapshot.text).byteLength <= AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes
    && snapshot.contentType === 'text/plain'
  )
}

const hasConsistentCounts = (value: Record<string, unknown>): boolean => {
  const counts = value.counts as Record<string, number>
  const snapshot = value.snapshot as Record<string, unknown>
  if (snapshot.type === 'base') {
    return (
      counts.pages >= 2
      && counts.pages <= 20
      && counts.fields === (snapshot.fields as unknown[]).length
      && counts.records === (snapshot.records as unknown[]).length
      && counts.documents === 0
      && counts.bytes <= AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes
    )
  }
  return (
    counts.pages === (value.kind === 'wiki' ? 2 : 1)
    && counts.fields === 0
    && counts.records === 0
    && counts.documents === 1
    && counts.bytes <= AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes
  )
}

const isSnapshotEnvelope = (
  value: Record<string, unknown> | null,
  expectedSourceId: string,
): value is AgenticGraphKnowledgeSourceSnapshotEnvelope => (
  !!value
  && hasOnlyKeys(value, [
    'ok',
    'apiVersion',
    'schema',
    'complete',
    'provider',
    'kind',
    'sourceId',
    'identityMode',
    'allowlistRevision',
    'allowlistDigest',
    'providerRevision',
    'fetchedAt',
    'counts',
    'contentDigest',
    'envelopeDigest',
    'snapshot',
    'warnings',
  ])
  && value.ok === true
  && value.apiVersion === AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION
  && value.schema === 'agentic-graph-knowledge-source-snapshot/v1'
  && value.complete === true
  && value.provider === 'lark'
  && value.sourceId === expectedSourceId
  && (value.kind === 'base' || value.kind === 'wiki' || value.kind === 'doc')
  && !!value.snapshot
  && typeof value.snapshot === 'object'
  && !Array.isArray(value.snapshot)
  && (value.identityMode === 'tenant-app' || value.identityMode === 'user-oauth')
  && isBoundedString(value.allowlistRevision, 512)
  && typeof value.allowlistDigest === 'string' && SHA256_DIGEST_PATTERN.test(value.allowlistDigest)
  && (value.providerRevision === null || isBoundedString(value.providerRevision, 512, true))
  && isBoundedString(value.fetchedAt, 64)
  && Number.isFinite(Date.parse(value.fetchedAt))
  && typeof value.contentDigest === 'string' && SHA256_DIGEST_PATTERN.test(value.contentDigest)
  && typeof value.envelopeDigest === 'string' && SHA256_DIGEST_PATTERN.test(value.envelopeDigest)
  && Array.isArray(value.warnings)
  && value.warnings.length <= 100
  && value.warnings.every(warning => isBoundedString(warning, 1_000, true))
  && hasValidCounts(value.counts)
  && hasValidSnapshot(value)
  && hasConsistentCounts(value)
)

const buildFailure = (status: number, value: Record<string, unknown> | null): KnowledgeSourceReadClientResult => {
  const code = normalizeString(value?.code).toLowerCase()
  const blocked = BLOCKED_RESPONSE_CODES.has(code) || code.includes('blocked') || code.includes('not_configured')
  return blocked
    ? {
        ok: false,
        code: 'blocked',
        error: 'The configured Lark knowledge source is not ready.',
        retryable: false,
      }
    : {
        ok: false,
        code: 'request_failed',
        error: `Knowledge-source read failed (${status}).`,
        retryable: value?.retryable === true || RETRYABLE_RESPONSE_CODES.has(code),
      }
}

export async function readKnowledgeSourceSnapshot(args: {
  handoff: KnowledgeSourceReadHandoff
  config?: KnowledgeSourceReadConfig | null
  fetchFn?: typeof fetch
}): Promise<KnowledgeSourceReadClientResult> {
  if (!isValidHandoff(args.handoff)) {
    return { ok: false, code: 'invalid_handoff', error: 'Knowledge-source handoff is invalid.', retryable: false }
  }
  const config = args.config === undefined ? readKnowledgeSourceConfig() : args.config
  if (!config) {
    return { ok: false, code: 'not_configured', error: 'Authenticated agentic-graph storage is not configured.', retryable: false }
  }
  const url = buildAgenticGraphStorageAbsoluteUrl(config.baseUrl, buildAgenticGraphKnowledgeSourceReadPath())
  if (!url) return { ok: false, code: 'not_configured', error: 'agentic-graph storage URL is invalid.', retryable: false }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AGENTIC_OS_SOURCE_IMPORT_LIMITS.urlTimeoutMs)
  try {
    const response = await (args.fetchFn || fetch)(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
        workspaceId: config.workspaceId,
        sourceId: args.handoff.sourceId,
        token: args.handoff.token,
      }),
      signal: controller.signal,
    })
    const responseText = await readBoundedResponseText(response, controller)
    if (responseText.ok === false) {
      return { ok: false, code: 'invalid_response', error: responseText.error, retryable: false }
    }
    const body = parseResponseJson(responseText.text)
    if (!response.ok) return buildFailure(response.status, body)
    if (!isSnapshotEnvelope(body, args.handoff.sourceId)) {
      return { ok: false, code: 'invalid_response', error: 'Knowledge-source response failed validation.', retryable: false }
    }
    if (!await verifyKnowledgeSourceSnapshotEnvelopeDigests(body)) {
      return { ok: false, code: 'invalid_response', error: 'Knowledge-source response failed integrity verification.', retryable: false }
    }
    return { ok: true, envelope: body }
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
    return {
      ok: false,
      code: 'request_failed',
      error: timedOut ? 'Knowledge-source read timed out.' : 'Knowledge-source read failed.',
      retryable: true,
    }
  } finally {
    clearTimeout(timeout)
  }
}
