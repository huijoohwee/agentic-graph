import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { StoreApi } from 'zustand'
import { createCanvasSlice } from '../hooks/store/canvasSlice'
import type { GraphState } from '../hooks/store/types'
import { useGraphStore } from '../hooks/useGraphStore'
import { defaultSchema } from '../lib/graph/schema'
import type { GraphData } from '../lib/graph/types'
import { dispatchRuntimeZoomAction } from '../lib/canvas/runtimeZoomDispatch'
import { useAutoZoomModes2d } from '../features/zoom/useAutoZoomModes2d'
import { ZoomModeSelect } from '../components/toolbar/ZoomModeSelect'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'

function createState() {
  let state = {} as GraphState
  const get = () => state
  const set: StoreApi<GraphState>['setState'] = update => {
    state = { ...state, ...(typeof update === 'function' ? update(state) : update) }
  }
  state = { ...createCanvasSlice(set, get), graphDataRevision: 7 } as GraphState
  return get
}

test('selection-mode requests preserve the mode while manual zoom retains its existing policy', () => {
  const env = initJsdomHarness()
  try {
    const get = createState()
    get().setZoomToSelectionMode(true)
    assert.equal(get().zoomRequest?.type, 'selection')
    const initialRequest = get().zoomRequest
    assert.equal(initialRequest?.type === 'selection' ? initialRequest.origin : undefined, 'selectionMode')
    for (let occurrence = 0; occurrence < 3; occurrence++) {
      get().clearZoomRequest()
      get().requestZoom('selection', { origin: 'selectionMode' })
      assert.equal(get().zoomToSelectionMode, true)
      assert.equal(get().fitToScreenMode, false)
      assert.equal(get().zoomRequest?.type, 'selection')
    }
    for (const command of ['in', 'out', 'reset', 'selection', 'fit'] as const) {
      get().setZoomToSelectionMode(true)
      get().requestZoom(command)
      assert.equal(get().zoomToSelectionMode, false, `${command}: manual requests leave automatic selection mode`)
    }
    get().setFitToScreenMode(true)
    get().requestZoom('fit', { intent: 'fitToScreen' })
    assert.equal(get().fitToScreenMode, true)
    get().setViewPinned(true)
    get().requestZoom('in')
    assert.equal(get().viewPinned, true, 'pinning still permits manual camera commands')
    assert.equal(get().zoomRequest?.type, 'in')
  } finally { env.restore() }
})

test('cancelled or pinned selection mode removes pending automatic work and rejects late requests', () => {
  const env = initJsdomHarness()
  try {
    const get = createState()
    for (const cancel of [() => get().setZoomToSelectionMode(false), () => get().setViewPinned(true)]) {
      get().setZoomToSelectionMode(true)
      cancel()
      assert.equal(get().zoomRequest, null)
      const before = get()
      get().requestZoom('selection', { origin: 'selectionMode' })
      assert.equal(get().zoomRequest, null)
      assert.equal(get().viewPinned, before.viewPinned)
      assert.equal(get().zoomToSelectionMode, false)
    }
    get().setZoomToSelectionMode(true)
    get().requestZoom('out', { origin: 'selectionMode' })
    assert.equal(get().zoomRequest?.type, 'selection', 'automatic origin cannot authorize a different camera command')
    get().requestZoom('selection')
    const manual = get().zoomRequest
    get().setZoomToSelectionMode(false)
    assert.equal(get().zoomRequest, manual, 'cancellation does not discard explicit manual work')
  } finally { env.restore() }
})

function prepareStore() {
  const graphData: GraphData = { type: 'Graph', nodes: Array.from({ length: 4 }, (_, index) => ({
    id: `generated-${index}`, type: 'Entity', label: String(index), x: index * 120, y: index % 2 * 80, properties: {},
  })), edges: [] }
  useGraphStore.setState({ graphData, graphDataRevision: 7, schema: structuredClone(defaultSchema),
    canvasRenderMode: '2d', canvas2dRenderer: 'sequence', viewPinned: false,
    fitToScreenMode: false, zoomToSelectionMode: false, zoomRequest: null,
    selectedNodeId: graphData.nodes[0]!.id, selectedEdgeId: null, selectedGroupId: null,
    selectedNodeIds: [], selectedEdgeIds: [], selectedGroupIds: [], workspaceViewMode: 'canvas',
    workspaceGraphMutationLayoutLockActive: false, markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: 0, lifecycleStage: 'rendering',
  })
  return graphData
}

test('the shared Zoom menu publishes one selection-mode request without invoking its compatibility callback', async () => {
  const env = initJsdomHarness(), previous = useGraphStore.getState()
  const container = document.createElement('section'); document.body.append(container)
  const root = createRoot(container)
  let callbacks = 0, requests = 0
  const unsubscribe = useGraphStore.subscribe(state => state.zoomRequest, value => { if (value) requests++ })
  try {
    prepareStore()
    await act(async () => root.render(<ZoomModeSelect iconSizeClass="" iconStrokeWidth={1} onZoomSelection={() => { callbacks++ }} />))
    await act(async () => container.querySelector('button')!.click())
    const option = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Zoom to Selection'))
    assert.ok(option, 'use the existing shared menu entry')
    await act(async () => option.click())
    assert.equal(useGraphStore.getState().zoomToSelectionMode, true)
    assert.equal(requests, 1)
    assert.equal(callbacks, 0)
  } finally {
    unsubscribe(); await act(async () => root.unmount())
    useGraphStore.setState(previous, true); env.restore()
  }
})

test('runtime automatic dispatch preserves mode and rejects dispatch after cancellation', async () => {
  const env = initJsdomHarness(), previous = useGraphStore.getState()
  try {
    prepareStore()
    useGraphStore.getState().setZoomToSelectionMode(true)
    await dispatchRuntimeZoomAction('selection', { origin: 'selectionMode' })
    assert.equal(useGraphStore.getState().zoomToSelectionMode, true)
    useGraphStore.getState().setZoomToSelectionMode(false)
    await dispatchRuntimeZoomAction('selection', { origin: 'selectionMode' })
    assert.equal(useGraphStore.getState().zoomRequest, null)
    await dispatchRuntimeZoomAction('in')
    assert.equal(useGraphStore.getState().zoomRequest?.type, 'in')
  } finally { useGraphStore.setState(previous, true); env.restore() }
})

test('automatic selection follows successive selections, geometry revisions and resize without duplicate requests', async () => {
  const env = initJsdomHarness(), previous = useGraphStore.getState()
  const priorRaf = globalThis.requestAnimationFrame, priorCancel = globalThis.cancelAnimationFrame
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
  globalThis.cancelAnimationFrame = id => { frames.delete(id) }
  const host = document.createElement('section'), root = createRoot(host); document.body.append(host)
  const graphData = prepareStore(); let requests = 0
  const unsubscribe = useGraphStore.subscribe(state => state.zoomRequest, value => { if (value) requests++ })
  function Probe({ geometry, width = 900, active = true }: { geometry: string; width?: number; active?: boolean }) {
    useAutoZoomModes2d({ viewportW: width, viewportH: 600, paused: !active,
      getGraph: React.useCallback(() => ({ graphData, graphDataRevision: 7, graphLayoutSignature: geometry }), [geometry]),
    })
    return null
  }
  const flush = async () => act(async () => {
    for (let round = 0; round < 4 && frames.size; round++) {
      const ready = [...frames.values()]; frames.clear()
      for (const frame of ready) frame(round)
      await Promise.resolve()
    }
    assert.equal(frames.size, 0, 'camera work settles within the bounded frame queue')
  })
  const consume = () => useGraphStore.getState().clearZoomRequest()
  try {
    await act(async () => root.render(<Probe geometry="positions-1" />)); await flush()
    useGraphStore.getState().setZoomToSelectionMode(true)
    assert.equal(requests, 1)
    consume() // The viewport can apply the initial request before the auto-mode frame runs.
    await flush()
    assert.equal(requests, 1, 'mode activation has one request owner')
    for (let index = 1; index <= 2; index++) {
      useGraphStore.setState({ selectedNodeId: graphData.nodes[index]!.id })
      await flush()
      assert.equal(requests, index + 1)
      assert.equal(useGraphStore.getState().zoomToSelectionMode, true)
      consume()
    }
    await act(async () => root.render(<Probe geometry="positions-2" />)); await flush()
    assert.equal(requests, 4, 'presentation movement refits even though source revision is unchanged')
    consume()
    await act(async () => root.render(<Probe geometry="positions-2" />)); await flush()
    assert.equal(requests, 4, 'unchanged presentation does not refit')
    await act(async () => root.render(<Probe geometry="positions-2" width={390} />)); await flush()
    assert.equal(requests, 5, 'viewport resize refits the current selection')
    consume()
    useGraphStore.setState({ selectedNodeId: graphData.nodes[3]!.id })
    useGraphStore.getState().setViewPinned(true)
    await flush()
    assert.equal(requests, 5, 'pinning before the queued frame prevents automatic motion')
    await act(async () => root.render(<Probe geometry="positions-3" width={390} active={false} />)); await flush()
    assert.equal(requests, 5)
  } finally {
    unsubscribe(); await act(async () => root.unmount())
    assert.equal(frames.size, 0)
    globalThis.requestAnimationFrame = priorRaf; globalThis.cancelAnimationFrame = priorCancel
    useGraphStore.setState(previous, true); env.restore()
  }
})
