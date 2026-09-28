import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { buildWebsiteSelectionTree, websiteFolderUrls, type WebsiteSelectionFolder } from '@/lib/websites/websiteImportSelection'

import { useWebsiteImportSelectionSession, discoverWebsiteSelection, toggleWebsiteSelection, setWebsiteSelectionQuery, finishWebsiteImportSelection } from '@/features/panels/websiteImportSelectionSession'

const actionClass = cn('rounded border px-3 py-2 text-sm disabled:opacity-50', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)

function SelectionCheckbox(props: { label: string; urls: string[]; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const count = props.urls.filter(url => props.selected.has(url)).length
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < props.urls.length }, [count, props.urls.length])
  return <input ref={ref} type="checkbox" aria-label={props.label} checked={props.urls.length > 0 && count === props.urls.length} onChange={event => props.toggle(props.urls, event.target.checked)} />
}

function PageTree(props: { folder: WebsiteSelectionFolder; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void; discover: (url: string) => void; busy: boolean; visited: Set<string> }) {
  return <ul className="m-0 list-none pl-4">
    {props.folder.folders.map(folder => <li key={folder.path} className="py-1">
      <details open>
        <summary className="cursor-pointer py-1">
          <SelectionCheckbox label={`Select folder ${folder.path}`} urls={websiteFolderUrls(folder)} selected={props.selected} toggle={props.toggle} />
          <span className="ml-2">{folder.name}/</span>
        </summary>
        <PageTree {...props} folder={folder} />
      </details>
    </li>)}
    {props.folder.pages.map(page => <li key={page.url} className="flex min-w-0 items-start gap-2 py-2">
      <SelectionCheckbox label={`Select page ${page.url}`} urls={[page.url]} selected={props.selected} toggle={props.toggle} />
      <span className="min-w-0 flex-1 break-words text-sm" title={page.url}>
        {page.title || `${new URL(page.url).pathname.split('/').filter(Boolean).pop() || '/'}${new URL(page.url).search}`}
        {page.title ? <span className={cn('block text-xs', UI_THEME_TOKENS.text.secondary)}>{page.path}{new URL(page.url).search}</span> : null}
      </span>
      <button type="button" className={cn(actionClass, 'shrink-0 px-2 py-1 text-xs')} disabled={props.busy || props.visited.has(page.url)} aria-label={`Find pages linked from ${page.url}`} onClick={() => props.discover(page.url)}>{props.visited.has(page.url) ? 'Listed' : 'Find links'}</button>
    </li>)}
  </ul>
}

export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  return session ? <WebsiteSelectionContents session={session} /> : <section className="p-4 text-sm" aria-label="Import URL"><h2 className="mb-2 font-semibold">Choose pages to import</h2><p>Start from Launch → Import URL → Crawl website headlessly. Discovered pages and folders appear here for selection.</p></section>
}

function WebsiteSelectionContents({ session }: { session: NonNullable<ReturnType<typeof useWebsiteImportSelectionSession.getState>['session']> }) {
  const { url, pages, selected, visited, busy, error, limited, query } = session
  const toggle = toggleWebsiteSelection
  const discover = discoverWebsiteSelection
  const visible = React.useMemo(() => pages.filter(page => `${page.url} ${page.title || ''}`.toLowerCase().includes(query.toLowerCase())), [pages, query])
  const tree = React.useMemo(() => buildWebsiteSelectionTree(visible), [visible])
  return <section aria-label="Choose pages to import" className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      <header>
        <h2 id="website-selection-title" className="text-lg font-semibold">Choose pages to import</h2>
        <p className={cn('break-all text-sm', UI_THEME_TOKENS.text.secondary)}>{url}</p>
        <p className="mt-2 text-sm">Select pages or folders. Only selected pages will be imported, converted and parsed.</p>
      </header>
      <input autoFocus type="search" aria-label="Filter discovered pages" placeholder="Filter pages…" value={query} onChange={event => setWebsiteSelectionQuery(event.target.value)} className={cn('rounded border px-3 py-2', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg)} />
      <section className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><SelectionCheckbox label="Select all visible pages" urls={visible.map(page => page.url)} selected={selected} toggle={toggle} />Select visible</label>
        <button type="button" className={actionClass} disabled={!selected.size} onClick={() => toggle(pages.map(page => page.url), false)}>Clear selection</button>
        <span role="status">{selected.size} selected · {pages.length} discovered</span>
      </section>
      {busy ? <p role="status">Discovering page links…</p> : null}
      {error ? <section role="alert" className="text-sm"><p>{error}</p><button type="button" className={actionClass} onClick={() => void discover(url)}>Retry discovery</button></section> : null}
      {limited || pages.length >= 500 ? <p className="text-sm">Showing up to 500 discovered pages. This is a bounded list, not a complete site inventory.</p> : <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>Lists links from visited pages. Use Find links to discover more before importing.</p>}
      <section aria-label="Website page tree" className="min-h-20 flex-1 overflow-auto overscroll-contain">
        <PageTree folder={tree} selected={selected} toggle={toggle} discover={url => void discover(url)} busy={busy} visited={visited} />
      </section>
      <footer className="flex justify-end gap-2 border-t pt-3">
        <button type="button" className={actionClass} onClick={() => finishWebsiteImportSelection(null)}>Cancel</button>
        <button type="button" className={cn(actionClass, UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText)} disabled={busy || !selected.size} onClick={() => finishWebsiteImportSelection(pages.filter(page => selected.has(page.url)).map(page => page.url))}>Import selected ({selected.size})</button>
      </footer>
  </section>
}
