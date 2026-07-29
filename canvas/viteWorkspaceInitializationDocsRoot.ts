import path from 'node:path'

type ResolveWorkspaceInitializationDocsRootArgs = {
  siblingDocsRoot: string
  gitCommonDir: string
  exists: (candidate: string) => boolean
}

export function resolveWorkspaceInitializationDocsRoot({
  siblingDocsRoot,
  gitCommonDir,
  exists,
}: ResolveWorkspaceInitializationDocsRootArgs): string {
  const directSiblingDocsRoot = path.resolve(siblingDocsRoot)
  if (exists(directSiblingDocsRoot)) return directSiblingDocsRoot

  const normalizedGitCommonDir = String(gitCommonDir || '').trim()
  if (!normalizedGitCommonDir) return ''

  const githubRoot = path.resolve(normalizedGitCommonDir, '..', '..')
  const canonicalDocsRoot = path.join(githubRoot, 'huijoohwee', 'docs')
  return exists(canonicalDocsRoot) ? canonicalDocsRoot : ''
}
