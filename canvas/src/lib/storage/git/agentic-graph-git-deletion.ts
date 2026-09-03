import type {
  AgenticGraphGitCommitRequest,
  AgenticGraphGitDocumentWriteAuthority,
  AgenticGraphGitObjectRecord,
  AgenticGraphGitResolvedDocument,
  AgenticGraphGitResolvedDocumentDeletion,
} from './agentic-graph-git-contracts'
import { UnsupportedGitPathError } from './agentic-graph-git-engine-support'
import { listAgenticGraphGitCommitDocumentPaths } from './agentic-graph-git-repository'

export const resolveAgenticGraphGitDocumentDeletions = async (args: {
  authority: AgenticGraphGitDocumentWriteAuthority
  request: AgenticGraphGitCommitRequest
  documents: readonly AgenticGraphGitResolvedDocument[]
  parentObjectId: string | null
  parentObjects?: AgenticGraphGitObjectRecord[]
  repositoryPathScope: string
}): Promise<AgenticGraphGitResolvedDocumentDeletion[]> => {
  if (!args.parentObjectId || !args.parentObjects) return []
  const currentPaths = new Set(args.documents.map(document => document.repositoryPath))
  const deletions: AgenticGraphGitResolvedDocumentDeletion[] = []
  for (const repositoryPath of listAgenticGraphGitCommitDocumentPaths({
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
