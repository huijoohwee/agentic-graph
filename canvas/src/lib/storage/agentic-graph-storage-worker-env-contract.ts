export type AgenticGraphStorageR2ObjectLike = {
  body?: ReadableStream<Uint8Array> | null
  httpEtag?: string
  etag?: string
  size?: number
  customMetadata?: Record<string, string>
  writeHttpMetadata?: (headers: Headers) => void
}

export type AgenticGraphStorageR2BucketLike = {
  put: (
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string | null,
    options?: {
      httpMetadata?: Record<string, string>
      customMetadata?: Record<string, string>
    },
  ) => Promise<AgenticGraphStorageR2ObjectLike | null | undefined>
  get: (key: string) => Promise<AgenticGraphStorageR2ObjectLike | null | undefined>
  head?: (key: string) => Promise<AgenticGraphStorageR2ObjectLike | null | undefined>
  delete?: (key: string) => Promise<void>
}

export type AgenticGraphStorageKvNamespaceLike = {
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> },
  ) => Promise<void>
  get?: (key: string, type?: 'text' | 'json') => Promise<unknown>
  delete?: (key: string) => Promise<void>
}

export type AgenticGraphStorageDurableObjectStubLike = {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
}

export type AgenticGraphStorageDurableObjectNamespaceLike = {
  idFromName: (name: string) => unknown
  get: (id: unknown) => AgenticGraphStorageDurableObjectStubLike
}

export type AgenticGraphStorageWorkerEnv = {
  DB: unknown
  AGENTIC_OS_STORAGE_SIGNING_SECRET?: string
  /**
   * Dedicated Cloudflare Access application configuration for browser storage
   * sessions. These are deliberately separate from every other Worker Access
   * audience so a token for another service cannot bootstrap storage access.
   */
  AGENTIC_OS_STORAGE_ACCESS_ISSUER?: string
  AGENTIC_OS_STORAGE_ACCESS_AUDIENCE?: string
  AGENTIC_OS_STORAGE_ACCESS_JWKS_TIMEOUT_MS?: string
  AGENTIC_OS_STORAGE_ACCESS_JWKS_CACHE_TTL_MS?: string
  AGENTIC_OS_STORAGE_BROWSER_SESSION_TTL_SECONDS?: string
  AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED?: string
  AGENTIC_OS_STORAGE_LOCAL_RUNTIME?: string
  AGENTIC_OS_STORAGE_REMOTE_RELAY_WORKSPACE_ID?: string
  AGENTIC_OS_STORAGE_GIT_AGENTIC_OS_REMOTE_ID?: string
  AGENTIC_OS_STORAGE_GIT_WORKSPACE_REMOTE_ID?: string
  AGENTIC_OS_STORAGE_GIT_ALLOWED_PATH_PREFIXES?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_ID?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ID?: string
  AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ROOT_ID?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_ACCESS_TOKEN?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_TENANT_ID?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_CLIENT_ID?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_CLIENT_SECRET?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_REFRESH_TOKEN?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_DRIVE_ID?: string
  AGENTIC_OS_STORAGE_ONEDRIVE_ROOT_ID?: string
  AGENTIC_OS_STORAGE_LARK_IDENTITY_MODE?: string
  AGENTIC_OS_STORAGE_LARK_APP_ID?: string
  AGENTIC_OS_STORAGE_LARK_APP_SECRET?: string
  AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN?: string
  AGENTIC_OS_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS?: string
  AGENTIC_OS_STORAGE_LARK_SOURCE_ALLOWLIST_JSON?: string
  AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL?: string
  AGENTIC_OS_STORAGE_BLOB_BUCKET?: AgenticGraphStorageR2BucketLike
  AGENTIC_OS_MEDIA_ACCESS_KV?: AgenticGraphStorageKvNamespaceLike
  AGENTIC_OS_CANVAS_ROOM?: AgenticGraphStorageDurableObjectNamespaceLike
  AGENTIC_OS_STORAGE_BLOB_MAX_BYTES?: string
  AGENTIC_OS_STORAGE_GITHUB_TOKEN?: string
  AGENTIC_OS_STORAGE_GITHUB_OWNER?: string
  AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO?: string
  AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO?: string
  AGENTIC_OS_STORAGE_GITHUB_BRANCH?: string
  AGENTIC_OS_STORAGE_GITHUB_COMMITTER_NAME?: string
  AGENTIC_OS_STORAGE_GITHUB_COMMITTER_EMAIL?: string
  AGENTIC_OS_STORAGE_POCKETBASE_URL?: string
  AGENTIC_OS_STORAGE_POCKETBASE_TOKEN?: string
}
