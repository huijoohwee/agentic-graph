import { DataViewAction } from './WorkspaceDataViewSettingsActions'
import React from 'react'
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Link2, Search, Trash2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING } from '@/lib/ui/focusRing'
import { defaultColumnTypeForInferredKind, MARKDOWN_DATA_VIEW_COLUMN_TYPE_OPTIONS, isColumnTypeEditable, type MarkdownDataViewColumnType } from '@/features/markdown/ui/markdownDataViewColumnType'
import { MarkdownDataViewAddColumnMenu } from '@/features/markdown/ui/MarkdownDataViewAddColumnMenu'
import { iconByColumnType } from '@/features/markdown/ui/markdownDataViewColumnTypeMenuIcons'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig } from './workspaceDataViewConfig'
import { GripDotsIcon, VisibilityIcon } from '@/features/graph-fields/ui/graphFieldIcons'
import { UI_COLOR_PRIMARY_BLUE_INDICATOR } from '@/features/toolbar/ui/toolbarStyles'
import { reorderList } from '@/lib/reorder'
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
  titleColumnId?: string
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
    if (props.titleColumnId && !normalized.includes(props.titleColumnId)) normalized.unshift(props.titleColumnId)
    for (const id of allIds) {
      if (!set.has(id)) continue
      if (normalized.includes(id)) continue
      normalized.push(id)
    }
    return normalized
  }, [allIds, props.view.visibleColumnIds, props.titleColumnId])

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
      if (props.titleColumnId && !normalized.includes(props.titleColumnId)) normalized.unshift(props.titleColumnId)
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
        <menu className="m-0 p-0 flex gap-2" aria-label="Property visibility actions">
          <li className="list-none"><DataViewAction onClick={() => setVisibleIds(allIds)}>Show all properties</DataViewAction></li>
          <li className="list-none"><DataViewAction onClick={() => setVisibleIds(props.titleColumnId ? [props.titleColumnId] : [])}>Hide all properties</DataViewAction></li>
        </menu>
        <p className="text-xs">The title stays visible to identify records.</p>
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
        {filteredVisibleIds.map(columnId => {
          const c = props.columns.find(x => x.id === columnId)
          if (!c) return null
          const visible = true
          const type = (props.view.columnTypesById && props.view.columnTypesById[c.id]) || defaultColumnTypeForInferredKind(c.kind)
          const graphRole = (props.view.graphRolesByColumnId && props.view.graphRolesByColumnId[c.id]) || inferRoleForColumn(c.name)
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
                  <menu className="m-0 p-0 flex" aria-label={`Reorder property ${c.name}`}>
                    <li className="list-none"><DataViewAction aria-label={`Move ${c.name} up`} disabled={visibleIds.indexOf(c.id) <= 0} onClick={() => moveVisibleColumn(c.id, visibleIds[visibleIds.indexOf(c.id) - 1])}>↑</DataViewAction></li>
                    <li className="list-none"><DataViewAction aria-label={`Move ${c.name} down`} disabled={visibleIds.indexOf(c.id) === visibleIds.length - 1} onClick={() => moveVisibleColumn(c.id, visibleIds[visibleIds.indexOf(c.id) + 1])}>↓</DataViewAction></li>
                  </menu>
                  <GripDotsIcon className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.text.tertiary].join(' ')} />

                  <select aria-label={`Property type: ${c.name}`} value={type}
                    className={['w-20 min-w-0 shrink-0 rounded border p-1 text-xs', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_FOCUS_RING].join(' ')}
                    onChange={event => setColumnType({ column: c, nextType: event.target.value as MarkdownDataViewColumnType })}>
                    {MARKDOWN_DATA_VIEW_COLUMN_TYPE_OPTIONS.map(option => <option key={option.key} value={option.key} disabled={!isColumnTypeEditable(option.key)}>{option.label}</option>)}
                  </select>

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
                    aria-label={`Hide property: ${c.name}`}
                          disabled={c.id === props.titleColumnId}
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
              {filteredHiddenIds.map(columnId => {
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
                          aria-label={`Show property: ${c.name}`}
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
