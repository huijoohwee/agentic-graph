import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PerspectiveCamera, Vector3, type WebGLRenderer } from 'three'
import { computeThreeCameraPoseAfterOverlayPan } from '@/lib/canvas/overlayInteractions3d'

import { ensureDefaultWidgetRegistryEntries } from '@/hooks/store/storyboardWidgetManagerSlice'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { defaultSchema } from '@/lib/graph/schema'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  computeRichMediaOverlayConnectedValuesByNodeId,
  listDisplayRichMediaOverlayNodes,
} from '@/lib/render/richMediaSsot'
import {
  createThreeMediaOverlayLayoutScratch,
  updateThreeMediaOverlayLayout,
} from '@/lib/three/threeRichMediaOverlayLayout'

function buildConnectedMarkdownRichMediaGraph(): {
  graphData: GraphData
  registry: ReturnType<typeof ensureDefaultWidgetRegistryEntries>['entries']
} {
  const registry = ensureDefaultWidgetRegistryEntries([], '2026-05-18T00:00:00.000Z').entries
  const markdown = [
    '| Kind | Value |',
    '| --- | --- |',
    '| Table | Multi-dimensional |',
    '',
    '![Image](https://example.com/generated.png)',
    '',
    '```ts',
    'const value = 42',
    '```',
    '',
    '> Quoted line',
  ].join('\n')
  return {
    registry,
    graphData: {
      type: 'GraphData',
      context: 'frontmatter-flow',
      nodes: [
        {
          id: 'source-text-widget',
          type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
          label: 'Text Widget',
          properties: {
            [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
            [FLOW_WIDGET_FORM_ID_KEY]: 'textGeneration.openai',
            output: markdown,
            'flow:portTypes': {
              in: {},
              out: { text_out: 'TEXT' },
            },
          },
        },
        {
          id: 'rich-media-panel',
          type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
          label: 'Rich Media Panel',
          properties: {
            [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
            [FLOW_WIDGET_FORM_ID_KEY]: 'richMediaPanel',
            richMediaActiveTab: 'text',
            'flow:portTypes': {
              in: {
                output: 'TEXT',
                imageUrl: 'IMAGE_URL',
                videoUrl: 'VIDEO_URL',
                outputSrcDoc: 'HTML',
              },
              out: {
                output: 'TEXT',
                imageUrl: 'IMAGE_URL',
                videoUrl: 'VIDEO_URL',
                outputSrcDoc: 'HTML',
              },
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge-text-to-panel',
          source: 'source-text-widget',
          target: 'rich-media-panel',
          label: 'linksTo',
          properties: {
            'flow:sourcePortKey': 'text_out',
            'flow:targetPortKey': 'output',
          },
        },
      ],
      metadata: {},
    } as GraphData,
  }
}

export function testRichMediaPanelMarkdownPayloadCoversRendererModeMatrix() {
  const { graphData, registry } = buildConnectedMarkdownRichMediaGraph()
  const nativeTextSurface = readFileSync(resolve(process.cwd(), 'src', 'components', 'RichMediaPanelTextSurface.tsx'), 'utf8')
  for (const snippet of ['<CardInlineTextEditor', 'data-kg-rich-media-markdown-preview="1"', "markdownPreview={props.panel?.markdownPresentationMode === true ? true : 'auto'}"]) {
    if (!nativeTextSurface.includes(snippet)) throw new Error(`expected native Rich Media markdown surface contract: ${snippet}`)
  }
  const graphSemanticKey = buildScopedGraphSemanticKey('rich-media-surface-coverage', {
    graphData,
    graphRevision: 1,
  })
  const connectedValuesByNodeId = computeRichMediaOverlayConnectedValuesByNodeId({
    graphData,
    registry,
    graphRevision: 1,
    graphSemanticKey,
    includeMediaSpecNodes: true,
  })
  const nodes = graphData.nodes as GraphNode[]
  const nodeById = new Map(nodes.map(node => [String(node.id || '').trim(), node] as const))
  const cases = [
    ['2D:D3:block:document', { renderMediaAsNodes: true, canvasRenderMode: '2d', canvas2dRenderer: 'd3', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['2D:Flowchart:radial:keyword', { renderMediaAsNodes: true, canvasRenderMode: '2d', canvas2dRenderer: 'flowchart', frontmatterModeEnabled: false, documentSemanticMode: 'keyword' }],
    ['2D:FlowCanvas:block:document-structure', { renderMediaAsNodes: true, canvasRenderMode: '2d', canvas2dRenderer: 'flow', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['2D:Design:block:multi-dimensional-table', { renderMediaAsNodes: true, canvasRenderMode: '2d', canvas2dRenderer: 'design', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['2D:StoryboardWidget:frontmatter-forced-display', { renderMediaAsNodes: false, canvasRenderMode: '2d', canvas2dRenderer: 'storyboard', frontmatterModeEnabled: true, documentSemanticMode: 'document' }],
    ['Surface:3D:display-control', { renderMediaAsNodes: true, canvasRenderMode: '3d', canvas3dMode: '3d', canvas2dRenderer: 'd3', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['Surface:XR:display-control', { renderMediaAsNodes: true, canvasRenderMode: '3d', canvas3dMode: 'xr', canvas2dRenderer: 'd3', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['Surface:Voxel:display-control', { renderMediaAsNodes: true, canvasRenderMode: '3d', canvas3dMode: 'voxel', canvas2dRenderer: 'd3', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
    ['Surface:Geospatial:display-control', { renderMediaAsNodes: true, canvasSurfaceMode: 'geospatial', canvas2dRenderer: 'd3', frontmatterModeEnabled: false, documentSemanticMode: 'document' }],
  ] as const

  for (const [label, args] of cases) {
    const overlays = listDisplayRichMediaOverlayNodes({
      ...args,
      nodes,
      poolMax: 24,
      connectedValuesByNodeId,
      nodeById,
    })
    const panel = overlays.find(node => node.id === 'rich-media-panel')
    if (!panel) throw new Error(`expected ${label} to include the connected Rich Media Panel overlay`)
    if (panel.kind !== 'iframe') throw new Error(`expected ${label} text payload to retain the Rich Media text routing kind, got ${panel.kind}`)
    if (panel.srcDoc) throw new Error(`expected ${label} connected markdown to avoid the legacy srcDoc iframe path`)
    if (panel.panel?.activeTab !== 'text') throw new Error(`expected ${label} connected markdown to select the native text tab`)
    const nativeMarkdown = String(panel.panel?.text || '')
    for (const snippet of ['| Kind | Value |', '![Image](https://example.com/generated.png)', '```ts', 'const value = 42', '> Quoted line']) {
      if (!nativeMarkdown.includes(snippet)) throw new Error(`expected ${label} native markdown payload snippet: ${snippet}`)
    }
  }
}

export function testRichMediaSurfaceRuntimePathsReuseSharedOverlayOwners() {
  const root = process.cwd()
  const ssot = readFileSync(resolve(root, 'src', 'lib', 'render', 'richMediaSsot.ts'), 'utf8')
  const d3Hook = readFileSync(resolve(root, 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useRichMediaOverlays2d.ts'), 'utf8')
  const flowCanvas = readFileSync(resolve(root, 'src', 'components', 'FlowCanvas', 'useFlowCanvasGraphState.ts'), 'utf8')
  const three = readFileSync(resolve(root, 'src', 'lib', 'three', 'useThreeRichMediaOverlayController.tsx'), 'utf8')
  const threeGraph = readFileSync(resolve(root, 'src', 'lib', 'three', 'ThreeGraph.impl.tsx'), 'utf8')
  const design = readFileSync(resolve(root, 'src', 'components', 'DesignCanvas', 'MediaOverlay.tsx'), 'utf8')
  const sharedPanelSurface = readFileSync(resolve(root, 'src', 'components', 'useRichMediaPanelSurfaceState.ts'), 'utf8')
  const sharedLayoutLoop = readFileSync(resolve(root, 'src', 'lib', 'render', 'mediaOverlayLayoutLoop2d.ts'), 'utf8')

  if (!ssot.includes('export function computeRichMediaOverlayConnectedValuesByNodeId')) {
    throw new Error('expected connected Rich Media overlay value derivation to live in the Rich Media SSOT')
  }
  if (!ssot.includes('export function resolveRichMediaSurfaceMode') || !ssot.includes("return 'geospatial'")) {
    throw new Error('expected Rich Media SSOT to own surface-mode resolution for 2D, 3D, XR, Voxel, and Geospatial')
  }
  for (const [label, text] of [['D3', d3Hook], ['FlowCanvas', flowCanvas], ['3D', three]] as const) {
    if (!text.includes('computeRichMediaOverlayConnectedValuesByNodeId({')) {
      throw new Error(`expected ${label} runtime to reuse the shared connected Rich Media overlay helper`)
    }
    if (text.includes('computeFlowConnectedValuesBySchemaPath({')) {
      throw new Error(`expected ${label} runtime to avoid local connected-value recomputation`)
    }
  }
  if (!three.includes('connectedValuesByNodeId: richMediaConnectedValuesByNodeId')) {
    throw new Error('expected 3D/XR/Voxel overlays to pass connected Rich Media values into the shared overlay pool')
  }
  if (!three.includes('panelChrome="storyboardWidget"') || !three.includes('overlayId={n.id}')) {
    throw new Error('expected 3D/XR/Voxel Rich Media overlays to reuse the shared 2D panel chrome and overlay identity')
  }
  for (const snippet of ['readCanvasAspectRatioWidthToHeight', 'strybldrStoryboardCardAspectMode', 'directMediaZoomContentSize']) {
    if (!sharedPanelSurface.includes(snippet)) throw new Error(`expected shared Rich Media panel surface to reuse Canvas Aspect display control: ${snippet}`)
  }
  if (sharedPanelSurface.includes('{ h: 9, w: 16 }')) throw new Error('expected shared Rich Media panel surface to avoid hardcoded 16:9 direct media viewport size')
  for (const snippet of ['aspectRatioMode?: unknown', 'resolveCanvasAspectRatioSize({ defaultWidth: useSizing.panelW', 'aspectRatioMode: strybldrStoryboardCardAspectMode']) {
    if (!(sharedLayoutLoop.includes(snippet) || d3Hook.includes(snippet))) throw new Error(`expected shared Rich Media layout fallback to reuse Canvas Aspect display control: ${snippet}`)
  }
  for (const snippet of [
    'computePanelFrameResizeFromDrag16x9({',
    'readRichMediaPanelFrameMetrics(el)',
    'readStableRichMediaPanelSize(readNodeProperties(id))',
    "'visual:width': drag.lastW",
    "'visual:height': drag.lastH",
    'localPinnedRef.current[id]',
    'localScreenAnchorsRef.current[id]',
    'localPanelSizesRef.current[id]',
    'localPositionsRef.current[n.id]',
    'const getPanelZIndexForId = React.useCallback',
    "const z = Number(readNodeProperties(id)['visual:zIndex'])",
    "style={{ position: 'absolute' }}",
    'resizable={true}',
    'widgetToolbarActive={true}',
    'headerPinned={readPanelPinned(n.id)}',
    'onHeaderTogglePinned={event =>',
    'onHeaderToggleMinimized={() => togglePanelSize(n.id)}',
    'const stopPanelChromeSafeEvent = React.useCallback',
    "target?.closest('button,a,input,textarea,select,[role=\"button\"],[data-kg-rich-media-resize-handle=\"1\"],[data-kg-rich-media-interaction-owner=\"1\"]')",
    'onClickCapture={stopPanelChromeSafeEvent}',
    'forwardWheelBeforeScrollableTarget={store.infiniteCanvasInteractionMode !==',
  ]) {
    if (!three.includes(snippet)) {
      throw new Error(`expected 3D/XR/Voxel Rich Media overlays to reuse shared pan/drag/zoom/resize utility: ${snippet}`)
    }
  }
  const threeLayout = readFileSync(resolve(root, 'src', 'lib', 'three', 'threeRichMediaOverlayLayout.ts'), 'utf8')
  if (!threeLayout.includes('getPanelSizeForId?:') || !threeLayout.includes('const overrideSize = typeof args.getPanelSizeForId')) {
    throw new Error('expected 3D Rich Media layout to reuse persisted visual panel sizing like 2D overlays')
  }
  if (!threeLayout.includes('getPanelPinnedForId?:') || !threeLayout.includes('getPanelScreenAnchorForId?:') || !threeLayout.includes('getPanelZIndexForId?:')) {
    throw new Error('expected 3D Rich Media layout to reuse shared pin, screen-position, and z-index state')
  }
  if (!threeGraph.includes('sceneGraphForRender') || !threeGraph.includes('edges: []')) {
    throw new Error('expected ThreeGraph to keep node-only media graphs renderable for 3D Rich Media overlays')
  }
  if (!three.includes('renderMediaAsNodes: store.renderMediaAsNodes') || !three.includes('canvas3dMode: store.canvas3dMode') || !three.includes('selectedNodeId: s.selectedNodeId') || !three.includes('selectedNodeIds: s.selectedNodeIds')) {
    throw new Error('expected 3D/XR/Voxel overlay memoization to include display-control and selection dependencies')
  }
  if (!design.includes('resolveRichMediaPanelInteractive({')) {
    throw new Error('expected Design Rich Media overlays to reuse shared interactivity policy')
  }
}

function makeRichMediaPanelElement(): HTMLElement {
  const style: Record<string, string | ((key: string, value: string) => void)> = {
    left: '-99999px',
    top: '-99999px',
    setProperty(key: string, value: string) {
      style[key] = value
    },
  }
  return {
    dataset: {},
    style,
    getAttribute: () => null,
    querySelector: () => null,
  } as unknown as HTMLElement
}

export function testThreeRichMediaLayoutStacksLargerPeersUnderneath() {
  const camera = new PerspectiveCamera(50, 960 / 640, 0.1, 1000)
  camera.position.set(0, 0, 220)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  const dom = new JSDOM('<main><section id="large"><img alt="Large media"></section><section id="small"><img alt="Small media"></section></main>')
  const large = dom.window.document.getElementById('large')!
  const small = dom.window.document.getElementById('small')!
  let largeSize = { w: 400, h: 240 }
  const args: Parameters<typeof updateThreeMediaOverlayLayout>[0] = {
    camera,
    gl: { domElement: { clientWidth: 960, clientHeight: 640 } } as unknown as WebGLRenderer,
    overlayNodesPool: [{ id: 'large' }, { id: 'small' }],
    positions: { large: [0, 0, 0], small: [0, 0, 0] },
    dragOverrides: { large: [0, -12, 0] },
    overlayEls: new Map([['large', large], ['small', small]]),
    prevVisibleIds: new Set(),
    effectiveSchema: defaultSchema,
    scratch: createThreeMediaOverlayLayoutScratch(),
    getPanelSizeForId: id => id === 'large' ? largeSize : { w: 180, h: 110 },
    selectedNodeId: 'large',
    mediaPanelDensity: 'default',
    threeIframeOverlayMaxVisibleDefault: 8,
    threeIframeOverlayMaxDistanceDefault: 620,
  }
  const update = () => { args.prevVisibleIds = updateThreeMediaOverlayLayout(args) }
  update()
  assert.ok(Number(large.style.zIndex) < Number(small.style.zIndex), 'selection and drag must not cover smaller peers')
  assert.equal(large.style.display, 'flex', 'shared frame content must retain available height')
  assert.equal(large.style.opacity, '1', 'shared media remains opaque')
  assert.equal(large.style.width, '400px')
  assert.equal(large.querySelector('img')?.getAttribute('loading'), 'eager')
  const observer = new dom.window.MutationObserver(() => {})
  observer.observe(dom.window.document.querySelector('main')!, { subtree: true, attributes: true })
  update()
  assert.equal(observer.takeRecords().length, 0, 'settled layout must not rewrite DOM styles')
  largeSize = { w: 120, h: 80 }
  update()
  assert.ok(Number(large.style.zIndex) > Number(small.style.zIndex), 'resize must rerank peers')
  largeSize = { w: 180, h: 110 }
  update()
  const equalSizeOrder = [large.style.zIndex, small.style.zIndex]
  args.overlayNodesPool = [...args.overlayNodesPool].reverse()
  update()
  assert.deepEqual([large.style.zIndex, small.style.zIndex], equalSizeOrder, 'equal areas use stable identities')
  args.getPanelZIndexForId = id => id === 'large' ? 1 : 0
  largeSize = { w: 400, h: 240 }
  update()
  assert.ok(Number(large.style.zIndex) > Number(small.style.zIndex), 'explicit authored layers remain authoritative')
  args.dragOverrides = {}
  args.positions.large = [0, 0, 500]
  args.selectedNodeId = null
  update()
  assert.equal(large.style.display, 'none', 'culled panels must not leave stale visible hit targets')
  args.threeIframeOverlayMaxVisibleDefault = 0
  update()
  assert.equal(small.style.display, 'none')
  observer.disconnect()
  dom.window.close()
}

export function testThreeRichMediaLayoutKeepsUnanchoredPanelsVisible() {
  const camera = new PerspectiveCamera(50, 960 / 640, 0.1, 1000)
  camera.position.set(0, 0, 220)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  const el = makeRichMediaPanelElement()
  const visible = updateThreeMediaOverlayLayout({
    camera,
    gl: { domElement: { clientWidth: 960, clientHeight: 640 } } as unknown as WebGLRenderer,
    overlayNodesPool: [{ id: 'rich-media-panel' }],
    positions: {},
    dragOverrides: {},
    overlayEls: new Map([['rich-media-panel', el]]),
    prevVisibleIds: new Set(),
    effectiveSchema: defaultSchema,
    scratch: createThreeMediaOverlayLayoutScratch(),
    getPanelSizeForId: id => id === 'rich-media-panel' ? { w: 320, h: 220 } : null,
    mediaPanelDensity: 'default',
    threeIframeOverlayMaxVisibleDefault: 8,
    threeIframeOverlayMaxDistanceDefault: 620,
    threeIframeOverlayBaseWidthRatioDefault: 0.2,
    threeIframeOverlayBaseWidthMinPxDefault: 210,
    threeIframeOverlayBaseWidthMaxPxDefault: 360,
    threeIframeOverlaySizeScaleFactor: 260,
  })
  if (!visible.has('rich-media-panel')) {
    throw new Error('expected 3D Rich Media layout to keep enabled unanchored panels visible')
  }
  const style = el.style as unknown as Record<string, string>
  if (style.display !== 'flex') throw new Error(`expected visible shared panel display flex, got ${String(style.display)}`)
  const hasViewportAnchorTransform =
    String(style.transform || '').includes('translate3d(')
    || String(style.transform || '').includes('matrix(')
    || (
      style.transform === 'none'
      && style.left === '0px'
      && style.top === '0px'
      && Number.isFinite(Number.parseFloat(String((style as Record<string, string>).width || '')))
      && Number.isFinite(Number.parseFloat(String((style as Record<string, string>).height || '')))
    )
  if (!hasViewportAnchorTransform || String(style.transform || '').includes('-99999')) {
    throw new Error(`expected viewport-anchored panel transform, got ${String(style.transform || '')}`)
  }
  if (style.left !== '0px' || style.top !== '0px') {
    throw new Error(`expected visible panel to reset stale offscreen origin, got ${String(style.left)} ${String(style.top)}`)
  }
  if (Number.parseFloat(String(style.width || '0')) !== 320 || Number.parseFloat(String(style.height || '0')) !== 220) {
    throw new Error(`expected 3D Rich Media panel to receive viewport size, got ${String(style.width)} x ${String(style.height)}`)
  }
}

export function testThreeRichMediaFollowsCanvasWithoutViewportSnap() {
  const camera = new PerspectiveCamera(90, 800 / 600, 0.1, 2000)
  camera.position.set(0, 0, 260)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  const el = makeRichMediaPanelElement()
  let size = { w: 200, h: 120 }
  let pinned = true
  const args: Parameters<typeof updateThreeMediaOverlayLayout>[0] = {
    camera, gl: { domElement: { clientWidth: 800, clientHeight: 600 } } as unknown as WebGLRenderer,
    overlayNodesPool: [{ id: 'figure' }], positions: { figure: [500, 0, 0] }, dragOverrides: {},
    overlayEls: new Map([['figure', el]]), prevVisibleIds: new Set(), effectiveSchema: defaultSchema,
    scratch: createThreeMediaOverlayLayoutScratch(), getPanelSizeForId: () => size,
    getPanelPinnedForId: () => pinned, getPanelScreenAnchorForId: () => ({ sx: -20, sy: 300 }),
    threeIframeOverlayMaxVisibleDefault: 8, threeIframeOverlayMaxDistanceDefault: 2000,
  }
  const update = () => {
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    args.prevVisibleIds = updateThreeMediaOverlayLayout(args)
    const matrix = String(el.style.transform).slice(7, -1).split(',').map(Number)
    const scale = matrix[0]!
    const w = Number.parseFloat(el.style.width) * scale
    const h = Number.parseFloat(el.style.height) * scale
    return { scale, w, h, x: matrix[4]! + w / 2, y: matrix[5]! + h / 2, left: matrix[4]! }
  }
  const close = (a: number, b: number, message: string) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} versus ${b}`)
  const first = update()
  const projected = new Vector3(...args.positions.figure!).project(camera)
  close(first.x, (projected.x + 1) * 400, 'offscreen panel retains graph anchor')
  assert.ok(first.left > 800, 'offscreen panel must not stick to the right border')
  camera.position.x += 0.1
  const pan = update()
  assert.ok(Math.abs(pan.x - first.x) > 0 && Math.abs(pan.x - first.x) < 1, 'subpixel pan must remain continuous')
  close(pan.w, first.w, 'lateral pan must not resize media')
  camera.zoom = 1.001
  const zoom = update()
  close(zoom.w / pan.w, 1.001, 'zoom scales the complete logical frame without steps')
  size = { w: 1200, h: 720 }
  const resized = update()
  assert.ok(resized.w > 800 && resized.h > 600, 'authored panel must not be shrunk to viewport')
  camera.position.z = 130
  close(update().w / resized.w, 2, 'resized panels still follow camera dolly')
  args.positions.figure = [500, 0, 500]
  args.selectedNodeId = 'figure'
  update()
  assert.equal(args.prevVisibleIds.size, 0, 'selected world panel behind camera must not become a viewport fallback')
  assert.equal(el.style.display, 'none')
  pinned = false
  const free = update()
  close(free.x, -20, 'free panel retains an explicit offscreen screen anchor')
  close(free.scale, 1, 'free panel keeps screen-space scale')
  camera.zoom = 3
  close(update().w, free.w, 'free panel must not inherit camera zoom')

  camera.position.set(0, 0, 260)
  camera.zoom = 1
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  const pose = computeThreeCameraPoseAfterOverlayPan({
    pose: { position: { x: 0, y: 0, z: 260 }, target: { x: 0, y: 0, z: 0 },
      quaternion: { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w } },
    dxClientPx: 80, dyClientPx: 35, shiftKey: true,
    verticalProjectionScale: camera.projectionMatrix.elements[5]!, viewportH: 600,
  })
  camera.position.set(pose.position.x, pose.position.y, pose.position.z)
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
  camera.updateMatrixWorld(true)
  const moved = new Vector3(0, 0, 0).project(camera)
  close((moved.x + 1) * 400, 480, 'panel pan moves the graph by the requested horizontal pixels')
  close((1 - moved.y) * 300, 335, 'panel pan moves the graph by the requested vertical pixels')
}
