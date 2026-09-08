import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import React from 'react'
import { createRoot } from 'react-dom/client'
import FlowCanvas from '@/components/FlowCanvas'
import { __flowCanvasDebug } from '@/components/FlowCanvas/flowCanvasDebug'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultSchema } from '@/lib/graph/schema'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { waitFor, createFlowCanvasTestDom, installDomStubs, installFlowCanvasViewportRect } from '@/tests/lib/flowCanvasIntegrationFixture'
export { testStoryboardWidgetWheelPanKeepsInfiniteCanvasOffViewportWithoutLayoutWrites, testStoryboardWidgetDragZoomAndWorkspaceToggleKeepCollectiveLayoutStable } from './flowCanvasStoryboardIntegration.test'

export const testFlowCanvasUsesActiveGraphRenderDataAndZoomState = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)

  const priorState = useGraphStore.getState()
  const runtimeHolder: { ref: React.MutableRefObject<import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime | null> | null } = { ref: null }

  const baseGraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Alpha Beta Gamma', type: 'Note', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow', source: 'flowCanvasIntegration' },
  }

  useGraphStore.setState({
    graphData: baseGraphData,
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    schema: defaultSchema,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'flow',
    frontmatterModeEnabled: false,
    documentSemanticMode: 'document',
    markdownDocumentName: null,
    markdownDocumentText: '',
    markdownDocumentApplyViewPreset: false,
    documentStructureBaselineLock: false,
    documentStructureBaselineSnapshot: null,
    zoomRequest: null,
    zoomStateByKey: {},
    zoomState: { k: 1, x: 0, y: 0 },
    layoutPositionCacheByMode: {},
  })

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)

  const root = createRoot(host)
  const ActiveGraphFlowCanvas = () => React.createElement(FlowCanvas, {
    active: true, graphDataOverride: useActiveGraphRenderData(true),
    exposeRuntimeRef: ref => { runtimeHolder.ref = ref },
  })
  root.render(React.createElement(ActiveGraphFlowCanvas))

  try {
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0 && __flowCanvasDebug.lastBuiltSceneNodeCount === 1,
  }).catch(e => {
    throw new Error(`stage=initialSceneBuild ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  useGraphStore.setState({
    graphData: { ...baseGraphData, nodes: [...baseGraphData.nodes, { id: 'n2', label: 'Delta', type: 'Note', properties: {} }] },
    graphDataRevision: useGraphStore.getState().graphDataRevision + 1,
  })
  await waitFor({
    ms: 10_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneNodeCount === 2,
  }).catch(e => {
    throw new Error(`stage=activeGraphUpdate ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  if (!key) throw new Error('expected FlowCanvas to publish a zoom view key')

  const runtime = runtimeHolder.ref?.current
  if (!runtime || !Number.isFinite(runtime.transform.k) || runtime.transform.k <= 0) {
    throw new Error('expected a finite mounted camera before the zoom action')
  }
  const beforeZoomK = runtime.transform.k
  useGraphStore.getState().requestZoom('in')
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => runtime.transform.k > beforeZoomK + 1e-6,
  }).catch(e => {
    throw new Error(`stage=zoomInRequest ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  } finally {
  root.unmount()
  useGraphStore.setState({
    graphData: priorState.graphData,
    graphDataRevision: priorState.graphDataRevision,
    schema: priorState.schema,
    frontmatterModeEnabled: priorState.frontmatterModeEnabled,
    documentSemanticMode: priorState.documentSemanticMode,
    markdownDocumentName: priorState.markdownDocumentName,
    markdownDocumentText: priorState.markdownDocumentText,
    markdownDocumentApplyViewPreset: priorState.markdownDocumentApplyViewPreset,
    zoomRequest: priorState.zoomRequest,
    zoomStateByKey: priorState.zoomStateByKey,
    zoomState: priorState.zoomState,
    layoutPositionCacheByMode: priorState.layoutPositionCacheByMode,
  })
  }
}

export const testFlowCanvasAutoFitToScreenRunsInFlowRenderer = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)

  const priorState = useGraphStore.getState()

  const baseGraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Alpha Beta Gamma', type: 'Note', properties: {} }],
    edges: [],
    metadata: { kind: 'test', source: 'flowCanvasAutoFit' },
  }

  useGraphStore.setState({
    graphData: baseGraphData,
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'flow',
    frontmatterModeEnabled: false,
    documentSemanticMode: 'document',
    fitToScreenMode: true,
    lifecycleStage: 'rendering',
    viewPinned: false,
    zoomRequest: null,
    zoomStateByKey: {},
    zoomState: { k: 2, x: 100, y: 100 },
  })

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  root.render(React.createElement(FlowCanvas, { active: true }))

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0,
  })

  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  if (!key) throw new Error('expected FlowCanvas to publish a zoom view key')

  await waitFor({
    ms: 10_000,
    pollMs: 25,
    ok: () => {
      const s = useGraphStore.getState()
      const byKey = s.zoomStateByKey?.[key]
      if (!byKey) return false
      if (typeof byKey.k !== 'number' || typeof byKey.x !== 'number' || typeof byKey.y !== 'number') return false
      return byKey.k !== 2 || byKey.x !== 100 || byKey.y !== 100
    },
  })

  root.unmount()
  useGraphStore.setState({
    graphData: priorState.graphData,
    graphDataRevision: priorState.graphDataRevision,
    frontmatterModeEnabled: priorState.frontmatterModeEnabled,
    documentSemanticMode: priorState.documentSemanticMode,
    fitToScreenMode: priorState.fitToScreenMode,
    lifecycleStage: priorState.lifecycleStage,
    viewPinned: priorState.viewPinned,
    zoomRequest: priorState.zoomRequest,
    zoomStateByKey: priorState.zoomStateByKey,
    zoomState: priorState.zoomState,
  })
}

export const testFlowCanvasAutoZoomToSelectionRunsInFlowRenderer = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)

  const priorState = useGraphStore.getState()

  const baseGraphData = {
    type: 'Graph',
    nodes: [
      { id: 'n1', label: 'Alpha', type: 'Note', properties: {}, x: 0, y: 0 },
      { id: 'n2', label: 'Beta', type: 'Note', properties: {}, x: 200, y: 0 },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'rel', properties: {} }],
    metadata: { kind: 'test', source: 'flowCanvasAutoZoomSelection' },
  }

  useGraphStore.setState({
    graphData: baseGraphData,
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'flow',
    frontmatterModeEnabled: false,
    documentSemanticMode: 'document',
    zoomToSelectionMode: true,
    viewPinned: false,
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    zoomRequest: null,
    zoomStateByKey: {},
    zoomState: { k: 1, x: 0, y: 0 },
  })

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  root.render(React.createElement(FlowCanvas, { active: true }))

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0,
  })

  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  if (!key) throw new Error('expected FlowCanvas to publish a zoom view key')

  useGraphStore.setState({ selectedNodeId: 'n1' })

  await waitFor({
    ms: 10_000,
    pollMs: 25,
    ok: () => {
      const s = useGraphStore.getState()
      const byKey = s.zoomStateByKey?.[key]
      if (!byKey) return false
      if (typeof byKey.x !== 'number' || typeof byKey.y !== 'number' || typeof byKey.k !== 'number') return false
      return byKey.x !== 0 || byKey.y !== 0 || byKey.k !== 1
    },
  })

  root.unmount()
  useGraphStore.setState({
    graphData: priorState.graphData,
    graphDataRevision: priorState.graphDataRevision,
    frontmatterModeEnabled: priorState.frontmatterModeEnabled,
    documentSemanticMode: priorState.documentSemanticMode,
    zoomToSelectionMode: priorState.zoomToSelectionMode,
    viewPinned: priorState.viewPinned,
    selectedNodeId: priorState.selectedNodeId,
    selectedEdgeId: priorState.selectedEdgeId,
    selectedNodeIds: priorState.selectedNodeIds,
    selectedEdgeIds: priorState.selectedEdgeIds,
    zoomRequest: priorState.zoomRequest,
    zoomStateByKey: priorState.zoomStateByKey,
    zoomState: priorState.zoomState,
  })
}

export const testFlowCanvasRebuildsSceneWhenPortHandlesToggleChangesSchemaPresentation = async () => {
  const dom = createFlowCanvasTestDom()
  const draws = installDomStubs(dom)
  installFlowCanvasViewportRect(dom)
  const runtimeHolder: { ref: React.MutableRefObject<import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime | null> | null } = { ref: null }

  const priorState = useGraphStore.getState()

  const baseGraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Alpha', type: 'Note', properties: {
      'flow:portTypes': { in: { input: 'text' }, out: { output: 'text' } },
    } }],
    edges: [{ id: 'feedback', label: 'feedback', source: 'n1', target: 'n1', properties: {
      [FLOW_EDGE_SOURCE_PORT_KEY]: 'output', [FLOW_EDGE_TARGET_PORT_KEY]: 'input',
    } }],
    metadata: { kind: 'test', source: 'flowCanvasPortHandlesRebuild' },
  }

  const baseSchema = {
    ...defaultSchema,
    behavior: {
      ...defaultSchema.behavior,
      portHandles: { ...defaultSchema.behavior.portHandles, enabled: false },
    },
  }

  useGraphStore.setState({
    graphData: baseGraphData,
    canvasRenderMode: '2d', canvas2dRenderer: 'flow',
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    schema: baseSchema,
    frontmatterModeEnabled: false,
    documentSemanticMode: 'document',
    zoomRequest: null,
    zoomStateByKey: {},
    zoomState: { k: 1, x: 0, y: 0 },
  })

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)

  const root = createRoot(host)
  root.render(React.createElement(FlowCanvas, { active: true,
    exposeRuntimeRef: ref => { runtimeHolder.ref = ref },
  }))

  try {
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0 && __flowCanvasDebug.lastBuiltSceneNodeCount === 1 && draws.frames > 0,
  })

  const runtime = runtimeHolder.ref?.current
  if (!runtime || runtime.presentation.portHandles.enabled) throw new Error('expected initially hidden port handles')
  const beforeArcCount = draws.arcs
  const sceneBefore = runtime.scene
  const before = String(__flowCanvasDebug.lastBuiltSceneKey || '')
  if (!before) throw new Error('expected FlowCanvas to publish a scene key')

  useGraphStore.setState({
    schema: {
      ...baseSchema,
      behavior: {
        ...baseSchema.behavior,
        portHandles: { ...(baseSchema.behavior?.portHandles || {}), enabled: true },
      },
    },
  })

  await waitFor({
    ms: 10_000,
    pollMs: 25,
    ok: () => runtime.presentation.portHandles.enabled === true && draws.arcs > beforeArcCount,
  }).catch(() => {
    throw new Error(`port presentation did not draw: ${JSON.stringify({ enabled: runtime.presentation.portHandles.enabled,
      draws, beforeArcCount, handles: runtime.scene.nodes.map(node => node.handles).slice(0, 4) })}`)
  })

  if (runtime.scene !== sceneBefore || String(__flowCanvasDebug.lastBuiltSceneKey || '') !== before) {
    throw new Error('port handle presentation must update without rebuilding the unchanged scene')
  }
  useGraphStore.setState({ schema: baseSchema })
  await waitFor({ ms: 5_000, pollMs: 25,
    ok: () => runtime.presentation.portHandles.enabled === false && draws.arcs === beforeArcCount,
  })
  if (runtime.scene !== sceneBefore) throw new Error('hiding port handles must reuse the existing scene')
  } finally {
  root.unmount()
  useGraphStore.setState({
    graphData: priorState.graphData,
    graphDataRevision: priorState.graphDataRevision,
    schema: priorState.schema,
    canvasRenderMode: priorState.canvasRenderMode, canvas2dRenderer: priorState.canvas2dRenderer,
    frontmatterModeEnabled: priorState.frontmatterModeEnabled,
    documentSemanticMode: priorState.documentSemanticMode,
    zoomRequest: priorState.zoomRequest,
    zoomStateByKey: priorState.zoomStateByKey,
    zoomState: priorState.zoomState,
  })
  }
}
