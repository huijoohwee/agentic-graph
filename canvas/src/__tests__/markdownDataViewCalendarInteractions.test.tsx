import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { defaultWorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import type { MarkdownDataView } from '@/features/markdown/ui/markdownDataViewModel'

export async function testCalendarDayInteractions() {
  const { dom, restore } = initJsdomHarness()
  // jsdom has the native element but does not implement dialog presentation.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const React = await import('react'), { createRoot } = await import('react-dom/client'), { flushSync } = await import('react-dom')
  const Calendar = (await import('@/features/markdown/ui/MarkdownDataViewCalendarView')).default
  const host = dom.window.document.createElement('section') as HTMLElement; dom.window.document.body.append(host)
  const root = createRoot(host)
  const activeElement = () => Object.getOwnPropertyDescriptor(dom.window.Document.prototype, 'activeElement')?.get?.call(dom.window.document) as Element | null
  const writes: unknown[] = []
  let canMutate = true
  let config = { ...defaultWorkspaceDataViewConfig({ title: 'Calendar', layout: 'calendar', groupByColumnId: null }),
    columnTypesById: { date: 'date' as const }, calendar: { startColumnId: 'date', endColumnId: null, timeZone: 'UTC', month: '2026-10' } }
  const view: MarkdownDataView = { titleColumnId: 'title', groupByColumnId: null,
    columns: [{ id: 'title', name: 'Title', kind: 'text' }, { id: 'date', name: 'Date', kind: 'text' }],
    rows: Array.from({ length: 24 }, (_, index) => ({ id: `r${index}`, cells: [index ? `Record ${index}` : '', '2026-10-15'] })) }
  function render() { root.render(<Calendar view={view} config={config} canMutate={canMutate}
    onChangeConfig={next => { config = next as typeof config; render() }} onNewRecord={seed => writes.push(seed)} onUpdateCell={() => {}} />) }
  const button = (label: string) => {
    const value = Array.from(host.querySelectorAll('button')).find(el => el.getAttribute('aria-label') === label || el.textContent?.trim() === label)
    assert.ok(value, `Missing ${label}`); return value
  }
  const click = (label: string) => flushSync(() => button(label).click())
  try {
    flushSync(render)
    assert.equal(host.querySelectorAll('.kg-calendar-month-grid tbody tr').length, 5)
    assert.equal(host.querySelectorAll('ol[aria-label="Day preview 2026-10-15"] li').length, 3)
    assert.equal(button('Open record: Untitled').textContent, 'Untitled', 'blank titles remain meaningful')
    click('New row on 2026-10-16')
    assert.equal(host.querySelectorAll('form[aria-label^="New row on"]').length, 1)
    assert.equal(activeElement()?.getAttribute('aria-label'), 'New row title on 2026-10-16')
    click('Add row')
    assert.deepEqual(writes, [{ title: 'Untitled', date: '2026-10-16' }], 'day-local creation uses the existing source seed')
    click('New row on 2026-10-17'); click('Cancel'); assert.equal(writes.length, 1)
    click('Show all 24 records on 2026-10-15')
    assert.equal(host.querySelectorAll('ol[aria-label="Records for selected 2026-10-15"] li').length, 20)
    click('Next'); assert.equal(host.querySelectorAll('ol[aria-label="Records for selected 2026-10-15"] li').length, 4)
    const picker = host.querySelector('details.kg-calendar-navigator') as HTMLDetailsElement
    picker.open = true
    const dateButton = button('Go to 2026-10-15'); dateButton.focus()
    dateButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    assert.equal(activeElement()?.getAttribute('aria-label'), 'Go to 2026-10-16')
    click('Go to 2026-10-16'); assert.equal(picker.open, false)
    assert.ok(host.querySelector('aside[aria-label="Selected day 2026-10-16"]'))
    click('Next month'); assert.equal(config.calendar.month, '2026-11')
    assert.equal(writes.length, 1, 'navigation does not mutate source records')
    canMutate = false; flushSync(render)
    assert.equal(host.querySelectorAll('.kg-calendar-new-row').length, 0, 'read-only mode has no creation controls')
    assert.equal(host.querySelectorAll('div,[aria-hidden="true"]').length, 0, 'new UI has semantic selectable wrappers')
  } finally { flushSync(() => root.unmount()); host.remove(); restore() }
}
