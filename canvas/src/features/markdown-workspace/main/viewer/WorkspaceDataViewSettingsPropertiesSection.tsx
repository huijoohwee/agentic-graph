import React from 'react'
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Link2, Search, Trash2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING } from '@/lib/ui/focusRing'
import { defaultColumnTypeForInferredKind, type MarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import { MarkdownDataViewAddColumnMenu } from '@/features/markdown/ui/MarkdownDataViewAddColumnMenu'
import { MarkdownDataViewColumnTypeMenu } from '@/features/markdown/ui/MarkdownDataViewColumnTypeMenu'
import { iconByColumnType } from '@/features/markdown/ui/markdownDataViewColumnTypeMenuIcons'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { GripDotsIcon, VisibilityIcon } from '@/features/graph-fields/ui/graphFieldIcons'
import { UI_COLOR_PRIMARY_BLUE_INDICATOR } from '@/features/toolbar/ui/toolbarStyles'
import { reorderList } from '@/lib/reorder'
import { DetailsMenu } from '@/components/ui/DetailsMenu'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { getDataViewIconButtonClassName } from '@/lib/ui/dataViewToolbarButton'
import { WORKSPACE_DATA_VIEW_GRAPH_ROLE_OPTIONS, inferRoleForColumn } from './workspaceDataViewGraphRoles'
import type { WorkspaceDataViewGraphColumnRole } from './workspaceDataViewConfig'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import {
  WorkspaceDataViewComfortableTextInput,
  WorkspaceDataViewFieldSelect,
  WorkspaceDataViewSearchInput,
} from './WorkspaceDataViewSettingsPrimitives'

const PROPERTY_ICON_BUTTON_CLASS = getDataViewIconButtonClassName({ variant: 'ghost' })
const PROPERTY_SMALL_ICON_BUTTON_CLASS = getDataViewIconButtonClassName({ size: 'sm', variant: 'ghost' })
const PROPERTY_SMALL_ICON_PLACEHOLDER_CLASS = getDataViewIconButtonClassName({ size: 'sm', variant: 'ghost', className: 'opacity-70 pointer-events-none' })

export function WorkspaceDataViewSettingsPropertiesSection(props: {
  canMutate: boolean
  columns: readonly MarkdownDataViewColumn[]
  view: WorkspaceDataViewConfig
  onChangeView: (next: WorkspaceDataViewConfig) => void
  onAddColumn?: (args: { name: string; columnType: MarkdownDataViewColumnType }) => void
  onDuplicateColumn?: (columnId: string) => void
  onDeleteColumn?: (columnId: string) => void
  onRenameColumn?: (columnId: string, nextName: string) => void
}) {
  const MAP_SELECT_CHEVRON_ALIGN_CLASS = 'mr-0'
  const COLUMN_NAME_EDIT_INPUT_CLASS = [
    `${UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME} rounded border text-sm flex-1`,
    'overflow-x-auto whitespace-nowrap [text-overflow:clip]',
    UI_FOCUS_RING,
    UI_THEME_TOKENS.input.bg,
    UI_THEME_TOKENS.input.border,
    UI_THEME_TOKENS.input.text,
  ].join(' ')
  const [draggingColumnId, setDraggingColumnId] = React.useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = React.useState<string | null>(null)
  const [editingColumnId, setEditingColumnId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState('')
  const [expandedColumnId, setExpandedColumnId] = React.useState<string | null>(null)
  const [fieldSearchQuery, setFieldSearchQuery] = React.useState('')

  const allIds = React.useMemo(() => props.columns.map(c => c.id), [props.columns])

  const visibleIds = React.useMemo(() => {
    const raw = props.view.visibleColumnIds
    if (!raw) return allIds
    const set = new Set(raw)
    const normalized = raw.filter(id => allIds.includes(id))
    for (const id of allIds) {
      if (!set.has(id)) continue
      if (normalized.includes(id)) continue
      normalized.push(id)
    }
    return normalized
  }, [allIds, props.view.visibleColumnIds])

  const hiddenIds = React.useMemo(() => {
    const visibleSet = new Set(visibleIds)
    return allIds.filter(id => !visibleSet.has(id))
  }, [allIds, visibleIds])
  const normalizedFieldSearchQuery = fieldSearchQuery.trim().toLowerCase()
  const filteredVisibleIds = React.useMemo(() => {
    if (!normalizedFieldSearchQuery) return visibleIds
    return visibleIds.filter(columnId => {
      const column = props.columns.find(item => item.id === columnId)
      if (!column) return false
      return column.name.toLowerCase().includes(normalizedFieldSearchQuery)
        || column.kind.toLowerCase().includes(normalizedFieldSearchQuery)
    })
  }, [normalizedFieldSearchQuery, props.columns, visibleIds])
  const filteredHiddenIds = React.useMemo(() => {
    if (!normalizedFieldSearchQuery) return hiddenIds
    return hiddenIds.filter(columnId => {
      const column = props.columns.find(item => item.id === columnId)
      if (!column) return false
      return column.name.toLowerCase().includes(normalizedFieldSearchQuery)
        || column.kind.toLowerCase().includes(normalizedFieldSearchQuery)
    })
  }, [hiddenIds, normalizedFieldSearchQuery, props.columns])

  const setVisibleIds = React.useCallback(
    (nextVisibleIds: readonly string[]) => {
      const normalized = nextVisibleIds.filter(id => allIds.includes(id))
      const isDefaultAllVisibleOrder =
        normalized.length === allIds.length && normalized.every((id, idx) => id === allIds[idx])
      props.onChangeView({
        ...props.view,
        visibleColumnIds: isDefaultAllVisibleOrder ? null : [...normalized],
      })
    },
    [allIds, props],
  )

  const setColumnVisible = React.useCallback(
    (columnId: string, visible: boolean) => {
      if (visible) {
        if (visibleIds.includes(columnId)) return
        setVisibleIds([...visibleIds, columnId])
        return
      }
      if (!visibleIds.includes(columnId)) return
      setVisibleIds(visibleIds.filter(id => id !== columnId))
    },
    [setVisibleIds, visibleIds],
  )

  const moveVisibleColumn = React.useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      const fromIndex = visibleIds.indexOf(fromId)
      const toIndex = visibleIds.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0) return
      const next = reorderList(visibleIds, fromIndex, toIndex)
      setVisibleIds(next)
    },
    [setVisibleIds, visibleIds],
  )
  const setColumnType = React.useCallback(
    (args: { column: MarkdownDataViewColumn; nextType: MarkdownDataViewColumnType }) => {
      const defaultType = defaultColumnTypeForInferredKind(args.column.kind)
      const nextMap = { ...(props.view.columnTypesById ?? {}) }
      if (args.nextType === defaultType) delete nextMap[args.column.id]
      else nextMap[args.column.id] = args.nextType
      const normalized = Object.keys(nextMap).length ? nextMap : null
      props.onChangeView({
        ...props.view,
        columnTypesById: normalized,
      })
    },
    [props],
  )
  const setColumnGraphRole = React.useCallback(
    (columnId: string, role: WorkspaceDataViewGraphColumnRole) => {
      const nextMap = { ...(props.view.graphRolesByColumnId ?? {}) }
      nextMap[columnId] = role
      props.onChangeView({
        ...props.view,
        graphRolesByColumnId: nextMap,
      })
    },
    [props],
  )

  const icon14 = ['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')

  const startRename = React.useCallback(
    (columnId: string, currentName: string) => {
      if (!props.canMutate) return
      if (!props.onRenameColumn) return
      setEditingColumnId(columnId)
      setEditingName(String(currentName ?? ''))
    },
    [props.canMutate, props.onRenameColumn],
  )

  const commitRename = React.useCallback(
    (columnId: string) => {
      if (!props.canMutate) return
      if (!props.onRenameColumn) return
      const next = String(editingName ?? '').trim()
      setEditingColumnId(null)
      if (!next) return
      props.onRenameColumn(columnId, next)
    },
    [editingName, props],
  )

  return (
    <section aria-label="Properties">
      <section className="mb-3 space-y-2" aria-label="Properties field inventory">
        <label className={['flex min-w-0 items-center gap-2 rounded border px-2 py-1', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border].join(' ')}>
          <Search className={['h-4 w-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
          <WorkspaceDataViewSearchInput
            className={[UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME, UI_THEME_TOKENS.input.text].join(' ')}
            value={fieldSearchQuery}
            onChange={event => setFieldSearchQuery(event.target.value)}
            placeholder="Search properties"
          />
        </label>
        <section className="max-h-48 space-y-1 overflow-y-auto pr-1" aria-label="Properties field inventory list">
          {filteredVisibleIds.map(columnId => {
            const column = props.columns.find(item => item.id === columnId)
            if (!column) return null
            return (
              <section
                key={`inventory:${column.id}`}
                className={[
                  UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME,
                  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
                  'gap-2',
                  UI_THEME_TOKENS.panel.border,
                ].join(' ')}
              >
                <button
                  type="button"
                  className={['App-toolbar__btn shrink-0', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  aria-label={`Hide property: ${column.name}`}
                  onClick={() => setColumnVisible(column.id, false)}
                >
                  <Eye className={['h-4 w-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                </button>
                <section className="min-w-0 flex-1">
                  <section className={['text-xs font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>
                    {column.name}
                  </section>
                  <section className={['text-xs', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>
                    {column.kind}
                  </section>
                </section>
              </section>
            )
          })}
          {filteredHiddenIds.map(columnId => {
            const column = props.columns.find(item => item.id === columnId)
            if (!column) return null
            return (
              <section
                key={`inventory:${column.id}`}
                className={[
                  UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME,
                  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
                  'gap-2',
                  UI_THEME_TOKENS.panel.border,
                ].join(' ')}
              >
                <button
                  type="button"
                  className={['App-toolbar__btn shrink-0', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  aria-label={`Show property: ${column.name}`}
                  onClick={() => setColumnVisible(column.id, true)}
                >
                  <EyeOff className={['h-4 w-4', UI_THEME_TOKENS.text.tertiary].join(' ')} aria-hidden="true" />
                </button>
                <section className="min-w-0 flex-1">
                  <section className={['text-xs font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.tertiary].join(' ')}>
                    {column.name}
                  </section>
                  <section className={['text-xs', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>
                    {column.kind}
                  </section>
                </section>
              </section>
            )
          })}
          {(filteredVisibleIds.length + filteredHiddenIds.length) === 0 ? (
            <section className={['px-2 py-1 text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
              No properties match.
            </section>
          ) : null}
        </section>
      </section>
      {props.canMutate && props.onAddColumn ? (
        <section className="mb-3" aria-label="Add column">
          <MarkdownDataViewAddColumnMenu
            ariaLabel="Add column"
            nextColumnNumber={props.columns.length + 1}
            canMutate={props.canMutate}
            onAddColumn={props.onAddColumn}
            summaryClassName={[
              UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
              'inline-flex h-9 rounded border px-3 text-sm',
              UI_THEME_TOKENS.panel.border,
              UI_THEME_TOKENS.button.hoverBg,
              UI_THEME_TOKENS.text.primary,
            ].join(' ')}
            summaryContent={<span className={UI_TEXT_TRUNCATE}>Add column</span>}
            menuPositionClassName={`mt-2 ${UI_RESPONSIVE_DATA_VIEW_MENU_PANEL_CLASSNAME}`}
          />
        </section>
      ) : null}
      <section className="space-y-1" aria-label="Properties chooser">
        {visibleIds.map(columnId => {
          const c = props.columns.find(x => x.id === columnId)
          if (!c) return null
          const visible = true
          const type = (props.view.columnTypesById && props.view.columnTypesById[c.id]) || defaultColumnTypeForInferredKind(c.kind)
          const graphRole = (props.view.graphRolesByColumnId && props.view.graphRolesByColumnId[c.id]) || inferRoleForColumn(c.name)
          const Icon = iconByColumnType[type]
          const isDragOver = dragOverColumnId === c.id && draggingColumnId && draggingColumnId !== c.id
          const isExpanded = expandedColumnId === c.id

          return (
            <section
              key={c.id}
              className={[
                `relative ${UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME}`,
                UI_THEME_TOKENS.panel.border,
                UI_THEME_TOKENS.button.hoverBg,
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={editingColumnId !== c.id}
              onDragStart={e => {
                const t = e.target as HTMLElement | null
                if (t?.tagName && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'LABEL'].includes(t.tagName)) {
                  e.preventDefault()
                  return
                }
                setDraggingColumnId(c.id)
                setDragOverColumnId(c.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(c.id))
              }}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverColumnId(c.id)
              }}
              onDrop={e => {
                e.preventDefault()
                const from = String(e.dataTransfer.getData('text/plain') || '').trim()
                if (from) moveVisibleColumn(from, c.id)
                setDraggingColumnId(null)
                setDragOverColumnId(null)
              }}
              onDragEnd={() => {
                setDraggingColumnId(null)
                setDragOverColumnId(null)
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOverColumnId(null)
                }
              }}
            >
              {isDragOver ? (
                <section className={UI_RESPONSIVE_DATA_VIEW_REORDER_INDICATOR_CLASSNAME} style={{ backgroundColor: UI_COLOR_PRIMARY_BLUE_INDICATOR }} />
              ) : null}

              <section className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}>
                <section className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <GripDotsIcon className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.text.tertiary].join(' ')} />

                  <DetailsMenu
                    ariaLabel={`Property type: ${c.name}`}
                    detailsClassName="relative"
                    summaryClassName={[
                      PROPERTY_SMALL_ICON_BUTTON_CLASS,
                      'list-none cursor-pointer',
                    ].join(' ')}
                    menuClassName="kg-column-header-children kg-click-expand-menu-children mt-1"
                    summary={<Icon className={icon14} aria-hidden="true" />}
                    menu={({ close }) => (
                      <MarkdownDataViewColumnTypeMenu
                        ariaLabel={`Property type: ${c.name}`}
                        value={type}
                        onSelect={(next) => {
                          setColumnType({ column: c, nextType: next })
                          close()
                        }}
                      />
                    )}
                  />

                  {editingColumnId === c.id ? (
                    <WorkspaceDataViewComfortableTextInput
                      autoFocus
                      className={COLUMN_NAME_EDIT_INPUT_CLASS}
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename(c.id)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingColumnId(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={['text-sm min-w-0 text-left', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}
                      onClick={() => setExpandedColumnId(prev => (prev === c.id ? null : c.id))}
                      onDoubleClick={() => startRename(c.id, c.name)}
                      aria-expanded={isExpanded}
                      aria-controls={`property-map-panel-${c.id}`}
                    >
                      {c.name}
                    </button>
                  )}
                </section>

                <section className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={PROPERTY_ICON_BUTTON_CLASS}
                    onClick={() => setColumnVisible(c.id, false)}
                    aria-pressed={visible}
                    aria-label="Hide"
                  >
                    <VisibilityIcon hidden={!visible} iconClassName="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    className={PROPERTY_ICON_BUTTON_CLASS}
                    onClick={() => props.onDuplicateColumn?.(c.id)}
                    disabled={!props.canMutate || !props.onDuplicateColumn}
                    aria-label="Duplicate"
                  >
                    <Copy className={icon14} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className={PROPERTY_ICON_BUTTON_CLASS}
                    onClick={() => props.onDeleteColumn?.(c.id)}
                    disabled={!props.canMutate || !props.onDeleteColumn || props.columns.length <= 1}
                    aria-label="Delete"
                  >
                    <Trash2 className={icon14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={PROPERTY_ICON_BUTTON_CLASS}
                    onClick={() => setExpandedColumnId(prev => (prev === c.id ? null : c.id))}
                    aria-label={isExpanded ? 'Collapse property details' : 'Expand property details'}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? <ChevronDown className={icon14} aria-hidden="true" /> : <ChevronRight className={icon14} aria-hidden="true" />}
                  </button>
                </section>
              </section>
              {isExpanded ? (
                <section id={`property-map-panel-${c.id}`} className="mt-2">
                  <section className="flex min-w-0 max-w-full items-start gap-2">
                    <span className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span
                      className={[PROPERTY_SMALL_ICON_BUTTON_CLASS, 'shrink-0'].join(' ')}
                      aria-label="Table-to-graph map"
                    >
                      <Link2 className={icon14} aria-hidden="true" />
                    </span>
                    <label className="block flex-1 min-w-0">
                      <span className="sr-only">Table-to-graph map</span>
                      <section className="relative">
                        <WorkspaceDataViewFieldSelect
                          className={[UI_FOCUS_RING, MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'w-full text-left', MAP_SELECT_CHEVRON_ALIGN_CLASS].join(' ')}
                          value={graphRole}
                          onValueChange={selectedValueInput => {
                            setColumnGraphRole(c.id, selectedValueInput as WorkspaceDataViewGraphColumnRole)
                          }}
                          disabled={!props.canMutate || props.view.graphEnabled !== true}
                        >
                          {WORKSPACE_DATA_VIEW_GRAPH_ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </WorkspaceDataViewFieldSelect>
                      </section>
                    </label>
                  </section>
                </section>
              ) : null}
            </section>
          )
        })}

        {hiddenIds.length ? (
          <section className="mt-2" aria-label="Hidden properties">
            <section className={['text-xs font-medium px-2 py-1', UI_THEME_TOKENS.text.secondary].join(' ')}>Hidden</section>
            <section className="space-y-1">
              {hiddenIds.map(columnId => {
                const c = props.columns.find(x => x.id === columnId)
                if (!c) return null
                const visible = false
                const type = (props.view.columnTypesById && props.view.columnTypesById[c.id]) || defaultColumnTypeForInferredKind(c.kind)
                const graphRole = (props.view.graphRolesByColumnId && props.view.graphRolesByColumnId[c.id]) || inferRoleForColumn(c.name)
                const Icon = iconByColumnType[type]
                const isExpanded = expandedColumnId === c.id
                return (
                  <section key={c.id} className={[UI_RESPONSIVE_DATA_VIEW_PROPERTY_ROW_CLASSNAME, UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}>
                    <section className={`${UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME} gap-2`}>
                      <section className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <GripDotsIcon className={['w-4 h-4 shrink-0 opacity-30', UI_THEME_TOKENS.text.tertiary].join(' ')} />
                        <span className={PROPERTY_SMALL_ICON_PLACEHOLDER_CLASS}>
                          <Icon className={icon14} aria-hidden="true" />
                        </span>
                        {editingColumnId === c.id ? (
                          <WorkspaceDataViewComfortableTextInput
                            autoFocus
                            className={COLUMN_NAME_EDIT_INPUT_CLASS}
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onBlur={() => commitRename(c.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitRename(c.id)
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setEditingColumnId(null)
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className={['text-sm min-w-0 text-left', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}
                            onClick={() => setExpandedColumnId(prev => (prev === c.id ? null : c.id))}
                            onDoubleClick={() => startRename(c.id, c.name)}
                            aria-expanded={isExpanded}
                            aria-controls={`property-map-panel-${c.id}`}
                          >
                            {c.name}
                          </button>
                        )}
                      </section>
                      <section className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className={PROPERTY_ICON_BUTTON_CLASS}
                          onClick={() => setColumnVisible(c.id, true)}
                          aria-pressed={visible}
                          aria-label="Show"
                        >
                          <VisibilityIcon hidden={!visible} iconClassName="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className={PROPERTY_ICON_BUTTON_CLASS}
                          onClick={() => props.onDuplicateColumn?.(c.id)}
                          disabled={!props.canMutate || !props.onDuplicateColumn}
                          aria-label="Duplicate"
                        >
                          <Copy className={icon14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={PROPERTY_ICON_BUTTON_CLASS}
                          onClick={() => props.onDeleteColumn?.(c.id)}
                          disabled={!props.canMutate || !props.onDeleteColumn || props.columns.length <= 1}
                          aria-label="Delete"
                        >
                          <Trash2 className={icon14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={PROPERTY_ICON_BUTTON_CLASS}
                          onClick={() => setExpandedColumnId(prev => (prev === c.id ? null : c.id))}
                          aria-label={isExpanded ? 'Collapse property details' : 'Expand property details'}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronDown className={icon14} aria-hidden="true" /> : <ChevronRight className={icon14} aria-hidden="true" />}
                        </button>
                      </section>
                    </section>
                    {isExpanded ? (
                      <section id={`property-map-panel-${c.id}`} className="mt-2">
                        <section className="flex min-w-0 max-w-full items-start gap-2">
                          <span className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span
                            className={[PROPERTY_SMALL_ICON_BUTTON_CLASS, 'shrink-0'].join(' ')}
                            aria-label="Table-to-graph map"
                          >
                            <Link2 className={icon14} aria-hidden="true" />
                          </span>
                          <label className="block flex-1 min-w-0">
                            <span className="sr-only">Table-to-graph map</span>
                            <section className="relative">
                              <WorkspaceDataViewFieldSelect
                                className={[UI_FOCUS_RING, MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'w-full text-left', MAP_SELECT_CHEVRON_ALIGN_CLASS].join(' ')}
                                value={graphRole}
                                onValueChange={selectedValueInput => {
                                  setColumnGraphRole(c.id, selectedValueInput as WorkspaceDataViewGraphColumnRole)
                                }}
                                disabled={!props.canMutate || props.view.graphEnabled !== true}
                              >
                                {WORKSPACE_DATA_VIEW_GRAPH_ROLE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </WorkspaceDataViewFieldSelect>
                            </section>
                          </label>
                        </section>
                      </section>
                    ) : null}
                  </section>
                )
              })}
            </section>
          </section>
        ) : null}
      </section>
    </section>
  )
}
