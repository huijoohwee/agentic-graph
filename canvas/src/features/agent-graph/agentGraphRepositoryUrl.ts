const REPOSITORY_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._~-]{0,199})$/
const MAX_REPOSITORY_PATH_SEGMENTS = 32

export class AgentGraphRepositoryUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentGraphRepositoryUrlError'
  }
}

export type AgentGraphRepositoryUrl = {
  canonicalUrl: string
  explicitGitSuffix: boolean
  hostname: string
  repositoryPath: string
}

export function parseAgentGraphRepositoryUrl(value: unknown): AgentGraphRepositoryUrl {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new AgentGraphRepositoryUrlError('Enter a credential-free HTTPS repository URL.')
  }
  if (
    url.protocol !== 'https:'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new AgentGraphRepositoryUrlError(
      'Repository URLs must use credential-free HTTPS without a port, query, or fragment.',
    )
  }
  let parts: string[]
  try {
    parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part))
  } catch {
    throw new AgentGraphRepositoryUrlError('The repository URL contains invalid path encoding.')
  }
  if (!parts.length || parts.length > MAX_REPOSITORY_PATH_SEGMENTS) {
    throw new AgentGraphRepositoryUrlError('The repository URL must contain a bounded repository path.')
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
    throw new AgentGraphRepositoryUrlError('The repository URL contains an unsafe path segment.')
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

export function normalizeAgentGraphRepositoryUrl(value: unknown): string {
  return parseAgentGraphRepositoryUrl(value).canonicalUrl
}

export function normalizeAgentGraphRepositoryRemoteUrl(value: unknown): string {
  const parsed = parseAgentGraphRepositoryUrl(value)
  return parsed.explicitGitSuffix ? `${parsed.canonicalUrl}.git` : parsed.canonicalUrl
}
