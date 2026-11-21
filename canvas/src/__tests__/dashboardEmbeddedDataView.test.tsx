import assert from 'node:assert/strict'
import { test } from 'node:test'
import '../tests/lib/registerCssLoader'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWorkspaceDataViewFloatingBinding } from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'

test('Dashboard shares source records and saved layouts with the standalone data views', async () => {
  const { restore } = initJsdomHarness()
  const host = document.body.appendChild(document.createElement('section'))
  const root = createRoot(host)
  const initial = useGraphStore.getState()
  const markdown = '| Item | Status |\n| --- | --- |\n| Copper | Ready |'
  const { default: Dashboard } = await import('@/components/DashboardCanvas/Surface')
  const { MultiDimTableSurface } = await import('@/features/markdown-workspace/main/viewer/MultiDimTableSurface')
  let binding: ReturnType<typeof useWorkspaceDataViewFloatingBinding> = null
  function Settings() {
    binding = useWorkspaceDataViewFloatingBinding()
    return null
  }
  const settings = () => {
    assert.ok(binding, 'the mounted view registered its controls')
    return binding
  }
  async function waitFor(check: () => boolean, message: string) {
    const deadline = Date.now() + 8000
    while (!check() && Date.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.ok(check(), message)
  }
  const dashboard = () => host.querySelector('[aria-label="Dashboard content"]')
  const tableToggle = () => Array.from(dashboard()?.querySelectorAll('button') ?? [])
    .find(button => button.textContent?.trim() === 'Multi-dimensional Table')
  const nested = () => dashboard()?.querySelector('[aria-label="Workspace data view"]')
  function assertTableFitsFrame(table?: HTMLTableElement | null) {
    assert.ok(table)
    assert.equal(table.style.width, '100%', 'the grid fills its frame when the columns fit')
    assert.ok(parseFloat(table.style.minWidth) > 0, 'the grid keeps a scrollable column minimum on narrow screens')
  }
  try {
    useGraphStore.setState({ canvas2dRenderer: 'dashboard', markdownDocumentName: 'inventory.md', markdownDocumentText: markdown, sourceFiles: [] })
    await act(async () => root.render(<><Dashboard /><Settings /></>))
    assert.equal(tableToggle()?.getAttribute('aria-expanded'), 'false')
    assert.ok(!nested(), 'a collapsed section does not mount or parse the table')
    await act(async () => tableToggle()!.click())
    await waitFor(() => !!nested()?.querySelector('table')?.textContent?.includes('Copper'), 'Dashboard displays the source record')
    assertTableFitsFrame(nested()?.querySelector('table'))
    await act(async () => settings().setViewConfig({ ...settings().viewConfig, orientation: 'columns' }))
    assert.ok(nested()?.querySelector('thead')?.textContent?.includes('Copper'), 'the record is now a column')
    assertTableFitsFrame(nested()?.querySelector('table'))
    await act(async () => settings().onChangeLayoutMode!('kanban'))
    const group = Array.from(nested()!.querySelectorAll('button')).find(button => button.textContent?.includes('Choose a column'))
    assert.ok(group, 'Kanban offers the shared grouping settings when no group has been selected')
    await act(async () => group.click())
    assert.equal(settings().activePanel, 'group')
    const status = settings().columns.find(column => column.name === 'Status')
    assert.ok(status)
    await act(async () => settings().setViewConfig({ ...settings().viewConfig, groupByColumnId: status.id }))
    await waitFor(() => !!nested()?.querySelector('[aria-label="Kanban groups"]')?.textContent?.includes('Copper'), 'Kanban displays the same source record inside Dashboard')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'dashboard')
    assert.equal(useGraphStore.getState().markdownDocumentText, markdown)

    await act(async () => root.render(null))
    await act(async () => root.render(<><Dashboard /><Settings /></>))
    await act(async () => tableToggle()!.click())
    await waitFor(() => !!nested()?.querySelector('[aria-label="Kanban groups"]'), 'reopening Dashboard respects the saved view')

    await act(async () => {
      useGraphStore.setState({ canvas2dRenderer: 'multiDimTable' })
      root.render(<><MultiDimTableSurface ariaLabel="Canvas Multi-dimensional Table" /><Settings /></>)
    })
    await waitFor(() => !!host.querySelector('[aria-label="Canvas Multi-dimensional Table"] table')?.textContent?.includes('Copper'), 'the standalone renderer opens as a table')
    assertTableFitsFrame(host.querySelector<HTMLTableElement>('[aria-label="Canvas Multi-dimensional Table"] table'))
    await act(async () => settings().onChangeLayoutMode!('kanban'))
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'kanban')
    await waitFor(() => !!host.querySelector('[aria-label="Kanban groups"]'), 'the standalone renderer can switch to Kanban')
  } finally {
    await act(async () => root.unmount())
    useGraphStore.setState(initial)
    restore()
  }
})
