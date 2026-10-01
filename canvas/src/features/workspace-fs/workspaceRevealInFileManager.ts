import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readWorkspaceInitializationOutputDocsAbsRoot, resolveWorkspaceDocsMirrorAbsolutePath } from './workspaceSeedProviderPaths'
import type { WorkspaceEntry, WorkspaceFs } from './types'
import type { WorkspaceEntrySource } from './sourceIndex'
import { WORKSPACE_REVEAL_MAX_BYTES } from './workspaceRevealContract'

export async function revealWorkspaceFileInManager(args: { path: string; kind?: 'file' | 'folder'; text?: string; source?: WorkspaceEntrySource; entries?: WorkspaceEntry[]; readFileText?: WorkspaceFs['readFileText'] }): Promise<string> {
  const original = args.source?.kind === 'local' ? args.source.originalName || '' : ''
  const localPath = /^(\/|[a-zA-Z]:[\\/])/.test(original) ? original : null
  const hostPath = resolveWorkspaceDocsMirrorAbsolutePath(args.path)
  const kind = args.kind ?? (typeof args.text === 'string' ? 'file' : 'folder')
  const outputRoot = readWorkspaceInitializationOutputDocsAbsRoot()
  const readText = args.readFileText ?? (async (filePath: string) => (await (await import('./workspaceFs')).getWorkspaceFs()).readFileText(filePath))
  let text = args.text
  let folderEntries: Array<{ workspacePath: string; kind: 'file' | 'folder'; text?: string }> | undefined
  if (!localPath && !isAgenticGraphWorkspaceSeedsPath(args.path)) {
    if (kind === 'file' && typeof text !== 'string') {
      text = await readText(args.path) ?? undefined
      if (typeof text !== 'string') throw new Error('The selected file is unavailable; refresh before revealing it')
    }
    if (kind === 'folder' && args.entries) {
      const descendants = args.entries.filter(entry => entry.path.startsWith(args.path + '/'))
      if (descendants.length > 1_000) throw new Error('Folder copy exceeds 1,000 entries; reveal a smaller folder')
      folderEntries = []
      let bytes = 0
      for (const entry of descendants) {
        const content = entry.kind === 'file' ? entry.text ?? await readText(entry.path) : undefined
        if (entry.kind === 'file' && typeof content !== 'string') throw new Error('A file in this folder is unavailable; refresh before revealing the folder')
        bytes += new TextEncoder().encode(content ?? '').byteLength
        if (bytes > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Folder copy exceeds 500 KB; reveal a smaller folder or export instead')
        folderEntries.push({ workspacePath: entry.path, kind: entry.kind, ...(entry.kind === 'file' ? { text: content! } : {}) })
      }
    }
  }
  const body = localPath ? { path: localPath, kind }
    : isAgenticGraphWorkspaceSeedsPath(args.path) ? { workspacePath: args.path, kind }
      : kind === 'folder' && folderEntries
        ? { ...(outputRoot ? { outputRoot } : {}), kind, folderSnapshot: { workspacePath: args.path, entries: folderEntries } }
      : kind === 'file' && typeof text === 'string'
        ? { ...(hostPath ? { path: hostPath } : {}), ...(outputRoot ? { outputRoot } : {}), kind, snapshot: { workspacePath: args.path, text } }
        : { path: hostPath, kind }
  if (!localPath && !hostPath && !('snapshot' in body) && !('folderSnapshot' in body) && !('workspacePath' in body)) throw new Error('This item has no saved local file or folder to reveal')
  if (text && text.length > WORKSPACE_REVEAL_MAX_BYTES && 'snapshot' in body) throw new Error('Document copy exceeds 500 KB; export the document instead')
  const payload = JSON.stringify(body)
  if (new TextEncoder().encode(payload).byteLength > WORKSPACE_REVEAL_MAX_BYTES) throw new Error(kind === 'folder'
    ? 'Folder copy exceeds 500 KB; reveal a smaller folder or export instead' : 'Document copy exceeds 500 KB; export the document instead')
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

/** Local Dev publishes the final workspace bytes; remote/offline browsers keep their existing store. */
export async function saveWorkspaceWebsiteLocalCopy(workspacePath: string, text: string): Promise<void> {
  if (!workspacePath.startsWith('/websites/') || typeof window === 'undefined'
    || !['localhost', '127.0.0.1', '[::1]'].includes(window.location?.hostname || '')) return
  const outputRoot = readWorkspaceInitializationOutputDocsAbsRoot()
  const payload = JSON.stringify({ saveOnly: true, kind: 'file', ...(outputRoot ? { outputRoot } : {}), snapshot: { workspacePath, text } })
  if (new TextEncoder().encode(payload).byteLength > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Website document exceeds 500 KB; export it instead')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/__agentic_os_fs_reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: controller.signal })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Saving website documents requires the local workspace host')
    const result = await response.json() as { ok?: boolean; error?: string }
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'The local website document could not be saved')
  } finally { clearTimeout(timeout) }
}
