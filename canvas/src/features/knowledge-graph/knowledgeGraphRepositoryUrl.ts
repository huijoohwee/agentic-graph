const REPOSITORY_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._~-]{0,199})$/
const MAX_REPOSITORY_PATH_SEGMENTS = 32

export class KnowledgeGraphRepositoryUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowledgeGraphRepositoryUrlError'
  }
}

export type KnowledgeGraphRepositoryUrl = {
  canonicalUrl: string
  explicitGitSuffix: boolean
  hostname: string
  repositoryPath: string
}

export function parseKnowledgeGraphRepositoryUrl(value: unknown): KnowledgeGraphRepositoryUrl {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new KnowledgeGraphRepositoryUrlError('Enter a credential-free HTTPS repository URL.')
  }
  if (
    url.protocol !== 'https:'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new KnowledgeGraphRepositoryUrlError(
      'Repository URLs must use credential-free HTTPS without a port, query, or fragment.',
    )
  }
  let parts: string[]
  try {
    parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part))
  } catch {
    throw new KnowledgeGraphRepositoryUrlError('The repository URL contains invalid path encoding.')
  }
  if (!parts.length || parts.length > MAX_REPOSITORY_PATH_SEGMENTS) {
    throw new KnowledgeGraphRepositoryUrlError('The repository URL must contain a bounded repository path.')
  }
  const finalPart = String(parts.at(-1) || '')
  const explicitGitSuffix = /\.git$/i.test(finalPart)
  const repository = finalPart.replace(/\.git$/i, '')
  const canonicalParts = [...parts.slice(0, -1), repository]
  if (!repository || canonicalParts.some(part => (
    part === '.'
    || part === '..'
    || !REPOSITORY_PATH_SEGMENT.test(part)
  ))) {
    throw new KnowledgeGraphRepositoryUrlError('The repository URL contains an unsafe path segment.')
  }
  const hostname = url.hostname.toLowerCase()
  const repositoryPath = canonicalParts.join('/')
  const encodedPath = canonicalParts.map(part => encodeURIComponent(part)).join('/')
  return {
    canonicalUrl: `https://${hostname}/${encodedPath}`,
    explicitGitSuffix,
    hostname,
    repositoryPath,
  }
}

export function normalizeKnowledgeGraphRepositoryUrl(value: unknown): string {
  return parseKnowledgeGraphRepositoryUrl(value).canonicalUrl
}

export function normalizeKnowledgeGraphRepositoryRemoteUrl(value: unknown): string {
  const parsed = parseKnowledgeGraphRepositoryUrl(value)
  return parsed.explicitGitSuffix ? `${parsed.canonicalUrl}.git` : parsed.canonicalUrl
}
