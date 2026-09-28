import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DirectoryTreeBranch, DirectoryTreeRow, DirectoryTreeDisclosure, DirectoryTreeFileButton, DirectoryTreeChildren } from '@/lib/ui/DirectoryTreeControls'
import { cn } from '@/lib/utils'
import { buildWebsiteSelectionTree, websiteFolderUrls, type WebsiteSelectionFolder } from '@/lib/websites/websiteImportSelection'

import { useWebsiteImportSelectionSession, discoverWebsiteSelection, toggleWebsiteSelection, setWebsiteSelectionQuery, finishWebsiteImportSelection } from '@/features/panels/websiteImportSelectionSession'

const actionClass = cn('rounded border px-3 py-2 text-sm disabled:opacity-50', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)

function SelectionCheckbox(props: { id?: string; label: string; urls: string[]; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const count = props.urls.filter(url => props.selected.has(url)).length
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < props.urls.length }, [count, props.urls.length])
  return <input ref={ref} id={props.id} className="size-4 shrink-0" type="checkbox" aria-label={props.label} checked={props.urls.length > 0 && count === props.urls.length} onChange={event => props.toggle(props.urls, event.target.checked)} />
}

type PageTreeProps = { folder: WebsiteSelectionFolder; depth: number; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void; discover: (url: string) => void; busy: boolean; visited: Set<string> }

function PageFolder(props: PageTreeProps) {
  const checkboxId = React.useId()
  const [expanded, setExpanded] = React.useState(true)
  const { folder, depth, selected, toggle } = props
  const urls = websiteFolderUrls(folder)
  const selectFolder = () => toggle(urls, !urls.every(url => selected.has(url)))
  return <DirectoryTreeBranch>
    <DirectoryTreeRow depth={depth} label={`Folder ${folder.path}`}>
      <SelectionCheckbox id={checkboxId} label={`Select folder ${folder.path}`} urls={urls} selected={selected} toggle={toggle} />
      <DirectoryTreeDisclosure name={folder.path} path={folder.path} expanded={expanded} onToggle={() => setExpanded(value => !value)} />
      <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center py-2 text-sm">
        <span className="truncate" title={folder.path}>{folder.name}/</span>
      </label>
    </DirectoryTreeRow>
    {expanded && <DirectoryTreeChildren name={folder.path} path={folder.path} depth={depth} guideCenter="0.5rem" onSelect={selectFolder}>
      <PageTree {...props} depth={depth + 1} />
    </DirectoryTreeChildren>}
  </DirectoryTreeBranch>
}

function PageTree(props: PageTreeProps) {
  const checkboxPrefix = React.useId()
  return <ul className="m-0 list-none p-0">
    {props.folder.folders.map(folder => <PageFolder key={folder.path} {...props} folder={folder} />)}
    {props.folder.pages.map((page, index) => {
      const url = new URL(page.url), name = url.pathname.split('/').filter(Boolean).pop() || '/'
      const checkboxId = `${checkboxPrefix}-${index}`
      return <DirectoryTreeBranch key={page.url}>
        <DirectoryTreeRow depth={props.depth} label={`Page ${page.url}`}>
          <SelectionCheckbox id={checkboxId} label={`Select page ${page.url}`} urls={[page.url]} selected={props.selected} toggle={props.toggle} />
          <DirectoryTreeFileButton name={name} path={page.url} label={`Select page icon ${page.url}`} selected={props.selected.has(page.url)} onSelect={() => props.toggle([page.url], !props.selected.has(page.url))} />
          <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center py-2 text-sm">
            <span className="min-w-0 flex-1 break-words" title={page.url}>
              {page.title || `${name}${url.search}`}
              {page.title ? <span className={cn('block text-xs', UI_THEME_TOKENS.text.secondary)}>{page.path}{url.search}</span> : null}
            </span>
          </label>
          <button type="button" className={cn(actionClass, 'ml-2 shrink-0 px-2 py-1 text-xs')} disabled={props.busy || props.visited.has(page.url)} aria-label={`Find pages linked from ${page.url}`} onClick={() => props.discover(page.url)}>{props.visited.has(page.url) ? 'Listed' : 'Find links'}</button>
        </DirectoryTreeRow>
      </DirectoryTreeBranch>
    })}
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
        <PageTree folder={tree} depth={0} selected={selected} toggle={toggle} discover={url => void discover(url)} busy={busy} visited={visited} />
      </section>
      <footer className="flex justify-end gap-2 border-t pt-3">
        <button type="button" className={actionClass} onClick={() => finishWebsiteImportSelection(null)}>Cancel</button>
        <button type="button" className={cn(actionClass, UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText)} disabled={busy || !selected.size} onClick={() => finishWebsiteImportSelection(pages.filter(page => selected.has(page.url)).map(page => page.url))}>Import selected ({selected.size})</button>
      </footer>
  </section>
}
