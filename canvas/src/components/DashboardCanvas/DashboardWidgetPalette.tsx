import React from 'react'
import DashboardLayoutPanel from './DashboardLayoutPanel'
import { DashboardMarkdown } from './DashboardMarkdown'
import { WidgetPaletteCardLayoutPreview } from '@/features/toolbar/WidgetPaletteCardLayoutPreview'
import { DashboardCardView, DashboardMetricTile } from './DashboardWidgets'
import DashboardWidgetFlip, { type DashboardTemplate } from './DashboardWidgetFlip'
import type { DashboardCard } from './dashboardModel'

const templates: { kind: DashboardTemplate; title: string }[] = [
  { kind: 'metric', title: 'Metric' }, { kind: 'bar', title: 'Bar chart' },
  { kind: 'line', title: 'Line chart' }, { kind: 'area', title: 'Area chart' },
  { kind: 'table', title: 'Table' }, { kind: 'tree', title: 'Span tree' },
  { kind: 'codebase', title: 'Codebase Graph' },
  { kind: 'heading', title: 'Heading' }, { kind: 'text', title: 'Text' },
  { kind: 'disclosure', title: 'Expand / Collapse' }, { kind: 'divider', title: 'Divider' }, { kind: 'container', title: 'Container' },
]

/** Unbound templates: real sources and instance settings appear only on the back. */
export default function DashboardWidgetPalette() {
  return <><li className="min-w-0"><DashboardLayoutPanel /></li>{templates.map(({ kind, title }) => {
    const card: DashboardCard = { id: `template-${kind}`, title, subtitle: 'Select, then Flip to configure',
      kind: ['bar', 'line', 'area'].includes(kind) ? kind as 'bar' | 'line' | 'area' : 'table', tone: 'slate',
      series: ['A', 'B', 'C'].map((label, index) => ({ label, value: [3, 6, 4][index] })),
      rows: ['A', 'B', 'C'].map(label => ({ id: label, label, value: '—' })) }
    return <li key={kind} aria-label={`Template ${title}`} className="min-w-0">
      <DashboardWidgetFlip template={kind} title={title}>
        {kind === 'metric' ? <DashboardMetricTile metric={{ id: 'template-metric', label: title, value: '—', detail: 'Select, then Flip to configure', tone: 'slate' }} />
          : ['heading', 'text', 'divider', 'container', 'disclosure'].includes(kind) ? <DashboardCardView card={card}><DashboardMarkdown text={kind === 'heading' ? '## Heading' : kind === 'divider' ? '---' : kind === 'container' ? '**Row / columns**\n\nGroup reusable widgets.' : 'Write **Markdown** text, lists, and links.'} /></DashboardCardView>
          : kind === 'codebase' ? <WidgetPaletteCardLayoutPreview variant={{ id: 'dashboard-codebase', label: title, aspectRatio: '16:9', layoutKind: 'card-media' }} />
          : <DashboardCardView card={card}>{kind === 'tree' ? <p className="text-xs">Agent Mission · selected run</p> : undefined}</DashboardCardView>}
      </DashboardWidgetFlip>
    </li>
  })}</>
}
