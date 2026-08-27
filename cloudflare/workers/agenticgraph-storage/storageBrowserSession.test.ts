import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1DatabaseLike } from './db'
import {
  handleAgenticGraphStorageBrowserSessionRoute,
  isAgenticGraphStorageSameOriginCookieMutation,
} from './storageBrowserSession'
import {
  authenticateAgenticGraphStorageSnapshotRequest,
  authenticateAgenticGraphStorageSyncRequest,
} from './storageSyncSecurity'
import { createAgenticGraphStorageWorker } from './index'
import type { AgenticGraphStorageWorkerEnv } from './contract'

type Row = Record<string, unknown>

type BrowserSessionTestDb = D1DatabaseLike & {
  identities: Map<string, Row>
  users: Map<string, Row>
  memberships: Map<string, Row>
  sessions: Map<string, Row>
}

const normalizeSql = (value: string): string => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()

const createDb = (): BrowserSessionTestDb => {
  const db = {
    identities: new Map<string, Row>(),
    users: new Map<string, Row>(),
    memberships: new Map<string, Row>(),
    sessions: new Map<string, Row>(),
    prepare(sql: string) {
      let values: unknown[] = []
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues
          return statement
        },
        async run() {
          const normalized = normalizeSql(sql)
          if (normalized.includes('insert into auth_sessions')) {
            const [id, userId, sessionHash, expiresAt, createdAt, updatedAt] = values
            db.sessions.set(String(id), {
              id,
              user_id: userId,
              session_hash: sessionHash,
              expires_at: expiresAt,
              revoked_at: null,
              created_at: createdAt,
              updated_at: updatedAt,
            })
          }
          if (normalized.startsWith('update auth_sessions')) {
            const [revokedAt, updatedAt, sessionHash] = values
            for (const [id, session] of db.sessions) {
              if (session.session_hash === sessionHash && session.revoked_at == null) {
                db.sessions.set(id, { ...session, revoked_at: revokedAt, updated_at: updatedAt })
              }
            }
          }
          return { success: true }
        },
        async all<T = Row>() {
          const normalized = normalizeSql(sql)
          if (normalized.includes('from auth_identities')) {
            const [provider, issuer, subject] = values.map(String)
            const identity = Array.from(db.identities.values()).find(row =>
              row.provider === provider && row.issuer === issuer && row.subject === subject,
            )
            const user = identity ? db.users.get(String(identity.user_id)) : null
            return {
              results: identity && user ? [{
                ...identity,
                user_email: user.email,
                user_display_name: user.display_name,
                user_status: user.status,
              } as T] : [],
            }
          }
          if (normalized.includes('from auth_sessions')) {
            const [sessionHash, nowIso] = values.map(String)
            const session = Array.from(db.sessions.values()).find(row =>
              row.session_hash === sessionHash
              && row.revoked_at == null
              && String(row.expires_at) > nowIso,
            )
            const user = session ? db.users.get(String(session.user_id)) : null
            return {
              results: session && user ? [{
                ...session,
                user_email: user.email,
                user_display_name: user.display_name,
                user_status: user.status,
              } as T] : [],
            }
          }
          if (normalized.includes('from workspace_memberships')) {
            const [firstValue, secondValue] = values.map(String)
            if (normalized.includes('where workspace_id = ?')) {
              const membership = Array.from(db.memberships.values()).find(row =>
                row.workspace_id === firstValue && row.user_id === secondValue && row.status === 'active',
              )
              return { results: membership ? [{ ...membership } as T] : [] }
            }
            return {
              results: Array.from(db.memberships.values())
                .filter(row => row.user_id === firstValue)
                .map(row => ({ ...row }) as T),
            }
          }
          return { results: [] as T[] }
        },
      }
      return statement
    },
  }
  return db as BrowserSessionTestDb
}

const createEnv = (db: D1DatabaseLike | null): AgenticGraphStorageWorkerEnv => ({
  DB: db,
  AGENTICGRAPH_STORAGE_ACCESS_ISSUER: 'https://storage.cloudflareaccess.com',
  AGENTICGRAPH_STORAGE_ACCESS_AUDIENCE: 'abcdefghijklmnop',
  AGENTICGRAPH_STORAGE_BROWSER_SESSION_TTL_SECONDS: '900',
})

const seedProvisionedIdentity = (db: BrowserSessionTestDb): void => {
  const nowIso = '2026-08-21T00:00:00.000Z'
  db.users.set('user:browser', {
    id: 'user:browser',
    email: 'browser@example.test',
    display_name: 'Browser User',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.identities.set('identity:browser', {
    id: 'identity:browser',
    user_id: 'user:browser',
    provider: 'cloudflare-access',
    issuer: 'https://storage.cloudflareaccess.com',
    subject: 'access-subject:browser',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.memberships.set('membership:browser', {
    id: 'membership:browser',
    workspace_id: 'workspace:browser',
    user_id: 'user:browser',
    role: 'editor',
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
}

const browserSessionDependencies = () => {
  const generated = [
    'a'.repeat(64),
    'b'.repeat(32),
  ]
  return {
    now: () => new Date('2036-08-21T00:00:00.000Z'),
    createOpaqueToken: () => generated.shift() || 'c'.repeat(64),
    verifyAccessToken: async () => ({ ok: true as const, sub: 'access-subject:browser' }),
  }
}

test('browser login issues an opaque HttpOnly same-origin cookie only for a pre-provisioned identity', async () => {
  const db = createDb()
  seedProvisionedIdentity(db)
  const response = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/login?return_to=%2Fagenticgraph%3Fworkspace%3Dbrowser', {
      headers: { 'cf-access-jwt-assertion': 'verified-access-jwt' },
    }),
    env: createEnv(db),
    db,
    dependencies: browserSessionDependencies(),
  })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/agenticgraph?workspace=browser')
  const cookie = response.headers.get('set-cookie') || ''
  assert.match(cookie, /^__Host-kg_storage_session=a{64}; Path=\/; Max-Age=900; Secure; HttpOnly; SameSite=Strict$/)
  assert.equal(db.sessions.size, 1)
  assert.equal(JSON.stringify(Array.from(db.sessions.values())).includes('a'.repeat(64)), false)

  const session = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/session?workspace_id=workspace%3Abrowser', {
      headers: { cookie: '__Host-kg_storage_session=' + 'a'.repeat(64) },
    }),
    env: createEnv(db),
    db,
  })
  assert.equal(session.status, 200)
  assert.deepEqual(await session.json(), {
    ok: true,
    apiVersion: '2026-05-04',
    authenticated: true,
    workspaceId: 'workspace:browser',
    session: { expiresAt: '2036-08-21T00:15:00.000Z' },
  })

  const cookieRequest = new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { cookie: '__Host-kg_storage_session=' + 'a'.repeat(64) },
  })
  const snapshotAuth = await authenticateAgenticGraphStorageSnapshotRequest(cookieRequest, createEnv(db), db)
  assert.equal(snapshotAuth.ok, true)
  if (snapshotAuth.ok) assert.deepEqual(snapshotAuth.principal, { local: false, userId: 'user:browser' })
  for (const path of [
    '/api/storage/push',
    '/api/storage/pull',
    '/api/storage/export/workspace%3Abrowser',
  ]) {
    const unavailableCookie = await authenticateAgenticGraphStorageSnapshotRequest(new Request(`https://storage.example${path}`, {
      method: path.includes('/export/') ? 'GET' : 'POST',
      headers: { cookie: '__Host-kg_storage_session=' + 'a'.repeat(64) },
    }), { DB: db }, db)
    assert.equal(unavailableCookie.ok, false, `${path} must fail closed when Access configuration is absent`)
    if (!unavailableCookie.ok) assert.equal(unavailableCookie.response.status, 503)
  }
  const bearerSnapshot = await authenticateAgenticGraphStorageSnapshotRequest(new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'a'.repeat(64) },
  }), { DB: db }, db)
  assert.equal(bearerSnapshot.ok, true, 'server-to-server bearer callers are independent of browser Access configuration')
  const nonSnapshotAuth = await authenticateAgenticGraphStorageSyncRequest(cookieRequest, createEnv(db), db)
  assert.equal(nonSnapshotAuth.ok, false)
  if (!nonSnapshotAuth.ok) assert.equal(nonSnapshotAuth.response.status, 401)

  const worker = createAgenticGraphStorageWorker()
  const browserState = await worker.fetch(new Request('https://storage.example/api/storage/auth/session?workspace_id=workspace%3Abrowser', {
    headers: { cookie: '__Host-kg_storage_session=' + 'a'.repeat(64) },
  }), createEnv(db))
  assert.equal(browserState.status, 200)
  const chatState = await worker.fetch(new Request('https://storage.example/api/storage/chat/session', {
    headers: { cookie: '__Host-kg_storage_session=' + 'a'.repeat(64) },
  }), createEnv(db))
  assert.equal(chatState.status, 401, 'browser cookie must not broaden chat or Canvas-room credentials')

  const crossOriginLogout = await worker.fetch(new Request('https://storage.example/api/storage/auth/logout', {
    method: 'POST',
    headers: {
      cookie: '__Host-kg_storage_session=' + 'a'.repeat(64),
      origin: 'https://evil.example',
    },
  }), createEnv(db))
  assert.equal(crossOriginLogout.status, 403)
})

test('browser session rejects a viewer before D1 snapshot upload would become retryable', async () => {
  const db = createDb()
  seedProvisionedIdentity(db)
  const login = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/login', {
      headers: { 'cf-access-jwt-assertion': 'verified-access-jwt' },
    }),
    env: createEnv(db),
    db,
    dependencies: browserSessionDependencies(),
  })
  const token = (login.headers.get('set-cookie') || '').match(/__Host-kg_storage_session=([^;]+)/)?.[1] || ''
  const membership = db.memberships.get('membership:browser') || {}
  db.memberships.set('membership:browser', { ...membership, role: 'viewer' })
  const session = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/session?workspace_id=workspace%3Abrowser', {
      headers: { cookie: `__Host-kg_storage_session=${token}` },
    }),
    env: createEnv(db),
    db,
  })
  assert.equal(session.status, 403)
  assert.match(String((await session.json() as { error?: unknown }).error), /editor, owner, or provider-admin/i)

  db.memberships.set('membership:browser', { ...membership, role: 'owner', status: 'inactive' })
  const inactiveWriter = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/session?workspace_id=workspace%3Abrowser', {
      headers: { cookie: `__Host-kg_storage_session=${token}` },
    }),
    env: createEnv(db),
    db,
  })
  assert.equal(inactiveWriter.status, 403)
})

test('browser session fails closed when Access configuration is absent and logout still clears/revokes the cookie', async () => {
  const db = createDb()
  seedProvisionedIdentity(db)
  const login = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/login', {
      headers: { 'cf-access-jwt-assertion': 'verified-access-jwt' },
    }),
    env: createEnv(db),
    db,
    dependencies: browserSessionDependencies(),
  })
  const cookie = login.headers.get('set-cookie') || ''
  const token = cookie.match(/__Host-kg_storage_session=([^;]+)/)?.[1] || ''
  assert.equal(token, 'a'.repeat(64))

  const unavailable = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/session?workspace_id=workspace%3Abrowser', {
      headers: { cookie: `__Host-kg_storage_session=${token}` },
    }),
    env: { DB: db },
    db,
  })
  assert.equal(unavailable.status, 503)

  const logout = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `__Host-kg_storage_session=${token}`,
        origin: 'https://storage.example',
      },
    }),
    env: { DB: db },
    db,
    dependencies: browserSessionDependencies(),
  })
  assert.equal(logout.status, 204)
  assert.match(logout.headers.get('set-cookie') || '', /^__Host-kg_storage_session=; Path=\/; Max-Age=0; Expires=.*; Secure; HttpOnly; SameSite=Strict$/)
  assert.equal(Array.from(db.sessions.values())[0]?.revoked_at, '2036-08-21T00:00:00.000Z')
})

test('browser login refuses unmapped identities and open redirects without creating a session', async () => {
  const db = createDb()
  const dependencies = browserSessionDependencies()
  const unmapped = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/login', {
      headers: { 'cf-access-jwt-assertion': 'verified-access-jwt' },
    }),
    env: createEnv(db),
    db,
    dependencies,
  })
  assert.equal(unmapped.status, 403)
  assert.equal(db.sessions.size, 0)

  seedProvisionedIdentity(db)
  const redirect = await handleAgenticGraphStorageBrowserSessionRoute({
    request: new Request('https://storage.example/api/storage/auth/login?return_to=https%3A%2F%2Fevil.example', {
      headers: { 'cf-access-jwt-assertion': 'verified-access-jwt' },
    }),
    env: createEnv(db),
    db,
    dependencies,
  })
  assert.equal(redirect.status, 400)
  assert.equal(db.sessions.size, 0)
})

test('cookie-authenticated unsafe storage requests require the exact request origin', () => {
  const cookie = `__Host-kg_storage_session=${'a'.repeat(64)}`
  assert.equal(isAgenticGraphStorageSameOriginCookieMutation(new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { cookie, origin: 'https://storage.example' },
  })), true)
  assert.equal(isAgenticGraphStorageSameOriginCookieMutation(new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { cookie, origin: 'https://evil.example' },
  })), false)
  assert.equal(isAgenticGraphStorageSameOriginCookieMutation(new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { authorization: 'Bearer service-token' },
  })), true)
})
