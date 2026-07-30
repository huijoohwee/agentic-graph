import path from 'node:path'

type ResolveWorkspaceInitializationWorkspaceSeedsReadRootArgs = {
  command: string
  repoRoot: string
  explicitAbsRoot?: string
}

export function resolveWorkspaceInitializationWorkspaceSeedsReadRoot({
  command,
  repoRoot,
  explicitAbsRoot,
}: ResolveWorkspaceInitializationWorkspaceSeedsReadRootArgs): string {
  if (command === 'build') return ''
  const explicitRoot = String(explicitAbsRoot || '').trim()
  return explicitRoot
    ? path.resolve(explicitRoot)
    : path.resolve(repoRoot, 'docs', 'workspace-seeds')
}
