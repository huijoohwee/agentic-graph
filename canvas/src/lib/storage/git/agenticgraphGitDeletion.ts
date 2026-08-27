import type {
  KnowgrphGitCommitRequest,
  KnowgrphGitDocumentWriteAuthority,
  KnowgrphGitObjectRecord,
  KnowgrphGitResolvedDocument,
  KnowgrphGitResolvedDocumentDeletion,
} from './knowgrphGitContracts'
import { UnsupportedGitPathError } from './knowgrphGitEngineSupport'
import { listKnowgrphGitCommitDocumentPaths } from './knowgrphGitRepository'

export const resolveKnowgrphGitDocumentDeletions = async (args: {
  authority: KnowgrphGitDocumentWriteAuthority
  request: KnowgrphGitCommitRequest
  documents: readonly KnowgrphGitResolvedDocument[]
  parentObjectId: string | null
  parentObjects?: KnowgrphGitObjectRecord[]
  repositoryPathScope: string
}): Promise<KnowgrphGitResolvedDocumentDeletion[]> => {
  if (!args.parentObjectId || !args.parentObjects) return []
  const currentPaths = new Set(args.documents.map(document => document.repositoryPath))
  const deletions: KnowgrphGitResolvedDocumentDeletion[] = []
  for (const repositoryPath of listKnowgrphGitCommitDocumentPaths({
    commitObjectId: args.parentObjectId,
    objects: args.parentObjects,
    repositoryPathScope: args.repositoryPathScope,
  })) {
    if (currentPaths.has(repositoryPath)) continue
    const relativePath = args.repositoryPathScope
      ? repositoryPath.slice(args.repositoryPathScope.length + 1)
      : repositoryPath
    const canonicalPath = `${args.request.canonicalPathScope}/${relativePath}`
    const kind = repositoryPath.toLowerCase().endsWith('.json') ? 'json' as const : 'markdown' as const
    const resolved = await args.authority.resolveDocument({ path: canonicalPath, kind })
    if (
      resolved.ok === false
      || resolved.document.repositoryId !== args.request.repositoryId
      || resolved.document.repositoryPath !== repositoryPath
      || resolved.document.canonicalPath !== canonicalPath
    ) throw new UnsupportedGitPathError(canonicalPath)
    deletions.push({
      kind,
      canonicalPath,
      repositoryPath,
      repositoryId: resolved.document.repositoryId,
    })
  }
  return deletions
}
