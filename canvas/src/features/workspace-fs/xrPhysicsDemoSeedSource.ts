import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
  XR_PHYSICS_RUN_READY_DEMO_ID,
  resolveWorkspaceRunReadyDemoSeed,
} from './workspaceRunReadyDemos'
import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'
import { readEnvString } from '@/lib/config.env'

export const CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED = resolveWorkspaceRunReadyDemoSeed(
  readEnvString(WORKSPACE_RUN_READY_DEMO_ENV, ''),
) == null

export type WorkspaceDocsMirrorSeedEntry = {
  relPath: string
  text: string
  updatedAtMs: number
}

const normalizeRelPath = (value: string): string => String(value || '')
  .trim()
  .replace(/\\/g, '/')
  .replace(/^\/+/, '')
  .replace(/\/+$/, '')

let sourcePromise: Promise<string> | null = null

const normalizeSource = (value: unknown): string => {
  const text = String(value || '')
  if (!text.startsWith('---\n')) return ''
  if (!text.includes(`id: "${XR_PHYSICS_RUN_READY_DEMO_ID}"`)) return ''
  if (!text.includes('native_runtime: true')) return ''
  return text
}

const readNodeSource = async (): Promise<string> => {
  if (typeof process === 'undefined' || !process.versions?.node) return ''
  try {
    const [fs, path] = await Promise.all([importNodeFsPromises(), importNodePath()])
    const cwd = process.cwd()
    const candidates = [
      path.resolve(cwd, XR_PHYSICS_DEMO_REPO_REL_PATH),
      path.resolve(cwd, '..', XR_PHYSICS_DEMO_REPO_REL_PATH),
      path.resolve(cwd, 'knowgrph', XR_PHYSICS_DEMO_REPO_REL_PATH),
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

/**
 * Loads the canonical document in place. The literal raw import lets Vite own
 * dev/build bundling, while the Node branch keeps source-level tests faithful
 * without copying the Markdown into TypeScript.
 */
export function loadXrPhysicsDemoSeedSource(): Promise<string> {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      try {
        const module = await import('../../../../docs/workspace-seeds/knowgrph-physics-playground-demo.md?raw') as {
          default?: string
        }
        const bundled = normalizeSource(module.default)
        if (bundled) return bundled
      } catch {
        // The raw loader is Vite-owned; source-level Node tests use the exact file below.
      }
      return readNodeSource()
    })()
  }
  return sourcePromise
}

export async function mergeCanonicalXrPhysicsWorkspaceSeedIntoDocsMirror(
  entries: ReadonlyArray<WorkspaceDocsMirrorSeedEntry>,
): Promise<WorkspaceDocsMirrorSeedEntry[]> {
  if (!CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED) return [...entries]
  const text = String(await loadXrPhysicsDemoSeedSource() || '')
  if (!text.trim()) return [...entries]
  const canonicalRelPath = normalizeRelPath(XR_PHYSICS_DEMO_REPO_REL_PATH).replace(/^docs\//, '')
  const targetBasename = XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME.toLowerCase()
  const withoutConflicts = entries.filter(entry => {
    const basename = normalizeRelPath(entry.relPath).split('/').pop()?.toLowerCase() || ''
    return basename !== targetBasename
  })
  return [
    ...withoutConflicts,
    { relPath: canonicalRelPath, text, updatedAtMs: 0 },
  ].sort((a, b) => a.relPath.localeCompare(b.relPath))
}
