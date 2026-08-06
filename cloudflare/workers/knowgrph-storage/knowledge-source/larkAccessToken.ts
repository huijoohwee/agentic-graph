import type { KnowgrphKnowledgeSourceIdentityMode, KnowgrphStorageWorkerEnv } from '../contract'
import {
  discardStorageRelayResponse,
  readStorageRelayJsonResponse,
  type StorageRelayOperation,
} from '../storage-relay/storageRelaySafety'
import {
  KnowledgeSourceError,
  isKnowledgeSourcePlaceholder,
  isKnowledgeSourceRecord,
  readKnowledgeSourceText,
} from './knowledgeSourceContract'

const LARK_TENANT_TOKEN_URL =
  'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal'
const MAX_TOKEN_LENGTH = 16_384
const TENANT_REFRESH_WINDOW_MS = 30 * 60_000
export const LARK_USER_TOKEN_MIN_VALIDITY_MS = 5 * 60_000

export interface LarkAccessTokenSource {
  readonly mode: KnowgrphKnowledgeSourceIdentityMode
  readonly canRefresh: boolean
  read(operation: StorageRelayOperation): Promise<string>
  invalidate(token: string): void
}

type TenantTokenCacheState = {
  key: string
  mode: 'tenant-app'
  accessToken: string | null
  reusableUntilMs: number
}

type UserTokenCacheState = {
  key: string
  mode: 'user-oauth'
  token: string
  expiresAtMs: number
  invalidated: boolean
}

type LarkTokenCacheState = TenantTokenCacheState | UserTokenCacheState

const assertSecret = (value: unknown): string => {
  const text = readKnowledgeSourceText(value)
  if (
    isKnowledgeSourcePlaceholder(text)
    || text.length > MAX_TOKEN_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(text)
  ) {
    throw new KnowledgeSourceError({ code: 'identity_not_available', status: 503 })
  }
  return text
}

class PreprovisionedUserTokenSource implements LarkAccessTokenSource {
  readonly mode = 'user-oauth' as const
  readonly canRefresh = false

  constructor(private readonly state: UserTokenCacheState, private readonly now: () => number) {}

  async read(): Promise<string> {
    if (
      this.state.invalidated
      || this.now() + LARK_USER_TOKEN_MIN_VALIDITY_MS >= this.state.expiresAtMs
    ) {
      throw new KnowledgeSourceError({ code: 'identity_not_available', status: 503 })
    }
    return this.state.token
  }

  invalidate(token: string): void {
    if (token === this.state.token) this.state.invalidated = true
  }
}

class TenantAppTokenSource implements LarkAccessTokenSource {
  readonly mode = 'tenant-app' as const
  readonly canRefresh = true
  private inFlight: Promise<string> | null = null

  constructor(private readonly args: {
    appId: string
    appSecret: string
    state: TenantTokenCacheState
    now?: () => number
  }) {}

  async read(operation: StorageRelayOperation): Promise<string> {
    const now = (this.args.now ?? Date.now)()
    if (this.args.state.accessToken && now < this.args.state.reusableUntilMs) {
      return this.args.state.accessToken
    }
    this.inFlight ??= this.refresh(operation).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  invalidate(token: string): void {
    if (token === this.args.state.accessToken) {
      this.args.state.accessToken = null
      this.args.state.reusableUntilMs = 0
    }
  }

  private async refresh(operation: StorageRelayOperation): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await operation.fetch(LARK_TENANT_TOKEN_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ app_id: this.args.appId, app_secret: this.args.appSecret }),
      })
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        await discardStorageRelayResponse(response)
        continue
      }
      if (!response.ok) {
        const status = response.status
        await discardStorageRelayResponse(response)
        if (status === 429) {
          throw new KnowledgeSourceError({ code: 'rate_limited', status: 503, retryable: true })
        }
        if (status >= 500) {
          throw new KnowledgeSourceError({ code: 'upstream_unavailable', status: 502, retryable: true })
        }
        throw new KnowledgeSourceError({ code: 'provider_auth_failed', status: 502 })
      }
      const body = await readStorageRelayJsonResponse<unknown>(response, operation.budget)
      if (!isKnowledgeSourceRecord(body) || body.code !== 0) {
        throw new KnowledgeSourceError({ code: 'provider_auth_failed', status: 502 })
      }
      const token = assertSecret(body.tenant_access_token)
      const expiresSeconds = Number(body.expire)
      if (!Number.isFinite(expiresSeconds) || expiresSeconds <= 0 || expiresSeconds > 7_200) {
        throw new KnowledgeSourceError({ code: 'invalid_response', status: 502 })
      }
      const expiresMs = Math.floor(expiresSeconds * 1_000)
      const refreshWindowMs = expiresMs > TENANT_REFRESH_WINDOW_MS
        ? TENANT_REFRESH_WINDOW_MS
        : Math.max(1_000, Math.floor(expiresMs / 2))
      this.args.state.accessToken = token
      this.args.state.reusableUntilMs = (this.args.now ?? Date.now)() + expiresMs - refreshWindowMs
      return token
    }
    throw new KnowledgeSourceError({ code: 'upstream_unavailable', status: 502, retryable: true })
  }
}

let cachedTokenState: LarkTokenCacheState | null = null

const digestIdentityConfig = async (values: readonly string[]): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(values)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const createLarkAccessTokenSource = async (
  env: KnowgrphStorageWorkerEnv,
  options: { now?: () => number; cache?: boolean } = {},
): Promise<LarkAccessTokenSource> => {
  const shouldCache = options.cache ?? options.now == null
  const mode = readKnowledgeSourceText(env.KNOWGRPH_STORAGE_LARK_IDENTITY_MODE)
  if (isKnowledgeSourcePlaceholder(mode)) {
    throw new KnowledgeSourceError({ code: 'identity_unresolved', status: 503 })
  }
  if (mode === 'tenant-app') {
    const appId = assertSecret(env.KNOWGRPH_STORAGE_LARK_APP_ID)
    const appSecret = assertSecret(env.KNOWGRPH_STORAGE_LARK_APP_SECRET)
    const key = await digestIdentityConfig([mode, appId, appSecret])
    const state: TenantTokenCacheState = shouldCache
      && cachedTokenState?.mode === mode
      && cachedTokenState.key === key
      ? cachedTokenState
      : { key, mode, accessToken: null, reusableUntilMs: 0 }
    if (shouldCache) cachedTokenState = state
    const source = new TenantAppTokenSource({
      appId,
      appSecret,
      state,
      now: options.now,
    })
    return source
  }
  if (mode === 'user-oauth') {
    const accessToken = assertSecret(env.KNOWGRPH_STORAGE_LARK_USER_ACCESS_TOKEN)
    const expiresAtText = readKnowledgeSourceText(
      env.KNOWGRPH_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS,
    )
    const expiresAtMs = Number(expiresAtText)
    const now = options.now ?? Date.now
    if (
      isKnowledgeSourcePlaceholder(expiresAtText)
      || !Number.isSafeInteger(expiresAtMs)
      || now() + LARK_USER_TOKEN_MIN_VALIDITY_MS >= expiresAtMs
    ) {
      throw new KnowledgeSourceError({ code: 'identity_not_available', status: 503 })
    }
    const key = await digestIdentityConfig([mode, accessToken, expiresAtText])
    const state: UserTokenCacheState = shouldCache
      && cachedTokenState?.mode === mode
      && cachedTokenState.key === key
      ? cachedTokenState
      : { key, mode, token: accessToken, expiresAtMs, invalidated: false }
    if (shouldCache) cachedTokenState = state
    return new PreprovisionedUserTokenSource(state, now)
  }
  throw new KnowledgeSourceError({ code: 'identity_unresolved', status: 503 })
}
