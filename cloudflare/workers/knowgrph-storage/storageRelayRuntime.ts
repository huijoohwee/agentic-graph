import {
  KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  type KnowgrphStorageWorkerEnv,
} from './contract'
import {
  readAuthenticatedChatContext,
  readAuthorizedMembership,
  type AuthenticatedChatContext,
} from './chatAuth'
import type { D1DatabaseLike } from './db'
import { FileSyncProviderRegistry, type FileSyncProviderRegistration } from './storage-relay/fileSyncProviderRegistry'
import { createFileSyncRelayHandler } from './storage-relay/fileSyncRelay'
import { GitRemoteRegistry, type GitRemoteRegistration } from './storage-relay/gitRemoteRegistry'
import { createGitRemoteRelayHandler } from './storage-relay/gitRemoteRelay'
import { GoogleDriveFileSyncProvider } from './storage-relay/googleDriveFileSyncProvider'
import { OneDriveFileSyncProvider } from './storage-relay/oneDriveFileSyncProvider'
import {
  createGoogleStorageRelayAccessToken,
  createMicrosoftStorageRelayAccessToken,
  createStaticStorageRelayAccessToken,
  type StorageRelayAccessTokenSource,
} from './storage-relay/storageRelayAccessToken'
import { StorageRelayOpaqueTokenCodec } from './storage-relay/storageRelayOpaqueToken'
import { readStorageGitRemoteAuthorities } from './storageGitRemoteAuthority'
import {
  assertDevStorageRelayRequest,
  assertLoopbackStorageRelayRequest,
  authorizeStorageRelayRequest,
  createStorageRelayOperationId,
  STORAGE_RELAY_API_VERSION,
  StorageRelayError,
  StorageRelayOperation,
  storageRelayErrorResponse,
  storageRelayJsonResponse,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from './storage-relay/storageRelaySafety'

const DEFAULT_GIT_PATH_PREFIXES = ['docs'] as const
const GOOGLE_DRIVE_PROVIDER_ID = 'google-drive'
const ONE_DRIVE_PROVIDER_ID = 'one-drive'

const readEnvText = (value: string | undefined): string => String(value || '').trim()

const readRelayWorkspaceId = (env: KnowgrphStorageWorkerEnv): string =>
  readEnvText(env.KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID)
  || KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID

const readGitPathPrefixes = (env: KnowgrphStorageWorkerEnv): readonly string[] => {
  const configured = readEnvText(env.KNOWGRPH_STORAGE_GIT_ALLOWED_PATH_PREFIXES)
  return configured ? configured.split(',').map(value => value.trim()) : DEFAULT_GIT_PATH_PREFIXES
}

const readAccessTokenSource = (args: {
  staticAccessToken: string
  refreshFields: readonly string[]
  createRefreshSource: () => StorageRelayAccessTokenSource
}): StorageRelayAccessTokenSource | null => {
  const configuredRefreshFields = args.refreshFields.filter(Boolean).length
  if (configuredRefreshFields > 0 && configuredRefreshFields !== args.refreshFields.length) {
    throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
  }
  if (configuredRefreshFields === args.refreshFields.length) return args.createRefreshSource()
  return args.staticAccessToken ? createStaticStorageRelayAccessToken(args.staticAccessToken) : null
}

const readGoogleAccessTokenSource = (env: KnowgrphStorageWorkerEnv): StorageRelayAccessTokenSource | null => {
  const clientId = readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_ID)
  const clientSecret = readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET)
  const refreshToken = readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN)
  return readAccessTokenSource({
    staticAccessToken: readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN),
    refreshFields: [clientId, clientSecret, refreshToken],
    createRefreshSource: () => createGoogleStorageRelayAccessToken({ clientId, clientSecret, refreshToken }),
  })
}

const readOneDriveAccessTokenSource = (env: KnowgrphStorageWorkerEnv): StorageRelayAccessTokenSource | null => {
  const tenantId = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_TENANT_ID)
  const clientId = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_ID)
  const clientSecret = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_SECRET)
  const refreshToken = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_REFRESH_TOKEN)
  return readAccessTokenSource({
    staticAccessToken: readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_ACCESS_TOKEN),
    refreshFields: [tenantId, clientId, clientSecret, refreshToken],
    createRefreshSource: () => createMicrosoftStorageRelayAccessToken({
      tenantId,
      clientId,
      clientSecret,
      refreshToken,
    }),
  })
}

const createGitRegistry = (env: KnowgrphStorageWorkerEnv): GitRemoteRegistry => {
  const token = readEnvText(env.KNOWGRPH_STORAGE_GITHUB_TOKEN)
  const owner = readEnvText(env.KNOWGRPH_STORAGE_GITHUB_OWNER)
  const branch = readEnvText(env.KNOWGRPH_STORAGE_GITHUB_BRANCH)
  const workspaceId = readRelayWorkspaceId(env)
  const allowedPathPrefixes = readGitPathPrefixes(env)
  const registrations: GitRemoteRegistration[] = readStorageGitRemoteAuthorities(env)
    .filter(authority => token && owner && authority.repository && branch)
    .map(authority => ({
      remoteId: authority.remoteId,
      workspaceId,
      owner,
      repository: authority.repository,
      branch,
      token,
      allowedPathPrefixes,
      fetchPolicy: 'normalized-commits',
    }))
  return new GitRemoteRegistry(registrations)
}

const createFileSyncRegistry = (env: KnowgrphStorageWorkerEnv): FileSyncProviderRegistry => {
  const workspaceId = readRelayWorkspaceId(env)
  const registrations: FileSyncProviderRegistration[] = []
  const googleAccessToken = readGoogleAccessTokenSource(env)
  const googleRootId = readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_ROOT_ID)
  if (googleAccessToken && googleRootId) {
    registrations.push({
      providerId: GOOGLE_DRIVE_PROVIDER_ID,
      workspaceId,
      label: 'Google Drive',
      rootKey: 'google-drive-root',
      rootResourceId: googleRootId,
      provider: new GoogleDriveFileSyncProvider({
        accessToken: googleAccessToken,
        driveId: readEnvText(env.KNOWGRPH_STORAGE_GOOGLE_DRIVE_ID) || null,
      }),
    })
  }
  const oneDriveAccessToken = readOneDriveAccessTokenSource(env)
  const oneDriveDriveId = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_DRIVE_ID)
  const oneDriveRootId = readEnvText(env.KNOWGRPH_STORAGE_ONEDRIVE_ROOT_ID)
  if (oneDriveAccessToken && oneDriveDriveId && oneDriveRootId) {
    registrations.push({
      providerId: ONE_DRIVE_PROVIDER_ID,
      workspaceId,
      label: 'OneDrive',
      rootKey: 'one-drive-root',
      rootResourceId: oneDriveRootId,
      provider: new OneDriveFileSyncProvider({
        accessToken: oneDriveAccessToken,
        driveId: oneDriveDriveId,
      }),
    })
  }
  return new FileSyncProviderRegistry(registrations)
}

const createAuthHooks = (
  db: D1DatabaseLike,
): StorageRelayAuthHooks<AuthenticatedChatContext> => ({
  async authenticate({ request }) {
    const result = await readAuthenticatedChatContext(request, db)
    return result.ok ? result.value : null
  },
  async authorizeMembership({ authContext, workspaceId }) {
    const result = await readAuthorizedMembership({
      db,
      workspaceId,
      userId: authContext.user.id,
    })
    return result.ok
      ? { role: result.membership.role, status: result.membership.status }
      : null
  },
})

export const isKnowgrphStorageRelayRoute = (pathname: string): boolean =>
  pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.relayCapabilities
  || pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.gitRelay
  || pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.fileSyncRelay

const handleRelayCapabilities = async (args: {
  request: Request
  env: KnowgrphStorageWorkerEnv
  authHooks: StorageRelayAuthHooks<AuthenticatedChatContext>
  fetcher?: StorageRelayFetch
}): Promise<Response> => {
  if (args.request.method !== 'GET') {
    throw new StorageRelayError({ code: 'invalid_request', status: 405 })
  }
  const workspaceId = readRelayWorkspaceId(args.env)
  const operation = new StorageRelayOperation({ fetcher: args.fetcher })
  try {
    await authorizeStorageRelayRequest({
      request: args.request,
      workspaceId,
      access: 'read',
      hooks: args.authHooks,
      signal: operation.signal,
    })
    const gitRemotes = createGitRegistry(args.env).listForWorkspace(workspaceId)
    const fileRegistry = createFileSyncRegistry(args.env)
    const fileProviders = fileRegistry.listForWorkspace(workspaceId).map(provider => ({
      ...provider,
      credentialMode: provider.providerType === 'google-drive'
        ? readGoogleAccessTokenSource(args.env)?.mode
        : readOneDriveAccessTokenSource(args.env)?.mode,
    }))
    return storageRelayJsonResponse(200, {
      ok: true,
      apiVersion: STORAGE_RELAY_API_VERSION,
      schema: 'knowgrph-storage-relay-capabilities/v1',
      workspaceId,
      devOnly: true,
      relayEnabled: args.env.KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED === 'true',
      gitRemotes,
      fileProviders,
      fileSigningReady: readEnvText(args.env.KNOWGRPH_STORAGE_SIGNING_SECRET).length >= 16,
    })
  } finally {
    operation.dispose()
  }
}

export const handleStorageRelayRequest = async (args: {
  request: Request
  pathname: string
  env: KnowgrphStorageWorkerEnv
  db: D1DatabaseLike
  fetcher?: StorageRelayFetch
}): Promise<Response> => {
  const operationId = createStorageRelayOperationId(args.request)
  try {
    const authHooks = createAuthHooks(args.db)
    if (args.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.relayCapabilities) {
      assertLoopbackStorageRelayRequest(args.request)
      return handleRelayCapabilities({
        request: args.request,
        env: args.env,
        authHooks,
        fetcher: args.fetcher,
      })
    }
    assertDevStorageRelayRequest(args.request, args.env)
    if (args.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.gitRelay) {
      return createGitRemoteRelayHandler({
        env: args.env,
        authHooks,
        registry: createGitRegistry(args.env),
        fetcher: args.fetcher,
      })(args.request)
    }
    if (args.pathname === KNOWGRPH_STORAGE_ROUTE_PATHS.fileSyncRelay) {
      const secret = String(args.env.KNOWGRPH_STORAGE_SIGNING_SECRET || '')
      if (secret.trim().length < 16) {
        throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
      }
      return createFileSyncRelayHandler({
        env: args.env,
        authHooks,
        registry: createFileSyncRegistry(args.env),
        tokenCodec: new StorageRelayOpaqueTokenCodec({ secret }),
        fetcher: args.fetcher,
      })(args.request)
    }
    throw new StorageRelayError({ code: 'invalid_request', status: 404 })
  } catch (error) {
    return storageRelayErrorResponse(error, operationId)
  }
}
