import { testDashboardWidgetCommands } from './dashboardWidgetCommands.test'
import { testDashboardWidgetLayoutModel } from './dashboardWidgetLayout.test'
import assert from 'node:assert/strict'
import { parseDashboardWidgets, configureDashboardCards, configureDashboardMetrics } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'

export async function testDashboardWidgetSourceConfiguration() {
  await testDashboardWidgetCommands()
  testDashboardWidgetLayoutModel()
  const source = parseDashboardWidgets(JSON.stringify({ version: { key: 'version', type: 'number', value: 1 }, widgets: {
    'graph:a': { visible: false }, 'graph:b': { title: 'Edited', kind: 'table', tone: 'green', order: -1 }, 'mission:tree': { title: 'Execution spans' }, 'mission:codebase': { title: 'Source context', visible: true },
  } }))
  assert.deepEqual(source.widgets['mission:codebase'], { title: 'Source context', visible: true })
  const card = { id: 'a', title: 'Original', subtitle: 'Source', kind: 'bar' as const, tone: 'blue' as const, series: [], rows: [] }
  assert.deepEqual(configureDashboardCards(source, [card, { ...card, id: 'b' }]).map(item => [item.id, item.title, item.kind]), [['b', 'Edited', 'table']])
  source.widgets['graph:custom'] = { source: 'graph:a', title: 'My chart' }
  assert.equal(configureDashboardCards(source, [card]).at(-1)?.title, 'My chart', 'new instances reuse the existing data source')
  delete source.widgets['graph:custom']
  assert.equal(configureDashboardCards(source, [card]).length, 0, 'removing an instance leaves its source untouched')
  assert.equal(card.title, 'Original', 'display configuration must not modify the data source')
  source.widgets['graph:a'] = { visible: true, order: -2 }
  assert.deepEqual(configureDashboardCards(source, [card, { ...card, id: 'b' }]).map(item => item.id), ['a', 'b'])
  assert.equal(configureDashboardMetrics(source, [{ id: 'b', label: 'CPU', detail: 'Run', value: 'Unknown', tone: 'blue' }])[0]?.value, 'Unknown')
  source.widgets['graph:a'] = { source: 'graph:c' }
  const other = { ...card, id: 'c', title: 'Other source' }
  assert.deepEqual(configureDashboardCards(source, [card], [card, other]).map(item => [item.id, item.title]), [['a', 'Other source']], 'source swaps preserve one existing instance across sections')
  assert.equal(configureDashboardCards(source, [other], [card, other]).length, 1, 'a base widget cannot become a duplicate custom instance in another section')
  const metricSwap = parseDashboardWidgets(JSON.stringify({ version: 1, widgets: { 'graph:first': { source: 'graph:second' } } }))
  assert.deepEqual(configureDashboardMetrics(metricSwap, [{ id: 'first', label: 'First', value: '1', detail: '', tone: 'blue' }, { id: 'second', label: 'Second', value: '2', detail: '', tone: 'blue' }]).map(item => [item.id, item.value]), [['first', '2'], ['second', '2']])
  for (const value of [ { version: 2, widgets: {} }, { version: 1, widgets: { '__proto__': {}, 'invalid': {} } }, { version: 1, widgets: { 'mission:tree': { trace: { secret: true } } } }, { version: 1, widgets: { 'mission:tree': { order: Infinity } } } ]) {
    assert.throws(() => parseDashboardWidgets(JSON.stringify(value)))
  }
  assert.throws(() => parseDashboardWidgets('{'), 'invalid editor drafts cannot silently replace valid configuration')
}
