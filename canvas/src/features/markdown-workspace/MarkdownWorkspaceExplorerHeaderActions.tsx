import React from 'react'
import { LocateFixed, RefreshCcw } from 'lucide-react'
import { ExplorerToolbarIconButton } from './ExplorerToolbarIconButton'
import { ExplorerSearchControl } from './ExplorerSearchControl'
import { uiToolbarRowScrollJustifyEndClassName, uiToolbarRowScrollListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type MarkdownWorkspaceExplorerHeaderActionsProps = {
  panelTextClass: string
  onRefresh: () => void
  search: string
  setSearch: (next: string) => void
  activePath?: string | null
  onRevealActiveFile?: () => void
}

const explorerHeaderActionIconClassName = `${UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME} shrink-0`

export function MarkdownWorkspaceExplorerHeaderActions(props: MarkdownWorkspaceExplorerHeaderActionsProps) {
  const { panelTextClass, onRefresh, search, setSearch } = props

  return (
    <nav className={`kg-toolbar ${uiToolbarRowScrollJustifyEndClassName} gap-1`} aria-label="Explorer actions">
      <ul className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Explorer actions list">
        {props.activePath && props.onRevealActiveFile && <li className="list-none">
          <ExplorerToolbarIconButton ariaLabel="Reveal active file in Source Files" title={props.activePath} onClick={props.onRevealActiveFile}>
            <LocateFixed className={explorerHeaderActionIconClassName} />
          </ExplorerToolbarIconButton>
        </li>}
        <li className="list-none">
          <ExplorerToolbarIconButton ariaLabel="Refresh" title="Refresh" onClick={onRefresh}>
            <RefreshCcw className={explorerHeaderActionIconClassName} />
          </ExplorerToolbarIconButton>
        </li>
        <li className="list-none">
          <ExplorerSearchControl search={search} setSearch={setSearch} panelTextClass={panelTextClass} />
        </li>
      </ul>
    </nav>
  )
}
