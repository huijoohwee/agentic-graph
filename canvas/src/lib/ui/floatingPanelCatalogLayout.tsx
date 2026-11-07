import React from 'react'
import { Search, X } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

type DataAttributes = Record<`data-${string}`, string | undefined>

export const FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT = 'compact-list'
export const FLOATING_PANEL_CATALOG_COMPACT_ICON_FRAME_CLASSNAME = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border'
export const FLOATING_PANEL_CATALOG_COMPACT_ROW_TITLE_CLASSNAME = 'm-0 truncate text-xs font-semibold'
export const FLOATING_PANEL_CATALOG_COMPACT_ROW_META_CLASSNAME = 'm-0 mt-0.5 truncate text-xs'
export const FLOATING_PANEL_CATALOG_COMPACT_ROW_TOKEN_CLASSNAME = 'shrink-0 truncate font-mono text-xs'
export const FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT = 'media-3-rows'
export const FLOATING_PANEL_CATALOG_THREE_ROW_GRID_CLASSNAME = 'grid-cols-[6.875rem_minmax(0,1fr)]'
export const FLOATING_PANEL_CATALOG_THREE_ROW_THUMBNAIL_FRAME_CLASSNAME = 'group relative inline-flex h-[4.625rem] w-[6.475rem] shrink-0 overflow-visible rounded border p-[2px] shadow-none'

export function floatingPanelCatalogSurfaceClassName(extraClassName?: string): string {
  return cn('flex h-full min-h-0 flex-col overflow-hidden px-1 pb-2', extraClassName)
}

export function floatingPanelCatalogBodyClassName(extraClassName?: string): string {
  return cn('min-h-0 flex-1 overflow-auto', extraClassName)
}

export function floatingPanelCatalogCompactIconFrameClassName(extraClassName?: string): string {
  return cn(
    FLOATING_PANEL_CATALOG_COMPACT_ICON_FRAME_CLASSNAME,
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.input.bg,
    extraClassName,
  )
}

export function floatingPanelCatalogCompactRowClassName(): string {
  return cn(
    'grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-2 text-left shadow-none transition-colors',
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.panel.bg,
    UI_THEME_TOKENS.button.hoverBg,
  )
}

export function floatingPanelCatalogCompactRowTitleClassName(extraClassName?: string): string {
  return cn(FLOATING_PANEL_CATALOG_COMPACT_ROW_TITLE_CLASSNAME, UI_THEME_TOKENS.text.primary, extraClassName)
}

export function floatingPanelCatalogCompactRowMetaClassName(extraClassName?: string): string {
  return cn(FLOATING_PANEL_CATALOG_COMPACT_ROW_META_CLASSNAME, UI_THEME_TOKENS.text.tertiary, extraClassName)
}

export function floatingPanelCatalogCompactRowTokenClassName(extraClassName?: string): string {
  return cn(FLOATING_PANEL_CATALOG_COMPACT_ROW_TOKEN_CLASSNAME, UI_THEME_TOKENS.text.tertiary, extraClassName)
}

export function floatingPanelCatalogThreeRowClassName(extraClassName?: string): string {
  return cn(
    'grid min-w-0 gap-2 rounded border p-2 text-left shadow-none transition-colors',
    FLOATING_PANEL_CATALOG_THREE_ROW_GRID_CLASSNAME,
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.panel.bg,
    UI_THEME_TOKENS.button.hoverBg,
    extraClassName,
  )
}

export function floatingPanelCatalogThreeRowThumbnailFrameClassName(extraClassName?: string): string {
  return cn(
    FLOATING_PANEL_CATALOG_THREE_ROW_THUMBNAIL_FRAME_CLASSNAME,
    UI_THEME_TOKENS.panel.border,
    UI_THEME_TOKENS.input.bg,
    extraClassName,
  )
}

export function normalizeFloatingPanelCatalogSearchText(value: string): string {
  return value.trim().toLowerCase()
}

export function matchesFloatingPanelCatalogSearch(searchText: string, values: readonly unknown[]): boolean {
  if (!searchText) return true
  return values.some(value => String(value || '').toLowerCase().includes(searchText))
}

export type FloatingPanelCatalogSearchState = {
  clearSearchQuery: () => void
  handleSearchAffordanceBlur: (event: React.FocusEvent<HTMLElement>) => void
  handleSearchQueryInput: (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => void
  handleSearchToggle: () => void
  normalizedSearchQuery: string
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchOpen: boolean
  searchQuery: string
  setSearchFocusWithin: (focused: boolean) => void
}

export function useFloatingPanelCatalogSearch(): FloatingPanelCatalogSearchState {
  const [searchPinnedOpen, setSearchPinnedOpen] = React.useState(false)
  const [searchFocusWithin, setSearchFocusWithin] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  const searchHasQuery = searchQuery.trim().length > 0
  const searchOpen = searchPinnedOpen || searchFocusWithin || searchHasQuery

  const requestSearchInputFocus = React.useCallback(() => {
    if (typeof window === 'undefined') {
      searchInputRef.current?.focus()
      return
    }
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const clearSearchQuery = React.useCallback(() => {
    setSearchQuery('')
  }, [])

  const handleSearchToggle = React.useCallback(() => {
    if (!searchPinnedOpen) {
      setSearchPinnedOpen(true)
      requestSearchInputFocus()
      return
    }
    setSearchQuery('')
    setSearchPinnedOpen(false)
  }, [requestSearchInputFocus, searchPinnedOpen])

  const handleSearchQueryInput = React.useCallback((event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    setSearchQuery(event.currentTarget.value)
  }, [])

  const handleSearchAffordanceBlur = React.useCallback((event: React.FocusEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget && event.currentTarget.contains(relatedTarget as Node)) return
    setSearchFocusWithin(false)
  }, [])

  return {
    clearSearchQuery,
    handleSearchAffordanceBlur,
    handleSearchQueryInput,
    handleSearchToggle,
    normalizedSearchQuery: normalizeFloatingPanelCatalogSearchText(searchQuery),
    searchInputRef,
    searchOpen,
    searchQuery,
    setSearchFocusWithin,
  }
}

export function FloatingPanelCatalogHeader({
  actions,
  actionsLabel,
  dataAttributes,
  searchControl,
  subtitle,
  title,
  trailingActions,
}: {
  actions?: React.ReactNode
  actionsLabel: string
  dataAttributes?: DataAttributes
  searchControl?: React.ReactNode
  subtitle: string
  title: string
  trailingActions?: React.ReactNode
}) {
  return (
    <header
      className={cn('z-30 mb-1 flex shrink-0 items-center justify-between gap-2 px-1 py-1', UI_THEME_TOKENS.panel.bg)}
      aria-label={`${title} header`}
      data-kg-floating-panel-catalog-header="1"
      data-kg-floating-panel-catalog-header-fixed="1"
      {...dataAttributes}
    >
      <section className="min-w-0 flex-1">
        <h2 className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{title}</h2>
        <p className={cn('truncate text-xs', UI_THEME_TOKENS.text.tertiary)}>{subtitle}</p>
      </section>
      <section className="flex min-w-0 shrink-0 items-center justify-end gap-1" aria-label={actionsLabel}>
        {actions}
        {searchControl}
        {trailingActions}
      </section>
    </header>
  )
}

export function FloatingPanelCatalogSearchControl({
  affordanceDataAttributes,
  buttonLabel,
  clearDataAttributes,
  id,
  inputDataAttributes,
  panelDataAttributes,
  panelLabel,
  panelWidthClassName = 'w-32 max-w-[10rem]',
  placeholder,
  state,
  toggleDataAttributes,
}: {
  affordanceDataAttributes?: DataAttributes
  buttonLabel: string
  clearDataAttributes?: DataAttributes
  id: string
  inputDataAttributes?: DataAttributes
  panelDataAttributes?: DataAttributes
  panelLabel: string
  panelWidthClassName?: string
  placeholder: string
  state: FloatingPanelCatalogSearchState
  toggleDataAttributes?: DataAttributes
}) {
  return (
    <section
      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-end"
      aria-label={`${buttonLabel} controls`}
      data-kg-floating-panel-catalog-search-affordance="1"
      {...affordanceDataAttributes}
      onFocus={() => state.setSearchFocusWithin(true)}
      onBlur={state.handleSearchAffordanceBlur}
    >
      {state.searchOpen ? (
        <section
          className={cn('absolute right-0 top-[calc(100%+0.25rem)] z-20 flex h-6 shrink-0 items-center gap-1 rounded border px-1.5 shadow-[var(--kg-shadow-overlay)]', panelWidthClassName, UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
          aria-label={panelLabel}
          data-kg-floating-panel-catalog-search-panel="overlay"
          {...panelDataAttributes}
        >
          <label className="sr-only" htmlFor={id}>{panelLabel}</label>
          <input
            ref={state.searchInputRef}
            id={id}
            type="search"
            className={cn('min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500', UI_THEME_TOKENS.text.primary)}
            placeholder={placeholder}
            value={state.searchQuery}
            data-kg-floating-panel-catalog-search-input="1"
            {...inputDataAttributes}
            onInput={state.handleSearchQueryInput}
            onChange={state.handleSearchQueryInput}
          />
          {state.searchQuery.trim() ? (
            <button
              type="button"
              className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded', UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary)}
              title={`Clear ${placeholder.toLowerCase()}`}
              aria-label={`Clear ${placeholder.toLowerCase()}`}
              data-kg-floating-panel-catalog-search-clear="1"
              {...clearDataAttributes}
              onClick={state.clearSearchQuery}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </section>
      ) : null}
      <button
        type="button"
        className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border p-0', UI_THEME_TOKENS.panel.border, state.searchOpen ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.input.bg)}
        title={buttonLabel}
        aria-label={buttonLabel}
        aria-expanded={state.searchOpen}
        data-kg-floating-panel-catalog-search-toggle="1"
        {...toggleDataAttributes}
        onClick={state.handleSearchToggle}
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
      </button>
    </section>
  )
}
