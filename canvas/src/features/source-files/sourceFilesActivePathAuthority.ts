import {
  beginSourceFilesDocumentIntent,
  clearSourceFilesDocumentIntent,
  completeSourceFilesDocumentIntent,
  failSourceFilesDocumentIntent,
  readSourceFilesBootstrapSnapshot,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import { reportActivePathMaterializationError } from '@/features/source-files/sourceFilesMaterializationError'
import {
  materializeActiveWorkspaceEntryIntoSourceFiles,
  readReusableWorkspaceEntriesSnapshot,
} from '@/features/source-files/sourceFilesRuntimeShared'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isMaterializedWorkspaceSourceProofCurrent, sameMaterializationSourceIdentities } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'

export type ActivePathSourceAuthorityRequest = Readonly<{
  sourceAuthorityIntentKey: string
  ownsSourceAuthorityIntent: boolean
}>

export type ActivePathMaterializationRequest = ActivePathSourceAuthorityRequest & {
  activePath: string
  activePathKey: string
  sourceFilesSnapshot: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntriesSnapshot: ReturnType<typeof readReusableWorkspaceEntriesSnapshot>
}

type ActivePathMaterializationRuntime = Pick<
  NonNullable<Parameters<typeof materializeActiveWorkspaceEntryIntoSourceFiles>[0]>,
  'activeWorkspaceEntriesSnapshot' | 'fs' | 'sourcesByPath'
>

export type ActivePathSourceAuthorityCoordinator = Readonly<{
  begin: (request: ActivePathMaterializationRequest) => void
  clear: () => void
  launch: (
    request: ActivePathMaterializationRequest,
    run: (request: ActivePathMaterializationRequest) => Promise<void>,
  ) => void
}>

const ACTIVE_PATH_INTENT_PREFIX = '["workspace-active-path",'
// Intent keys can repeat for the same path. Request identity fences older
// completions/failures after a queued request has taken readiness ownership.
type AuthorityToken = {
  intentKey: string
  activePath: string | null
  activePathKey: string | null
  sourceFiles: ActivePathMaterializationRequest['sourceFilesSnapshot'] | null
  ownsIntent: boolean
}
const authorityTokens = new WeakMap<ActivePathSourceAuthorityRequest, AuthorityToken>()
let latestAuthorityToken: AuthorityToken | null = null

export function resolveActivePathMaterializationSourceAuthority(
  activePath: string,
): ActivePathSourceAuthorityRequest {
  const sourceAuthority = readSourceFilesBootstrapSnapshot()
  const currentIntentKey = String(sourceAuthority.documentIntentKey || '')
  const routeIntentOwnsMaterialization = sourceAuthority.documentIntentPhase === 'resolving'
    && !!currentIntentKey
    && !currentIntentKey.startsWith(ACTIVE_PATH_INTENT_PREFIX)
  return {
    sourceAuthorityIntentKey: routeIntentOwnsMaterialization
      ? currentIntentKey
      : JSON.stringify(['workspace-active-path', activePath]),
    ownsSourceAuthorityIntent: !routeIntentOwnsMaterialization,
  }
}

export function beginActivePathMaterializationSourceAuthority(
  request: ActivePathSourceAuthorityRequest,
): void {
  beginAuthorityRequest(request)
}
function beginAuthorityRequest(request: ActivePathSourceAuthorityRequest, beforePublish?: (token: AuthorityToken) => void): AuthorityToken {
  const materialization = request as Partial<ActivePathMaterializationRequest>
  const token: AuthorityToken = { intentKey: request.sourceAuthorityIntentKey,
    activePath: materialization.activePath || null, activePathKey: materialization.activePathKey || null,
    sourceFiles: materialization.sourceFilesSnapshot || null, ownsIntent: request.ownsSourceAuthorityIntent }
  authorityTokens.set(request, token)
  latestAuthorityToken = token
  beforePublish?.(token)
  if (request.ownsSourceAuthorityIntent) {
    beginSourceFilesDocumentIntent(request.sourceAuthorityIntentKey)
  }
  return token
}

export function completeActivePathMaterializationSourceAuthority(
  request: ActivePathSourceAuthorityRequest,
): void {
  const token = authorityTokens.get(request)
  if (token && token === latestAuthorityToken) {
    if (request.ownsSourceAuthorityIntent) {
      completeSourceFilesDocumentIntent(request.sourceAuthorityIntentKey)
    }
    token.sourceFiles = null
  }
}

export function failActivePathMaterializationSourceAuthority(
  request: ActivePathSourceAuthorityRequest,
  error: unknown,
): void {
  const token = authorityTokens.get(request)
  if (token) failAuthorityToken(token, error)
}
function failAuthorityToken(token: AuthorityToken, error: unknown): void {
  if (token !== latestAuthorityToken || readSourceFilesBootstrapSnapshot().documentIntentKey !== token.intentKey) return
  failSourceFilesDocumentIntent(token.intentKey, error)
  token.sourceFiles = null
  reportActivePathMaterializationError(error)
}

export function createActivePathSourceAuthorityCoordinator(): ActivePathSourceAuthorityCoordinator {
  let ownedIntentKey = ''
  let requestToken: AuthorityToken | null = null
  const begin = (request: ActivePathMaterializationRequest): AuthorityToken => beginAuthorityRequest(request, token => {
    ownedIntentKey = request.ownsSourceAuthorityIntent ? request.sourceAuthorityIntentKey : ''
    requestToken = token
  })
  return {
    begin,
    clear: () => {
      const token = requestToken, intentKey = ownedIntentKey
      requestToken = null
      ownedIntentKey = ''
      if (token && latestAuthorityToken === token) {
        latestAuthorityToken = null
        token.sourceFiles = null
        if (intentKey) clearSourceFilesDocumentIntent(intentKey)
      }
    },
    launch: (request, run) => {
      const token = begin(request)
      void run(request).catch(error => failAuthorityToken(token, error))
    },
  }
}

export async function materializeActivePathWithSourceAuthority(
  request: ActivePathMaterializationRequest,
  runtime: ActivePathMaterializationRuntime,
): Promise<void> {
  const requestToken = authorityTokens.get(request)
  if (!requestToken) throw new Error('Active path materialization requires a begun source authority request.')
  const proof = await materializeActiveWorkspaceEntryIntoSourceFiles({
    activePathOverride: request.activePath,
    fs: runtime.fs,
    activeWorkspaceEntriesSnapshot: runtime.activeWorkspaceEntriesSnapshot,
    sourceFilesSnapshot: request.sourceFilesSnapshot,
    workspaceEntries: request.workspaceEntriesSnapshot,
    sourcesByPath: runtime.sourcesByPath,
  })
  const stale = () => Object.assign(new Error('Queued active document source changed before readiness settlement.'), { code: 'SOURCE_FILES_MATERIALIZATION_STALE' })
  if (!proof || !isMaterializedWorkspaceSourceProofCurrent(proof)) throw stale()
  const publish = (token: AuthorityToken): void => {
    if (token.ownsIntent) completeSourceFilesDocumentIntent(token.intentKey)
    token.sourceFiles = null
    if (token !== latestAuthorityToken || !isMaterializedWorkspaceSourceProofCurrent(proof)) {
      const error = stale()
      if (token === latestAuthorityToken && readSourceFilesBootstrapSnapshot().documentIntentKey === token.intentKey) {
        failSourceFilesDocumentIntent(token.intentKey, error)
      }
      throw error
    }
  }
  if (requestToken === latestAuthorityToken) {
    publish(requestToken)
    return
  }
  // The bootstrap cache may skip an equivalent queued key. Transfer only the
  // still-current completed proof; otherwise rejection clears that cache.
  const latest = latestAuthorityToken
  if (!latest?.ownsIntent || !requestToken.ownsIntent
    || latest.intentKey !== requestToken.intentKey || latest.activePathKey !== requestToken.activePathKey
    || latest.activePath !== proof.activePath || !latest.sourceFiles) throw stale()
  const sourcePath = resolveWorkspaceSourcePathKey(proof.activePath)
  const expected = latest.sourceFiles.map(file => file.source?.path === sourcePath ? { ...file, enabled: true } : file)
  if (!sameMaterializationSourceIdentities(expected, proof.sourceFiles)) throw stale()
  publish(latest)
}
