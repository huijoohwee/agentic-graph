import {
  normalizeFileSyncKey,
  type FileSyncEntry,
  type FileSyncEntryType,
} from './file-sync'
import {
  FILE_SYNC_RELAY_API_VERSION,
  FILE_SYNC_RELAY_MAX_ENTRIES,
  RelayByteBudget,
  assertOpaque,
  assertRelayEntry,
  normalizeRelayHashes,
  relayFailure,
  sha256Hex,
  type RelayEntry,
  type RelayProviderType,
} from './knowgrphStorageFileSyncRelaySupport'

export type RelayMapping = {
  logicalKey: string
  parentPath: string
  relay: RelayEntry
  entry: FileSyncEntry
}

export type RelaySnapshot = {
  providerType: RelayProviderType
  entries: Map<string, RelayMapping>
  fences: Map<string, string>
  version: string
}

type RelayListResponse = {
  ok?: unknown
  apiVersion?: unknown
  providerId?: unknown
  entries?: unknown
  nextCursor?: unknown
  incomplete?: unknown
  listingFence?: unknown
}

type PostJson = (
  payload: unknown,
  signal: AbortSignal,
  budget: RelayByteBudget,
) => Promise<unknown>

export const loadRelaySnapshot = async (args: {
  workspaceId: string
  providerId: string
  postJson: PostJson
  signal: AbortSignal
  budget: RelayByteBudget
}): Promise<RelaySnapshot> => {
  const providerType = await readProviderType(args)
  const entries = new Map<string, RelayMapping>()
  const fences = new Map<string, string>()
  const portablePaths = new Set<string>()
  const stableKeys = new Set<string>()
  const directories: Array<{ path: string; parentKey: string | null }> = [
    { path: '', parentKey: null },
  ]
  for (
    let directoryIndex = 0;
    directoryIndex < directories.length;
    directoryIndex += 1
  ) {
    const directory = directories[directoryIndex]!
    const page = await listDirectory(args, directory.parentKey)
    fences.set(directory.path, page.listingFence)
    for (const relay of page.entries) {
      if (entries.size >= FILE_SYNC_RELAY_MAX_ENTRIES) {
        throw relayFailure('limit-exceeded')
      }
      const logicalKey = normalizeFileSyncKey(
        directory.path ? `${directory.path}/${relay.name}` : relay.name,
      )
      const portablePath = logicalKey.toLocaleLowerCase('en-US')
      if (
        entries.has(logicalKey)
        || portablePaths.has(portablePath)
        || stableKeys.has(relay.fileKey)
      ) {
        throw relayFailure('conflict')
      }
      const entry = await toRelayFileSyncEntry(
        args.providerId,
        logicalKey,
        relay,
        args.signal,
      )
      entries.set(logicalKey, {
        logicalKey,
        parentPath: directory.path,
        relay,
        entry,
      })
      portablePaths.add(portablePath)
      stableKeys.add(relay.fileKey)
      if (relay.kind === 'directory') {
        directories.push({ path: logicalKey, parentKey: relay.entryKey })
      }
    }
  }
  const signature = [...entries.values()]
    .sort((left, right) => left.logicalKey.localeCompare(right.logicalKey))
    .map(({ entry }) => JSON.stringify({
      key: entry.key,
      kind: entry.kind,
      entryType: entry.entryType,
      sizeBytes: entry.sizeBytes,
      hashes: entry.hashes,
      revision: entry.revision,
    }))
    .join('\n')
  const version = `relay:${await sha256Hex(
    new TextEncoder().encode(signature),
    args.signal,
  )}`
  return { providerType, entries, fences, version }
}

export const toRelayFileSyncEntry = async (
  providerId: string,
  logicalKey: string,
  relay: RelayEntry,
  signal: AbortSignal,
): Promise<FileSyncEntry> => {
  if (relay.kind === 'directory') {
    return {
      key: logicalKey,
      kind: 'directory',
      entryType: 'standard',
      sizeBytes: 0,
      hashes: [],
      revision: relay.versionTag,
      modifiedAtMs: null,
    }
  }
  if (relay.kind === 'unsupported') {
    return {
      key: logicalKey,
      kind: 'file',
      entryType: mapUnsupportedType(relay),
      sizeBytes: 0,
      hashes: [],
      revision: relay.versionTag,
      modifiedAtMs: null,
    }
  }
  const hashes = relay.hash
    ? [relay.hash]
    : [{
        algorithm: 'provider-version',
        value: await sha256Hex(new TextEncoder().encode(
          `${providerId}\0${relay.fileKey}\0${relay.versionTag}\0${relay.size}`,
        ), signal),
      }]
  return {
    key: logicalKey,
    kind: 'file',
    entryType: 'standard',
    sizeBytes: relay.size!,
    hashes: normalizeRelayHashes(hashes),
    revision: relay.versionTag,
    modifiedAtMs: null,
  }
}

const listDirectory = async (
  args: {
    workspaceId: string
    providerId: string
    postJson: PostJson
    signal: AbortSignal
    budget: RelayByteBudget
  },
  parentKey: string | null,
): Promise<{ entries: RelayEntry[]; listingFence: string }> => {
  const entries: RelayEntry[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  for (
    let pageIndex = 0;
    pageIndex < FILE_SYNC_RELAY_MAX_ENTRIES;
    pageIndex += 1
  ) {
    const body = await args.postJson({
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      workspaceId: args.workspaceId,
      providerId: args.providerId,
      action: 'list',
      parentKey,
      cursor,
      limit: 200,
    }, args.signal, args.budget) as RelayListResponse
    if (
      body.providerId !== args.providerId
      || !Array.isArray(body.entries)
      || body.entries.length > 200
      || typeof body.incomplete !== 'boolean'
    ) {
      throw relayFailure('failed')
    }
    entries.push(...body.entries.map(assertRelayEntry))
    if (entries.length > FILE_SYNC_RELAY_MAX_ENTRIES) {
      throw relayFailure('limit-exceeded')
    }
    const nextCursor = body.nextCursor == null
      ? null
      : assertOpaque(body.nextCursor, 16_384)
    const listingFence = body.listingFence == null
      ? null
      : assertOpaque(body.listingFence, 16_384)
    if (nextCursor) {
      if (!body.incomplete || listingFence || cursors.has(nextCursor)) {
        throw relayFailure('failed')
      }
      cursors.add(nextCursor)
      cursor = nextCursor
      continue
    }
    if (body.incomplete || !listingFence) throw relayFailure('failed')
    return { entries, listingFence }
  }
  throw relayFailure('limit-exceeded')
}

const readProviderType = async (args: {
  workspaceId: string
  providerId: string
  postJson: PostJson
  signal: AbortSignal
  budget: RelayByteBudget
}): Promise<RelayProviderType> => {
  const body = await args.postJson({
    apiVersion: FILE_SYNC_RELAY_API_VERSION,
    workspaceId: args.workspaceId,
    action: 'providers',
  }, args.signal, args.budget)
  if (!isRecord(body) || !Array.isArray(body.providers)) {
    throw relayFailure('failed')
  }
  const matches = body.providers.filter(provider =>
    isRecord(provider) && provider.providerId === args.providerId)
  if (matches.length !== 1) throw relayFailure('failed')
  const providerType = matches[0]!.providerType
  if (providerType !== 'google-drive' && providerType !== 'one-drive') {
    throw relayFailure('failed')
  }
  return providerType
}

const mapUnsupportedType = (entry: RelayEntry): FileSyncEntryType => {
  if (entry.unsupportedReason === 'native-document') return 'google-native'
  if (entry.unsupportedReason === 'shortcut') return 'shortcut'
  return 'graph-remote'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
