import React from 'react'
import { CircleCheck, ListChecks, Type, Plus, ArrowLeft } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import type { WorkspaceDataViewConfig, WorkspaceDataViewFilterRule, WorkspaceDataViewFilterOp } from './workspaceDataViewConfig'
import { PanelField, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_FILTER_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

type FilterTarget = {
  column: MarkdownDataViewColumn
  op: WorkspaceDataViewFilterOp
}

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

const icon14 = ['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')

function guessDefaultOp(col: MarkdownDataViewColumn): WorkspaceDataViewFilterOp {
  if (col.kind === 'select') return 'equals'
  if (col.kind === 'multi-select') return 'includes'
  return 'contains'
}

function buildRule(target: FilterTarget, value: string): WorkspaceDataViewFilterRule {
  return {
    id: makeId(),
    columnId: target.column.id,
    columnKind: target.column.kind,
    op: target.op,
    value,
  }
}

export function WorkspaceDataViewFilterMenu(props: {
  columns: readonly MarkdownDataViewColumn[]
  viewConfig: WorkspaceDataViewConfig | null
  setViewConfig: (next: WorkspaceDataViewConfig) => void
  onCloseMenu: () => void
}) {
  const cfg = props.viewConfig
  const [target, setTarget] = React.useState<FilterTarget | null>(null)
  const [draftValue, setDraftValue] = React.useState('')

  const filterableColumns = React.useMemo(() => {
    const visibleIds = cfg?.visibleColumnIds
    const cols = props.columns
      .filter(c => {
        if (c.kind === 'text') return true
        if (c.kind === 'select') return true
        if (c.kind === 'multi-select') return true
        return false
      })
      .filter(c => (visibleIds ? visibleIds.includes(c.id) : true))
    return cols
  }, [cfg?.visibleColumnIds, props.columns])

  const onAddGroup = React.useCallback(() => {
    if (!cfg) return
    const next = {
      ...cfg,
      filterGroups: [...cfg.filterGroups, { id: makeId(), rules: [] }],
    }
    props.setViewConfig(next)
  }, [cfg, props])

  const onApply = React.useCallback(() => {
    if (!cfg) return
    if (!target) return
    const value = String(draftValue ?? '').trim()
    const nextRule = buildRule(target, value)
    const groups = cfg.filterGroups.length ? cfg.filterGroups : [{ id: 'g0', rules: [] }]
    const lastIndex = groups.length - 1
    const nextGroups = groups.map((g, idx) => (idx === lastIndex ? { ...g, rules: [...g.rules, nextRule] } : g))
    props.setViewConfig({ ...cfg, filterGroups: nextGroups })
    props.onCloseMenu()
  }, [cfg, draftValue, props, target])

  const onPickColumn = React.useCallback((column: MarkdownDataViewColumn) => {
    setDraftValue('')
    setTarget({ column, op: guessDefaultOp(column) })
  }, [])

  const iconFor = React.useCallback((c: MarkdownDataViewColumn) => {
    if (c.kind === 'text') return <Type className={icon14} aria-hidden="true" />
    if (c.kind === 'select') return <CircleCheck className={icon14} aria-hidden="true" />
    return <ListChecks className={icon14} aria-hidden="true" />
  }, [])

  if (!cfg) {
    return (
      <section className={['rounded border p-2', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')} aria-label="New filter">
        <section className={['text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>No data view config available.</section>
      </section>
    )
  }

  return (
    <section className={UI_RESPONSIVE_DATA_VIEW_FILTER_MENU_PANEL_CLASSNAME} aria-label="New filter">
      <header className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        {target ? (
          <button
            type="button"
            className={[UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
            aria-label="Back"
            onClick={() => setTarget(null)}
          >
            <ArrowLeft className={icon14} aria-hidden="true" />
          </button>
        ) : null}
        <section className={['min-w-0 flex-1 font-medium text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>
          {target ? `Filter: ${target.column.name}` : 'New filter'}
        </section>
      </header>

      {target ? (
        <section className="px-2 pb-2">
          {target.column.kind === 'select' && Array.isArray(target.column.options) && target.column.options.length ? (
            <fieldset className="border-0 p-0 m-0">
              <legend className="sr-only">Select value</legend>
              <section className={`${uiToolbarRowScrollClassName} gap-1`}>
                {target.column.options.map(o => (
                  <button
                    key={o}
                    type="button"
                    className={[
                      UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
                      'text-xs px-2 py-1 rounded border',
                      draftValue === o ? [UI_THEME_TOKENS.button.primarySolid, UI_THEME_TOKENS.button.activeBorder].join(' ') : [UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary, UI_THEME_TOKENS.button.hoverBg].join(' '),
                    ].join(' ')}
                    onClick={() => setDraftValue(o)}
                  >
                    {o}
                  </button>
                ))}
              </section>
            </fieldset>
          ) : (
            <PanelField
              label={target.op === 'equals' ? 'Equals' : target.op === 'includes' ? 'Includes' : 'Contains'}
              variant="section"
            >
              <PanelTextInput
                className="py-1.5 text-xs"
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                placeholder={target.column.kind === 'multi-select' ? 'e.g. 1' : 'Type…'}
              />
            </PanelField>
          )}

          <section className="mt-2 flex items-center justify-end">
            <button
              type="button"
              className={[UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME, 'rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
              onClick={onApply}
            >
              <span className={['text-xs font-medium', UI_THEME_TOKENS.text.primary].join(' ')}>Apply</span>
            </button>
          </section>
        </section>
      ) : (
        <>
          <menu className="m-0 p-0" aria-label="Filter properties">
            {filterableColumns.map(c => (
              <li key={c.id} className="list-none">
                <button
                  type="button"
                  className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-3 py-2 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  onClick={() => onPickColumn(c)}
                >
                  {iconFor(c)}
                  <span className={['min-w-0 text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>{c.name}</span>
                </button>
              </li>
            ))}
          </menu>

          <section className={['my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')} />
          <button
            type="button"
            className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-3 py-2 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}
            onClick={onAddGroup}
          >
            <Plus className={icon14} aria-hidden="true" />
            <span className={['min-w-0 text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>Add filter group</span>
          </button>
        </>
      )}
    </section>
  )
}
