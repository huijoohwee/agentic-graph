import type { KnowgrphGitResolvedDocument } from './knowgrphGitContracts'

export const joinKnowgrphGitPath = (left: string, right: string): string =>
  [left, right].filter(Boolean).join('/').replace(/\/{2,}/g, '/')

export const normalizeKnowgrphGitPath = (value: unknown): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^workspace:/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
  const parts = normalized.split('/')
  if (
    !normalized
    || normalized.length > 1_024
    || normalized.includes('\0')
    || parts.some(part => !part || part === '.' || part === '..')
  ) throw new Error('Git path is unsupported')
  return normalized
}

export const deriveKnowgrphGitRepositoryPathScope = (
  canonicalPathScopeValue: unknown,
  documents: KnowgrphGitResolvedDocument[],
): string => {
  const canonicalPathScope = normalizeKnowgrphGitPath(canonicalPathScopeValue)
  const candidates = new Set<string>()
  for (const document of documents) {
    const canonicalPath = normalizeKnowgrphGitPath(document.canonicalPath)
    const repositoryPath = normalizeKnowgrphGitPath(document.repositoryPath)
    const relativePath = canonicalPath === canonicalPathScope
      ? ''
      : canonicalPath.startsWith(`${canonicalPathScope}/`)
        ? canonicalPath.slice(canonicalPathScope.length + 1)
        : null
    if (relativePath == null) throw new Error('Authority canonical path is outside the requested scope')
    let repositoryPathScope: string
    if (!relativePath) repositoryPathScope = repositoryPath
    else if (repositoryPath === relativePath) repositoryPathScope = ''
    else if (repositoryPath.endsWith(`/${relativePath}`)) {
      repositoryPathScope = repositoryPath.slice(0, -(relativePath.length + 1))
    } else {
      throw new Error('Authority canonical and repository paths have an ambiguous mapping')
    }
    if (joinKnowgrphGitPath(repositoryPathScope, relativePath) !== repositoryPath) {
      throw new Error('Authority repository scope mapping is inconsistent')
    }
    candidates.add(repositoryPathScope)
  }
  if (candidates.size !== 1) throw new Error('Authority repository scope mapping is ambiguous')
  return candidates.values().next().value!
}

export const isForbiddenKnowgrphGitPath = (value: unknown): boolean => {
  let path: string
  try {
    path = normalizeKnowgrphGitPath(value)
  } catch {
    return true
  }
  return path === 'agentic-canvas-os'
    || path.startsWith('agentic-canvas-os/')
    || path === 'huijoohwee/docs/workspace-seeds'
    || path.startsWith('huijoohwee/docs/workspace-seeds/')
}

export const isSupportedKnowgrphGitDocumentPath = (path: string): boolean =>
  /\.(?:json|md|markdown|mdx)$/iu.test(path)
