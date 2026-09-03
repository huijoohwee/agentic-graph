import { hashStringToHex } from '@/lib/hash/stringHash'
import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'

export const CANONICAL_WORKSPACE_SEED_BASENAMES = [
  'README.md',
  'agentic-graph-ar-vr-xr-runtime-readiness-demo.md',
  'agentic-graph-game-city-building-sim-demo.md',
  'agentic-graph-game-flight-sim-demo.companion.md',
  'agentic-graph-game-flight-sim-demo.md',
  'agentic-graph-game-mmorpg-demo.companion.md',
  'agentic-graph-game-mmorpg-demo.md',
  'agentic-graph-physics-playground-demo.md',
] as const

export type CanonicalWorkspaceSeedBasename = typeof CANONICAL_WORKSPACE_SEED_BASENAMES[number]

export type CanonicalWorkspaceSeedBundleEntry = {
  relPath: string
  text: string
  updatedAtMs: number
}

export type CanonicalWorkspaceSeedInventoryEntry = CanonicalWorkspaceSeedBundleEntry

type RawSourceModule = {
  default?: string
}

const WORKSPACE_SEED_REPO_REL_ROOT = 'docs/workspace-seeds'
const WORKSPACE_SEED_REL_ROOT = 'workspace-seeds'
const CANONICAL_WORKSPACE_SEED_BASENAME_SET = new Set<string>(CANONICAL_WORKSPACE_SEED_BASENAMES)

let bundleReadInFlight: Promise<CanonicalWorkspaceSeedBundleEntry[]> | null = null

const normalizeSource = (value: unknown): string => {
  const text = typeof value === 'string' ? value : ''
  return text.trim() ? text : ''
}

const normalizeWorkspaceSeedPath = (value: unknown): string => {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  return normalized.startsWith('docs/') ? normalized.slice('docs/'.length) : normalized
}

export const readCanonicalWorkspaceSeedBasename = (
  value: unknown,
): CanonicalWorkspaceSeedBasename | null => {
  const relPath = normalizeWorkspaceSeedPath(value)
  const prefix = `${WORKSPACE_SEED_REL_ROOT}/`
  if (!relPath.startsWith(prefix)) return null
  const basename = relPath.slice(prefix.length)
  if (basename.includes('/') || !CANONICAL_WORKSPACE_SEED_BASENAME_SET.has(basename)) return null
  return basename as CanonicalWorkspaceSeedBasename
}

export const isCanonicalWorkspaceSeedPath = (value: unknown): boolean => (
  readCanonicalWorkspaceSeedBasename(value) !== null
)

const analyzeCanonicalWorkspaceSeedInventory = <Entry extends CanonicalWorkspaceSeedInventoryEntry>(
  entries: ReadonlyArray<Entry>,
): { byBasename: Map<CanonicalWorkspaceSeedBasename, Entry>; exact: boolean } => {
  const byBasename = new Map<CanonicalWorkspaceSeedBasename, Entry>()
  const duplicates = new Set<CanonicalWorkspaceSeedBasename>()
  let canonicalPathCount = 0
  let invalidCanonicalPathCount = 0
  for (const entry of Array.isArray(entries) ? entries : []) {
    const relPath = normalizeWorkspaceSeedPath(entry?.relPath)
    const basename = readCanonicalWorkspaceSeedBasename(relPath)
    if (!basename) continue
    canonicalPathCount += 1
    const valid = normalizeSource(entry?.text)
      && Number.isFinite(entry?.updatedAtMs)
      && entry.updatedAtMs >= 0
    if (!valid) {
      invalidCanonicalPathCount += 1
      continue
    }
    if (byBasename.has(basename) || duplicates.has(basename)) {
      byBasename.delete(basename)
      duplicates.add(basename)
      invalidCanonicalPathCount += 1
      continue
    }
    byBasename.set(basename, entry)
  }
  return {
    byBasename,
    exact: invalidCanonicalPathCount === 0
      && canonicalPathCount === CANONICAL_WORKSPACE_SEED_BASENAMES.length
      && byBasename.size === CANONICAL_WORKSPACE_SEED_BASENAMES.length,
  }
}

export const hasExactCanonicalWorkspaceSeedInventory = (
  entries: ReadonlyArray<CanonicalWorkspaceSeedInventoryEntry>,
): boolean => analyzeCanonicalWorkspaceSeedInventory(entries).exact

export const resolveCompleteCanonicalWorkspaceSeedInventory = <
  Entry extends CanonicalWorkspaceSeedInventoryEntry,
>(
  bundledEntries: ReadonlyArray<Entry>,
  liveEntries: ReadonlyArray<Entry>,
): Entry[] => {
  const bundled = analyzeCanonicalWorkspaceSeedInventory(bundledEntries)
  const live = analyzeCanonicalWorkspaceSeedInventory(liveEntries)
  if (!live.exact && !bundled.exact) return []
  const fallback = live.exact ? live.byBasename : bundled.byBasename
  return CANONICAL_WORKSPACE_SEED_BASENAMES.map(basename => (
    live.byBasename.get(basename) || fallback.get(basename)
  )).filter((entry): entry is Entry => !!entry).map(entry => ({ ...entry }))
}

const BUNDLED_SOURCE_MODULES = (() => {
  try {
    return import.meta.glob('../../../../docs/workspace-seeds/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string | RawSourceModule>
  } catch {
    return {} as Record<string, string | RawSourceModule>
  }
})()

const readBundledSource = (basename: CanonicalWorkspaceSeedBasename): string => {
  const expectedSuffix = `/docs/workspace-seeds/${basename}`
  for (const [modulePath, rawModule] of Object.entries(BUNDLED_SOURCE_MODULES)) {
    if (!modulePath.endsWith(expectedSuffix)) continue
    if (typeof rawModule === 'string') return normalizeSource(rawModule)
    return normalizeSource(rawModule?.default)
  }
  return ''
}

const readStableUpdatedAtMs = (relPath: string, text: string): number => {
  const digest = hashStringToHex(`${relPath}\n${text}`).slice(0, 12)
  const parsed = Number.parseInt(digest, 16)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

const readNodeSource = async (basename: CanonicalWorkspaceSeedBasename): Promise<string> => {
  if (typeof process === 'undefined' || !process.versions?.node) return ''
  try {
    const [fs, path] = await Promise.all([importNodeFsPromises(), importNodePath()])
    const relativePath = `${WORKSPACE_SEED_REPO_REL_ROOT}/${basename}`
    const cwd = process.cwd()
    const candidates = [
      path.resolve(cwd, relativePath),
      path.resolve(cwd, '..', relativePath),
      path.resolve(cwd, 'agentic-graph', relativePath),
    ]
    for (const candidate of new Set(candidates)) {
      try {
        const text = normalizeSource(await fs.readFile(candidate, 'utf8'))
        if (text) return text
      } catch {
        continue
      }
    }
  } catch {
    return ''
  }
  return ''
}

const readCanonicalSource = async (
  basename: CanonicalWorkspaceSeedBasename,
): Promise<string> => {
  const bundled = readBundledSource(basename)
  if (bundled) return bundled
  return readNodeSource(basename)
}

export const readCanonicalWorkspaceSeedBundleEntries = async (): Promise<
  CanonicalWorkspaceSeedBundleEntry[]
> => {
  if (!bundleReadInFlight) {
    bundleReadInFlight = (async () => {
      const sources = await Promise.all(
        CANONICAL_WORKSPACE_SEED_BASENAMES.map(readCanonicalSource),
      )
      if (sources.some(source => !source)) return []
      return CANONICAL_WORKSPACE_SEED_BASENAMES.map((basename, index) => {
        const relPath = `workspace-seeds/${basename}`
        const text = sources[index] || ''
        return {
          relPath,
          text,
          updatedAtMs: readStableUpdatedAtMs(relPath, text),
        }
      })
    })()
  }
  const activeRead = bundleReadInFlight
  try {
    const entries = await activeRead
    return entries.map(entry => ({ ...entry }))
  } finally {
    if (bundleReadInFlight === activeRead) bundleReadInFlight = null
  }
}
