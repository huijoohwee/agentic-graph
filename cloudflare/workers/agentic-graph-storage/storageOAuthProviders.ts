import { verifyAccessJwt } from '../agentic-graph-travel-operator-gateway/access-jwt'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS, type AgenticGraphStorageWorkerEnv } from './contract'
import { oauthHash, type OAuthProvider, type OAuthState } from './storageOAuthState'

type Client = { id: string; secret: string }
export type OAuthConfiguration = { secret: string; origins: string[]; clients: Partial<Record<OAuthProvider, Client>> }
export const OAUTH_ISSUERS = { github: 'https://github.com', google: 'https://accounts.google.com' } as const
const CALLBACK = AGENTIC_OS_STORAGE_ROUTE_PATHS.browserCallback
export const readOAuthConfiguration = (env: AgenticGraphStorageWorkerEnv): OAuthConfiguration | null => {
  try {
    const secret = env.AGENTIC_OS_STORAGE_SIGNING_SECRET || ''
    const origins: unknown = JSON.parse(env.AGENTIC_OS_STORAGE_OAUTH_ORIGINS || '[]')
    if (secret.length < 32 || !Array.isArray(origins) || !origins.length || origins.length > 4
      || !origins.every(raw => {
        if (typeof raw !== 'string') return false
        const url = new URL(raw)
        return url.origin === raw && !url.username && !url.password
          && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      })) return null
    const clients: OAuthConfiguration['clients'] = {}
    for (const [provider, id, clientSecret] of [
      ['github', env.AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_ID, env.AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_SECRET],
      ['google', env.AGENTIC_OS_STORAGE_GOOGLE_CLIENT_ID, env.AGENTIC_OS_STORAGE_GOOGLE_CLIENT_SECRET],
    ] as const) {
      if (!id && !clientSecret) continue
      if (!id || !clientSecret || !/^[A-Za-z0-9._-]{8,256}$/.test(id)
        || clientSecret.length < 16 || clientSecret.length > 256 || /\s/.test(clientSecret)) return null
      clients[provider] = { id, secret: clientSecret }
    }
    return Object.keys(clients).length ? { secret, origins, clients } : null
  } catch { return null }
}
export class OAuthFailure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
export type OAuthFetch = typeof fetch
const boundedJson = async (response: Response): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    await response.body?.cancel()
    throw new OAuthFailure(response.status === 429 || response.status === 403 ? 429 : 502, 'Sign-in provider unavailable. Try again later.')
  }
  if (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')) {
    await response.body?.cancel()
    throw new OAuthFailure(429, 'Sign-in provider quota reached. Try again later.')
  }
  if (!response.body || Number(response.headers.get('content-length') || 0) > 65536) {
    await response.body?.cancel()
    throw new OAuthFailure(502, 'Invalid sign-in provider response.')
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) { await reader.cancel(); throw new OAuthFailure(502, 'Sign-in provider response too large.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.error) throw new OAuthFailure(401, 'Sign-in was not accepted.')
  return value
}
const providerJson = async (url: string, init: RequestInit, fetcher: OAuthFetch): Promise<Record<string, unknown>> => {
  try {
    return await boundedJson(await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) }))
  } catch (error) {
    if (error instanceof OAuthFailure) throw error
    throw new OAuthFailure(502, 'Sign-in provider unavailable. Try again later.')
  }
}
export const oauthAuthorizationUrl = async (state: OAuthState): Promise<string> => {
  const url = new URL(state.provider === 'github' ? 'https://github.com/login/oauth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: state.clientId, redirect_uri: state.origin + CALLBACK,
    response_type: 'code', state: state.state, code_challenge: await oauthHash(state.verifier), code_challenge_method: 'S256',
    ...(state.provider === 'google' ? { scope: 'openid', nonce: state.nonce } : { allow_signup: 'false' }),
  }).toString()
  return url.href
}
export const exchangeOAuthIdentity = async (state: OAuthState, code: string, config: OAuthConfiguration,
  fetcher: OAuthFetch = fetch, now = Date.now()): Promise<string> => {
  const client = config.clients[state.provider]
  if (!client || client.id !== state.clientId) throw new OAuthFailure(401, 'Sign-in configuration changed. Start again.')
  const token = await providerJson(state.provider === 'github' ? 'https://github.com/login/oauth/access_token' : 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, code,
      redirect_uri: state.origin + CALLBACK, code_verifier: state.verifier, grant_type: 'authorization_code' }),
  }, fetcher)
  if (state.provider === 'github') {
    if (typeof token.access_token !== 'string' || !/^ghu_[A-Za-z0-9_]{16,512}$/.test(token.access_token)
      || token.token_type !== 'bearer' || token.scope !== '') throw new OAuthFailure(401, 'A GitHub App user token is required.')
    const user = await providerJson('https://api.github.com/user', { headers: {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token.access_token}`,
      'user-agent': 'agentic-storage', 'x-github-api-version': '2022-11-28',
    } }, fetcher)
    if (!Number.isSafeInteger(user.id) || Number(user.id) < 1) throw new OAuthFailure(401, 'Invalid GitHub identity.')
    return String(user.id)
  }
  if (typeof token.id_token !== 'string') throw new OAuthFailure(401, 'Google identity token is missing.')
  const verified = await verifyAccessJwt(token.id_token, { issuer: OAUTH_ISSUERS.google, audience: client.id,
    jwksTimeoutMs: 5000, jwksCacheTtlMs: 300000 }, request => fetcher('https://www.googleapis.com/oauth2/v3/certs', {
      signal: request.signal, redirect: 'error', headers: { accept: 'application/json' },
    }), () => now)
  if (!verified.ok) throw new OAuthFailure(401, 'Google identity could not be verified.')
  // Inspect nonce only after the existing bounded RS256 verifier authenticates all claims.
  const claims = JSON.parse(atob(token.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  if (claims.nonce !== state.nonce || (claims.azp !== undefined && claims.azp !== client.id)
    || (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== client.id)
    || !Number.isSafeInteger(claims.iat) || claims.iat > Math.floor(now / 1000) + 30
    || claims.iat < Math.floor(state.issuedAt / 1000) - 30) throw new OAuthFailure(401, 'Google sign-in binding is invalid.')
  return verified.sub
}
