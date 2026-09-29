import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChipClass } from '@/lib/ui/icons'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export function ResponsiveInlineIconBadge({
  Icon,
  label,
  title,
  className,
  iconClassName,
  textClassName,
}: {
  Icon: LucideIcon
  label: string
  title?: string
  className?: string
  iconClassName?: string
  textClassName?: string
}) {
  return (
    <span
      className={getChipClass('default', {
        textSizeClass: 'text-xs',
        textColorClass: UI_THEME_TOKENS.text.secondary,
        extraClassName: cn(
          UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
          'max-w-full gap-1 px-1.5 py-0.5 font-semibold',
          UI_THEME_TOKENS.panel.border,
          UI_THEME_TOKENS.input.bg,
          className,
        ),
      })}
      title={title || label}
      data-kg-responsive-inline-icon-badge={label}
    >
      <Icon className={cn('h-3 w-3 shrink-0', iconClassName)} strokeWidth={1.7} aria-hidden />
      <span className={cn('min-w-0 truncate', textClassName)}>{label}</span>
    </span>
  )
}
