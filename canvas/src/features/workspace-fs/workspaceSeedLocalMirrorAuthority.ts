import { readEnvString } from '@/lib/config.env'
import {
  isAgenticGraphWorkspaceSeedsPath,
  isAgenticGraphWorkspaceSeedsRootPath,
} from 'grph-shared/collaboration/documentRepositoryAuthority'

const AG_FS_WRITE_PATH = '/__agentic_os_fs_write'

const normalizeRoot = (value: unknown): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

export const readAgenticGraphWorkspaceSeedsReadAbsRoot = (): string =>
  normalizeRoot(readEnvString('VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT', ''))

export async function deleteWorkspaceDocsMirrorEntry(args: { workspacePath: string }): Promise<boolean> {
  if (!isAgenticGraphWorkspaceSeedsPath(args.workspacePath) || isAgenticGraphWorkspaceSeedsRootPath(args.workspacePath)) return false
  if (typeof window !== 'undefined') {
    if (typeof fetch !== 'function' || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return false
    try {
      const response = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspacePath: args.workspacePath, deleteOnly: true }),
      })
      return response.ok
    } catch {
      return false
    }
  }
  return false
}
