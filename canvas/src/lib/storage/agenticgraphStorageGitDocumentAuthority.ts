import { useGraphStore } from '@/hooks/useGraphStore'
import {
  resolveDocumentRepositoryAuthorityResult,
  type DocumentRepositoryTarget,
} from 'grph-shared/collaboration/documentRepositoryAuthority'
import {
  type AgenticGraphGitDocument,
  type AgenticGraphGitDocumentAuthorityResult,
  type AgenticGraphGitDocumentKind,
  type AgenticGraphGitDocumentWriteAuthority,
  type AgenticGraphGitResolvedDocument,
  type AgenticGraphGitResolvedDocumentDeletion,
} from './git/agenticgraphGitContracts'
import { normalizeAgenticGraphGitPath } from './git/agenticgraphGitRepository'
import {
  saveAgenticGraphGitDocumentsThroughBridge,
} from './agenticgraphStorageGitSaveBridge'

export type AgenticGraphGitSaveBridgeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

const normalizeSourcePath = (value: unknown): string => String(value || '')
  .trim()
  .replace(/\\/g, '/')
  .replace(/^workspace:/, '')
  .replace(/^\/+/, '')
  .replace(/\/{2,}/g, '/')

const pathWithinScope = (path: string, scope: string): boolean =>
  path === scope || path.startsWith(`${scope}/`)

const resolveSourceCanonicalPath = (
  rawPath: string,
  scope: string,
  kind: AgenticGraphGitDocumentKind,
): string | null => {
  const normalized = normalizeSourcePath(rawPath)
  const candidates = [normalized]
  if (normalized.startsWith('docs/') && scope.endsWith('/docs')) {
    candidates.unshift(`${scope}/${normalized.slice('docs/'.length)}`)
  } else if (normalized && !normalized.includes('/')) {
    candidates.unshift(`${scope}/${normalized}`)
  }
  for (const candidate of candidates) {
    const result = resolveDocumentRepositoryAuthorityResult({
      documentKey: candidate,
      documentKind: kind,
    })
    if (
      result.ok
      && pathWithinScope(result.authority.canonicalPath, scope)
    ) {
      return result.authority.canonicalPath
    }
  }
  return null
}

export const collectScopedDocuments = (
  scopeValue: string,
): AgenticGraphGitDocument[] => {
  const scope = normalizeAgenticGraphGitPath(scopeValue)
  const documents = new Map<string, AgenticGraphGitDocument>()
  for (const file of useGraphStore.getState().sourceFiles || []) {
    const sourcePath = normalizeSourcePath(file.source?.path)
      || normalizeSourcePath(file.name)
    const lowerPath = sourcePath.toLowerCase()
    const kind = lowerPath.endsWith('.json')
      ? 'json'
      : /\.(?:md|markdown|mdx)$/.test(lowerPath) ? 'markdown' : null
    if (!kind) continue
    const path = resolveSourceCanonicalPath(sourcePath, scope, kind)
    if (!path) continue
    if (documents.has(path)) {
      throw new Error('Git document scope contains duplicate canonical paths.')
    }
    documents.set(path, {
      path,
      kind,
      text: String(file.text || ''),
    })
  }
  return [...documents.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
}

export const repositoryIdForScope = (
  scopeValue: string,
): DocumentRepositoryTarget => {
  const scope = normalizeAgenticGraphGitPath(scopeValue)
  const result = resolveDocumentRepositoryAuthorityResult({
    documentKey: `${scope}/__agenticgraph_git_scope__.md`,
    documentKind: 'markdown',
  })
  return result.ok ? result.authority.repositoryTarget : 'workspace-docs'
}

export const resolveScopedDocument = (args: {
  scope: string
  repositoryId: DocumentRepositoryTarget
  path: string
  kind: AgenticGraphGitDocumentKind
}): AgenticGraphGitDocumentAuthorityResult => {
  const scope = normalizeAgenticGraphGitPath(args.scope)
  const result = resolveDocumentRepositoryAuthorityResult({
    documentKey: args.path,
    documentKind: args.kind,
  })
  if (
    !result.ok
    || result.authority.repositoryTarget !== args.repositoryId
    || !pathWithinScope(result.authority.canonicalPath, scope)
  ) {
    return {
      ok: false,
      path: args.path,
      reason: 'unsupported-path',
    }
  }
  return {
    ok: true,
    document: {
      canonicalPath: result.authority.canonicalPath,
      repositoryPath: result.authority.githubPath,
      repositoryId: args.repositoryId,
    },
  }
}

const assertCurrentSnapshot = (
  scope: string,
  repositoryId: DocumentRepositoryTarget,
  documents: readonly AgenticGraphGitResolvedDocument[],
  deletions: readonly AgenticGraphGitResolvedDocumentDeletion[],
): void => {
  const current = new Map(
    collectScopedDocuments(scope).map(document => [document.path, document]),
  )
  if (current.size !== documents.length) {
    throw new Error('Git commit authority snapshot changed before persistence.')
  }
  const attestedPaths = new Set<string>()
  for (const document of documents) {
    const authority = resolveScopedDocument({
      scope,
      repositoryId,
      path: document.canonicalPath,
      kind: document.kind,
    })
    const latest = current.get(document.canonicalPath)
    if (
      authority.ok === false
      || authority.document.canonicalPath !== document.canonicalPath
      || authority.document.repositoryPath !== document.repositoryPath
      || authority.document.repositoryId !== document.repositoryId
      || attestedPaths.has(document.canonicalPath)
      || !latest
      || latest.kind !== document.kind
      || latest.text !== document.text
    ) {
      throw new Error('Git commit authority snapshot changed before persistence.')
    }
    attestedPaths.add(document.canonicalPath)
  }
  for (const deletion of deletions) {
    const authority = resolveScopedDocument({
      scope,
      repositoryId,
      path: deletion.canonicalPath,
      kind: deletion.kind,
    })
    if (
      authority.ok === false
      || authority.document.canonicalPath !== deletion.canonicalPath
      || authority.document.repositoryPath !== deletion.repositoryPath
      || authority.document.repositoryId !== deletion.repositoryId
      || current.has(deletion.canonicalPath)
      || attestedPaths.has(deletion.canonicalPath)
    ) {
      throw new Error('Git commit authority snapshot changed before persistence.')
    }
    attestedPaths.add(deletion.canonicalPath)
  }
}

export const createSaveBridgeDocumentAuthority = (options: {
  scope: string
  repositoryId: DocumentRepositoryTarget
  workspaceId: string
  remoteId: string
  baseRequestUrl: string
  sessionToken: string
  fetcher: AgenticGraphGitSaveBridgeFetch
}): AgenticGraphGitDocumentWriteAuthority => {
  const scope = normalizeAgenticGraphGitPath(options.scope)
  return {
    resolveDocument: ({ path, kind }) => resolveScopedDocument({
      scope,
      repositoryId: options.repositoryId,
      path,
      kind,
    }),
    async writeCommit(args) {
      if (args.signal.aborted) {
        throw new Error('Git commit authority was aborted.')
      }
      if (
        args.workspaceId !== options.workspaceId
        || args.repositoryId !== options.repositoryId
      ) {
        throw new Error('Git commit authority binding does not match.')
      }
      assertCurrentSnapshot(scope, options.repositoryId, args.documents, args.deletions)
      const saved = await saveAgenticGraphGitDocumentsThroughBridge({
        workspaceId: options.workspaceId,
        remoteId: options.remoteId,
        baseRequestUrl: options.baseRequestUrl,
        sessionToken: options.sessionToken,
        documents: args.documents,
        deletions: args.deletions,
        signal: args.signal,
        fetcher: options.fetcher,
      })
      return {
        kind: 'remote-save-bridge',
        commitObjectId: saved.commitObjectId,
      }
    },
  }
}
