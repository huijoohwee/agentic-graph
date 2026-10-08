import type { WorkspaceEntry, WorkspaceFs } from './types'
import { createWorkspaceFolderTreeEnsurer } from './ensureFolderTreeIfMissing'
import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from './sourceIndex'
import { parseWebpageFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { extractMarkdownLinks } from '@/lib/websites/webpageMarkdownArtifactUtils'
import { IMPORT_INDEX_NAME, importInventoryPath, importInventorySource, readImportInventory, replaceImportInventory, type ImportInventoryItem } from './importInventory'

const queues = new WeakMap<WorkspaceFs, Promise<unknown>>()
const mirrored = new WeakMap<WorkspaceFs, Map<string, string>>()
const pendingText = (text: string) => /kgPendingLocalImport|PendingLocalPath|Markdown conversion is unavailable for this page/.test(text)
const isArtifactLink = (source: string) => {
  if (source.startsWith('local:')) return false
  const url = new URL(source)
  return url.pathname === '/__website_import/artifact' && url.searchParams.has('importId')
}

function mergeItem(previous: ImportInventoryItem | undefined, incoming: ImportInventoryItem): ImportInventoryItem {
  const outputs = new Map((previous?.outputs || []).map(output => [output.path, output]))
  for (const output of incoming.outputs || []) {
    const prior = outputs.get(output.path)
    const stable = prior?.receipt && output.receipt && ['identity', 'inputDigest', 'outputDigest', 'etag', 'lastModified'].every(key =>
      prior.receipt![key as keyof typeof prior.receipt] === output.receipt![key as keyof typeof output.receipt])
    outputs.set(output.path, stable ? prior : { ...prior, ...output })
  }
  return { source: incoming.source, status: incoming.outputs?.length ? incoming.status : previous?.status || incoming.status,
    ...(outputs.size ? { outputs: [...outputs.values()].sort((a, b) => a.path.localeCompare(b.path)) } : {}),
    ...(incoming.detail ? { detail: incoming.detail } : previous?.detail && !incoming.outputs?.length ? { detail: previous.detail } : {}) }
}

/** One serialized, conditional WorkspaceFs write per changed collection; never fetches source URLs. */
export function persistImportInventory(fs: WorkspaceFs, known: ImportInventoryItem[] = [], entries?: WorkspaceEntry[]): Promise<boolean> {
  const queued = queues.has(fs)
  const run = async () => {
    const list = entries && !queued ? entries : await fs.listEntries()
    const files = new Map(list.filter(entry => entry.kind === 'file').map(entry => [entry.path, entry]))
    const groups = new Map<string, ImportInventoryItem[]>()
    for (const entry of list) if (entry.kind === 'file' && entry.name === IMPORT_INDEX_NAME) groups.set(entry.path, [])
    const add = (item: ImportInventoryItem) => {
      const source = importInventorySource(item.source), path = importInventoryPath(source)
      const rows = groups.get(path) || []; rows.push({ ...item, source }); groups.set(path, rows)
    }
    const sources = loadWorkspaceSourceIndex()
    for (const entry of files.values()) {
      if (entry.name === IMPORT_INDEX_NAME) continue
      const source = sources[entry.path]
      const url = parseWebpageFrontmatterMeta(entry.text || '')?.url || (source?.kind === 'url' ? source.url : '')
      const provenance = source?.importState?.identity
      const identity = provenance?.startsWith('url:') ? provenance.slice(4) : provenance || url
      if (!identity) continue
      let normalized: string
      try { normalized = importInventorySource(identity) } catch { continue }
      const text = entry.text ?? await fs.readFileText(entry.path) ?? ''
      add({ source: normalized, status: pendingText(text) ? 'pending' : 'imported', outputs: [{ path: entry.path,
        ...(source?.importState ? { receipt: source.importState } : {}) }] })
      if (url) {
        try { if (importInventorySource(url) !== normalized) add({ source: url, status: pendingText(text) ? 'pending' : 'imported', outputs: [{ path: entry.path }] }) } catch { /* Unsupported capture alias. */ }
      }
      if (url) for (const link of extractMarkdownLinks(text, 2000)) {
        try {
          // Relative export/artifact links address the workspace, not the remote website.
          if (!/^https?:\/\//i.test(link.href)) continue
          const candidate = new URL(link.href, url)
          if (candidate.origin === new URL(url).origin && !isArtifactLink(candidate.href)) add({ source: candidate.href, status: 'not imported' })
        } catch { /* Non-web links are not crawl discoveries. */ }
      }
      // Consolidate legacy generated sitemap inventories into the same catalog; page bodies stay intact.
      if (/^# Website Sitemap:/m.test(text) && url) {
        for (const line of text.split('\n')) {
          const candidate = line.match(/^\|.*?\|\s*(https?:\/\/[^\s|]+)\s*\|/)
          if (candidate) { try { add({ source: candidate[1], status: 'not imported' }) } catch { /* Not a source URL. */ } }
        }
      }
    }
    known.forEach(add)
    // Inventory reconciliation must not reseed documents deleted by the user.
    const ensureFolder = await createWorkspaceFolderTreeEnsurer({ ...fs, ensureSeed: async () => false }, list)
    let changed = false
    for (const [path, incoming] of groups) {
      const current = await fs.readFileText(path)
      // Never take ownership of an unrelated file merely because it shares the reserved name.
      let prior: ImportInventoryItem[]
      try { prior = current === null ? [] : readImportInventory(current) }
      catch (error) { throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`) }
      const rows = new Map(prior.filter(item => item.outputs?.length || !isArtifactLink(item.source)).map(item => [item.source, item]))
      for (const item of incoming) rows.set(item.source, mergeItem(rows.get(item.source), item))
      for (const [key, item] of rows) {
        if (!item.outputs?.length) continue
        const present = item.outputs.filter(output => files.has(output.path))
        const status = present.length !== item.outputs.length ? 'missing' : present.some(output => pendingText(files.get(output.path)?.text || '')) ? 'pending' : 'imported'
        rows.set(key, { ...item, status })
        for (const output of present) {
          if (output.receipt && !sources[output.path]?.importState) setWorkspaceEntrySource(output.path, {
            ...(key.startsWith('local:') ? { kind: 'local', originalName: key.split('/').pop() } : { kind: 'url', url: key }),
            importState: output.receipt,
          }, { persist: 'sync' })
        }
      }
      const next = replaceImportInventory(current, [...rows.values()])
      if (next !== current) {
        const parentPath = path.slice(0, path.lastIndexOf('/')) || '/'
        await ensureFolder(parentPath)
        if (current === null) await fs.createFile({ parentPath, name: IMPORT_INDEX_NAME, text: next, requireExactPath: true })
        else await fs.writeFileText(path, next, { expectedText: current })
        changed = true
      }
      if (path.startsWith('/websites/') && typeof window !== 'undefined' && typeof window.fetch === 'function' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location?.hostname || '')) {
        const copies = mirrored.get(fs) || new Map<string, string>()
        const digest = await importContentDigest(next)
        if (copies.get(path) !== digest) {
          const { saveWorkspaceWebsiteLocalCopy } = await import('./workspaceRevealInFileManager')
          if (await saveWorkspaceWebsiteLocalCopy(path, next)) {
            copies.set(path, digest); mirrored.set(fs, copies)
          }
        }
      }
    }
    return changed
  }
  const next = (queues.get(fs) || Promise.resolve()).catch(() => undefined).then(run)
  queues.set(fs, next)
  const clear = () => { if (queues.get(fs) === next) queues.delete(fs) }
  void next.then(clear, clear)
  return next
}

export async function readWebsiteInventory(fs: WorkspaceFs, root: string) {
  const url = new URL(importInventorySource(root))
  const text = await fs.readFileText(importInventoryPath(url.href))
  if (text === null) return []
  const prefix = url.pathname.replace(/\/+$/, '')
  return readImportInventory(text).filter(item => {
    if (item.source.startsWith('local:')) return false
    const candidate = new URL(item.source)
    return candidate.origin === url.origin && (candidate.pathname === prefix || candidate.pathname.startsWith(`${prefix}/`))
  }).map(item => ({ url: item.source, path: new URL(item.source).pathname }))
}
