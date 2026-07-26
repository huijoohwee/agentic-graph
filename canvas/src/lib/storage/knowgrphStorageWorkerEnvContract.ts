export type KnowgrphStorageR2ObjectLike = {
  body?: ReadableStream<Uint8Array> | null
  httpEtag?: string
  etag?: string
  size?: number
  writeHttpMetadata?: (headers: Headers) => void
}

export type KnowgrphStorageR2BucketLike = {
  put: (
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string | null,
    options?: {
      httpMetadata?: Record<string, string>
      customMetadata?: Record<string, string>
    },
  ) => Promise<KnowgrphStorageR2ObjectLike | null | undefined>
  get: (key: string) => Promise<KnowgrphStorageR2ObjectLike | null | undefined>
  head?: (key: string) => Promise<KnowgrphStorageR2ObjectLike | null | undefined>
  delete?: (key: string) => Promise<void>
}

export type KnowgrphStorageKvNamespaceLike = {
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> },
  ) => Promise<void>
  get?: (key: string, type?: 'text' | 'json') => Promise<unknown>
  delete?: (key: string) => Promise<void>
}

export type KnowgrphStorageDurableObjectStubLike = {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
}

export type KnowgrphStorageDurableObjectNamespaceLike = {
  idFromName: (name: string) => unknown
  get: (id: unknown) => KnowgrphStorageDurableObjectStubLike
}

export type KnowgrphStorageWorkerEnv = {
  DB: unknown
  KNOWGRPH_STORAGE_SIGNING_SECRET?: string
  KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED?: string
  KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID?: string
  KNOWGRPH_STORAGE_GIT_KNOWGRPH_REMOTE_ID?: string
  KNOWGRPH_STORAGE_GIT_WORKSPACE_REMOTE_ID?: string
  KNOWGRPH_STORAGE_GIT_ALLOWED_PATH_PREFIXES?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_ID?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_ID?: string
  KNOWGRPH_STORAGE_GOOGLE_DRIVE_ROOT_ID?: string
  KNOWGRPH_STORAGE_ONEDRIVE_ACCESS_TOKEN?: string
  KNOWGRPH_STORAGE_ONEDRIVE_TENANT_ID?: string
  KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_ID?: string
  KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_SECRET?: string
  KNOWGRPH_STORAGE_ONEDRIVE_REFRESH_TOKEN?: string
  KNOWGRPH_STORAGE_ONEDRIVE_DRIVE_ID?: string
  KNOWGRPH_STORAGE_ONEDRIVE_ROOT_ID?: string
  KNOWGRPH_STORAGE_CHAT_PROXY_BASE_URL?: string
  KNOWGRPH_STORAGE_BLOB_BUCKET?: KnowgrphStorageR2BucketLike
  KNOWGRPH_MEDIA_ACCESS_KV?: KnowgrphStorageKvNamespaceLike
  KNOWGRPH_CANVAS_ROOM?: KnowgrphStorageDurableObjectNamespaceLike
  KNOWGRPH_STORAGE_BLOB_MAX_BYTES?: string
  KNOWGRPH_STORAGE_GITHUB_TOKEN?: string
  KNOWGRPH_STORAGE_GITHUB_OWNER?: string
  KNOWGRPH_STORAGE_GITHUB_KNOWGRPH_REPO?: string
  KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO?: string
  KNOWGRPH_STORAGE_GITHUB_BRANCH?: string
  KNOWGRPH_STORAGE_GITHUB_COMMITTER_NAME?: string
  KNOWGRPH_STORAGE_GITHUB_COMMITTER_EMAIL?: string
  KNOWGRPH_STORAGE_POCKETBASE_URL?: string
  KNOWGRPH_STORAGE_POCKETBASE_TOKEN?: string
}
