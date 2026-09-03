import assert from 'node:assert/strict'
import test from 'node:test'
import { FakeAgenticGraphStorageD1Database } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-d1'
import {
  AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
  buildAgenticGraphKnowledgeSourceHandoffPath,
  buildAgenticGraphKnowledgeSourceReadPath,
  type AgenticGraphStorageWorkerEnv,
} from '../contract'
import { handleKnowledgeSourceRequest } from './knowledgeSourceRuntime'

const SESSION_TOKEN = 'knowledge-source-session'
const WORKSPACE_ID = 'kgws:canonical-docs'
const SOURCE_ID = 'lark.base.primary'

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const createDb = async (): Promise<FakeAgenticGraphStorageD1Database> => {
  const db = new FakeAgenticGraphStorageD1Database()
  const nowIso = '2026-08-06T00:00:00.000Z'
  db.workspaces.set(WORKSPACE_ID, {
    id: WORKSPACE_ID,
    slug: WORKSPACE_ID,
    title: 'Knowledge workspace',
    visibility: 'private',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.users.set('user:knowledge', {
    id: 'user:knowledge',
    email: 'knowledge@example.com',
    display_name: 'Knowledge Reader',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.authSessions.set('session:knowledge', {
    id: 'session:knowledge',
    user_id: 'user:knowledge',
    session_hash: await hashToken(SESSION_TOKEN),
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set('membership:knowledge', {
    id: 'membership:knowledge',
    workspace_id: WORKSPACE_ID,
    user_id: 'user:knowledge',
    role: 'owner',
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  return db
}

const allowlist = (revision = 'revision-1', includeSecondary = false) => JSON.stringify({
  schema: 'agentic-graph-knowledge-source-allowlist/v1',
  revision,
  sources: [{
    sourceId: SOURCE_ID,
    workspaceId: WORKSPACE_ID,
    provider: 'lark',
    kind: 'base',
    appToken: 'app-secret-resource',
    tableId: 'table-secret-resource',
    viewId: 'view-secret-resource',
    fieldNames: ['Name'],
    minimumRecordCount: 1,
    baseTitle: 'Knowledge Base',
    tableName: 'Records',
    viewName: 'Published',
  }, ...(includeSecondary ? [{
    sourceId: 'lark.base.secondary',
    workspaceId: WORKSPACE_ID,
    provider: 'lark',
    kind: 'base',
    appToken: 'secondary-app-resource',
    tableId: 'secondary-table-resource',
    viewId: 'secondary-view-resource',
    fieldNames: ['Name'],
    minimumRecordCount: 1,
  }] : [])],
})

const createEnv = (db: FakeAgenticGraphStorageD1Database): AgenticGraphStorageWorkerEnv => ({
  DB: db,
  AGENTIC_OS_STORAGE_SIGNING_SECRET: 'knowledge-source-signing-secret',
  AGENTIC_OS_STORAGE_LARK_IDENTITY_MODE: 'user-oauth',
  AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN: 'server-only-user-token',
  AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS: '4102444800000',
  AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON: allowlist(),
})

const request = (
  path: string,
  body: Record<string, unknown>,
  sessionToken: string | null = SESSION_TOKEN,
): Request => {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-client-request-id': 'knowledge:test',
  })
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`)
  return new Request(`https://airvio.co${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      apiVersion: AGENTIC_OS_KNOWLEDGE_SOURCE_API_VERSION,
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      ...body,
    }),
  })
}

test('missing authentication and membership fail before any Lark fetch', async () => {
  const db = await createDb()
  const env = createEnv(db)
  let fetchCalls = 0
  const fetcher = async (): Promise<Response> => {
    fetchCalls += 1
    throw new Error('must not fetch')
  }
  const unauthenticated = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}, null),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env,
    db,
    fetcher,
  })
  assert.equal(unauthenticated.status, 401)
  assert.equal((await unauthenticated.json() as { code: string }).code, 'auth_required')

  db.workspaceMemberships.delete('membership:knowledge')
  const forbidden = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env,
    db,
    fetcher,
  })
  assert.equal(forbidden.status, 403)
  assert.equal((await forbidden.json() as { code: string }).code, 'membership_forbidden')
  assert.equal(fetchCalls, 0)
})

test('unresolved identity and resources fail before any Lark fetch', async () => {
  const db = await createDb()
  let fetchCalls = 0
  const base = createEnv(db)
  const unresolvedIdentity = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env: { ...base, AGENTIC_OS_STORAGE_LARK_IDENTITY_MODE: '<tenant-app|user-oauth>' },
    db,
    fetcher: async () => {
      fetchCalls += 1
      throw new Error('must not fetch')
    },
  })
  assert.equal(unresolvedIdentity.status, 503)
  assert.equal((await unresolvedIdentity.json() as { code: string }).code, 'identity_unresolved')

  const unresolvedResources = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env: { ...base, AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON: '<Base/table/view and Wiki/Doc identifiers>' },
    db,
    fetcher: async () => {
      fetchCalls += 1
      throw new Error('must not fetch')
    },
  })
  assert.equal(unresolvedResources.status, 503)
  assert.equal((await unresolvedResources.json() as { code: string }).code, 'resources_unresolved')
  assert.equal(fetchCalls, 0)
})

test('authenticated handoff redeems one complete sanitized Base snapshot', async () => {
  const db = await createDb()
  const env = createEnv(db)
  const handoff = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env,
    db,
    now: () => Date.parse('2026-08-06T00:00:00.000Z'),
  })
  assert.equal(handoff.status, 200)
  const handoffBody = await handoff.json() as { token: string; expiresAtMs: number }
  assert.equal(handoffBody.expiresAtMs, Date.parse('2026-08-06T00:05:00.000Z'))
  assert.equal(handoffBody.token.includes('app-secret-resource'), false)

  const observedUrls: string[] = []
  const read = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceReadPath(), { token: handoffBody.token }, null),
    pathname: buildAgenticGraphKnowledgeSourceReadPath(),
    env,
    db,
    now: () => Date.parse('2026-08-06T00:00:01.000Z'),
    fetcher: async (input, init) => {
      const url = String(input)
      observedUrls.push(url)
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-only-user-token')
      if (new URL(url).pathname.endsWith('/tables')) {
        assert.equal(init?.method, 'GET')
        return Response.json({ code: 0, data: {
          items: [{ table_id: 'table-secret-resource', revision: 9 }], has_more: false, total: 1,
        } })
      }
      if (url.endsWith('/fields?page_size=100&view_id=view-secret-resource')) {
        assert.equal(init?.method, 'GET')
        return Response.json({ code: 0, data: {
          items: [{ field_id: 'hidden-field-id', field_name: 'Name', type: 1, is_primary: true, is_hidden: false }],
          has_more: false,
          total: 1,
        } })
      }
      assert.equal(init?.method, 'POST')
      assert.match(url, /\/records\/search\?page_size=200$/u)
      assert.deepEqual(JSON.parse(String(init?.body)), {
        view_id: 'view-secret-resource', field_names: ['Name'], automatic_fields: false,
      })
      return Response.json({ code: 0, data: {
        items: [{ record_id: 'hidden-record-id', fields: { Name: 'Alpha' } }],
        has_more: false,
        total: 1,
      } })
    },
  })
  assert.equal(read.status, 200)
  const body = await read.json() as Record<string, unknown>
  assert.equal(body.complete, true)
  assert.match(String(body.contentDigest), /^sha256:[a-f0-9]{64}$/u)
  assert.match(String(body.envelopeDigest), /^sha256:[a-f0-9]{64}$/u)
  const serialized = JSON.stringify(body)
  for (const secret of [
    'app-secret-resource', 'table-secret-resource', 'view-secret-resource',
    'hidden-field-id', 'hidden-record-id', 'server-only-user-token',
  ]) assert.equal(serialized.includes(secret), false)
  assert.equal(observedUrls.length, 4)
})

test('tampered handoff and allowlist drift never reach Lark', async () => {
  const db = await createDb()
  const env = createEnv(db)
  const handoff = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env,
    db,
  })
  const { token } = await handoff.json() as { token: string }
  let fetchCalls = 0
  const fetcher = async (): Promise<Response> => {
    fetchCalls += 1
    return Response.json({ code: 0, data: {} })
  }
  const [iv, ciphertext] = token.split('.')
  assert.ok(iv && ciphertext)
  const tamperedToken = `${iv}.${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`
  const tampered = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceReadPath(), { token: tamperedToken }, null),
    pathname: buildAgenticGraphKnowledgeSourceReadPath(),
    env,
    db,
    fetcher,
  })
  assert.equal(tampered.status, 400)

  const drifted = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceReadPath(), { token }, null),
    pathname: buildAgenticGraphKnowledgeSourceReadPath(),
    env: { ...env, AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON: allowlist('revision-2') },
    db,
    fetcher,
  })
  assert.equal(drifted.status, 409)
  assert.equal((await drifted.json() as { code: string }).code, 'source_config_drift')
  assert.equal(fetchCalls, 0)
})

test('expired and cross-source capabilities fail without a Lark fetch', async () => {
  const db = await createDb()
  const env = {
    ...createEnv(db),
    AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON: allowlist('revision-1', true),
  }
  const issued = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceHandoffPath(), {}),
    pathname: buildAgenticGraphKnowledgeSourceHandoffPath(),
    env,
    db,
    now: () => 1_000,
  })
  const { token } = await issued.json() as { token: string }
  let fetchCalls = 0
  const fetcher = async (): Promise<Response> => {
    fetchCalls += 1
    throw new Error('must not fetch')
  }
  const expired = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceReadPath(), { token }, null),
    pathname: buildAgenticGraphKnowledgeSourceReadPath(),
    env,
    db,
    now: () => 1_000 + 5 * 60_000 + 1,
    fetcher,
  })
  assert.equal(expired.status, 400)

  const crossSource = await handleKnowledgeSourceRequest({
    request: request(buildAgenticGraphKnowledgeSourceReadPath(), {
      token,
      sourceId: 'lark.base.secondary',
    }, null),
    pathname: buildAgenticGraphKnowledgeSourceReadPath(),
    env,
    db,
    now: () => 2_000,
    fetcher,
  })
  assert.equal(crossSource.status, 400)
  assert.equal((await crossSource.json() as { code: string }).code, 'invalid_request')
  assert.equal(fetchCalls, 0)
})
