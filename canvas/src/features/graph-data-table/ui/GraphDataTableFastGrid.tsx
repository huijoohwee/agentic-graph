import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphRecordColumnDoc, GraphRecordTableId } from '@/lib/graph-record-db'
import type { GraphDataTableGridRow } from '@/features/graph-data-table/ui/graphDataTableTypes'
import type { PanelTypography } from '@/lib/ui/panelTypography'
import type {
  GraphDataTableColumnVisibilityById,
  GraphDataTableColumnWidthsPxById,
  GraphDataTableFilterClause,
  GraphDataTableFilterMatch,
  GraphDataTableRowHeightPreset,
  GraphDataTableFilterOperator,
  GraphDataTableSortRule,
  GraphDataTableSortDirection,
} from '@/features/graph-data-table/ui/graphDataTableViewState'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { CanvasCellEditor, type CanvasCellEditorState } from '@/features/graph-data-table/ui/fast-grid/CanvasCellEditor'
import { clamp, getVisibleColumnsRange, getVisibleRange } from '@/features/graph-data-table/ui/fast-grid/fastGridMath'
import { drawGrid, getCellText, getCellTextByKind, hitTest, readGridTheme, type GridTheme } from '@/features/graph-data-table/ui/fast-grid/canvasGridRender'
import { useGraphDataTableGridModel } from '@/features/graph-data-table/ui/fast-grid/useGraphDataTableGridModel'
import { DateCellEditor, type DateCellEditorState } from '@/features/graph-data-table/ui/fast-grid/DateCellEditor'
import { GraphDataTableFastGridHeader } from '@/features/graph-data-table/ui/GraphDataTableFastGridHeader'
import { GRAPH_DATA_TABLE_GRID_SPACER_STYLE } from '@/features/graph-data-table/ui/graphDataTableResponsiveMetrics'
import { UI_RESPONSIVE_PASSIVE_BASE_LAYER_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { readDataViewHeaderPixelHeight, readDataViewRowPixelHeight } from '@/lib/ui/dataViewDensity'

export type GraphDataTableFastGridProps = {
  tableId: GraphRecordTableId
  columns: GraphRecordColumnDoc[]
  rows: GraphDataTableGridRow[]
  selectedRowIds: string[]
  focusRowId?: string | null
  autoScrollToFocusRow?: boolean
  columnVisibilityById: GraphDataTableColumnVisibilityById
  filterMatch: GraphDataTableFilterMatch
  filterClauses: GraphDataTableFilterClause[]
  groupBy: string
  sortRules: GraphDataTableSortRule[]
  rowHeightPreset: GraphDataTableRowHeightPreset
  columnWidthsPxById: GraphDataTableColumnWidthsPxById
  columnOrderIds?: string[]
  onColumnWidthChanged: (columnId: string, widthPx: number) => void
  onRequestReorderColumn: (fromColumnId: string, toColumnId: string, side: 'left' | 'right') => void
  onRowClicked: (rowId: string) => void
  onSelectionChanged: (selectedRowIds: string[]) => void
  onCellValueChanged: (rowId: string, columnId: string, next: unknown) => void
  onColumnKindChanged?: (columnId: string, nextKind: GraphRecordColumnDoc['kind']) => void
  onHideColumnInView?: (columnId: string) => void
  onUpsertColumnFilter?: (args: { columnId: string; operator: GraphDataTableFilterOperator; value: string }) => void
  onSetSingleColumnSort?: (args: { columnId: string; direction: GraphDataTableSortDirection }) => void
  panelTypography?: PanelTypography
}

export function GraphDataTableFastGrid(props: GraphDataTableFastGridProps) {
  const rafRef = useRef<number | null>(null)
  const scrollRef = useRef({ left: 0, top: 0 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLElement | null>(null)
  const [viewportClientHeight, setViewportClientHeight] = useState(0)
  const headerScrollableContentRef = useRef<HTMLElement | null>(null)
  const headerRafRef = useRef<number | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const [viewportClientWidth, setViewportClientWidth] = useState(0)
  const [editor, setEditor] = useState<(CanvasCellEditorState & { kind: 'text' }) | (DateCellEditorState & { kind: 'date' }) | null>(null)
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const selectedColumnIdRef = useRef<string | null>(null)
  const reorderFromRef = useRef<string | null>(null)
  const reorderHintRef = useRef<{ columnId: string; side: 'left' | 'right' } | null>(null)
  const spacerRef = useRef<HTMLElement | null>(null)
  const spacerRafRef = useRef<number | null>(null)
  const themeRef = useRef<GridTheme | null>(null)

  const [overlayTick, setOverlayTick] = useState(0)
  const overlayRafRef = useRef<number | null>(null)
  const bumpOverlayTick = React.useCallback(() => {
    if (!editor) return
    if (overlayRafRef.current != null) return
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = null
      setOverlayTick(v => v + 1)
    })
  }, [editor])

  const [gridOverlayTick, setGridOverlayTick] = useState(0)
  const gridOverlayRafRef = useRef<number | null>(null)
  const bumpGridOverlayTick = React.useCallback(() => {
    if (gridOverlayRafRef.current != null) return
    gridOverlayRafRef.current = window.requestAnimationFrame(() => {
      gridOverlayRafRef.current = null
      setGridOverlayTick(v => v + 1)
    })
  }, [])

  const rowHeight = readDataViewRowPixelHeight(props.rowHeightPreset)
  const headerHeight = readDataViewHeaderPixelHeight(props.rowHeightPreset)

  const model = useGraphDataTableGridModel({
    columns: props.columns,
    rows: props.rows,
    columnVisibilityById: props.columnVisibilityById,
    filterMatch: props.filterMatch,
    filterClauses: props.filterClauses,
    groupBy: props.groupBy,
    sortRules: props.sortRules,
    columnWidthsPxById: props.columnWidthsPxById,
    columnOrderIds: props.columnOrderIds,
    headerHeight,
    rowHeight,
    selectedRowIds: props.selectedRowIds,
  })

  const modelRef = useRef(model)
  modelRef.current = model
  const rowHeightRef = useRef(rowHeight)
  rowHeightRef.current = rowHeight
  const headerHeightRef = useRef(headerHeight)
  headerHeightRef.current = headerHeight

  const syncHeaderScroll = React.useCallback((scrollLeft: number) => {
    if (headerRafRef.current != null) cancelAnimationFrame(headerRafRef.current)
    headerRafRef.current = requestAnimationFrame(() => {
      headerRafRef.current = null
      const el = headerScrollableContentRef.current
      if (!el) return
      el.style.transform = `translateX(${-scrollLeft}px)`
    })
  }, [])

  const syncScrollSpacer = React.useCallback(() => {
    if (spacerRafRef.current != null) cancelAnimationFrame(spacerRafRef.current)
    spacerRafRef.current = requestAnimationFrame(() => {
      spacerRafRef.current = null
      const viewportEl = viewportRef.current
      const spacerEl = spacerRef.current
      if (!viewportEl || !spacerEl) return
      const m = modelRef.current
      const viewportW = Math.max(1, viewportEl.clientWidth)
      const viewportH = Math.max(1, viewportEl.clientHeight)
      setViewportClientWidth(prev => (prev === viewportW ? prev : viewportW))
      setViewportClientHeight(prev => (prev === viewportH ? prev : viewportH))
      const targetW = Math.max(viewportW, Math.floor(m.layout.totalWidth))
      const targetH = Math.max(viewportH, Math.floor(m.layout.totalHeight))
      const nextW = `${targetW}px`
      const nextH = `${targetH}px`
      if (spacerEl.style.width !== nextW) spacerEl.style.width = nextW
      if (spacerEl.style.height !== nextH) spacerEl.style.height = nextH
    })
  }, [])

  const scheduleDraw = React.useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const canvas = canvasRef.current
      const viewportEl = viewportRef.current
      if (!canvas || !viewportEl) return
      const m = modelRef.current
      if (!themeRef.current) themeRef.current = readGridTheme(viewportEl)

      scrollRef.current = { left: viewportEl.scrollLeft, top: viewportEl.scrollTop }
      drawGrid({
        canvas,
        viewportEl,
        scrollLeft: scrollRef.current.left,
        scrollTop: scrollRef.current.top,
        rowHeight: rowHeightRef.current,
        headerHeight: headerHeightRef.current,
        layout: m.layout,
        displayRows: m.displayRows,
        selectedSet: m.selectedSet,
        allSelected: m.allSelected,
        someSelected: m.someSelected,
        sortIndexByColumnId: m.sortIndexByColumnId,
        isGroupCollapsed: label => m.collapseSetRef.current.has(label),
        reorderHint: reorderFromRef.current ? reorderHintRef.current : null,
        selectedColumnId: selectedColumnIdRef.current,
        theme: themeRef.current,
      })
    })
  }, [])

  const domOverlayCells = useMemo(() => {
    void gridOverlayTick
    const w = viewportClientWidth
    const h = viewportClientHeight
    if (w <= 0 || h <= 0) return [] as Array<
      | { kind: 'cell'; key: string; left: number; top: number; width: number; height: number; text: string; tone?: 'primary' | 'secondary' }
      | { kind: 'group'; key: string; left: number; top: number; width: number; height: number; text: string }
    >

    const m = model
    const scrollLeft = scrollRef.current.left
    const scrollTop = scrollRef.current.top

    const colRange = getVisibleColumnsRange({
      offsets: m.layout.scrollableOffsets,
      startPx: scrollLeft,
      viewportPx: Math.max(0, w - m.layout.pinnedWidth),
      overscan: 1,
    })
    const rowRange = getVisibleRange({
      startPx: scrollTop,
      viewportPx: Math.max(0, h - headerHeight),
      itemSizePx: rowHeight,
      itemCount: m.displayRows.length,
      overscan: 3,
    })

    const out: Array<
      | { kind: 'cell'; key: string; left: number; top: number; width: number; height: number; text: string; tone?: 'primary' | 'secondary' }
      | { kind: 'group'; key: string; left: number; top: number; width: number; height: number; text: string }
    > = []

    for (let r = rowRange.start; r < rowRange.end; r += 1) {
      const item = m.displayRows[r]
      if (!item) continue
      const y = headerHeight + r * rowHeight - scrollTop
      if (y + rowHeight < headerHeight || y > h) continue
      if (item.kind === 'group') {
        const left = m.layout.pinnedWidth - scrollLeft
        out.push({
          kind: 'group',
          key: `g:${r}:${item.label}`,
          left,
          top: y,
          width: Math.max(80, m.layout.totalWidth - m.layout.pinnedWidth),
          height: rowHeight,
          text: `${item.label} (${item.count})`,
        })
        continue
      }

      let pinnedX = 0
      for (const col of m.layout.pinned) {
        const x = pinnedX
        const cellW = col.width
        if (col.kind === 'order') {
          const text = String((item.row as any).__order ?? '')
          if (text) {
            out.push({
              kind: 'cell',
              key: `p:${r}:${col.id}`,
              left: x,
              top: y,
              width: cellW,
              height: rowHeight,
              text,
              tone: 'secondary',
            })
          }
        }
        pinnedX += cellW
      }

      for (let c = colRange.start; c < colRange.end; c += 1) {
        const col = m.layout.scrollable[c]
        if (!col) continue
        const colX = m.layout.scrollableOffsets[c] || 0
        const x = m.layout.pinnedWidth + colX - scrollLeft
        const raw = (item.row as unknown as Record<string, unknown>)[col.id]
        const text = getCellTextByKind(raw, col.dataKind)
        if (!text) continue
        out.push({
          kind: 'cell',
          key: `c:${r}:${col.id}`,
          left: x,
          top: y,
          width: col.width,
          height: rowHeight,
          text,
          tone: 'primary',
        })
      }
    }
    return out
  }, [gridOverlayTick, headerHeight, model, overlayTick, rowHeight, viewportClientHeight, viewportClientWidth])

  const computedEditorRect = useMemo(() => {
    void overlayTick
    if (!editor) return null
    const rowId = editor.rowId
    const columnId = editor.columnId
    const rowIndex = model.rowIndexById.get(rowId)
    if (rowIndex == null) return null
    const colIndex = model.layout.scrollable.findIndex(c => c.id === columnId)
    if (colIndex < 0) return null
    const col = model.layout.scrollable[colIndex]
    if (!col) return null
    const x = model.layout.pinnedWidth + (model.layout.scrollableOffsets[colIndex] || 0) - scrollRef.current.left
    const y = headerHeight + rowIndex * rowHeight - scrollRef.current.top
    return { x, y, w: col.width, h: rowHeight }
  }, [editor, headerHeight, model.layout.pinnedWidth, model.layout.scrollable, model.layout.scrollableOffsets, model.rowIndexById, overlayTick, rowHeight])

  useEffect(() => {
    if (!editor) return
    if (computedEditorRect) return
    setEditor(null)
  }, [computedEditorRect, editor])

  useEffect(() => {
    selectedColumnIdRef.current = selectedColumnId
    scheduleDraw()
  }, [scheduleDraw, selectedColumnId])

  useEffect(() => {
    return () => {
      if (headerRafRef.current != null) cancelAnimationFrame(headerRafRef.current)
      headerRafRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewportEl = viewportRef.current
    if (!viewportEl) return
    const ro = new ResizeObserver(() => {
      themeRef.current = readGridTheme(viewportEl)
      syncScrollSpacer()
      scheduleDraw()
      bumpOverlayTick()
      bumpGridOverlayTick()
    })
    ro.observe(viewportEl)
    themeRef.current = readGridTheme(viewportEl)
    syncScrollSpacer()
    return () => ro.disconnect()
  }, [bumpOverlayTick, scheduleDraw, syncScrollSpacer])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
    const root = document.documentElement
    const mo = new MutationObserver(() => {
      const viewportEl = viewportRef.current
      if (viewportEl) themeRef.current = readGridTheme(viewportEl)
      scheduleDraw()
      bumpOverlayTick()
      bumpGridOverlayTick()
    })
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    return () => mo.disconnect()
  }, [bumpGridOverlayTick, bumpOverlayTick, scheduleDraw])

  useEffect(() => {
    scheduleDraw()
  }, [
    model.columns,
    model.displayRows,
    model.layout.totalHeight,
    model.layout.totalWidth,
    props.selectedRowIds,
    props.rowHeightPreset,
    model.sortIndexByColumnId,
    scheduleDraw,
  ])

  useEffect(() => {
    syncScrollSpacer()
  }, [model.layout.totalHeight, model.layout.totalWidth, syncScrollSpacer])

  useEffect(() => {
    if (!props.autoScrollToFocusRow) return
    const id = typeof props.focusRowId === 'string' ? props.focusRowId : ''
    if (!id) return
    const viewportEl = viewportRef.current
    if (!viewportEl) return
    const m = modelRef.current
    m.ensureGroupExpandedForRow(id)
    const idx = m.rowIndexById.get(id)
    if (idx == null) return
    const viewportH = Math.max(1, viewportEl.clientHeight - headerHeightRef.current)
    const targetTop = idx * rowHeightRef.current
    const next = clamp(
      targetTop - Math.floor(viewportH / 2),
      0,
      Math.max(0, m.displayRows.length * rowHeightRef.current - viewportH),
    )
    try {
      if (Math.abs(viewportEl.scrollTop - next) <= 1) return
      viewportEl.scrollTop = next
      scrollRef.current = { left: viewportEl.scrollLeft, top: viewportEl.scrollTop }
      scheduleDraw()
    } catch {
      void 0
    }
  }, [props.autoScrollToFocusRow, props.focusRowId, scheduleDraw])

  return (
    <section
      className={`relative flex-1 min-h-0 overflow-hidden ${UI_THEME_TOKENS.table.rowBg}`}
      aria-label={`${props.tableId} fast grid`}
    >
      <canvas
        ref={canvasRef}
        className={UI_RESPONSIVE_PASSIVE_BASE_LAYER_SURFACE_CLASSNAME}
        aria-label="Grid canvas"
      />
      <GraphDataTableFastGridHeader
        headerHeight={headerHeight}
        viewportClientWidth={viewportClientWidth}
        panelTextClass={props.panelTypography?.panelTextClass || ''}
        model={model}
        viewportRef={viewportRef}
        headerScrollableContentRef={headerScrollableContentRef}
        selectAllRef={selectAllRef}
        scrollRef={scrollRef}
        reorderFromRef={reorderFromRef}
        reorderHintRef={reorderHintRef}
        selectedColumnIdRef={selectedColumnIdRef}
        setSelectedColumnId={setSelectedColumnId}
        syncHeaderScroll={syncHeaderScroll}
        scheduleDraw={scheduleDraw}
        onSelectionChanged={props.onSelectionChanged}
        onRequestReorderColumn={props.onRequestReorderColumn}
        onColumnWidthChanged={props.onColumnWidthChanged}
        onColumnKindChanged={props.onColumnKindChanged}
        onHideColumnInView={props.onHideColumnInView}
        onUpsertColumnFilter={props.onUpsertColumnFilter}
        onSetSingleColumnSort={props.onSetSingleColumnSort}
      />
      <section
        ref={el => {
          viewportRef.current = el
        }}
        className={`absolute inset-0 z-0 overflow-auto bg-transparent overscroll-contain ${props.panelTypography?.panelTextClass || ''} ${UI_THEME_TOKENS.text.primary}`}
        aria-label="Grid viewport"
        style={{ scrollbarGutter: 'stable' }}
        onWheelCapture={e => e.stopPropagation()}
        onScroll={e => {
          const el = e.currentTarget
          scrollRef.current = { left: el.scrollLeft, top: el.scrollTop }
          syncHeaderScroll(el.scrollLeft)
          scheduleDraw()
          bumpOverlayTick()
          bumpGridOverlayTick()
        }}
        onPointerMove={e => {
          const el = e.currentTarget
          const canvas = canvasRef.current
          if (!canvas) return
          const hit = hitTest({
            clientX: e.clientX,
            clientY: e.clientY,
            viewportEl: el,
            scrollLeft: scrollRef.current.left,
            scrollTop: scrollRef.current.top,
            rowHeight,
            headerHeight,
            layout: model.layout,
            displayRows: model.displayRows,
          })
          if (!hit || !hit.inHeader || hit.col?.kind !== 'data' || hit.scrollableColIndex < 0) {
            el.style.cursor = 'default'
            return
          }
          const colX =
            model.layout.pinnedWidth + (model.layout.scrollableOffsets[hit.scrollableColIndex] || 0) - scrollRef.current.left
          const nearRight = hit.x >= colX + hit.col.width - 6 && hit.x <= colX + hit.col.width + 2
          el.style.cursor = nearRight ? 'col-resize' : 'default'
        }}
        onDoubleClick={e => {
          const el = e.currentTarget
          const hit = hitTest({
            clientX: e.clientX,
            clientY: e.clientY,
            viewportEl: el,
            scrollLeft: scrollRef.current.left,
            scrollTop: scrollRef.current.top,
            rowHeight,
            headerHeight,
            layout: model.layout,
            displayRows: model.displayRows,
          })
          if (!hit || hit.inHeader) return
          if (!hit.rowItem || hit.rowItem.kind !== 'row') return
          if (!hit.col || hit.col.kind !== 'data' || !hit.col.editable) return
          if (hit.scrollableColIndex < 0) return
          const rowId = hit.rowItem.row.id
          const columnId = hit.col.id
          const raw = (hit.rowItem.row as unknown as Record<string, unknown>)[columnId]
          const value = getCellText(raw)
          const x =
            model.layout.pinnedWidth + (model.layout.scrollableOffsets[hit.scrollableColIndex] || 0) - scrollRef.current.left
          const y = headerHeight + hit.rowIndex * rowHeight - scrollRef.current.top
          const kind = props.columns.find(c => c.columnId === columnId)?.kind
          if (kind === 'date') {
            setEditor({ kind: 'date', rowId, columnId, initialValue: raw, rect: { x, y, w: hit.col.width, h: rowHeight } })
            return
          }
          setEditor({ kind: 'text', rowId, columnId, value, rect: { x, y, w: hit.col.width, h: rowHeight } })
        }}
        onPointerDown={e => {
          e.stopPropagation()
          const el = e.currentTarget
          const hit = hitTest({
            clientX: e.clientX,
            clientY: e.clientY,
            viewportEl: el,
            scrollLeft: scrollRef.current.left,
            scrollTop: scrollRef.current.top,
            rowHeight,
            headerHeight,
            layout: model.layout,
            displayRows: model.displayRows,
          })
          if (!hit) return
          if (editor) setEditor(null)

          if (!hit.rowItem) return
          if (hit.rowItem.kind === 'group') {
            model.toggleGroupCollapsed(hit.rowItem.label)
            return
          }

          const rowId = hit.rowItem.row.id
          if (hit.col?.kind === 'select') {
            const next = new Set(props.selectedRowIds)
            if (next.has(rowId)) next.delete(rowId)
            else next.add(rowId)
            props.onSelectionChanged(Array.from(next.values()))
            return
          }
          props.onRowClicked(rowId)
        }}
      >
        <section
          className="w-full h-full pointer-events-none"
          aria-hidden="true"
          ref={el => {
            spacerRef.current = el
          }}
          style={GRAPH_DATA_TABLE_GRID_SPACER_STYLE}
        />
      </section>

      <section className={`absolute inset-0 z-20 pointer-events-none ${UI_THEME_TOKENS.text.primary}`} aria-hidden="true">
        {model.layout.scrollable.length <= 0 && props.columns.length > 0 ? (
          <section className="absolute inset-0 flex items-center justify-center">
            <section className="rounded border px-3 py-2 bg-[var(--kg-panel-bg)] text-[color:var(--kg-text-secondary)] text-xs shadow-none">
              All columns hidden
            </section>
          </section>
        ) : null}
        {domOverlayCells.map(it => {
          if (it.kind === 'group') {
            return (
              <section
                key={it.key}
                style={{ left: it.left, top: it.top, width: it.width, height: it.height, position: 'absolute' }}
                className={`${UI_THEME_TOKENS.text.secondary} font-semibold px-2 flex items-center`}
              >
                <span className="truncate">{it.text}</span>
              </section>
            )
          }
          const toneClass = it.tone === 'secondary' ? UI_THEME_TOKENS.text.secondary : UI_THEME_TOKENS.text.primary
          return (
            <section
              key={it.key}
              style={{ left: it.left, top: it.top, width: it.width, height: it.height, position: 'absolute' }}
              className={`px-2 flex items-center ${toneClass}`}
            >
              <span className="truncate">{it.text}</span>
            </section>
          )
        })}
      </section>
      {editor ? (
        editor.kind === 'date' ? (
          <DateCellEditor
            state={{ ...editor, rect: computedEditorRect || editor.rect }}
            onCancel={() => setEditor(null)}
            onCommit={value => {
              const current = editor
              setEditor(null)
              props.onCellValueChanged(current.rowId, current.columnId, value)
            }}
          />
        ) : (
          <CanvasCellEditor
            state={{ ...editor, rect: computedEditorRect || editor.rect }}
            onChange={value => setEditor(prev => (prev && prev.kind === 'text' ? { ...prev, value } : prev))}
            onCancel={() => setEditor(null)}
            onCommit={() => {
              const current = editor
              setEditor(null)
              if (current.kind !== 'text') return
              props.onCellValueChanged(current.rowId, current.columnId, current.value)
            }}
          />
        )
      ) : null}
    </section>
  )
}
