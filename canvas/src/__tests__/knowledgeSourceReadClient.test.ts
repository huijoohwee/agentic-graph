import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
  type AgenticGraphKnowledgeSourceSnapshotEnvelope,
  verifyKnowledgeSourceSnapshotEnvelopeDigests,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  readKnowledgeSourceSnapshot,
} from '@/features/source-files/knowledge-source/knowledgeSourceReadClient'
import {
  adaptKnowledgeSourceSnapshotToDocument,
} from '@/features/source-files/knowledge-source/knowledgeSourceDocumentAdapter'
import {
  importKnowledgeSourceFromHandoff,
} from '@/features/source-files/knowledge-source/knowledgeSourceImportCommand'
import { AGENTIC_OS_SOURCE_IMPORT_LIMITS } from '@/lib/storage/agentic-graph-storage-bounds'
import { importSourceDocumentIntoSourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { FakeAgenticGraphStorageD1Database } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import { handleKnowledgeSourceRequest } from '../../../cloudflare/workers/agentic-graph-storage/knowledge-source/knowledgeSourceRuntime'
import type { AgenticGraphStorageWorkerEnv } from '@/lib/storage/agentic-graph-storage-sync-contract'

const DOCUMENT_ENVELOPE: AgenticGraphKnowledgeSourceSnapshotEnvelope = {
  ok: true,
  apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
  schema: 'agentic-graph-knowledge-source-snapshot/v1',
  complete: true,
  provider: 'lark',
  kind: 'doc',
  sourceId: 'product-handbook',
  identityMode: 'tenant-app',
  allowlistRevision: 'revision-1',
  allowlistDigest: `sha256:${'a'.repeat(64)}`,
  providerRevision: 'provider-revision-1',
  fetchedAt: '2026-08-06T00:00:00.000Z',
  counts: { pages: 1, fields: 0, records: 0, documents: 1, bytes: 18 },
  contentDigest: 'sha256:a58c30391f833e26658ed23557a470b061b82ec60bc5870c34c3a51a1c0dcad2',
  envelopeDigest: 'sha256:888a1dd91e4fe5e1633fec15890e62e8c1f1f72de39d75e1d7bfb0906ca82a83',
  snapshot: {
    type: 'document',
    name: 'Product Handbook',
    title: 'Product Handbook',
    text: '# Product Handbook\n',
    contentType: 'text/plain',
  },
  warnings: [],
}

const CLIENT_CONFIG = {
  baseUrl: 'https://storage.example.test',
  workspaceId: 'workspace-alpha',
}

export async function testKnowledgeSourceReadClientUsesAuthenticatedProviderNeutralRoute() {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const result = await readKnowledgeSourceSnapshot({
    handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
    config: CLIENT_CONFIG,
    fetchFn: (async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(JSON.stringify(DOCUMENT_ENVELOPE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch,
  })

  if (!result.ok) throw new Error(`expected successful read, got ${JSON.stringify(result)}`)
  if (capturedUrl !== 'https://storage.example.test/api/storage/knowledge-source/read') {
    throw new Error(`unexpected knowledge-source route: ${capturedUrl}`)
  }
  const headers = new Headers(capturedInit?.headers)
  if (headers.has('authorization')) {
    throw new Error('expected opaque capability redemption without a browser bearer token')
  }
  const body = JSON.parse(String(capturedInit?.body || '{}')) as Record<string, unknown>
  const keys = Object.keys(body).sort().join(',')
  if (keys !== 'apiVersion,sourceId,token,workspaceId') {
    throw new Error(`expected provider-neutral read body, got keys ${keys}`)
  }
  const serialized = JSON.stringify(body)
  if (/app[_-]?secret|tenant[_-]?access[_-]?token|tableId|viewId|baseToken/i.test(serialized)) {
    throw new Error(`expected no Lark credential or resource identifiers, got ${serialized}`)
  }

  const inconsistent = await readKnowledgeSourceSnapshot({
    handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
    config: CLIENT_CONFIG,
    fetchFn: (async () => Response.json({
      ...DOCUMENT_ENVELOPE,
      counts: { ...DOCUMENT_ENVELOPE.counts, documents: 0 },
    })) as typeof fetch,
  })
  if (inconsistent.ok === true) {
    throw new Error(`expected inconsistent provenance counts to fail, got ${JSON.stringify(inconsistent)}`)
  }
  if (inconsistent.code !== 'invalid_response') {
    throw new Error(`expected inconsistent provenance counts to fail, got ${JSON.stringify(inconsistent)}`)
  }

  for (const tamperedEnvelope of [
    {
      ...DOCUMENT_ENVELOPE,
      snapshot: { ...DOCUMENT_ENVELOPE.snapshot, text: '# Tampered\n' },
    },
    {
      ...DOCUMENT_ENVELOPE,
      warnings: ['tampered provenance'],
    },
  ]) {
    const tampered = await readKnowledgeSourceSnapshot({
      handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
      config: CLIENT_CONFIG,
      fetchFn: (async () => Response.json(tamperedEnvelope)) as typeof fetch,
    })
    if (tampered.ok === true) {
      throw new Error(`expected digest tampering to fail, got ${JSON.stringify(tampered)}`)
    }
    if (tampered.code !== 'invalid_response') {
      throw new Error(`expected digest tampering to fail, got ${JSON.stringify(tampered)}`)
    }
  }
}

export async function testKnowledgeSourceReadClientRejectsStreamingOverflow() {
  const responseLimit = AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes + 1_048_576
  const cases: Response[] = [
    new Response('{}', { headers: { 'content-length': String(responseLimit + 1) } }),
    new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(responseLimit + 1))
        controller.close()
      },
    }), { headers: { 'content-length': '1' } }),
  ]
  for (const response of cases) {
    const result = await readKnowledgeSourceSnapshot({
      handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
      config: CLIENT_CONFIG,
      fetchFn: (async () => response) as typeof fetch,
    })
    if (result.ok === true) {
      throw new Error(`expected bounded streaming rejection, got ${JSON.stringify(result)}`)
    }
    if (result.code !== 'invalid_response' || !result.error.includes('exceeds')) {
      throw new Error(`expected bounded streaming rejection, got ${JSON.stringify(result)}`)
    }
  }
  let cancelled = false
  const invalidUtf8 = await readKnowledgeSourceSnapshot({
    handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
    config: CLIENT_CONFIG,
    fetchFn: (async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]))
      },
      cancel() {
        cancelled = true
      },
    }))) as typeof fetch,
  })
  if (invalidUtf8.ok === true || invalidUtf8.code !== 'invalid_response' || !cancelled) {
    throw new Error(`expected invalid UTF-8 to cancel the stream, got ${JSON.stringify(invalidUtf8)}`)
  }
}

export async function testKnowledgeSourceReadClientPreservesFailureClassification() {
  const cases = [
    { status: 503, code: 'rate_limited', retryable: true, expectedCode: 'request_failed', expectedRetryable: true },
    { status: 503, code: 'upstream_unavailable', retryable: true, expectedCode: 'request_failed', expectedRetryable: true },
    { status: 503, code: 'timeout', retryable: true, expectedCode: 'request_failed', expectedRetryable: true },
    { status: 503, code: 'identity_not_available', retryable: false, expectedCode: 'blocked', expectedRetryable: false },
    { status: 503, code: 'resources_unresolved', retryable: false, expectedCode: 'blocked', expectedRetryable: false },
    { status: 409, code: 'source_config_drift', retryable: false, expectedCode: 'blocked', expectedRetryable: false },
  ] as const
  for (const fixture of cases) {
    const result = await readKnowledgeSourceSnapshot({
      handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
      config: CLIENT_CONFIG,
      fetchFn: (async () => Response.json({
        ok: false,
        apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
        code: fixture.code,
        retryable: fixture.retryable,
        operationId: 'test-operation',
      }, { status: fixture.status })) as typeof fetch,
    })
    if (result.ok === true
      || result.code !== fixture.expectedCode
      || result.retryable !== fixture.expectedRetryable) {
      throw new Error(`expected typed ${fixture.code} classification, got ${JSON.stringify(result)}`)
    }
  }
}

export async function testKnowledgeSourceWorkerCapabilityCriticalPath() {
  const workspaceId = 'kgws:canvas-critical-path'
  const sourceId = 'lark.base.canvas-critical'
  const sessionToken = 'canvas-critical-session'
  const db = new FakeAgenticGraphStorageD1Database()
  const nowIso = '2026-08-06T00:00:00.000Z'
  const sessionHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionToken))
  const sessionHash = Array.from(
    new Uint8Array(sessionHashBytes),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
  db.workspaces.set(workspaceId, {
    id: workspaceId, slug: workspaceId, title: 'Canvas critical path', visibility: 'private',
    created_at: nowIso, updated_at: nowIso,
  })
  db.users.set('user:canvas-critical', {
    id: 'user:canvas-critical', email: 'canvas-critical@example.com', display_name: 'Canvas Reader',
    status: 'active', created_at: nowIso, updated_at: nowIso,
  })
  db.authSessions.set('session:canvas-critical', {
    id: 'session:canvas-critical', user_id: 'user:canvas-critical', session_hash: sessionHash,
    expires_at: '2036-01-01T00:00:00.000Z', revoked_at: null,
    created_at: nowIso, updated_at: nowIso,
  })
  db.workspaceMemberships.set('membership:canvas-critical', {
    id: 'membership:canvas-critical', workspace_id: workspaceId, user_id: 'user:canvas-critical',
    role: 'owner', status: 'active', invited_by_user_id: null,
    created_at: nowIso, updated_at: nowIso,
  })
  const env: AgenticGraphStorageWorkerEnv = {
    DB: db,
    AGENTIC_OS_STORAGE_SIGNING_SECRET: 'canvas-critical-signing-secret',
    AGENTIC_OS_STORAGE_LARK_IDENTITY_MODE: 'user-oauth',
    AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN: 'server-only-lark-token',
    AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS: '4102444800000',
    AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON: JSON.stringify({
      schema: 'agentic-graph-knowledge-source-allowlist/v1',
      revision: 'canvas-critical-r1',
      sources: [{
        sourceId, workspaceId, provider: 'lark', kind: 'base',
        appToken: 'server-app-token', tableId: 'server-table-id', viewId: 'server-view-id',
        fieldNames: ['Name'], minimumRecordCount: 1,
      }],
    }),
  }
  const buildRequest = (path: string, token: string | null, body: Record<string, unknown>) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (token) headers.set('authorization', `Bearer ${token}`)
    return new Request(`https://airvio.co${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
        workspaceId,
        sourceId,
        ...body,
      }),
    })
  }
  let larkFetches = 0
  const noAuthIssuance = await handleKnowledgeSourceRequest({
    request: buildRequest('/api/storage/knowledge-source/handoff', null, {}),
    pathname: '/api/storage/knowledge-source/handoff', env, db,
    fetcher: async () => { larkFetches += 1; throw new Error('must not fetch') },
  })
  if (noAuthIssuance.status !== 401 || larkFetches !== 0) {
    throw new Error(`expected authenticated zero-fetch issuance, got ${noAuthIssuance.status}/${larkFetches}`)
  }
  const issued = await handleKnowledgeSourceRequest({
    request: buildRequest('/api/storage/knowledge-source/handoff', sessionToken, {}),
    pathname: '/api/storage/knowledge-source/handoff', env, db,
  })
  const { token } = await issued.json() as { token: string }
  const readRequest = buildRequest('/api/storage/knowledge-source/read', null, { token })
  if (readRequest.headers.has('authorization')) throw new Error('capability read must not use browser bearer auth')
  const read = await handleKnowledgeSourceRequest({
    request: readRequest,
    pathname: '/api/storage/knowledge-source/read', env, db,
    fetcher: async input => {
      larkFetches += 1
      const url = new URL(String(input))
      if (url.pathname.endsWith('/tables')) {
        return Response.json({ code: 0, data: {
          items: [{ table_id: 'server-table-id', revision: 1 }], has_more: false, total: 1,
        } })
      }
      if (url.pathname.endsWith('/fields')) {
        return Response.json({ code: 0, data: {
          items: [{ field_name: 'Name', type: 1, is_primary: true, is_hidden: false }],
          has_more: false, total: 1,
        } })
      }
      return Response.json({ code: 0, data: {
        items: [{ fields: { Name: 'Canvas critical record' } }], has_more: false, total: 1,
      } })
    },
  })
  if (read.status !== 200) throw new Error(`expected capability read, got ${read.status}`)
  const envelope = await read.json() as AgenticGraphKnowledgeSourceSnapshotEnvelope
  if (!envelope.complete || !await verifyKnowledgeSourceSnapshotEnvelopeDigests(envelope)) {
    throw new Error(`expected complete verified envelope, got ${JSON.stringify(envelope)}`)
  }
  const [iv, ciphertext] = token.split('.')
  const tamperedToken = `${iv}.${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`
  const fetchesBeforeTamper = larkFetches
  const tampered = await handleKnowledgeSourceRequest({
    request: buildRequest('/api/storage/knowledge-source/read', null, { token: tamperedToken }),
    pathname: '/api/storage/knowledge-source/read', env, db,
    fetcher: async () => { larkFetches += 1; throw new Error('must not fetch') },
  })
  if (tampered.status !== 400 || larkFetches !== fetchesBeforeTamper) {
    throw new Error(`expected tampered zero-fetch rejection, got ${tampered.status}/${larkFetches}`)
  }
}

export async function testKnowledgeSourceReadClientBlocksBeforeFetchWithoutStorageIdentity() {
  let fetchCount = 0
  const result = await readKnowledgeSourceSnapshot({
    handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
    config: null,
    fetchFn: (async () => {
      fetchCount += 1
      throw new Error('must not fetch')
    }) as typeof fetch,
  })
  if (result.ok === true) throw new Error(`expected not_configured result, got ${JSON.stringify(result)}`)
  if (result.code !== 'not_configured') {
    throw new Error(`expected not_configured result, got ${JSON.stringify(result)}`)
  }
  if (fetchCount !== 0) throw new Error(`expected zero fetches, got ${fetchCount}`)
}

export function testKnowledgeSourceBaseAdapterEscapesUntrustedStructure() {
  const adapted = adaptKnowledgeSourceSnapshotToDocument({
    ...DOCUMENT_ENVELOPE,
    kind: 'base',
    sourceId: 'roadmap',
    snapshot: {
      type: 'base',
      baseTitle: 'Roadmap\n---\nforged: true',
      tableName: 'Tasks',
      viewName: 'Open',
      fields: [{ name: 'Owner`role', type: 'text', isPrimary: true }],
      records: [{ title: 'Ship\n# forged heading', fields: { 'Owner`role': 'Ada' } }],
    },
  })
  if (!adapted.ok) throw new Error(`expected Base adaptation, got ${JSON.stringify(adapted)}`)
  if (adapted.document.text.includes('\n# forged heading')) {
    throw new Error(`expected record heading newlines to be neutralized, got ${adapted.document.text}`)
  }
  if (!adapted.document.text.includes('``Owner`role``')) {
    throw new Error(`expected inline-code field label to use a safe fence, got ${adapted.document.text}`)
  }
  if (/tableId|viewId|baseToken|record_ref/.test(adapted.document.text)) {
    throw new Error(`expected provider resource identifiers to stay server-side, got ${adapted.document.text}`)
  }
  for (const requiredKey of [
    'kgKnowledgeSourceIdentityMode',
    'kgKnowledgeSourceAllowlistRevision',
    'kgKnowledgeSourceAllowlistDigest',
    'kgKnowledgeSourceProviderRevision',
    'kgKnowledgeSourceFetchedAt',
    'kgKnowledgeSourceContentDigest',
    'kgKnowledgeSourceEnvelopeDigest',
    'kgKnowledgeSourceByteCount',
  ]) {
    if (!adapted.document.text.includes(requiredKey)) {
      throw new Error(`expected ${requiredKey} provenance in generated Markdown`)
    }
  }
}

export async function testKnowledgeSourceImportFailureDoesNotMutateSourceFiles() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    const result = await importKnowledgeSourceFromHandoff(
      {
        handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
      },
      {
        readSnapshot: async () => ({
          ok: false,
          code: 'blocked',
          error: 'The configured Lark knowledge source is not ready.',
          retryable: false,
        }),
      },
    )
    if (result.ok) throw new Error('expected blocked import to fail')
    if (useGraphStore.getState().sourceFiles.length !== 0) {
      throw new Error('expected blocked import not to create or update Source Files')
    }
  } finally {
    bootstrap.restore()
  }
}

export async function testKnowledgeSourceImportUsesCreateOnlyTarget() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    const existing = await importSourceDocumentIntoSourceFile({
      fileId: null,
      name: 'Product-Handbook.md',
      text: '# Existing content\n',
      source: { kind: 'local', path: 'Product-Handbook.md' },
    })
    if (!existing.ok) throw new Error(`failed to create fixture source: ${JSON.stringify(existing)}`)
    const result = await importKnowledgeSourceFromHandoff(
      { handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' } },
      { readSnapshot: async () => ({ ok: true, envelope: DOCUMENT_ENVELOPE }) },
    )
    if (!result.ok) throw new Error(`expected create-only import, got ${JSON.stringify(result)}`)
    if (result.fileId === existing.fileId || result.name !== 'Product-Handbook-2.md') {
      throw new Error(`expected a distinct create-only target, got ${JSON.stringify(result)}`)
    }
    const after = useGraphStore.getState().sourceFiles
    const original = after.find(file => file.id === existing.fileId)
    if (original?.text !== '# Existing content\n' || after.length !== 2) {
      throw new Error(`expected existing source preservation, got ${JSON.stringify(after)}`)
    }
  } finally {
    bootstrap.restore()
  }
}

export async function testKnowledgeSourceOversizedDocumentDoesNotMutateSourceFiles() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    const oversizedLine = 'plain text content remains after markdown sanitation.\n'
    const oversizedText = oversizedLine.repeat(
      Math.ceil((AGENTIC_OS_SOURCE_IMPORT_LIMITS.maxBytes + 1) / oversizedLine.length),
    )
    const result = await importKnowledgeSourceFromHandoff(
      {
        handoff: { sourceId: 'product-handbook', token: 'opaque-handoff-token' },
      },
      {
        readSnapshot: async () => ({
          ok: true,
          envelope: {
            ...DOCUMENT_ENVELOPE,
            snapshot: {
              type: 'document',
              name: 'Product Handbook',
              title: 'Product Handbook',
              text: oversizedText,
              contentType: 'text/plain',
            },
          },
        }),
      },
    )
    if (result.ok === true) throw new Error(`expected oversized import error, got ${JSON.stringify(result)}`)
    if (!result.error.includes('exceeds')) {
      throw new Error(`expected oversized import error, got ${JSON.stringify(result)}`)
    }
    if (useGraphStore.getState().sourceFiles.length !== 0) {
      throw new Error('expected oversized import not to create or update Source Files')
    }
  } finally {
    bootstrap.restore()
  }
}
