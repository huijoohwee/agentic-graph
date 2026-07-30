import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'
import {
  isWorkspaceSourceMirrorFileName,
  shouldEncodeWorkspaceSourceMirrorAsBase64,
} from './workspaceSourceMirrorFormats'
import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProvider'

export const WORKSPACE_DOCS_MIRROR_MAX_FILES = 500
export const WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES = 500 * 1024

const normalizeAbsoluteRoot = (value: string): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')

const normalizeRelativePath = (value: string): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')

export async function readWorkspaceDocsMirrorEntriesViaNodeFs(
  docsAbsRoot: string,
): Promise<WorkspaceDocsMirrorEntry[]> {
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    const root = normalizeAbsoluteRoot(docsAbsRoot)
    if (!root) return []
    const out: WorkspaceDocsMirrorEntry[] = []
    const queue = [root]
    while (queue.length > 0 && out.length < WORKSPACE_DOCS_MIRROR_MAX_FILES) {
      const dir = queue.shift()
      if (!dir) continue
      let entries: Array<import('node:fs').Dirent> = []
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      entries.sort((left, right) => left.name.localeCompare(right.name))
      for (const entry of entries) {
        if (out.length >= WORKSPACE_DOCS_MIRROR_MAX_FILES) break
        const absPath = path.resolve(dir, entry.name)
        if (entry.isDirectory()) {
          queue.push(absPath)
          continue
        }
        if (!entry.isFile() || !isWorkspaceSourceMirrorFileName(entry.name)) continue
        try {
          const stat = await fs.stat(absPath)
          if (!stat.isFile() || stat.size > WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES) continue
          const text = shouldEncodeWorkspaceSourceMirrorAsBase64(entry.name)
            ? (await fs.readFile(absPath)).toString('base64')
            : String(await fs.readFile(absPath, 'utf8'))
          const relPath = normalizeRelativePath(path.relative(root, absPath))
          if (!relPath) continue
          out.push({
            relPath,
            text,
            updatedAtMs: Number.isFinite(stat.mtimeMs) ? Math.floor(stat.mtimeMs) : Date.now(),
          })
        } catch {
          continue
        }
      }
    }
    return out
  } catch {
    return []
  }
}
