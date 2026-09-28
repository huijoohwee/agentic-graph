import { create } from 'zustand'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { discoverWebsitePages, type WebsiteDiscoveredPage } from '@/lib/websites/websiteImportSelection'

type WebsiteSelectionSession = {
  id: number
  url: string
  pages: WebsiteDiscoveredPage[]
  selected: Set<string>
  visited: Set<string>
  busy: boolean
  error: string
  limited: boolean
  query: string
}

export const useWebsiteImportSelectionSession = create<{ session: WebsiteSelectionSession | null }>(() => ({ session: null }))
let sequence = 0
let controller: AbortController | null = null
let resolveSelection: ((urls: string[] | null) => void) | null = null

function updateSession(id: number, update: (session: WebsiteSelectionSession) => WebsiteSelectionSession) {
  useWebsiteImportSelectionSession.setState(state => state.session?.id === id ? { session: update(state.session) } : state)
}

export function finishWebsiteImportSelection(urls: string[] | null) {
  controller?.abort()
  controller = null
  const resolve = resolveSelection
  resolveSelection = null
  useWebsiteImportSelectionSession.setState({ session: null })
  resolve?.(urls)
}

export async function discoverWebsiteSelection(url: string) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (!session) return
  controller?.abort()
  const active = new AbortController()
  controller = active
  updateSession(session.id, current => ({ ...current, busy: true, error: '' }))
  try {
    const result = await discoverWebsitePages(session.url, url, active.signal)
    if (active.signal.aborted) return
    updateSession(session.id, current => {
      const merged = new Map(current.pages.map(page => [page.url, page]))
      result.pages.forEach(page => merged.set(page.url, page))
      return { ...current, pages: [...merged.values()].slice(0, 500), visited: new Set([...current.visited, url]), limited: current.limited || result.limited || merged.size > 500 }
    })
  } catch (failure) {
    if (!active.signal.aborted) updateSession(session.id, current => ({ ...current, error: String((failure as Error).message || failure) }))
  } finally {
    if (!active.signal.aborted) updateSession(session.id, current => ({ ...current, busy: false }))
  }
}

export function toggleWebsiteSelection(urls: string[], checked: boolean) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (!session) return
  updateSession(session.id, current => {
    const selected = new Set(current.selected)
    urls.forEach(url => checked ? selected.add(url) : selected.delete(url))
    return { ...current, selected }
  })
}

export function setWebsiteSelectionQuery(query: string) {
  const session = useWebsiteImportSelectionSession.getState().session
  if (session) updateSession(session.id, current => ({ ...current, query }))
}

export function chooseWebsiteImportPages(url: string): Promise<string[] | null> {
  finishWebsiteImportSelection(null)
  const result = new Promise<string[] | null>(resolve => { resolveSelection = resolve })
  useWebsiteImportSelectionSession.setState({ session: { id: ++sequence, url, pages: [], selected: new Set(), visited: new Set(), busy: true, error: '', limited: false, query: '' } })
  emitMainPanelOpen({ tab: 'websiteImport' })
  void discoverWebsiteSelection(url)
  return result
}
