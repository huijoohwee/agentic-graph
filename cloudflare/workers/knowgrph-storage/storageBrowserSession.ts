import {
  readAccessJwtConfiguration,
  verifyAccessJwt,
  type AccessJwtConfiguration,
} from '../knowgrph-travel-operator-gateway/access-jwt'
import {
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageErrorResponse,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import {
  hashKnowgrphStorageAuthSessionToken,
  hasRelayAccessRole,
  KNOWGRPH_STORAGE_BROWSER_SESSION_COOKIE_NAME,
  readAuthenticatedBrowserSessionContext,
  readKnowgrphStorageBrowserSessionToken,
  readAuthorizedMembership,
} from './chatAuth'
import {
  type D1DatabaseLike,
  normalizeString,
  readAuthIdentityUser,
  readWorkspaceMembershipRowsByUser,
  revokeAuthSessionByHash,
  writeAuthSession,
} from './db'

const BROWSER_IDENTITY_PROVIDER = 'cloudflare-access'
const DEFAULT_BROWSER_SESSION_TTL_SECONDS = 900
const MIN_BROWSER_SESSION_TTL_SECONDS = 300
const MAX_BROWSER_SESSION_TTL_SECONDS = 3_600

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,x-client-request-id,x-knowgrph-session-token',
  'access-control-max-age': '86400',
}

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  ...CORS_HEADERS,
}

const json = (status: number, body: unknown, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(jsonHeaders)
  for (const [key, value] of new Headers(headers).entries()) responseHeaders.set(key, value)
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

const errorResponse = (
  status: number,
  code: KnowgrphStorageErrorResponse['code'],
  error: string,
): Response => json(status, {
  ok: false,
  apiVersion: KNOWGRPH_STORAGE_API_VERSION,
  error,
  code,
} satisfies KnowgrphStorageErrorResponse)

type BrowserSessionConfiguration = {
  access: AccessJwtConfiguration
  ttlSeconds: number
}

type BrowserSessionConfigurationResult =
  | { ok: true; value: BrowserSessionConfiguration }
  | { ok: false }

const readTtlSeconds = (value: unknown): number | null => {
  const raw = normalizeString(value)
  if (!raw) return DEFAULT_BROWSER_SESSION_TTL_SECONDS
  const parsed = Number(raw)
  return Number.isInteger(parsed)
    && parsed >= MIN_BROWSER_SESSION_TTL_SECONDS
    && parsed <= MAX_BROWSER_SESSION_TTL_SECONDS
    ? parsed
    : null
}

/**
 * The browser-session audience is deliberately storage-specific. It is never
 * inherited from a sibling Worker or from a browser build-time environment.
 */
export const readKnowgrphStorageBrowserSessionConfiguration = (
  env: KnowgrphStorageWorkerEnv,
): BrowserSessionConfigurationResult => {
  const access = readAccessJwtConfiguration({
    ACCESS_ISSUER: env.KNOWGRPH_STORAGE_ACCESS_ISSUER,
    ACCESS_AUDIENCE: env.KNOWGRPH_STORAGE_ACCESS_AUDIENCE,
    ACCESS_JWKS_TIMEOUT_MS: env.KNOWGRPH_STORAGE_ACCESS_JWKS_TIMEOUT_MS,
    ACCESS_JWKS_CACHE_TTL_MS: env.KNOWGRPH_STORAGE_ACCESS_JWKS_CACHE_TTL_MS,
  })
  const ttlSeconds = readTtlSeconds(env.KNOWGRPH_STORAGE_BROWSER_SESSION_TTL_SECONDS)
  if (access.ok === false || ttlSeconds === null) return { ok: false }
  return { ok: true, value: { access: access.value, ttlSeconds } }
}

const isUnsafeMethod = (method: string): boolean =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase())

/**
 * Cookie-authenticated writes are intentionally same-origin. Bearer clients
 * remain supported for server-to-server integrations and do not need Origin.
 */
export const isKnowgrphStorageSameOriginCookieMutation = (request: Request): boolean => {
  if (!isUnsafeMethod(request.method) || !readKnowgrphStorageBrowserSessionToken(request)) return true
  const origin = normalizeString(request.headers.get('origin'))
  try {
    return !!origin && origin === new URL(request.url).origin
  } catch {
    return false
  }
}

const createOpaqueToken = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

const buildBrowserSessionCookie = (token: string, maxAgeSeconds: number): string =>
  `${KNOWGRPH_STORAGE_BROWSER_SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Strict`

const buildClearedBrowserSessionCookie = (): string =>
  `${KNOWGRPH_STORAGE_BROWSER_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict`

const readReturnTo = (request: Request): string | null => {
  const raw = String(new URL(request.url).searchParams.get('return_to') || '').trim()
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n]/.test(raw)) {
    return null
  }
  try {
    const requestUrl = new URL(request.url)
    const target = new URL(raw, requestUrl.origin)
    if (target.origin !== requestUrl.origin) return null
    return `${target.pathname}${target.search}`
  } catch {
    return null
  }
}

type AccessJwtVerifier = (
  token: string,
  config: AccessJwtConfiguration,
) => ReturnType<typeof verifyAccessJwt>

type BrowserSessionDependencies = {
  now?: () => Date
  verifyAccessToken?: AccessJwtVerifier
  createOpaqueToken?: (byteLength: number) => string
}

const activeMembershipExists = async (db: D1DatabaseLike, userId: string): Promise<boolean> => {
  const memberships = await readWorkspaceMembershipRowsByUser(db, userId)
  return memberships.some(membership => normalizeString(membership.status) === 'active')
}

const handleLogin = async (args: {
  request: Request
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike
  dependencies?: BrowserSessionDependencies
}): Promise<Response> => {
  const configuration = readKnowgrphStorageBrowserSessionConfiguration(args.env)
  if (configuration.ok === false) {
    return errorResponse(503, 'server_error', 'storage browser session access configuration is unavailable')
  }
  const returnTo = readReturnTo(args.request)
  if (!returnTo) return errorResponse(400, 'bad_request', 'return_to must be a same-origin relative path')
  const accessToken = normalizeString(args.request.headers.get('cf-access-jwt-assertion'))
  if (!accessToken) return errorResponse(401, 'forbidden', 'Cloudflare Access authentication is required')
  const verify = args.dependencies?.verifyAccessToken || verifyAccessJwt
  const verified = await verify(accessToken, configuration.value.access)
  if (verified.ok === false) return errorResponse(401, 'forbidden', 'Cloudflare Access authentication is invalid or expired')
  const identity = await readAuthIdentityUser(args.db, {
    provider: BROWSER_IDENTITY_PROVIDER,
    issuer: configuration.value.access.issuer,
    subject: verified.sub,
  })
  if (!identity || normalizeString(identity.user_status) !== 'active') {
    return errorResponse(403, 'forbidden', 'storage access has not been provisioned for this identity')
  }
  if (!await activeMembershipExists(args.db, identity.user_id)) {
    return errorResponse(403, 'forbidden', 'an active workspace membership is required')
  }
  const now = args.dependencies?.now?.() || new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + configuration.value.ttlSeconds * 1_000).toISOString()
  const generateOpaqueToken = args.dependencies?.createOpaqueToken || createOpaqueToken
  const token = generateOpaqueToken(32)
  const sessionId = `browser:${generateOpaqueToken(16)}`
  await writeAuthSession(args.db, {
    id: sessionId,
    userId: identity.user_id,
    sessionHash: await hashKnowgrphStorageAuthSessionToken(token),
    expiresAt,
    nowIso,
  })
  return new Response(null, {
    status: 303,
    headers: {
      location: returnTo,
      'cache-control': 'no-store',
      'set-cookie': buildBrowserSessionCookie(token, configuration.value.ttlSeconds),
      ...CORS_HEADERS,
    },
  })
}

const handleSession = async (args: {
  request: Request
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike
}): Promise<Response> => {
  if (readKnowgrphStorageBrowserSessionConfiguration(args.env).ok === false) {
    return errorResponse(503, 'server_error', 'storage browser session access configuration is unavailable')
  }
  const auth = await readAuthenticatedBrowserSessionContext(args.request, args.db)
  if (auth.ok === false) return auth.response
  if (auth.value.credentialSource !== 'cookie') {
    return errorResponse(401, 'forbidden', 'storage browser session cookie is required')
  }
  const workspaceId = normalizeString(new URL(args.request.url).searchParams.get('workspace_id'))
  if (!workspaceId) return errorResponse(400, 'bad_request', 'workspace_id is required')
  const membership = await readAuthorizedMembership({
    db: args.db,
    workspaceId,
    userId: auth.value.user.id,
  })
  if (membership.ok === false) return membership.response
  if (membership.membership.status !== 'active' || !hasRelayAccessRole(membership.membership.role)) {
    return errorResponse(403, 'forbidden', 'active editor, owner, or provider-admin membership is required')
  }
  return json(200, {
    ok: true,
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    authenticated: true,
    workspaceId,
    session: { expiresAt: auth.value.session.expiresAt },
  })
}

const handleLogout = async (args: {
  request: Request
  db: D1DatabaseLike | null
  dependencies?: BrowserSessionDependencies
}): Promise<Response> => {
  const token = readKnowgrphStorageBrowserSessionToken(args.request)
  if (token && args.db) {
    const nowIso = (args.dependencies?.now?.() || new Date()).toISOString()
    try {
      await revokeAuthSessionByHash(args.db, {
        sessionHash: await hashKnowgrphStorageAuthSessionToken(token),
        nowIso,
      })
    } catch {
      // Clearing a browser cookie must not be held hostage by a broken or
      // already-migrated-away session row. The short server expiry still
      // limits a session if revocation cannot be recorded.
    }
  }
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'set-cookie': buildClearedBrowserSessionCookie(),
      ...CORS_HEADERS,
    },
  })
}

export const isKnowgrphStorageBrowserSessionRoute = (pathname: string): boolean =>
  pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserLogin
  || pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserSession
  || pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserLogout

export const handleKnowgrphStorageBrowserSessionRoute = async (args: {
  request: Request
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike | null
  dependencies?: BrowserSessionDependencies
}): Promise<Response> => {
  const pathname = new URL(args.request.url).pathname
  if (pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserLogin) {
    if (args.request.method !== 'GET') return errorResponse(405, 'bad_request', 'storage browser login requires GET')
    if (!args.db) return errorResponse(500, 'server_error', 'missing Cloudflare D1 binding DB')
    return handleLogin({ ...args, db: args.db })
  }
  if (pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserSession) {
    if (args.request.method !== 'GET') return errorResponse(405, 'bad_request', 'storage browser session requires GET')
    if (!args.db) return errorResponse(500, 'server_error', 'missing Cloudflare D1 binding DB')
    return handleSession({ ...args, db: args.db })
  }
  if (pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.browserLogout) {
    if (args.request.method !== 'POST') return errorResponse(405, 'bad_request', 'storage browser logout requires POST')
    return handleLogout({ ...args, db: args.db })
  }
  return errorResponse(404, 'not_found', 'storage browser session route not found')
}
