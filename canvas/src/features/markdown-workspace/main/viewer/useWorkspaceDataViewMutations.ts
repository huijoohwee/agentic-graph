import { upsertDataViewColumnFilter } from './workspaceDataViewFilterTree'
import React from 'react'
import type { DataViewCandidate } from './markdownWorkspaceDataViewCandidates'
import type { WorkspaceDataViewHeaderState } from './WorkspaceDataViewHeader'
import { duplicateWorkspaceDataViewConfigColumn, removeWorkspaceDataViewConfigColumn, type WorkspaceDataViewConfig, type WorkspaceDataViewFilterOp } from './workspaceDataViewConfig'
import { rowIdToMarkdownLineInTable } from './markdownDataViewSourceMap'
import {
  appendMarkdownDataViewRow,
  appendMarkdownDataViewColumn,
  deleteMarkdownDataViewColumn,
  duplicateMarkdownDataViewColumn,
  reorderMarkdownDataViewRows,
  renameMarkdownDataViewColumn,
  updateMarkdownDataViewCell,
  type MarkdownDataView,
  type MarkdownDataViewColumnKind,
} from '@/features/markdown/ui/markdownDataViewModel'
import { serializeMarkdownDataViewToTableLines } from '@/features/markdown/ui/markdownDataViewSerialize'
import {
  columnTypeToBaseKind,
  defaultColumnTypeForInferredKind,
  type MarkdownDataViewColumnType,
} from '@/features/markdown/ui/markdownDataViewColumnType'

export function useWorkspaceDataViewMutations(args: {
  selected: DataViewCandidate | null; canMutate: boolean
  setViewConfig: React.Dispatch<React.SetStateAction<WorkspaceDataViewConfig | null>>
  setHeaderState: React.Dispatch<React.SetStateAction<WorkspaceDataViewHeaderState>>
  props: { dataViewSource?: { onActivateRow?: (id: string) => void }; onReplaceLineRange: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void; onRevealLineInEditor: (line: number) => void }
}) {
  const { selected, canMutate, setViewConfig, setHeaderState, props } = args
  const onUpdateCell = React.useCallback(
    (args: { rowId: string; columnId: string; nextValue: string }) => {
      if (!selected) return
      if (!canMutate) return
      const next = updateMarkdownDataViewCell({
        view: selected.view,
        rowId: args.rowId,
        columnId: args.columnId,
        nextValue: args.nextValue,
      })
      if (!next) return
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
    },
    [canMutate, props, selected],
  )

  const onNewRecord = React.useCallback(
    (seed?: Partial<Record<string, string>>) => {
      if (!selected) return
      if (!canMutate) return
      const next = appendMarkdownDataViewRow({ view: selected.view, seed })
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
    },
    [canMutate, props, selected],
  )

  const onReorderRows = React.useCallback(
    (args: {
      orderedRowIds: readonly string[]
      rowPatch?: { rowId: string; columnId: string; nextValue: string }
    }) => {
      if (!selected) return
      if (!canMutate) return
      const next = reorderMarkdownDataViewRows({
        view: selected.view,
        orderedRowIds: args.orderedRowIds,
        rowPatch: args.rowPatch,
      })
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
    },
    [canMutate, props, selected],
  )

  const onActivateRow = React.useCallback(
    (rowId: string) => {
      if (props.dataViewSource) { props.dataViewSource.onActivateRow?.(rowId); return }
      if (!selected) return
      const line = rowIdToMarkdownLineInTable({
        rowId,
        tableStartLine: selected.table.startLine,
        tableEndLine: selected.table.endLine,
      })
      if (line == null) return
      props.onRevealLineInEditor(line)
    },
    [props, selected],
  )

  const onAddColumn = React.useCallback(
    (args: { name: string; columnType: MarkdownDataViewColumnType }) => {
      if (!selected) return
      if (!canMutate) return
      const next = appendMarkdownDataViewColumn({
        view: selected.view,
        name: args.name,
        kind: columnTypeToBaseKind(args.columnType),
      })
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })

      const newColId = next.columns[next.columns.length - 1]?.id
      if (!newColId) return
      setViewConfig(prev => {
        if (!prev) return prev
        const nextVisible = prev.visibleColumnIds ? [...prev.visibleColumnIds, newColId] : prev.visibleColumnIds
        const nextTypes = { ...(prev.columnTypesById ?? {}), [newColId]: args.columnType }
        return { ...prev, visibleColumnIds: nextVisible, columnTypesById: nextTypes }
      })
    },
    [canMutate, props, selected],
  )

  const onDuplicateColumn = React.useCallback(
    (columnId: string) => {
      if (!selected) return
      if (!canMutate) return
      const next = duplicateMarkdownDataViewColumn({
        view: selected.view,
        columnId,
      })
      if (next === selected.view) return
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
      const nextColumnId = next.columns.find(column => !selected.view.columns.some(existing => existing.id === column.id))?.id
      if (!nextColumnId) return
      setViewConfig(prev => {
        if (!prev) return prev
        return duplicateWorkspaceDataViewConfigColumn({
          viewConfig: prev,
          sourceColumnId: columnId,
          nextColumnId,
        })
      })
    },
    [canMutate, props, selected],
  )

  const onDeleteColumn = React.useCallback(
    (columnId: string) => {
      if (!selected) return
      if (!canMutate) return
      const next = deleteMarkdownDataViewColumn({
        view: selected.view,
        columnId,
      })
      if (next === selected.view) return
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
      setViewConfig(prev => {
        if (!prev) return prev
        return removeWorkspaceDataViewConfigColumn({
          viewConfig: prev,
          columnId,
          nextGroupByColumnId: next.groupByColumnId,
        })
      })
    },
    [canMutate, props, selected],
  )

  const onRenameColumn = React.useCallback(
    (columnId: string, nextName: string) => {
      if (!selected) return
      if (!canMutate) return
      const next = renameMarkdownDataViewColumn({
        view: selected.view,
        columnId,
        nextName,
      })
      if (next === selected.view) return
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      props.onReplaceLineRange({ startLine: selected.table.startLine, endLine: selected.table.endLine, replacementLines })
    },
    [canMutate, props, selected],
  )

  const onChangeColumnType = React.useCallback(
    (args: { columnId: string; nextType: MarkdownDataViewColumnType }) => {
      if (!selected) return
      setViewConfig(prev => {
        if (!prev) return prev
        const col = selected.view.columns.find(c => c.id === args.columnId)
        const defaultType = col ? defaultColumnTypeForInferredKind(col.kind) : 'text'
        const nextMap = { ...(prev.columnTypesById ?? {}) }
        if (args.nextType === defaultType) delete nextMap[args.columnId]
        else nextMap[args.columnId] = args.nextType
        const normalized = Object.keys(nextMap).length ? nextMap : null
        return { ...prev, columnTypesById: normalized }
      })
    },
    [selected],
  )

  const onHideColumnInView = React.useCallback(
    (columnId: string) => {
      if (!selected || columnId === selected.view.titleColumnId) return
      setViewConfig(prev => {
        if (!prev) return prev
        const allIds = selected.view.columns.map(c => c.id)
        const base = prev.visibleColumnIds ? prev.visibleColumnIds : allIds
        const next = base.filter(id => id !== columnId)
        return { ...prev, visibleColumnIds: next }
      })
    },
    [selected],
  )

  const onUpsertColumnFilter = React.useCallback(
    (args: { columnId: string; columnKind: MarkdownDataViewColumnKind; op: WorkspaceDataViewFilterOp; value: string }) => {
      if (!selected) return
      const value = String(args.value ?? '').trim()
      setViewConfig(prev => {
        if (!prev) return prev
        return upsertDataViewColumnFilter(prev, { ...args, value })
      })
    },
    [selected],
  )

  const onSetColumnSort = React.useCallback(
    (args: { columnId: string; direction: 'asc' | 'desc' }) => {
      if (!selected) return
      if (args.columnId !== selected.view.titleColumnId) return
      setHeaderState(prev => ({
        ...prev,
        sortMode: args.direction === 'desc' ? 'title_desc' : 'title_asc',
      }))
    },
    [selected],
  )

  return { onUpdateCell, onNewRecord, onReorderRows, onActivateRow, onAddColumn, onDuplicateColumn, onDeleteColumn, onRenameColumn, onChangeColumnType, onHideColumnInView, onUpsertColumnFilter, onSetColumnSort }
}
