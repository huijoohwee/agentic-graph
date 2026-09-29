import { parseWebsiteImportFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { resolveWorkspaceDocsMirrorAbsolutePath } from './workspaceSeedProviderPaths'
import type { WorkspaceEntrySource } from './sourceIndex'

export async function revealWorkspaceFileInManager(args: { path: string; text?: string; source?: WorkspaceEntrySource }): Promise<string> {
  const website = parseWebsiteImportFrontmatterMeta(args.text || '')
  const original = args.source?.kind === 'local' ? args.source.originalName || '' : ''
  const hostPath = /^(\/|[a-zA-Z]:[\\/])/.test(original) ? original : resolveWorkspaceDocsMirrorAbsolutePath(args.path)
  const body = website ? { website } : isAgenticGraphWorkspaceSeedsPath(args.path) ? { workspacePath: args.path } : { path: hostPath }
  if (!website && !hostPath && !('workspacePath' in body)) throw new Error('This item has no saved local file or folder to reveal')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/__agentic_os_fs_reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Reveal requires the local workspace host')
    const result = await response.json() as { ok?: boolean; message?: string; error?: string }
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'The local host could not reveal this item')
    return result.message || 'Opened local file manager'
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The local file manager request timed out')
    if (error instanceof TypeError) throw new Error('The local workspace host is unavailable')
    throw error
  } finally { clearTimeout(timeout) }
}
