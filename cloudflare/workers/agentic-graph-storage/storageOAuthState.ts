/** Short-lived browser state. Provider tokens and credentials never enter URLs. */
export const OAUTH_COOKIE = '__Host-agentic-storage-oauth'
export const OAUTH_TTL_SECONDS = 300
export type OAuthProvider = 'github' | 'google'
export type OAuthState = {
  provider: OAuthProvider; clientId: string; origin: string; returnTo: string
  linkSessionHash?: string
  signup?: true
  state: string; verifier: string; nonce: string; issuedAt: number
}
const encode = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const decode = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(
  atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export const oauthRandom = (): string => encode(crypto.getRandomValues(new Uint8Array(32)))
export const oauthHash = async (text: string): Promise<string> => encode(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
const key = async (secret: string) => crypto.subtle.importKey('raw',
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`storage-oauth-v1:${secret}`)),
  'AES-GCM', false, ['encrypt', 'decrypt'])
export const sealOAuthState = async (state: OAuthState, secret: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = new TextEncoder().encode(JSON.stringify(state))
  if (body.length > 2400 || secret.length < 32) throw new Error('Invalid OAuth state configuration')
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), body))
  return `${encode(iv)}.${encode(encrypted)}`
}
export const openOAuthState = async (sealed: string, secret: string, now: number): Promise<OAuthState | null> => {
  try {
    if (sealed.length > 3400 || secret.length < 32 || !/^[\w-]+\.[\w-]+$/.test(sealed)) return null
    const [iv, body] = sealed.split('.')
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, await key(secret), decode(body))
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear)) as OAuthState
    if ((value.signup !== undefined && value.signup !== true) || (value.signup && value.linkSessionHash)
      || (value.linkSessionHash !== undefined && !/^[a-f0-9]{64}$/.test(value.linkSessionHash))
      || !['github', 'google'].includes(value.provider) || !Number.isSafeInteger(value.issuedAt)
      || value.issuedAt > now || now - value.issuedAt >= OAUTH_TTL_SECONDS * 1000
      || ![value.state, value.verifier, value.nonce].every(x => typeof x === 'string' && /^[\w-]{43}$/.test(x))
      || typeof value.clientId !== 'string' || typeof value.origin !== 'string'
      || typeof value.returnTo !== 'string' || !safeOAuthReturnTo(value.returnTo)) return null
    return value
  } catch { return null }
}
export const safeOAuthReturnTo = (raw: string): string | null => {
  if (raw.length > 1500 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\x00-\x20]/.test(raw)) return null
  const url = new URL(raw, 'https://storage.invalid')
  return url.origin === 'https://storage.invalid' ? `${url.pathname}${url.search}` : null
}
export const oauthCookie = (value: string): string =>
  `${OAUTH_COOKIE}=${value}; Path=/; Max-Age=${value ? OAUTH_TTL_SECONDS : 0}; Secure; HttpOnly; SameSite=Lax`
export const readOAuthCookie = (request: Request): string => {
  const values = (request.headers.get('cookie') || '').split(';').map(x => x.trim())
    .filter(x => x.startsWith(`${OAUTH_COOKIE}=`))
  return values.length === 1 ? values[0].slice(OAUTH_COOKIE.length + 1) : ''
}
