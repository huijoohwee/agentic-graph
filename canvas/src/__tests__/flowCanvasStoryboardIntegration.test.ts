import React from 'react'
import { quantizeZoomStateForCommit } from '@/lib/zoom/zoomStateQuantize'
import { createRoot } from 'react-dom/client'
import FlowCanvas from '@/components/FlowCanvas'
import { __flowCanvasDebug } from '@/components/FlowCanvas/flowCanvasDebug'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultSchema } from '@/lib/graph/schema'
import { readStoryboardWidgetGeometryStateSignature } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeWidgetState'
import { sleep, waitFor, createFlowCanvasTestDom, installDomStubs, installFlowCanvasViewportRect, dispatchFlowCanvasPointerEvent, readFlowSceneSignature, buildCollectiveStoryboardWidgetGraphFixture } from '@/tests/lib/flowCanvasIntegrationFixture'

export const testStoryboardWidgetWheelPanKeepsInfiniteCanvasOffViewportWithoutLayoutWrites = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)
  installFlowCanvasViewportRect(dom, 960, 540)

  const priorState = useGraphStore.getState()
  const runtimeHolder: { ref: React.MutableRefObject<import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime | null> | null } = { ref: null }
  const graphData = buildCollectiveStoryboardWidgetGraphFixture()
  const schema = {
    ...defaultSchema,
    performance: {
      ...(defaultSchema.performance || {}),
      zoom: {
        ...(defaultSchema.performance?.zoom || {}),
        wheelBehavior: 'pan',
      },
    },
  }

  useGraphStore.setState({
    graphData,
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    schema,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'storyboard',
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
    viewportControlsPreset: 'design',
    canvasPointerMode2d: 'pan',
    fitToScreenMode: false,
    zoomToSelectionMode: false,
    viewPinned: false,
  } as never)

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  root.render(React.createElement(FlowCanvas, {
    active: true,
    exposeRuntimeRef: ref => {
      runtimeHolder.ref = ref
    },
  }))

  try {
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const scene = runtimeHolder.ref?.current?.scene
      return !!(
        scene &&
        (scene.nodes.length || 0) === 5 &&
        (scene.edges.length || 0) === 3 &&
        host.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id="rich-panel"]').length === 1 &&
        (scene.groups?.length || 0) >= 5
      )
    },
  }).catch(e => {
    throw new Error(`stage=storyboardWidgetSceneBuild ${String((e as { message?: unknown })?.message ?? e)} snapshot=${JSON.stringify({ nodes: runtimeHolder.ref?.current?.scene.nodes.map(n => n.id), edges: runtimeHolder.ref?.current?.scene.edges.map(e => e.id), groups: runtimeHolder.ref?.current?.scene.groups?.map(g => g.id), renderer: useGraphStore.getState().canvas2dRenderer, renderMediaAsNodes: useGraphStore.getState().renderMediaAsNodes })}`)
  })

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const t = runtimeHolder.ref?.current?.transform
      return !!t && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.k)
    },
  })

  const runtime = runtimeHolder.ref?.current
  const canvas = host.querySelector('canvas')
  if (!runtime || !canvas) throw new Error('expected mounted Storyboard Widget runtime and canvas')
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => runtime.scene.nodes.some(node => Math.abs(node.x) > 1 || Math.abs(node.y) > 1),
  }).catch(e => {
    throw new Error(`stage=storyboardWidgetInitialSceneLayout ${String((e as { message?: unknown })?.message ?? e)}`)
  })
  const beforeTransform = runtime.transform
  const beforePositions = JSON.stringify(useGraphStore.getState().layoutPositionCacheByMode || {})
  const beforeGraphData = JSON.stringify(useGraphStore.getState().graphData)
  const expectedNodeIds = ['left', 'right', 'widget-text', 'widget-image', 'widget-video', 'rich-panel']
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    if (!runtime.scene.nodeById.has(expectedNodeIds[i]!) && !host.querySelector(`[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id="${expectedNodeIds[i]}"]`)) {
      throw new Error(`expected native scene or its Rich Media overlay to include ${expectedNodeIds[i]}`)
    }
  }
  const beforeSceneKey = String(__flowCanvasDebug.lastBuiltSceneKey || '')
  const beforeSceneSignature = readFlowSceneSignature(runtime)

  // JSDOM has no hit testing, and the viewport fixture gives every element the same rectangle.
  // These events explicitly target the canvas; expose that hit target to the shared wheel guard.
  const previousHitTest = Object.getOwnPropertyDescriptor(dom.window.document, 'elementFromPoint')
  Object.defineProperty(dom.window.document, 'elementFromPoint', { configurable: true, value: () => canvas })
  try {
  for (let i = 0; i < 5; i += 1) {
    canvas.dispatchEvent(new dom.window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaX: 180,
      deltaY: 0,
      clientX: 480,
      clientY: 270,
    }))
  }

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const t = runtime.transform
      return Math.abs(t.x - beforeTransform.x) > 300
    },
  }).catch(e => {
    throw new Error(`stage=wheelPanMoved ${String((e as { message?: unknown })?.message ?? e)} before=${beforeTransform.x},${beforeTransform.y} after=${runtime.transform.x},${runtime.transform.y}`)
  })

  } finally {
    if (previousHitTest) Object.defineProperty(dom.window.document, 'elementFromPoint', previousHitTest)
    else Reflect.deleteProperty(dom.window.document, 'elementFromPoint')
  }

  const afterTransform = runtime.transform
  const expectedCommit = quantizeZoomStateForCommit(afterTransform)
  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const st = useGraphStore.getState()
      const committed = (key ? st.zoomStateByKey?.[key] : null) || st.zoomState || null
      return !!(
        committed &&
        Math.abs(committed.x - expectedCommit.x) <= 1e-6 &&
        Math.abs(committed.y - expectedCommit.y) <= 1e-6 &&
        Math.abs(committed.k - expectedCommit.k) <= 1e-6
      )
    },
  }).catch(e => {
    const st = useGraphStore.getState()
    throw new Error(`stage=deferredPanCommit ${String((e as { message?: unknown })?.message ?? e)} key=${key} keyed=${JSON.stringify(key ? st.zoomStateByKey?.[key] : null)} global=${JSON.stringify(st.zoomState)} transform=${afterTransform.x},${afterTransform.y}`)
  })
  const afterPositions = JSON.stringify(useGraphStore.getState().layoutPositionCacheByMode || {})
  const afterGraphData = JSON.stringify(useGraphStore.getState().graphData)
  const afterSceneSignature = readFlowSceneSignature(runtime)
  if (afterTransform.x > beforeTransform.x - 300) {
    throw new Error(`expected Storyboard Widget wheel pan to remain off-viewport instead of bouncing back, before=${beforeTransform.x} after=${afterTransform.x}`)
  }
  if (Math.abs(afterTransform.y - beforeTransform.y) > 1e-6) {
    throw new Error(`expected horizontal wheel pan to preserve y transform, before=${beforeTransform.y} after=${afterTransform.y}`)
  }
  if (afterPositions !== beforePositions) {
    throw new Error(`expected Storyboard Widget wheel pan to avoid layout-position writes, before=${beforePositions} after=${afterPositions}`)
  }
  if (afterGraphData !== beforeGraphData) {
    throw new Error('expected Storyboard Widget wheel pan to avoid mutating source graph data for nodes, widgets, groups, edges, or rich media panels')
  }
  if (afterSceneSignature !== beforeSceneSignature) {
    throw new Error(`expected Storyboard Widget wheel pan to preserve native scene layout for nodes/widgets/subgraphs/clusters/groups/edges/rich media panels, before=${beforeSceneSignature} after=${afterSceneSignature}`)
  }
  if (String(__flowCanvasDebug.lastBuiltSceneKey || '') !== beforeSceneKey) {
    throw new Error('expected Storyboard Widget wheel pan not to rebuild collective native scene')
  }
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
      documentStructureBaselineLock: priorState.documentStructureBaselineLock,
      documentStructureBaselineSnapshot: priorState.documentStructureBaselineSnapshot,
      zoomRequest: priorState.zoomRequest,
      zoomStateByKey: priorState.zoomStateByKey,
      zoomState: priorState.zoomState,
      layoutPositionCacheByMode: priorState.layoutPositionCacheByMode,
      canvasRenderMode: priorState.canvasRenderMode,
      canvas2dRenderer: priorState.canvas2dRenderer,
      viewportControlsPreset: priorState.viewportControlsPreset,
      canvasPointerMode2d: priorState.canvasPointerMode2d,
      fitToScreenMode: priorState.fitToScreenMode,
      zoomToSelectionMode: priorState.zoomToSelectionMode,
      viewPinned: priorState.viewPinned,
    } as never)
  }
}

export const testStoryboardWidgetDragZoomAndWorkspaceToggleKeepCollectiveLayoutStable = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)
  installFlowCanvasViewportRect(dom, 960, 540)

  const priorState = useGraphStore.getState()
  const runtimeHolder: { ref: React.MutableRefObject<import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime | null> | null } = { ref: null }
  const graphData = buildCollectiveStoryboardWidgetGraphFixture()
  const schema = {
    ...defaultSchema,
    performance: {
      ...(defaultSchema.performance || {}),
      zoom: {
        ...(defaultSchema.performance?.zoom || {}),
        wheelBehavior: 'zoom',
        smoothDurationMs: 0,
      },
    },
  }

  useGraphStore.setState({
    graphData,
    graphDataRevision: (priorState.graphDataRevision || 0) + 1,
    schema,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'storyboard',
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
    viewportControlsPreset: 'design',
    canvasPointerMode2d: 'pan',
    fitToScreenMode: false,
    zoomToSelectionMode: false,
    viewPinned: false,
    workspaceViewMode: 'canvas',
    workspaceCanvasPaneOpen: false,
  } as never)

  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  root.render(React.createElement(FlowCanvas, {
    active: true,
    exposeRuntimeRef: ref => {
      runtimeHolder.ref = ref
    },
  }))

  try {
    await waitFor({
      ms: 5_000,
      pollMs: 25,
      ok: () => {
        const scene = runtimeHolder.ref?.current?.scene
        return !!(
          scene &&
          (scene.nodes.length || 0) === 5 &&
          (scene.edges.length || 0) === 3 &&
        host.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id="rich-panel"]').length === 1 &&
          (scene.groups?.length || 0) >= 5
        )
      },
    }).catch(e => {
      throw new Error(`stage=collectiveSceneBuild ${String((e as { message?: unknown })?.message ?? e)} snapshot=${JSON.stringify({ nodes: runtimeHolder.ref?.current?.scene.nodes.map(n => n.id), edges: runtimeHolder.ref?.current?.scene.edges.map(e => e.id), groups: runtimeHolder.ref?.current?.scene.groups?.map(g => g.id), renderer: useGraphStore.getState().canvas2dRenderer, renderMediaAsNodes: useGraphStore.getState().renderMediaAsNodes })}`)
    })

    const runtime = runtimeHolder.ref?.current
    const canvas = host.querySelector('canvas')
    if (!runtime || !canvas) throw new Error('expected mounted Storyboard Widget runtime and canvas')

    await waitFor({
      ms: 5_000,
      pollMs: 25,
      ok: () => runtime.scene.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)) &&
        runtime.scene.nodes.some(node => Math.abs(node.x) > 1 || Math.abs(node.y) > 1),
    })

    const beforeTransform = runtime.transform
    const beforeSceneKey = String(__flowCanvasDebug.lastBuiltSceneKey || '')
    const beforeSceneSignature = readFlowSceneSignature(runtime)
    const beforePositions = JSON.stringify(useGraphStore.getState().layoutPositionCacheByMode || {})
    const beforeGraphData = JSON.stringify(useGraphStore.getState().graphData)
    const beforeFlowWidgetGeometry = readStoryboardWidgetGeometryStateSignature(useGraphStore.getState())
    dispatchFlowCanvasPointerEvent(canvas, dom.window, 'pointerdown', { pointerId: 31, button: 1, clientX: 220, clientY: 180, buttons: 4 })
    dispatchFlowCanvasPointerEvent(canvas, dom.window, 'pointermove', { pointerId: 31, button: 1, clientX: 300, clientY: 220, buttons: 4 })
    dispatchFlowCanvasPointerEvent(dom.window, dom.window, 'pointermove', { pointerId: 31, button: 1, clientX: 300, clientY: 220, buttons: 4 })
    dispatchFlowCanvasPointerEvent(canvas, dom.window, 'pointerup', { pointerId: 31, button: 1, clientX: 300, clientY: 220, buttons: 0 })
    dispatchFlowCanvasPointerEvent(dom.window, dom.window, 'pointerup', { pointerId: 31, button: 1, clientX: 300, clientY: 220, buttons: 0 })

    await waitFor({
      ms: 5_000,
      pollMs: 25,
      ok: () => Math.abs(runtime.transform.x - beforeTransform.x) > 20 || Math.abs(runtime.transform.y - beforeTransform.y) > 20,
    }).catch(e => {
      throw new Error(`stage=pointerDragPanMoved ${String((e as { message?: unknown })?.message ?? e)} before=${beforeTransform.x},${beforeTransform.y} after=${runtime.transform.x},${runtime.transform.y}`)
    })

    const afterDragTransform = runtime.transform
    useGraphStore.getState().requestZoom('in')

    await waitFor({
      ms: 5_000,
      pollMs: 25,
      ok: () => runtime.transform.k > afterDragTransform.k + 1e-6,
    }).catch(e => {
      throw new Error(`stage=zoomRequestChangedScale ${String((e as { message?: unknown })?.message ?? e)} beforeK=${afterDragTransform.k} afterK=${runtime.transform.k}`)
    })

    useGraphStore.getState().setWorkspaceViewMode('editor')
    useGraphStore.getState().setWorkspaceCanvasPaneOpen(true)
    await sleep(100)
    useGraphStore.getState().setWorkspaceCanvasPaneOpen(false)
    useGraphStore.getState().setWorkspaceViewMode('canvas')
    await sleep(100)

    const afterPositions = JSON.stringify(useGraphStore.getState().layoutPositionCacheByMode || {})
    const afterGraphData = JSON.stringify(useGraphStore.getState().graphData)
    const afterFlowWidgetGeometry = readStoryboardWidgetGeometryStateSignature(useGraphStore.getState())
    const afterSceneSignature = readFlowSceneSignature(runtime)
    const afterSceneKey = String(__flowCanvasDebug.lastBuiltSceneKey || '')
    if (afterPositions !== beforePositions) {
      throw new Error(`expected Storyboard Widget drag/zoom/workspace toggle to avoid layout-position writes, before=${beforePositions} after=${afterPositions}`)
    }
    if (afterGraphData !== beforeGraphData) {
      throw new Error('expected Storyboard Widget drag/zoom/workspace toggle to avoid mutating graph data for collective elements')
    }
    if (afterFlowWidgetGeometry !== beforeFlowWidgetGeometry) throw new Error(`expected Storyboard Widget drag/zoom/workspace toggle to avoid mutating widget geometry state, before=${beforeFlowWidgetGeometry} after=${afterFlowWidgetGeometry}`)
    if (afterSceneSignature !== beforeSceneSignature) {
      throw new Error(`expected Storyboard Widget drag/zoom/workspace toggle to preserve collective scene layout, before=${beforeSceneSignature} after=${afterSceneSignature}`)
    }
    if (afterSceneKey !== beforeSceneKey) {
      throw new Error('expected Storyboard Widget drag/zoom/workspace toggle not to rebuild collective native scene')
    }
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
      documentStructureBaselineLock: priorState.documentStructureBaselineLock,
      documentStructureBaselineSnapshot: priorState.documentStructureBaselineSnapshot,
      zoomRequest: priorState.zoomRequest,
      zoomStateByKey: priorState.zoomStateByKey,
      zoomState: priorState.zoomState,
      layoutPositionCacheByMode: priorState.layoutPositionCacheByMode,
      canvasRenderMode: priorState.canvasRenderMode,
      canvas2dRenderer: priorState.canvas2dRenderer,
      viewportControlsPreset: priorState.viewportControlsPreset,
      canvasPointerMode2d: priorState.canvasPointerMode2d,
      fitToScreenMode: priorState.fitToScreenMode,
      zoomToSelectionMode: priorState.zoomToSelectionMode,
      viewPinned: priorState.viewPinned,
      workspaceViewMode: priorState.workspaceViewMode,
      workspaceCanvasPaneOpen: priorState.workspaceCanvasPaneOpen,
    } as never)
  }
}

