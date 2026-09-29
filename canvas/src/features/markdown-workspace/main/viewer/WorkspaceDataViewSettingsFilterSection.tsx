import React from 'react'
import { Filter, Plus, Trash2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import { WorkspaceDataViewFilterMenu } from './WorkspaceDataViewFilterMenu'
import type { WorkspaceDataViewConfig, WorkspaceDataViewFilterGroup } from './workspaceDataViewConfig'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  DataViewIconButton,
  DataViewToolbarButton,
  getDataViewToolbarButtonClassName,
} from '@/lib/ui/dataViewToolbarButton'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

function buildColumnNameById(columns: readonly MarkdownDataViewColumn[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of columns) {
    m.set(c.id, c.name)
  }
  return m
}

export function WorkspaceDataViewSettingsFilterSection(props: {
  columns: readonly MarkdownDataViewColumn[]
  view: WorkspaceDataViewConfig
  onChangeView: (next: WorkspaceDataViewConfig) => void
}) {
  const addDetailsRef = React.useRef<HTMLDetailsElement | null>(null)

  const totalRules = React.useMemo(() => {
    return props.view.filterGroups.reduce((n, g) => n + g.rules.length, 0)
  }, [props.view.filterGroups])

  const columnNameById = React.useMemo(() => buildColumnNameById(props.columns), [props.columns])

  const removeRule = React.useCallback(
    (ruleId: string) => {
      const nextGroups: WorkspaceDataViewFilterGroup[] = props.view.filterGroups.map(g => ({
        ...g,
        rules: g.rules.filter(r => r.id !== ruleId),
      }))
      props.onChangeView({ ...props.view, filterGroups: nextGroups })
    },
    [props],
  )

  const clearAll = React.useCallback(() => {
    props.onChangeView({ ...props.view, filterGroups: [{ id: 'g0', rules: [] }] })
  }, [props])

  return (
    <section aria-label="Filter">
      <section className={['rounded border p-2 space-y-2', UI_THEME_TOKENS.panel.border].join(' ')} aria-label="Filter rules">
        {totalRules === 0 ? (
          <section className={['text-xs px-2 py-1', UI_THEME_TOKENS.text.secondary].join(' ')}>No filters</section>
        ) : (
          props.view.filterGroups.map(g => (
            <section key={g.id} className="space-y-1">
              {g.rules.map(r => {
                const colName = columnNameById.get(r.columnId) || r.columnId
                const opLabel = r.op === 'equals' ? '=' : r.op === 'includes' ? 'includes' : 'contains'
                const value = String(r.value ?? '').trim()
                return (
                  <section key={r.id} className={[UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, 'gap-2 px-2 py-1 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}>
                    <section className="min-w-0 flex-1">
                      <section className={['text-xs font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>{colName}</section>
                      <section className={['text-xs', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>
                        {opLabel} {value ? `“${value}”` : '“”'}
                      </section>
                    </section>
                    <DataViewIconButton
                      size="sm"
                      variant="ghost"
                      ariaLabel="Remove filter"
                      onClick={() => removeRule(r.id)}
                      icon={<Trash2 className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />}
                    />
                  </section>
                )
              })}
            </section>
          ))
        )}

        <section className={`${uiToolbarRowScrollClassName} gap-2`}>
          <details ref={addDetailsRef} className="relative">
            <summary
              className={getDataViewToolbarButtonClassName({ className: 'list-none cursor-pointer' })}
            >
              <Plus className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
              <span className={['text-xs font-medium', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>Add filter</span>
            </summary>
            <section className="kg-data-view-floating-menu absolute left-0 mt-2">
              <section className={['rounded border shadow-lg', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}>
                <WorkspaceDataViewFilterMenu
                  columns={props.columns}
                  viewConfig={props.view}
                  setViewConfig={props.onChangeView}
                  onCloseMenu={() => {
                    const el = addDetailsRef.current
                    if (el) el.open = false
                  }}
                />
              </section>
            </section>
          </details>

          <DataViewToolbarButton
            label="Clear"
            className="ml-auto"
            onClick={clearAll}
            disabled={totalRules === 0}
            leadingIcon={<Filter className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />}
          />
        </section>
      </section>
    </section>
  )
}
