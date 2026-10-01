import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { KanbanNewRecordDividerRow } from '@/features/markdown/ui/kanban/KanbanNewRecordDividerRow'

export async function testNewRecordDividerAffordance() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  let additions = 0
  try {
    let neighboringAdditions = 0
    await act(async () => root.render(<ol>
      <KanbanNewRecordDividerRow onClick={() => { additions++ }} />
      <KanbanNewRecordDividerRow onClick={() => { neighboringAdditions++ }} />
    </ol>))
    const rows = host.querySelectorAll('ol > li[data-kg-kanban-divider="1"]')
    assert.equal(rows.length, 2, 'each insertion position has its own semantic hover target')
    assert.equal(host.querySelector('[data-kg-kanban-group-actions]'), null)
    for (const row of rows) assert.equal(row.children.length, 1)
    const button = host.querySelector('button')!
    const graphic = button.querySelector('svg[role="img"]')!
    assert.equal(button.parentElement, rows[0])
    assert.equal(button.type, 'button')
    assert.equal(button.getAttribute('aria-label'), 'New Record')
    assert.equal(graphic.getAttribute('aria-label'), 'New Record')
    assert.equal(graphic.querySelector('title')?.textContent, 'New Record')
    assert.equal(host.querySelector('div, [aria-hidden="true"], [role="presentation"]'), null)
    assert.equal(button.tabIndex, 0)
    assert.equal(button.disabled, false)
    for (const part of ['line', 'circle', 'path']) {
      await act(async () => graphic.querySelector(part)!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    }
    assert.equal(additions, 3, 'each visible graphic part activates the same button once')
    await act(async () => button.click())
    assert.equal(additions, 4, 'the native button retains its activation callback')
    assert.equal(neighboringAdditions, 0, 'activation stays at the selected insertion position')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    restore()
  }
}
