import {
  AGENTIC_OS_STORAGE_BROWSER_SESSION_COOKIE_NAME,
  hashAgenticGraphStorageAuthSessionToken,
} from '../../../../cloudflare/workers/agentic-graph-storage/chatAuth.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from './fake-agentic-graph-storage-d1'
import { createStorageWorkerRequest, readStorageWorker } from './fake-agentic-graph-storage-worker-fetch'

// A pre-seeded local session fixture. The real Worker validates its cookie and D1 membership.
export const createFakeAgenticGraphStorageBrowserSession = async (
  workspaceId: string,
  { origin = 'http://localhost', role = 'editor' }: {
    origin?: string
    role?: 'owner' | 'provider-admin' | 'editor' | 'viewer'
  } = {},
) => {
  const browserOrigin = new URL(origin).origin
  if (!/^https?:$/.test(new URL(browserOrigin).protocol)) throw new Error('Browser session fixture requires an HTTP origin')
  const env = {
    ...createFakeAgenticGraphStorageWorkerEnv(),
    AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'false',
    AGENTIC_OS_STORAGE_ACCESS_ISSUER: 'https://browser-fixture.cloudflareaccess.com',
    AGENTIC_OS_STORAGE_ACCESS_AUDIENCE: 'browser-fixture-audience',
    AGENTIC_OS_STORAGE_SIGNING_SECRET: 'browser-fixture-signing-secret-32-characters',
  }
  const userId = `user:browser-fixture:${workspaceId}`
  const sessionId = `session:browser-fixture:${workspaceId}`
  const membershipId = `membership:browser-fixture:${workspaceId}`
  const sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const cookie = `${AGENTIC_OS_STORAGE_BROWSER_SESSION_COOKIE_NAME}=${sessionToken}`
  const now = new Date().toISOString()
  env.DB.workspaces.set(workspaceId, {
    id: workspaceId, slug: workspaceId, title: 'Browser session fixture', visibility: 'private', created_at: now, updated_at: now,
  })
  env.DB.users.set(userId, {
    id: userId, email: 'browser-fixture@example.invalid', display_name: 'Browser fixture', status: 'active', created_at: now, updated_at: now,
  })
  env.DB.authSessions.set(sessionId, {
    id: sessionId, user_id: userId, session_hash: await hashAgenticGraphStorageAuthSessionToken(sessionToken),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), revoked_at: null, created_at: now, updated_at: now,
  })
  env.DB.workspaceMemberships.set(membershipId, {
    id: membershipId, workspace_id: workspaceId, user_id: userId, role, status: 'active', created_at: now, updated_at: now,
  })
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = createStorageWorkerRequest(input, init)
    const url = new URL(request.url)
    if (url.origin !== browserOrigin || !url.pathname.startsWith('/api/storage/')) {
      throw new Error(`Unexpected browser storage fixture request: ${request.url}`)
    }
    const headers = new Headers(request.headers)
    if (request.credentials !== 'omit' && !headers.has('cookie')) headers.set('cookie', cookie)
    if (/^(POST|PUT|PATCH|DELETE)$/.test(request.method) && !headers.has('origin')) headers.set('origin', browserOrigin)
    return readStorageWorker().fetch(new Request(request, { headers }), env as never)
  }) as typeof globalThis.fetch
  return { env, origin: browserOrigin, cookie, sessionToken, userId, sessionId, membershipId, fetch }
}
