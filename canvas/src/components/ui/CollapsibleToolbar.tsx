import React from 'react'
import { MoreHorizontal } from 'lucide-react'

import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { DetailsMenu } from '@/components/ui/DetailsMenu'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type CollapsibleToolbarProps = {
  ariaLabel: string
  className?: string
  compactQuery?: string
  collapsedClassName?: string
  forceExpanded?: boolean
  children: React.ReactNode
}

export const CollapsibleToolbar = React.memo(function CollapsibleToolbar(props: CollapsibleToolbarProps) {
  const isCompact = useMediaQuery(props.compactQuery || '(max-width: 640px)')
  if (props.forceExpanded || !isCompact) {
    return (
      <nav className={props.className} aria-label={props.ariaLabel}>
        {props.children}
      </nav>
    )
  }

  return (
    <nav className={props.className} aria-label={props.ariaLabel}>
      <DetailsMenu
        ariaLabel={`${props.ariaLabel} overflow`}
        detailsClassName="relative"
        summaryClassName={['list-none', UI_THEME_TOKENS.button.square].join(' ')}
        menuClassName="absolute right-0 mt-2"
        portal
        portalPlacement="bottom-end"
        summary={<MoreHorizontal className="w-4 h-4" aria-hidden="true" />}
        menu={
          <section className={['kg-collapsible-toolbar-overflow rounded border shadow-[var(--kg-shadow-overlay)] p-2', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}>
            <section className={props.collapsedClassName || 'kg-collapsible-toolbar-overflow-items flex flex-col gap-2'} aria-label="Toolbar overflow items">
              {props.children}
            </section>
          </section>
        }
      />
    </nav>
  )
})
