import assert from 'node:assert/strict'
import test from 'node:test'
import { FakeAgenticGraphStorageD1Database } from '../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-d1'
import {
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
  buildAgenticGraphCollaborationSavePath,
  buildAgenticGraphStorageFileSyncRelayPath,
  buildAgenticGraphStorageGitRelayPath,
  buildAgenticGraphStorageRelayCapabilitiesPath,
  type AgenticGraphCollaborationSaveRequest,
  type AgenticGraphStorageWorkerEnv,
} from './contract'
import { createAgenticGraphStorageWorker } from './index'
import { handleStorageRelayRequest } from './storageRelayRuntime'
import { STORAGE_RELAY_API_VERSION, type StorageRelayFetch } from './storage-relay/storageRelaySafety'

const SESSION_TOKEN = 'relay-session-token'
const COMMIT_OID = '1234567890abcdef1234567890abcdef12345678'

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const seedAuthorizedWorkspace = async (
  db: FakeAgenticGraphStorageD1Database,
  workspaceId = AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
): Promise<void> => {
  const nowIso = '2026-07-24T00:00:00.000Z'
  db.workspaces.set(workspaceId, {
    id: workspaceId,
    slug: workspaceId,
    title: 'Relay workspace',
    visibility: 'private',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.users.set('user:relay', {
    id: 'user:relay',
    email: 'relay@example.com',
    display_name: 'Relay User',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.authSessions.set('session:relay', {
    id: 'session:relay',
    user_id: 'user:relay',
    session_hash: await hashToken(SESSION_TOKEN),
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set('membership:relay', {
    id: 'membership:relay',
    workspace_id: workspaceId,
    user_id: 'user:relay',
    role: 'owner',
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
}

const createEnv = (
  db: FakeAgenticGraphStorageD1Database,
  overrides: Partial<AgenticGraphStorageWorkerEnv> = {},
): AgenticGraphStorageWorkerEnv => ({
  DB: db,
  AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
  AGENTIC_OS_STORAGE_SIGNING_SECRET: 'relay-test-signing-secret',
  ...overrides,
})

const relayRequest = (
  path: string,
  body: Record<string, unknown>,
): Request => new Request(`http://localhost${path}`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${SESSION_TOKEN}`,
    'content-type': 'application/json',
    'x-client-request-id': 'relay:test',
  },
  body: JSON.stringify({
    apiVersion: STORAGE_RELAY_API_VERSION,
    workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    ...body,
  }),
})

const collaborationSaveRequest = (args: {
  url?: string
  sessionToken?: string | null
  overrides?: Partial<AgenticGraphCollaborationSaveRequest>
} = {}): Request => {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (args.sessionToken !== null) {
    headers.set('authorization', `Bearer ${args.sessionToken || SESSION_TOKEN}`)
  }
  return new Request(
    args.url || `http://localhost${buildAgenticGraphCollaborationSavePath()}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
      apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
      operation: 'upsert',
        workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
        documentKey: 'docs/team-note.md',
        documentKind: 'markdown',
        repositoryTarget: 'workspace-docs',
        serializedText: '# Team note\n',
        yjsStateBase64: '',
        activePeerCount: 1,
        pocketBaseRoomId: null,
        savedByPeerId: null,
        saveBoundary: 'explicit',
        ...args.overrides,
      } satisfies AgenticGraphCollaborationSaveRequest),
    },
  )
}

test('Worker publishes exact relay routes and browser CORS metadata', async () => {
  assert.equal(buildAgenticGraphStorageGitRelayPath(), '/api/storage/git/relay')
  assert.equal(buildAgenticGraphStorageFileSyncRelayPath(), '/api/storage/file-sync/relay')
  const worker = createAgenticGraphStorageWorker()
  const preflight = await worker.fetch(
    new Request(`http://localhost${buildAgenticGraphStorageFileSyncRelayPath()}`, {
      method: 'OPTIONS',
    }),
    { DB: null } as AgenticGraphStorageWorkerEnv,
  )
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-methods') || '', /\bPUT\b/)
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /\bx-agentic-graph-file-sync-meta\b/)
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /\bx-agentic-graph-content-sha256\b/)
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /\bx-client-request-id\b/)
  assert.equal(preflight.headers.get('access-control-expose-headers'), 'x-agentic-graph-file-sync-meta')

  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const response = await worker.fetch(relayRequest(buildAgenticGraphStorageGitRelayPath(), {
    action: 'resolve-ref',
    remoteId: 'origin',
  }), createEnv(db))
  assert.equal(response.status, 404)
  assert.equal((await response.json() as { code?: string }).code, 'provider_not_configured')
  assert.equal(response.headers.get('access-control-expose-headers'), 'x-agentic-graph-file-sync-meta')

  const chatSession = await worker.fetch(new Request('http://localhost/api/storage/chat/session', {
    headers: { authorization: `Bearer ${SESSION_TOKEN}` },
  }), createEnv(db))
  assert.equal(chatSession.status, 200, 'missing relay config must not break unrelated storage routes')
})

test('Worker assembles only explicitly configured file-sync providers', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const worker = createAgenticGraphStorageWorker()
  const response = await worker.fetch(relayRequest(buildAgenticGraphStorageFileSyncRelayPath(), {
    action: 'providers',
  }), createEnv(db, {
    AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN: 'google-token',
    AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ID: 'google-drive-id',
    AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ROOT_ID: 'google-root-id',
    AGENTIC_OS_STORAGE_ONEDRIVE_ACCESS_TOKEN: 'one-drive-token',
    AGENTIC_OS_STORAGE_ONEDRIVE_DRIVE_ID: 'one-drive-id',
    AGENTIC_OS_STORAGE_ONEDRIVE_ROOT_ID: 'one-drive-root-id',
  }))
  assert.equal(response.status, 200)
  const body = await response.json() as {
    providers?: Array<{ providerId?: string; providerType?: string }>
  }
  assert.deepEqual(body.providers, [
    { providerId: 'google-drive', label: 'Google Drive', providerType: 'google-drive' },
    { providerId: 'one-drive', label: 'OneDrive', providerType: 'one-drive' },
  ])
})

test('authenticated capability inspection reports exact configured remotes and renewable providers', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const request = new Request(`http://localhost${buildAgenticGraphStorageRelayCapabilitiesPath()}`, {
    headers: { authorization: `Bearer ${SESSION_TOKEN}` },
  })
  const response = await handleStorageRelayRequest({
    request,
    pathname: buildAgenticGraphStorageRelayCapabilitiesPath(),
    env: createEnv(db, {
      AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
      AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
      AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO: 'agentic-graph-repository',
      AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'dev/storage',
      AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_ID: 'google-client',
      AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET: 'google-client-secret',
      AGENTIC_OS_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN: 'google-refresh-secret',
      AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ROOT_ID: 'google-root-id',
    }),
    db,
  })
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.schema, 'agentic-graph-storage-relay-capabilities/v1')
  assert.equal(body.relayEnabled, true)
  assert.deepEqual(body.gitRemotes, [{
    remoteId: 'origin',
    branch: 'dev/storage',
    fetchPolicy: 'normalized-commits',
  }])
  assert.deepEqual(body.fileProviders, [{
    providerId: 'google-drive',
    label: 'Google Drive',
    providerType: 'google-drive',
    credentialMode: 'oauth-refresh',
  }])
  assert.equal(JSON.stringify(body).includes('secret'), false)

  const disabled = await handleStorageRelayRequest({
    request,
    pathname: buildAgenticGraphStorageRelayCapabilitiesPath(),
    env: { ...createEnv(db), AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'false' },
    db,
  })
  assert.equal(disabled.status, 200)
  assert.equal((await disabled.json() as { relayEnabled?: boolean }).relayEnabled, false)
})

test('Git relay requires an explicit branch and keeps upstream authority in Worker env', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const baseEnv = createEnv(db, {
    AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
    AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
    AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO: 'agentic-graph-repository',
    AGENTIC_OS_STORAGE_GIT_AGENTIC_OS_REMOTE_ID: 'origin-dev',
    AGENTIC_OS_STORAGE_GIT_ALLOWED_PATH_PREFIXES: 'docs',
  })
  let upstreamCalls = 0
  const fetcher: StorageRelayFetch = async (input, init) => {
    upstreamCalls += 1
    assert.equal(
      String(input),
      'https://api.github.com/repos/agentic-graph-owner/agentic-graph-repository/git/ref/heads/dev/storage',
    )
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-github-token')
    return new Response(JSON.stringify({
      ref: 'refs/heads/dev/storage',
      object: { type: 'commit', sha: COMMIT_OID },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const missingBranch = await handleStorageRelayRequest({
    request: relayRequest(buildAgenticGraphStorageGitRelayPath(), {
      action: 'resolve-ref',
      remoteId: 'origin-dev',
    }),
    pathname: buildAgenticGraphStorageGitRelayPath(),
    env: baseEnv,
    db,
    fetcher,
  })
  assert.equal(missingBranch.status, 404)
  assert.equal((await missingBranch.json() as { code?: string }).code, 'provider_not_configured')
  assert.equal(upstreamCalls, 0, 'Git relay must not fall back to main or another branch')

  const response = await handleStorageRelayRequest({
    request: relayRequest(buildAgenticGraphStorageGitRelayPath(), {
      action: 'resolve-ref',
      remoteId: 'origin-dev',
    }),
    pathname: buildAgenticGraphStorageGitRelayPath(),
    env: { ...baseEnv, AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'dev/storage' },
    db,
    fetcher,
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json() as { oid?: string }).oid, COMMIT_OID)
  assert.equal(upstreamCalls, 1)
})

test('collaboration save rejects unauthenticated or non-writer memberships before upstream calls', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const worker = createAgenticGraphStorageWorker()
  const env = createEnv(db, {
    AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
    AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
    AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO: 'workspace-repository',
    AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'main',
  })
  const previousFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = (async () => {
    upstreamCalls += 1
    return new Response(null, { status: 500 })
  }) as typeof fetch
  try {
    const unauthenticated = await worker.fetch(
      collaborationSaveRequest({ sessionToken: null }),
      env,
    )
    assert.equal(unauthenticated.status, 401)
    assert.equal((await unauthenticated.json() as { code?: string }).code, 'forbidden')

    const membership = db.workspaceMemberships.get('membership:relay')
    assert.ok(membership)
    membership.role = 'viewer'
    const viewer = await worker.fetch(collaborationSaveRequest(), env)
    assert.equal(viewer.status, 403)
    assert.equal((await viewer.json() as { code?: string }).code, 'forbidden')

    membership.role = 'editor'
    membership.status = 'invited'
    const inactive = await worker.fetch(collaborationSaveRequest(), env)
    assert.equal(inactive.status, 403)
    assert.equal((await inactive.json() as { code?: string }).code, 'forbidden')
    assert.equal(upstreamCalls, 0)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('collaboration save rejects non-loopback and mismatched Git origin before upstream calls', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const worker = createAgenticGraphStorageWorker()
  const env = createEnv(db, {
    AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
    AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
    AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO: 'agentic-graph-repository',
    AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO: 'workspace-repository',
    AGENTIC_OS_STORAGE_GIT_AGENTIC_OS_REMOTE_ID: 'agentic-graph-origin',
    AGENTIC_OS_STORAGE_GIT_WORKSPACE_REMOTE_ID: 'workspace-origin',
    AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'main',
  })
  const previousFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = (async () => {
    upstreamCalls += 1
    return new Response(null, { status: 500 })
  }) as typeof fetch
  try {
    const nonLoopback = await worker.fetch(collaborationSaveRequest({
      url: `https://storage.example.test${buildAgenticGraphCollaborationSavePath()}`,
    }), env)
    assert.equal(nonLoopback.status, 403)
    assert.equal((await nonLoopback.json() as { code?: string }).code, 'forbidden')

    const mismatchedOrigin = await worker.fetch(collaborationSaveRequest({
      overrides: { gitRemoteId: 'agentic-graph-origin' },
    }), env)
    assert.equal(mismatchedOrigin.status, 400)
    assert.equal((await mismatchedOrigin.json() as { code?: string }).code, 'bad_request')
    assert.equal(upstreamCalls, 0)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('collaboration delete reads the current SHA and issues one serialized GitHub delete', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const worker = createAgenticGraphStorageWorker()
  const env = createEnv(db, {
    AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
    AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
    AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO: 'workspace-repository',
    AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'main',
  })
  const previousFetch = globalThis.fetch
  const methods: string[] = []
  globalThis.fetch = (async (input, init = {}) => {
    methods.push(String(init.method || 'GET'))
    assert.match(String(input), /repos\/agentic-graph-owner\/workspace-repository\/contents\/docs\/team-note\.md/)
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer server-github-token')
    if (!init.method) return new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200 })
    assert.equal(init.method, 'DELETE')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    assert.equal(body.sha, 'a'.repeat(40))
    assert.equal(body.branch, 'main')
    return new Response(JSON.stringify({ commit: { sha: COMMIT_OID } }), { status: 200 })
  }) as typeof fetch
  try {
    const response = await worker.fetch(collaborationSaveRequest({
      overrides: { operation: 'delete' },
    }), env)
    assert.equal(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assert.equal(body.operation, 'delete')
    assert.equal(body.commitSha, COMMIT_OID)
    assert.equal(body.contentSha, null)
    assert.deepEqual(methods, ['GET', 'DELETE'])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Git relay resolves configured agentic-graph and workspace repositories by distinct remote IDs', async () => {
  const db = new FakeAgenticGraphStorageD1Database()
  await seedAuthorizedWorkspace(db)
  const env = createEnv(db, {
    AGENTIC_OS_STORAGE_GITHUB_TOKEN: 'server-github-token',
    AGENTIC_OS_STORAGE_GITHUB_OWNER: 'agentic-graph-owner',
    AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO: 'agentic-graph-repository',
    AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO: 'workspace-repository',
    AGENTIC_OS_STORAGE_GITHUB_BRANCH: 'dev/storage',
    AGENTIC_OS_STORAGE_GIT_ALLOWED_PATH_PREFIXES: 'docs',
  })
  const upstreamUrls: string[] = []
  const fetcher: StorageRelayFetch = async input => {
    upstreamUrls.push(String(input))
    return new Response(JSON.stringify({
      ref: 'refs/heads/dev/storage',
      object: { type: 'commit', sha: COMMIT_OID },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  for (const remoteId of ['origin', 'workspace-origin']) {
    const response = await handleStorageRelayRequest({
      request: relayRequest(buildAgenticGraphStorageGitRelayPath(), {
        action: 'resolve-ref',
        remoteId,
      }),
      pathname: buildAgenticGraphStorageGitRelayPath(),
      env,
      db,
      fetcher,
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json() as { remoteId?: string }).remoteId, remoteId)
  }
  assert.deepEqual(upstreamUrls, [
    'https://api.github.com/repos/agentic-graph-owner/agentic-graph-repository/git/ref/heads/dev/storage',
    'https://api.github.com/repos/agentic-graph-owner/workspace-repository/git/ref/heads/dev/storage',
  ])
})
