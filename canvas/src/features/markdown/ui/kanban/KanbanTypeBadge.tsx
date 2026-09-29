import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export const KanbanTypeBadge = React.memo(function KanbanTypeBadge(props: { size?: 'sm' | 'md' }) {
  const size = props.size || 'md'
  const sizeClass = size === 'sm' ? 'w-4 h-4 text-xs' : 'w-5 h-5 text-xs'
  return (
    <span
      className={[
        'inline-flex items-center justify-center font-semibold',
        sizeClass,
        UI_THEME_TOKENS.icon.color,
      ].join(' ')}
      aria-label="Type"
    >
      T
    </span>
  )
})
