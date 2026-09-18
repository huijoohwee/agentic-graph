import { hashStringToHex } from '@/lib/hash/stringHash'
import { normalizeWorkspacePath } from './path'
import type { WorkspaceEntry, WorkspacePath } from './types'

/** Only the retired seed locations are migrated; imported/user paths remain owned by the user. */
export const RETIRED_XR_WORKSPACE_SEED_PATHS = Object.freeze([
  '/docs/workspace-seeds/agentic-graph-physics-playground-demo.md',
  '/docs/workspace-seeds/knowgrph-physics-playground-demo.md',
])

export function preserveRetiredXrSeed(
  text: string,
  entries: ReadonlyMap<WorkspacePath, WorkspaceEntry>,
): WorkspaceEntry | null {
  const base = `/notes/Recovered Playground ${hashStringToHex(text)}`
  for (let suffix = 0; ; suffix += 1) {
    const path = normalizeWorkspacePath(`${base}${suffix ? `-${suffix}` : ''}.md`)
    const existing = entries.get(path)
    if (existing?.kind === 'file' && existing.text === text) return null
    if (existing) continue
    return { path, parentPath: '/notes', kind: 'file', name: path.slice('/notes/'.length), text, updatedAtMs: Date.now() }
  }
}
