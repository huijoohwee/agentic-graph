import React from 'react'
import { useDashboardWidgets, updateDashboardWidget } from './dashboardWidgetConfiguration'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'

export function useDashboardWidgetExpansion(id?: string) {
  const { document } = useDashboardWidgets(), expanded = !id || document.widgets[id]?.expanded !== false
  const setExpanded = (value: boolean) => { if (id && value !== expanded) void updateDashboardWidget(id, { expanded: value }).catch(() => undefined) }
  return { expanded, setExpanded }
}
/** Native disclosure keeps its children mounted: hiding evidence never restarts an observer. */
export default function DashboardWidgetDisclosure({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { expanded, setExpanded } = useDashboardWidgetExpansion(id)
  return <details data-dashboard-disclosure={id} className="rounded border p-3" open={expanded}
    onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">{renderMarkdownSigilInlineText(title)}</summary>
    {children}
  </details>
}
