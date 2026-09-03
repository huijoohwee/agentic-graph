import {
  discardStorageRelayResponse,
  readStorageRelayJsonResponse,
  StorageRelayError,
  type StorageRelayOperation,
} from './storageRelaySafety'

export interface StorageRelayAccessTokenSource {
  readonly mode: 'static' | 'oauth-refresh'
  read(operation: StorageRelayOperation): Promise<string>
}

type OAuthTokenResponse = {
  access_token?: unknown
  expires_in?: unknown
  refresh_token?: unknown
}

const assertToken = (value: unknown): string => {
  const token = typeof value === 'string' ? value.trim() : ''
  if (!token || token.length > 16_384 || /[\u0000-\u001f\u007f]/u.test(token)) {
    throw new StorageRelayError({ code: 'provider_auth_failed', status: 502 })
  }
  return token
}

const readExpiryMs = (value: unknown): number => {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0
    ? Date.now() + Math.max(1, Math.floor(seconds) - 60) * 1_000
    : Date.now() + 4 * 60 * 1_000
}

class StaticAccessTokenSource implements StorageRelayAccessTokenSource {
  readonly mode = 'static' as const
  private readonly token: string

  constructor(token: string) {
    this.token = assertToken(token)
  }

  async read(): Promise<string> {
    return this.token
  }
}

class RefreshAccessTokenSource implements StorageRelayAccessTokenSource {
  readonly mode = 'oauth-refresh' as const
  private accessToken: string | null = null
  private expiresAtMs = 0
  private refreshToken: string
  private inFlight: Promise<string> | null = null

  constructor(private readonly options: {
    tokenUrl: string
    clientId: string
    clientSecret: string
    refreshToken: string
  }) {
    this.refreshToken = assertToken(options.refreshToken)
  }

  async read(operation: StorageRelayOperation): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAtMs) return this.accessToken
    this.inFlight ??= this.refresh(operation).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async refresh(operation: StorageRelayOperation): Promise<string> {
    const response = await operation.fetch(this.options.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    })
    if (response.status < 200 || response.status >= 300) {
      await discardStorageRelayResponse(response)
      throw new StorageRelayError({ code: 'provider_auth_failed', status: 502 })
    }
    const body = await readStorageRelayJsonResponse<OAuthTokenResponse>(response, operation.budget)
    const token = assertToken(body.access_token)
    if (body.refresh_token != null) this.refreshToken = assertToken(body.refresh_token)
    this.accessToken = token
    this.expiresAtMs = readExpiryMs(body.expires_in)
    return token
  }
}

export const createStaticStorageRelayAccessToken = (
  accessToken: string,
): StorageRelayAccessTokenSource => new StaticAccessTokenSource(accessToken)

export const createGoogleStorageRelayAccessToken = (args: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): StorageRelayAccessTokenSource => new RefreshAccessTokenSource({
  tokenUrl: 'https://oauth2.googleapis.com/token',
  ...args,
})

export const createMicrosoftStorageRelayAccessToken = (args: {
  tenantId: string
  clientId: string
  clientSecret: string
  refreshToken: string
}): StorageRelayAccessTokenSource => new RefreshAccessTokenSource({
  tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(args.tenantId)}/oauth2/v2.0/token`,
  clientId: args.clientId,
  clientSecret: args.clientSecret,
  refreshToken: args.refreshToken,
})

export const normalizeStorageRelayAccessTokenSource = (
  value: string | StorageRelayAccessTokenSource,
): StorageRelayAccessTokenSource => typeof value === 'string'
  ? createStaticStorageRelayAccessToken(value)
  : value
