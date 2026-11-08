import React, { useCallback, useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SettingsSectionHeader } from '@agentic-base/views-react/settings'
import clsx from 'clsx'
import IconButton from '@/components/IconButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { getIconSizeClass } from '@/lib/ui/icons'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KTV_SECTION_CONTENT_CLASS_NAME, KTV_SECTION_SPACING_CLASS_NAME, panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'

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
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const uncontrolled = typeof collapsed !== 'boolean'
  const [innerCollapsed, setInnerCollapsed] = useState<boolean>(defaultCollapsed)
  const isCollapsed = uncontrolled ? innerCollapsed : (collapsed as boolean)
  const [hasExpanded, setHasExpanded] = useState(!isCollapsed)
  useEffect(() => {
    if (!isCollapsed) setHasExpanded(true)
  }, [isCollapsed])
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
      role="img"
      aria-label={isCollapsed ? "Expand section" : "Collapse section"}
    />
  )

  return (
    <section
      className={clsx(
        'agentic-panel-section',
        KTV_SECTION_SPACING_CLASS_NAME,
        flushTop ? 'border-t-0' : `border-t ${UI_THEME_TOKENS.panel.border}`,
        className,
      )}
    >
      <SettingsSectionHeader
        title={title}
        actions={<>
          {actions}
          <IconButton className="App-toolbar__btn" title={isCollapsed ? UI_COPY.expandSectionTitle : UI_COPY.collapseSectionTitle}
            onClick={e => { e.stopPropagation(); setCollapsed(!isCollapsed) }} showTooltip>
            {chevronIcon}
          </IconButton>
        </>}
        className={clsx(
          'cursor-pointer select-none',
          stickyHeader && 'sticky bg-[var(--panel-bg)] z-10 backdrop-blur-[4px]',
          stickyHeader && stickyOffsetClassName,
          panelFieldDecorationClassName(headerClassName),
        )}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed(!isCollapsed)}
        onKeyDown={handleKeyDown}
      />
      <section id={contentId} className={clsx(isCollapsed ? 'hidden' : KTV_SECTION_CONTENT_CLASS_NAME)}>
        {hasExpanded || !isCollapsed ? children : null}
      </section>
    </section>
  )
}
