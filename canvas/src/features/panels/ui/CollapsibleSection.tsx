import React, { useCallback, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import IconButton from '@/components/IconButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { getIconSizeClass } from '@/lib/ui/icons'
import {
  UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KTV_SECTION_TITLE_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'

interface CollapsibleSectionProps {
  title: React.ReactNode
  defaultCollapsed?: boolean
  collapsed?: boolean
  onToggle?: (next: boolean) => void
  actions?: React.ReactNode
  children: React.ReactNode
  id?: string
  className?: string
  headerClassName?: string
  stickyHeader?: boolean
  toolbarAligned?: boolean
  stickyOffsetClassName?: string
  flushTop?: boolean
}

export default function CollapsibleSection({
  title,
  defaultCollapsed = true,
  collapsed,
  onToggle,
  actions,
  children,
  id,
  className,
  headerClassName,
  stickyHeader = true,
  stickyOffsetClassName = 'top-0',
  flushTop = false,
}: CollapsibleSectionProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const uiSectionHeaderRowHeightClass = useGraphStore(
    s => s.uiSectionHeaderRowHeightClass || UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  )
  const uiSectionHeaderRowPaddingClass = useGraphStore(
    s => s.uiSectionHeaderRowPaddingClass || 'py-1',
  )
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const uncontrolled = typeof collapsed !== 'boolean'
  const [innerCollapsed, setInnerCollapsed] = useState<boolean>(defaultCollapsed)
  const isCollapsed = uncontrolled ? innerCollapsed : (collapsed as boolean)
  const setCollapsed = useCallback(
    (next: boolean) => {
      if (uncontrolled) setInnerCollapsed(next)
      if (onToggle) onToggle(next)
    },
    [uncontrolled, onToggle]
  )

  const generatedId = useId()
  const contentId = id || `section-${generatedId}`

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setCollapsed(!isCollapsed)
      }
    },
    [isCollapsed, setCollapsed]
  )

  const chevronIcon = (
    <ChevronDown
      className={clsx(`${iconSizeClass} ${UI_THEME_TOKENS.text.secondary} transition-transform`, !isCollapsed && 'rotate-180')}
      strokeWidth={uiIconStrokeWidth}
      aria-hidden="true"
    />
  )

  return (
    <section
      className={clsx(
        flushTop ? 'mt-0 border-t-0 pt-0' : `mt-3 border-t ${UI_THEME_TOKENS.panel.border} pt-2`,
        className,
      )}
    >
      <section
        className={clsx(
          'flex min-w-0 max-w-full items-center justify-between gap-1 cursor-pointer select-none',
          uiSectionHeaderRowHeightClass,
          uiSectionHeaderRowPaddingClass,
          stickyHeader && 'sticky bg-[var(--panel-bg)] z-10 backdrop-blur-[4px]',
          stickyHeader && stickyOffsetClassName,
          headerClassName,
        )}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed(!isCollapsed)}
        onKeyDown={handleKeyDown}
      >
        <section className={`min-w-0 flex-1 overflow-hidden ${KTV_SECTION_TITLE_CLASS_NAME}`}>{title}</section>
        <section className={clsx(UI_RESPONSIVE_PANEL_HEADER_ACTIONS_CLASSNAME, 'flex shrink-0 flex-wrap items-center justify-end gap-1')}>
          {actions}
          <IconButton
            className="App-toolbar__btn flex items-center justify-center"
            title={isCollapsed ? UI_COPY.expandSectionTitle : UI_COPY.collapseSectionTitle}
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed(!isCollapsed)
            }}
            showTooltip
          >
            {chevronIcon}
          </IconButton>
        </section>
      </section>
      <section id={contentId} className={clsx(isCollapsed ? 'hidden' : 'block mt-2')}>
        {children}
      </section>
    </section>
  )
}
