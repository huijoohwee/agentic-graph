import { hashStringToHex } from '@/lib/hash/stringHash'
import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'

export const CANONICAL_WORKSPACE_SEED_BASENAMES = [
  'README.md',
  'knowgrph-ar-vr-xr-runtime-readiness-demo.md',
  'knowgrph-game-city-building-sim-demo.md',
  'knowgrph-game-flight-sim-demo.companion.md',
  'knowgrph-game-flight-sim-demo.md',
  'knowgrph-game-mmorpg-demo.companion.md',
  'knowgrph-game-mmorpg-demo.md',
  'knowgrph-physics-playground-demo.md',
] as const

export type CanonicalWorkspaceSeedBasename = typeof CANONICAL_WORKSPACE_SEED_BASENAMES[number]

export type CanonicalWorkspaceSeedBundleEntry = {
  relPath: string
  text: string
  updatedAtMs: number
}

type RawSourceModule = {
  default?: string
}

const WORKSPACE_SEED_REPO_REL_ROOT = 'docs/workspace-seeds'

let bundleReadInFlight: Promise<CanonicalWorkspaceSeedBundleEntry[]> | null = null

const normalizeSource = (value: unknown): string => {
  const text = typeof value === 'string' ? value : ''
  return text.trim() ? text : ''
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
      path.resolve(cwd, 'knowgrph', relativePath),
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
