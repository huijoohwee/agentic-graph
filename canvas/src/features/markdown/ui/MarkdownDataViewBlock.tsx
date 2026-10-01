import React from 'react'
import type { TokenWithLines } from './markdownPreviewLex'
import type { RenderOpts } from './MarkdownRendererTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY } from '@/lib/config'
import type { TokensTable } from './MarkdownTokens'
import {
  appendMarkdownDataViewRow,
  appendMarkdownDataViewColumn,
  buildMarkdownDataViewFromTableToken,
  deleteMarkdownDataViewColumn,
  duplicateMarkdownDataViewColumn,
  reorderMarkdownDataViewRows,
  renameMarkdownDataViewColumn,
  updateMarkdownDataViewCell,
  type MarkdownDataView,
  type MarkdownDataViewColumnKind,
} from './markdownDataViewModel'
import {
  columnTypeToBaseKind,
  defaultColumnTypeForInferredKind,
  type MarkdownDataViewColumnType,
} from './markdownDataViewColumnType'
import { serializeMarkdownDataViewToTableLines } from './markdownDataViewSerialize'
import { MarkdownDataViewKanbanView } from './MarkdownDataViewKanbanView'
import { MarkdownDataViewTableView } from './MarkdownDataViewTableView'
import { WorkspaceDataViewHeader } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader'
import type { WorkspaceDataViewHeaderState } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewHeader'
import {
  applyWorkspaceDataViewQuery,
  defaultWorkspaceDataViewConfig,
  duplicateWorkspaceDataViewConfigColumn,
  readWorkspaceDataViewConfig,
  removeWorkspaceDataViewConfigColumn,
  type WorkspaceDataViewConfig,
  type WorkspaceDataViewFilterOp,
  writeWorkspaceDataViewConfig,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import {
  useWorkspaceDataViewFloatingRegistration,
  type WorkspaceDataViewSettingsPanelKey,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import { setGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'

type MarkdownDataViewBlockProps = {
  token: TokenWithLines
  table: TokensTable
  highlightClass: string
  highlightStyle?: React.CSSProperties
  opts: RenderOpts
}

export const MarkdownDataViewBlock = React.memo(function MarkdownDataViewBlock(props: MarkdownDataViewBlockProps) {
  const { token, table, highlightClass, highlightStyle, opts } = props
  const startLine = token.startLine
  const endLine = token.endLine || token.startLine
  const canMutate = !!opts.onReplaceLineRange

  const view = React.useMemo(() => buildMarkdownDataViewFromTableToken(table), [table])
  const tableId = React.useMemo(() => `md-block:${startLine}-${endLine}`, [endLine, startLine])
  const activeDocumentPath = opts.activeDocumentPath ?? null

  const [viewConfig, setViewConfig] = React.useState<WorkspaceDataViewConfig | null>(null)
  const [settingsPanel, setSettingsPanel] = React.useState<WorkspaceDataViewSettingsPanelKey>('properties')
  const [headerState, setHeaderState] = React.useState<WorkspaceDataViewHeaderState>(() => ({
    searchQuery: '',
    visibleGroups: null as readonly string[] | null,
    sortMode: 'none' as 'none' | 'title_asc' | 'title_desc',
  }))
  const registrationId = React.useId()

  React.useEffect(() => {
    if (!view) {
      setViewConfig(null)
      return
    }
    const fallback = defaultWorkspaceDataViewConfig({
      title: UI_COPY.markdownDataViewTitleDefault,
      layout: view.groupByColumnId ? 'kanban' : 'table',
      groupByColumnId: view.groupByColumnId || null,
    })
    const cfg = readWorkspaceDataViewConfig({ activeDocumentPath, tableId, fallback })
    setViewConfig(cfg)
  }, [activeDocumentPath, tableId, view])

  const persistTimerRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!viewConfig) return
    if (typeof window === 'undefined') return
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null
      writeWorkspaceDataViewConfig({ activeDocumentPath, tableId, value: viewConfig })
    }, 200)
    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [activeDocumentPath, tableId, viewConfig])

  React.useEffect(() => {
    if (!view) return
    setViewConfig(prev => {
      if (!prev) return prev
      if (prev.layout === 'kanban' && !prev.groupByColumnId && !view.groupByColumnId) {
        return { ...prev, layout: 'table' }
      }
      return prev
    })
  }, [view])

  const commitView = React.useCallback(
    (next: MarkdownDataView) => {
      if (!opts.onReplaceLineRange) return
      const replacementLines = serializeMarkdownDataViewToTableLines(next)
      if (!replacementLines.length) return
      opts.onReplaceLineRange({ startLine, endLine, replacementLines })
    },
    [endLine, opts, startLine],
  )

  const handleUpdateCell = React.useCallback(
    (args: { rowId: string; columnId: string; nextValue: string }) => {
      if (!view) return
      if (!canMutate) return
      const next = updateMarkdownDataViewCell({ view, ...args })
      commitView(next)
    },
    [canMutate, commitView, view],
  )

  const handleNewRecord = React.useCallback(
    (seed?: Partial<Record<string, string>>) => {
      if (!view) return
      if (!canMutate) return
      const next = appendMarkdownDataViewRow({ view, seed })
      commitView(next)
    },
    [canMutate, commitView, view],
  )

  const handleReorderRows = React.useCallback(
    (args: {
      orderedRowIds: readonly string[]
      rowPatch?: { rowId: string; columnId: string; nextValue: string }
    }) => {
      if (!view) return
      if (!canMutate) return
      const next = reorderMarkdownDataViewRows({ view, orderedRowIds: args.orderedRowIds, rowPatch: args.rowPatch })
      commitView(next)
    },
    [canMutate, commitView, view],
  )

  const handleAddColumn = React.useCallback(
    (args: { name: string; columnType: MarkdownDataViewColumnType }) => {
      if (!view) return
      if (!canMutate) return
      const next = appendMarkdownDataViewColumn({ view, name: args.name, kind: columnTypeToBaseKind(args.columnType) })
      commitView(next)

      const newColId = next.columns[next.columns.length - 1]?.id
      if (!newColId) return
      setViewConfig(prev => {
        if (!prev) return prev
        const nextVisible = prev.visibleColumnIds ? [...prev.visibleColumnIds, newColId] : prev.visibleColumnIds
        const nextTypes = { ...(prev.columnTypesById ?? {}), [newColId]: args.columnType }
        return { ...prev, visibleColumnIds: nextVisible, columnTypesById: nextTypes }
      })
    },
    [canMutate, commitView, view],
  )

  const handleDuplicateColumn = React.useCallback(
    (columnId: string) => {
      if (!view) return
      if (!canMutate) return
      const next = duplicateMarkdownDataViewColumn({ view, columnId })
      if (next === view) return
      commitView(next)
      const nextColumnId = next.columns.find(column => !view.columns.some(existing => existing.id === column.id))?.id
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
    [canMutate, commitView, view],
  )

  const handleDeleteColumn = React.useCallback(
    (columnId: string) => {
      if (!view) return
      if (!canMutate) return
      const next = deleteMarkdownDataViewColumn({ view, columnId })
      if (next === view) return
      commitView(next)
      setViewConfig(prev => {
        if (!prev) return prev
        return removeWorkspaceDataViewConfigColumn({
          viewConfig: prev,
          columnId,
          nextGroupByColumnId: next.groupByColumnId,
        })
      })
    },
    [canMutate, commitView, view],
  )

  const handleRenameColumn = React.useCallback(
    (columnId: string, nextName: string) => {
      if (!view) return
      if (!canMutate) return
      const next = renameMarkdownDataViewColumn({ view, columnId, nextName })
      if (next === view) return
      commitView(next)
    },
    [canMutate, commitView, view],
  )

  const handleChangeColumnType = React.useCallback((args: { columnId: string; nextType: MarkdownDataViewColumnType }) => {
    if (!view) return
    setViewConfig(prev => {
      if (!prev) return prev
      const col = view.columns.find(c => c.id === args.columnId)
      const defaultType = col ? defaultColumnTypeForInferredKind(col.kind) : 'text'
      const nextMap = { ...(prev.columnTypesById ?? {}) }
      if (args.nextType === defaultType) delete nextMap[args.columnId]
      else nextMap[args.columnId] = args.nextType
      const normalized = Object.keys(nextMap).length ? nextMap : null
      if (prev.columnTypesById === normalized) return prev
      return { ...prev, columnTypesById: normalized }
    })
  }, [view])

  const handleHideColumnInView = React.useCallback(
    (columnId: string) => {
      if (!view) return
      setViewConfig(prev => {
        if (!prev) return prev
        const allIds = view.columns.map(c => c.id)
        const base = prev.visibleColumnIds ? prev.visibleColumnIds : allIds
        const next = base.filter(id => id !== columnId)
        return { ...prev, visibleColumnIds: next }
      })
    },
    [view],
  )

  const handleUpsertColumnFilter = React.useCallback(
    (args: { columnId: string; columnKind: MarkdownDataViewColumnKind; op: WorkspaceDataViewFilterOp; value: string }) => {
      const value = String(args.value ?? '').trim()
      setViewConfig(prev => {
        if (!prev) return prev
        const makeId = () => {
          if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
          return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
        }
        const groups = prev.filterGroups.length ? prev.filterGroups : [{ id: 'g0', rules: [] }]
        const first = groups[0]
        const rest = groups.slice(1)
        const remaining = first.rules.filter(r => r.columnId !== args.columnId)
        const nextRules = value
          ? [...remaining, { id: makeId(), columnId: args.columnId, columnKind: args.columnKind, op: args.op, value }]
          : remaining
        return { ...prev, filterGroups: [{ ...first, rules: nextRules }, ...rest] }
      })
    },
    [],
  )

  const handleSetColumnSort = React.useCallback(
    (args: { columnId: string; direction: 'asc' | 'desc' }) => {
      if (!view) return
      if (args.columnId !== view.titleColumnId) return
      setHeaderState(prev => ({ ...prev, sortMode: args.direction === 'desc' ? 'title_desc' : 'title_asc' }))
    },
    [view],
  )

  const effectiveGroupByColumnId = React.useMemo(() => {
    if (!view) return null
    const preferred = viewConfig?.groupByColumnId || null
    return preferred || view.groupByColumnId || null
  }, [view, viewConfig?.groupByColumnId])

  const baseView = React.useMemo((): MarkdownDataView | null => {
    if (!view) return null
    if (!effectiveGroupByColumnId) {
      if (!view.groupByColumnId) return view
      return { ...view, groupByColumnId: null }
    }
    if (view.groupByColumnId === effectiveGroupByColumnId) return view
    return { ...view, groupByColumnId: effectiveGroupByColumnId }
  }, [effectiveGroupByColumnId, view])

  const displayedView = React.useMemo((): MarkdownDataView | null => {
    if (!baseView) return null
    if (!viewConfig) return baseView
    return applyWorkspaceDataViewQuery({ view: baseView, viewConfig, state: headerState })
  }, [baseView, headerState, viewConfig])

  const hasViewConfig = !!viewConfig
  const viewLayout = viewConfig?.layout
  const graphEnabled = !!viewConfig?.graphEnabled
  const viewerMode: 'kanban' | 'table' | 'multiDimTable' = React.useMemo(() => {
    if (!hasViewConfig) return 'table'
    if (!(viewLayout === 'table' || !effectiveGroupByColumnId)) return 'kanban'
    return graphEnabled ? 'multiDimTable' : 'table'
  }, [effectiveGroupByColumnId, graphEnabled, hasViewConfig, viewLayout])

  const floatingBinding = React.useMemo(() => {
    if (!view || !viewConfig) return null
    return {
      registrationId: `markdown-data-view-block:${tableId}:${registrationId}`,
      contextLabel: `${UI_COPY.markdownDataViewTitleDefault} - ${tableId}`,
      activePanel: settingsPanel,
      canMutate,
      viewerLayout: viewConfig.layout,
      viewerMode,
      allowMultiDimLayout: true,
      columns: view.columns,
      groupByColumnId: effectiveGroupByColumnId,
      viewConfig,
      setViewConfig,
      onChangeLayout: (layout: WorkspaceDataViewConfig['layout']) => {
        setViewConfig(prev => {
          if (!prev) return prev
          if (prev.layout === layout) return prev
          return { ...prev, layout }
        })
      },
      onChangeLayoutMode: (mode: 'table' | 'kanban' | 'multiDimTable') => {
        setViewConfig(prev => {
          if (!prev) return prev
          const nextGraphEnabled = mode === 'multiDimTable'
          const nextLayout = mode === 'kanban' ? 'kanban' : 'table'
          if (prev.layout === nextLayout && !!prev.graphEnabled === nextGraphEnabled && prev.geospatialViewEnabled !== true) {
            return prev
          }
          return { ...prev, layout: nextLayout, graphEnabled: nextGraphEnabled, geospatialViewEnabled: false }
        })
      },
      onSelectGeospatialView: () => {
        setViewConfig(prev => {
          if (!prev) return prev
          if (prev.layout === 'table' && prev.graphEnabled === true && prev.geospatialViewEnabled === true) return prev
          return { ...prev, layout: 'table', graphEnabled: true, geospatialViewEnabled: true }
        })
        void setGeospatialModeEnabled(true).catch(() => void 0)
      },
      onReset: () => setHeaderState({ searchQuery: '', visibleGroups: null, sortMode: 'none' }),
      onNewRecord: canMutate ? () => handleNewRecord() : undefined,
      onAddColumn: canMutate ? handleAddColumn : undefined,
      onDuplicateColumn: canMutate ? handleDuplicateColumn : undefined,
      onDeleteColumn: canMutate ? handleDeleteColumn : undefined,
      onRenameColumn: canMutate ? handleRenameColumn : undefined,
    }
  }, [
    canMutate,
    effectiveGroupByColumnId,
    handleAddColumn,
    handleDeleteColumn,
    handleDuplicateColumn,
    handleNewRecord,
    handleRenameColumn,
    registrationId,
    settingsPanel,
    tableId,
    view,
    viewConfig,
    viewerMode,
  ])
  const activateViewSettings = useWorkspaceDataViewFloatingRegistration(floatingBinding)
  const openViewSettingsPanel = React.useCallback((panel: WorkspaceDataViewSettingsPanelKey) => {
    activateViewSettings(panel)
    setSettingsPanel(panel)
    emitFloatingPanelOpen({ tab: 'view', open: true })
  }, [activateViewSettings])

  if (!view) return null
  if (!viewConfig) return null
  if (!displayedView) return null

  const wrapperClass = ['rounded-lg border overflow-hidden', UI_THEME_TOKENS.panel.border, highlightClass].filter(Boolean).join(' ')

  return (
    <article className={wrapperClass} style={highlightStyle} aria-label="Markdown data view">
      <WorkspaceDataViewHeader
        title={UI_COPY.markdownDataViewTitleDefault}
        viewerMode={viewerMode}
        canMutate={canMutate}
        columns={view.columns}
        groupByColumnId={effectiveGroupByColumnId}
        state={headerState}
        onChangeState={setHeaderState}
        onChangeViewerMode={(mode) => {
          setViewConfig(prev => {
            if (!prev) return prev
            const nextGraphEnabled = mode === 'multiDimTable' || mode === 'geospatial'
            const nextLayout = mode === 'kanban' ? 'kanban' : 'table'
            const nextGeospatialEnabled = mode === 'geospatial'
            if (
              prev.layout === nextLayout
              && !!prev.graphEnabled === nextGraphEnabled
              && !!prev.geospatialViewEnabled === nextGeospatialEnabled
            ) {
              return prev
            }
            return { ...prev, layout: nextLayout, graphEnabled: nextGraphEnabled, geospatialViewEnabled: nextGeospatialEnabled }
          })
        }}
        onSelectGeospatialView={() => {
          setViewConfig(prev => {
            if (!prev) return prev
            if (prev.layout === 'table' && prev.graphEnabled === true && prev.geospatialViewEnabled === true) return prev
            return { ...prev, layout: 'table', graphEnabled: true, geospatialViewEnabled: true }
          })
          void setGeospatialModeEnabled(true).catch(() => void 0)
        }}
        supportsMultiDimLayout={true}
        onNewRecord={canMutate ? () => handleNewRecord() : undefined}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
        openSettings={() => openViewSettingsPanel('properties')}
        openSettingsPanel={openViewSettingsPanel}
      />

      <section className={UI_THEME_TOKENS.panel.bg}>
        {viewerMode === 'kanban' ? (
          <MarkdownDataViewKanbanView
            view={displayedView}
            visibleColumnIds={viewConfig.visibleColumnIds}
            canMutate={canMutate}
            onUpdateCell={handleUpdateCell}
            onReorderRows={handleReorderRows}
            onNewRecord={handleNewRecord}
          />
        ) : (
          <MarkdownDataViewTableView
            view={displayedView}
            canMutate={canMutate}
            canConfigure={true}
            onUpdateCell={handleUpdateCell}
            onNewRecord={canMutate ? () => handleNewRecord() : undefined}
            onAddColumn={canMutate ? handleAddColumn : undefined}
            visibleColumnIds={viewConfig.visibleColumnIds}
            columnTypesById={viewConfig.columnTypesById}
            rowHeightPreset={viewConfig.rowHeightPreset}
            fieldLineMode={viewConfig.fieldLineMode}
            onChangeColumnType={handleChangeColumnType}
            onHideColumnInView={handleHideColumnInView}
            onUpsertColumnFilter={handleUpsertColumnFilter}
            onSetColumnSort={handleSetColumnSort}
          />
        )}
      </section>
    </article>
  )
})
