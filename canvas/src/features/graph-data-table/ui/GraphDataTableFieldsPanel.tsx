import React from 'react'
import { GripVertical, Search as SearchIcon } from 'lucide-react'
import {
  GraphDataTablePanelCheckbox,
  GraphDataTablePanelSearchInput,
  secondaryButtonClassName,
} from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'
import { type GraphDataTableColumnKey } from '@/features/graph-data-table/graphDataTable'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME,
  UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { usePanelTypography } from '@/lib/ui/panelTypography'

export interface FieldsPanelProps {
  panelTitle: string
  fieldsQuery: string
  setFieldsQuery: (next: string) => void
  fieldsPanelColumnKeys: GraphDataTableColumnKey[]
  columnLabelByKey: Map<GraphDataTableColumnKey, string>
  isColumnVisible: (key: GraphDataTableColumnKey) => boolean
  setColumnVisibility: (key: GraphDataTableColumnKey, visible: boolean) => void
  draggingColumnKey: GraphDataTableColumnKey | null
  setDraggingColumnKey: (key: GraphDataTableColumnKey | null) => void
  moveColumn: (from: GraphDataTableColumnKey, to: GraphDataTableColumnKey) => void
  showAllColumns: () => void
  hideAllColumns: () => void
  onClose: () => void
}

export function FieldsPanel({
  panelTitle,
  fieldsQuery,
  setFieldsQuery,
  fieldsPanelColumnKeys,
  columnLabelByKey,
  isColumnVisible,
  setColumnVisibility,
  draggingColumnKey,
  setDraggingColumnKey,
  moveColumn,
  showAllColumns,
  hideAllColumns,
  onClose,
}: FieldsPanelProps) {
  const panelTypography = usePanelTypography()
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const searchInputClassName = `${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_INPUT_CLASSNAME} rounded-md border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${panelTypography.textSizeClass} shadow-none ${UI_THEME_TOKENS.input.placeholder} focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing}`
  const selectionControlClassName = `${UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`
  const handleDragStart = React.useCallback(
    (event: React.DragEvent<HTMLButtonElement>, key: GraphDataTableColumnKey) => {
      event.dataTransfer.effectAllowed = 'move'
      setDraggingColumnKey(key)
    },
    [setDraggingColumnKey],
  )

  const handleDragEnd = React.useCallback(() => {
    setDraggingColumnKey(null)
  }, [setDraggingColumnKey])

  const handleDropOnColumn = React.useCallback(
    (event: React.DragEvent<HTMLButtonElement>, targetKey: GraphDataTableColumnKey) => {
      event.preventDefault()
      if (!draggingColumnKey || draggingColumnKey === targetKey) return
      moveColumn(draggingColumnKey, targetKey)
      setDraggingColumnKey(null)
    },
    [draggingColumnKey, moveColumn, setDraggingColumnKey],
  )

  const handleDragOverColumn = React.useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }, [])

  return (
    <section className={`z-50 flex ${UI_RESPONSIVE_GRAPH_DATA_TABLE_WIDE_FLOATING_PANEL_CLASSNAME} flex-col overflow-hidden rounded-lg border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-4 ${UI_THEME_TOKENS.text.primary} shadow-[var(--kg-shadow-overlay)] ${panelTypography.panelTextClass}`}>
      <header className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_HEADER_ROW_CLASSNAME} ${panelTypography.textSizeClass}`}>
        <section className="font-medium">{panelTitle}</section>
        <button type="button" className={secondaryButtonClassName} onClick={onClose}>
          {UI_LABELS.close}
        </button>
      </header>
      <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_SEARCH_ROW_CLASSNAME}>
        <section className="relative flex-1">
          <SearchIcon
            className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 ${UI_THEME_TOKENS.text.tertiary} ${iconSizeClass}`}
            strokeWidth={uiIconStrokeWidth}
          />
          <GraphDataTablePanelSearchInput
            value={fieldsQuery}
            onChange={event => setFieldsQuery(event.target.value)}
            placeholder={UI_COPY.searchFieldsPlaceholder}
            className={searchInputClassName}
          />
        </section>
        <button type="button" className={secondaryButtonClassName} onClick={showAllColumns}>
          {UI_LABELS.showAll}
        </button>
        <button type="button" className={secondaryButtonClassName} onClick={hideAllColumns}>
          {UI_LABELS.hideAll}
        </button>
      </section>
      <section className={`flex-1 overflow-auto border ${UI_THEME_TOKENS.panel.border} rounded-md ${UI_THEME_TOKENS.panel.headerBg}`}>
        {fieldsPanelColumnKeys.length === 0 ? (
          <section className={`flex h-32 items-center justify-center ${panelTypography.textSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>{UI_COPY.noFieldsMatch}</section>
        ) : (
          <section className={`divide-y ${UI_THEME_TOKENS.table.rowDivider}`}>
            {fieldsPanelColumnKeys.map(key => {
              const isVisible = isColumnVisible(key)
              const label = columnLabelByKey.get(key) ?? key
              const isDragging = draggingColumnKey === key
              return (
                <label
                  key={key}
                  className={`${UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_FIELD_ROW_CLASSNAME} ${panelTypography.textSizeClass} ${
                    isDragging ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg
                  }`}
                >
                  <section className={UI_RESPONSIVE_GRAPH_DATA_TABLE_PANEL_INLINE_ROW_CLASSNAME}>
                    <button
                      type="button"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.tertiary} shadow-none ${UI_THEME_TOKENS.button.hoverBg} focus-visible:outline-none ${UI_THEME_TOKENS.focus.primaryRing}`}
                      draggable
                      onDragStart={event => handleDragStart(event, key)}
                      onDragEnd={handleDragEnd}
                      onDrop={event => handleDropOnColumn(event, key)}
                      onDragOver={handleDragOverColumn}
                    >
                      <GripVertical className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                    </button>
                    <span className={`truncate ${UI_THEME_TOKENS.text.primary}`} title={label}>
                      {label}
                    </span>
                  </section>
                  <GraphDataTablePanelCheckbox
                    className={selectionControlClassName}
                    checked={isVisible}
                    onChange={event => setColumnVisibility(key, event.target.checked)}
                  />
                </label>
              )
            })}
          </section>
        )}
      </section>
    </section>
  )
}
