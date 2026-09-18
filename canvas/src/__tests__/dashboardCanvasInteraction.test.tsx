import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { DASHBOARD_WIDGETS_PATH } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import DashboardCanvas from '@/components/DashboardCanvas'
import { useDashboardSource } from '@/components/DashboardCanvas/useDashboardSource'
import { useWorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/useWorkspaceDataViewConfig'
import type { DataViewCandidate } from '@/features/markdown-workspace/main/viewer/markdownWorkspaceDataViewCandidates'
import { buildDashboardCanvasModel } from '@/components/DashboardCanvas/dashboardModel'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { activateAgentRunWorkspace, openAgentRunInspection, closeAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import DashboardWidgetFlip from '@/components/DashboardCanvas/DashboardWidgetFlip'
import { DashboardMetricGrid } from '@/components/DashboardCanvas/DashboardWidgets'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const waitFrame = () => new Promise(resolve => setTimeout(resolve, 0))

async function waitForSavedDisplay(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate() && Date.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  if (!predicate()) throw Error('Dashboard save did not reach the display: ' + await (await getWorkspaceFs()).readFileText(DASHBOARD_WIDGETS_PATH))
}

const buildDashboardDragGraph = (): GraphData => ({
  type: 'generic',
  metadata: {
    title: 'Dashboard Drag Contract',
  },
  nodes: [
    { id: 'source', label: 'Source', type: 'Input', properties: { score: 1 } },
    { id: 'process', label: 'Process', type: 'Process', properties: { score: 2 } },
    { id: 'output', label: 'Output', type: 'Output', properties: { score: 3 } },
  ],
  edges: [
    { id: 'source-process', source: 'source', target: 'process', label: 'flows', type: 'Flow', properties: {} },
    { id: 'process-output', source: 'process', target: 'output', label: 'flows', type: 'Flow', properties: {} },
  ],
})

function createDashboardDragEvent(
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  type: string,
  target: Element,
  dataTransfer?: {
    effectAllowed: string
    dropEffect: string
    setData: (key: string, value: string) => void
    getData: (key: string) => string
  },
) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number
    clientY: number
    dataTransfer: NonNullable<typeof dataTransfer>
  }
  const store = new Map<string, string>()
  const transfer = dataTransfer || {
    effectAllowed: '',
    dropEffect: '',
    setData: (key: string, value: string) => {
      store.set(key, value)
    },
    getData: (key: string) => store.get(key) || '',
  }
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  Object.defineProperty(event, 'clientX', { value: 10, configurable: true })
  Object.defineProperty(event, 'clientY', { value: 10, configurable: true })
  event.dataTransfer = transfer
  return event
}

const stubCardRect = (element: Element) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 100,
      width: 300,
      height: 100,
      toJSON: () => ({}),
    }),
  })
}

const setEditableValue = (
  dom: ReturnType<typeof initJsdomHarness>['dom'],
  editable: HTMLElement,
  value: string,
) => {
  if (editable.getAttribute('contenteditable') === 'true') { editable.textContent = value; Simulate.input(editable); return }
  const control = editable as HTMLInputElement | HTMLTextAreaElement
  const prototype = editable instanceof dom.window.HTMLTextAreaElement
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (valueSetter) valueSetter.call(editable, value)
  else control.value = value
}

export async function testDashboardCanvasCardDragReordersWithinSection() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const fs = await getWorkspaceFs(), previousConfiguration = await fs.readFileText(DASHBOARD_WIDGETS_PATH)
  await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
  const previousState = useGraphStore.getState()
  const previousSlice = {
    graphData: previousState.graphData,
    graphDataRevision: previousState.graphDataRevision,
    schema: previousState.schema,
    frontmatterModeEnabled: previousState.frontmatterModeEnabled,
    multiDimTableModeEnabled: previousState.multiDimTableModeEnabled,
    documentSemanticMode: previousState.documentSemanticMode,
    canvasRenderMode: previousState.canvasRenderMode,
    canvas2dRenderer: previousState.canvas2dRenderer,
    selectedNodeId: previousState.selectedNodeId,
  }

  try {
    useGraphStore.setState({
      graphData: buildDashboardDragGraph(),
      graphDataRevision: previousState.graphDataRevision + 1,
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      documentSemanticMode: 'document',
      canvasRenderMode: '2d',
      canvas2dRenderer: 'dashboard',
      selectedNodeId: null,
    })

    await act(async () => {
      root.render(React.createElement(DashboardCanvas, { active: true }))
      await waitFrame()
    })

    const readOrder = () => {
      const cards = Array.prototype.slice.call(
        container.querySelectorAll('[data-kg-dashboard-section="structure"] [data-kg-dashboard-card]'),
      ) as Element[]
      return cards.map(card => card.getAttribute('data-kg-dashboard-card') || '')
    }
    const beforeOrder = readOrder()
    if (beforeOrder.join(',') !== 'node-types,edge-types,degree-leaders') {
      throw new Error(`expected initial dashboard card order, got ${beforeOrder.join(',')}`)
    }

    const sourceCard = container.querySelector('[data-kg-dashboard-card="degree-leaders"]')
    const targetCard = container.querySelector('[data-kg-dashboard-card="node-types"]')
    if (!sourceCard || !targetCard) throw new Error('expected dashboard drag source and target cards')
    stubCardRect(sourceCard)
    stubCardRect(targetCard)

    const dragStart = createDashboardDragEvent(dom, 'dragstart', sourceCard)
    await act(async () => {
      sourceCard.dispatchEvent(dragStart)
      await waitFrame()
    })
    const dragOver = createDashboardDragEvent(dom, 'dragover', targetCard, dragStart.dataTransfer)
    await act(async () => {
      targetCard.dispatchEvent(dragOver)
      await waitFrame()
    })
    const drop = createDashboardDragEvent(dom, 'drop', targetCard, dragStart.dataTransfer)
    await act(async () => {
      targetCard.dispatchEvent(drop)
      await waitFrame()
    })

    await waitForSavedDisplay(() => readOrder().join(',') === 'degree-leaders,node-types,edge-types')
    const afterOrder = readOrder()
    if (afterOrder.join(',') !== 'degree-leaders,node-types,edge-types') {
      throw new Error(`expected shared Dashboard card drag to reorder within section, got ${afterOrder.join(',')}`)
    }

    const readMetricOrder = () => {
      const metrics = Array.prototype.slice.call(
        container.querySelectorAll('[data-kg-dashboard-metric]'),
      ) as Element[]
      return metrics.map(metric => metric.getAttribute('data-kg-dashboard-metric') || '')
    }
    const beforeMetricOrder = readMetricOrder()
    if (beforeMetricOrder.join(',') !== 'nodes,edges,density,signals,grid') {
      throw new Error(`expected initial dashboard metric order, got ${beforeMetricOrder.join(',')}`)
    }

    const sourceMetric = container.querySelector('[data-kg-dashboard-metric="grid"]')
    const targetMetric = container.querySelector('[data-kg-dashboard-metric="nodes"]')
    if (!sourceMetric || !targetMetric) throw new Error('expected dashboard metric drag source and target cards')
    stubCardRect(sourceMetric)
    stubCardRect(targetMetric)

    const metricDragStart = createDashboardDragEvent(dom, 'dragstart', sourceMetric)
    await act(async () => {
      sourceMetric.dispatchEvent(metricDragStart)
      await waitFrame()
    })
    const metricDragOver = createDashboardDragEvent(dom, 'dragover', targetMetric, metricDragStart.dataTransfer)
    await act(async () => {
      targetMetric.dispatchEvent(metricDragOver)
      await waitFrame()
    })
    const metricDrop = createDashboardDragEvent(dom, 'drop', targetMetric, metricDragStart.dataTransfer)
    await act(async () => {
      targetMetric.dispatchEvent(metricDrop)
      await waitFrame()
    })

    await waitForSavedDisplay(() => readMetricOrder().join(',') === 'grid,nodes,edges,density,signals')
    const afterMetricOrder = readMetricOrder()
    if (afterMetricOrder.join(',') !== 'grid,nodes,edges,density,signals') {
      throw new Error(`expected shared Dashboard metric drag to reorder within metrics lane, got ${afterMetricOrder.join(',')}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    useGraphStore.setState(previousSlice)
    await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
    if (previousConfiguration !== null) await fs.createFile({ parentPath: '/notes', name: 'dashboard.widgets.json', text: previousConfiguration, mirrorToHost: false })
    restore()
  }
}

export async function testDashboardCanvasCardFlipConfiguration() {
  const { dom, restore } = initJsdomHarness()
  // This keyboard contract needs native focus, rather than the harness's body-only getter.
  delete (dom.window.document as unknown as { activeElement?: Element }).activeElement
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const fs = await getWorkspaceFs(), previousConfiguration = await fs.readFileText(DASHBOARD_WIDGETS_PATH)
  await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
  const previousState = useGraphStore.getState()
  const previousSlice = {
    graphData: previousState.graphData,
    graphDataRevision: previousState.graphDataRevision,
    schema: previousState.schema,
    frontmatterModeEnabled: previousState.frontmatterModeEnabled,
    multiDimTableModeEnabled: previousState.multiDimTableModeEnabled,
    documentSemanticMode: previousState.documentSemanticMode,
    canvasRenderMode: previousState.canvasRenderMode,
    canvas2dRenderer: previousState.canvas2dRenderer,
    selectedNodeId: previousState.selectedNodeId,
  }

  try {
    useGraphStore.setState({
      graphData: buildDashboardDragGraph(),
      graphDataRevision: previousState.graphDataRevision + 1,
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      documentSemanticMode: 'document',
      canvasRenderMode: '2d',
      canvas2dRenderer: 'dashboard',
      selectedNodeId: null,
    })

    await act(async () => {
      root.render(React.createElement(DashboardCanvas, { active: true }))
      await waitFrame()
    })

    const cardSelector = '[data-kg-dashboard-card="node-types"]'
    if (container.querySelector('form[aria-label="Widget configuration"]')) throw Error('Configuration must be absent on the front')
    const front = container.querySelector(cardSelector)!
    await act(async () => { Simulate.click(front); await waitFrame() })
    const frame = container.querySelector('article.kg-dashboard-widget[data-dashboard-widget="graph:node-types"]')!
    const toolbar = frame.querySelector('nav.kg-dashboard-widget-toolbar[data-kg-bubble-toolbar="1"]')!
    if (!toolbar || frame.querySelector('form')) throw Error('Single-click must reveal the shared toolbar without opening settings')
    const flipButton = toolbar.querySelector('button[data-kg-toolbar-action="flip"]')!
    const flipIcon = flipButton.querySelector('[data-kg-toolbar-action-icon="flip"][role="img"]')!
    if (!flipIcon) throw Error('Flip must expose the shared selectable icon surface')
    await act(async () => { Simulate.click(flipIcon); await waitFrame() })
    const form = frame.querySelector('form[aria-label="Widget configuration"]')!
    if (!form || !frame.querySelector('section.kg-dashboard-widget-face[data-kg-widget-face="back"]')) throw Error('Toolbar Flip must reveal the semantic configuration back')
    const inputs = form.querySelectorAll('input')
    const titleEditor = inputs[0], noteEditor = form.querySelector('textarea')!
    await act(async () => {
      setEditableValue(dom, titleEditor, 'Edited Node Type Trend'); Simulate.change(titleEditor)
      setEditableValue(dom, noteEditor, 'Edited dashboard narrative'); Simulate.change(noteEditor)
      await waitFrame()
    })
    await act(async () => { Simulate.submit(form); await waitFrame() })
    await waitForSavedDisplay(() => !!container.querySelector(cardSelector)?.textContent?.includes('Edited Node Type Trend'))
    if (!container.querySelector(cardSelector)?.textContent?.includes('Edited dashboard narrative')) throw Error('Backside edits must reach the front')
    if (container.querySelector('form[aria-label="Widget configuration"]')) throw Error('Save must return to the front')
    await act(async () => { Simulate.keyDown(container.querySelector('[data-dashboard-widget="graph:node-types"]')!, { key: 'Enter' }); await waitFrame() })
    const keyboardFlip = frame.querySelector<HTMLButtonElement>('button[data-kg-toolbar-action="flip"]')!
    if (dom.window.document.activeElement !== keyboardFlip || frame.querySelector('form')) throw Error('Keyboard selection must focus the toolbar, not flip immediately')
    await act(async () => { Simulate.click(keyboardFlip); await waitFrame() })
    const reopened = container.querySelector('form[aria-label="Widget configuration"]')!
    if (!reopened) throw Error('Toolbar keyboard activation must open configuration')
    await act(async () => { Simulate.keyDown(reopened, { key: 'Escape' }); await waitFrame() })
    if (container.querySelector('form[aria-label="Widget configuration"]')) throw Error('Escape must cancel configuration')
    await act(async () => { dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); await waitFrame() })
    if (frame.querySelector('nav[data-kg-bubble-toolbar]')) throw Error('Outside selection must dismiss the shared toolbar')
    await act(async () => { Simulate.dragStart(frame); Simulate.click(frame); await waitFrame() })
    if (frame.querySelector('nav[data-kg-bubble-toolbar]')) throw Error('Drag completion must not select or flip a card')
    if (useGraphStore.getState().graphData?.nodes[0].label !== 'Source') throw Error('Display edits cannot change source graph data')
    let selected = 0
    await act(async () => {
      root.render(<DashboardWidgetFlip widgetId="mission:tree" template="tree" title="Span tree">
        <div role="treeitem" tabIndex={0} onClick={() => { selected++ }} onKeyDown={event => { if (event.key === 'Enter') selected++ }}>Select span</div>
        <label><input type="checkbox" />Live</label>
      </DashboardWidgetFlip>); await waitFrame()
    })
    await act(async () => {
      Simulate.click(container.querySelector('[role="treeitem"]')!)
      Simulate.keyDown(container.querySelector('[role="treeitem"]')!, { key: 'Enter' })
      Simulate.click(container.querySelector('label')!); await waitFrame()
    })
    if (selected !== 2 || container.querySelector('form')) throw Error('Span selection and control labels must not flip their enclosing card')


  } finally {
    await act(async () => {
      root.unmount()
    })
    useGraphStore.setState(previousSlice)
    await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
    if (previousConfiguration !== null) await fs.createFile({ parentPath: '/notes', name: 'dashboard.widgets.json', text: previousConfiguration, mirrorToHost: false })
    restore()
  }
}

export async function testDashboardEvidenceMetricsReuseReadOnlyWidgets() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section'), root = createRoot(container)
  dom.window.document.body.appendChild(container)
  try {
    await act(async () => { root.render(<DashboardMetricGrid metrics={[{ id: 'tokens', label: 'Tokens', value: 'Unknown', detail: 'No observation', tone: 'slate' }]} />); await waitFrame() })
    const metric = container.querySelector('[data-kg-dashboard-metric="tokens"]')
    if (!metric || metric.getAttribute('draggable') !== 'false' || !metric.textContent?.includes('Unknown')) throw Error('Evidence must reuse immutable Dashboard metrics without inventing zero')
    await act(async () => { metric.querySelector('[data-kg-card-inline-edit]')?.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, detail: 2 })); await waitFrame() })
    if (container.querySelector('[contenteditable="true"], input, textarea')) throw Error('Evidence labels cannot be authored')
  } finally { await act(async () => root.unmount()); restore() }
  await testDashboardObservationSource()
  await testEphemeralTableConfiguration()
}

async function testEphemeralTableConfiguration() {
  const { dom, restore } = initJsdomHarness(), container = dom.window.document.createElement('section')
  const root = createRoot(container), previousMode = useGraphStore.getState().multiDimTableModeEnabled
  let config: ReturnType<typeof useWorkspaceDataViewConfig>
  const candidate: DataViewCandidate = { id: 'private-span-table', label: 'Spans', readonly: true,
    table: { type: 'table', raw: '', header: [], align: [], rows: [], startLine: 1, endLine: 1 },
    view: { columns: [{ id: 'col_0', name: 'Span', kind: 'text' }], rows: [], titleColumnId: 'col_0', groupByColumnId: null } }
  function Probe({ source }: { source: DataViewCandidate }) { config = useWorkspaceDataViewConfig(source, null, 'multiDimTable', true); return null }
  try {
    await act(async () => { root.render(<Probe source={candidate} />); await waitFrame() })
    await act(async () => { config!.commitViewConfig({ ...config!.viewConfig!, graphEnabled: !previousMode,
      filterGroups: [{ id: 'g0', rules: [{ id: 'r0', columnId: 'col_0', columnKind: 'text', op: 'equals', value: 'private-span-filter' }] }] }); await waitFrame() })
    await act(async () => { root.render(<Probe source={{ ...candidate, view: { ...candidate.view, rows: [{ id: 'updated', cells: ['Fresh observation'] }] } }} />); await waitFrame() })
    if (config!.viewConfig?.filterGroups[0]?.rules[0]?.value !== 'private-span-filter') throw Error('Stream updates must preserve the table view configuration')
    if (useGraphStore.getState().multiDimTableModeEnabled !== previousMode) throw Error('Inspection settings must not alter authored graph modes')
    if (Object.values(localStorage).some(value => String(value).includes('private-span-filter'))) throw Error('Inspection table filters must not persist')
  } finally { await act(async () => root.unmount()); restore() }
}

async function testDashboardObservationSource() {
  const { dom, restore } = initJsdomHarness(), container = dom.window.document.createElement('section')
  const root = createRoot(container), previous = useGraphStore.getState()
  let source: ReturnType<typeof useDashboardSource>
  function SourceProbe() { source = useDashboardSource(true); return null }
  const model = () => buildDashboardCanvasModel(source.graphData, null)
  try {
    useGraphStore.setState({ graphData: buildDashboardDragGraph(), graphDataRevision: previous.graphDataRevision + 1,
      frontmatterModeEnabled: false, multiDimTableModeEnabled: false, selectedNodeId: 'source' })
    await act(async () => { root.render(<SourceProbe />); await waitFrame() })
    if (source!.readOnly || model().title !== 'Dashboard Drag Contract') throw Error('Ordinary Dashboard must use the authored graph')
    await act(async () => { activateAgentRunWorkspace('tree'); await waitFrame() })
    if (!source!.readOnly || source!.graphData?.nodes.length !== 0 || model().title !== 'Agent Mission') throw Error('An empty inspection must not backfill authored content')
    const now = Date.now(), trace = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'dashboard-observation',
      observedAt: now, expiresAt: now + 60000, coverage: { partial: true }, spans: [{ spanId: 'check', kind: 'check',
        operation: 'Observed check', status: 'completed', timing: { inclusiveMs: 12, exclusiveObservedMs: 0 }, resources: { cpuMs: 3 } }] }, 'dashboard-observation')
    await act(async () => { openAgentRunInspection({ trace, scope: 'fixture', expiresAt: trace.expiresAt, spanId: null, search: '', view: 'tree' }); await waitFrame() })
    const node = source!.graphData!.nodes[0]
    if (node.label !== 'Observed check' || model().metrics[0].value !== '1' || !model().subtitle.includes('Partial trace')) throw Error('Dashboard must summarize the retained observation')
    if (node.properties?.Tokens !== null || node.properties?.['Exclusive observed ms'] !== 0 || 'visual:strokeWidth' in node.properties!) throw Error('Observation data must preserve unknown/zero and exclude display styling')
    await act(async () => { source!.selectNode(node.id); await waitFrame() })
    if (source!.selectedNodeId !== node.id || useGraphStore.getState().selectedNodeId !== 'source') throw Error('Dashboard selection belongs to the inspection only')
    await act(async () => { closeAgentRunInspection(); await waitFrame() })
    if (source!.readOnly || source!.selectedNodeId !== 'source' || model().title !== 'Dashboard Drag Contract' || model().metrics[0].value !== '3') throw Error('Closing inspection restores the authored Dashboard')
  } finally {
    await act(async () => { closeAgentRunInspection(); root.unmount() })
    useGraphStore.setState(previous); restore()
  }
}
