import { normalizeWorkspacePath } from './path'

const activeRoots = new Map<string, number>()

/** The crawler publishes its own Explorer entries until its final reconciliation. */
export function beginWebsiteImportExplorerUpdates(rootPath: string): () => void {
  const root = normalizeWorkspacePath(rootPath)
  activeRoots.set(root, (activeRoots.get(root) || 0) + 1)
  let finished = false
  return () => {
    if (finished) return
    finished = true
    const remaining = (activeRoots.get(root) || 1) - 1
    if (remaining > 0) activeRoots.set(root, remaining)
    else activeRoots.delete(root)
  }
}

export function isWebsiteImportExplorerUpdate(path: string | null | undefined): boolean {
  if (!path) return false
  const normalized = normalizeWorkspacePath(path)
  for (const root of activeRoots.keys()) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return true
  }
  return false
}
