import React from 'react'
import { ChevronDown } from 'lucide-react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DetailsMenu } from '@/components/ui/DetailsMenu'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export type ColumnHeaderPropertyTypeMenuProps = {
  ariaLabel: string
  label: string
  Icon?: React.ComponentType<{ className?: string }>
  detailsClassName?: string
  summaryClassName?: string
  menuClassName?: string
  rightContent?: React.ReactNode
  portal?: boolean
  portalPlacement?: 'bottom-start' | 'bottom-end'
  onSummaryPointerDown?: (e: React.PointerEvent<HTMLElement>) => void
  menu: React.ReactNode | ((api: { close: () => void }) => React.ReactNode)
  toggleTargets?: 'chevron' | 'icon+chevron'
}

const columnHeaderPropertyTypeMenuGlyphClassName = [UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, 'shrink-0', UI_THEME_TOKENS.icon.color].join(' ')

export const ColumnHeaderPropertyTypeMenu = React.memo(function ColumnHeaderPropertyTypeMenu(
  props: ColumnHeaderPropertyTypeMenuProps,
) {
  const toggleTargets = props.toggleTargets || 'icon+chevron'
  const shouldToggleFromSummaryEvent = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.detail === 0 && e.target === e.currentTarget) return true
    const el = e.target as HTMLElement | null
    return Boolean(el?.closest('[data-kg-menu-toggle]'))
  }, [])

  const Icon = props.Icon
  const iconEl = Icon ? (
    <span data-kg-menu-toggle={toggleTargets === 'icon+chevron' ? 'true' : undefined} className="inline-flex items-center">
      <Icon className={columnHeaderPropertyTypeMenuGlyphClassName} />
    </span>
  ) : null

  return (
    <DetailsMenu
      ariaLabel={props.ariaLabel}
      detailsClassName={props.detailsClassName || 'relative min-w-0'}
      summaryClassName={
        props.summaryClassName ||
        ['list-none cursor-pointer flex items-center gap-2 min-w-0', UI_THEME_TOKENS.button.hoverBg].join(' ')
      }
      menuClassName={props.menuClassName || 'absolute left-0 mt-2'}
      portal={props.portal}
      portalPlacement={props.portalPlacement}
      shouldToggleFromSummaryEvent={shouldToggleFromSummaryEvent}
      onSummaryPointerDown={props.onSummaryPointerDown}
      summary={
        <>
          {iconEl}
          <span className={['min-w-0 flex-1', UI_TEXT_TRUNCATE].join(' ')}>{props.label}</span>
          <span className="flex min-w-0 shrink-0 items-center gap-2">
            {props.rightContent}
            <span data-kg-menu-toggle="true" className="inline-flex items-center">
              <ChevronDown className={columnHeaderPropertyTypeMenuGlyphClassName} aria-hidden="true" />
            </span>
          </span>
        </>
      }
      menu={props.menu}
    />
  )
})
