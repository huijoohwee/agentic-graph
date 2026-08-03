import React from 'react'
import { UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

type MarkdownFileTreeRowButtonProps = {
  ariaLabel: string
  indent: number
  isActive: boolean
  textClassName: string
  onClick: () => void
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}

export function MarkdownFileTreeRowButton(props: MarkdownFileTreeRowButtonProps) {
  const { ariaLabel, indent, isActive, textClassName, onClick, onContextMenu, children } = props

  return (
    <button
      type="button"
      className={`flex-1 min-w-0 flex items-center gap-1 rounded ${UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME} ${textClassName} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${uiSelectedRowStateClassName(isActive)}`}
      style={{ paddingLeft: 6 + indent }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
