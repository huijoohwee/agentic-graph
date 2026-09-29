import React from 'react'
import { MainPanelIconButton } from '../ui/MainPanelIconButton'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DirectoryTreeBranch, DirectoryTreeRow, DirectoryTreeDisclosure, DirectoryTreeFileButton, DirectoryTreeChildren } from '@/lib/ui/DirectoryTreeControls'
import { cn } from '@/lib/utils'
import { usePanelTypography, type PanelTypography } from '@/lib/ui/panelTypography'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { MainPanelSettingsPanelShell } from '@/features/panels/ui/MainPanelSettingsPanelShell'
import { useCanvasKeyTypeValueRuntime } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { buildWebsiteSelectionTree, websiteFolderUrls, type WebsiteSelectionFolder } from '@/lib/websites/websiteImportSelection'

import { useWebsiteImportSelectionSession, discoverWebsiteSelection, toggleWebsiteSelection, setWebsiteSelectionQuery, finishWebsiteImportSelection } from '@/features/panels/websiteImportSelectionSession'

const actionClass = getUiSectionActionClassName('primary', 'disabled:opacity-50')

function SelectionCheckbox(props: { id?: string; label: string; urls: string[]; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void }) {
  const ref = React.useRef<HTMLInputElement>(null)
  const count = props.urls.filter(url => props.selected.has(url)).length
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < props.urls.length }, [count, props.urls.length])
  return <input ref={ref} id={props.id} className="size-4 shrink-0" type="checkbox" aria-label={props.label} checked={props.urls.length > 0 && count === props.urls.length} onChange={event => props.toggle(props.urls, event.target.checked)} />
}

type PageTreeProps = { folder: WebsiteSelectionFolder; depth: number; selected: Set<string>; toggle: (urls: string[], checked: boolean) => void; discover: (url: string) => void; busy: boolean; visited: Set<string>; typography: PanelTypography; rowDensity: string }

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
      <label htmlFor={checkboxId} className={cn('flex min-w-0 flex-1 cursor-pointer items-center', props.rowDensity)}>
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
          <label htmlFor={checkboxId} className={cn('flex min-w-0 flex-1 cursor-pointer items-center', props.rowDensity)}>
            <span className="min-w-0 flex-1 break-words" title={page.url}>
              {page.title || `${name}${url.search}`}
              {page.title ? <span className={cn('block', props.typography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>{page.path}{url.search}</span> : null}
            </span>
          </label>
          <MainPanelIconButton iconKey="action.discover" label={props.visited.has(page.url) ? 'Listed' : 'Find links'} className={cn(actionClass, props.typography.panelTextClass, 'ml-2 shrink-0')} disabled={props.busy || props.visited.has(page.url)} ariaLabel={`Find pages linked from ${page.url}`} onClick={() => props.discover(page.url)} />
        </DirectoryTreeRow>
      </DirectoryTreeBranch>
    })}
  </ul>
}

export default function WebsiteImportSelectionView() {
  const session = useWebsiteImportSelectionSession(state => state.session)
  const typography = usePanelTypography()
  const { uiPanelRowDensityDefaultClass: rowDensity } = useCanvasKeyTypeValueRuntime()
  return <MainPanelSettingsPanelShell
    ariaLabel={session ? 'Choose pages to import' : 'Import URL'}
    titleNode={<h2 id="website-selection-title" className="font-semibold">Choose pages to import</h2>}
    uiPanelKeyValueTextSizeClass={typography.textSizeClass}
    className={cn('h-full', typography.panelTextClass)}
    bodyClassName="flex flex-col gap-2 px-2"
  >
    {session ? <WebsiteSelectionContents session={session} typography={typography} rowDensity={rowDensity} /> : <p>Start from Launch → Import URL → Crawl website headlessly. Discovered pages and folders appear here for selection.</p>}
  </MainPanelSettingsPanelShell>
}

function WebsiteSelectionContents({ session, typography, rowDensity }: { session: NonNullable<ReturnType<typeof useWebsiteImportSelectionSession.getState>['session']>; typography: PanelTypography; rowDensity: string }) {
  const { url, pages, selected, visited, busy, error, limited, query } = session
  const toggle = toggleWebsiteSelection
  const discover = discoverWebsiteSelection
  const visible = React.useMemo(() => pages.filter(page => `${page.url} ${page.title || ''}`.toLowerCase().includes(query.toLowerCase())), [pages, query])
  const tree = React.useMemo(() => buildWebsiteSelectionTree(visible), [visible])
  const buttonClass = cn(actionClass, typography.panelTextClass)
  return <>
      <header>
        <p className={cn('break-all', UI_THEME_TOKENS.text.secondary)}>{url}</p>
        <p className="mt-1">Select pages or folders. Only selected pages will be imported, converted and parsed.</p>
      </header>
      <PanelTextInput autoFocus type="search" aria-label="Filter discovered pages" placeholder="Filter pages…" value={query} onChange={event => setWebsiteSelectionQuery(event.target.value)} className={cn(typography.keyValueInputClass, typography.panelTextClass, 'shrink-0 text-left')} />
      <section className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2"><SelectionCheckbox label="Select all visible pages" urls={visible.map(page => page.url)} selected={selected} toggle={toggle} />Select visible</label>
        <MainPanelIconButton iconKey="action.clear" label="Clear selection" className={buttonClass} disabled={!selected.size} onClick={() => toggle(pages.map(page => page.url), false)} />
        <span role="status">{selected.size} selected · {pages.length} discovered</span>
      </section>
      {busy ? <p role="status">Discovering page links…</p> : null}
      {error ? <section role="alert"><p>{error}</p><MainPanelIconButton iconKey="action.discover" label="Retry discovery" className={buttonClass} onClick={() => void discover(url)} /></section> : null}
      {limited || pages.length >= 500 ? <p>Showing up to 500 discovered pages. This is a bounded list, not a complete site inventory.</p> : <p className={cn(typography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>Lists links from visited pages. Use Find links to discover more before importing.</p>}
      <section aria-label="Website page tree" className="min-h-20 flex-1 overflow-auto overscroll-contain">
        <PageTree folder={tree} depth={0} selected={selected} toggle={toggle} discover={url => void discover(url)} busy={busy} visited={visited} typography={typography} rowDensity={rowDensity} />
      </section>
      <footer className={cn('flex shrink-0 flex-wrap justify-end gap-2 border-t pt-2', UI_THEME_TOKENS.panel.border)}>
        <MainPanelIconButton iconKey="action.cancel" label="Cancel" className={buttonClass} onClick={() => finishWebsiteImportSelection(null)} />
        <MainPanelIconButton iconKey="action.import" label={`Import selected (${selected.size})`} className={cn(buttonClass, UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText)} disabled={busy || !selected.size} onClick={() => finishWebsiteImportSelection(pages.filter(page => selected.has(page.url)).map(page => page.url))} />
      </footer>
  </>
}
