import React from 'react'
import { CalendarView, type CalendarConfig } from '@agentic-base/views-react/calendar'
import type { MarkdownDataView, MarkdownDataViewRow } from './markdownDataViewModel'
import type { WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { defaultDataViewCalendar } from './markdownDataViewCalendar'
import { MarkdownDataViewTableView } from './MarkdownDataViewTableView'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

const actionClassName = [UI_RESPONSIVE_ACTION_ROW_CLASSNAME, 'min-h-10 justify-center rounded border px-2 py-1 text-sm',
  UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.focus.primarySoftRing].join(' ')
const inputClassName = [UI_RESPONSIVE_DATA_VIEW_FIELD_INPUT_CLASSNAME, 'min-h-10 min-w-0 rounded border px-2 py-1',
  UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text].join(' ')
const calendarStyle = {
  '--base-accent': '#3b82f6',
  '--base-text-primary': 'var(--kg-text-primary)',
  '--base-text-secondary': 'var(--kg-text-secondary)',
  '--base-border': 'var(--kg-border)',
  '--base-panel': 'var(--kg-panel-bg)',
  '--base-shadow-overlay': 'var(--kg-shadow-overlay)',
} as React.CSSProperties

type MarkdownDataViewCalendarViewProps = {
  view: MarkdownDataView
  config: WorkspaceDataViewConfig
  onChangeConfig: (next: WorkspaceDataViewConfig) => void
  canMutate: boolean
  onNewRecord: (seed?: Partial<Record<string, string>>) => void
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
}

export function MarkdownDataViewCalendarView(props: MarkdownDataViewCalendarViewProps) {
  const config = props.config.calendar ?? defaultDataViewCalendar()
  const onChangeConfig = React.useCallback((calendar: CalendarConfig) => {
    props.onChangeConfig({ ...props.config, calendar })
  }, [props.config, props.onChangeConfig])
  const renderRecordDetail = React.useCallback((row: MarkdownDataViewRow) => <MarkdownDataViewTableView
    view={{ ...props.view, rows: [row] }} canMutate={props.canMutate} onUpdateCell={props.onUpdateCell}
    onNewRecord={() => props.onNewRecord()} visibleColumnIds={props.config.visibleColumnIds}
    columnTypesById={props.config.columnTypesById} />,
  [props.canMutate, props.config.columnTypesById, props.config.visibleColumnIds, props.onNewRecord, props.onUpdateCell, props.view])

  return <div style={calendarStyle}>
    <CalendarView view={props.view} config={config} columnTypesById={props.config.columnTypesById}
      canMutate={props.canMutate} onChangeConfig={onChangeConfig} onNewRecord={props.onNewRecord}
      renderRecordDetail={renderRecordDetail} actionClassName={actionClassName} inputClassName={inputClassName} />
  </div>
}

export default MarkdownDataViewCalendarView
