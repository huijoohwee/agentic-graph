import {
  AGENTIC_OS_STORAGE_API_VERSION,
  buildAgenticGraphCollaborationSavePath,
  type AgenticGraphCollaborationSaveRequest,
  type AgenticGraphCollaborationSaveResponse,
} from './agentic-graph-storage-sync-contract'
import { buildAgenticGraphStorageAbsoluteUrl } from './agentic-graph-storage-chat-client'
import {
  AgenticGraphGitAuthorityError,
  type AgenticGraphGitResolvedDocument,
  type AgenticGraphGitResolvedDocumentDeletion,
} from './git'

type SaveBridgeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

const GIT_OBJECT_ID = /^[0-9a-f]{40}$/
const MAX_SAVE_RESPONSE_BYTES = 65_536

const readSaveResponse = async (
  response: Response,
): Promise<AgenticGraphCollaborationSaveResponse> => {
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_RESPONSE_BYTES) {
    throw new AgenticGraphGitAuthorityError(
      'invalid-response',
      'Git save bridge response exceeded its bound.',
    )
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AgenticGraphGitAuthorityError(
      'invalid-response',
      'Git save bridge returned an invalid response.',
    )
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgenticGraphGitAuthorityError(
      'invalid-response',
      'Git save bridge returned an invalid response.',
    )
  }
  return value as AgenticGraphCollaborationSaveResponse
}

const assertSaveResponseStatus = async (response: Response): Promise<void> => {
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined)
    throw new AgenticGraphGitAuthorityError(
      'auth-failure',
      'Git save bridge authentication failed.',
    )
  }
  if (response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => undefined)
    throw new AgenticGraphGitAuthorityError(
      'retryable',
      'Git save bridge transport is temporarily unavailable.',
    )
  }
}

const normalizeSessionToken = (value: string): string => {
  const token = String(value || '').trim()
  if (!token || token.length > 8_192 || /\s/.test(token)) {
    throw new Error('Git save bridge session is unavailable.')
  }
  return token
}

const normalizeRemoteId = (value: string): string => {
  const remoteId = String(value || '').trim()
  if (
    !remoteId
    || remoteId.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(remoteId)
  ) {
    throw new Error('Git save bridge remote is unavailable.')
  }
  return remoteId
}

export const saveAgenticGraphGitDocumentsThroughBridge = async (args: {
  workspaceId: string
  remoteId: string
  baseRequestUrl: string
  sessionToken: string
  documents: readonly AgenticGraphGitResolvedDocument[]
  deletions: readonly AgenticGraphGitResolvedDocumentDeletion[]
  signal: AbortSignal
  fetcher: SaveBridgeFetch
}): Promise<{ commitObjectId: string | null }> => {
  const endpoint = buildAgenticGraphStorageAbsoluteUrl(
    args.baseRequestUrl,
    buildAgenticGraphCollaborationSavePath(),
  )
  if (!endpoint) throw new Error('Git save bridge is unavailable.')
  const sessionToken = normalizeSessionToken(args.sessionToken)
  const remoteId = normalizeRemoteId(args.remoteId)
  let commitObjectId: string | null = null
  const changes = [
    ...args.deletions.map(document => ({ operation: 'delete' as const, document })),
    ...args.documents.map(document => ({ operation: 'upsert' as const, document })),
  ]
  for (const change of changes) {
    const document = change.document
    if (args.signal.aborted) throw new Error('Git save bridge was aborted.')
    const repositoryTarget = document.repositoryId
    if (repositoryTarget !== 'agentic-graph-docs' && repositoryTarget !== 'workspace-docs') {
      throw new Error('Git save bridge document target is unsupported.')
    }
    const request: AgenticGraphCollaborationSaveRequest = {
      apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
      operation: change.operation,
      workspaceId: args.workspaceId,
      documentKey: document.canonicalPath,
      documentKind: document.kind,
      repositoryTarget,
      gitRemoteId: remoteId,
      serializedText: 'text' in document ? document.text : '',
      yjsStateBase64: '',
      activePeerCount: 1,
      pocketBaseRoomId: null,
      savedByPeerId: null,
      saveBoundary: 'explicit',
    }
    const response = await args.fetcher(endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(request),
      signal: args.signal,
    })
    await assertSaveResponseStatus(response)
    const body = await readSaveResponse(response)
    if (
      !response.ok
      || body.ok !== true
      || body.operation !== change.operation
      || body.workspaceId !== args.workspaceId
      || body.documentKey !== document.canonicalPath
      || body.repositoryTarget !== document.repositoryId
      || body.githubPath !== document.repositoryPath
      || (body.commitSha !== null && !GIT_OBJECT_ID.test(body.commitSha))
    ) {
      throw new AgenticGraphGitAuthorityError(
        'invalid-response',
        'Git save bridge rejected the canonical document write.',
      )
    }
    if (body.commitSha) commitObjectId = body.commitSha
  }
  return { commitObjectId }
}
