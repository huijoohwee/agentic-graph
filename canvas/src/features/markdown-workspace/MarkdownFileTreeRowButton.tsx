import React from 'react'
import { UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

type MarkdownFileTreeRowButtonProps = {
  ariaLabel: string
  title?: string
  indent: number
  isActive: boolean
  ariaExpanded?: boolean
  textClassName: string
  onClick: React.MouseEventHandler<HTMLButtonElement>
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}

export function MarkdownFileTreeRowButton(props: MarkdownFileTreeRowButtonProps) {
  const { ariaLabel, title, indent, isActive, ariaExpanded, textClassName, onClick, onContextMenu, children } = props
  const rowRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [isActive])

  return (
    <button
      ref={rowRef}
      type="button"
      className={`flex-1 min-w-0 flex items-center gap-1 rounded ${UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME} ${textClassName} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.focus.primaryRing} ${isActive ? '' : 'border border-transparent'} ${uiSelectedRowStateClassName(isActive, 'choice')}`}
      style={{ paddingLeft: 6 + indent }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onContextMenu(event)
      }}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-current={isActive ? 'page' : undefined}
      title={title || ariaLabel}
    >
      {children}
    </button>
  )
}
