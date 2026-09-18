import React from 'react'
import { ArrowLeftRight, ArrowUpDown, Filter, Layers, LayoutGrid, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import type { MarkdownWorkspaceDerivedViewerMode } from './MarkdownWorkspaceDerivedViewer'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { WorkspaceHeader } from '@/components/ui/WorkspaceHeader'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SEARCH_FORM_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_SEARCH_INPUT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { getDataViewIconButtonClassName } from '@/lib/ui/dataViewToolbarButton'
import {
  uiToolbarRowScrollClassName,
  uiToolbarRowScrollInlineClassName,
  uiToolbarRowScrollJustifyEndClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { getWorkspaceEditorModeLabel } from '@/features/workspace-table/workspaceEditorModePresentation'
import type { WorkspaceDataViewSettingsPanelKey } from './workspaceDataViewFloatingStore'
import { WorkspaceDataViewNewRecordButton } from './WorkspaceDataViewNewRecordButton'

type SortMode = 'none' | 'title_asc' | 'title_desc'
export type WorkspaceDataViewHeaderState = {
  searchQuery: string
  visibleGroups: readonly string[] | null
  sortMode: SortMode
}

export function WorkspaceDataViewHeader(props: {
  title: string
  viewerMode: MarkdownWorkspaceDerivedViewerMode
  canMutate: boolean
  columns: readonly MarkdownDataViewColumn[]
  groupByColumnId: string | null
  viewConfig: WorkspaceDataViewConfig | null
  setViewConfig: (next: WorkspaceDataViewConfig) => void
  openSettings: () => void
  openSettingsPanel?: (panel: WorkspaceDataViewSettingsPanelKey) => void
  tableSelector?: React.ReactNode
  state: WorkspaceDataViewHeaderState
  onChangeState: (next: WorkspaceDataViewHeaderState) => void
  onChangeViewerMode?: (mode: MarkdownWorkspaceDerivedViewerMode) => void
  onSelectGeospatialView?: () => void
  supportsMultiDimLayout?: boolean
  onNewRecord?: () => void
}) {
  const setState = props.onChangeState

  const [searchExpandedRaw, setSearchExpandedRaw] = React.useState(false)
  const searchExpanded = searchExpandedRaw || props.state.searchQuery.trim().length > 0
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const icon12Class = [UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_THEME_TOKENS.icon.color].join(' ')
  const icon14Class = ['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')
  const squareIconButtonClassName = getDataViewIconButtonClassName({
    className: ['shrink-0', UI_THEME_TOKENS.button.square].join(' '),
  })
  const viewModeLabel =
    props.viewConfig?.geospatialViewEnabled === true
      ? MARKDOWN_DATA_VIEW_COPY.geospatialViewLabel
      : props.viewerMode === 'read'
        ? 'Read'
        : props.viewerMode === 'geospatial'
          ? MARKDOWN_DATA_VIEW_COPY.geospatialViewLabel
          : getWorkspaceEditorModeLabel(props.viewerMode)
  const groupByLabel = React.useMemo(() => {
    const id = props.groupByColumnId
    if (!id) return 'Group'
    return props.columns.find(c => c.id === id)?.name || 'Group'
  }, [props.columns, props.groupByColumnId])
  const orientation = props.viewConfig?.orientation === 'columns' ? 'columns' : 'rows'
  const pivotLabel = orientation === 'columns' ? 'Pivot: columns as records' : 'Pivot: rows as records'

  const openSettingsPanel = (panel: WorkspaceDataViewSettingsPanelKey) => {
    if (props.openSettingsPanel) {
      props.openSettingsPanel(panel)
      return
    }
    props.openSettings()
  }

  return (
    <WorkspaceHeader ariaLabel="Data view header" border="border" className="relative z-20 kg-data-view-header kg-data-view-new-record-hover-scope">
      <section className={`kg-data-view-header-controls ${uiToolbarRowScrollClassName} gap-2 px-3 py-1.5`} aria-label="Data view controls">
        <button
          type="button"
          className={squareIconButtonClassName}
          aria-label={`Layout: ${viewModeLabel}`}
          onClick={() => openSettingsPanel('layout')}
        >
          <LayoutGrid className={icon14Class} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={squareIconButtonClassName}
          aria-label={`Group by: ${groupByLabel}`}
          onClick={() => openSettingsPanel('group')}
        >
          <Layers className={icon14Class} aria-hidden="true" />
        </button>
        {props.tableSelector ? (
          <aside className="kg-data-view-table-selector min-w-0 max-w-full" aria-label="Data view table selector">
            <section className={`${uiToolbarRowScrollInlineClassName} gap-2`} role="group" aria-label="Table selector">
              {props.tableSelector}
            </section>
          </aside>
        ) : null}

        <section className={`kg-data-view-actions ${uiToolbarRowScrollJustifyEndClassName} ml-auto gap-2`} aria-label="Data view actions">
          {!searchExpanded ? (
            <button
              type="button"
              className={squareIconButtonClassName}
              aria-label={MARKDOWN_DATA_VIEW_COPY.searchLabel}
              onClick={() => {
                setSearchExpandedRaw(true)
                requestAnimationFrame(() => searchInputRef.current?.focus())
              }}
            >
              <Search className={icon14Class} aria-hidden="true" />
            </button>
          ) : (
            <form
              className={[UI_RESPONSIVE_DATA_VIEW_SEARCH_FORM_CLASSNAME, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg].join(' ')}
              role="search"
              onSubmit={e => e.preventDefault()}
            >
              <Search className={icon12Class} aria-hidden="true" />
              <span className="sr-only">{MARKDOWN_DATA_VIEW_COPY.searchLabel}</span>
              <PanelTextInput
                ref={searchInputRef}
                variant="transparent"
                className={[UI_RESPONSIVE_DATA_VIEW_SEARCH_INPUT_CLASSNAME, 'bg-transparent outline-none text-xs', UI_THEME_TOKENS.input.text].join(' ')}
                placeholder={MARKDOWN_DATA_VIEW_COPY.searchPlaceholder}
                value={props.state.searchQuery}
                onChange={e => setState({ ...props.state, searchQuery: e.target.value })}
                onBlur={() => {
                  if (!props.state.searchQuery.trim()) setSearchExpandedRaw(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape' && !props.state.searchQuery.trim()) setSearchExpandedRaw(false)
                }}
              />
            </form>
          )}

          <button
            type="button"
            className={squareIconButtonClassName}
            aria-label={MARKDOWN_DATA_VIEW_COPY.filterLabel}
            onClick={() => openSettingsPanel('filter')}
          >
            <Filter className={icon14Class} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={squareIconButtonClassName}
            aria-label={MARKDOWN_DATA_VIEW_COPY.sortLabel}
            onClick={() => openSettingsPanel('sort')}
          >
            <ArrowUpDown className={icon14Class} aria-hidden="true" />
          </button>

          {props.viewConfig ? (
            <button
              type="button"
              className={squareIconButtonClassName}
              aria-label={pivotLabel}
              title={pivotLabel}
              onMouseDown={event => {
                event.stopPropagation()
              }}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                if (!props.viewConfig) return
                props.setViewConfig({
                  ...props.viewConfig,
                  orientation: orientation === 'columns' ? 'rows' : 'columns',
                })
              }}
            >
              <ArrowLeftRight className={icon14Class} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            className={squareIconButtonClassName}
            aria-label="Add column"
            onClick={() => openSettingsPanel('properties')}
          >
            <Plus className={icon14Class} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={squareIconButtonClassName}
            aria-label="More"
            onClick={() => openSettingsPanel('properties')}
          >
            <MoreHorizontal className={icon14Class} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={squareIconButtonClassName}
            aria-label={MARKDOWN_DATA_VIEW_COPY.viewSettingsLabel}
            onClick={() => openSettingsPanel('properties')}
          >
            <SlidersHorizontal className={icon14Class} aria-hidden="true" />
          </button>

          {props.canMutate && props.onNewRecord ? (
            <WorkspaceDataViewNewRecordButton onClick={() => props.onNewRecord?.()} labelMode="icon" hoverRevealScope="container" />
          ) : null}
        </section>
      </section>

    </WorkspaceHeader>
  )
}
