import React from 'react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export default function FloatingPropsPanelMenuButton({
  onClick,
  children,
  disabled,
  className,
  draggable,
  onDragStart,
  onDragEnd,
  onPointerDownCapture,
  title,
  ariaLabel,
  uiPanelKeyValueTextSizeClass,
  uiPanelTextFontClass,
}: {
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
  draggable?: boolean
  onDragStart?: (ev: React.DragEvent<HTMLElement>) => void
  onDragEnd?: (ev: React.DragEvent<HTMLElement>) => void
  onPointerDownCapture?: (ev: React.PointerEvent<HTMLElement>) => void
  title?: string
  ariaLabel?: string
  uiPanelKeyValueTextSizeClass: string
  uiPanelTextFontClass: string
}) {
  const interactiveClassName = cn(`block w-full text-left px-3 py-2 ${UI_THEME_TOKENS.table.rowHover} ${disabled ? 'opacity-50 cursor-not-allowed' : draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} font-normal ${UI_THEME_TOKENS.text.primary}`, className)
  const handleKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || !onClick) return
    if (ev.key !== 'Enter' && ev.key !== ' ') return
    ev.preventDefault()
    onClick()
  }

  return (
    <section
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={interactiveClassName}
      onClick={() => {
        if (disabled) return
        onClick?.()
      }}
      aria-disabled={disabled ? 'true' : 'false'}
      draggable={disabled ? false : draggable}
      onPointerDownCapture={onPointerDownCapture}
      onDragStart={(ev) => {
        if (disabled || !draggable) {
          ev.preventDefault()
          return
        }
        onDragStart?.(ev)
      }}
      onDragEnd={onDragEnd}
      onKeyDown={handleKeyDown}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  )
}
