import React from 'react'
import type { MarkdownDataView, MarkdownDataViewRow } from './markdownDataViewModel'
import type { WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { DataViewAction } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsActions'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MarkdownDataViewTableView } from './MarkdownDataViewTableView'
import { dayInDataViewZone } from '@/features/markdown-workspace/main/viewer/workspaceDataViewDates'
import { CALENDAR_PAGE_SIZE, defaultDataViewCalendar, projectDataViewCalendar, shiftCalendarMonth } from './markdownDataViewCalendar'

export default function MarkdownDataViewCalendarView(props: {
  view: MarkdownDataView; config: WorkspaceDataViewConfig; onChangeConfig: (next: WorkspaceDataViewConfig) => void
  canMutate: boolean; onNewRecord: (seed?: Partial<Record<string, string>>) => void
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
}) {
  const calendar = React.useMemo(() => props.config.calendar ?? defaultDataViewCalendar(), [props.config.calendar])
  const projection = React.useMemo(() => {
    const isDateField = (id: string | null) => !id || ['date', 'created-time'].includes(props.config.columnTypesById?.[id] || '')
    const result = projectDataViewCalendar(props.view, calendar)
    if (isDateField(calendar.startColumnId) && isDateField(calendar.endColumnId)) return result
    return { ...result, days: result.days.map(day => ({ ...day, rows: [] })), unscheduled: [], invalid: props.view.rows.map(row => ({ row, reason: 'Calendar properties must have a Date or Created Time type.' })), error: 'Choose Date or Created Time properties in Calendar settings.' }
  }, [props.view, calendar, props.config.columnTypesById])
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState<Record<string, number>>({})
  const dialog = React.useRef<HTMLDialogElement>(null)
  const [recordTitle, setRecordTitle] = React.useState('')
  const titleIndex = props.view.columns.findIndex(c => c.id === props.view.titleColumnId)
  const selectedRow = props.view.rows.find(row => row.id === selectedRowId)
  const title = (row: MarkdownDataViewRow) => String(row.cells[titleIndex] || row.id)
  React.useEffect(() => { setPages({}) }, [calendar.month, props.view])
  React.useEffect(() => { if (selectedRow && !dialog.current?.open) dialog.current?.showModal(); else if (!selectedRow) dialog.current?.close() }, [selectedRow])
  const recordButton = (row: MarkdownDataViewRow, key = row.id) => <li key={key} className="list-none min-w-0"><button type="button" className={['block min-h-11 sm:min-h-0 w-full truncate rounded border px-2 py-1 text-left text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')} aria-label={`Open record: ${title(row)}`} title={title(row)} onClick={() => setSelectedRowId(row.id)}>{title(row)}</button></li>
  const pagedList = (rows: MarkdownDataViewRow[], key: string) => {
    const page = Math.min(pages[key] ?? 0, Math.max(0, Math.ceil(rows.length / CALENDAR_PAGE_SIZE) - 1))
    return <>
      <ol className="m-0 p-0 space-y-1" aria-label={`Records for ${key}`}>{rows.slice(page * CALENDAR_PAGE_SIZE, (page + 1) * CALENDAR_PAGE_SIZE).map(row => recordButton(row))}</ol>
      {rows.length > CALENDAR_PAGE_SIZE && <nav className="flex flex-wrap items-center gap-1" aria-label={`Record pages for ${key}`}>
        <DataViewAction disabled={!page} onClick={() => setPages(previous => ({ ...previous, [key]: page - 1 }))}>Previous</DataViewAction>
        <output className="text-xs">{page * CALENDAR_PAGE_SIZE + 1}–{Math.min(rows.length, (page + 1) * CALENDAR_PAGE_SIZE)} of {rows.length}</output>
        <DataViewAction disabled={(page + 1) * CALENDAR_PAGE_SIZE >= rows.length} onClick={() => setPages(previous => ({ ...previous, [key]: page + 1 }))}>Next</DataViewAction>
      </nav>}
    </>
  }
  const changeMonth = (month: string) => props.onChangeConfig({ ...props.config, v: 3, calendar: { ...calendar, month } })
  return <section aria-label="Calendar View" className="min-w-0 space-y-3 p-2">
    <header className="flex flex-wrap items-center gap-2">
      <DataViewAction aria-label="Previous month" onClick={() => changeMonth(shiftCalendarMonth(calendar.month, -1))}>Previous month</DataViewAction>
      <label className="text-xs">Month<PanelTextInput aria-label="Calendar month" type="month" value={calendar.month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) changeMonth(event.target.value) }} /></label>
      <DataViewAction aria-label="Next month" onClick={() => changeMonth(shiftCalendarMonth(calendar.month, 1))}>Next month</DataViewAction>
      <DataViewAction onClick={() => { const today = dayInDataViewZone(Date.now(), calendar.timeZone); changeMonth(today.slice(0, 7)); setSelectedDay(today) }}>Today</DataViewAction>
      <output className="text-xs">{calendar.timeZone}</output>
    </header>
    {!calendar.startColumnId && <p role="status">Choose Calendar by in View settings to place records by date.</p>}
    {projection.error && <p role="alert">{projection.error}</p>}
    <section className="overflow-x-auto" aria-label="Month days">
      <table className="w-full table-fixed border-collapse min-w-[42rem]" aria-label={`Calendar ${calendar.month}`}>
        <thead><tr>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => <th key={day} scope="col" className="p-1 text-xs font-medium">{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{projection.days.slice(week * 7, week * 7 + 7).map(day => <td key={day.date} className={['align-top border p-1', UI_THEME_TOKENS.panel.border, day.inMonth ? '' : 'opacity-60'].join(' ')}>
          <DataViewAction className="w-full mb-1" aria-label={`Select day ${day.date}, ${day.rows.length} records`} aria-pressed={selectedDay === day.date} onClick={() => { setSelectedDay(day.date); setRecordTitle('') }}><time dateTime={day.date}>{Number(day.date.slice(-2))}</time> · {day.rows.length}</DataViewAction>
          {pagedList(day.rows, day.date)}
        </td>)}</tr>)}</tbody>
      </table>
    </section>
    {selectedDay && <section aria-label={`Selected day ${selectedDay}`} className="space-y-2 rounded border p-2">
      <header className="flex items-center justify-between"><h3>{selectedDay}</h3><DataViewAction onClick={() => setSelectedDay(null)}>Close day</DataViewAction></header>
      {pagedList(projection.days.find(day => day.date === selectedDay)?.rows || [], `selected ${selectedDay}`)}
      {props.canMutate && calendar.startColumnId && props.config.columnTypesById?.[calendar.startColumnId] === 'date' && <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault(); if (!calendar.startColumnId || !recordTitle.trim()) return
        props.onNewRecord({ [props.view.titleColumnId]: recordTitle.trim(), [calendar.startColumnId]: selectedDay }); setRecordTitle('')
      }}><label>Record title<PanelTextInput aria-label="New Calendar record title" value={recordTitle} onChange={event => setRecordTitle(event.target.value)} required /></label><DataViewAction type="submit" disabled={!recordTitle.trim()}>New record on {selectedDay}</DataViewAction></form>}
      {props.canMutate && calendar.startColumnId && props.config.columnTypesById?.[calendar.startColumnId] !== 'date' && <p className="text-xs">To create a dated record here, use a Date property. Timestamp fields require an explicit time and offset in the source editor.</p>}
    </section>}
    <details><summary className="cursor-pointer p-2">Unscheduled ({projection.unscheduled.length})</summary>{pagedList(projection.unscheduled, 'Unscheduled')}</details>
    <details><summary className="cursor-pointer p-2">Invalid dates ({projection.invalid.length})</summary><p className="text-xs">Use valid YYYY-MM-DD dates or timestamps with offsets. End must follow start using the same format.</p>{pagedList(projection.invalid.map(entry => entry.row), 'Invalid dates')}</details>
    <dialog ref={dialog} onCancel={() => setSelectedRowId(null)} onClose={() => setSelectedRowId(null)} className={['w-[min(90vw,60rem)] max-h-[85vh] overflow-auto rounded border p-3', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.text.primary].join(' ')} aria-label="Record details">
      <header className="flex justify-between gap-2 mb-2"><h3>{selectedRow ? title(selectedRow) : 'Record details'}</h3><DataViewAction onClick={() => setSelectedRowId(null)}>Close record</DataViewAction></header>
      {selectedRow && <MarkdownDataViewTableView view={{ ...props.view, rows: [selectedRow] }} canMutate={props.canMutate} onUpdateCell={props.onUpdateCell} onNewRecord={props.onNewRecord} visibleColumnIds={props.config.visibleColumnIds} columnTypesById={props.config.columnTypesById} />}
    </dialog>
  </section>
}
