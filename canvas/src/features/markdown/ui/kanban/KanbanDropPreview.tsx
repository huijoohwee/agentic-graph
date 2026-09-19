import React from 'react'
import { ArrowDownToLine, ArrowUpToLine, CornerDownRight } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COLOR_PRIMARY_BLUE_INDICATOR } from '@/features/toolbar/ui/toolbarStyles'
import { UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import type { KanbanDropPosition } from './kanbanReorder'

export function KanbanDropIndicator(props: { className?: string }) {
  return (
    <section
      className={[UI_RESPONSIVE_KANBAN_DROP_INDICATOR_CLASSNAME, props.className].filter(Boolean).join(' ')}
      style={{ backgroundColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
      aria-hidden="true"
    />
  )
}

export function KanbanLaneDragOverIndicator() {
  return <KanbanDropIndicator className="absolute inset-x-0 top-0" />
}

export function KanbanCardDropPreview(props: { position: KanbanDropPosition; label?: string }) {
  if (props.position === 'end') return null
  if (props.position === 'left' || props.position === 'right') return <section aria-hidden="true"
    className={`pointer-events-none absolute inset-y-0 z-10 w-1 ${props.position === 'left' ? 'left-0' : 'right-0'}`}
    style={{ backgroundColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}>
    <span className={`absolute top-2 whitespace-nowrap rounded border bg-[var(--kg-panel-bg)] p-1 text-[10px] ${props.position === 'left' ? 'left-1' : 'right-1'}`}>
      {props.label || `Insert ${props.position}`}
    </span>
  </section>
  const top = props.position === 'before'
  const Icon = top ? ArrowUpToLine : ArrowDownToLine
  const label = props.label || (top ? 'Insert before' : 'Insert after')
  return (
    <section
      className={['pointer-events-none absolute inset-x-2 z-10 flex items-center gap-2', top ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2'].join(' ')}
      aria-hidden="true"
    >
      <KanbanDropIndicator className="flex-1 rounded-full" />
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm',
          UI_THEME_TOKENS.panel.border,
          UI_THEME_TOKENS.panel.bg,
          UI_THEME_TOKENS.text.secondary,
        ].join(' ')}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>{label}</span>
      </span>
    </section>
  )
}

export function KanbanLaneDropPreview(props: { label: string; compact?: boolean }) {
  return (
    <section
      className={[
        'rounded-md border border-dashed px-3 py-3 text-center',
        props.compact ? 'mt-2' : 'm-2',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
        UI_THEME_TOKENS.text.tertiary,
      ].join(' ')}
      style={{ borderColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }}
      aria-hidden="true"
    >
      <section className="flex items-center justify-center gap-2 text-[11px] font-medium">
        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{props.label}</span>
      </section>
    </section>
  )
}
