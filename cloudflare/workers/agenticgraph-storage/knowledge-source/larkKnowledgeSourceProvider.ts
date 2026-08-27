import type {
  AgenticGraphKnowledgeSourceBaseSnapshot,
  AgenticGraphKnowledgeSourceDocumentSnapshot,
} from '../contract'
import {
  discardStorageRelayResponse,
  readStorageRelayJsonResponse,
  type StorageRelayOperation,
} from '../storage-relay/storageRelaySafety'
import {
  KnowledgeSourceError,
  isKnowledgeSourceRecord,
  readKnowledgeSourceText,
  type KnowledgeSourceProvider,
  type KnowledgeSourceReadResult,
  type LarkBaseKnowledgeSourceRegistration,
  type LarkDocKnowledgeSourceRegistration,
  type LarkWikiKnowledgeSourceRegistration,
} from './knowledgeSourceContract'
import type { LarkAccessTokenSource } from './larkAccessToken'

const LARK_API_ORIGIN = 'https://open.larksuite.com'
const MAX_PAGES = 10
const MAX_BASE_FIELDS = 1_000
const MAX_BASE_RECORDS = 2_000
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
const MAX_FIELD_VALUE_DEPTH = 8
const MAX_FIELD_VALUE_ENTRIES = 10_000
const MAX_FIELD_VALUE_STRING_LENGTH = 100_000
const RETRYABLE_BUSINESS_CODES = new Set([1254290])
const AUTH_BUSINESS_CODES = new Set([1254302, 99991661, 99991663])
const OMITTED_FIELD_VALUE = Symbol('omitted-field-value')
const PROVIDER_IDENTIFIER_PATTERN = /^(?:ou_|on_|oc_|cli_|rec|tbl|fld|vew|bas|boxcn|wikcn|doxcn)[A-Za-z0-9_-]{6,}$/u
const PROVIDER_METADATA_KEY_SEGMENTS = new Set([
  'avatar', 'download', 'email', 'id', 'ids', 'link', 'links', 'token', 'tokens', 'url', 'urls',
])

type LarkDataEnvelope = { code?: unknown; data?: unknown }

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const rejectTimeout = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', rejectTimeout)
      reject(new KnowledgeSourceError({ code: 'timeout', status: 504, retryable: true }))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', rejectTimeout)
      resolve()
    }, milliseconds)
    if (signal.aborted) {
      rejectTimeout()
      return
    }
    signal.addEventListener('abort', rejectTimeout, { once: true })
  })
}

const readRetryDelayMs = (response: Response): number => {
  const raw = response.headers.get('x-ogw-ratelimit-reset') || response.headers.get('retry-after')
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(1_000, Math.floor(seconds * 1_000)) : 0
}

const requireData = (value: unknown): Record<string, unknown> => {
  if (!isKnowledgeSourceRecord(value)) {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  return value
}

const requireItems = (data: Record<string, unknown>): unknown[] => {
  if (!Array.isArray(data.items)) {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  return data.items
}

const requireStableTotal = (
  data: Record<string, unknown>,
  previous: number | null,
  maximum: number,
): number => {
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || Number(data.total) > maximum) {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  const total = Number(data.total)
  if (previous != null && previous !== total) {
    throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
  }
  return total
}

const isProviderMetadataKey = (key: string): boolean => {
  const normalized = key.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase()
  return normalized.split(/[^a-z0-9]+/u).some(segment => PROVIDER_METADATA_KEY_SEGMENTS.has(segment))
}

const sanitizeBaseFieldValue = (
  value: unknown,
  state: { entries: number },
  depth = 0,
): unknown | typeof OMITTED_FIELD_VALUE => {
  if (depth > MAX_FIELD_VALUE_DEPTH || ++state.entries > MAX_FIELD_VALUE_ENTRIES) {
    throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
  }
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
    return value
  }
  if (typeof value === 'string') {
    if (value.length > MAX_FIELD_VALUE_STRING_LENGTH) {
      throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
    }
    return PROVIDER_IDENTIFIER_PATTERN.test(value) ? OMITTED_FIELD_VALUE : value
  }
  if (Array.isArray(value)) {
    const sanitized = value.map(entry => sanitizeBaseFieldValue(entry, state, depth + 1))
    return sanitized.filter(entry => entry !== OMITTED_FIELD_VALUE)
  }
  if (!isKnowledgeSourceRecord(value)) {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isProviderMetadataKey(key)) continue
    const projected = sanitizeBaseFieldValue(entry, state, depth + 1)
    if (projected !== OMITTED_FIELD_VALUE) sanitized[key] = projected
  }
  return sanitized
}

const sanitizeBaseRecordFields = (
  value: Record<string, unknown>,
  approvedFieldNames: ReadonlySet<string>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {}
  const state = { entries: 0 }
  for (const [name, entry] of Object.entries(value)) {
    if (!approvedFieldNames.has(name)) continue
    const projected = sanitizeBaseFieldValue(entry, state)
    if (projected !== OMITTED_FIELD_VALUE) sanitized[name] = projected
  }
  return sanitized
}

const readNextPageToken = (args: {
  data: Record<string, unknown>
  seen: Set<string>
}): string | null => {
  if (typeof args.data.has_more !== 'boolean') {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  if (!args.data.has_more) return null
  const token = readKnowledgeSourceText(args.data.page_token)
  if (!token || args.seen.has(token)) {
    throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
  }
  args.seen.add(token)
  return token
}

const buildDocumentName = (title: string | null): string => {
  const stem = readKnowledgeSourceText(title)
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return `${stem || 'lark-document'}.md`
}

export class LarkKnowledgeSourceProvider implements KnowledgeSourceProvider {
  readonly providerType = 'lark' as const

  constructor(private readonly accessToken: LarkAccessTokenSource) {}

  get identityMode() {
    return this.accessToken.mode
  }

  async read(args: {
    source: LarkBaseKnowledgeSourceRegistration | LarkWikiKnowledgeSourceRegistration | LarkDocKnowledgeSourceRegistration
    operation: StorageRelayOperation
  }): Promise<KnowledgeSourceReadResult> {
    const initialBytes = args.operation.budget.remainingBytes
    const result = args.source.kind === 'base'
      ? await this.readBase(args.source, args.operation)
      : await this.readDocument(args.source, args.operation)
    return {
      ...result,
      counts: {
        ...result.counts,
        bytes: initialBytes - args.operation.budget.remainingBytes,
      },
    }
  }

  private async readJson(
    url: URL,
    operation: StorageRelayOperation,
    request: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
  ): Promise<Record<string, unknown>> {
    let authRetried = false
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = await this.accessToken.read(operation)
      const headers: Record<string, string> = {
        accept: 'application/json', authorization: `Bearer ${token}`,
      }
      if (request.body) headers['content-type'] = 'application/json'
      const response = await operation.fetch(url, {
        method: request.method || 'GET',
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })
      if (response.status === 401 || response.status === 403) {
        await discardStorageRelayResponse(response)
        this.accessToken.invalidate(token)
        if (this.accessToken.canRefresh && !authRetried) {
          authRetried = true
          continue
        }
        throw new KnowledgeSourceError({ code: 'provider_auth_failed', status: 502 })
      }
      if (response.status === 429 || [500, 502, 503, 504].includes(response.status)) {
        const waitMs = readRetryDelayMs(response)
        await discardStorageRelayResponse(response)
        if (attempt < 2) {
          await delay(waitMs, operation.signal)
          continue
        }
        throw new KnowledgeSourceError({
          code: response.status === 429 ? 'rate_limited' : 'upstream_unavailable',
          status: 503,
          retryable: true,
        })
      }
      if (response.status === 404) {
        await discardStorageRelayResponse(response)
        throw new KnowledgeSourceError({ code: 'not_found', status: 404 })
      }
      if (!response.ok) {
        await discardStorageRelayResponse(response)
        throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
      }
      const declaredLengthText = response.headers.get('content-length')
      if (declaredLengthText != null && declaredLengthText.trim() !== '') {
        const declaredLength = Number(declaredLengthText)
        if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
          await discardStorageRelayResponse(response)
          throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
        }
        if (declaredLength > operation.budget.remainingBytes) {
          await discardStorageRelayResponse(response)
          throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
        }
      }
      const body = await readStorageRelayJsonResponse<LarkDataEnvelope>(response, operation.budget)
      const code = Number(body.code)
      if (code === 0) return requireData(body.data)
      if (AUTH_BUSINESS_CODES.has(code)) {
        this.accessToken.invalidate(token)
        if (this.accessToken.canRefresh && !authRetried) {
          authRetried = true
          continue
        }
        throw new KnowledgeSourceError({ code: 'provider_auth_failed', status: 502 })
      }
      if (RETRYABLE_BUSINESS_CODES.has(code) && attempt < 2) continue
      throw new KnowledgeSourceError({
        code: RETRYABLE_BUSINESS_CODES.has(code) ? 'rate_limited' : 'invalid_response',
        status: RETRYABLE_BUSINESS_CODES.has(code) ? 503 : 502,
        retryable: RETRYABLE_BUSINESS_CODES.has(code),
      })
    }
    throw new KnowledgeSourceError({ code: 'upstream_unavailable', status: 503, retryable: true })
  }

  private async readBase(
    source: LarkBaseKnowledgeSourceRegistration,
    operation: StorageRelayOperation,
  ): Promise<KnowledgeSourceReadResult> {
    const before = await this.readBaseTableRevision(source, operation)
    const fields: AgenticGraphKnowledgeSourceBaseSnapshot['fields'] = []
    const records: AgenticGraphKnowledgeSourceBaseSnapshot['records'] = []
    let fieldPages = 0
    let recordPages = 0
    let fieldItemCount = 0
    let cursor: string | null = null
    let fieldTotal: number | null = null
    const approvedFieldNames = new Set(source.fieldNames)
    const observedApprovedFieldNames = new Set<string>()
    const fieldCursors = new Set<string>()
    do {
      if (fieldPages >= MAX_PAGES) throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
      const url = this.baseUrl(source, 'fields')
      url.searchParams.set('page_size', '100')
      url.searchParams.set('view_id', source.viewId)
      if (cursor) url.searchParams.set('page_token', cursor)
      const data = await this.readJson(url, operation)
      fieldPages += 1
      fieldTotal = requireStableTotal(data, fieldTotal, MAX_BASE_FIELDS)
      const items = requireItems(data)
      fieldItemCount += items.length
      for (const item of items) {
        const field = requireData(item)
        const name = readKnowledgeSourceText(field.field_name)
        if (!name) throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
        if (!approvedFieldNames.has(name)) continue
        if (field.is_hidden !== false || observedApprovedFieldNames.has(name)) {
          throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
        }
        observedApprovedFieldNames.add(name)
        fields.push({
          name,
          type: field.type == null ? null : String(field.type),
          isPrimary: field.is_primary === true,
        })
      }
      cursor = readNextPageToken({ data, seen: fieldCursors })
    } while (cursor)
    if (fieldItemCount !== fieldTotal) {
      throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
    }
    if (source.fieldNames.some(name => !observedApprovedFieldNames.has(name))) {
      throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
    }

    cursor = null
    let recordTotal: number | null = null
    const recordCursors = new Set<string>()
    do {
      if (recordPages >= MAX_PAGES) throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
      const url = this.baseUrl(source, 'records/search')
      url.searchParams.set('page_size', '200')
      if (cursor) url.searchParams.set('page_token', cursor)
      const data = await this.readJson(url, operation, {
        method: 'POST',
        body: {
          view_id: source.viewId,
          field_names: [...source.fieldNames],
          automatic_fields: false,
        },
      })
      recordPages += 1
      recordTotal = requireStableTotal(data, recordTotal, MAX_BASE_RECORDS)
      for (const item of requireItems(data)) {
        const record = requireData(item)
        if (!isKnowledgeSourceRecord(record.fields)) {
          throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
        }
        records.push({
          title: null,
          fields: sanitizeBaseRecordFields(record.fields, approvedFieldNames),
        })
        if (records.length > MAX_BASE_RECORDS) {
          throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
        }
      }
      cursor = readNextPageToken({ data, seen: recordCursors })
    } while (cursor)
    if (records.length !== recordTotal) {
      throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
    }
    if (records.length < source.minimumRecordCount) {
      throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
    }
    const after = await this.readBaseTableRevision(source, operation)
    if (before.revision !== after.revision) {
      throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
    }

    return {
      snapshot: {
        type: 'base',
        baseTitle: source.baseTitle,
        tableName: source.tableName,
        viewName: source.viewName,
        fields,
        records,
      },
      providerRevision: String(before.revision),
      counts: {
        pages: before.pages + fieldPages + recordPages + after.pages,
        fields: fields.length,
        records: records.length,
        documents: 0,
        bytes: 0,
      },
      warnings: [],
    }
  }

  private async readBaseTableRevision(
    source: LarkBaseKnowledgeSourceRegistration,
    operation: StorageRelayOperation,
  ): Promise<{ pages: number; revision: number }> {
    let cursor: string | null = null
    let pages = 0
    let itemCount = 0
    let tableTotal: number | null = null
    let revision: number | null = null
    const cursors = new Set<string>()
    do {
      if (pages >= MAX_PAGES) throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
      const url = new URL(
        `/open-apis/bitable/v1/apps/${encodeURIComponent(source.appToken)}/tables`,
        LARK_API_ORIGIN,
      )
      url.searchParams.set('page_size', '100')
      if (cursor) url.searchParams.set('page_token', cursor)
      const data = await this.readJson(url, operation)
      pages += 1
      tableTotal = requireStableTotal(data, tableTotal, 100)
      const items = requireItems(data)
      itemCount += items.length
      for (const item of items) {
        const table = requireData(item)
        if (!readKnowledgeSourceText(table.table_id)) {
          throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
        }
        if (table.table_id !== source.tableId) continue
        if (revision != null || !Number.isSafeInteger(table.revision) || Number(table.revision) < 0) {
          throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
        }
        revision = Number(table.revision)
      }
      cursor = readNextPageToken({ data, seen: cursors })
    } while (cursor)
    if (itemCount !== tableTotal) {
      throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
    }
    if (revision == null) throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
    return { pages, revision }
  }

  private baseUrl(source: LarkBaseKnowledgeSourceRegistration, resource: 'fields' | 'records/search'): URL {
    return new URL(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(source.appToken)}/tables/${encodeURIComponent(source.tableId)}/${resource}`,
      LARK_API_ORIGIN,
    )
  }

  private async readDocument(
    source: LarkWikiKnowledgeSourceRegistration | LarkDocKnowledgeSourceRegistration,
    operation: StorageRelayOperation,
  ): Promise<KnowledgeSourceReadResult> {
    let title = source.title
    let pages = 0
    const documentId = source.documentId
    if (source.kind === 'wiki') {
      const nodeUrl = new URL('/open-apis/wiki/v2/spaces/get_node', LARK_API_ORIGIN)
      nodeUrl.searchParams.set('token', source.nodeToken)
      const node = requireData((await this.readJson(nodeUrl, operation)).node)
      pages += 1
      if (
        readKnowledgeSourceText(node.space_id) !== source.spaceId
        || readKnowledgeSourceText(node.node_token) !== source.nodeToken
        || node.obj_type !== 'docx'
        || readKnowledgeSourceText(node.obj_token) !== source.documentId
      ) {
        throw new KnowledgeSourceError({ code: 'source_config_drift', status: 409 })
      }
      title = readKnowledgeSourceText(node.title) || title
    }
    const contentUrl = new URL(
      `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`,
      LARK_API_ORIGIN,
    )
    const data = await this.readJson(contentUrl, operation)
    pages += 1
    if (typeof data.content !== 'string') {
      throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
    }
    const contentBytes = new TextEncoder().encode(data.content).byteLength
    if (contentBytes > MAX_DOCUMENT_BYTES) {
      throw new KnowledgeSourceError({ code: 'limit_exceeded', status: 413 })
    }
    const snapshot: AgenticGraphKnowledgeSourceDocumentSnapshot = {
      type: 'document',
      name: buildDocumentName(title),
      title,
      text: data.content,
      contentType: 'text/plain',
    }
    return {
      snapshot,
      providerRevision: null,
      counts: { pages, fields: 0, records: 0, documents: 1, bytes: 0 },
      warnings: [],
    }
  }
}
