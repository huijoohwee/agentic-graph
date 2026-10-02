import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelViewTabs, PanelViewTab } from './PanelViewTabs'
import { getIconSizeClass } from '@/lib/ui'
import { UI_SELECTORS } from '@/lib/config'
import {
  uiToolbarRowScrollClassName,
  uiToolbarRowScrollJustifyEndClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type Tab = { key: string; label: string }

export type TabIconComponent = React.ComponentType<{
  className?: string
  strokeWidth?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

interface TabHeaderProps {
  collapsed?: boolean
  onToggle?: () => void
  onHeaderDoubleClick?: () => void
  onDragStart?: (ev: React.PointerEvent<HTMLElement>) => void
  tabs?: Tab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  tabIdBase?: string
  searchVisible?: boolean
  searchPlaceholder?: string
  searchQuery?: string
  onSearchChange?: (q: string) => void
  rightSlot?: React.ReactNode
  tabIconByKey?: Partial<Record<string, TabIconComponent>>
}

function TabHeaderImpl({
  collapsed,
  onToggle,
  onHeaderDoubleClick,
  onDragStart,
  tabs = [],
  activeTab,
  onTabChange,
  tabIdBase,
  searchVisible,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  rightSlot,
  tabIconByKey,
}: TabHeaderProps) {
  const clickTimeoutRef = React.useRef<number | null>(null)
  const uiHeaderRowHeightClass = useGraphStore(
    s => s.uiHeaderRowHeightClass || UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  )
  const uiHeaderRowPaddingClass = useGraphStore(
    s => s.uiHeaderRowPaddingClass || 'py-1',
  )
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  React.useEffect(() => {
    return () => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current)
        clickTimeoutRef.current = null
      }
    }
  }, [])

  const onHeaderClick = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!onToggle) return
    const el = e.target as Element
    if (el.closest(UI_SELECTORS.draggablePanelIgnorePointerDown)) return
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null
      onToggle()
    }, 200)
  }, [onToggle])

  const handleDoubleClick = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!onHeaderDoubleClick) return
    const el = e.target as Element
    if (el.closest(UI_SELECTORS.draggablePanelIgnorePointerDown)) return
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    try {
      const sel = window.getSelection?.()
      if (sel && sel.type === 'Range') sel.removeAllRanges()
    } catch {
      void 0
    }
    e.preventDefault()
    onHeaderDoubleClick()
  }, [onHeaderDoubleClick])

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!onDragStart) return
    const el = e.target as Element
    if (el.closest(UI_SELECTORS.draggablePanelIgnorePointerDown)) return
    onDragStart(e)
  }, [onDragStart])

  const base = String(tabIdBase || 'panel').trim() || 'panel'
  const inputId = `${base}-search`
  return (
    <header
      className={
        [
	          'HeaderBar',
	          uiToolbarRowScrollClassName,
	          'gap-y-1',
          'select-none',
          onDragStart ? 'cursor-move' : '',
          onToggle ? 'cursor-pointer' : '',
          uiHeaderRowHeightClass,
          uiHeaderRowPaddingClass,
        ].join(' ')
      }
      onClick={onHeaderClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      aria-expanded={typeof collapsed === 'boolean' ? !collapsed : undefined}
    >
	      <nav className={`kg-panel-tabs-nav ${uiToolbarRowScrollClassName} basis-full w-full sm:basis-auto sm:w-auto sm:flex-1`} aria-label="Panel tabs">
        {tabs.length > 0 && (
          <PanelViewTabs
            activeKey={activeTab || ''}
            role="tablist"
            aria-label="Tabs"
            aria-orientation="horizontal"
            className="kg-panel-tablist w-full pb-[1px] sm:w-auto"
          >
            {tabs.map(t => {
              const TabIcon = tabIconByKey?.[t.key]
              if (!TabIcon) throw new Error(`Missing panel tab icon: ${t.key}`)
              return (
                <PanelViewTab
                  key={t.key}
                  data-kg-spotlight-tab={t.key}
                  title={t.label}
                  onClick={() => onTabChange?.(t.key)}
                  role="tab"
                  id={`${base}-${t.key}-tab`}
                  aria-selected={activeTab === t.key}
                  aria-controls={`${base}-${t.key}-panel`}
                >
                  <TabIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                </PanelViewTab>
              )
            })}
          </PanelViewTabs>
        )}
      </nav>
	      <section className={`${uiToolbarRowScrollJustifyEndClassName} w-full gap-1 sm:w-auto sm:shrink-0 sm:gap-2`} aria-label="Panel tools">
        {onSearchChange && (
          <section
            className={`overflow-hidden transition-[width,flex-basis,opacity] duration-200 ease-out ${
              searchVisible ? 'basis-full w-full sm:basis-auto sm:w-72' : 'basis-0 w-0'
            }`}
          >
            <label htmlFor={inputId} className="sr-only">
              {searchPlaceholder || 'Search'}
            </label>
            <input
              id={inputId}
              value={searchQuery || ''}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder || 'Search'}
              className={`h-[var(--kg-control-height)] w-full min-w-0 px-2 text-xs border ${UI_THEME_TOKENS.input.border} rounded-lg ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${UI_THEME_TOKENS.focus.primaryBorderRing} transition-opacity duration-150 select-text ${
                searchVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />
          </section>
        )}
        {rightSlot}
      </section>
    </header>
  )
}

const TabHeader = React.memo(TabHeaderImpl)
export default TabHeader
