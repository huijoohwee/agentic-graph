import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'

import FlowCanvas from '@/components/FlowCanvas'
import { __flowCanvasDebug } from '@/components/FlowCanvas/flowCanvasDebug'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultSchema } from '@/lib/graph/schema'
import { AG_SUBGRAPHS_KEY } from '@/lib/graph/subgraphs'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { readStoryboardWidgetGeometryStateSignature } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeWidgetState'

type Ctx2d = Partial<CanvasRenderingContext2D>

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const waitFor = async (args: { ms: number; pollMs: number; ok: () => boolean }) => {
  const deadline = Date.now() + Math.max(1, args.ms)
  while (Date.now() < deadline) {
    if (args.ok()) return
    await sleep(Math.max(1, args.pollMs))
  }
  throw new Error('timed out waiting for condition')
}

const createFlowCanvasTestDom = (): JSDOM => {
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof window.HTMLCanvasElement === 'function'
  ) {
    document.body.innerHTML = ''
    return { window } as unknown as JSDOM
  }
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
}

const installDomStubs = (dom: JSDOM) => {
  __flowCanvasDebug.lastBuiltSceneNodeCount = 0
  __flowCanvasDebug.lastBuiltSceneKey = ''
  __flowCanvasDebug.lastZoomViewKey = ''
  const g = globalThis as unknown as {
    window?: unknown
    document?: unknown
    navigator?: unknown
    ResizeObserver?: unknown
    requestAnimationFrame?: unknown
    cancelAnimationFrame?: unknown
  }
  g.window = dom.window
  g.document = dom.window.document
  Object.assign(g, { Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement })
  try {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  } catch {
    void 0
  }
  const anyWindow = dom.window as unknown as {
    ResizeObserver?: unknown
    requestAnimationFrame?: unknown
    cancelAnimationFrame?: unknown
  }

  class ResizeObserverStub {
    callback: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  g.ResizeObserver = ResizeObserverStub
  anyWindow.ResizeObserver = ResizeObserverStub

  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  g.cancelAnimationFrame = (id: number) => {
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
  }
  anyWindow.requestAnimationFrame = g.requestAnimationFrame
  anyWindow.cancelAnimationFrame = g.cancelAnimationFrame

  const ctx: Ctx2d = {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    rect: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fillText: () => {},
  }

  dom.window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') return ctx as CanvasRenderingContext2D
    return null
  }
}

const installFlowCanvasViewportRect = (dom: JSDOM, width = 960, height = 540) => {
  const rect = {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height })
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rect
  }
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return rect
  }
  dom.window.HTMLCanvasElement.prototype.setPointerCapture = function () {}
  dom.window.HTMLCanvasElement.prototype.releasePointerCapture = function () {}
  dom.window.HTMLCanvasElement.prototype.hasPointerCapture = function () {
    return true
  }
}

const dispatchFlowCanvasPointerEvent = (
  target: EventTarget,
  win: Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  args: { pointerId?: number; clientX?: number; clientY?: number; button?: number; buttons?: number } = {},
) => {
  type MouseEventConstructorLike = new (eventType: string, eventInitDict?: Record<string, unknown>) => Event
  const MouseEventCtor = (win as unknown as { MouseEvent: MouseEventConstructorLike }).MouseEvent
  const event = new MouseEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: args.button ?? 0,
    buttons: args.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: args.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: 'mouse' })
  const eventTargetCtor = (win as unknown as { EventTarget?: { prototype?: { dispatchEvent?: (event: Event) => boolean } } }).EventTarget
  const dispatch = typeof target.dispatchEvent === 'function'
    ? target.dispatchEvent.bind(target)
    : (eventTargetCtor?.prototype?.dispatchEvent?.bind(target) as ((event: Event) => boolean) | undefined)
  if (typeof dispatch !== 'function') {
    throw new Error(`expected pointer target to expose dispatchEvent for ${type}`)
  }
  dispatch(event)
}

const readFlowSceneSignature = (runtime: import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime) => {
  const scene = runtime.scene
  return JSON.stringify({
    nodes: scene.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, w: node.width, h: node.height, shape: node.shape })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: scene.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target })).sort((a, b) => a.id.localeCompare(b.id)),
    groups: (scene.groups || []).map(group => ({
      id: group.id,
      label: group.label,
      source: group.source,
      members: Array.isArray(group.memberNodeIds) ? group.memberNodeIds.slice().sort() : [],
    })).sort((a, b) => a.id.localeCompare(b.id)),
  })
}

const buildCollectiveStoryboardWidgetGraphFixture = () => ({
  type: 'Graph',
  context: 'flow',
  nodes: [
    { id: 'left', label: 'Left', type: 'Note', properties: { 'visual:layer': 'Subgraph A' }, x: -360, y: -180 },
    { id: 'right', label: 'Right', type: 'Note', properties: { 'visual:community': 'Cluster B' }, x: 420, y: 240 },
    {
      id: 'widget-text',
      label: 'Widget Text',
      type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'textGeneration',
        'flow:portTypes': { in: { prompt: 'text' }, out: { result: 'text' } },
        'visual:layer': 'Subgraph A',
      },
      x: -80,
      y: 80,
    },
    {
      id: 'widget-image',
      label: 'Widget Image',
      type: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'imageGeneration',
        'flow:portTypes': { in: { prompt: 'text' }, out: { image: 'image' } },
        'visual:layer': 'Subgraph A',
      },
      x: 180,
      y: 40,
    },
    {
      id: 'widget-video',
      label: 'Widget Video',
      type: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'videoGeneration',
        'flow:portTypes': { in: { prompt: 'text', image: 'image' }, out: { video: 'video' } },
        'visual:community': 'Cluster B',
      },
      x: 470,
      y: -80,
    },
    {
      id: 'rich-panel',
      label: 'Rich Media Panel',
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'richMediaPanel',
        'flow:portTypes': { in: { image: 'image', video: 'video' }, out: { selected: 'media' } },
        media_interactive: true,
        richMediaActiveTab: 'image',
        imageUrl: 'https://example.test/demo.png',
        videoUrl: 'https://example.test/demo.mp4',
        'visual:community': 'Cluster B',
      },
      x: 780,
      y: -80,
    },
  ],
  edges: [
    { id: 'edge-left-widget', source: 'left', target: 'widget-text', label: 'feeds', properties: { 'flow:sourcePort': 'result', 'flow:targetPort': 'prompt' } },
    { id: 'edge-text-image', source: 'widget-text', target: 'widget-image', label: 'image prompt', properties: { 'flow:sourcePort': 'result', 'flow:targetPort': 'prompt' } },
    { id: 'edge-image-video', source: 'widget-image', target: 'widget-video', label: 'image input', properties: { 'flow:sourcePort': 'image', 'flow:targetPort': 'image' } },
    { id: 'edge-video-rich', source: 'widget-video', target: 'rich-panel', label: 'renders video', properties: { 'flow:sourcePort': 'video', 'flow:targetPort': 'video' } },
    { id: 'edge-right-rich', source: 'right', target: 'rich-panel', label: 'context', properties: {} },
  ],
  metadata: {
    kind: 'test',
    source: 'storyboardWidgetCollectiveInteractions',
    [AG_SUBGRAPHS_KEY]: [
      { id: 'sg-a', label: 'Subgraph A', kind: 'subgraph', memberNodeIds: ['left', 'widget-text', 'widget-image'] },
      { id: 'cluster-b', label: 'Cluster B', kind: 'cluster', memberNodeIds: ['right', 'widget-video', 'rich-panel'] },
      { id: 'group-all', label: 'Workflow Group', kind: 'group', memberNodeIds: ['left', 'right', 'widget-text', 'widget-image', 'widget-video', 'rich-panel'] },
    ],
  },
})

export const testFlowCanvasUsesActiveGraphRenderDataAndZoomState = async () => {
  const dom = createFlowCanvasTestDom()
  installDomStubs(dom)

  const priorState = useGraphStore.getState()

  const baseGraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Alpha Beta Gamma', type: 'Note', properties: {} }],
    edges: [],
    metadata: { kind: 'test', source: 'flowCanvasIntegration' },
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
  root.render(React.createElement(FlowCanvas, { active: true }))

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0 && __flowCanvasDebug.lastBuiltSceneNodeCount === 1,
  }).catch(e => {
    throw new Error(`stage=initialSceneBuild ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  useGraphStore.setState({ documentSemanticMode: 'keyword' })
  await waitFor({
    ms: 10_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneNodeCount > 1,
  }).catch(e => {
    throw new Error(`stage=semanticModeSwitch ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  if (!key) throw new Error('expected FlowCanvas to publish a zoom view key')

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const s = useGraphStore.getState()
      const byKey = s.zoomStateByKey?.[key]
      return !!byKey && typeof byKey.k === 'number' && Number.isFinite(byKey.k)
    },
  }).catch(e => {
    throw new Error(`stage=zoomStateInit ${String((e as { message?: unknown })?.message ?? e)}`)
  })

  const beforeZoomK = (() => {
    const s = useGraphStore.getState()
    const byKey = s.zoomStateByKey?.[key]
    const k = byKey?.k
    return typeof k === 'number' && Number.isFinite(k) ? k : 1
  })()

  useGraphStore.getState().requestZoom('in')
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const s = useGraphStore.getState()
      const byKey = s.zoomStateByKey?.[key]
      return !!byKey && typeof byKey.k === 'number' && Number.isFinite(byKey.k) && byKey.k > beforeZoomK + 1e-6
    },
  }).catch(e => {
    const s = useGraphStore.getState()
    const byKey = s.zoomStateByKey?.[key]
    throw new Error(`stage=zoomInRequest ${String((e as { message?: unknown })?.message ?? e)} zoomState=${JSON.stringify(s.zoomState)} byKey=${JSON.stringify(byKey)} zoomRequest=${JSON.stringify(s.zoomRequest)}`)
  })

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
        (scene.nodes.length || 0) === 6 &&
        (scene.edges.length || 0) === 5 &&
        (scene.groups?.length || 0) >= 5
      )
    },
  }).catch(e => {
    throw new Error(`stage=storyboardWidgetSceneBuild ${String((e as { message?: unknown })?.message ?? e)}`)
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
    if (!runtime.scene.nodeById.has(expectedNodeIds[i]!)) {
      throw new Error(`expected collective Storyboard Widget scene to include ${expectedNodeIds[i]}`)
    }
  }
  const beforeSceneKey = String(__flowCanvasDebug.lastBuiltSceneKey || '')
  const beforeSceneSignature = readFlowSceneSignature(runtime)

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

  const afterTransform = runtime.transform
  const key = String(__flowCanvasDebug.lastZoomViewKey || '')
  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => {
      const st = useGraphStore.getState()
      const committed = (key ? st.zoomStateByKey?.[key] : null) || st.zoomState || null
      return !!(
        committed &&
        Math.abs(committed.x - afterTransform.x) <= 1e-6 &&
        Math.abs(committed.y - afterTransform.y) <= 1e-6
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
          (scene.nodes.length || 0) === 6 &&
          (scene.edges.length || 0) === 5 &&
          (scene.groups?.length || 0) >= 5
        )
      },
    }).catch(e => {
      throw new Error(`stage=collectiveSceneBuild ${String((e as { message?: unknown })?.message ?? e)}`)
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
  installDomStubs(dom)

  const priorState = useGraphStore.getState()

  const baseGraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Alpha', type: 'Note', properties: {} }],
    edges: [],
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
  root.render(React.createElement(FlowCanvas, { active: true }))

  await waitFor({
    ms: 5_000,
    pollMs: 25,
    ok: () => __flowCanvasDebug.lastBuiltSceneKey.length > 0 && __flowCanvasDebug.lastBuiltSceneNodeCount === 1,
  })

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
    ok: () => String(__flowCanvasDebug.lastBuiltSceneKey || '') !== before,
  })

  root.unmount()
  useGraphStore.setState({
    graphData: priorState.graphData,
    graphDataRevision: priorState.graphDataRevision,
    schema: priorState.schema,
    frontmatterModeEnabled: priorState.frontmatterModeEnabled,
    documentSemanticMode: priorState.documentSemanticMode,
    zoomRequest: priorState.zoomRequest,
    zoomStateByKey: priorState.zoomStateByKey,
    zoomState: priorState.zoomState,
  })
}
