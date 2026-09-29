import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type MarkdownSidebarFrameProps = {
  as?: 'aside' | 'section'
  ariaLabel: string
  className?: string
  style?: React.CSSProperties
  hideHeader?: boolean
  title: React.ReactNode
  titleClassName?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}

export function MarkdownSidebarFrame(props: MarkdownSidebarFrameProps) {
  const {
    as: Tag = 'aside',
    ariaLabel,
    className,
    style,
    hideHeader,
    title,
    titleClassName,
    headerRight,
    children,
  } = props

  return (
    <Tag aria-label={ariaLabel} className={className} style={style}>
      {!hideHeader && (
        <header className={`flex items-center justify-between p-2 border-b ${UI_THEME_TOKENS.panel.border}`}>
          <h2
            className={
              titleClassName ||
              `font-sans text-xs font-semibold uppercase tracking-normal truncate ${UI_THEME_TOKENS.text.tertiary}`
            }
          >
            {title}
          </h2>
          <span className="flex items-center gap-1">{headerRight}</span>
        </header>
      )}
      {children}
    </Tag>
  )
}
