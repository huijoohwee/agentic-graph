import React from 'react'
import DashboardWidgetDisclosure from './DashboardWidgetDisclosure'
import DashboardWidgetFlip, { type DashboardTemplate } from './DashboardWidgetFlip'
import DashboardWidgetBoard from './DashboardWidgetBoard'
import DashboardWidgetContainer from './DashboardWidgetContainer'
import { DashboardMarkdown } from './DashboardMarkdown'
import { DashboardCardView } from './DashboardWidgets'
import { useDashboardWidgets, authoredDashboardWidgets, updateDashboardWidget } from './dashboardWidgetConfiguration'

export default function DashboardDocumentWidgets({ sourceIds }: { sourceIds: string[] }) {
  const { document } = useDashboardWidgets()
  const entries = authoredDashboardWidgets(document, sourceIds)
  const containers = entries.filter(([, config]) => config.template === 'container')
  const contained = new Set(containers.flatMap(([, config]) => config.children ?? []))
  const items = entries.filter(([, config]) => config.template !== 'container').map(([id, config]) => {
    const title = config.title ?? config.template!, cardId = id.slice(6)
    const markdown = config.markdown ?? (config.template === 'heading' ? '## Heading' : config.template === 'divider' ? '---' : config.template === 'table' ? '| Label | Value |\n| --- | --- |\n| A | — |' : 'Add Markdown text in Props.')
    const body = <DashboardMarkdown text={markdown} onChange={next => { void updateDashboardWidget(id, { markdown: next }).catch(() => undefined) }} />
    return { id, cardId, content: <DashboardWidgetFlip widgetId={id} template={config.template as DashboardTemplate} title={title} defaults={config}>
      <DashboardCardView card={{ id: cardId, title, subtitle: config.subtitle ?? '', kind: 'table', tone: config.tone ?? 'slate', rows: [], series: [] }}>
        {config.template === 'disclosure' ? <DashboardWidgetDisclosure id={id} title={title}>{body}</DashboardWidgetDisclosure> : body}
      </DashboardCardView>
    </DashboardWidgetFlip> }
  })
  return <section className="min-w-0 space-y-4" aria-label="Added Dashboard widgets">
    <DashboardWidgetBoard id="authored" items={items.filter(item => !contained.has(item.id))} />
    {containers.map(([id, config]) => <DashboardWidgetContainer key={id} id={id.slice(6)} title={config.title ?? 'Container'} subtitle={config.subtitle} columns={config.columns ?? 2}
      items={(config.children ?? []).flatMap(child => { const item = items.find(item => item.id === child); return item ? [item] : [] })} />)}
  </section>
}
