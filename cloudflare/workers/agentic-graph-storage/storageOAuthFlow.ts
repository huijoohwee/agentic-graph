import { oauthPageHeaders as headers, oauthLoginPage } from './storageOAuthPages'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS } from './contract'
import { hashAgenticGraphStorageAuthSessionToken, readAgenticGraphStorageBrowserSessionToken } from './chatAuth'
import { queryFirst, readActiveAuthSessionByHash, readAuthIdentityUser, type D1DatabaseLike } from './db'
import { admitOAuthRequest, consumeOAuthChallenge, saveOAuthChallenge } from './storageOAuthQuota'
import { exchangeOAuthIdentity, oauthAuthorizationUrl, OAuthFailure, OAUTH_ISSUERS, type OAuthConfiguration, type OAuthFetch } from './storageOAuthProviders'
import { oauthCookie, oauthRandom, openOAuthState, readOAuthCookie, safeOAuthReturnTo, sealOAuthState, type OAuthProvider, type OAuthState } from './storageOAuthState'

export const oauthFailureResponse = (status: number, message: string, clear = false): Response => new Response(message, {
  status, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8',
    ...(status === 429 ? { 'retry-after': '86400' } : {}), ...(clear ? { 'set-cookie': oauthCookie('') } : {}) },
})
export const runOAuthFlow = async (args: { request: Request; db: D1DatabaseLike; config: OAuthConfiguration;
  now: number; fetcher?: OAuthFetch }): Promise<Response | { userId: string; returnTo: string }> => {
  const { request, db, config, now } = args, url = new URL(request.url)
  const callback = url.pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.browserCallback
  try {
    if (callback) {
      if (request.method !== 'GET') throw new OAuthFailure(405, 'Sign-in callback requires GET.')
      const state = await openOAuthState(readOAuthCookie(request), config.secret, now)
      if (!state || !config.origins.includes(state.origin) || url.searchParams.getAll('state').length !== 1
        || url.searchParams.get('state') !== state.state) throw new OAuthFailure(401, 'Sign-in expired or browser state is invalid. Start again.')
      if (!await admitOAuthRequest(db, request, config.secret, now)) throw new OAuthFailure(429, 'Sign-in budget reached. Local files remain available.')
      if (!await consumeOAuthChallenge(db, state.state, now)) throw new OAuthFailure(401, 'This sign-in was already used or expired. Start again.')
      const code = url.searchParams.get('code') || ''
      if (url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1 || !/^[\x21-\x7e]{1,2048}$/.test(code)) {
        throw new OAuthFailure(401, 'Sign-in was cancelled or the authorization code is invalid.')
      }
      const subject = await exchangeOAuthIdentity(state, code, config, args.fetcher, now)
      const identityKey = { provider: state.provider, issuer: OAUTH_ISSUERS[state.provider], subject }
      if (state.linkSessionHash) {
        // The authenticated session is sealed into state; re-check revocation at callback.
        const session = await readActiveAuthSessionByHash(db, state.linkSessionHash, new Date(now).toISOString())
        if (!session || session.user_status !== 'active') throw new OAuthFailure(403, 'Sign in again before connecting another account.')
        const stamp = new Date(now).toISOString()
        await queryFirst(db, `INSERT INTO auth_identities (id, user_id, provider, issuer, subject, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.session_hash = ? AND auth_sessions.user_id = ?
              AND auth_sessions.revoked_at IS NULL AND auth_sessions.expires_at > ? AND users.status = 'active'
          ) ON CONFLICT(provider, issuer, subject) DO NOTHING RETURNING id`,
        [`oauth:${oauthRandom()}`, session.user_id, identityKey.provider, identityKey.issuer, subject, stamp, stamp,
          state.linkSessionHash, session.user_id, stamp])
        const linked = await readAuthIdentityUser(db, identityKey)
        if (!linked) throw new OAuthFailure(403, 'Sign in again before connecting another account.')
        if (linked.user_id !== session.user_id) throw new OAuthFailure(409, 'This identity is already connected to another account.')
        return new Response(null, { status: 303, headers: { ...headers, location: state.returnTo, 'set-cookie': oauthCookie('') } })
      }
      const identity = await readAuthIdentityUser(db, identityKey)
      if (!identity || identity.user_status !== 'active') throw new OAuthFailure(403,
        'This identity has no workspace access. Sign in with a connected account, then connect this provider from the sign-in page.')
      return { userId: identity.user_id, returnTo: state.returnTo }
    }
    const origin = url.searchParams.get('return_origin') || url.origin
    const returnTo = safeOAuthReturnTo(url.searchParams.get('return_to') || '/')
    if (!returnTo || !config.origins.includes(origin)) throw new OAuthFailure(400, 'Sign-in origin or return path is not allowed.')
    const token = readAgenticGraphStorageBrowserSessionToken(request)
    const sessionHash = token ? await hashAgenticGraphStorageAuthSessionToken(token) : ''
    const session = sessionHash ? await readActiveAuthSessionByHash(db, sessionHash, new Date(now).toISOString()) : null
    const canLink = session?.user_status === 'active'
    const provider = url.searchParams.get('provider') as OAuthProvider | null
    if (!provider && request.method === 'GET') return oauthLoginPage(config, origin, returnTo, canLink)
    if (!provider || !Object.hasOwn(config.clients, provider)) throw new OAuthFailure(400, 'Choose a configured sign-in provider.')
    const linking = url.searchParams.get('intent') === 'link'
    if (linking && (request.method !== 'POST' || request.headers.get('origin') !== url.origin || !canLink)) {
      throw new OAuthFailure(403, 'Connecting an account requires an active same-origin session.')
    }
    if (!linking && request.method !== 'GET') throw new OAuthFailure(405, 'Sign in requires GET.')
    if (!await admitOAuthRequest(db, request, config.secret, now)) throw new OAuthFailure(429, 'Sign-in budget reached. Local files remain available.')
    const state: OAuthState = { provider, origin, returnTo, clientId: config.clients[provider]!.id,
      state: oauthRandom(), verifier: oauthRandom(), nonce: oauthRandom(), issuedAt: now,
      ...(linking ? { linkSessionHash: sessionHash } : {}),
    }
    const sealed = await sealOAuthState(state, config.secret)
    await saveOAuthChallenge(db, state.state, now)
    return new Response(null, { status: 303, headers: { ...headers,
      location: await oauthAuthorizationUrl(state), 'set-cookie': oauthCookie(sealed) } })
  } catch (error) {
    return error instanceof OAuthFailure ? oauthFailureResponse(error.status, error.message, callback)
      : oauthFailureResponse(503, 'Sign-in storage is unavailable. Your local files remain available.', callback)
  }
}
