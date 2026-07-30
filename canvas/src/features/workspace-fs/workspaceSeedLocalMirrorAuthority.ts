import { readEnvString } from '@/lib/config.env'
import { readWorkspaceDocsMirrorRootPathSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { importNodeFsPromises } from './workspaceSeedNodeModules'
import { resolveKnowgrphWorkspaceSeedsAbsRoot } from './workspaceDocsMirrorLocalRoots'
import {
  isKnowgrphWorkspaceSeedsPath,
  isKnowgrphWorkspaceSeedsRootPath,
} from 'grph-shared/collaboration/documentRepositoryAuthority'

const KG_FS_WRITE_PATH = '/__kg_fs_write'

const normalizeRoot = (value: unknown): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

const normalizeWorkspacePath = (value: unknown): string =>
  String(value || '').trim().replace(/^workspace:/i, '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')

export const readKnowgrphWorkspaceSeedsAbsRoot = (): string => resolveKnowgrphWorkspaceSeedsAbsRoot({
  docsAbsRoot: readWorkspaceDocsMirrorRootPathSetting(),
  explicitAbsRoot: readEnvString('VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT', ''),
})

export const resolveKnowgrphWorkspaceSeedMirrorAbsolutePath = (workspacePath: string): string | null => {
  if (!isKnowgrphWorkspaceSeedsPath(workspacePath)) return null
  const root = normalizeRoot(readKnowgrphWorkspaceSeedsAbsRoot())
  const normalized = normalizeWorkspacePath(workspacePath)
  const relPath = normalized.replace(/^docs\/workspace-seeds\/?/, '')
  return root ? (relPath ? `${root}/${relPath}` : root) : null
}

export async function deleteWorkspaceDocsMirrorEntry(args: { workspacePath: string }): Promise<boolean> {
  if (!isKnowgrphWorkspaceSeedsPath(args.workspacePath) || isKnowgrphWorkspaceSeedsRootPath(args.workspacePath)) return false
  const absolutePath = resolveKnowgrphWorkspaceSeedMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    if (typeof fetch !== 'function' || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return false
    try {
      const response = await fetch(KG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: absolutePath, workspacePath: args.workspacePath, deleteOnly: true }),
      })
      return response.ok
    } catch {
      return false
    }
  }
  try {
    const fs = await importNodeFsPromises()
    await fs.rm(absolutePath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
