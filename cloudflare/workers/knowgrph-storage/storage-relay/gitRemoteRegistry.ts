import { StorageRelayError } from './storageRelaySafety'

export type GitRemoteRegistration = {
  remoteId: string
  workspaceId: string
  owner: string
  repository: string
  branch: string
  token: string
  allowedPathPrefixes: readonly string[]
  fetchPolicy: 'engine-authored-only' | 'normalized-commits'
}

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const BRANCH_PATTERN = /^(?!\/|.*(?:^|\/)\.\.?(?:\/|$))(?!.*(?:\/\/|\.lock$|@\{|[~^:?*[\]\\]))[^\u0000-\u001f\u007f ]{1,240}$/

const normalizeAuthorityPrefix = (value: string): string => {
  const prefix = String(value || '').normalize('NFC').replace(/^\/+|\/+$/g, '')
  if (
    !prefix
    || prefix.length > 512
    || prefix.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment === '.git')
    || /[\u0000-\u001f\u007f\\]/u.test(prefix)
  ) {
    throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
  }
  return prefix
}

const validateRegistration = (registration: GitRemoteRegistration): GitRemoteRegistration => {
  if (
    !OPAQUE_ID_PATTERN.test(registration.remoteId)
    || !OPAQUE_ID_PATTERN.test(registration.workspaceId)
    || !GITHUB_NAME_PATTERN.test(registration.owner)
    || !GITHUB_NAME_PATTERN.test(registration.repository)
    || !BRANCH_PATTERN.test(registration.branch)
    || !registration.token
    || registration.allowedPathPrefixes.length === 0
  ) {
    throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
  }
  const allowedPathPrefixes = registration.allowedPathPrefixes.map(normalizeAuthorityPrefix)
  if (new Set(allowedPathPrefixes).size !== allowedPathPrefixes.length) {
    throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
  }
  return Object.freeze({ ...registration, allowedPathPrefixes: Object.freeze(allowedPathPrefixes) })
}

export class GitRemoteRegistry {
  private readonly registrations = new Map<string, GitRemoteRegistration>()

  constructor(registrations: readonly GitRemoteRegistration[]) {
    for (const candidate of registrations) {
      const registration = validateRegistration(candidate)
      if (this.registrations.has(registration.remoteId)) {
        throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
      }
      this.registrations.set(registration.remoteId, registration)
    }
  }

  resolve(args: { remoteId: string; workspaceId: string }): GitRemoteRegistration {
    const registration = this.registrations.get(args.remoteId)
    if (!registration || registration.workspaceId !== args.workspaceId) {
      throw new StorageRelayError({ code: 'provider_not_configured', status: 404 })
    }
    return registration
  }

  listForWorkspace(workspaceId: string): Array<{
    remoteId: string
    branch: string
    fetchPolicy: GitRemoteRegistration['fetchPolicy']
  }> {
    return Array.from(this.registrations.values())
      .filter(registration => registration.workspaceId === workspaceId)
      .map(registration => ({
        remoteId: registration.remoteId,
        branch: registration.branch,
        fetchPolicy: registration.fetchPolicy,
      }))
  }
}
