import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readWorkspaceInitializationOutputDocsAbsRoot, resolveWorkspaceDocsMirrorAbsolutePath } from './workspaceSeedProviderPaths'
import type { WorkspaceEntrySource } from './sourceIndex'
import { WORKSPACE_REVEAL_MAX_BYTES } from './workspaceRevealContract'

export async function revealWorkspaceFileInManager(args: { path: string; kind?: 'file' | 'folder'; text?: string; source?: WorkspaceEntrySource }): Promise<string> {
  const original = args.source?.kind === 'local' ? args.source.originalName || '' : ''
  const localPath = /^(\/|[a-zA-Z]:[\\/])/.test(original) ? original : null
  const hostPath = resolveWorkspaceDocsMirrorAbsolutePath(args.path)
  const kind = args.kind ?? (typeof args.text === 'string' ? 'file' : 'folder')
  const outputRoot = readWorkspaceInitializationOutputDocsAbsRoot()
  const body = localPath ? { path: localPath, kind }
    : isAgenticGraphWorkspaceSeedsPath(args.path) ? { workspacePath: args.path, kind }
      : kind === 'file' && typeof args.text === 'string'
        ? { ...(hostPath ? { path: hostPath } : {}), ...(outputRoot ? { outputRoot } : {}), kind, snapshot: { workspacePath: args.path, text: args.text } }
        : { path: hostPath, kind }
  if (!localPath && !hostPath && !('snapshot' in body) && !('workspacePath' in body)) throw new Error('This item has no saved local file or folder to reveal')
  if (args.text && args.text.length > WORKSPACE_REVEAL_MAX_BYTES && 'snapshot' in body) throw new Error('Document copy exceeds 500 KB; export the document instead')
  const payload = JSON.stringify(body)
  if (new TextEncoder().encode(payload).byteLength > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Document copy exceeds 500 KB; export the document instead')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/__agentic_os_fs_reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: payload, signal: controller.signal })
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
