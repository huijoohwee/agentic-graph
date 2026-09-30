import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { WorkspaceEntrySource, WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { parseWebpageFrontmatterMeta } from '@/lib/markdown/frontmatter'
import type { WebsiteSelectionSession } from './websiteImportSelectionSession'

export function sourceFileWebsiteUrl(entry: WorkspaceEntry, source?: WorkspaceEntrySource): string | null {
  if (entry.kind !== 'file') return null
  const raw = parseWebpageFrontmatterMeta(entry.text || '')?.url || (source?.kind === 'url' ? source.url : '')
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}

/** Ephemeral discovery projection: no workspace or cloud writes until confirmation. */
export function projectWebsiteImportTree(entries: WorkspaceEntry[], sources: WorkspaceSourceIndex | null, session: WebsiteSelectionSession | null) {
  const projected = new Map(entries.map(entry => [entry.path, entry]))
  const pendingPaths = new Set<string>(), expandedPaths = new Set<string>()
  const pageUrls = new Map<string, string>(), selectionUrls = new Map<string, string[]>()
  if (!session) return { entries, pendingPaths, expandedPaths, pageUrls, selectionUrls, ownerPath: null as string | null }
  const existingByUrl = new Map<string, WorkspaceEntry>()
  for (const entry of entries) { const url = sourceFileWebsiteUrl(entry, sources?.[entry.path]); if (url) existingByUrl.set(url, entry) }
  const source = entries.find(entry => entry.path === session.sourcePath) || existingByUrl.get(session.url)
  if (source) existingByUrl.set(session.url, source)
  const base = (source?.parentPath || `/websites/${encodeURIComponent(new URL(session.url).hostname)}`).replace(/\/$/, '')
  const ensureFolder = (path: string) => {
    let current = ''
    for (const part of path.split('/').filter(Boolean)) {
      const parent = current || '/'; current += `/${part}`
      if (!projected.has(current)) {
        projected.set(current, { kind: 'folder', path: current, parentPath: parent, name: decodeURIComponent(part), updatedAtMs: 0 })
        pendingPaths.add(current); expandedPaths.add(current)
      }
    }
  }
  const query = session.query.trim().toLowerCase()
  const pathsByUrl = new Map<string, string>()
  const pages = session.pages.some(page => page.url === session.url) ? session.pages : [{ url: session.url, path: new URL(session.url).pathname }, ...session.pages]
  for (const page of pages) {
    const existing = existingByUrl.get(page.url)
    let path = existing?.path
    if (!path) {
      const url = new URL(page.url), segments = url.pathname.split('/').filter(Boolean)
      const leaf = `${segments.pop() || 'index'}${url.search}`
      const parent = `${base}${segments.length ? '/' + segments.map(encodeURIComponent).join('/') : ''}`
      ensureFolder(parent)
      const stem = `${parent}/${encodeURIComponent(leaf)}.md`
      path = stem; let suffix = 1
      while (projected.has(path)) path = `${stem}~${suffix++}`
      projected.set(path, { kind: 'file', path, parentPath: parent || '/', name: page.title || leaf, updatedAtMs: 0 })
      pendingPaths.add(path)
    }
    pathsByUrl.set(page.url, path); pageUrls.set(path, page.url)
    if (!session.pages.some(item => item.url === page.url) || !`${page.title || ''} ${page.url}`.toLowerCase().includes(query)) continue
    for (let current: string | null = path; current && current !== '/'; current = projected.get(current)?.parentPath || null) {
      selectionUrls.set(current, [...(selectionUrls.get(current) || []), page.url])
    }
  }
  const filtered = [...projected.values()].filter(entry => !pendingPaths.has(entry.path) || entry.kind === 'folder'
    || entry.path === pathsByUrl.get(session.url) || `${entry.name} ${pageUrls.get(entry.path) || ''}`.toLowerCase().includes(query))
  return { entries: filtered, pendingPaths, expandedPaths, pageUrls, selectionUrls, ownerPath: source?.path || pathsByUrl.get(session.url) || null }
}
