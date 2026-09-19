import React from 'react'
import DashboardWidgetBoard from './DashboardWidgetBoard'
import { DashboardMarkdown } from './DashboardMarkdown'
import { useDashboardWidgets } from './dashboardWidgetConfiguration'
import { useDashboardWidgetExpansion } from './DashboardWidgetDisclosure'

export default function DashboardWidgetContainer({ id, widgetId = `graph:container-${id}`, title, subtitle = '', columns = 3, items }: {
  id: string; widgetId?: string; title: string; subtitle?: string; columns?: number;
  items: { id: string; cardId: string; content: React.ReactNode }[]
}) {
  const { document } = useDashboardWidgets(), config = document.widgets[widgetId] ?? {}
  const expansion = useDashboardWidgetExpansion(widgetId)
  const description = config.subtitle ?? subtitle
  if (config.visible === false) return null
  return <section className="min-w-0" data-kg-dashboard-section={id}>
    <header className="mb-3 min-w-0">
      <DashboardMarkdown text={config.markdown ?? `### ${config.title ?? title}`} label={`${title} heading`} headingExpansion={expansion} />
      {description && <p hidden={!expansion.expanded} className="mt-1 text-sm text-[var(--kg-text-secondary)]">{description}</p>}
    </header>
    <section hidden={!expansion.expanded} data-kg-dashboard-section-cards="1"><DashboardWidgetBoard id={id} columns={config.columns ?? columns} items={items} /></section>
  </section>
}
