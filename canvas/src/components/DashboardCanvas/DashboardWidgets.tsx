import React from 'react'
import { useDashboardCardDrag } from './DashboardWidgetBoard'
import { WIDGET_SELECTION_SURFACE_CLASS_NAME } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME, buildResponsiveViewportFitGridStyle } from '@/lib/ui/responsiveViewportFitGrid'
import { buildKanbanCardDropIntentLabel } from '@/features/markdown/ui/kanban/kanbanDragIntent'
import { getKanbanCardDragVisualState } from '@/features/markdown/ui/kanban/kanbanDragVisualState'
import { KanbanCardDropPreview } from '@/features/markdown/ui/kanban/KanbanDropPreview'
import { isInteractiveEventTarget } from '@/features/markdown/ui/kanban/kanbanMenu'
import { areKanbanRowIdsEqual, moveKanbanRowIdBeforeTarget, reconcileKanbanRowIds } from '@/features/markdown/ui/kanban/kanbanOrderState'
import type { KanbanDropPosition } from '@/features/markdown/ui/kanban/kanbanReorder'
import type { KanbanCardDragProps, KanbanCardDropProps } from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME, UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { DashboardCard, DashboardMetric, DashboardTableRow } from './dashboardModel'
import { DashboardBarChart, DashboardLineAreaChart, TONE_COLORS } from './DashboardCharts'
export type DashboardCardTextField = 'title' | 'subtitle' | 'footnote'
const EMPTY_DASHBOARD_ROW: DashboardTableRow = { id: 'empty', label: 'No rows', value: '0' }
const noop = () => {}

export function DashboardMetricTile(input: {
  metric: DashboardMetric
  canEdit?: boolean
  cardDragProps?: KanbanCardDragProps
  cardDropProps?: KanbanCardDropProps
  draggingMetricId?: string | null
  dragOverMetricId?: string | null
  dragOverPosition?: KanbanDropPosition
  commitFlashMetricId?: string | null
  registerMetricElement?: (metricId: string, element: HTMLElement | null) => void
  onCommitMetricLabel?: (metricId: string, nextValue: string) => void
  onCommitMetricDetail?: (metricId: string, nextValue: string) => void
}) {
  const shared = useDashboardCardDrag(input.metric.id)
  const props = { canEdit: false, cardDragProps: { draggable: false } as KanbanCardDragProps, cardDropProps: {} as KanbanCardDropProps,
    draggingMetricId: null, dragOverMetricId: null, commitFlashMetricId: null, dragOverPosition: 'before' as KanbanDropPosition,
    registerMetricElement: noop, onCommitMetricLabel: noop, onCommitMetricDetail: noop,
    ...(shared ? { cardDragProps: shared.cardDragProps, cardDropProps: shared.cardDropProps, draggingMetricId: shared.dragging, dragOverMetricId: shared.over, dragOverPosition: shared.position, commitFlashMetricId: shared.flash, registerMetricElement: shared.register } : {}), ...input }
  const { cardDragProps, cardDropProps, dragOverMetricId, dragOverPosition, draggingMetricId, metric } = props
  const colors = TONE_COLORS[metric.tone]
  const dragging = draggingMetricId === metric.id
  const dropTarget = dragOverMetricId === metric.id
  const metricDragVisualState = getKanbanCardDragVisualState({
    hasActiveDrag: draggingMetricId !== null,
    isDragging: dragging,
    isDropTarget: dropTarget,
    isCommitFlash: props.commitFlashMetricId === metric.id,
  })
  return (
    <section
      className={[
        'relative min-h-[78px] min-w-0 rounded-md border px-3 py-2 shadow-sm transition-transform duration-150',
        colors.chip,
        WIDGET_SELECTION_SURFACE_CLASS_NAME,
        metricDragVisualState.className,
      ].join(' ')}
      style={metricDragVisualState.style}
      data-kg-dashboard-metric={metric.id}
      data-kg-dashboard-metric-draggable={cardDragProps.draggable ? '1' : undefined}
      ref={element => props.registerMetricElement(metric.id, element)}
      role="group"
      tabIndex={0}
      aria-label={`Dashboard metric ${metric.label}`}
      aria-grabbed={cardDragProps.draggable ? dragging : undefined}
      {...cardDropProps}
      draggable={cardDragProps.draggable}
      onDragStart={cardDragProps.onDragStart}
      onDragEnd={cardDragProps.onDragEnd}
    >
      {dropTarget ? (
        <KanbanCardDropPreview
          position={dragOverPosition}
          label={buildKanbanCardDropIntentLabel({
            position: dragOverPosition,
            targetCardLabel: metric.label,
            targetLaneLabel: 'Dashboard metrics',
          })}
        />
      ) : null}
      <section className="flex h-full min-h-0 flex-col overflow-y-auto pr-1" data-kg-dashboard-metric-scrollable="1">
        <section className="min-w-0 cursor-grab select-none active:cursor-grabbing" data-kg-dashboard-metric-drag-region="1">
          <CardInlineTextEditor
            value={metric.label}
            ariaLabel={`Dashboard metric label for ${metric.id}`}
            placeholder="Add metric label"
            canEdit={props.canEdit}
            onCommit={nextValue => props.onCommitMetricLabel(metric.id, nextValue)}
            displayClassName="m-0 truncate text-[11px] font-medium"
            editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-[11px] font-medium leading-5`}
          />
        </section>
        <p className="m-0 mt-1 truncate text-xl font-semibold leading-tight">{metric.value}</p>
        <CardInlineTextEditor
          value={metric.detail}
          ariaLabel={`Dashboard metric detail for ${metric.id}`}
          placeholder="Add metric detail"
          canEdit={props.canEdit}
          onCommit={nextValue => props.onCommitMetricDetail(metric.id, nextValue)}
          displayClassName="m-0 mt-1 truncate text-[11px] opacity-80"
          editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} mt-1 text-[11px] leading-5`}
        />
      </section>
    </section>
  )
}

function DashboardTableRows(props: {
  card: DashboardCard
  selectedNodeId: string
  canEditRows: boolean
  onSelectRow?: (rowId: string) => void
  onCommitRowLabel?: (rowId: string, nextValue: string) => void
}) {
  const baseRows = props.card.rows.length ? props.card.rows : [EMPTY_DASHBOARD_ROW]
  const rowIds = React.useMemo(() => baseRows.map(row => row.id), [baseRows])
  const rowIdsKey = rowIds.join('\u0000')
  const [rowOrder, setRowOrder] = React.useState<string[]>(() => reconcileKanbanRowIds([], rowIds))
  const [draggingRowId, setDraggingRowId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRowOrder(current => {
      const next = reconcileKanbanRowIds(current, rowIds)
      return areKanbanRowIdsEqual(current, next) ? current : next
    })
  }, [rowIdsKey, rowIds])

  const rowById = React.useMemo(() => new Map(baseRows.map(row => [row.id, row])), [baseRows])
  const rows = React.useMemo(
    () => reconcileKanbanRowIds(rowOrder, rowIds).map(id => rowById.get(id)).filter(Boolean) as DashboardTableRow[],
    [rowById, rowIds, rowOrder],
  )

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto pr-1" data-kg-dashboard-card-scrollable="1">
      {rows.map(row => {
        const rowMovable = row.id !== EMPTY_DASHBOARD_ROW.id
        const selected = props.selectedNodeId === row.id
        const dragging = draggingRowId === row.id
        return (
        <section
          key={row.id}
          className={[
            'grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--kg-border)] px-2 py-2 last:border-b-0',
            rowMovable ? 'cursor-grab select-none active:cursor-grabbing' : '',
            selected ? 'rounded border-b-transparent bg-blue-50/80' : '',
            dragging ? 'opacity-45' : '',
          ].join(' ')}
          data-kg-dashboard-table-row={row.id}
          data-kg-dashboard-row-selected={selected ? 'true' : undefined}
          data-kg-dashboard-table-row-draggable={rowMovable ? '1' : undefined}
          draggable={rowMovable}
          aria-grabbed={rowMovable ? dragging : undefined}
          onClick={event => {
            if (!rowMovable || isInteractiveEventTarget(event.target)) return
            props.onSelectRow?.(row.id)
          }}
          onDragStart={event => {
            if (!rowMovable) return
            event.stopPropagation()
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', row.id)
            setDraggingRowId(row.id)
          }}
          onDragOver={event => {
            if (!draggingRowId || draggingRowId === row.id) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={event => {
            if (!draggingRowId || draggingRowId === row.id) return
            event.preventDefault()
            event.stopPropagation()
            setRowOrder(current => {
              const currentOrder = reconcileKanbanRowIds(current, rowIds)
              const next = moveKanbanRowIdBeforeTarget(currentOrder, draggingRowId, row.id)
              return areKanbanRowIdsEqual(currentOrder, next) ? current : next
            })
            setDraggingRowId(null)
          }}
          onDragEnd={event => {
            event.stopPropagation()
            setDraggingRowId(null)
          }}
        >
          <section className="min-w-0">
            <CardInlineTextEditor
              value={row.label}
              ariaLabel={`Dashboard row label for ${row.id}`}
              placeholder="Add label"
              canEdit={props.canEditRows && rowMovable}
              onCommit={nextValue => props.onCommitRowLabel?.(row.id, nextValue)}
              displayClassName="m-0 truncate text-xs font-medium text-[var(--kg-text-primary)]"
              editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-xs font-medium leading-5`}
            />
            {row.detail ? <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--kg-text-tertiary)]" title={row.detail}>{row.detail}</p> : null}
          </section>
          <span className="shrink-0 text-sm font-semibold text-[var(--kg-text-primary)]">{row.value}</span>
        </section>
        )
      })}
    </section>
  )
}

export function DashboardCardView(input: {
  sectionLabel?: string
  card: DashboardCard
  gridEnabled?: boolean
  selectedNodeId?: string
  canEditRows?: boolean
  canEditCardText?: boolean
  cardDragProps?: KanbanCardDragProps
  cardDropProps?: KanbanCardDropProps
  draggingCardId?: string | null
  dragOverCardId?: string | null
  dragOverPosition?: KanbanDropPosition
  commitFlashCardId?: string | null
  registerCardElement?: (cardId: string, element: HTMLElement | null) => void
  onSelectRow?: (rowId: string) => void
  onCommitRowLabel?: (rowId: string, nextValue: string) => void
  onCommitCardText?: (cardId: string, field: DashboardCardTextField, nextValue: string) => void
  children?: React.ReactNode
}) {
  const shared = useDashboardCardDrag(input.card.id)
  const props = { canEditRows: false, canEditCardText: false, gridEnabled: false, selectedNodeId: '', sectionLabel: 'Dashboard',
    cardDragProps: { draggable: false } as KanbanCardDragProps, cardDropProps: {} as KanbanCardDropProps,
    draggingCardId: null, dragOverCardId: null, commitFlashCardId: null,
    dragOverPosition: 'before' as KanbanDropPosition, registerCardElement: noop,
    ...(shared ? { cardDragProps: shared.cardDragProps, cardDropProps: shared.cardDropProps, draggingCardId: shared.dragging, dragOverCardId: shared.over, dragOverPosition: shared.position, commitFlashCardId: shared.flash, registerCardElement: shared.register } : {}), ...input }
  const { card, cardDragProps, cardDropProps, dragOverCardId, dragOverPosition, draggingCardId, gridEnabled } = props
  const dragging = draggingCardId === card.id
  const dropTarget = dragOverCardId === card.id
  const cardInlineMediaCommandContext = React.useMemo(() => buildInlineMediaCommandContextFromRecord(card), [card])
  const cardDragVisualState = getKanbanCardDragVisualState({
    hasActiveDrag: draggingCardId !== null,
    isDragging: dragging,
    isDropTarget: dropTarget,
    isCommitFlash: props.commitFlashCardId === card.id,
  })
  return (
    <article
      className={[
        `relative min-w-0 rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-4 shadow-sm`,
        'transition-transform duration-150',
        WIDGET_SELECTION_SURFACE_CLASS_NAME,
        cardDragVisualState.className,
      ].join(' ')}
      style={cardDragVisualState.style}
      ref={element => props.registerCardElement(card.id, element)}
      data-kg-dashboard-card={card.id}
      data-kg-dashboard-card-draggable={cardDragProps.draggable ? '1' : undefined}
      tabIndex={0}
      role="group"
      aria-label={`Dashboard card ${card.title}`}
      aria-grabbed={cardDragProps.draggable ? dragging : undefined}
      {...cardDropProps}
      draggable={cardDragProps.draggable}
      onDragStart={cardDragProps.onDragStart}
      onDragEnd={cardDragProps.onDragEnd}
    >
      {dropTarget ? (
        <KanbanCardDropPreview
          position={dragOverPosition}
          label={buildKanbanCardDropIntentLabel({
            position: dragOverPosition,
            targetCardLabel: card.title,
            targetLaneLabel: props.sectionLabel,
          })}
        />
      ) : null}
      <header className="mb-3 min-w-0 cursor-grab select-none active:cursor-grabbing" data-kg-dashboard-card-drag-region="1">
        <section className="min-w-0" data-kg-dashboard-card-inline-edit="title">
          <CardInlineTextEditor
            value={card.title}
            ariaLabel={`Dashboard card title for ${card.id}`}
            placeholder="Add card title"
            canEdit={props.canEditCardText}
            onCommit={nextValue => props.onCommitCardText?.(card.id, 'title', nextValue)}
            displayClassName={`m-0 truncate text-sm font-semibold ${UI_THEME_TOKENS.text.primary}`}
            editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-sm font-semibold leading-5`}
          />
        </section>
        <section className="min-w-0" data-kg-dashboard-card-inline-edit="subtitle">
          <CardInlineTextEditor
            value={card.subtitle}
            ariaLabel={`Dashboard card subtitle for ${card.id}`}
            placeholder="Add card subtitle"
            canEdit={props.canEditCardText}
            onCommit={nextValue => props.onCommitCardText?.(card.id, 'subtitle', nextValue)}
            displayClassName={`m-0 mt-1 truncate text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}
            editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} mt-1 text-[11px] leading-5`}
          />
        </section>
      </header>
      <section className={props.children ? "min-w-0 overflow-auto" : "h-[178px] min-w-0 overflow-hidden"}>
        {props.children ?? (card.kind === 'table' ? (
          <DashboardTableRows
            card={card}
            selectedNodeId={props.selectedNodeId}
            canEditRows={props.canEditRows}
            onSelectRow={props.onSelectRow}
            onCommitRowLabel={props.onCommitRowLabel}
          />
        ) : card.kind === 'bar' ? (
          <DashboardBarChart series={card.series} tone={card.tone} gridEnabled={gridEnabled} />
        ) : (
          <DashboardLineAreaChart series={card.series} tone={card.tone} gridEnabled={gridEnabled} area={card.kind === 'area'} />
        ))}
      </section>
      {card.footnote || props.canEditCardText ? (
        <section
          className="mt-3 border-t border-[var(--kg-border)] pt-3"
          data-kg-dashboard-card-inline-edit="footnote"
        >
          <CardInlineTextEditor
            value={card.footnote || ''}
            ariaLabel={`Dashboard card footnote for ${card.id}`}
            placeholder="Add card note"
            canEdit={props.canEditCardText}
            multiline
            markdownPreview="auto"
            markdownCommandContextText={cardInlineMediaCommandContext}
            rows={3}
            onCommit={nextValue => props.onCommitCardText?.(card.id, 'footnote', nextValue)}
            displayClassName={`m-0 text-[11px] leading-5 ${UI_THEME_TOKENS.text.secondary}`}
            editorClassName={`${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-[11px] leading-5`}
          />
        </section>
      ) : null}
    </article>
  )
}


const metricGridStyle = buildResponsiveViewportFitGridStyle()
export function DashboardMetricGrid({ metrics }: { metrics: readonly DashboardMetric[] }) {
  return <div className={`${UI_RESPONSIVE_VIEWPORT_FIT_GRID_CLASSNAME} gap-3 py-3`} style={metricGridStyle}>
    {metrics.map(metric => <DashboardMetricTile key={metric.id} metric={metric} />)}
  </div>
}
