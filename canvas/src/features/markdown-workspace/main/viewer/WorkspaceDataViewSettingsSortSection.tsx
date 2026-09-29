import React from 'react'
import { ArrowUpDown } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { MarkdownDataViewColumn } from '@/features/markdown/ui/markdownDataViewModel'
import { UI_FOCUS_RING } from '@/lib/ui/focusRing'
import { PanelField, PanelSelect } from '@/lib/ui/panelFormControls'
import type { WorkspaceDataViewConfig, WorkspaceDataViewSortDirection, WorkspaceDataViewSortRule } from './workspaceDataViewConfig'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import { DataViewToolbarButton } from '@/lib/ui/dataViewToolbarButton'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export function WorkspaceDataViewSettingsSortSection(props: {
  columns: readonly MarkdownDataViewColumn[]
  view: WorkspaceDataViewConfig
  onChangeView: (next: WorkspaceDataViewConfig) => void
}) {
  const current = props.view.sortRules[0] || null

  const setSort = React.useCallback(
    (patch: Partial<Pick<WorkspaceDataViewSortRule, 'columnId' | 'direction'>>) => {
      const existing = props.view.sortRules[0]
      const next: WorkspaceDataViewSortRule = {
        id: existing?.id || makeId(),
        columnId: patch.columnId || existing?.columnId || (props.columns[0]?.id || ''),
        direction: (patch.direction || existing?.direction || 'asc') as WorkspaceDataViewSortDirection,
      }
      if (!next.columnId) {
        props.onChangeView({ ...props.view, sortRules: [] })
        return
      }
      props.onChangeView({ ...props.view, sortRules: [next] })
    },
    [props],
  )

  return (
    <section aria-label="Sort">
      <section className={['rounded border p-2 space-y-2', UI_THEME_TOKENS.panel.border].join(' ')} aria-label="Sort rules">
        <section className={`${uiToolbarRowScrollClassName} gap-2`}>
          <PanelField label="Field" variant="section" layout="compact" className="min-w-0 flex-1">
            <PanelSelect
              className={[UI_FOCUS_RING, MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME, 'w-full text-left'].join(' ')}
              value={current?.columnId || ''}
              onValueChange={selectedValueInput => setSort({ columnId: selectedValueInput })}
            >
              {props.columns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </PanelSelect>
          </PanelField>
          <PanelField label="Dir" variant="section" layout="compact" className="min-w-0">
            <PanelSelect
              className={[UI_FOCUS_RING, MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME].join(' ')}
              value={current?.direction || 'asc'}
              onValueChange={selectedValueInput => setSort({ direction: selectedValueInput === 'desc' ? 'desc' : 'asc' })}
            >
              <option value="asc">ASC</option>
              <option value="desc">DESC</option>
            </PanelSelect>
          </PanelField>
        </section>

        <section className="flex min-w-0 max-w-full items-center justify-end">
          <DataViewToolbarButton
            label="Clear"
            onClick={() => props.onChangeView({ ...props.view, sortRules: [] })}
            disabled={props.view.sortRules.length === 0}
            leadingIcon={<ArrowUpDown className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />}
          />
        </section>
      </section>
    </section>
  )
}
