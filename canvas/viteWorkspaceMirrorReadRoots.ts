import path from 'node:path'

const normalizeRoot = (value: unknown): string => {
  const root = String(value || '').trim()
  return root ? path.resolve(root) : ''
}

export function resolveWorkspaceMirrorReadRoots(args: {
  repoRoot: string
  configuredRoots?: readonly unknown[]
}): string[] {
  const repoRoot = path.resolve(args.repoRoot)
  return [...new Set([
    repoRoot,
    path.resolve(repoRoot, '..'),
    path.resolve(repoRoot, '..', '..'),
    ...(args.configuredRoots || []).map(normalizeRoot).filter(Boolean),
  ])]
}

export function isWorkspaceMirrorReadPathAllowed(candidate: string, allowedRoots: readonly string[]): boolean {
  const resolved = path.resolve(candidate)
  return allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}
