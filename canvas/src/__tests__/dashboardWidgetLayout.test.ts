import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import DashboardWidgetBoard from '@/components/DashboardCanvas/DashboardWidgetBoard'
import { DashboardCardView } from '@/components/DashboardCanvas/DashboardWidgets'
import { dashboardWidgetRows, moveDashboardWidget, dashboardDropPosition, dashboardColumnStyle } from '@/components/DashboardCanvas/dashboardWidgetLayout'
import { DASHBOARD_WIDGETS_PATH, parseDashboardWidgets } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import AgentMissionOverview from '@/features/agent-ready/AgentMissionOverview'
import { activateAgentRunWorkspace, openAgentRunInspection, closeAgentRunInspection, readAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'

export function testDashboardWidgetLayoutModel() {
  const rows = [['mission:codebase'], ['mission:tree']]
  const paired = moveDashboardWidget(rows, 'mission:codebase', 'mission:tree', 'right')
  assert.deepEqual(paired, [['mission:tree', 'mission:codebase']])
  assert.deepEqual(rows, [['mission:codebase'], ['mission:tree']], 'retained inputs cannot be mutated')
  assert.deepEqual(moveDashboardWidget(paired, 'mission:codebase', 'mission:tree', 'before'), rows)
  assert.equal(moveDashboardWidget(rows, 'mission:codebase', 'mission:codebase', 'left'), rows)
  assert.equal(moveDashboardWidget(rows, 'foreign', 'mission:tree', 'left'), rows)
  assert.deepEqual(dashboardWidgetRows([['missing', 'mission:tree', 'mission:tree']], rows.flat(), 1), [['mission:tree'], ['mission:codebase']])
  assert.deepEqual(dashboardWidgetRows(undefined, ['graph:a', 'graph:b', 'graph:c'], 2), [['graph:a', 'graph:b'], ['graph:c']])
  const grid = { enabled: true, size: 20, x: 20, y: 20, grid: [20, 20] as [number, number] }
  const rect = { left: 100, top: 100, width: 100, height: 100 }
  assert.equal(dashboardDropPosition({ x: 174, y: 150 }, rect, { ...grid, enabled: false }), 'after')
  assert.equal(dashboardDropPosition({ x: 174, y: 150 }, rect, grid), 'right', 'native snapping must change the drop coordinate')
  assert.equal(dashboardDropPosition({ x: 105, y: 150 }, rect, grid), 'left')
  assert.equal(dashboardDropPosition({ x: 150, y: 101 }, rect, grid), 'before')
  assert.deepEqual(dashboardColumnStyle(1010, 2, grid), { gap: 20, width: '480px' })
  assert.deepEqual(dashboardColumnStyle(1010, 2, { ...grid, enabled: false }), { gap: 12, width: 'calc((100% - 12px) / 2)' })
  const document = { version: 1, widgets: {}, boards: { mission: paired } }
  assert.deepEqual(parseDashboardWidgets(JSON.stringify(document)), document)
  for (const rows of [[['mission:tree', 'mission:tree']], [['invalid']], [[]], [Array(13).fill('mission:tree')]])
    assert.throws(() => parseDashboardWidgets(JSON.stringify({ ...document, boards: { mission: rows } })))
}

export async function testDashboardMissionCardColumns() {
  const { dom, restore } = initJsdomHarness(), container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container), fs = await getWorkspaceFs(), prior = await fs.readFileText(DASHBOARD_WIDGETS_PATH)
  const graph = useGraphStore.getState().graphData
  let mounts = 0
  const tick = () => new Promise(resolve => setTimeout(resolve, 20))
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await tick() })
    assert.ok(predicate(), 'layout did not reach the expected state')
  }
  function Card({ id }: { id: string }) {
    React.useEffect(() => { mounts++ }, [])
    return React.createElement(DashboardCardView, { card: { id, title: id, subtitle: '', tone: 'blue', kind: 'table', series: [], rows: [] } },
      React.createElement('input', { 'aria-label': 'Search ' + id }),
      React.createElement('div', { 'data-kg-card-media-interactive': '1' }, 'Graph gestures'))
  }
  const items = ['codebase', 'tree'].map(id => ({ id: 'mission:' + id, cardId: id, content: React.createElement(Card, { id }) }))
  const renderBoard = () => root.render(React.createElement(DashboardWidgetBoard, { id: 'mission', items }))
  const find = (id: string) => container.querySelector<HTMLElement>('[data-kg-dashboard-card="' + id + '"]')!
  const transfer = new Map<string, string>()
  const event = (name: string, x = 280, y = 50) => {
    const e = new dom.window.Event(name, { bubbles: true, cancelable: true })
    Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: {
      effectAllowed: '', dropEffect: '', setData: (key: string, value: string) => transfer.set(key, value), getData: (key: string) => transfer.get(key) || '',
    } } })
    return e
  }
  try {
    await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
    await act(async () => { renderBoard(); await tick() })
    await waitFor(() => find('codebase')?.draggable === true)
    const codebase = find('codebase'), tree = find('tree'), search = codebase.querySelector('input')!
    search.value = 'retained search'
    Object.defineProperty(tree, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100 }) })
    for (const control of [search, codebase.querySelector('[data-kg-card-media-interactive]')!]) {
      transfer.clear()
      await act(async () => { control.dispatchEvent(event('dragstart')); await tick() })
      assert.equal(transfer.size, 0, 'search and graph gestures must not become widget drags')
    }
    await act(async () => { codebase.dispatchEvent(event('dragstart')); await tick() })
    await act(async () => { tree.dispatchEvent(event('dragover', 20)); await tick() })
    assert.ok(tree.textContent?.includes('left'))
    await act(async () => { tree.dispatchEvent(event('dragover')); await tick() })
    assert.ok(tree.textContent?.includes('right'), 'reuse the shared side-drop preview')
    await act(async () => { tree.dispatchEvent(event('drop')); await tick() })
    await waitFor(() => container.querySelectorAll('[data-dashboard-columns="2"]').length === 2)
    assert.equal(find('codebase'), codebase, 'moving columns must retain the same mounted graph')
    assert.equal(find('tree'), tree, 'moving columns must retain the same mounted observer')
    assert.equal(mounts, 2)
    assert.equal(search.value, 'retained search')
    assert.deepEqual(JSON.parse((await fs.readFileText(DASHBOARD_WIDGETS_PATH))!).boards.mission, [['mission:tree', 'mission:codebase']])
    assert.equal(useGraphStore.getState().graphData, graph)
    // The keyboard path commits through the same shared drag owner.
    await act(async () => { codebase.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true })); await tick() })
    await waitFor(() => container.querySelectorAll('[data-dashboard-columns="1"]').length === 2)
    assert.equal(mounts, 2)
    await act(async () => { root.render(null); await tick(); renderBoard(); await tick() })
    assert.deepEqual([...container.querySelectorAll('[data-kg-dashboard-card]')].map(node => node.getAttribute('data-kg-dashboard-card')), ['codebase', 'tree'], 'saved row placement survives remount')
    // Empty workspace activation must keep its single observer mounted through snapshot arrival.
    await act(async () => { root.render(null); closeAgentRunInspection(); activateAgentRunWorkspace('tree'); await tick() })
    mounts = 0
    await act(async () => { root.render(React.createElement(AgentMissionOverview, null, React.createElement(Card, { id: 'agent-tree' }))); await tick() })
    assert.equal(mounts, 1)
    const now = Date.now(), trace = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'bootstrap', observedAt: now, expiresAt: now + 60000, spans: [] }, 'bootstrap')
    await act(async () => { openAgentRunInspection({ trace, scope: 'fixture', expiresAt: trace.expiresAt, spanId: null, search: '', view: 'tree' }); await tick() })
    assert.equal(mounts, 1, 'the observer cannot remount when the first evidence snapshot arrives')
  } finally {
    await act(async () => { root.unmount(); closeAgentRunInspection() })
    await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
    if (prior !== null) await fs.createFile({ parentPath: '/notes', name: 'dashboard.widgets.json', text: prior, mirrorToHost: false })
    restore()
  }
}

export async function testMissionDisplayControlsKeepInspection() {
  const { Canvas2dRendererSelect } = await import('@/components/toolbar/Canvas2dRendererSelect')
  const { executeCanvasViewControl } = await import('@/lib/canvas/canvasViewControlRuntime')
  const { BLOCK_SCHEMA } = await import('./canvas3dMode.test')
  const { dom, restore } = initJsdomHarness(), container = dom.window.document.createElement('section'), root = createRoot(container)
  const previous = useGraphStore.getState(), noop = () => {}
  try {
    useGraphStore.setState({ schema: structuredClone(BLOCK_SCHEMA), canvas2dRenderer: 'd3', canvasRenderMode: '2d', frontmatterModeEnabled: false, multiDimTableModeEnabled: false })
    activateAgentRunWorkspace('tree')
    const workspace = readAgentRunWorkspace()
    await act(async () => { root.render(React.createElement(Canvas2dRendererSelect, {
      iconSizeClass: 'h-4', iconStrokeWidth: 1, ensureBaselineUnlocked: () => true,
      geospatialEnabled: false, onOpenGeospatialMode: noop, onActivateGeoXrMode: noop, onExitGeospatialMode: noop,
    })) })
    for (const [optionId, key] of [['control:grid', 'canvasGrid'], ['control:snapGrid', 'snapGrid']] as const) {
      await act(async () => { executeCanvasViewControl({ optionId }) })
      assert.equal(readAgentRunWorkspace(), workspace, 'display controls must retain the current Mission')
      assert.equal(useGraphStore.getState().schema.behavior?.[key]?.enabled, true)
      assert.equal(useGraphStore.getState().graphData, previous.graphData, 'presentation must not replace evidence or authored sources')
    }
    await act(async () => { executeCanvasViewControl({ optionId: 'renderer:d3' }) })
    assert.equal(readAgentRunWorkspace(), null, 'explicit renderer navigation may leave Mission')
  } finally {
    await act(async () => { root.unmount(); closeAgentRunInspection(); useGraphStore.setState(previous) })
    restore()
  }
}
