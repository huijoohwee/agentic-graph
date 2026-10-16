import React from 'react'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { JSONValue } from '@/lib/graph/types'
import { isJsonValue } from '@/lib/graph/jsonValue'
import {
  getGraphDataTablePropertyValue,
  getRowFieldText,
  stringifyPreview,
  isGraphDataTablePropertyColumnKey,
  parseGraphDataTablePropertyColumnKey,
  type GraphDataTableColumnKey,
  type GraphDataTableRowDensity,
  type UnifiedRow,
} from '@/features/graph-data-table/graphDataTable'
import type { GraphFieldSettingsResolved } from '@/features/graph-fields/graphFields'
import { GraphDataTableEditableCellInput } from '@/features/graph-data-table/ui/GraphDataTableUiPrimitives'
import { FrozenAreaResizeHandle, FROZEN_DATA_COLUMN_LEFT } from './GraphDataTableHeader'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME,
  UI_RESPONSIVE_STRUCTURED_EDITOR_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { MarkdownStructuredTextEditor } from '@/features/markdown/ui/MarkdownStructuredTextEditor'
import type { PanelTypography } from '@/lib/ui/panelTypography'
import { DataViewTagChip } from '@/features/markdown/ui/MarkdownDataViewChips'

interface BodyCellProps {
  columnKey: GraphDataTableColumnKey
  row: UnifiedRow
  isActive: boolean
  rowDensity: GraphDataTableRowDensity
  width?: number
  isColumnSelected?: boolean
  expandedCellRowId: string | null
  expandedCellColumnKey: GraphDataTableColumnKey | null
  onToggleExpandCell?: (columnKey: GraphDataTableColumnKey, rowId: string) => void
  bodyCellBaseClassName: string
  textInputClassName: string
  monoTextInputClassName: string
  uiPanelMonospaceTextClass: string
  panelTypography: PanelTypography
  activeNode: GraphNode | undefined
  activeEdge: GraphEdge | undefined
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  updateEdge: (id: string, patch: Partial<GraphEdge>) => void
  freezeFirstDataColumn: 'none' | 'label' | 'id'
  showFrozenResizeHandle: boolean
  onFrozenAreaPointerDown?: (event: React.PointerEvent) => void
  fieldSettingsByColumnKey: Map<GraphDataTableColumnKey, GraphFieldSettingsResolved>
  onRequestOpenCellSelectEditor?: (args: {
    anchorEl: HTMLElement
    rowId: string
    scope: 'node' | 'edge'
    propertyKey: string
    kind: 'single-select' | 'multi-select'
    options: string[]
    initialValue: string
  }) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonRecord(text: string): Record<string, JSONValue> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed)) return null
    if (!isJsonValue(parsed)) return null
    return parsed as Record<string, JSONValue>
  } catch {
    return null
  }
}

function CellJsonEditor({
  initialValue,
  onSave,
}: {
  initialValue: unknown
  onSave: (val: Record<string, JSONValue>) => void
}) {
  const [text, setText] = React.useState(() => JSON.stringify(initialValue ?? {}, null, 2))
  
  return (
    <section
      className={`h-32 ${UI_RESPONSIVE_STRUCTURED_EDITOR_PANEL_CLASSNAME} border ${UI_THEME_TOKENS.panel.border} rounded overflow-hidden ${UI_THEME_TOKENS.panel.bg} shadow-[var(--kg-shadow-overlay)] relative z-10`}
      aria-label="Cell JSON Editor"
    >
      <MarkdownStructuredTextEditor
        value={text}
        onChange={setText}
        language="json"
        uri={`inmemory://cell/editor/${Math.random().toString(36).slice(2)}`}
        className="w-full h-full"
        onBlur={() => {
          const next = parseJsonRecord(text)
          if (!next) return
          onSave(next)
        }}
      />
    </section>
  )
}

export const BodyCell = React.memo(function BodyCell({
  columnKey,
  row,
  isActive,
  rowDensity,
  width,
  isColumnSelected,
  expandedCellRowId,
  expandedCellColumnKey,
  onToggleExpandCell,
  bodyCellBaseClassName,
  textInputClassName,
  monoTextInputClassName,
  uiPanelMonospaceTextClass,
  panelTypography,
  activeNode,
  activeEdge,
  updateNode,
  updateEdge,
  freezeFirstDataColumn,
  showFrozenResizeHandle,
  onFrozenAreaPointerDown,
  fieldSettingsByColumnKey,
  onRequestOpenCellSelectEditor,
}: BodyCellProps) {
  const widthStyle: React.CSSProperties | undefined =
    width != null ? { width, minWidth: width } : undefined
  const cellStyle: React.CSSProperties | undefined = isColumnSelected
    ? { ...(widthStyle || {}), backgroundColor: 'rgba(59,130,246,0.08)' }
    : widthStyle
  const isExpandedCell =
    rowDensity === 'expanded' ||
    (rowDensity === 'compact' &&
      expandedCellRowId === row.id &&
      expandedCellColumnKey === columnKey)
  if (columnKey === 'kind') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${UI_THEME_TOKENS.text.secondary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_KIND_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {row.kind}
      </td>
    )
  }

  if (columnKey === 'id') {
    const isFrozen = freezeFirstDataColumn === 'id'
    const style: React.CSSProperties | undefined = isFrozen
      ? { ...(cellStyle || {}), left: FROZEN_DATA_COLUMN_LEFT }
      : cellStyle
    return (
      <td
        className={`${bodyCellBaseClassName} relative ${
          isFrozen ? `sticky z-0 ${UI_THEME_TOKENS.panel.bg}` : ''
        } ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.primary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_ID_CELL_TEXT_CLASSNAME}`}
        style={style}
        title={row.id}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {row.id}
        {showFrozenResizeHandle && (
          <FrozenAreaResizeHandle
            onPointerDown={event => {
              if (!onFrozenAreaPointerDown) return
              try {
                event.preventDefault()
                event.stopPropagation()
              } catch {
                void 0
              }
              onFrozenAreaPointerDown(event)
            }}
            panelTypography={panelTypography}
          />
        )}
      </td>
    )
  }

  if (columnKey === 'label') {
    const isFrozen = freezeFirstDataColumn === 'label'
    const overflowClass = 'truncate overflow-hidden whitespace-nowrap'
    const style: React.CSSProperties | undefined = isFrozen
      ? { ...(cellStyle || {}), left: FROZEN_DATA_COLUMN_LEFT }
      : cellStyle
    return (
      <td
        className={`${bodyCellBaseClassName} relative ${
          isFrozen ? 'sticky z-0' : ''
        } ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.table.cellBorder} ${overflowClass}`}
        style={style}
        title={row.label}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {isActive ? (
          <GraphDataTableEditableCellInput
            defaultValue={row.label}
            onCommit={next => {
              if (row.kind === 'node') updateNode(row.id, { label: next })
              else updateEdge(row.id, { label: next })
            }}
            className={textInputClassName}
          />
        ) : (
          row.label
        )}
        {showFrozenResizeHandle && (
          <FrozenAreaResizeHandle
            onPointerDown={event => {
              if (!onFrozenAreaPointerDown) return
              try {
                event.preventDefault()
                event.stopPropagation()
              } catch {
                void 0
              }
              onFrozenAreaPointerDown(event)
            }}
            panelTypography={panelTypography}
          />
        )}
      </td>
    )
  }

  if (columnKey === 'type') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${UI_THEME_TOKENS.text.secondary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {row.kind === 'node' ? (
          isActive ? (
            <GraphDataTableEditableCellInput
              defaultValue={row.type}
              onCommit={next => updateNode(row.id, { type: next })}
              className={textInputClassName}
            />
          ) : (
            row.type
          )
        ) : (
          ''
        )}
      </td>
    )
  }

  if (columnKey === 'source') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.primary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {row.kind === 'edge' ? (
          isActive ? (
            <GraphDataTableEditableCellInput
              defaultValue={row.source}
              onCommit={next => updateEdge(row.id, { source: next })}
              className={monoTextInputClassName}
              list="node-ids"
            />
          ) : (
            row.source
          )
        ) : (
          ''
        )}
      </td>
    )
  }

  if (columnKey === 'target') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.primary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {row.kind === 'edge' ? (
          isActive ? (
            <GraphDataTableEditableCellInput
              defaultValue={row.target}
              onCommit={next => updateEdge(row.id, { target: next })}
              className={monoTextInputClassName}
              list="node-ids"
            />
          ) : (
            row.target
          )
        ) : (
          ''
        )}
      </td>
    )
  }

  if (columnKey === 'properties') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.primary} align-top ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {isActive ? (
          <CellJsonEditor
            initialValue={row.properties}
            onSave={(next) => {
              if (row.kind === 'node') {
                if (!activeNode) return
                updateNode(row.id, { properties: next })
              } else {
                if (!activeEdge) return
                updateEdge(row.id, { properties: next })
              }
            }}
          />
        ) : (
          stringifyPreview(row.properties)
        )}
      </td>
    )
  }

  if (columnKey === 'metadata') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.secondary} align-top ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {isActive ? (
          <CellJsonEditor
            initialValue={row.metadata}
            onSave={(next) => {
              if (row.kind === 'node') {
                if (!activeNode) return
                updateNode(row.id, { metadata: next })
              } else {
                if (!activeEdge) return
                updateEdge(row.id, { metadata: next })
              }
            }}
          />
        ) : (
          stringifyPreview(row.metadata)
        )}
      </td>
    )
  }

  if (columnKey === 'codebasePath') {
    return (
      <td
        className={`${bodyCellBaseClassName} ${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.primary} align-top ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
        style={cellStyle}
        onClick={() => {
          if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
            onToggleExpandCell(columnKey, row.id)
          }
        }}
      >
        {getRowFieldText(row, columnKey)}
      </td>
    )
  }

  if (isGraphDataTablePropertyColumnKey(columnKey)) {
    const parsed = parseGraphDataTablePropertyColumnKey(columnKey)
    const settings = fieldSettingsByColumnKey.get(columnKey)
    const isMultiSelect = settings?.fieldType === 'Multi-select'
    const isSingleSelect = settings?.fieldType === 'Single-select'

    if (parsed && row.kind === parsed.scope && (isMultiSelect || isSingleSelect)) {
      const raw = getGraphDataTablePropertyValue(row.properties, parsed.propertyKey)
      const values = isMultiSelect && Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === 'string')
        : []
      const singleValue = isSingleSelect && typeof raw === 'string' ? raw : ''

      const options = (settings?.selectOptions ?? []).slice()
      const optionSet = options.length > 0 ? new Set(options) : null

      const filteredValues =
        optionSet != null ? values.filter(v => optionSet.has(v)) : values
      const filteredSingleValue =
        optionSet != null && singleValue ? (optionSet.has(singleValue) ? singleValue : '') : singleValue

      const openEditor = (anchorEl: HTMLElement) => {
        if (!isActive) return
        if (!onRequestOpenCellSelectEditor) return
        const kind: 'single-select' | 'multi-select' = isMultiSelect ? 'multi-select' : 'single-select'
        const initialValue = isMultiSelect ? filteredValues.join(', ') : filteredSingleValue
        onRequestOpenCellSelectEditor({
          anchorEl,
          rowId: row.id,
          scope: parsed.scope,
          propertyKey: parsed.propertyKey,
          kind,
          options,
          initialValue,
        })
      }

      return (
        <td
          className={`${bodyCellBaseClassName} ${UI_THEME_TOKENS.text.primary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
          style={cellStyle}
          onClick={() => {
            if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
              onToggleExpandCell(columnKey, row.id)
            }
          }}
          onDoubleClick={event => {
            if (!isActive) return
            try {
              event.preventDefault()
              event.stopPropagation()
            } catch {
              void 0
            }
            openEditor(event.currentTarget)
          }}
        >
          {isMultiSelect ? (
            filteredValues.length === 0 ? (
              ''
            ) : (
              <section className="flex flex-nowrap gap-1 overflow-hidden whitespace-nowrap">
                {filteredValues.map((value, i) => (
                  <DataViewTagChip key={`${value}-${i}`} value={value} />
                ))}
              </section>
            )
          ) : filteredSingleValue ? (
            <DataViewTagChip value={filteredSingleValue} />
          ) : (
            ''
          )}
        </td>
      )
    }
  }

  return (
    <td
      className={`${bodyCellBaseClassName} ${UI_THEME_TOKENS.text.primary} ${UI_RESPONSIVE_GRAPH_DATA_TABLE_COMPACT_CELL_TEXT_CLASSNAME}`}
      style={cellStyle}
      onClick={() => {
        if (rowDensity === 'compact' && !isActive && onToggleExpandCell) {
          onToggleExpandCell(columnKey, row.id)
        }
      }}
    >
      {getRowFieldText(row, columnKey)}
    </td>
  )
})
