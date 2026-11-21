import assert from 'node:assert/strict'
import { test } from 'node:test'
import { act } from 'react'
import '../tests/lib/registerCssLoader'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import type { DataViewBrowserHandle, DataViewBrowserState } from '../features/markdown/ui/dataViewBrowserAdapter'

const { DATA_VIEW_BROWSER_LIMITS, mountDataView } = await import('../features/markdown/ui/dataViewBrowserAdapter')

type MutableDataViewBrowserState = Omit<DataViewBrowserState, 'columns' | 'rows'> & {
  columns: Array<{ id: string; name: string }>
  rows: Array<{ id: string; cells: string[] }>
}

const fixture = (): MutableDataViewBrowserState => ({
  columns: [{ id: 'name', name: 'Name' }, { id: 'value', name: 'Value' }],
  rows: [{ id: 'one', cells: ['First', 'One'] }, { id: 'two', cells: ['Second', 'Two'] }],
  ariaLabel: 'Commerce records', selectedRowId: null,
})

function setup() {
  const environment = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  const target = document.createElement('div')
  shadow.append(style, target)
  let handle: DataViewBrowserHandle | undefined
  return {
    ...environment, host, shadow, style, target,
    async mount(state: DataViewBrowserState) {
      await act(async () => { handle = mountDataView(target, state) })
      return handle!
    },
    async cleanup() {
      try { await act(async () => handle?.destroy()) } finally { environment.restore() }
    },
  }
}

test('mount snapshots plain text; activation is explicit and selection stays controlled', async () => {
  const env = setup()
  try {
    const activated: string[] = []
    const state = fixture()
    const literal = '<img src=x onerror=alert(1)> [pay](https://example.test) /buy @agent #workspace'
    state.rows[0].cells[1] = literal
    state.onActivateRow = id => activated.push(id)
    const handle = await env.mount(state)
    assert.equal(env.target.querySelectorAll('table').length, 1)
    const table = env.target.querySelector('table')
    assert.ok(table)
    assert.equal(table.getAttribute('aria-label'), state.ariaLabel)
    const region = table.closest('section[aria-label]:not([role]), [role="region"]')
    assert.equal(region?.getAttribute('aria-label'), state.ariaLabel)
    assert.equal(table.querySelectorAll('col').length, state.columns.length)
    assert.equal(table.querySelectorAll('tbody tr').length, state.rows.length)
    assert.equal(table.querySelector('tbody tr td:last-child')?.textContent, literal)
    assert.equal(env.target.querySelector('img,a,script,iframe'), null)
    assert.deepEqual(activated, [])
    state.rows[0].cells[0] = 'Mutable caller value'
    assert.equal(env.target.querySelector('tbody td')?.textContent, 'First')

    const row = env.target.querySelector('tbody tr') as HTMLElement
    await act(async () => row.click())
    assert.deepEqual(activated, ['one'])
    assert.equal(row.getAttribute('aria-selected'), 'false')
    await act(async () => row.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await act(async () => row.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    assert.deepEqual(activated, ['one', 'one', 'one'])
    await act(async () => handle.update({ ...state, selectedRowId: 'one' }))
    assert.equal(env.target.querySelector('tbody tr')?.getAttribute('aria-selected'), 'true')
    assert.deepEqual(activated, ['one', 'one', 'one'])
  } finally { await env.cleanup() }
})

test('detail orientation, empty state and mount lifecycle preserve the consumer shadow root', async () => {
  const env = setup()
  try {
    const state = fixture()
    state.rows = state.rows.slice(0, 1)
    state.orientation = 'columns'
    const handle = await env.mount(state)
    assert.deepEqual([...env.target.querySelectorAll('thead th')].map(cell => cell.textContent), ['Field', 'First'])
    assert.deepEqual([...env.target.querySelectorAll('tbody th')].map(cell => cell.textContent), ['Name', 'Value'])
    assert.deepEqual([...env.target.querySelectorAll('tbody td')].map(cell => cell.textContent), ['First', 'One'])
    assert.throws(() => mountDataView(env.target, state), /already mounted/)
    await act(async () => handle.update({ ...state, rows: [], selectedRowId: null }))
    assert.deepEqual([...env.target.querySelectorAll('thead th')].map(cell => cell.textContent), ['Field'])
    assert.deepEqual([...env.target.querySelectorAll('tbody th')].map(cell => cell.textContent), state.columns.map(column => column.name))
    assert.equal(env.target.querySelector('tbody td'), null)
    await act(async () => handle.update({ ...state, orientation: 'rows', rows: [] }))
    assert.deepEqual([...env.target.querySelectorAll('thead th')].map(cell => cell.textContent), state.columns.map(column => column.name))
    assert.equal(env.target.querySelector('tbody tr'), null)
    await act(async () => handle.destroy())
    handle.destroy()
    assert.equal(env.target.childElementCount, 0)
    assert.equal(env.shadow.querySelector('style'), env.style)
    assert.equal(env.host.shadowRoot, env.shadow)
    assert.throws(() => handle.update(state), /destroyed/)
    const fresh = fixture()
    await env.mount(fresh)
    assert.equal(env.target.querySelectorAll('tbody tr').length, fresh.rows.length)
  } finally { await env.cleanup() }
})

test('invalid inputs reject before rendering and invalid updates retain the last valid view', async () => {
  const env = setup()
  try {
    const multibyteCell = '界'.repeat(DATA_VIEW_BROWSER_LIMITS.cellChars)
    const overflowRows = Math.floor(DATA_VIEW_BROWSER_LIMITS.payloadBytes / new TextEncoder().encode(multibyteCell).length) + 1
    const invalid: unknown[] = [
      null,
      { ...fixture(), columns: [] },
      { ...fixture(), columns: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] },
      { ...fixture(), rows: [{ id: 'one', cells: ['wrong count'] }] },
      { ...fixture(), rows: [{ id: 'same', cells: ['A', 'B'] }, { id: 'same', cells: ['A', 'B'] }] },
      { ...fixture(), selectedRowId: 'missing' },
      { ...fixture(), orientation: 'cards' },
      { ...fixture(), onActivateRow: '/invoke' },
      { ...fixture(), ariaLabel: '' },
      { ...fixture(), rows: [{ id: 'one', cells: ['\u0000', 'B'] }] },
      { ...fixture(), rows: [{ id: 'one', cells: ['x'.repeat(DATA_VIEW_BROWSER_LIMITS.cellChars + 1), 'B'] }] },
      { ...fixture(), columns: Array.from({ length: DATA_VIEW_BROWSER_LIMITS.columns + 1 }, (_, i) => ({ id: String(i), name: 'Column' })) },
      { ...fixture(), rows: Array.from({ length: DATA_VIEW_BROWSER_LIMITS.rows + 1 }, (_, i) => ({ id: String(i), cells: ['A', 'B'] })) },
      { ...fixture(), rows: [{ id: 'x'.repeat(DATA_VIEW_BROWSER_LIMITS.idChars + 1), cells: ['A', 'B'] }] },
      { ...fixture(), ariaLabel: 'x'.repeat(DATA_VIEW_BROWSER_LIMITS.labelChars + 1) },
      { ...fixture(), columns: [{ id: 'one', name: 'x'.repeat(DATA_VIEW_BROWSER_LIMITS.labelChars + 1) }] },
      // This stays below the character-count guard but exceeds the UTF-8 byte budget.
      { columns: [{ id: 'text', name: 'Text' }], rows: Array.from({ length: overflowRows }, (_, i) => ({ id: String(i), cells: [multibyteCell] })) },
    ]
    for (const input of invalid) {
      assert.throws(() => mountDataView(env.target, input as DataViewBrowserState), /data view/i)
      assert.equal(env.target.childElementCount, 0)
    }
    assert.throws(() => mountDataView(null as unknown as HTMLElement, fixture()), /HTML element/)
    const handle = await env.mount(fixture())
    const previous = env.target.innerHTML
    for (const input of invalid) {
      assert.throws(() => handle.update(input as DataViewBrowserState), /data view/i)
      assert.equal(env.target.innerHTML, previous)
    }
  } finally { await env.cleanup() }
})

test('the browser grid renders every admitted record and keeps selection controlled on update', async () => {
  const env = setup()
  try {
    const state = fixture()
    const activated: string[] = []
    state.rows = Array.from({ length: DATA_VIEW_BROWSER_LIMITS.rows }, (_, i) => ({ id: String(i), cells: [`Record ${i}`, 'Value'] }))
    state.onActivateRow = id => activated.push(id)
    const handle = await env.mount(state)
    const count = () => env.target.querySelectorAll('tbody tr[aria-selected]').length
    assert.equal(count(), state.rows.length)
    const last = state.rows[state.rows.length - 1]
    await act(async () => handle.update({ ...state, selectedRowId: last.id }))
    assert.equal(count(), state.rows.length)
    const selectedCells = env.target.querySelectorAll('tbody tr[aria-selected="true"] td')
    assert.deepEqual([...selectedCells].map(cell => cell.textContent), last.cells)
    const replacement = fixture()
    await act(async () => handle.update({ ...replacement, onActivateRow: state.onActivateRow }))
    assert.equal(count(), replacement.rows.length)
    assert.equal(env.target.querySelector('tr[aria-selected="true"]'), null)
    assert.deepEqual(activated, [])
  } finally { await env.cleanup() }
})
