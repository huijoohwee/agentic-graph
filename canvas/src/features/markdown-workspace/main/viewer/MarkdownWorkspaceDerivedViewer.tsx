import React from 'react'
import { useWorkspaceDataViewConfig } from './useWorkspaceDataViewConfig'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { useGraphStore } from '@/hooks/useGraphStore'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { buildMarkdownTokensKey } from '@/features/markdown/ui/markdownPreviewLex'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import type { HighlightedLineRange } from '../../markdownWorkspaceTypes'
import type { MarkdownGeoDatasetIntegration, MarkdownInlineDraftTextChangeOptions } from '@/features/markdown/ui/MarkdownRendererTypes'
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
import { MarkdownDataViewKanbanView } from '@/features/markdown/ui/MarkdownDataViewKanbanView'
import { MarkdownDataViewTableView } from '@/features/markdown/ui/MarkdownDataViewTableView'
import {
  columnTypeToBaseKind,
  defaultColumnTypeForInferredKind,
  type MarkdownDataViewColumnType,
} from '@/features/markdown/ui/markdownDataViewColumnType'
import { WorkspaceModeSelect } from '../../WorkspaceModeSelect'
import { rowIdToMarkdownLineInTable } from './markdownDataViewSourceMap'
import { WorkspaceDataViewHeader, type WorkspaceDataViewHeaderState } from './WorkspaceDataViewHeader'
import type { JsonToMarkdownMode } from '@/features/markdown/jsonToMarkdown'
import {
  applyWorkspaceDataViewQuery,
  duplicateWorkspaceDataViewConfigColumn,
  removeWorkspaceDataViewConfigColumn,
  type WorkspaceDataViewFilterOp,
} from './workspaceDataViewConfig'
import { useMarkdownPreviewLexedMarkdown } from '@/features/markdown/ui/useMarkdownPreviewTokens'
import { setGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import {
  buildDataViewCandidates,
  buildDataViewCandidatesFromDelimitedTextParseResult,
  buildDataViewCandidatesFromRowsJsonArtifact,
  tryBuildApiGraphMarkdownTablesFromJson,
  type DataViewCandidate,
} from './markdownWorkspaceDataViewCandidates'
import { hashSignatureParts } from '@/lib/hash/signature'
import {
  useWorkspaceDataViewFloatingRegistration,
  type WorkspaceDataViewFloatingBinding,
} from './workspaceDataViewFloatingStore'
import {
  UI_RESPONSIVE_WORKSPACE_DATA_VIEW_MAIN_CLASSNAME,
  UI_RESPONSIVE_WORKSPACE_DATA_VIEW_ROOT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { defaultDelimitedTextDelimiterForName } from '@/lib/delimited-text/delimitedText'
import { parseDelimitedTextWithWorkerFallback } from '@/lib/delimited-text/delimitedTextWorkerBridge'
import { isMarkdownWorkspaceDelimitedTextPath } from '../types'
import { readStructuredSourceDataViewPresentation } from './workspaceStructuredSourceDataViewPresentation'
const MarkdownWorkspaceHtmlViewerPaneLazy = React.lazy(
  async (): Promise<{ default: typeof import('./MarkdownWorkspaceHtmlViewerPane')['MarkdownWorkspaceHtmlViewerPane'] }> =>
    import('./MarkdownWorkspaceHtmlViewerPane').then(mod => ({ default: mod.MarkdownWorkspaceHtmlViewerPane })),
)
export type MarkdownWorkspaceDerivedViewerKind = 'markdown' | 'html' | 'json'
export type MarkdownWorkspaceDerivedViewerMode = 'read' | 'table' | 'multiDimTable' | 'kanban' | 'geospatial'

export type WorkspaceDataViewSource = { id: string; label: string; view: MarkdownDataView;
  selectedRowId?: string | null; onActivateRow?: (rowId: string) => void }

export function MarkdownWorkspaceDerivedViewer(props: {
  dataViewSource?: WorkspaceDataViewSource
  viewerKind: MarkdownWorkspaceDerivedViewerKind
  viewerMode: MarkdownWorkspaceDerivedViewerMode
  onChangeViewerMode?: (mode: MarkdownWorkspaceDerivedViewerMode) => void
  markdownText: string
  title?: string
  activeDocumentPath?: string | null
  highlightedLineRange?: HighlightedLineRange
  markdownWordWrap: boolean
  markdownTextHighlight: boolean
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  webpageLayoutWireframeAscii?: string | null
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  disableViewerMutations: boolean
  onInsertLineAfter: (afterLine: number) => void
  onReorderLineBlock: (
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => void
  onReplaceLineRange: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  onRevealLineInEditor: (line: number) => void
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string, options?: MarkdownInlineDraftTextChangeOptions) => void
  onViewerRootRef: (el: HTMLElement | null) => void
  floatingPanelRegistrationOnly?: boolean
}) {
  const panelTypography = usePanelTypography()
  const jsonLikeMarkdownText = React.useMemo(() => {
    const trimmed = String(props.markdownText || '').trim()
    if (!trimmed) return ''
    return trimmed.startsWith('{') || trimmed.startsWith('[') ? trimmed : ''
  }, [props.markdownText])

  const rowsJsonCandidatesKey = React.useMemo(
    () => (props.viewerMode !== 'read' && jsonLikeMarkdownText ? buildMarkdownTokensKey(jsonLikeMarkdownText) : ''),
    [jsonLikeMarkdownText, props.viewerMode],
  )

  const rowsJsonCandidates = React.useMemo(
    () => (rowsJsonCandidatesKey ? buildDataViewCandidatesFromRowsJsonArtifact(jsonLikeMarkdownText, rowsJsonCandidatesKey) : []),
    [jsonLikeMarkdownText, rowsJsonCandidatesKey],
  )

  const derivedStructuredText = React.useMemo(() => {
    if (rowsJsonCandidates.length > 0 && props.viewerMode !== 'read') return null
    const showStructuredInJsonViews = props.viewerKind === 'json'
    const showStructuredInMarkdownViews =
      props.viewerKind === 'markdown' &&
      (props.viewerMode === 'read' || props.viewerMode === 'table' || props.viewerMode === 'multiDimTable')
    if (!showStructuredInJsonViews && !showStructuredInMarkdownViews) return null
    if (!jsonLikeMarkdownText) return null
    const preferredMode: JsonToMarkdownMode | undefined =
      props.viewerKind === 'markdown' && props.viewerMode === 'read' ? 'table' : undefined
    return tryBuildApiGraphMarkdownTablesFromJson(jsonLikeMarkdownText, preferredMode)
  }, [jsonLikeMarkdownText, props.viewerKind, props.viewerMode, rowsJsonCandidates.length])

  const effectiveMarkdownText = derivedStructuredText || props.markdownText
  const shouldBuildDelimitedTextCandidates =
    props.viewerMode !== 'read' &&
    isMarkdownWorkspaceDelimitedTextPath(props.activeDocumentPath) &&
    !jsonLikeMarkdownText
  const delimitedTextCandidatesKey = React.useMemo(
    () => (shouldBuildDelimitedTextCandidates ? buildMarkdownTokensKey(effectiveMarkdownText) : ''),
    [effectiveMarkdownText, shouldBuildDelimitedTextCandidates],
  )
  const [delimitedTextCandidatesState, setDelimitedTextCandidatesState] = React.useState<{
    key: string
    candidates: DataViewCandidate[]
  } | null>(null)
  React.useEffect(() => {
    if (!shouldBuildDelimitedTextCandidates || !delimitedTextCandidatesKey) {
      setDelimitedTextCandidatesState(null)
      return
    }
    let cancelled = false
    const sourcePath = props.activeDocumentPath ?? ''
    void parseDelimitedTextWithWorkerFallback(effectiveMarkdownText, {
      header: true,
      delimiter: defaultDelimitedTextDelimiterForName(sourcePath),
      chunkSizeChars: 64 * 1024,
    }).then(parsed => {
      if (cancelled) return
      const hasError = parsed.diagnostics.some(item => item.severity === 'error')
      const candidates = hasError
        ? []
        : buildDataViewCandidatesFromDelimitedTextParseResult({
          parseResult: parsed,
          candidatesKey: delimitedTextCandidatesKey,
          sourcePath,
        })
      setDelimitedTextCandidatesState({ key: delimitedTextCandidatesKey, candidates })
    }).catch(() => {
      if (cancelled) return
      setDelimitedTextCandidatesState({ key: delimitedTextCandidatesKey, candidates: [] })
    })
    return () => {
      cancelled = true
    }
  }, [delimitedTextCandidatesKey, effectiveMarkdownText, props.activeDocumentPath, shouldBuildDelimitedTextCandidates])
  const delimitedTextCandidates =
    delimitedTextCandidatesState?.key === delimitedTextCandidatesKey
      ? delimitedTextCandidatesState.candidates
      : []
  const shouldBuildDataViewCandidates =
    props.viewerMode !== 'read' && (rowsJsonCandidates.length > 0 || shouldBuildDelimitedTextCandidates || props.viewerKind !== 'json' || !!derivedStructuredText)
  const shouldLexDataViewCandidates = shouldBuildDataViewCandidates && rowsJsonCandidates.length === 0 && !shouldBuildDelimitedTextCandidates
  const candidateSourcePath = props.activeDocumentPath ?? `derived-viewer:${props.viewerKind}:${props.viewerMode}`
  const { tokens: candidateTokens } = useMarkdownPreviewLexedMarkdown(
    shouldLexDataViewCandidates ? effectiveMarkdownText : '',
    undefined,
    candidateSourcePath,
    false,
  )
  const candidatesKey = React.useMemo(
    () => (shouldLexDataViewCandidates ? buildMarkdownTokensKey(effectiveMarkdownText) : ''),
    [effectiveMarkdownText, shouldLexDataViewCandidates],
  )
  const [selectedTableId, setSelectedTableId] = React.useState<string>('')
  const [settingsPanel, setSettingsPanel] = React.useState<'layout' | 'properties' | 'filter' | 'sort' | 'group' | 'reset'>('properties')
  const [headerState, setHeaderState] = React.useState<WorkspaceDataViewHeaderState>(() => ({
    searchQuery: '',
    visibleGroups: null,
    sortMode: 'none',
  }))

  const strictCandidates = React.useMemo(() => {
    if (!shouldLexDataViewCandidates) return []
    if (props.viewerKind === 'json') return []
    return buildDataViewCandidates(effectiveMarkdownText, candidatesKey, candidateTokens, false)
  }, [candidateTokens, candidatesKey, effectiveMarkdownText, props.viewerKind, shouldLexDataViewCandidates])

  const relaxedCandidates = React.useMemo(() => {
    if (!shouldLexDataViewCandidates) return []
    const shouldRelax = props.viewerKind === 'json'
      ? !!derivedStructuredText
      : strictCandidates.length === 0
    return shouldRelax ? buildDataViewCandidates(effectiveMarkdownText, candidatesKey, candidateTokens, true) : []
  }, [candidateTokens, candidatesKey, derivedStructuredText, effectiveMarkdownText, props.viewerKind, shouldLexDataViewCandidates, strictCandidates.length])

  const externalCandidates = React.useMemo<DataViewCandidate[]>(() => props.dataViewSource ? [{
    ...props.dataViewSource, readonly: true, table: { type: 'table', raw: '', header: [], align: [], rows: [], startLine: 1, endLine: 1 },
  }] : [], [props.dataViewSource])
  const candidates = externalCandidates.length ? externalCandidates : rowsJsonCandidates.length > 0
    ? rowsJsonCandidates
    : delimitedTextCandidates.length > 0
      ? delimitedTextCandidates
    : strictCandidates.length > 0
      ? strictCandidates
      : relaxedCandidates
  const usingLooseTables = rowsJsonCandidates.length === 0 && strictCandidates.length === 0 && relaxedCandidates.length > 0

  React.useEffect(() => {
    if (candidates.length < 1) {
      setSelectedTableId('')
      return
    }
    if (selectedTableId && candidates.some(c => c.id === selectedTableId)) return
    setSelectedTableId(candidates[0].id)
  }, [candidates, selectedTableId])

  const selected = React.useMemo(() => {
    if (!selectedTableId) return candidates[0] ?? null
    return candidates.find(c => c.id === selectedTableId) ?? (candidates[0] ?? null)
  }, [candidates, selectedTableId])

  const { viewConfig, setViewConfig, commitViewConfig } = useWorkspaceDataViewConfig(
    selected, props.activeDocumentPath, props.viewerMode, !!props.dataViewSource,
  )

  const canMutate = !props.disableViewerMutations && props.viewerKind !== 'json' && !usingLooseTables && !selected?.readonly

  const onResetDataView = React.useCallback(() => {
    setHeaderState({ searchQuery: '', visibleGroups: null, sortMode: 'none' })
  }, [])

  const displayedView = React.useMemo((): MarkdownDataView | null => {
    if (!selected) return null
    const base: MarkdownDataView = viewConfig?.groupByColumnId ? { ...selected.view, groupByColumnId: viewConfig.groupByColumnId } : selected.view
    return applyWorkspaceDataViewQuery({ view: base, viewConfig, state: headerState })
  }, [headerState.searchQuery, headerState.sortMode, headerState.visibleGroups, selected, viewConfig])

  const structuredSourcePresentation = React.useMemo(() => (selected?.structuredSource === true ? readStructuredSourceDataViewPresentation(selected.view, viewConfig) : null), [selected, viewConfig])
  const visibleColumnIds = viewConfig?.visibleColumnIds ?? structuredSourcePresentation?.visibleColumnIds ?? null
  const columnTypesById = viewConfig?.columnTypesById ?? null

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
      if (!selected) return
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

  const handleSelectGeospatialView = React.useCallback(() => {
    setViewConfig(prev => {
      if (!prev) return prev
      if (prev.layout === 'table' && prev.graphEnabled === true && prev.geospatialViewEnabled === true) {
        return prev
      }
      return { ...prev, layout: 'table', graphEnabled: true, geospatialViewEnabled: true }
    })
    props.onChangeViewerMode?.('geospatial')
    if (!props.dataViewSource) void setGeospatialModeEnabled(true).catch(() => void 0)
  }, [props])

  const openViewSettingsPanel = React.useCallback((panel: 'layout' | 'properties' | 'filter' | 'sort' | 'group' | 'reset') => {
    setSettingsPanel(panel)
    emitFloatingPanelOpen({ tab: 'view', open: true })
  }, [])

  const viewSettingsBinding = React.useMemo<WorkspaceDataViewFloatingBinding | null>(() => {
    if (!selected || !viewConfig) return null
    const registrationId = hashSignatureParts([
      'workspace-data-view-floating-settings',
      props.activeDocumentPath ?? '',
      selected.id,
      props.viewerMode,
    ])
    return {
      registrationId,
      contextLabel: selected.label,
      activePanel: settingsPanel,
      canMutate,
      viewerLayout: props.viewerMode === 'kanban' ? 'kanban' : 'table',
      viewerMode: props.viewerMode === 'kanban'
        ? 'kanban'
        : props.viewerMode === 'multiDimTable'
          ? 'multiDimTable'
          : 'table',
      allowMultiDimLayout: true,
      columns: selected.view.columns,
      groupByColumnId: viewConfig.groupByColumnId || selected.view.groupByColumnId || null,
      viewConfig,
      setViewConfig: commitViewConfig,
      onChangeLayout: layout => {
        props.onChangeViewerMode?.(layout)
      },
      onChangeLayoutMode: mode => {
        if (viewConfig) {
          commitViewConfig({
            ...viewConfig,
            layout: mode === 'kanban' ? 'kanban' : 'table',
            graphEnabled: mode === 'multiDimTable',
            geospatialViewEnabled: false,
          })
        }
        props.onChangeViewerMode?.(mode)
        if (!props.dataViewSource) useGraphStore.getState().setMultiDimTableModeEnabled(mode === 'multiDimTable')
      },
      onSelectGeospatialView: handleSelectGeospatialView,
      onReset: onResetDataView,
      onNewRecord: canMutate ? () => onNewRecord() : undefined,
      onAddColumn: canMutate ? onAddColumn : undefined,
      onDuplicateColumn: canMutate ? onDuplicateColumn : undefined,
      onDeleteColumn: canMutate ? onDeleteColumn : undefined,
      onRenameColumn: canMutate ? onRenameColumn : undefined,
    }
  }, [
    canMutate,
    canMutate,
    handleSelectGeospatialView,
    onAddColumn,
    onDeleteColumn,
    onDuplicateColumn,
    onNewRecord,
    onResetDataView,
    onRenameColumn,
    props,
    settingsPanel,
    commitViewConfig,
    viewConfig,
  ])

  useWorkspaceDataViewFloatingRegistration(viewSettingsBinding)

  if (props.floatingPanelRegistrationOnly === true) return null

  if (props.viewerMode === 'read') {
    if (props.viewerKind === 'json') {
      if (derivedStructuredText) {
        return (
          <MarkdownPreview
            ref={props.onViewerRootRef}
            markdownText={derivedStructuredText}
            activeDocumentPath={props.activeDocumentPath ?? null}
            highlightedLineRange={props.highlightedLineRange}
            markdownWordWrap={props.markdownWordWrap}
            markdownPresentationMode={false}
            markdownTextHighlight={props.markdownTextHighlight}
            selectionKind={null}
            uiPanelTextFontClass={props.uiPanelTextFontClass}
            uiPanelMonospaceTextClass={props.uiPanelMonospaceTextClass}
            webpageLayoutWireframeAscii={props.webpageLayoutWireframeAscii ?? null}
            geoDatasetIntegration={props.geoDatasetIntegration}
            previewOverlayScope="container"
            previewOverlayPortalTarget={null}
            previewScrollable={true}
            showSidebar={false}
            viewMode="viewer"
            forbidCopy={false}
            onInsertLineAfter={canMutate ? props.onInsertLineAfter : undefined}
            onReorderLineBlock={canMutate ? props.onReorderLineBlock : undefined}
            onReplaceLineRange={canMutate ? props.onReplaceLineRange : undefined}
            onShowInEditor={props.onRevealLineInEditor}
            onInlineEditStateChange={canMutate ? props.onInlineEditStateChange : undefined}
            onInlineDraftTextChange={canMutate ? props.onInlineDraftTextChange : undefined}
          />
        )
      }
      return (
        <section
          ref={props.onViewerRootRef}
          className={`h-full w-full overflow-auto ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} ${props.uiPanelMonospaceTextClass}`}
          aria-label="JSON viewer"
        >
          <pre className="m-0 p-3 text-[11px] leading-snug whitespace-pre-wrap break-words">{props.markdownText}</pre>
        </section>
      )
    }
    if (props.viewerKind === 'html') {
      return (
        <section ref={props.onViewerRootRef} className="h-full w-full">
          <React.Suspense fallback={null}>
            <MarkdownWorkspaceHtmlViewerPaneLazy
              markdownText={props.markdownText}
              title={props.title}
            />
          </React.Suspense>
        </section>
      )
    }
    return (
      <MarkdownPreview
        ref={props.onViewerRootRef}
        markdownText={props.markdownText}
        activeDocumentPath={props.activeDocumentPath ?? null}
        highlightedLineRange={props.highlightedLineRange}
        markdownWordWrap={props.markdownWordWrap}
        markdownPresentationMode={false}
        markdownTextHighlight={props.markdownTextHighlight}
        selectionKind={null}
        uiPanelTextFontClass={props.uiPanelTextFontClass}
        uiPanelMonospaceTextClass={props.uiPanelMonospaceTextClass}
        webpageLayoutWireframeAscii={props.webpageLayoutWireframeAscii ?? null}
        geoDatasetIntegration={props.geoDatasetIntegration}
        previewOverlayScope="container"
        previewOverlayPortalTarget={null}
        previewScrollable={true}
        showSidebar={false}
        viewMode="viewer"
        forbidCopy={false}
        onInsertLineAfter={canMutate ? props.onInsertLineAfter : undefined}
        onReorderLineBlock={canMutate ? props.onReorderLineBlock : undefined}
        onReplaceLineRange={canMutate ? props.onReplaceLineRange : undefined}
        onShowInEditor={props.onRevealLineInEditor}
        onInlineEditStateChange={canMutate ? props.onInlineEditStateChange : undefined}
        onInlineDraftTextChange={canMutate ? props.onInlineDraftTextChange : undefined}
      />
    )
  }

  return (
    <section className={`${UI_RESPONSIVE_WORKSPACE_DATA_VIEW_ROOT_CLASSNAME} h-full w-full flex flex-col`} aria-label="Workspace data view">
      <WorkspaceDataViewHeader
        title={props.title || 'Workspace'}
        viewerMode={props.viewerMode}
        canMutate={canMutate}
        columns={(selected?.view.columns ?? [])}
        groupByColumnId={viewConfig?.groupByColumnId || selected?.view.groupByColumnId || null}
        state={headerState}
        onChangeState={setHeaderState}
        onChangeViewerMode={(mode) => props.onChangeViewerMode?.(mode)}
        onSelectGeospatialView={handleSelectGeospatialView}
        supportsMultiDimLayout={true}
        onNewRecord={canMutate ? () => onNewRecord() : undefined}
        viewConfig={viewConfig}
        setViewConfig={commitViewConfig}
        openSettings={() => openViewSettingsPanel('properties')}
        openSettingsPanel={openViewSettingsPanel}
        tableSelector={
          candidates.length > 1 ? (
            <WorkspaceModeSelect
              value={selected?.id ?? ''}
              ariaLabel="Select data view table"
              options={candidates.map(c => ({ value: c.id, label: c.label }))}
              presentation="tabs"
              onChange={setSelectedTableId}
            />
          ) : null
        }
      />
      <main className={`${UI_RESPONSIVE_WORKSPACE_DATA_VIEW_MAIN_CLASSNAME} flex-1 min-h-0 overflow-auto`}>
        {!selected ? (
          <section className="p-4" aria-label="No data views">
            <p className={`${UI_THEME_TOKENS.text.tertiary} ${panelTypography.microLabelClass}`}>No eligible Markdown tables found.</p>
          </section>
        ) : props.viewerMode === 'kanban' ? (
          <MarkdownDataViewKanbanView
            view={displayedView || selected.view}
            visibleColumnIds={visibleColumnIds}
            canMutate={canMutate}
            onUpdateCell={onUpdateCell}
            onReorderRows={onReorderRows}
            onNewRecord={onNewRecord}
            onActivateRow={onActivateRow}
          />
        ) : (
          <MarkdownDataViewTableView
            view={displayedView || selected.view}
            visibleColumnIds={visibleColumnIds}
            columnTypesById={columnTypesById}
            rowHeightPreset={structuredSourcePresentation?.rowHeightPreset ?? viewConfig?.rowHeightPreset}
            fieldLineMode={structuredSourcePresentation?.fieldLineMode ?? viewConfig?.fieldLineMode}
            canMutate={canMutate}
            canConfigure={true}
            onUpdateCell={onUpdateCell}
            onActivateRow={onActivateRow}
            selectedRowId={props.dataViewSource?.selectedRowId}
            onNewRecord={canMutate ? () => onNewRecord() : undefined}
            onAddColumn={canMutate ? onAddColumn : undefined}
            onChangeColumnType={onChangeColumnType}
            onHideColumnInView={onHideColumnInView}
            onUpsertColumnFilter={onUpsertColumnFilter}
            onSetColumnSort={onSetColumnSort}
            renderAllRows={selected.structuredSource === true}
            orientation={viewConfig?.orientation === 'columns' ? 'columns' : 'rows'}
          />
        )}
      </main>
    </section>
  )
}
