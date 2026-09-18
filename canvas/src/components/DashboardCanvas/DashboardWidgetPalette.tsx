import React from 'react'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import DashboardWidgetFlip, { type DashboardTemplate } from './DashboardWidgetFlip'
import type { DashboardCard } from './dashboardModel'

const templates: { kind: DashboardTemplate; title: string }[] = [
  { kind: 'metric', title: 'Metric' }, { kind: 'bar', title: 'Bar chart' },
  { kind: 'line', title: 'Line chart' }, { kind: 'area', title: 'Area chart' },
  { kind: 'table', title: 'Table' }, { kind: 'tree', title: 'Span tree' },
]

/** Unbound templates: real sources and instance settings appear only on the back. */
export default function DashboardWidgetPalette() {
  return <>{templates.map(({ kind, title }) => {
    const card: DashboardCard = { id: `template-${kind}`, title, subtitle: 'Click to configure',
      kind: kind === 'metric' || kind === 'tree' ? 'table' : kind, tone: 'slate',
      series: ['A', 'B', 'C'].map((label, index) => ({ label, value: [3, 6, 4][index] })),
      rows: ['A', 'B', 'C'].map(label => ({ id: label, label, value: '—' })) }
    return <li key={kind} aria-label={`Template ${title}`} className="min-w-0">
      <DashboardWidgetFlip template={kind} title={title}>
        {kind === 'metric' ? <DashboardMetricTile metric={{ id: 'template-metric', label: title, value: '—', detail: 'Click to configure', tone: 'slate' }} />
          : <DashboardCardView card={card}>{kind === 'tree' ? <p className="text-xs">Agent Mission · selected run</p> : undefined}</DashboardCardView>}
      </DashboardWidgetFlip>
    </li>
  })}</>
}
