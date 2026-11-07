import React from 'react'
import { Search } from 'lucide-react'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import {
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { ExplorerToolbarIconButton } from './ExplorerToolbarIconButton'
import { setWebsiteSelectionQuery, useWebsiteImportSelectionSession } from '@/features/source-files/websiteImportSelectionSession'

type ExplorerSearchControlProps = {
  search: string
  setSearch: (next: string) => void
  panelTextClass: string
}

const explorerSearchIconClassName = `${UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME} shrink-0`

export const ExplorerSearchControl = React.memo(function ExplorerSearchControl(props: ExplorerSearchControlProps) {
  const { search, setSearch, panelTextClass } = props
  const importSession = useWebsiteImportSelectionSession(state => state.session)
  const importSessionId = importSession?.id
  const activeSearch = importSession ? importSession.query : search
  const setActiveSearch = importSession ? setWebsiteSelectionQuery : setSearch
  const [searchExpanded, setSearchExpanded] = React.useState(() => search.trim().length > 0)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => { if (importSessionId) setSearchExpanded(true) }, [importSessionId])

  React.useEffect(() => {
    if (!searchExpanded) return
    const t = window.setTimeout(() => {
      searchInputRef.current?.focus()
      try {
        const len = searchInputRef.current?.value.length ?? 0
        searchInputRef.current?.setSelectionRange(len, len)
      } catch {
        void 0
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [searchExpanded])

  React.useEffect(() => {
    if (activeSearch.trim().length === 0 || searchExpanded) return
    setSearchExpanded(true)
  }, [activeSearch, searchExpanded])

  return (
    <label className={`kg-explorer-search-control ${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-1`} aria-label={importSession ? 'Filter discovered pages' : 'Search files'}>
      <PanelTextInput
        ref={searchInputRef}
        variant="transparent"
        value={activeSearch}
        onChange={e => setActiveSearch(e.target.value)}
        placeholder={importSession ? 'Filter discovered pages' : 'Search'}
        className={[
          `${UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME} rounded border`,
          UI_THEME_TOKENS.input.border,
          UI_THEME_TOKENS.input.bg,
          UI_THEME_TOKENS.input.text,
          panelTextClass,
          'px-2 transition-[width,opacity,padding] duration-150',
          searchExpanded ? 'kg-explorer-search-input opacity-100' : 'w-0 opacity-0 px-0 border-transparent',
        ].join(' ')}
        onKeyDown={e => {
          if (e.key !== 'Escape') return
          if (activeSearch.trim().length > 0) {
            setActiveSearch('')
            return
          }
          setSearchExpanded(false)
        }}
        onBlur={() => {
          if (activeSearch.trim().length > 0) return
          setSearchExpanded(false)
        }}
      />
      <ExplorerToolbarIconButton
        ariaLabel={searchExpanded ? 'Hide search' : 'Show search'}
        title="Search"
        onClick={() => {
          setSearchExpanded(prev => {
            if (prev && activeSearch.trim().length === 0) return false
            return true
          })
        }}
      >
        <Search className={explorerSearchIconClassName} />
      </ExplorerToolbarIconButton>
    </label>
  )
})
