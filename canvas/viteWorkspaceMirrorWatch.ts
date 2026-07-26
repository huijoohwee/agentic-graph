import path from 'node:path'

export const DEFAULT_VITE_WATCH_IGNORED = ['**/.git/**', '**/node_modules/**'] as const

const normalizeViteFsPath = (value: unknown): string => {
  const raw = String(value || '').trim()
  return raw ? path.resolve(raw).replace(/\\/g, '/').replace(/\/+$/, '') : ''
}

export const buildWorkspaceMirrorWatchIgnoredRoots = (args: {
  repoRoot: string
  canvasRoot: string
  workspaceRoot: string
  docsRoot?: unknown
  chatLogRoot?: unknown
  mutableSourcePath?: unknown
}): string[] => {
  const docsRoot = normalizeViteFsPath(args.docsRoot)
  const explicitChatLogRoot = normalizeViteFsPath(args.chatLogRoot)
  const baseRoot = docsRoot ? normalizeViteFsPath(path.dirname(docsRoot)) : ''
  const docsBasename = docsRoot ? path.basename(docsRoot) : ''
  const roots = new Set<string>()
  const protectedRoots = [args.repoRoot, args.canvasRoot, args.workspaceRoot].map(normalizeViteFsPath).filter(Boolean)

  const push = (candidate: string) => {
    const normalized = normalizeViteFsPath(candidate)
    if (normalized && normalized !== '/' && !protectedRoots.some(root => normalized === root)) roots.add(normalized)
  }

  push(docsRoot)
  if (explicitChatLogRoot) push(explicitChatLogRoot)
  else if (baseRoot) push(path.join(baseRoot, 'chat-log'))
  if (baseRoot && docsBasename) push(path.join(baseRoot, `${docsBasename}_`))
  push(String(args.mutableSourcePath || ''))
  return [...roots].sort((left, right) => left.localeCompare(right))
}

export const createWorkspaceMirrorWatchPathIgnore = (roots: string[]) => (candidate: string): boolean => {
  const normalized = normalizeViteFsPath(candidate)
  return !!normalized && roots.some(root => normalized === root || normalized.startsWith(`${root}/`))
}
