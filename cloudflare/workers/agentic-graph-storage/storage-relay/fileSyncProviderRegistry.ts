import type { FileSyncProvider } from './fileSyncProvider'
import { StorageRelayError } from './storageRelaySafety'

export type FileSyncProviderRegistration = {
  providerId: string
  workspaceId: string
  label: string
  rootKey: string
  rootResourceId: string
  provider: FileSyncProvider
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/

const validateRegistration = (
  registration: FileSyncProviderRegistration,
): FileSyncProviderRegistration => {
  if (
    !IDENTIFIER_PATTERN.test(registration.providerId)
    || !IDENTIFIER_PATTERN.test(registration.workspaceId)
    || !IDENTIFIER_PATTERN.test(registration.rootKey)
    || !registration.rootResourceId
    || registration.rootResourceId.length > 1024
    || /[\u0000-\u001f\u007f]/u.test(registration.rootResourceId)
    || !registration.label.trim()
    || registration.label.length > 128
  ) {
    throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
  }
  return Object.freeze({ ...registration })
}

export class FileSyncProviderRegistry {
  private readonly registrations = new Map<string, FileSyncProviderRegistration>()

  constructor(registrations: readonly FileSyncProviderRegistration[]) {
    for (const candidate of registrations) {
      const registration = validateRegistration(candidate)
      if (this.registrations.has(registration.providerId)) {
        throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
      }
      this.registrations.set(registration.providerId, registration)
    }
  }

  resolve(args: { providerId: string; workspaceId: string }): FileSyncProviderRegistration {
    const registration = this.registrations.get(args.providerId)
    if (!registration || registration.workspaceId !== args.workspaceId) {
      throw new StorageRelayError({ code: 'provider_not_configured', status: 404 })
    }
    return registration
  }

  listForWorkspace(workspaceId: string): Array<{
    providerId: string
    label: string
    providerType: FileSyncProvider['providerType']
  }> {
    return Array.from(this.registrations.values())
      .filter(registration => registration.workspaceId === workspaceId)
      .map(registration => ({
        providerId: registration.providerId,
        label: registration.label,
        providerType: registration.provider.providerType,
      }))
  }
}
