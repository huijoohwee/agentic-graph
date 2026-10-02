import assert from 'node:assert/strict'
import { calendarDateLabel, calendarMonthDays, projectDataViewCalendar, shiftCalendarMonth, visibleCalendarDays } from '@/features/markdown/ui/markdownDataViewCalendar'
import { parseDataViewDate } from '@/features/markdown-workspace/main/viewer/workspaceDataViewDates'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'
const config = { startColumnId: 'start', endColumnId: 'end', timeZone: 'America/New_York', month: '2024-03' }
const model = (rows: string[][]): MarkdownDataView => ({ titleColumnId: 'title', groupByColumnId: null, columns: [
  { id: 'title', name: 'Title', kind: 'text' }, { id: 'start', name: 'Start', kind: 'text' }, { id: 'end', name: 'End', kind: 'text' },
], rows: rows.map((cells, index) => ({ id: `row_${index}`, cells })) })
export function testDataViewCalendarStrictRanges() {
  const source = model([
    ['Leap', '2024-02-29', '2024-03-02'],
    ['DST', '2024-03-10T00:00:00-05:00', '2024-03-11T00:00:00-04:00'],
    ['Instant', '2024-03-10T02:00:00Z', ''],
    ['Invalid leap', '2023-02-29', ''], ['Local time', '2024-03-10T10:00:00', ''],
    ['Backwards', '2024-03-15', '2024-03-14'], ['Mixed', '2024-03-10', '2024-03-11T00:00:00Z'],
    ['Unscheduled', '', '2024-03-14'], ['Zero', '2024-03-12T00:00:00-04:00', '2024-03-12T00:00:00-04:00'],
  ])
  const p = projectDataViewCalendar(source, config)
  assert.equal(p.days.length, 42)
  assert.equal(p.invalid.length, 4); assert.equal(p.unscheduled.length, 1)
  const on = (date: string) => p.days.find(day => day.date === date)!.rows.map(row => row.cells[0])
  assert.deepEqual(on('2024-02-29'), ['Leap']); assert.deepEqual(on('2024-03-02'), ['Leap'])
  assert.deepEqual(on('2024-03-09'), ['Instant']); assert.deepEqual(on('2024-03-10'), ['DST'])
  assert.deepEqual(on('2024-03-11'), []); assert.deepEqual(on('2024-03-12'), ['Zero'])
  assert.equal(projectDataViewCalendar(source, { ...config, timeZone: 'Invalid/Zone' }).error !== null, true)
  for (const date of ['2024-04-31', 'March 10, 2024', '2024-03-10T24:00:00Z', '2024-03-10T10:99:00Z', '2024-03-10T10:00:00+25:00']) assert.equal(parseDataViewDate(date), null)
  assert.ok(parseDataViewDate('2024-02-29'))
  assert.equal(shiftCalendarMonth('2024-12', 1), '2025-01')
  assert.equal(shiftCalendarMonth('2024-01', -1), '2023-12')
  assert.equal(shiftCalendarMonth('9999-12', 1), '9999-12', 'month navigation stays in supported year syntax')
  assert.equal(calendarMonthDays('2026-13').length, 0)
  for (const month of ['0000-01', '9999-12']) {
    assert.equal(calendarMonthDays(month).length, 42)
    for (const day of calendarMonthDays(month)) assert.ok(calendarDateLabel(day.date, { day: 'numeric' }))
  }
  assert.equal(visibleCalendarDays(calendarMonthDays('2026-10')).length, 35)
  assert.equal(visibleCalendarDays(calendarMonthDays('2026-08')).length, 42)
  assert.equal(visibleCalendarDays(calendarMonthDays('2026-02')).length, 28)
  assert.equal(calendarDateLabel('2026-10-02', { month: 'long', year: 'numeric' }, 'en-US'), 'October 2026')
  const fall = projectDataViewCalendar(model([['Fall DST', '2024-11-03T00:00:00-04:00', '2024-11-04T00:00:00-05:00']]), { ...config, month: '2024-11' })
  assert.equal(fall.days.filter(day => day.rows.length).length, 1)
  const civilZone = projectDataViewCalendar(model([['Date only', '2024-03-01', '']]), { ...config, timeZone: 'Pacific/Honolulu' })
  assert.equal(civilZone.days.find(day => day.rows.length)?.date, '2024-03-01')
}
export function testDataViewCalendarBoundedProjection() {
  const view = model(Array.from({ length: 10000 }, (_, i) => [`Record ${i}`, '1900-01-01', '9999-12-31']))
  const started = performance.now(), projected = projectDataViewCalendar(view, config)
  assert.equal(projected.days.length, 42); assert.equal(projected.days[0].rows.length, 10000)
  assert.equal(projected.days[41].rows[9999], view.rows[9999], 'projection retains source identity')
  assert.ok(performance.now() - started < 3000, '42-day intersection stays bounded even for century ranges')
}
