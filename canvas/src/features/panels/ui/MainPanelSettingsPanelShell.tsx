import React from 'react'

import {
  UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export function MainPanelSettingsPanelShell(props: {
  ariaLabel: string
  titleNode: React.ReactNode
  secondaryNode?: React.ReactNode
  secondaryNodeClassName?: string
  uiPanelKeyValueTextSizeClass: string
  children: React.ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
}) {
  const {
    ariaLabel,
    titleNode,
    secondaryNode,
    secondaryNodeClassName,
    uiPanelKeyValueTextSizeClass,
    children,
    className,
    headerClassName,
    bodyClassName,
  } = props

  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        `rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-hidden flex flex-col min-h-0 min-w-0`,
        className,
      )}
    >
      <header
        className={cn(
          `border-b ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-2 py-1.5 ${UI_THEME_TOKENS.text.primary} flex items-center justify-between gap-2`,
          headerClassName,
        )}
      >
        <section className="min-w-0 shrink-0 max-w-[50%]">{titleNode}</section>
        {secondaryNode != null ? (
          <section
            className={cn(
              UI_RESPONSIVE_PANEL_HEADER_SECONDARY_CLASSNAME,
              `${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary} min-w-0 flex-1 whitespace-nowrap truncate text-right`,
              secondaryNodeClassName,
            )}
            aria-label="Selection summary"
          >
            {secondaryNode}
          </section>
        ) : null}
      </header>
      <section
        className={cn(
          `${UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME} py-2 ${UI_THEME_TOKENS.panel.bg}`,
          bodyClassName,
        )}
      >
        {children}
      </section>
    </section>
  )
}
