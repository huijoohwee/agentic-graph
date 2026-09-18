import React from 'react'
import { spanRows, SPAN_COLUMNS, type TraceSpan } from './missionControlProjection'
import type { WorkspaceDataViewSource } from '@/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer'
const MultiDimTable = React.lazy(() => import('@/features/markdown-workspace/main/viewer/MultiDimTableSurface').then(module => ({ default: module.MultiDimTableSurface })))

/** Feed the original table viewer with ephemeral span records, preserving source identities. */
export function AgentRunTable({ runId, spans, selectedId, onSelect }: {
  runId: string; spans: TraceSpan[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  const dataViewSource = React.useMemo<WorkspaceDataViewSource>(() => ({
    id: `agent-mission:spans:${runId}`, label: 'Span table', selectedRowId: selectedId, onActivateRow: onSelect,
    view: { columns: SPAN_COLUMNS.map((column, index) => ({ id: `col_${index}`, name: column.name, kind: 'text' })),
      rows: spanRows(spans).map(row => ({ id: row.id, cells: SPAN_COLUMNS.map(column => String(row[column.name as keyof typeof row] ?? '')) })),
      titleColumnId: 'col_1', groupByColumnId: null },
  }), [runId, spans, selectedId, onSelect])
  return <section className="h-[min(65vh,640px)] min-h-[240px] min-w-0" aria-label="Span table viewer">
    <React.Suspense fallback={<p role="status">Loading Multi-dimensional Table…</p>}>
      <MultiDimTable ariaLabel="Span Multi-dimensional Table" dataViewSource={dataViewSource} />
    </React.Suspense>
  </section>
}
