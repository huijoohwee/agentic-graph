import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readWorkspaceInitializationOutputDocsAbsRoot, resolveWorkspaceDocsMirrorAbsolutePath } from './workspaceSeedProviderPaths'
import type { WorkspaceEntry, WorkspaceFs } from './types'
import type { WorkspaceEntrySource } from './sourceIndex'
import { isWorkspaceWebsiteOutputPath, WORKSPACE_REVEAL_MAX_BYTES } from './workspaceRevealContract'

type RevealSelection = {
  path: string
  kind?: 'file' | 'folder'
  text?: string
  source?: WorkspaceEntrySource
  getFolderEntries?: () => readonly WorkspaceEntry[]
  readFileText?: WorkspaceFs['readFileText']
}

class WorkspaceRevealRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function revealWorkspaceFileInManager(args: RevealSelection): Promise<string> {
  const original = args.source?.kind === 'local' ? args.source.originalName || '' : ''
  const kind = args.kind ?? (typeof args.text === 'string' ? 'file' : 'folder')
  if (/^(\/|[a-zA-Z]:[\\/])/.test(original)) return requestReveal({ path: original, kind })
  if (isAgenticGraphWorkspaceSeedsPath(args.path)) return requestReveal({ workspacePath: args.path, kind })

  const hostPath = resolveWorkspaceDocsMirrorAbsolutePath(args.path)
  const outputRoot = readWorkspaceInitializationOutputDocsAbsRoot()
  const output = outputRoot ? { outputRoot } : {}
  const readText = args.readFileText ?? (async (filePath: string) => (await (await import('./workspaceFs')).getWorkspaceFs()).readFileText(filePath))
  if (kind === 'file') {
    const text = args.text ?? await readText(args.path)
    if (typeof text !== 'string') throw new Error('The selected file is unavailable; refresh before revealing it')
    if (text.length > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Document copy exceeds 500 KB; export the document instead')
    return requestReveal({ ...(hostPath ? { path: hostPath } : {}), ...output, kind, snapshot: { workspacePath: args.path, text } })
  }

  const saved = isWorkspaceWebsiteOutputPath(args.path) ? { workspacePath: args.path, ...output, kind }
    : hostPath ? { path: hostPath, kind } : null
  if (saved) {
    try { return await requestReveal(saved) }
    catch (error) {
      if (!(error instanceof WorkspaceRevealRequestError && error.status === 404 && args.getFolderEntries)) throw error
    }
  }
  if (!args.getFolderEntries) throw new Error('This item has no saved local file or folder to reveal')
  const descendants = args.getFolderEntries().filter(entry => entry.path.startsWith(args.path + '/'))
  if (descendants.length > 1_000) throw new Error('Folder copy exceeds 1,000 entries; reveal a smaller folder')
  const entries = []
  const encoder = new TextEncoder()
  let bytes = 0
  for (const entry of descendants) {
    if (entry.kind === 'folder') {
      entries.push({ workspacePath: entry.path, kind: entry.kind })
      continue
    }
    const text = entry.text ?? await readText(entry.path)
    if (typeof text !== 'string') throw new Error('A file in this folder is unavailable; refresh before revealing the folder')
    bytes += encoder.encode(text).byteLength
    if (bytes > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Folder copy exceeds 500 KB; reveal a smaller folder or export instead')
    entries.push({ workspacePath: entry.path, kind: entry.kind, text })
  }
  return requestReveal({ ...output, kind, folderSnapshot: { workspacePath: args.path, entries } })
}

async function requestReveal(body: Record<string, unknown>): Promise<string> {
  const payload = JSON.stringify(body)
  if (new TextEncoder().encode(payload).byteLength > WORKSPACE_REVEAL_MAX_BYTES) throw new Error(body.kind === 'folder'
    ? 'Folder copy exceeds 500 KB; reveal a smaller folder or export instead' : 'Document copy exceeds 500 KB; export the document instead')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/__agentic_os_fs_reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: payload, signal: controller.signal })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Reveal requires the local workspace host')
    const result = await response.json() as { ok?: boolean; message?: string; error?: string }
    if (!response.ok || result.ok !== true) throw new WorkspaceRevealRequestError(response.status, result.error || 'The local host could not reveal this item')
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
  const json = JSON.stringify({ saveOnly: true, kind: 'file', ...(outputRoot ? { outputRoot } : {}), snapshot: { workspacePath, text } })
  const encoder = new TextEncoder()
  const raw = encoder.encode(json).byteLength > WORKSPACE_REVEAL_MAX_BYTES
  if (raw && encoder.encode(text).byteLength > WORKSPACE_REVEAL_MAX_BYTES) throw new Error('Website document exceeds 500 KB; export it instead')
  const headers: Record<string, string> = raw ? {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Workspace-Website-Path': encodeURIComponent(workspacePath),
    ...(outputRoot ? { 'X-Workspace-Output-Root': encodeURIComponent(outputRoot) } : {}),
  } : { 'Content-Type': 'application/json' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch('/__agentic_os_fs_reveal', { method: 'POST', headers, body: raw ? text : json, signal: controller.signal })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Saving website documents requires the local workspace host')
    const result = await response.json() as { ok?: boolean; error?: string }
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'The local website document could not be saved')
  } finally { clearTimeout(timeout) }
}
