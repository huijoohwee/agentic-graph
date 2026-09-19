import React from 'react'
import DashboardWidgetBoard from './DashboardWidgetBoard'
import DashboardWidgetFlip, { type DashboardTemplate } from './DashboardWidgetFlip'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import { DashboardMarkdown } from './DashboardMarkdown'
import DashboardWidgetDisclosure from './DashboardWidgetDisclosure'
import DashboardWidgetContainer from './DashboardWidgetContainer'
import { useDashboardWidgets } from './dashboardWidgetConfiguration'
import { dashboardValueText, dashboardWidgetMarkdown } from './dashboardMarkdownDocument'
import type { DashboardCardKind } from './dashboardModel'

/** Snapshot data feeds the original cards, board, Props, resize and collapse owners. */
export default function DashboardSnapshotView() {
  const { dashboard, document, error, sourcePath } = useDashboardWidgets()
  if (!dashboard) return null
  const containers = Object.entries(document.widgets).filter(([, config]) => config.template === 'container' && config.visible !== false)
  const contained = new Set(containers.flatMap(([, config]) => config.children ?? []))
  const items = Object.entries(document.widgets).filter(([, config]) => config.visible !== false && config.template !== 'container').map(([id, config]) => {
    const value = dashboard.values[config.source ?? id], cardId = id.split(':')[1], title = config.title ?? id, tone = config.tone ?? 'slate'
    const kind = (config.kind ?? (['bar', 'line', 'area'].includes(config.template ?? '') ? config.template : 'table')) as DashboardCardKind
    const markdown = dashboardWidgetMarkdown(config, value)
    const body = <DashboardMarkdown text={markdown} label={`${title} Markdown`} />
    const series = value?.rows?.flatMap(row => typeof row[1] === 'number' && Number.isFinite(row[1]) ? [{ label: dashboardValueText(row[0]), value: row[1] }] : []) ?? []
    return { id, cardId, content: <DashboardWidgetFlip widgetId={id} template={(config.template ?? 'table') as DashboardTemplate} title={title} defaults={config}>
      {config.template === 'metric'
        ? <DashboardMetricTile metric={{ id: cardId, label: title, value: dashboardValueText(value?.value), detail: config.subtitle ?? '', tone }} />
        : <DashboardCardView card={{ id: cardId, title, subtitle: config.subtitle ?? '', tone, kind, rows: [], series }}>
          {kind !== 'table' && series.length ? undefined : config.template === 'disclosure' ? <DashboardWidgetDisclosure id={id} title={title}>{body}</DashboardWidgetDisclosure> : body}
        </DashboardCardView>}
    </DashboardWidgetFlip> }
  })
  const placed = new Set(Object.values(document.boards ?? {}).flat(2))
  return <section aria-label="Saved Markdown dashboard" className="min-w-0 space-y-4" data-dashboard-document={sourcePath}>
    <header><h2 className="text-lg font-semibold">{dashboard.template.id}</h2>
      <p className="text-sm">{dashboard.source.sourceId} · Revision {dashboard.source.sequence} · {dashboard.source.complete ? 'Complete' : 'Partial'} coverage</p>
      <p className="text-xs">Historical snapshot · {new Date(dashboard.source.observedAt).toISOString()}</p>
    </header>
    {error && <p role="alert">{error}</p>}
    {Object.entries(document.boards ?? {}).map(([id, rows]) => <DashboardWidgetBoard key={id} id={id} items={items.filter(item => rows.flat().includes(item.id) && !contained.has(item.id))} />)}
    <DashboardWidgetBoard id="snapshot-other" items={items.filter(item => !placed.has(item.id) && !contained.has(item.id))} />
    {containers.map(([id, config]) => <DashboardWidgetContainer key={id} id={id.split(':')[1]} widgetId={id} title={config.title ?? id} subtitle={config.subtitle} columns={config.columns ?? 2}
      items={(config.children ?? []).flatMap(child => items.find(item => item.id === child) ?? [])} />)}
  </section>
}
