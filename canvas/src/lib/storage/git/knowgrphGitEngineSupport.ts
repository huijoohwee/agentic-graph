import {
  KNOWGRPH_GIT_OPERATION_BOUNDS,
  KnowgrphGitAuthorityError,
  KnowgrphGitRelayError,
  type KnowgrphGitCommitRequest,
  type KnowgrphGitEngineDependencies,
  type KnowgrphGitOperationKind,
  type KnowgrphGitOperationResult,
  type KnowgrphGitRemoteRequest,
  type KnowgrphGitResolvedDocument,
} from './knowgrphGitContracts'
import { normalizeGitRefName } from './knowgrphGitObjectCodec'
import {
  deriveKnowgrphGitRepositoryPathScope,
  isForbiddenKnowgrphGitPath,
  normalizeKnowgrphGitPath,
} from './knowgrphGitRepository'

export class UnsupportedGitPathError extends Error {}
export class GitOperationLimitError extends Error {}
export class GitOperationAuthError extends Error {}
export class GitOperationRetryExhaustedError extends Error {}
export class GitOperationIntegrityError extends Error {}

export const normalizeOpaqueGitId = (value: unknown, label: string): string => {
  const normalized = String(value || '').trim()
  if (
    !normalized
    || normalized.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
  ) {
    throw new GitOperationIntegrityError(`${label} must be an opaque identifier`)
  }
  return normalized
}

export const normalizeGitRemoteRequest = <Request extends KnowgrphGitRemoteRequest>(
  request: Request,
): Request => {
  const canonicalPathScope = normalizeKnowgrphGitPath(request.canonicalPathScope)
  if (isForbiddenKnowgrphGitPath(canonicalPathScope)) {
    throw new UnsupportedGitPathError(canonicalPathScope)
  }
  return {
    ...request,
    workspaceId: normalizeOpaqueGitId(request.workspaceId, 'workspaceId'),
    repositoryId: normalizeOpaqueGitId(request.repositoryId, 'repositoryId'),
    remoteId: normalizeOpaqueGitId(request.remoteId, 'remoteId'),
    canonicalPathScope,
    refName: normalizeGitRefName(request.refName),
  }
}

export const defaultGitOperationId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `git:${globalThis.crypto.randomUUID()}`
  return `git:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

export const defaultGitSleep = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleAbort = () => {
      globalThis.clearTimeout(timerId)
      reject(new GitOperationLimitError('Git operation deadline exceeded'))
    }
    const timerId = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) handleAbort()
  })

export class GitOperationBudget {
  readonly controller = new AbortController()
  private readonly timeoutId: ReturnType<typeof globalThis.setTimeout>
  private transferredBytes = 0

  constructor(
    private readonly startedAtMs: number,
    private readonly now: () => number,
  ) {
    this.timeoutId = globalThis.setTimeout(
      () => this.controller.abort(new GitOperationLimitError('Git operation deadline exceeded')),
      KNOWGRPH_GIT_OPERATION_BOUNDS.timeoutMs,
    )
  }

  assertWithinBounds(): void {
    if (
      this.controller.signal.aborted
      || this.now() - this.startedAtMs >= KNOWGRPH_GIT_OPERATION_BOUNDS.timeoutMs
      || this.transferredBytes > KNOWGRPH_GIT_OPERATION_BOUNDS.maxTransferBytes
    ) {
      this.controller.abort(new GitOperationLimitError('Git operation bounds exceeded'))
      throw new GitOperationLimitError('Git operation bounds exceeded')
    }
  }

  consumeBytes(value: unknown): void {
    const bytes = Number(value)
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new GitOperationIntegrityError('Git relay reported an invalid transfer size')
    }
    this.transferredBytes += bytes
    this.assertWithinBounds()
  }

  async waitFor<Result>(operation: Promise<Result>): Promise<Result> {
    const guarded = new Promise<Result>((resolve, reject) => {
      const handleAbort = () => reject(new GitOperationLimitError('Git operation deadline exceeded'))
      this.controller.signal.addEventListener('abort', handleAbort, { once: true })
      operation.then(
        value => {
          this.controller.signal.removeEventListener('abort', handleAbort)
          resolve(value)
        },
        error => {
          this.controller.signal.removeEventListener('abort', handleAbort)
          reject(error)
        },
      )
    })
    try {
      this.assertWithinBounds()
    } catch (error) {
      void guarded.catch(() => undefined)
      throw error
    }
    return guarded
  }

  close(): void {
    globalThis.clearTimeout(this.timeoutId)
  }
}

export const gitBackoffDelay = (attemptIndex: number): number =>
  Math.min(
    KNOWGRPH_GIT_OPERATION_BOUNDS.backoffBaseMs
      * (KNOWGRPH_GIT_OPERATION_BOUNDS.backoffFactor ** attemptIndex),
    KNOWGRPH_GIT_OPERATION_BOUNDS.backoffCapMs,
  )

export const isRetryableGitNetworkError = (error: unknown): boolean =>
  error instanceof KnowgrphGitRelayError || error instanceof KnowgrphGitAuthorityError
    ? error.code === 'retryable'
    : error instanceof TypeError

export const fixedGitOperationMessage = (
  kind: KnowgrphGitOperationKind,
  status: Exclude<KnowgrphGitOperationResult['status'], 'complete' | 'queued' | 'unsupported-path'>,
): string => {
  if (status === 'limit-exceeded') {
    return `Git ${kind} exceeded the cumulative 30-second or 10,485,760-byte limit.`
  }
  if (status === 'conflict') return 'Git push was rejected because the remote reference advanced.'
  if (status === 'auth-failure') return `Git ${kind} authentication failed at the Worker relay.`
  if (status === 'retry-exhausted') return `Git ${kind} failed after 3 bounded relay attempts.`
  return `Git ${kind} returned an unverifiable or unsupported repository form.`
}

export const preflightKnowgrphGitDocuments = async (
  request: KnowgrphGitCommitRequest,
  dependencies: KnowgrphGitEngineDependencies,
): Promise<{ documents: KnowgrphGitResolvedDocument[]; repositoryPathScope: string }> => {
  if (request.documents.length === 0) throw new GitOperationIntegrityError('Empty repositories are unsupported')
  const rawPaths = new Set<string>()
  const repositoryPaths = new Set<string>()
  const canonicalPaths = new Set<string>()
  const resolved: KnowgrphGitResolvedDocument[] = []
  for (const document of request.documents) {
    let path: string
    try {
      path = normalizeKnowgrphGitPath(document.path)
    } catch {
      throw new UnsupportedGitPathError(String(document.path || ''))
    }
    if (isForbiddenKnowgrphGitPath(path) || rawPaths.has(path)) throw new UnsupportedGitPathError(path)
    const lowerPath = path.toLowerCase()
    const supportedKind = document.kind === 'json'
      ? lowerPath.endsWith('.json')
      : lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown') || lowerPath.endsWith('.mdx')
    if (!supportedKind) throw new UnsupportedGitPathError(path)
    rawPaths.add(path)
    const authority = await dependencies.authority.resolveDocument({ path, kind: document.kind })
    if (authority.ok === false) throw new UnsupportedGitPathError(authority.path || path)
    let repositoryPath: string
    let canonicalPath: string
    try {
      repositoryPath = normalizeKnowgrphGitPath(authority.document.repositoryPath)
      canonicalPath = normalizeKnowgrphGitPath(authority.document.canonicalPath)
    } catch {
      throw new UnsupportedGitPathError(path)
    }
    if (
      isForbiddenKnowgrphGitPath(canonicalPath)
      || authority.document.repositoryId !== request.repositoryId
      || repositoryPaths.has(repositoryPath)
      || canonicalPaths.has(canonicalPath)
    ) throw new UnsupportedGitPathError(path)
    repositoryPaths.add(repositoryPath)
    canonicalPaths.add(canonicalPath)
    resolved.push({
      path,
      kind: document.kind,
      text: String(document.text ?? ''),
      repositoryPath,
      canonicalPath,
      repositoryId: authority.document.repositoryId,
    })
  }
  return {
    documents: resolved,
    repositoryPathScope: deriveKnowgrphGitRepositoryPathScope(request.canonicalPathScope, resolved),
  }
}
