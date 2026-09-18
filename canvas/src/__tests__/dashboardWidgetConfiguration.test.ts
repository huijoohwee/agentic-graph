import assert from 'node:assert/strict'
import { parseDashboardWidgets, configureDashboardCards, configureDashboardMetrics } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'

export function testDashboardWidgetSourceConfiguration() {
  const source = parseDashboardWidgets(JSON.stringify({ version: { key: 'version', type: 'number', value: 1 }, widgets: {
    'graph:a': { visible: false }, 'graph:b': { title: 'Edited', kind: 'table', tone: 'green', order: -1 }, 'mission:tree': { title: 'Execution spans' },
  } }))
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
  for (const value of [ { version: 2, widgets: {} }, { version: 1, widgets: { '__proto__': {}, 'invalid': {} } }, { version: 1, widgets: { 'mission:tree': { trace: { secret: true } } } }, { version: 1, widgets: { 'mission:tree': { order: Infinity } } } ]) {
    assert.throws(() => parseDashboardWidgets(JSON.stringify(value)))
  }
  assert.throws(() => parseDashboardWidgets('{'), 'invalid editor drafts cannot silently replace valid configuration')
}
