import React from 'react'
import DashboardWidgetBoard from './DashboardWidgetBoard'
import { DashboardMarkdown } from './DashboardMarkdown'
import { useDashboardWidgets } from './dashboardWidgetConfiguration'

export default function DashboardWidgetContainer({ id, title, subtitle = '', columns = 3, items }: {
  id: string; title: string; subtitle?: string; columns?: number;
  items: { id: string; cardId: string; content: React.ReactNode }[]
}) {
  const { document } = useDashboardWidgets(), config = document.widgets[`graph:container-${id}`] ?? document.widgets[`graph:${id}`] ?? {}
  if (config.visible === false) return null
  return <section className="min-w-0" data-kg-dashboard-section={id}>
    <header className="mb-3 flex min-w-0 items-center gap-3">
      <DashboardMarkdown text={config.markdown ?? `### ${config.title ?? title}`} label={`${title} heading`} />
      <hr className="min-w-0 flex-1 border-[var(--kg-border)]" />
      <span className="shrink-0 text-xs text-[var(--kg-text-tertiary)]">{config.subtitle ?? subtitle}</span>
    </header>
    <section data-kg-dashboard-section-cards="1"><DashboardWidgetBoard id={id} columns={config.columns ?? columns} items={items} /></section>
  </section>
}
