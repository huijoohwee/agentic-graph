import React from 'react'

import { Trash2 } from 'lucide-react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelCheckbox, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { getIconSizeClass } from '@/lib/ui'
import {
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME,
  UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_RING_PRIMARY_BLUE_INDICATOR } from '@/features/toolbar/ui/toolbarStyles'
import { GripDotsIcon, VisibilityIcon } from '@/features/graph-fields/ui/graphFieldIcons'

import type { StoryboardWidgetMappingRow, FlowMappingRowDirection, FlowMappingRowType } from '@/features/storyboard-widget-manager/mappingRows'

const TYPE_OPTIONS: Array<{ value: FlowMappingRowType; label: string }> = [
  { value: 'text', label: 'text' },
  { value: 'textarea', label: 'textarea' },
  { value: 'select', label: 'select' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'json', label: 'json' },
  { value: 'port', label: 'port' },
]

const DIRECTION_OPTIONS: Array<{ value: FlowMappingRowDirection; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'input', label: 'input' },
  { value: 'output', label: 'output' },
]

export default function FlowMappingRowsTable({
  rows,
  onChange,
  onDelete,
  onReorder,
}: {
  rows: StoryboardWidgetMappingRow[]
  onChange: (id: string, patch: Partial<StoryboardWidgetMappingRow>) => void
  onDelete: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
}) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const uiPanelKeyValueInputClass = useGraphStore(s => s.uiPanelKeyValueInputClass)
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass)
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const tableFieldClassName = `${UI_RESPONSIVE_FLOW_MANAGER_TABLE_FIELD_CLASSNAME} rounded ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.text} ${uiPanelKeyValueInputClass}`
  const selectionControlClassName = `rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`
  const tableHeaderCellClassName = `${UI_RESPONSIVE_FLOW_MANAGER_TABLE_HEADER_CELL_CLASSNAME} text-xs font-semibold ${UI_THEME_TOKENS.text.secondary}`
  const tableActionHeaderCellClassName = `${UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_HEADER_CELL_CLASSNAME} text-xs font-semibold ${UI_THEME_TOKENS.text.secondary}`
  const tableCellClassName = `${UI_RESPONSIVE_FLOW_MANAGER_TABLE_CELL_CLASSNAME} ${UI_THEME_TOKENS.panel.border}`
  const tableActionCellClassName = `${UI_RESPONSIVE_FLOW_MANAGER_TABLE_ACTION_CELL_CLASSNAME} ${UI_THEME_TOKENS.panel.border}`

  const [draggingRowId, setDraggingRowId] = React.useState<string | null>(null)
  const [dragOverRowId, setDragOverRowId] = React.useState<string | null>(null)

  const onDragStart = React.useCallback(
    (rowId: string, e: React.DragEvent) => {
      const id = String(rowId || '').trim()
      if (!id) return
      setDraggingRowId(id)
      setDragOverRowId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    [],
  )

  const onDragEnd = React.useCallback(() => {
    setDraggingRowId(null)
    setDragOverRowId(null)
  }, [])

  const onDragOverRow = React.useCallback((rowId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverRowId(String(rowId || '').trim() || null)
  }, [])

  const onDropRow = React.useCallback(
    (rowId: string, e: React.DragEvent) => {
      e.preventDefault()
      const toId = String(rowId || '').trim()
      const fromId = String(e.dataTransfer.getData('text/plain') || '').trim()
      if (!fromId || !toId || fromId === toId) {
        setDraggingRowId(null)
        setDragOverRowId(null)
        return
      }
      onReorder(fromId, toId)
      setDraggingRowId(null)
      setDragOverRowId(null)
    },
    [onReorder],
  )

  return (
    <table className={`w-full border-separate border-spacing-0 ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass}`}>
      <thead>
        <tr>
          <th className={tableHeaderCellClassName}>Move</th>
          <th className={tableHeaderCellClassName}>Key</th>
          <th className={tableHeaderCellClassName}>Type</th>
          <th className={tableHeaderCellClassName}>JSON Key</th>
          <th className={tableHeaderCellClassName}>Required</th>
          <th className={tableHeaderCellClassName}>Direction</th>
          <th className={tableActionHeaderCellClassName}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const keyId = `flow-map-key-${r.id}`
          const typeId = `flow-map-type-${r.id}`
          const valueId = `flow-map-value-${r.id}`
          const reqId = `flow-map-required-${r.id}`
          const dirId = `flow-map-direction-${r.id}`
          const isPort = r.type === 'port'
          const visible = r.isHidden !== true
          const isDragOver = !!dragOverRowId && dragOverRowId === r.id
          const isDragging = !!draggingRowId && draggingRowId === r.id
          return (
            <tr
              key={r.id}
              className={[
                UI_THEME_TOKENS.table.rowHoverHighlight,
                isDragOver ? ['ring-1', UI_RING_PRIMARY_BLUE_INDICATOR].join(' ') : '',
                !visible ? 'opacity-60' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={e => onDragOverRow(r.id, e)}
              onDrop={e => onDropRow(r.id, e)}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverRowId(null)
              }}
            >
              <td className={tableCellClassName}>
                <button
                  type="button"
                  className={`${UI_THEME_TOKENS.button.text} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME} rounded ${UI_THEME_TOKENS.button.hoverBg}`}
                  draggable
                  onDragStart={e => onDragStart(r.id, e)}
                  onDragEnd={onDragEnd}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                  aria-label="Reorder row"
                  title="Reorder row"
                >
                  <GripDotsIcon className={`${iconSizeClass} ${UI_THEME_TOKENS.text.tertiary}`} />
                </button>
              </td>
              <td className={tableCellClassName}>
                <label className="sr-only" htmlFor={keyId}>Key</label>
                <PanelTextInput
                  id={keyId}
                  className={tableFieldClassName}
                  value={r.key}
                  onChange={e => onChange(r.id, { key: e.target.value })}
                  placeholder="key"
                />
              </td>
              <td className={tableCellClassName}>
                <label className="sr-only" htmlFor={typeId}>Type</label>
                <PanelSelect
                  id={typeId}
                  className={tableFieldClassName}
                  value={r.type}
                  onValueChange={selectedValueInput => {
                    const nextType = selectedValueInput as FlowMappingRowType
                    const nextDirection: FlowMappingRowDirection =
                      nextType === 'port' ? (r.direction === 'default' ? 'output' : r.direction) : 'default'
                    onChange(r.id, { type: nextType, direction: nextDirection })
                  }}
                >
                  {TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </PanelSelect>
              </td>
              <td className={tableCellClassName}>
                <label className="sr-only" htmlFor={valueId}>JSON Key</label>
                <PanelTextInput
                  id={valueId}
                  className={tableFieldClassName}
                  value={r.value}
                  onChange={e => onChange(r.id, { value: e.target.value })}
                  placeholder="schemaPath"
                />
              </td>
              <td className={tableCellClassName}>
                <label className="sr-only" htmlFor={reqId}>Required</label>
                <PanelCheckbox
                  id={reqId}
                  className={selectionControlClassName}
                  checked={!!r.required}
                  onChange={e => onChange(r.id, { required: e.target.checked })}
                  disabled={isPort}
                />
              </td>
              <td className={tableCellClassName}>
                <label className="sr-only" htmlFor={dirId}>Direction</label>
                <PanelSelect
                  id={dirId}
                  className={tableFieldClassName}
                  value={r.direction}
                  onValueChange={selectedValueInput => {
                    const nextDirection = selectedValueInput as FlowMappingRowDirection
                    const nextType = nextDirection === 'default' ? (r.type === 'port' ? 'text' : r.type) : 'port'
                    onChange(r.id, { direction: nextDirection, type: nextType })
                  }}
                  disabled={!isPort && r.direction === 'default'}
                >
                  {DIRECTION_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </PanelSelect>
              </td>
              <td className={tableActionCellClassName}>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} mr-1`}
                  onClick={() => onChange(r.id, { isHidden: visible })}
                  aria-label={visible ? 'Hide row' : 'Show row'}
                  title={visible ? 'Hide row' : 'Show row'}
                >
                  <VisibilityIcon hidden={!visible} iconClassName={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
                </button>
                <button
                  type="button"
                  className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
                  onClick={() => onDelete(r.id)}
                  aria-label="Delete row"
                  title="Delete row"
                >
                  <Trash2 className={`${iconSizeClass}`} strokeWidth={uiIconStrokeWidth} />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
