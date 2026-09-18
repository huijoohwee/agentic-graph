import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import DashboardCanvas from '@/components/DashboardCanvas'
import { DashboardMetricGrid } from '@/components/DashboardCanvas/DashboardWidgets'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const waitFrame = () => new Promise(resolve => setTimeout(resolve, 0))

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

    const afterMetricOrder = readMetricOrder()
    if (afterMetricOrder.join(',') !== 'grid,nodes,edges,density,signals') {
      throw new Error(`expected shared Dashboard metric drag to reorder within metrics lane, got ${afterMetricOrder.join(',')}`)
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    useGraphStore.setState(previousSlice)
    restore()
  }
}

export async function testDashboardCanvasCardInlineEditUsesSharedStoryboardEditor() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
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
    const titleDisplay = container.querySelector(
      `${cardSelector} [data-kg-dashboard-card-inline-edit="title"] [data-kg-card-inline-edit="1"]`,
    )
    if (!(titleDisplay instanceof dom.window.HTMLElement)) {
      throw new Error('expected Dashboard card title to reuse the shared CardInlineTextEditor display surface')
    }
    if (titleDisplay.getAttribute('data-kg-card-inline-edit-activation') !== 'doubleClick') {
      throw new Error('expected Dashboard card title editing to follow the shared Storyboard double-click activation')
    }

    await act(async () => {
      titleDisplay.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }))
      await waitFrame()
    })

    const titleEditor = container.querySelector('[role="textbox"][aria-label="Dashboard card title for node-types"]')
    if (!(titleEditor instanceof dom.window.HTMLElement)) {
      throw new Error(`expected Dashboard card title to open the shared title editor, found=${container.querySelectorAll('[role="textbox"]').length}`)
    }

    await act(async () => {
      setEditableValue(dom, titleEditor, 'Edited Node Type Trend')
      await waitFrame()
      Simulate.keyDown(titleEditor, { key: 'Enter' })
      await waitFrame()
    })

    const editedCard = container.querySelector(cardSelector)
    if (!editedCard?.textContent?.includes('Edited Node Type Trend')) {
      throw new Error('expected Dashboard card title edit to commit through the shared card text override path')
    }

    const footnoteDisplay = container.querySelector(
      `${cardSelector} [data-kg-dashboard-card-inline-edit="footnote"] [data-kg-card-inline-edit="1"]`,
    )
    if (!(footnoteDisplay instanceof dom.window.HTMLElement)) {
      throw new Error('expected Dashboard card note to expose the shared Storyboard multiline editor surface')
    }

    await act(async () => {
      footnoteDisplay.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }))
      await waitFrame()
    })

    const footnoteEditor = container.querySelector('[role="textbox"][aria-label="Dashboard card footnote for node-types"]')
    if (!(footnoteEditor instanceof dom.window.HTMLElement)) {
      throw new Error(`expected Dashboard card note to open the shared multiline editor, found=${container.querySelectorAll('[role="textbox"]').length}`)
    }

    await act(async () => {
      setEditableValue(dom, footnoteEditor, 'YTD Trend\nEdited dashboard narrative')
      await waitFrame()
      Simulate.keyDown(footnoteEditor, { key: 'Enter', metaKey: true })
      await waitFrame()
    })

    const editedNarrativeCard = container.querySelector(cardSelector)
    if (!editedNarrativeCard?.textContent?.includes('Edited dashboard narrative')) {
      throw new Error('expected Dashboard card note edit to commit through the shared Storyboard multiline editor path')
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    useGraphStore.setState(previousSlice)
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
}
