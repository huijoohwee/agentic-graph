import { create } from 'zustand'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceEditorPane'
import { useGraphStore } from '@/hooks/useGraphStore'
import { discoverWebsitePages, type WebsiteDiscoveredPage } from '@/lib/websites/websiteImportSelection'

export type WebsiteSelectionSession = {
  id: number
  url: string
  sourcePath?: string
  pages: WebsiteDiscoveredPage[]
  selected: Set<string>
  visited: Set<string>
  busy: boolean
  error: string
  limited: boolean
  query: string
  visibleCount?: number
  restorable?: boolean
  restored?: boolean
  importing?: boolean
  selectAllOnDiscover?: boolean
}

type SelectionState = { session: WebsiteSelectionSession | null; recoveryError: string }
type SavedSelection = { version: 1; url: string; sourcePath?: string; pages: WebsiteDiscoveredPage[]; selected: string[]; visited: string[]; limited: boolean; query: string }
const draftKey = 'kg:website-import-selection:v1'
const maxDraftBytes = 256 * 1024
export const useWebsiteImportSelectionSession = create<SelectionState>(() => ({ session: null, recoveryError: '' }))
let sequence = 0
let controller: AbortController | null = null
let resolveSelection: ((urls: string[] | null) => void) | null = null

function draftStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function writeDraft(session: WebsiteSelectionSession | null): string {
  if (!session?.restorable) return ''
  const storage = draftStorage()
  if (!storage) return 'Browser storage is unavailable; this selection cannot be resumed after restart.'
  const saved: SavedSelection = { version: 1, url: session.url, sourcePath: session.sourcePath, pages: session.pages,
    selected: [...session.selected], visited: [...session.visited], limited: session.limited, query: session.query }
  const json = JSON.stringify(saved)
  if (new TextEncoder().encode(json).byteLength > maxDraftBytes) {
    clearDraft()
    return 'This selection is too large to resume after restart; import or narrow it before leaving.'
  }
  try { storage.setItem(draftKey, json); return '' }
  catch { clearDraft(); return 'Browser storage could not save this selection for restart.' }
}

function clearDraft() {
  try { draftStorage()?.removeItem(draftKey) } catch { /* A blocked browser store cannot contain a new draft. */ }
}

/** Restore only explicit Source Files drafts; no network request or import occurs on startup. */
export function restoreWebsiteImportSelectionDraft() {
  if (useWebsiteImportSelectionSession.getState().session) return
  const storage = draftStorage()
  if (!storage) return
  try {
    const raw = storage.getItem(draftKey)
    if (!raw) return
    if (new TextEncoder().encode(raw).byteLength > maxDraftBytes) throw new Error('Saved selection exceeds the local size limit.')
    const saved = JSON.parse(raw) as SavedSelection
    const root = new URL(saved.url)
    if (saved.version !== 1 || !['http:', 'https:'].includes(root.protocol) || !Array.isArray(saved.pages)
      || saved.pages.length > 2_000 || !Array.isArray(saved.selected) || !Array.isArray(saved.visited)
      || typeof saved.query !== 'string' || saved.query.length > 500
      || (saved.sourcePath !== undefined && (typeof saved.sourcePath !== 'string' || !saved.sourcePath.startsWith('/')))) throw new Error('Saved selection is invalid.')
    const pages = saved.pages.map(page => {
      if (typeof page?.url !== 'string' || typeof page.path !== 'string' || page.url.length > 4096 || page.path.length > 4096
        || (page.title !== undefined && (typeof page.title !== 'string' || page.title.length > 4096))) throw new Error('Saved page is invalid.')
      const url = new URL(page.url)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Saved page URL is invalid.')
      return { url: url.href, path: page.path, title: page.title }
    })
    const allowed = new Set(pages.map(page => page.url))
    const selected = saved.selected.map(url => new URL(url).href)
    if (selected.length > 500 || selected.some(url => !allowed.has(url)) || saved.visited.length > 2_000
      || saved.visited.some(url => typeof url !== 'string' || !['http:', 'https:'].includes(new URL(url).protocol))) throw new Error('Saved page selection is invalid.')
    controller?.abort(); controller = null
    resolveSelection?.(null); resolveSelection = null
    useWebsiteImportSelectionSession.setState({ session: { id: ++sequence, url: root.href, sourcePath: saved.sourcePath,
      pages, selected: new Set(selected), visited: new Set(saved.visited), busy: false, error: '', limited: saved.limited === true,
      query: saved.query, restorable: true, restored: true }, recoveryError: '' })
  } catch {
    clearDraft()
    useWebsiteImportSelectionSession.setState({ recoveryError: 'The saved page selection could not be restored. Find pages again to continue.' })
  }
}

function updateSession(id: number, update: (session: WebsiteSelectionSession) => WebsiteSelectionSession) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (session?.id !== id) return
  const next = update(session)
  useWebsiteImportSelectionSession.setState({ session: next, recoveryError: writeDraft(next) })
}

export function finishWebsiteImportSelection(urls: string[] | null) {
  controller?.abort()
  controller = null
  const resolve = resolveSelection
  resolveSelection = null
  const current = useWebsiteImportSelectionSession.getState().session
  const retained = urls?.length && current?.restorable ? { ...current, selected: new Set(urls), importing: true, restored: true } : null
  if (!retained) clearDraft()
  useWebsiteImportSelectionSession.setState({ session: retained, recoveryError: writeDraft(retained) })
  resolve?.(urls)
}

export async function discoverWebsiteSelection(url: string, selectAllOnDiscover = false) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (!session) return
  controller?.abort()
  const active = new AbortController()
  controller = active
  updateSession(session.id, current => ({ ...current, busy: true, error: '', selectAllOnDiscover: current.selectAllOnDiscover || selectAllOnDiscover }))
  try {
    const result = await discoverWebsitePages(session.url, url, active.signal)
    if (active.signal.aborted) return
    updateSession(session.id, current => {
      const merged = new Map(current.pages.map(page => [page.url, page]))
      result.pages.forEach(page => merged.set(page.url, page))
      const pages = [...merged.values()].slice(0, 2_000)
      return { ...current, pages,
        selected: current.selectAllOnDiscover ? new Set([...current.selected, ...pages.map(page => page.url)].slice(0, 500)) : current.selected,
        selectAllOnDiscover: false,
        error: current.selectAllOnDiscover && !result.pages.length ? 'No linked pages were found. Try the source link or a different website file.' : '',
        visited: new Set([...current.visited, url]), limited: current.limited || result.limited || merged.size > 2_000 }
    })
  } catch (failure) {
    if (!active.signal.aborted) updateSession(session.id, current => ({ ...current, selectAllOnDiscover: false, error: String((failure as Error).message || failure) }))
  } finally {
    if (!active.signal.aborted) updateSession(session.id, current => ({ ...current, busy: false }))
  }
}

export function toggleWebsiteSelection(urls: string[], checked: boolean) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (!session || session.importing) return
  updateSession(session.id, current => {
    const selected = new Set(current.selected)
    const allowed = new Set(current.pages.map(page => page.url))
    urls.forEach(url => { if (!checked) selected.delete(url); else if (allowed.has(url) && selected.size < 500) selected.add(url) })
    return { ...current, selected }
  })
}

export function visibleWebsiteSelectionPages(session: WebsiteSelectionSession) {
  const query = session.query.trim().toLowerCase()
  return session.pages.filter(page => `${page.url} ${page.title || ''}`.toLowerCase().includes(query)).slice(0, session.visibleCount || 100)
}

export function showMoreWebsiteSelectionPages() {
  const session = useWebsiteImportSelectionSession.getState().session
  if (session) updateSession(session.id, current => ({ ...current, visibleCount: (current.visibleCount || 100) + 100 }))
}

export function setWebsiteSelectionQuery(query: string) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (session) updateSession(session.id, current => ({ ...current, query, visibleCount: 100 }))
}

export function chooseWebsiteImportPages(url: string, sourcePath?: string, restorable = false, selectAllOnDiscover = false): Promise<string[] | null> {
  const source = new URL(url)
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Enter an HTTP or HTTPS website URL.')
  url = source.href
  finishWebsiteImportSelection(null)
  const result = new Promise<string[] | null>(resolve => { resolveSelection = resolve })
  const session: WebsiteSelectionSession = { id: ++sequence, url, sourcePath, pages: [], selected: new Set(), visited: new Set(), busy: true, error: '', limited: false, query: '', restorable, selectAllOnDiscover }
  useWebsiteImportSelectionSession.setState({ session, recoveryError: writeDraft(session) })
  openMarkdownWorkspaceEditorPane(useGraphStore.getState())
  requestMarkdownExplorerSourceFilesOpen(sourcePath)
  void discoverWebsiteSelection(url)
  return result
}

export async function importWebsiteFromSourceFiles(url: string, sourcePath?: string, beforeImport?: () => Promise<unknown>, options?: { selectAllOnDiscover?: boolean }) {
  const selection = chooseWebsiteImportPages(url, sourcePath, !beforeImport, options?.selectAllOnDiscover)
  const session = useWebsiteImportSelectionSession.getState().session
  const selectedUrls = await selection
  if (!selectedUrls?.length) return
  try {
    const result = await importSelectedWebsitePages(url, selectedUrls, beforeImport)
    if (session) updateSession(session.id, current => ({ ...current, importing: false, selected: new Set(), error: '' }))
    return result
  } catch (failure) {
    if (session) updateSession(session.id, current => ({ ...current, importing: false, error: String((failure as Error).message || failure) }))
    throw failure
  }
}

export async function importSelectedWebsitePages(url: string, selectedUrls: string[], beforeImport?: () => Promise<unknown>) {
  await beforeImport?.()
  const { getMarkdownWorkspaceActionBridge } = await import('@/features/markdown-explorer/workspaceActionBridge')
  const importWebsite = getMarkdownWorkspaceActionBridge().importWebsite
    ?? (await import('@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction')).importWebsiteViaWorkspaceRuntime
  const { buildAutoWebsiteImportOptions } = await import('@/lib/toolbar/importUrlWebsiteMode')
  const result = await importWebsite(url, { ...buildAutoWebsiteImportOptions(), selectedUrls })
  if (result && result.error) throw new Error(result.error)
  return result
}

export async function confirmRestoredWebsiteSelection(id: number, urls: string[]) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (session?.id !== id || !session.restored || session.importing || !urls.length) return
  updateSession(id, current => ({ ...current, importing: true, error: '' }))
  try {
    await importSelectedWebsitePages(session.url, urls)
    updateSession(id, current => ({ ...current, importing: false, selected: new Set(), error: '' }))
  } catch (failure) {
    updateSession(id, current => ({ ...current, importing: false, error: String((failure as Error).message || failure) }))
    throw failure
  }
}
