import { persistImportInventory } from '@/features/workspace-fs/importInventoryPersistence'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource, type WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { isPendingLocalImportStubText } from './pendingLocalImport'
import { parseWebpageFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { resolveWebsiteImportNodeRelativeDocumentPath, safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'

/** Bounded-memory input identity, including every byte (never trust name/mtime/size alone). */
export async function importFileDigest(file: File): Promise<string | undefined> {
  if (file.size > 64 * 1024 * 1024) return undefined
  let digest = 'workspace-import-chunks-v1'
  for (let offset = 0; offset < file.size; offset += 256 * 1024) {
    const bytes = await file.slice(offset, offset + 256 * 1024).arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    digest = await importContentDigest(digest + Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''))
  }
  return importContentDigest(`${digest}:${file.size}:${file.type}`)
}

export type SavedUrlImport = { path: string; text: string; source: { kind: 'url'; url: string }; state: WorkspaceEntrySource['importState'] }
type SavedUrlImportAcceptance = (saved: SavedUrlImport) => boolean | Promise<boolean>

export async function indexSavedUrlImports(fs: WorkspaceFs, accept?: SavedUrlImportAcceptance) {
  const index = loadWorkspaceSourceIndex()
  const saved = new Map<string, SavedUrlImport>()
  for (const entry of (await fs.listEntries()).sort((a, b) => Number(/-\d+\.md$/.test(a.path)) - Number(/-\d+\.md$/.test(b.path)) || a.path.localeCompare(b.path))) {
    if (entry.kind !== 'file') continue
    const source = index[entry.path]
    const metadata = parseWebpageFrontmatterMeta(entry.text || '')
    const candidate = metadata?.url || (source?.kind === 'url' && source.importState ? source.url : '')
    if (!candidate) continue
    let key: string
    try { const parsed = new URL(candidate); parsed.hash = ''; key = parsed.href } catch { continue }
    const canonicalPath = `/websites/${safeWebsitePathSegment(new URL(key).host)}/${resolveWebsiteImportNodeRelativeDocumentPath({ nodeUrl: key })}`
    if (saved.has(key) && entry.path !== canonicalPath) continue
    const text = await fs.readFileText(entry.path)
    if (!text?.trim() || /Markdown conversion is unavailable for this page|kgPendingLocalImport/.test(text)) continue
    const candidateImport: SavedUrlImport = { path: entry.path, text, source: { kind: 'url', url: key }, state: source?.importState }
    if (accept && !await accept(candidateImport)) continue
    saved.set(key, candidateImport)
  }
  return saved
}

export async function findSavedUrlImport(fs: WorkspaceFs, url: string, accept?: SavedUrlImportAcceptance) {
  const key = new URL(url); key.hash = ''
  return (await indexSavedUrlImports(fs, accept)).get(key.href) || null
}

export async function recordUrlImport(fs: WorkspaceFs, path: string, url: string) {
  const text = await fs.readFileText(path)
  if (text === null) return
  const key = new URL(url); key.hash = ''
  setWorkspaceEntrySource(path, { kind: 'url', url: key.href, importState: {
    identity: `url:${key.href}`, outputDigest: await importContentDigest(text), checkedAt: Date.now(), status: 'imported',
  } }, { persist: 'sync' })
  await persistImportInventory(fs)
}

/** One receipt on each existing source-index row; no parallel catalog or content store. */
export async function beginLocalIncrementalImport(fs: WorkspaceFs, file: File, identity: string) {
  const inputDigest = await importFileDigest(file)
  const index = loadWorkspaceSourceIndex()
  const previous = Object.entries(index).filter(([, source]) => source.importState?.identity === identity)
  const prior = new Map<string, string>()
  for (const [path, source] of previous) {
    const text = await fs.readFileText(path)
    if (text === null) continue
    if (await importContentDigest(text) !== source.importState!.outputDigest) throw new Error(`Import conflict: ${path} was edited locally; its content was preserved.`)
    prior.set(path, text)
  }
  const cached = !!inputDigest && previous.length > 0 && prior.size === previous.length && [...prior.values()].every(text => !isPendingLocalImportStubText(text) && !/blob:|PendingLocalPath/.test(text)) && previous.every(([, source]) => source.importState?.inputDigest === inputDigest)
  const touched = new Map<string, string>()
  const write = async (path: string, text: string) => {
    const observed = await fs.readFileText(path)
    if (observed === text) { touched.set(path, text); return }
    if (observed !== null && !isPendingLocalImportStubText(observed) && (!prior.has(path) || observed !== prior.get(path))) throw new Error(`Import conflict: ${path} already contains different content; it was preserved.`)
    await fs.writeFileText(path, text, { expectedText: observed })
    touched.set(path, text)
    // A converter may legitimately write one output more than once in this transaction.
    prior.set(path, text)
  }
  const tracked: WorkspaceFs = { ...fs, writeFileText: write, createFile: async args => {
    const path = normalizeWorkspacePath(`${args.parentPath}/${args.name}`)
    const current = await fs.readFileText(path)
    if (current !== null) { await write(path, args.text); return path }
    const created = await fs.createFile({ ...args, requireExactPath: true })
    touched.set(created, args.text); prior.set(created, args.text)
    return created
  } }
  return {
    fs: tracked,
    cached: cached ? previous.map(([path, source]) => ({ path, source, text: prior.get(path)! })) : null,
    async commit() {
      for (const [path, text] of cached ? prior : touched) {
        if (await fs.readFileText(path) !== text) throw new Error(`Import changed before completion: ${path}`)
        const source: WorkspaceEntrySource = { kind: 'local', originalName: file.name, importState: {
          identity, inputDigest, outputDigest: await importContentDigest(text), checkedAt: Date.now(), status: cached ? 'unchanged' : 'imported',
        } }
        setWorkspaceEntrySource(path, source, { persist: 'sync' })
      }
    },
  }
}
