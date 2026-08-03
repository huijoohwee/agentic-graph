import type { WorkspacePath } from '@/features/workspace-fs/types'

export function shouldAutosaveWorkspaceFile(args: {
  enabled: boolean
  path: WorkspacePath
  lastLoaded: { path: WorkspacePath; text: string } | null
  activeText: string
  debouncedText: string
}): boolean {
  if (!args.enabled) return false
  const path = args.path
  if (!path) return false
  const last = args.lastLoaded
  if (!last || last.path !== path) return false
  if (args.activeText === last.text) return false
  if (args.debouncedText !== args.activeText) return false
  return true
}
