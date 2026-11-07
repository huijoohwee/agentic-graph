import type { WorkspaceEntry } from './types'
import type { PersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { parseWebpageFrontmatterMeta, parseWebsiteImportFrontmatterMeta } from '@/lib/markdown/frontmatter'
import { safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'
import { bulkSetWorkspaceEntrySources, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from './sourceIndex'

const collectionPattern = /^\/websites\/([^/]+)\/([^/]+)$/
const timestampPattern = /^\d{8}T\d{6}Z$/
const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'

/** Folder shape identifies a storage boundary; captured metadata proves its website. */
function capturedRoots(entries: readonly WorkspaceEntry[]): Map<string, string[]> {
  const folders = new Set(entries.filter(entry => entry.kind === 'folder').map(entry => entry.path))
  const roots = new Map<string, Set<string>>()
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.path.startsWith('/websites/')) continue
    const parts = entry.path.split('/')
    const root = parts.slice(0, 4).join('/')
    if (!folders.has(root) || !collectionPattern.test(root)) continue
    const meta = parseWebsiteImportFrontmatterMeta(entry.text || '')
    const webpage = meta && parseWebpageFrontmatterMeta(entry.text || '')
    if (!webpage) continue
    try {
      const url = new URL(webpage.url)
      if (!['http:', 'https:'].includes(url.protocol) || safeWebsitePathSegment(url.host) !== parts[2]) continue
      const paths = roots.get(parts[2]!) || new Set<string>()
      paths.add(root); roots.set(parts[2]!, paths)
    } catch { /* Local imports retain their existing owner. */ }
  }
  return new Map([...roots].map(([host, paths]) => [host, [...paths].sort()]))
}

export function resolveWebsiteCollectionRoot(_entries: readonly WorkspaceEntry[], host: string, _importId: string): string {
  return `/websites/${safeWebsitePathSegment(host)}`
}

export function resolvePreviousWorkspacePath(path: string, entries: Iterable<WorkspaceEntry>): string | null {
  for (const entry of entries) if (entry.previousPaths?.includes(path)) return entry.path
  return null
}

function retainPreviousPaths(entry: WorkspaceEntry, old: WorkspaceEntry): WorkspaceEntry {
  return { ...entry, previousPaths: [...new Set([...(entry.previousPaths || []), ...(old.previousPaths || []), old.path])] }
}

/** Pure, deterministic plan. Every file survives; only redundant folder records disappear. */
export function planWebsiteCollectionConsolidation(observed: readonly WorkspaceEntry[]) {
  const next = new Map(observed.map(entry => [entry.path, entry]))
  const moved = new Map<string, string>()
  for (const [host, roots] of capturedRoots(observed)) {
    const dated = roots.filter(root => timestampPattern.test(root.split('/').at(-1)!))
    const targetRoot = `/websites/${host}`
    if (!dated.length) continue
    for (const root of dated) {
      const capture = root.split('/').at(-1)!
      const descendants = observed.filter(entry => entry.path === root || entry.path.startsWith(`${root}/`))
        .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
      for (const old of descendants) {
        const mappedParent = moved.get(old.parentPath || '') || old.parentPath || '/'
        let path = old.path === root ? targetRoot : `${mappedParent}/${old.name}`
        let existing = next.get(path)
        if (existing && !(existing.kind === 'folder' && old.kind === 'folder')) {
          const dot = old.kind === 'file' ? old.name.lastIndexOf('.') : -1
          const stem = dot > 0 ? old.name.slice(0, dot) : old.name
          const extension = dot > 0 ? old.name.slice(dot) : ''
          let suffix = 0
          do { path = `${mappedParent}/${stem}--${capture}${suffix ? `-${suffix}` : ''}${extension}`; suffix++ } while (next.has(path))
          existing = undefined
        }
        const entry = existing || { ...old, path, parentPath: parent(path), name: path.split('/').at(-1)! }
        next.set(path, retainPreviousPaths(entry, old))
        next.delete(old.path)
        moved.set(old.path, path)
      }
    }
  }
  // Generated sitemaps own explicit local links. Do not rewrite captured page bodies/metadata.
  for (const old of observed) {
    const path = moved.get(old.path)
    if (!path || old.kind !== 'file' || old.name !== 'website.sitemap.md') continue
    const entry = next.get(path)!
    entry.text = (old.text || '').replace(/\]\(\.\/([^\s)]+)\)/g, (link, relative: string) => {
      const target = moved.get(`${old.parentPath}/${relative}`)
      if (!target || !target.startsWith(`${entry.parentPath}/`)) return link
      return `](./${target.slice(entry.parentPath!.length + 1)})`
    })
  }
  return { entries: [...next.values()], moved }
}

function repairSourceReferences(entries: readonly WorkspaceEntry[]): void {
  const index = loadWorkspaceSourceIndex()
  const sources = entries.flatMap(entry => {
    if (!entry.previousPaths?.length || index[entry.path]) return []
    const source = entry.previousPaths.map(path => index[path]).find(Boolean)
    return source ? [{ path: entry.path, source }] : []
  })
  bulkSetWorkspaceEntrySources(sources)
  for (const entry of entries) for (const old of entry.previousPaths || []) {
    if (index[old]) setWorkspaceEntrySource(old, null)
  }
}

export async function consolidateWebsiteCollections(db: PersistedCollectionDb<{ entries: WorkspaceEntry }>): Promise<void> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const observed = (await db.collections.entries.find().exec()).map(row => row.toJSON())
      const plan = planWebsiteCollectionConsolidation(observed)
      if (!plan.moved.size) { repairSourceReferences(observed); return }
      const before = new Map(observed.map(entry => [entry.path, entry]))
      const mutations = [
        ...[...plan.moved.keys()].map(id => ({ kind: 'remove' as const, collectionName: 'entries' as const, id })),
        ...plan.entries.filter(entry => entry !== before.get(entry.path))
          .map(record => ({ kind: 'upsert' as const, collectionName: 'entries' as const, record })),
      ]
      if (await db.compareAndWrite(mutations, [{ collectionName: 'entries', selector: {}, records: observed }])) {
        repairSourceReferences(plan.entries)
        return
      }
    }
    throw new Error('Workspace changed in another tab. Reload to retry; original files were retained.')
  } catch (cause) {
    const error = new Error(`Website collection migration failed: ${String(cause)}`)
    error.name = 'WebsiteCollectionMigrationError'
    throw error
  }
}
