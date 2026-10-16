import React from 'react'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import { DataViewAction } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewSettingsActions'
import { calendarDateLabel, calendarMonthDays, shiftCalendarMonth, visibleCalendarDays } from './markdownDataViewCalendar'
import { parseDataViewDate } from '@/features/markdown-workspace/main/viewer/workspaceDataViewDates'

export const calendarWeekdayLabels = () => Array.from({ length: 7 }, (_, i) => ({
  short: calendarDateLabel(`2024-01-${String(i + 7).padStart(2, '0')}`, { weekday: 'short' }),
  full: calendarDateLabel(`2024-01-${String(i + 7).padStart(2, '0')}`, { weekday: 'long' }),
}))

/** Native buttons keep date cells available to keyboard and selection tooling. */
export function moveCalendarDayFocus(event: React.KeyboardEvent<HTMLButtonElement>) {
  const buttons = Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLButtonElement>('button[data-calendar-date]') ?? [])
  const index = buttons.indexOf(event.currentTarget)
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    Home: -(index % 7), End: 6 - (index % 7) }[event.key]
  if (delta === undefined || event.altKey || event.ctrlKey || event.metaKey) return
  event.preventDefault()
  buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))]?.focus()
}

function MonthArrow({ direction }: { direction: 'Previous' | 'Next' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label={`${direction} month`} fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d={direction === 'Previous' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
  </svg>
}

export function MarkdownDataViewCalendarNavigation(props: {
  month: string; today: string; selectedDay: string | null; timeZone: string
  onChangeMonth: (month: string) => void; onSelectDay: (day: string) => void
}) {
  const disclosure = React.useRef<HTMLDetailsElement>(null)
  const days = visibleCalendarDays(calendarMonthDays(props.month))
  const label = days.length ? calendarDateLabel(`${props.month}-01`, { month: 'long', year: 'numeric' }) : 'Choose month'
  const select = (day: string) => {
    if (!day.startsWith(props.month)) props.onChangeMonth(day.slice(0, 7))
    props.onSelectDay(day)
    if (disclosure.current) {
      disclosure.current.open = false
      disclosure.current.querySelector('summary')?.focus()
    }
  }
  return <header className="kg-calendar-navigation">
    <details ref={disclosure} className="kg-calendar-navigator" onKeyDown={event => {
      if (event.key === 'Escape' && disclosure.current?.open) {
        event.preventDefault(); disclosure.current.open = false; disclosure.current.querySelector('summary')?.focus()
      }
    }}>
      <summary role="button" aria-label={`Choose date, ${label}`} className="kg-calendar-month-title">{label}</summary>
      <section aria-label="Date navigator" className="kg-calendar-date-picker">
        <label className="text-xs">Month<PanelTextInput aria-label="Calendar month" type="month" value={props.month} onChange={event => {
          if (calendarMonthDays(event.target.value).length) props.onChangeMonth(event.target.value)
        }} /></label>
        <table aria-label={`Date navigator ${props.month}`}>
          <thead><tr>{calendarWeekdayLabels().map(day => <th key={day.full} scope="col"><abbr title={day.full}>{day.short}</abbr></th>)}</tr></thead>
          <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(day => <td key={day.date}>
            <button type="button" disabled={!parseDataViewDate(day.date)} data-calendar-date={day.date} data-outside={!day.inMonth} aria-label={`Go to ${day.date}`} aria-current={props.today === day.date ? 'date' : undefined}
              aria-pressed={props.selectedDay === day.date} onKeyDown={moveCalendarDayFocus} onClick={() => select(day.date)}><time dateTime={day.date}>{Number(day.date.slice(-2))}</time></button>
          </td>)}</tr>)}</tbody>
        </table>
        <DataViewAction disabled={!props.today} onClick={() => select(props.today)}>Go to today</DataViewAction>
      </section>
    </details>
    <nav aria-label="Calendar navigation" className="flex items-center gap-1">
      <DataViewAction aria-label="Previous month" disabled={shiftCalendarMonth(props.month, -1) === props.month} onClick={() => props.onChangeMonth(shiftCalendarMonth(props.month, -1))}><MonthArrow direction="Previous" /></DataViewAction>
      <DataViewAction disabled={!props.today} onClick={() => select(props.today)}>Today</DataViewAction>
      <DataViewAction aria-label="Next month" disabled={shiftCalendarMonth(props.month, 1) === props.month} onClick={() => props.onChangeMonth(shiftCalendarMonth(props.month, 1))}><MonthArrow direction="Next" /></DataViewAction>
    </nav>
    <output aria-label="Display timezone" className="text-xs">{props.timeZone}</output>
  </header>
}
