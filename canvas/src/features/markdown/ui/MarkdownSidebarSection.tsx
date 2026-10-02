import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { buildMarkdownSidebarTitleClassName } from './markdownSidebarText'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export type MarkdownSidebarSectionProps = {
  ariaLabel: string
  title: string
  uiPanelTextFontClass: string
  uiPanelMicroLabelTextSizeClass?: string
  uiPanelKeyValueTextSizeClass?: string
  menuAriaLabel?: string
  menuItems?: React.ReactNode
  collapsed?: boolean
  onToggleCollapsed?: () => void
  children: React.ReactNode
}

export function MarkdownSidebarSection(props: MarkdownSidebarSectionProps) {
  const {
    ariaLabel,
    title,
    uiPanelTextFontClass,
    uiPanelMicroLabelTextSizeClass,
    uiPanelKeyValueTextSizeClass,
    menuAriaLabel,
    menuItems,
    collapsed,
    onToggleCollapsed,
    children,
  } = props

  const headerLabelClassName = buildMarkdownSidebarTitleClassName({
    uiPanelTextFontClass,
    uiPanelMicroLabelTextSizeClass,
    uiPanelKeyValueTextSizeClass,
    textColorClassName: UI_THEME_TOKENS.text.tertiary,
  })

  return (
    <section className={`border-b ${UI_THEME_TOKENS.panel.border}`} aria-label={ariaLabel}>
      <header className={`px-2 py-1 ${UI_THEME_TOKENS.panel.bg}`}>
        <section className="flex items-center justify-between gap-2" aria-label={`${title} header`}>
          {onToggleCollapsed ? (
            <button
              type="button"
              className="min-w-0 flex items-center gap-1.5"
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            >
              {collapsed ? (
                <ChevronRight className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
              ) : (
                <ChevronDown className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
              )}
              <h3 className={headerLabelClassName}>{title}</h3>
            </button>
          ) : (
            <h3 className={headerLabelClassName}>{title}</h3>
          )}
          {menuItems ? (
            <menu className="flex items-center gap-1" aria-label={menuAriaLabel || `${title} actions`}>
              {menuItems}
            </menu>
          ) : null}
        </section>
      </header>
      {collapsed ? null : children}
    </section>
  )
}
