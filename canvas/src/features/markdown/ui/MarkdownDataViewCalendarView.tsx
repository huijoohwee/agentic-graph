import React from 'react'
import { X } from 'lucide-react'
import type { MarkdownDataView, MarkdownDataViewRow } from './markdownDataViewModel'
import type { WorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { DataViewAction } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsActions'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { rowSelectionStyle } from '@/lib/ui/rowSelectionStyle'
import { MarkdownDataViewTableView } from './MarkdownDataViewTableView'
import { dayInDataViewZone, isDataViewTimeZone, parseDataViewDate } from '@/features/markdown-workspace/main/viewer/workspaceDataViewDates'
import { CALENDAR_DAY_PREVIEW_SIZE, CALENDAR_PAGE_SIZE, calendarDateLabel, defaultDataViewCalendar, projectDataViewCalendar, visibleCalendarDays } from './markdownDataViewCalendar'
import { MarkdownDataViewCalendarNavigation, calendarWeekdayLabels, moveCalendarDayFocus } from './MarkdownDataViewCalendarNavigation'
import './markdownDataViewCalendar.css'

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
  const [creatingDay, setCreatingDay] = React.useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null)
  const [recordOpen, setRecordOpen] = React.useState(false)
  const [pages, setPages] = React.useState<Record<string, number>>({})
  const dialog = React.useRef<HTMLDialogElement>(null)
  const composer = React.useRef<HTMLFormElement>(null)
  const agenda = React.useRef<HTMLElement>(null)
  const [recordTitle, setRecordTitle] = React.useState('')
  const titleIndex = props.view.columns.findIndex(c => c.id === props.view.titleColumnId)
  const selectedRow = props.view.rows.find(row => row.id === selectedRowId)
  const title = (row: MarkdownDataViewRow) => String(row.cells[titleIndex] || '').trim() || 'Untitled'
  const days = visibleCalendarDays(projection.days)
  const today = isDataViewTimeZone(calendar.timeZone) ? dayInDataViewZone(Date.now(), calendar.timeZone) : ''
  const canCreateDate = props.canMutate && !!calendar.startColumnId && !projection.error && props.config.columnTypesById?.[calendar.startColumnId] === 'date'
  React.useEffect(() => { setPages({}) }, [calendar.month, props.view])
  React.useEffect(() => { composer.current?.querySelector('input')?.focus() }, [creatingDay])
  React.useEffect(() => { if (recordOpen && selectedRow && !dialog.current?.open) dialog.current?.showModal(); else if (!recordOpen || !selectedRow) dialog.current?.close() }, [recordOpen, selectedRow])
  const recordButton = (row: MarkdownDataViewRow) => <li key={row.id} className="list-none min-w-0"><button type="button" className="kg-calendar-record" style={rowSelectionStyle(selectedRowId === row.id)} aria-pressed={selectedRowId === row.id} aria-haspopup="dialog" aria-label={`Open record: ${title(row)}`} title={title(row)} onClick={() => { setSelectedRowId(row.id); setRecordOpen(true) }}>{title(row)}</button></li>
  const pagedList = (rows: MarkdownDataViewRow[], key: string) => {
    const page = Math.min(pages[key] ?? 0, Math.max(0, Math.ceil(rows.length / CALENDAR_PAGE_SIZE) - 1))
    return <>
      <ol className="m-0 p-0 space-y-1" aria-label={`Records for ${key}`}>{rows.slice(page * CALENDAR_PAGE_SIZE, (page + 1) * CALENDAR_PAGE_SIZE).map(recordButton)}</ol>
      {rows.length > CALENDAR_PAGE_SIZE && <nav className="flex flex-wrap items-center gap-1" aria-label={`Record pages for ${key}`}>
        <DataViewAction disabled={!page} onClick={() => setPages(previous => ({ ...previous, [key]: page - 1 }))}>Previous</DataViewAction>
        <output className="text-xs">{page * CALENDAR_PAGE_SIZE + 1}–{Math.min(rows.length, (page + 1) * CALENDAR_PAGE_SIZE)} of {rows.length}</output>
        <DataViewAction disabled={(page + 1) * CALENDAR_PAGE_SIZE >= rows.length} onClick={() => setPages(previous => ({ ...previous, [key]: page + 1 }))}>Next</DataViewAction>
      </nav>}
    </>
  }
  const changeMonth = (month: string) => {
    setCreatingDay(null); setSelectedDay(null)
    props.onChangeConfig({ ...props.config, v: 3, calendar: { ...calendar, month } })
  }
  const createOnDay = (day: string) => { setCreatingDay(day); setRecordTitle('') }
  const closeComposer = () => {
    const form = composer.current
    setCreatingDay(null)
    form?.closest('td')?.querySelector<HTMLButtonElement>('.kg-calendar-date')?.focus()
  }
  const dayComposer = (day: string) => <form ref={composer} aria-label={`New row on ${day}`} className="kg-calendar-composer" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); closeComposer() }
  }} onSubmit={event => {
    event.preventDefault()
    if (!canCreateDate || !calendar.startColumnId) return
    props.onNewRecord({ [props.view.titleColumnId]: recordTitle.trim() || 'Untitled', [calendar.startColumnId]: day })
    closeComposer(); setRecordTitle('')
  }}>
    <label>Record title<PanelTextInput aria-label={`New row title on ${day}`} placeholder="Untitled" value={recordTitle} onChange={event => setRecordTitle(event.target.value)} /></label>
    <DataViewAction type="submit">Add row</DataViewAction><DataViewAction onClick={closeComposer}>Cancel</DataViewAction>
  </form>
  const selectDay = (day: string) => { setSelectedDay(day); setCreatingDay(null) }
  const showMore = (day: string) => {
    selectDay(day)
    requestAnimationFrame(() => { agenda.current?.focus(); agenda.current?.scrollIntoView?.({ block: 'nearest' }) })
  }
  return <section aria-label="Calendar View" className="kg-calendar min-w-0 space-y-3 p-2">
    <MarkdownDataViewCalendarNavigation month={calendar.month} today={today} timeZone={calendar.timeZone} selectedDay={selectedDay} onChangeMonth={changeMonth} onSelectDay={selectDay} />
    {!calendar.startColumnId && <p role="status">Choose Calendar by in View settings to place records by date.</p>}
    {projection.error && <p role="alert">{projection.error}</p>}
    <section className="overflow-x-auto" aria-label="Month days">
      <table className="kg-calendar-month-grid" aria-label={`Calendar ${calendar.month}`}>
        <thead><tr>{calendarWeekdayLabels().map(day => <th key={day.full} scope="col"><abbr title={day.full}>{day.short}</abbr></th>)}</tr></thead>
        <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(day => <td key={day.date} className="kg-calendar-day" data-today={today === day.date} data-outside={!day.inMonth}>
          <section aria-label={calendarDateLabel(day.date, { dateStyle: 'full' })}>
            <button type="button" disabled={!parseDataViewDate(day.date)} className="kg-calendar-date" data-calendar-date={day.date} data-outside={!day.inMonth} aria-current={today === day.date ? 'date' : undefined}
              aria-label={`Select day ${day.date}, ${day.rows.length} records`} aria-pressed={selectedDay === day.date} onKeyDown={moveCalendarDayFocus} onClick={() => selectDay(day.date)}><time dateTime={day.date}>{Number(day.date.slice(-2))}</time></button>
            <ol className="m-0 p-0 space-y-1" aria-label={`Day preview ${day.date}`}>{day.rows.slice(0, CALENDAR_DAY_PREVIEW_SIZE).map(recordButton)}</ol>
            {day.rows.length > CALENDAR_DAY_PREVIEW_SIZE && <button type="button" className="kg-calendar-more" aria-label={`Show all ${day.rows.length} records on ${day.date}`} onClick={() => showMore(day.date)}>+{day.rows.length - CALENDAR_DAY_PREVIEW_SIZE} more</button>}
            {canCreateDate && parseDataViewDate(day.date) && (creatingDay === day.date ? dayComposer(day.date) : <button type="button" className="kg-calendar-new-row" aria-label={`New row on ${day.date}`} onClick={() => createOnDay(day.date)}>+ New row</button>)}
          </section>
        </td>)}</tr>)}</tbody>
      </table>
    </section>
    {selectedDay && <aside ref={agenda} tabIndex={-1} aria-label={`Selected day ${selectedDay}`} className="kg-calendar-day-agenda space-y-2">
      <header className="flex items-center justify-between gap-2"><h3>{calendarDateLabel(selectedDay, { dateStyle: 'full' })}</h3><DataViewAction onClick={() => setSelectedDay(null)}>Close day</DataViewAction></header>
      {pagedList(projection.days.find(day => day.date === selectedDay)?.rows || [], `selected ${selectedDay}`)}
      {!projection.days.find(day => day.date === selectedDay)?.rows.length && <p className="text-xs">No records on this day.</p>}
      {canCreateDate && <DataViewAction onClick={() => { createOnDay(selectedDay); setSelectedDay(null) }}>New row on {selectedDay}</DataViewAction>}
      {props.canMutate && calendar.startColumnId && props.config.columnTypesById?.[calendar.startColumnId] !== 'date' && <p className="text-xs">To create a dated record here, use a Date property. Timestamp fields require an explicit time and offset in the source editor.</p>}
    </aside>}
    <details><summary className="cursor-pointer p-2">Unscheduled ({projection.unscheduled.length})</summary>{pagedList(projection.unscheduled, 'Unscheduled')}</details>
    <details><summary className="cursor-pointer p-2">Invalid dates ({projection.invalid.length})</summary><p className="text-xs">Use valid YYYY-MM-DD dates or timestamps with offsets. End must follow start using the same format.</p>{pagedList(projection.invalid.map(entry => entry.row), 'Invalid dates')}</details>
    <dialog ref={dialog} onCancel={() => setRecordOpen(false)} onClose={() => { if (!dialog.current?.open) setRecordOpen(false) }} className={['kg-calendar-record-dialog rounded border p-3', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.primary].join(' ')} aria-label="Record details">
      <header className="flex items-center justify-between gap-2 mb-2"><h3 className="min-w-0 break-words">{selectedRow ? title(selectedRow) : 'Record details'}</h3><DataViewAction className="inline-flex min-w-11 shrink-0 items-center justify-center sm:min-h-11" aria-label="Close record" title="Close record" onClick={() => setRecordOpen(false)}><X className="h-4 w-4" role="img" aria-label="Close record icon" /></DataViewAction></header>
      {recordOpen && selectedRow && <MarkdownDataViewTableView view={{ ...props.view, rows: [selectedRow] }} canMutate={props.canMutate} onUpdateCell={props.onUpdateCell} onNewRecord={props.onNewRecord} visibleColumnIds={props.config.visibleColumnIds} columnTypesById={props.config.columnTypesById} />}
    </dialog>
  </section>
}
