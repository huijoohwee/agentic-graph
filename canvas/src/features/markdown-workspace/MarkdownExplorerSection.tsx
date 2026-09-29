import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_BODY_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_PRIMARY_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_SECONDARY_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type MarkdownExplorerSectionScrollMode = 'auto' | 'primary' | 'secondary'

export function MarkdownExplorerSection(props: {
  title: string
  collapsed: boolean
  setCollapsed: (next: boolean) => void
  sectionRef?: React.Ref<HTMLElement>
  sectionStyle?: React.CSSProperties
  scrollMode?: MarkdownExplorerSectionScrollMode
  right?: React.ReactNode
  children: React.ReactNode
}) {
  const { title, collapsed, setCollapsed, sectionRef, sectionStyle, scrollMode = 'auto', right, children } = props
  const panelTypography = usePanelTypography()
  const sectionScrollClassName = collapsed
    ? ''
    : scrollMode === 'primary'
      ? UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_PRIMARY_CLASSNAME
      : scrollMode === 'secondary'
        ? UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_SECONDARY_CLASSNAME
        : ''

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setCollapsed(!collapsed)
      }
    },
    [collapsed, setCollapsed],
  )

  return (
    <section
      ref={sectionRef}
      className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_CLASSNAME} ${sectionScrollClassName} border-b ${UI_THEME_TOKENS.panel.border}`}
      style={sectionStyle}
      aria-label={title}
    >
      <header
        className={[
          'kg-workspace-section-header sticky top-0 z-20 w-full flex items-center justify-between px-2 py-1',
          panelTypography.microLabelClass,
          'tracking-normal font-semibold uppercase',
          UI_THEME_TOKENS.panel.bg,
          'backdrop-blur',
          UI_THEME_TOKENS.button.text,
          UI_THEME_TOKENS.button.hoverBg,
        ].join(' ')}
        aria-label={`${title} header`}
      >
        <button
          type="button"
          className="flex items-center gap-1 min-w-0 flex-1"
          onClick={() => setCollapsed(!collapsed)}
          onKeyDown={e => onKeyDown(e as unknown as React.KeyboardEvent<HTMLElement>)}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} /> : <ChevronDown className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />}
          <span className={`${UI_TEXT_TRUNCATE} ${panelTypography.panelTextClass}`}>{title}</span>
        </button>

        <nav className="flex items-center gap-1 shrink-0" aria-label={`${title} actions`}>
          {right}
        </nav>
      </header>
      {!collapsed ? (
        <section className={`${UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_BODY_CLASSNAME} px-1 pb-1`} aria-label={`${title} content`}>
          {children}
        </section>
      ) : null}
    </section>
  )
}
