import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphField, GraphFieldId, GraphFieldSettingsById, GraphFieldSettingsResolved, GraphFieldType } from '@/features/graph-fields/graphFields'
import { GRAPH_FIELD_TYPES, parseGraphFieldId } from '@/features/graph-fields/graphFields'
import type { GraphDataTableColumnKey } from '@/features/graph-data-table/graphDataTable'
import { isGraphDataTablePropertyColumnKey } from '@/features/graph-data-table/graphDataTable'
import {
  BaseFieldIcon,
  FieldColorIcon,
  FieldOriginIcon,
  FieldTypeBadgeIcon,
  GraphFieldsIcon,
  GripDotsIcon,
  ScopeIcon,
  VisibilityIcon,
} from '@/features/graph-fields/ui/graphFieldIcons'
import { UI_RING_PRIMARY_BLUE_INDICATOR } from '@/features/toolbar/ui/toolbarStyles'
import Tooltip from '@/features/panels/ui/Tooltip'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import {
  UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_LIST_ROW_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_TYPE_SELECT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type GraphFieldsListRowProps = {
  columnKey: GraphDataTableColumnKey
  label: string
  graphFieldId: GraphFieldId | null
  field: GraphField | null
  settings: GraphFieldSettingsResolved | null
  settingsById: GraphFieldSettingsById
  schema: GraphSchema | null
  schemaDefinedFieldIds: ReadonlySet<GraphFieldId>
  styleOwnerByFieldId: ReadonlyMap<GraphFieldId, string>
  nodeStyleOwnerKey: string
  edgeStyleOwnerKey: string
  nodeScopeBorderColor: string
  edgeScopeBorderColor: string
  uiPanelKeyValueTextSizeClass: string
  iconSizeClass: string
  uiIconStrokeWidth: number
  visible: boolean
  isOnlyVisibleColumn: boolean
  active: boolean
  isDragOver: boolean
  draggingDataTableColumnKey: GraphDataTableColumnKey | null
  setSelectedFieldId: (id: GraphFieldId | null) => void
  setDataTableColumnVisibility: (key: GraphDataTableColumnKey, visible: boolean) => void
  moveDataTableColumn: (from: GraphDataTableColumnKey, to: GraphDataTableColumnKey) => void
  updateGraphFieldSettings: (fieldId: GraphFieldId, patch: Partial<GraphFieldSettingsResolved>) => void
  updateNodeStyle: (type: string, style: Partial<{ color: string }>) => void
  updateEdgeStyle: (label: string, style: Partial<{ color: string; width: number }>) => void
  setDraggingDataTableColumnKey: (key: GraphDataTableColumnKey | null) => void
  setDragOverDataTableColumnKey: (key: GraphDataTableColumnKey | null) => void
}

export const GraphFieldsListRow = React.memo(function GraphFieldsListRow({
  columnKey,
  label,
  graphFieldId,
  field,
  settings,
  settingsById,
  schema,
  schemaDefinedFieldIds,
  styleOwnerByFieldId,
  nodeStyleOwnerKey,
  edgeStyleOwnerKey,
  nodeScopeBorderColor,
  edgeScopeBorderColor,
  uiPanelKeyValueTextSizeClass,
  iconSizeClass,
  uiIconStrokeWidth,
  visible,
  isOnlyVisibleColumn,
  active,
  isDragOver,
  draggingDataTableColumnKey,
  setSelectedFieldId,
  setDataTableColumnVisibility,
  moveDataTableColumn,
  updateGraphFieldSettings,
  updateNodeStyle,
  updateEdgeStyle,
  setDraggingDataTableColumnKey,
  setDragOverDataTableColumnKey,
}: GraphFieldsListRowProps) {
  const panelTypography = usePanelTypography()
  const isPropertyColumn = isGraphDataTablePropertyColumnKey(columnKey)
  const isCustomField = settings?.isCustom === true

  const scope: 'node' | 'edge' | null = field
    ? field.scope
    : graphFieldId
      ? parseGraphFieldId(graphFieldId)?.scope ?? null
      : null

  let styleOwnerKey: string | null = null
  if (field && scope) {
    const candidate = styleOwnerByFieldId.get(field.id)
    styleOwnerKey = candidate ?? (scope === 'node' ? nodeStyleOwnerKey : edgeStyleOwnerKey)
  } else if (scope === 'node') {
    styleOwnerKey = nodeStyleOwnerKey
  } else if (scope === 'edge') {
    styleOwnerKey = edgeStyleOwnerKey
  }

  const borderColor =
    scope === 'node'
      ? (styleOwnerKey && schema?.nodeStyles?.[styleOwnerKey]?.color?.trim()) || nodeScopeBorderColor
      : scope === 'edge'
        ? (styleOwnerKey && schema?.edgeStyles?.[styleOwnerKey]?.color?.trim()) || edgeScopeBorderColor
        : null

  const scopeColor = borderColor || '#9CA3AF'
  const colorInputValue =
    typeof scopeColor === 'string' && scopeColor.trim().startsWith('#') ? scopeColor.trim() : '#000000'
  const fieldInputClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME} w-full rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} text-xs ${UI_THEME_TOKENS.text.primary}`
  const typeSelectClassName = [MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, UI_RESPONSIVE_GRAPH_FIELDS_TYPE_SELECT_CLASSNAME, 'text-left'].join(' ')

  const scopeIconNode = field ? (
    <ScopeIcon scope={field.scope} className={`${iconSizeClass} ${UI_THEME_TOKENS.icon.color}`} strokeWidth={uiIconStrokeWidth} />
  ) : (
    <GraphFieldsIcon className={`${iconSizeClass} ${UI_THEME_TOKENS.icon.color}`} strokeWidth={uiIconStrokeWidth} />
  )

  const originIconNode = (() => {
    if (field) {
      if (isCustomField) {
        return (
          <FieldOriginIcon
            isCustom
            className="inline-flex items-center justify-center"
            iconClassName={iconSizeClass}
            strokeWidth={uiIconStrokeWidth}
          />
        )
      }
      if (schemaDefinedFieldIds.has(field.id)) {
        return (
          <BaseFieldIcon
            className="inline-flex items-center justify-center"
            iconClassName={iconSizeClass}
            strokeWidth={uiIconStrokeWidth}
          />
        )
      }
      return (
        <FieldOriginIcon
          isCustom={false}
          className="inline-flex items-center justify-center"
          iconClassName={iconSizeClass}
          strokeWidth={uiIconStrokeWidth}
        />
      )
    }
    if (!isPropertyColumn) {
      return (
        <BaseFieldIcon
          className="inline-flex items-center justify-center"
          iconClassName={iconSizeClass}
          strokeWidth={uiIconStrokeWidth}
        />
      )
    }
    const parsed = parseGraphFieldId(graphFieldId ? String(graphFieldId) : '')
    if (!parsed) return null
    const settingsEntry = settingsById[`${parsed.scope}:${parsed.key}` as GraphFieldId]
    if (!settingsEntry) return null
    const isCustom = settingsEntry.isCustom === true
    return (
      <FieldOriginIcon
        isCustom={isCustom}
        className="inline-flex items-center justify-center"
        iconClassName={iconSizeClass}
        strokeWidth={uiIconStrokeWidth}
      />
    )
  })()

  const typeBadgeNode = field ? (
    <FieldTypeBadgeIcon
      kind={field.kind}
      fieldTypeLabel={settings?.fieldType}
      className={iconSizeClass}
      strokeWidth={uiIconStrokeWidth}
    />
  ) : null

  const colorSwatchNode =
    scope === 'node' || scope === 'edge' ? (
      (() => {
        const colorLabel = scope === 'node' ? UI_COPY.graphFieldsNodeColorLabel : UI_COPY.graphFieldsEdgeColorLabel
        const tooltipText = UI_COPY.graphFieldsColorSwatchTooltip(scope)
        return (
          <Tooltip content={tooltipText} maxWidthPx={260}>
            <label className={`inline-flex items-center justify-center relative group ${UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME}`} aria-label={colorLabel}>
              <FieldColorIcon
                color={scopeColor}
                className="inline-flex items-center justify-center"
                iconClassName={iconSizeClass}
              />
              <input
                type="color"
                className="absolute inset-0 opacity-0 cursor-pointer bg-transparent"
                value={colorInputValue}
                onChange={e => {
                  const next = String(e.target.value || '').trim()
                  if (!next || !next.startsWith('#')) return
                  if (!scope || !styleOwnerKey) return
                  if (scope === 'node') {
                    updateNodeStyle(styleOwnerKey, { color: next })
                  } else {
                    updateEdgeStyle(styleOwnerKey, { color: next })
                  }
                }}
                aria-label={colorLabel}
              />
            </label>
          </Tooltip>
        )
      })()
    ) : (
      <FieldColorIcon
        color={scopeColor}
        className="inline-flex items-center justify-center"
        iconClassName={iconSizeClass}
      />
    )

  return (
      <section
        className={[
          `${UI_RESPONSIVE_GRAPH_FIELDS_LIST_ROW_CLASSNAME} border-b ${UI_THEME_TOKENS.panel.divider} last:border-b-0`,
          'flex items-center gap-2 border-l-2',
          active ? UI_THEME_TOKENS.table.rowSelected : UI_THEME_TOKENS.table.rowHoverHighlight,
          isDragOver ? ['ring-1', UI_RING_PRIMARY_BLUE_INDICATOR].join(' ') : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={borderColor ? { borderLeftColor: borderColor } : undefined}
        draggable
        onClick={() => {
          if (graphFieldId) setSelectedFieldId(graphFieldId)
        }}
        onDragStart={e => {
          const t = e.target as HTMLElement | null
          if (t?.tagName && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'LABEL'].includes(t.tagName)) {
            e.preventDefault()
            return
          }
          setDraggingDataTableColumnKey(columnKey)
          setDragOverDataTableColumnKey(columnKey)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(columnKey))
        }}
        onDragOver={e => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverDataTableColumnKey(columnKey)
        }}
        onDrop={e => {
          e.preventDefault()
          const from = (e.dataTransfer.getData('text/plain') || '') as GraphDataTableColumnKey
          if (from) moveDataTableColumn(from, columnKey)
          setDraggingDataTableColumnKey(null)
          setDragOverDataTableColumnKey(null)
        }}
        onDragEnd={() => {
          setDraggingDataTableColumnKey(null)
          setDragOverDataTableColumnKey(null)
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOverDataTableColumnKey(null)
          }
        }}
      >
        <section className="flex items-center gap-2 min-w-0 flex-1">
          <GripDotsIcon className={`${iconSizeClass} ${UI_THEME_TOKENS.text.tertiary}`} />
          <section className="min-w-0 flex-1">
            <section className="min-w-0 flex items-center gap-2">
              {scopeIconNode}
              <section className="min-w-0">
                {active && field && settings ? (
                  <section className="min-w-0 flex items-center gap-2">
                    <PanelTextInput
                      value={settings.displayName}
                      onChange={e => updateGraphFieldSettings(field.id, { displayName: e.target.value })}
                      className={fieldInputClassName}
                      onClick={e => e.stopPropagation()}
                    />
                    <PanelSelect
                      value={settings.fieldType}
                      onValueChange={selectedValueInput => updateGraphFieldSettings(field.id, { fieldType: selectedValueInput as GraphFieldType })}
                      className={typeSelectClassName}
                      onClick={e => e.stopPropagation()}
                    >
                      {GRAPH_FIELD_TYPES.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </PanelSelect>
                  </section>
                ) : (
                  <>
                    <section className={`flex items-center gap-1 min-w-0 ${panelTypography.panelTextClass} ${UI_THEME_TOKENS.text.primary} truncate`}>
                      <span className="truncate">{settings?.displayName || label}</span>
                    </section>
                    <section className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary} truncate`}>
                      {graphFieldId || columnKey}
                    </section>
                  </>
                )}
              </section>
            </section>
          </section>
        </section>

        <section className="flex items-center gap-2">
          {draggingDataTableColumnKey === columnKey ? (
            <span className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>{UI_LABELS.moving}</span>
          ) : null}
          {originIconNode}
          {!active || !field || !settings ? typeBadgeNode : null}
          <span className={`inline-flex items-center justify-center ${UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME}`}>{colorSwatchNode}</span>
          <button
            type="button"
            className={`inline-flex items-center justify-center ${UI_RESPONSIVE_GRAPH_FIELDS_COMPACT_ICON_CELL_CLASSNAME} disabled:opacity-40`}
            disabled={visible && isOnlyVisibleColumn}
            onClick={() => {
              const nextVisible = !visible
              setDataTableColumnVisibility(columnKey, nextVisible)
              if (graphFieldId) setSelectedFieldId(graphFieldId)
            }}
            aria-pressed={visible}
          >
            <VisibilityIcon hidden={!visible} iconClassName={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
          </button>
        </section>
      </section>
  )
})
