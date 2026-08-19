const MAX_JWT_BYTES = 16 * 1_024
const MAX_JWKS_BYTES = 64 * 1_024
const MAX_JWKS_KEYS = 8
const MAX_CACHED_ISSUERS = 4
const BASE64URL = /^[A-Za-z0-9_-]+$/

export type AccessJwtConfiguration = Readonly<{
  issuer: string
  audience: string
  jwksTimeoutMs: number
  jwksCacheTtlMs: number
}>

export type AccessJwtConfigurationResult =
  | Readonly<{ ok: true; value: AccessJwtConfiguration }>
  | Readonly<{ ok: false; fields: readonly string[] }>

export type AccessJwtEnv = Readonly<{
  ACCESS_ISSUER?: string
  ACCESS_AUDIENCE?: string
  ACCESS_JWKS_TIMEOUT_MS?: string
  ACCESS_JWKS_CACHE_TTL_MS?: string
}>

type CachedJwks = Readonly<{
  expiresAt: number
  keys: ReadonlyMap<string, JsonWebKey>
}>

type JwksFetch = (request: Request) => Promise<Response>

const jwksCache = new Map<string, CachedJwks>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const configuredIssuer = (value: unknown): string | null => {
  const candidate = typeof value === 'string' ? value.trim() : ''
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.pathname !== '/' || url.search || url.hash
      || !url.hostname.endsWith('.cloudflareaccess.com')
      || url.hostname.startsWith('replace-with-')) return null
    return url.origin
  } catch {
    return null
  }
}

const configuredAudience = (value: unknown): string | null => {
  const candidate = typeof value === 'string' ? value.trim() : ''
  return candidate.length >= 16 && candidate.length <= 256
    && BASE64URL.test(candidate) && !candidate.startsWith('replace-with-')
    ? candidate
    : null
}

const configuredInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null => {
  const candidate = value == null || value === '' ? fallback : Number(value)
  return Number.isInteger(candidate) && candidate >= minimum && candidate <= maximum
    ? candidate
    : null
}

export const readAccessJwtConfiguration = (env: AccessJwtEnv): AccessJwtConfigurationResult => {
  const issuer = configuredIssuer(env.ACCESS_ISSUER)
  const audience = configuredAudience(env.ACCESS_AUDIENCE)
  const jwksTimeoutMs = configuredInteger(env.ACCESS_JWKS_TIMEOUT_MS, 3_000, 100, 5_000)
  const jwksCacheTtlMs = configuredInteger(env.ACCESS_JWKS_CACHE_TTL_MS, 300_000, 60_000, 3_600_000)
  const fields: string[] = []
  if (!issuer) fields.push('ACCESS_ISSUER')
  if (!audience) fields.push('ACCESS_AUDIENCE')
  if (jwksTimeoutMs === null) fields.push('ACCESS_JWKS_TIMEOUT_MS')
  if (jwksCacheTtlMs === null) fields.push('ACCESS_JWKS_CACHE_TTL_MS')
  if (!issuer || !audience || jwksTimeoutMs === null || jwksCacheTtlMs === null) {
    return Object.freeze({ ok: false, fields: Object.freeze(fields) })
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ issuer, audience, jwksTimeoutMs, jwksCacheTtlMs }),
  })
}

const decodeBase64Url = (value: string, maxBytes: number): Uint8Array | null => {
  if (!value || !BASE64URL.test(value) || value.length > Math.ceil(maxBytes * 4 / 3) + 4) return null
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0))
    return bytes.byteLength <= maxBytes ? bytes : null
  } catch {
    return null
  }
}

const decodeJsonPart = (value: string, maxBytes: number): Record<string, unknown> | null => {
  const bytes = decodeBase64Url(value, maxBytes)
  if (!bytes) return null
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const parsed: unknown = JSON.parse(decoded)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

const readBoundedJson = async (response: Response): Promise<unknown> => {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    if (response.body) await response.body.cancel()
    return null
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_JWKS_BYTES) {
    if (response.body) await response.body.cancel()
    return null
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_JWKS_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

const parseJwks = (value: unknown): ReadonlyMap<string, JsonWebKey> | null => {
  if (!isRecord(value) || !Array.isArray(value.keys)
    || value.keys.length < 1 || value.keys.length > MAX_JWKS_KEYS) return null
  const keys = new Map<string, JsonWebKey>()
  for (const item of value.keys) {
    if (!isRecord(item)) return null
    const kid = typeof item.kid === 'string' ? item.kid : ''
    const modulus = typeof item.n === 'string' ? item.n : ''
    const exponent = typeof item.e === 'string' ? item.e : ''
    if (!kid || kid.length > 256 || !BASE64URL.test(kid) || keys.has(kid)
      || item.kty !== 'RSA' || item.alg !== 'RS256' || item.use !== 'sig'
      || !modulus || modulus.length > 2_048 || !BASE64URL.test(modulus)
      || !exponent || exponent.length > 16 || !BASE64URL.test(exponent)) return null
    keys.set(kid, Object.freeze({ kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: modulus, e: exponent }))
  }
  return keys
}

const loadJwks = async (
  config: AccessJwtConfiguration,
  fetchJwks: JwksFetch,
  nowMs: () => number,
  forceRefresh = false,
): Promise<ReadonlyMap<string, JsonWebKey> | null> => {
  const now = nowMs()
  const cached = jwksCache.get(config.issuer)
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.keys
  try {
    const response = await fetchJwks(new Request(`${config.issuer}/cdn-cgi/access/certs`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(config.jwksTimeoutMs),
    }))
    if (!response.ok) {
      if (response.body) await response.body.cancel()
      return null
    }
    const keys = parseJwks(await readBoundedJson(response))
    if (!keys) return null
    if (!jwksCache.has(config.issuer) && jwksCache.size >= MAX_CACHED_ISSUERS) {
      const oldest = jwksCache.keys().next().value as string | undefined
      if (oldest) jwksCache.delete(oldest)
    }
    jwksCache.set(config.issuer, Object.freeze({ expiresAt: now + config.jwksCacheTtlMs, keys }))
    return keys
  } catch {
    return null
  }
}

const validAudience = (claim: unknown, expected: string): boolean =>
  claim === expected || (Array.isArray(claim) && claim.length <= 8
    && claim.every(value => typeof value === 'string') && claim.includes(expected))

export const verifyAccessJwt = async (
  token: string,
  config: AccessJwtConfiguration,
  fetchJwks: JwksFetch = fetch,
  nowMs: () => number = Date.now,
): Promise<Readonly<{ ok: true; sub: string }> | Readonly<{ ok: false }>> => {
  if (new TextEncoder().encode(token).byteLength > MAX_JWT_BYTES) return Object.freeze({ ok: false })
  const parts = token.split('.')
  if (parts.length !== 3) return Object.freeze({ ok: false })
  const header = decodeJsonPart(parts[0], 2_048)
  const claims = decodeJsonPart(parts[1], 8_192)
  const signature = decodeBase64Url(parts[2], 1_024)
  const kid = header && typeof header.kid === 'string' ? header.kid : ''
  if (!header || header.alg !== 'RS256' || !kid || kid.length > 256 || !BASE64URL.test(kid)
    || !claims || !signature) return Object.freeze({ ok: false })
  const nowSeconds = Math.floor(nowMs() / 1_000)
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (claims.iss !== config.issuer || !validAudience(claims.aud, config.audience)
    || !Number.isInteger(claims.exp) || (claims.exp as number) <= nowSeconds
    || (claims.nbf != null && (!Number.isInteger(claims.nbf) || (claims.nbf as number) > nowSeconds))
    || !sub || sub.length > 256 || /[\u0000-\u001f\u007f]/u.test(sub)) {
    return Object.freeze({ ok: false })
  }
  let keys = await loadJwks(config, fetchJwks, nowMs)
  let jwk = keys?.get(kid)
  if (!jwk && keys) {
    // Access publishes current and previous keys. A cache miss can therefore
    // be a legitimate rotation; perform exactly one bounded refresh.
    keys = await loadJwks(config, fetchJwks, nowMs, true)
    jwk = keys?.get(kid)
  }
  if (!jwk) return Object.freeze({ ok: false })
  try {
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    )
    const verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, new Uint8Array(signature),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    return verified ? Object.freeze({ ok: true, sub }) : Object.freeze({ ok: false })
  } catch {
    return Object.freeze({ ok: false })
  }
}

export const probeAccessJwks = async (
  config: AccessJwtConfiguration,
  fetchJwks: JwksFetch = fetch,
  nowMs: () => number = Date.now,
): Promise<boolean> => (await loadJwks(config, fetchJwks, nowMs)) !== null

export const resetAccessJwksCacheForTest = (): void => jwksCache.clear()
