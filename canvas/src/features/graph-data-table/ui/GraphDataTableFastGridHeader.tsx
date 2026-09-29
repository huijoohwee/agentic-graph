import React from 'react'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { createRafLatestScheduler } from '@/lib/react/rafLatestScheduler'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { clamp, binarySearchFloor } from '@/features/graph-data-table/ui/fast-grid/fastGridMath'
import { useGraphDataTableGridModel } from '@/features/graph-data-table/ui/fast-grid/useGraphDataTableGridModel'
import { ColumnHeaderPropertyTypeMenu } from '@/components/ui/ColumnHeaderPropertyTypeMenu'
import { GraphDataTableColumnKindMenu, labelForGraphRecordColumnKind } from '@/features/graph-data-table/ui/GraphDataTableColumnKindMenu'
import type { GraphRecordColumnKind } from '@/lib/graph-record-db'
import { ColumnHeaderMenu } from '@/components/ui/ColumnHeaderMenu'
import type { GraphDataTableFilterOperator, GraphDataTableSortDirection } from '@/features/graph-data-table/ui/graphDataTableViewState'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'

type GraphDataTableGridModel = ReturnType<typeof useGraphDataTableGridModel>

export function GraphDataTableFastGridHeader(props: {
  headerHeight: number
  viewportClientWidth: number
  panelTextClass: string
  model: GraphDataTableGridModel
  viewportRef: React.RefObject<HTMLElement>
  headerScrollableContentRef: React.MutableRefObject<HTMLElement | null>
  selectAllRef: React.RefObject<HTMLInputElement>
  scrollRef: React.MutableRefObject<{ left: number; top: number }>
  reorderFromRef: React.MutableRefObject<string | null>
  reorderHintRef: React.MutableRefObject<{ columnId: string; side: 'left' | 'right' } | null>
  selectedColumnIdRef: React.MutableRefObject<string | null>
  setSelectedColumnId: (next: string | null) => void
  syncHeaderScroll: (scrollLeft: number) => void
  scheduleDraw: () => void
  onSelectionChanged: (selectedRowIds: string[]) => void
  onRequestReorderColumn: (fromColumnId: string, toColumnId: string, side: 'left' | 'right') => void
  onColumnWidthChanged: (columnId: string, widthPx: number) => void
  onColumnKindChanged?: (columnId: string, nextKind: GraphRecordColumnKind) => void
  onHideColumnInView?: (columnId: string) => void
  onUpsertColumnFilter?: (args: { columnId: string; operator: GraphDataTableFilterOperator; value: string }) => void
  onSetSingleColumnSort?: (args: { columnId: string; direction: GraphDataTableSortDirection }) => void
}) {
  const resizeSchedulerRef = React.useRef(
    createRafLatestScheduler((next: { columnId: string; widthPx: number }) => {
      props.onColumnWidthChanged(next.columnId, next.widthPx)
    }),
  )

  const headerLayout = React.useMemo(() => {
    const pinned = props.model.layout.pinned
    const scrollable = props.model.layout.scrollable
    const pinnedWidth = props.model.layout.pinnedWidth
    const scrollableClipW = Math.max(0, props.viewportClientWidth - pinnedWidth)
    return { pinned, scrollable, pinnedWidth, scrollableClipW }
  }, [props.model.layout.pinned, props.model.layout.pinnedWidth, props.model.layout.scrollable, props.viewportClientWidth])

  React.useEffect(() => {
    const el = props.selectAllRef.current
    if (!el) return
    el.indeterminate = props.model.someSelected && !props.model.allSelected
  }, [props.model.allSelected, props.model.someSelected, props.selectAllRef])

  const startResize = React.useCallback(
    (columnId: string, startX: number, startWidth: number, ev: React.PointerEvent) => {
      let pending = startWidth
      const scheduler = resizeSchedulerRef.current
      startPointerDrag({
        ev: ev.nativeEvent,
        cursor: 'col-resize',
        shouldStart: down => {
          if (down.button !== undefined && down.button !== 0) return false
          return true
        },
        onMove: mv => {
          const dx = mv.clientX - startX
          pending = Math.max(80, Math.min(720, Math.round(startWidth + dx)))
          scheduler.schedule({ columnId, widthPx: pending })
        },
        onEnd: () => {
          scheduler.cancel()
          props.onColumnWidthChanged(columnId, pending)
        },
        onCancel: () => {
          scheduler.cancel()
          props.onColumnWidthChanged(columnId, pending)
        },
      })
    },
    [props.onColumnWidthChanged],
  )

  return (
    <section
      className={`absolute left-0 top-0 z-20 border-b pointer-events-none ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.headerBg}`}
      aria-label="Grid header"
      style={{ height: props.headerHeight, width: props.viewportClientWidth > 0 ? `${props.viewportClientWidth}px` : undefined }}
      onWheel={e => {
        const viewportEl = props.viewportRef.current
        if (!viewportEl) return
        try {
          if (e.deltaX) viewportEl.scrollLeft += e.deltaX
          if (e.deltaY) viewportEl.scrollTop += e.deltaY
          props.scrollRef.current = { left: viewportEl.scrollLeft, top: viewportEl.scrollTop }
          props.syncHeaderScroll(viewportEl.scrollLeft)
          props.scheduleDraw()
          e.preventDefault()
        } catch {
          void 0
        }
      }}
    >
      <section className={`h-full flex items-stretch ${props.panelTextClass} ${UI_THEME_TOKENS.table.text}`}>
        <section className="h-full flex items-stretch" style={{ width: headerLayout.pinnedWidth }} aria-label="Pinned columns">
          {headerLayout.pinned.map(col => {
            const selected = props.selectedColumnIdRef.current === col.id
            const bg = selected ? 'color-mix(in srgb, var(--kg-canvas-accent) 10%, transparent)' : 'transparent'
            if (col.kind === 'select') {
              return (
                <button
                  key={col.id}
                  type="button"
                  className={`h-full flex items-center justify-center leading-none border-r pointer-events-auto ${UI_THEME_TOKENS.table.cellBorder}`}
                  style={{ width: col.width, backgroundColor: bg }}
                  onClick={() => {
                    if (props.model.allSelected) props.onSelectionChanged([])
                    else props.onSelectionChanged(props.model.allVisibleRowIds)
                  }}
                >
                  <input
                    ref={props.selectAllRef}
                    type="checkbox"
                    checked={props.model.allSelected}
                    readOnly
                    aria-label={props.model.allSelected ? 'Deselect all rows' : 'Select all rows'}
                  />
                </button>
              )
            }
            return (
              <button
                key={col.id}
                type="button"
                className={`h-full min-w-0 overflow-hidden flex items-center leading-none px-2 border-r pointer-events-auto ${UI_THEME_TOKENS.table.cellBorder} ${UI_THEME_TOKENS.table.textSecondary} font-semibold`}
                style={{ width: col.width, backgroundColor: bg }}
                onClick={() => {
                  props.selectedColumnIdRef.current = col.id
                  props.setSelectedColumnId(col.id)
                  props.scheduleDraw()
                }}
              >
                <span className={UI_TEXT_TRUNCATE}>{col.title}</span>
              </button>
            )
          })}
        </section>

        <section className="h-full overflow-hidden" style={{ width: headerLayout.scrollableClipW }} aria-label="Scrollable columns">
          <section
            ref={el => {
              props.headerScrollableContentRef.current = el
            }}
            className="h-full flex items-stretch"
            style={{
              width: props.model.layout.totalWidth - headerLayout.pinnedWidth,
              transform: `translateX(${-props.scrollRef.current.left}px)`,
            }}
          >
            {headerLayout.scrollable.map((col, colIndex) => {
              const selected = props.selectedColumnIdRef.current === col.id
              const bg = selected ? 'color-mix(in srgb, var(--kg-canvas-accent) 10%, transparent)' : 'transparent'
              const sortMeta = props.model.sortIndexByColumnId[col.id]
              const kind = col.kind === 'data' ? (col.dataKind as GraphRecordColumnKind | undefined) : undefined
              const canMoveLeft = colIndex > 0
              const canMoveRight = colIndex < headerLayout.scrollable.length - 1
              return (
                <section
                  key={col.id}
                  className={`relative h-full flex items-center border-r ${UI_THEME_TOKENS.table.cellBorder}`}
                  style={{ width: col.width, backgroundColor: bg }}
                >
                  <ColumnHeaderPropertyTypeMenu
                    ariaLabel={`Property type: ${col.title}`}
                    label={col.title}
                    detailsClassName="relative w-full h-full pointer-events-auto"
                    summaryClassName={`list-none h-full w-full min-w-0 overflow-hidden leading-none px-2 flex items-center justify-between gap-2 cursor-pointer ${UI_THEME_TOKENS.table.textSecondary} font-semibold`}
                    menuClassName="absolute left-0 mt-2"
                    portal
                    portalPlacement="bottom-start"
                    toggleTargets="chevron"
                    rightContent={
                      sortMeta ? (
                        <span className={`${UI_THEME_TOKENS.text.tertiary} text-xs font-semibold`}>
                          {sortMeta.dir === 'desc' ? `↓${sortMeta.index}` : `↑${sortMeta.index}`}
                        </span>
                      ) : null
                    }
                    onSummaryPointerDown={e => {
                      const target = e.target as HTMLElement | null
                      if (target?.closest('[data-kg-menu-toggle]')) return
                      if (target?.closest('[data-kg-col-resize]')) return
                      if (e.button !== undefined && e.button !== 0) return
                      const fromColumnId = col.id
                      const startX = e.clientX
                      const startY = e.clientY
                      let didStartReorder = false

                      const details = (e.currentTarget as HTMLElement | null)?.closest('details') as HTMLDetailsElement | null
                      if (details?.open) details.open = false

                      props.selectedColumnIdRef.current = fromColumnId
                      props.setSelectedColumnId(fromColumnId)
                      props.scheduleDraw()

                      startPointerDrag({
                        ev: e.nativeEvent,
                        cursor: 'grabbing',
                        shouldStart: down => {
                          if (down.button !== undefined && down.button !== 0) return false
                          return true
                        },
                        onMove: mv => {
                          const dx = mv.clientX - startX
                          const dy = mv.clientY - startY
                          if (!didStartReorder) {
                            if (dx * dx + dy * dy < 25) return
                            didStartReorder = true
                            props.reorderFromRef.current = fromColumnId
                            props.reorderHintRef.current = null
                            props.scheduleDraw()
                          }

                          const viewportEl = props.viewportRef.current
                          if (!viewportEl) return
                          const clipW = Math.max(1, viewportEl.clientWidth - props.model.layout.pinnedWidth)
                          const clipRect = viewportEl.getBoundingClientRect()
                          const xInScrollable = mv.clientX - clipRect.left - props.model.layout.pinnedWidth + props.scrollRef.current.left
                          if (xInScrollable < 0 || xInScrollable > props.scrollRef.current.left + clipW + 8) {
                            if (props.reorderHintRef.current != null) {
                              props.reorderHintRef.current = null
                              props.scheduleDraw()
                            }
                            return
                          }

                          const idx = clamp(
                            binarySearchFloor(props.model.layout.scrollableOffsets, xInScrollable),
                            0,
                            Math.max(0, props.model.layout.scrollable.length - 1),
                          )
                          const targetCol = props.model.layout.scrollable[idx]
                          if (!targetCol) {
                            if (props.reorderHintRef.current != null) {
                              props.reorderHintRef.current = null
                              props.scheduleDraw()
                            }
                            return
                          }
                          const start = props.model.layout.scrollableOffsets[idx] || 0
                          const side: 'left' | 'right' = xInScrollable - start < targetCol.width / 2 ? 'left' : 'right'
                          const prev = props.reorderHintRef.current
                          if (!prev || prev.columnId !== targetCol.id || prev.side !== side) {
                            props.reorderHintRef.current = { columnId: targetCol.id, side }
                            props.scheduleDraw()
                          }
                        },
                        onEnd: () => {
                          const hint = props.reorderHintRef.current
                          props.reorderFromRef.current = null
                          props.reorderHintRef.current = null
                          props.scheduleDraw()
                          if (!didStartReorder) return
                          if (!hint) return
                          if (!fromColumnId || fromColumnId === hint.columnId) return
                          props.onRequestReorderColumn(fromColumnId, hint.columnId, hint.side)
                        },
                        onCancel: () => {
                          props.reorderFromRef.current = null
                          props.reorderHintRef.current = null
                          props.scheduleDraw()
                        },
                      })
                    }}
                    menu={({ close }) => (
                      <ColumnHeaderMenu
                        ariaLabel={`Column menu: ${col.title}`}
                        closeMenu={close}
                        typeSummaryLabel="Type"
                        typeValueLabel={kind ? labelForGraphRecordColumnKind(kind) : ''}
                        disableTypeChange={!kind || !props.onColumnKindChanged}
                        renderTypeMenu={() =>
                          kind && props.onColumnKindChanged ? (
                            <GraphDataTableColumnKindMenu
                              ariaLabel={`Property type for ${col.title}`}
                              value={kind}
                              close={close}
                              onSelect={(next) => props.onColumnKindChanged?.(col.id, next)}
                            />
                          ) : null
                        }
                        onHideInView={props.onHideColumnInView ? () => props.onHideColumnInView?.(col.id) : undefined}
                        filter={
                          props.onUpsertColumnFilter
                            ? {
                                ops: [
                                  { key: 'contains', label: 'contains' },
                                  { key: 'equals', label: 'equals' },
                                  { key: 'startsWith', label: 'startsWith' },
                                  { key: 'endsWith', label: 'endsWith' },
                                ],
                                defaultOp: 'contains',
                                onApply: ({ op, value }) =>
                                  props.onUpsertColumnFilter?.({ columnId: col.id, operator: op as GraphDataTableFilterOperator, value }),
                              }
                            : undefined
                        }
                        onSortAsc={
                          props.onSetSingleColumnSort
                            ? () => props.onSetSingleColumnSort?.({ columnId: col.id, direction: 'asc' })
                            : undefined
                        }
                        onSortDesc={
                          props.onSetSingleColumnSort
                            ? () => props.onSetSingleColumnSort?.({ columnId: col.id, direction: 'desc' })
                            : undefined
                        }
                        disableInsert
                        onMoveLeft={
                          canMoveLeft
                            ? () => {
                                const prev = headerLayout.scrollable[colIndex - 1]
                                if (!prev) return
                                props.onRequestReorderColumn(col.id, prev.id, 'left')
                              }
                            : undefined
                        }
                        onMoveRight={
                          canMoveRight
                            ? () => {
                                const next = headerLayout.scrollable[colIndex + 1]
                                if (!next) return
                                props.onRequestReorderColumn(col.id, next.id, 'right')
                              }
                            : undefined
                        }
                        disableMoveLeft={!canMoveLeft}
                        disableMoveRight={!canMoveRight}
                        disableDuplicate
                        disableDelete
                      />
                    )}
                  />
                  <section
                    data-kg-col-resize="true"
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize pointer-events-auto"
                    onPointerDown={e => {
                      e.stopPropagation()
                      if (e.button !== undefined && e.button !== 0) return
                      startResize(col.id, e.clientX, col.width, e)
                    }}
                    aria-hidden="true"
                  />
                </section>
              )
            })}
          </section>
        </section>
      </section>
    </section>
  )
}
