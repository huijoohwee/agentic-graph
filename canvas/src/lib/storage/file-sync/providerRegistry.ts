import {
  normalizeFileSyncProviderId,
  type FileSyncProvider,
} from "./contract";

export type FileSyncProviderRegistration =
  | { status: "registered"; providerId: string }
  | { status: "duplicate-id"; providerId: string }
  | { status: "invalid-id"; providerId: string };

export class FileSyncProviderRegistry {
  private readonly providers = new Map<string, FileSyncProvider>();

  register(provider: FileSyncProvider): FileSyncProviderRegistration {
    let providerId: string;
    try {
      providerId = normalizeFileSyncProviderId(provider.providerId);
    } catch {
      return { status: "invalid-id", providerId: provider.providerId };
    }
    if (this.providers.has(providerId)) {
      return { status: "duplicate-id", providerId };
    }
    this.providers.set(providerId, provider);
    return { status: "registered", providerId };
  }

  get(providerId: string): FileSyncProvider | null {
    try {
      return (
        this.providers.get(normalizeFileSyncProviderId(providerId)) ?? null
      );
    } catch {
      return null;
    }
  }

  require(providerId: string): FileSyncProvider {
    const provider = this.get(providerId);
    if (!provider) {
      throw new Error("Unknown file-sync provider");
    }
    return provider;
  }

  listProviderIds(): string[] {
    return [...this.providers.keys()].sort();
  }
}
