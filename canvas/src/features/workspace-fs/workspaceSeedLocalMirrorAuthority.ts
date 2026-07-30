import { readEnvString } from '@/lib/config.env'
import {
  isKnowgrphWorkspaceSeedsPath,
  isKnowgrphWorkspaceSeedsRootPath,
} from 'grph-shared/collaboration/documentRepositoryAuthority'

const KG_FS_WRITE_PATH = '/__kg_fs_write'

const normalizeRoot = (value: unknown): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

export const readKnowgrphWorkspaceSeedsReadAbsRoot = (): string =>
  normalizeRoot(readEnvString('VITE_KNOWGRPH_WORKSPACE_SEEDS_READ_ABS_ROOT', ''))

export async function deleteWorkspaceDocsMirrorEntry(args: { workspacePath: string }): Promise<boolean> {
  if (!isKnowgrphWorkspaceSeedsPath(args.workspacePath) || isKnowgrphWorkspaceSeedsRootPath(args.workspacePath)) return false
  if (typeof window !== 'undefined') {
    if (typeof fetch !== 'function' || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return false
    try {
      const response = await fetch(KG_FS_WRITE_PATH, {
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
