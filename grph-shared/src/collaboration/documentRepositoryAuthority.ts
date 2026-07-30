export const DOCUMENT_REPOSITORY_TARGETS = {
  knowgrphDocs: 'knowgrph-docs',
  workspaceDocs: 'workspace-docs',
} as const

export const DOCUMENT_REPOSITORY_DISPLAY_ROOTS = {
  knowgrphDocs: 'GitHub/knowgrph/docs',
  workspaceDocs: 'GitHub/huijoohwee/docs',
  workspaceSeeds: 'GitHub/knowgrph/docs/workspace-seeds',
  offlineFallback: 'IndexedDB',
} as const

export const KNOWGRPH_WORKSPACE_SEEDS_REPOSITORY_PATH = 'docs/workspace-seeds'
export const REJECTED_WORKSPACE_SEEDS_REPOSITORY_PATH = 'huijoohwee/docs/workspace-seeds'

export type DocumentRepositoryTarget =
  (typeof DOCUMENT_REPOSITORY_TARGETS)[keyof typeof DOCUMENT_REPOSITORY_TARGETS]

export type DocumentRepositoryAuthority = {
  repositoryTarget: DocumentRepositoryTarget
  githubPath: string
  canonicalPath: string
}

export type DocumentRepositoryAuthorityResult =
  | { ok: true; authority: DocumentRepositoryAuthority }
  | { ok: false; reason: 'unsupported-path'; path: string }

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

const normalizeDocumentPath = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^workspace:/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')

const pathMatchesRoot = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`)

export const isKnowgrphWorkspaceSeedsPath = (value: unknown): boolean => {
  const path = normalizeDocumentPath(value)
  return pathMatchesRoot(path, KNOWGRPH_WORKSPACE_SEEDS_REPOSITORY_PATH)
    || pathMatchesRoot(path, `knowgrph/${KNOWGRPH_WORKSPACE_SEEDS_REPOSITORY_PATH}`)
}

export const isKnowgrphWorkspaceSeedsRootPath = (value: unknown): boolean => {
  const path = normalizeDocumentPath(value)
  return path === KNOWGRPH_WORKSPACE_SEEDS_REPOSITORY_PATH
    || path === `knowgrph/${KNOWGRPH_WORKSPACE_SEEDS_REPOSITORY_PATH}`
}

const hasSupportedExtension = (path: string, documentKind: 'markdown' | 'json'): boolean => {
  const extension = path.split('.').pop()?.toLowerCase() || ''
  return documentKind === 'json' ? extension === 'json' : MARKDOWN_EXTENSIONS.has(extension)
}

const isSafeRepositoryPath = (path: string): boolean => {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 && parts.every(part => part !== '.' && part !== '..')
}

export const resolveDocumentRepositoryAuthorityResult = (args: {
  documentKey: unknown
  documentKind: 'markdown' | 'json'
}): DocumentRepositoryAuthorityResult => {
  const normalizedPath = normalizeDocumentPath(args.documentKey)
  const reject = (): DocumentRepositoryAuthorityResult => ({
    ok: false,
    reason: 'unsupported-path',
    path: normalizedPath,
  })
  if (!normalizedPath || !isSafeRepositoryPath(normalizedPath)) return reject()
  if (normalizedPath === 'agentic-canvas-os' || normalizedPath.startsWith('agentic-canvas-os/')) return reject()
  if (pathMatchesRoot(normalizedPath, REJECTED_WORKSPACE_SEEDS_REPOSITORY_PATH)) return reject()

  let repositoryTarget: DocumentRepositoryTarget = DOCUMENT_REPOSITORY_TARGETS.workspaceDocs
  let repositoryPath = normalizedPath

  if (normalizedPath.startsWith('knowgrph/docs/')) {
    repositoryTarget = DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs
    repositoryPath = normalizedPath.slice('knowgrph/'.length)
  } else if (normalizedPath.startsWith('huijoohwee/docs/')) {
    repositoryPath = normalizedPath.slice('huijoohwee/'.length)
  } else if (isKnowgrphWorkspaceSeedsPath(normalizedPath)) {
    repositoryTarget = DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs
  } else if (!normalizedPath.startsWith('docs/')) {
    repositoryPath = `docs/${normalizedPath}`
  }

  if (!repositoryPath.startsWith('docs/') || !isSafeRepositoryPath(repositoryPath)) return reject()
  if (!hasSupportedExtension(repositoryPath, args.documentKind)) return reject()

  const repositoryName = repositoryTarget === DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs
    ? 'knowgrph'
    : 'huijoohwee'
  return {
    ok: true,
    authority: {
      repositoryTarget,
      githubPath: repositoryPath,
      canonicalPath: `${repositoryName}/${repositoryPath}`,
    },
  }
}

export const resolveDocumentRepositoryAuthority = (args: {
  documentKey: unknown
  documentKind: 'markdown' | 'json'
}): DocumentRepositoryAuthority | null => {
  const result = resolveDocumentRepositoryAuthorityResult(args)
  return result.ok ? result.authority : null
}
