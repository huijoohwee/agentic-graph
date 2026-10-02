import type { MarkdownDataView, MarkdownDataViewRow } from './markdownDataViewModel'
import { addCivilDays, dayInDataViewZone, isDataViewTimeZone, parseDataViewDate } from '@/features/markdown-workspace/main/viewer/workspaceDataViewDates'

export type DataViewCalendarConfig = { startColumnId: string | null; endColumnId: string | null; timeZone: string; month: string }
export type CalendarDay = { date: string; inMonth: boolean; rows: MarkdownDataViewRow[] }
export type CalendarProjection = { days: CalendarDay[]; unscheduled: MarkdownDataViewRow[]; invalid: { row: MarkdownDataViewRow; reason: string }[]; error: string | null }
export const CALENDAR_PAGE_SIZE = 20
export function defaultDataViewCalendar(): DataViewCalendarConfig { return { startColumnId: null, endColumnId: null, timeZone: 'UTC', month: new Date().toISOString().slice(0, 7) } }
export function shiftCalendarMonth(month: string, amount: number): string {
  const value = new Date(`${month}-01T00:00:00Z`); value.setUTCMonth(value.getUTCMonth() + amount); return value.toISOString().slice(0, 7)
}
export function projectDataViewCalendar(view: MarkdownDataView, config: DataViewCalendarConfig): CalendarProjection {
  const result: CalendarProjection = { days: [], unscheduled: [], invalid: [], error: null }
  const first = `${config.month}-01`
  if (!parseDataViewDate(first) || !isDataViewTimeZone(config.timeZone)) return { ...result, error: 'Choose a valid month and display timezone.' }
  const gridStart = addCivilDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay())
  result.days = Array.from({ length: 42 }, (_, index) => { const date = addCivilDays(gridStart, index); return { date, inMonth: date.startsWith(config.month), rows: [] } })
  const startIndex = view.columns.findIndex(c => c.id === config.startColumnId)
  const endIndex = view.columns.findIndex(c => c.id === config.endColumnId)
  for (const row of view.rows) {
    const startRaw = String(row.cells[startIndex] ?? '').trim(), endRaw = String(row.cells[endIndex] ?? '').trim()
    if (!startRaw) { result.unscheduled.push(row); continue }
    const start = parseDataViewDate(startRaw), end = endRaw ? parseDataViewDate(endRaw) : null
    if (!start || (endRaw && !end)) { result.invalid.push({ row, reason: 'Use YYYY-MM-DD or an RFC3339 timestamp with offset.' }); continue }
    if (end && (end.kind !== start.kind || end.value < start.value)) { result.invalid.push({ row, reason: 'End must use the same date format and be on or after start.' }); continue }
    const firstDay = start.kind === 'civil' ? start.day : dayInDataViewZone(start.value, config.timeZone)
    // Subtract one millisecond for non-zero instant ranges to keep midnight ends exclusive.
    const lastDay = !end ? firstDay : end.kind === 'civil' ? end.day : dayInDataViewZone(end.value > start.value ? end.value - 1 : end.value, config.timeZone)
    for (const day of result.days) if (day.date >= firstDay && day.date <= lastDay) day.rows.push(row)
  }
  return result
}
