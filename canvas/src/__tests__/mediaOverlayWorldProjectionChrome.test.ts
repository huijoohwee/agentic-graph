import { zoomIdentity } from 'd3'
import { defaultSchema } from '@/lib/graph/schema'
import { startMediaOverlayLayoutLoop2d } from '@/lib/render/mediaOverlayLayoutLoop2d'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testMediaOverlayWorldProjectionScalesDefaultAndAuthoredFramesOnce() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    for (const anchorToNode of [true, false]) {
      const panels = ['default', 'authored'].map(() => dom.window.document.createElement('section'))
      panels.forEach(panel => dom.window.document.body.appendChild(panel))
      let transform = zoomIdentity.translate(-100, 30).scale(0.2)
      const loop = startMediaOverlayLayoutLoop2d({
        enabled: true, loop: 'onDemand', items: [{ id: 'default' }, { id: 'authored' }],
        density: 'default', viewportW: 900, viewportH: 700, anchorToNode,
        projectWithWorldTransformScale: true,
        readTransform: () => transform,
        getElementForId: id => panels[id === 'default' ? 0 : 1]!,
        getPanelSizeForId: id => id === 'authored' ? { w: 439, h: 247 } : null,
        getNodeWorldCenterForId: () => ({ x: 120, y: 180 }),
        sizingConfig: { widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360, quantizeStepPx: 1 },
        clampToViewport: null,
      })
      try {
        loop.flush()
        const initial = panels.map(panel => ({ w: panel.style.width, h: panel.style.height }))
        // Both sides of unit zoom catch inverse, double and screen-fixed scaling.
        for (const zoom of [0.4, 0.8, 1.6, 2, 1, 0.5, 0.2]) {
          transform = zoomIdentity.translate(-100, 30).scale(zoom)
          loop.flush()
          panels.forEach((panel, index) => {
            if (panel.style.width !== initial[index]!.w || panel.style.height !== initial[index]!.h) {
              throw new Error(`logical frame changed with zoom ${zoom}: ${panel.style.width} x ${panel.style.height}`)
            }
            const matrix = panel.style.transform.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(',').map(Number)
            const scale = anchorToNode ? matrix?.[0] : Number(panel.style.zoom)
            if (scale == null || Math.abs(scale - zoom) > 1e-6) throw new Error(`expected one camera scale ${zoom}, got ${scale}`)
            const left = anchorToNode ? matrix![4]! : Number.parseFloat(panel.style.left) * scale
            const center = left + Number.parseFloat(panel.style.width) * scale / 2
            if (Math.abs(center - transform.applyX(120)) > 0.51) throw new Error('zoom detached the graph anchor or clamped at the viewport')
            if (panel.style.getPropertyValue('--kg-media-panel-header-h') !== '28px') throw new Error('chrome scaled twice')
          })
        }
      } finally { loop.stop(); panels.forEach(panel => panel.remove()) }
    }
  } finally { restore() }
}

export async function testMediaOverlayWorldProjectionKeepsUnscaledCardChromeMetrics() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const root = dom.window.document.getElementById('root')
    if (!root) throw new Error('expected root container')
    const panel = dom.window.document.createElement('section')
    root.appendChild(panel)
    const zoom = 0.57
    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true,
      loop: 'onDemand',
      items: [{ id: 'media-panel' }],
      density: 'default',
      viewportW: 1175,
      viewportH: 962,
      readTransform: () => ({
        k: zoom,
        x: 0,
        y: 0,
        applyX: (value: number) => value * zoom,
        applyY: (value: number) => value * zoom,
      }) as any,
      computeSizingZoomK: () => zoom,
      panelDisplay: 'flex',
      projectWithWorldTransformScale: true,
      getPanelSizeForId: () => ({ w: 360, h: 203 }),
      getElementForId: id => id === 'media-panel' ? panel : null,
      getNodeWorldCenterForId: () => ({ x: 500, y: 400 }),
      sizingConfig: { widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360 },
      clampToViewport: null,
    })

    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const expectedVars = {
      '--kg-media-panel-header-h': '28px',
      '--kg-media-panel-padding': '8px',
      '--kg-media-panel-radius': '10px',
      '--kg-media-panel-title-size': '12px',
    }
    for (const [name, expected] of Object.entries(expectedVars)) {
      const actual = panel.style.getPropertyValue(name)
      if (actual !== expected) throw new Error(`expected world-projected Rich Media chrome ${name}=${expected}, got ${actual}`)
    }
    if (String((panel.style as CSSStyleDeclaration & { zoom?: string }).zoom || '') !== String(zoom)) {
      throw new Error(`expected world projection to own zoom exactly once, got ${String((panel.style as CSSStyleDeclaration & { zoom?: string }).zoom || '')}`)
    }
    if (panel.style.display !== 'flex') {
      throw new Error(`expected explicit panel display ownership to preserve the flex frame, got ${panel.style.display}`)
    }
    loop.stop()
  } finally {
    restore()
  }
}

export async function testD3MediaResizeUsesPaintedScale() {
  const { dom, restore } = initJsdomHarness()
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { RichMediaOverlayLayer2d } = await import('@/components/GraphCanvasRoot/components/RichMediaOverlayLayer2d')
  const { useGraphStore } = await import('@/hooks/useGraphStore')
  const previous = useGraphStore.getState()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const noop = () => {}
  try {
    for (const scale of [0.5, 2]) {
      let savedWidth = 0
      useGraphStore.setState({ updateNode: (_id, patch) => { savedWidth = Number(patch.properties?.['visual:width']) } })
      await React.act(async () => {
        root.render(React.createElement(RichMediaOverlayLayer2d, {
          key: String(scale), active: true,
          mediaOverlayNodes: [{ id: 'resize-scale', title: 'Resize scale', kind: 'image', url: '', openUrl: '', interactive: false }],
          getOverlayRefForId: () => el => {
            if (!el) return
            el.style.transform = `matrix(${scale}, 0, 0, ${scale}, 0, 0)`
            el.getBoundingClientRect = () => ({ width: 400 * scale, height: 225 * scale }) as DOMRect
          },
          svgRef: { current: null }, renderMediaAsNodes: false, stopEvent: noop,
          onOverlayPanStart: noop, onOverlayPan: noop, onOverlayPanEnd: noop,
          onHeaderDragStart: noop, onHeaderDrag: noop, onHeaderDragEnd: noop,
        }))
      })
      const handle = container.querySelector('[data-kg-rich-media-resize-handle="1"]')
      if (!handle) throw new Error('missing shared resize affordance')
      const dispatch = (target: EventTarget, type: string, x: number) => {
        const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: 0 })
        Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: 'mouse' } })
        target.dispatchEvent(event)
      }
      await React.act(async () => {
        dispatch(handle, 'pointerdown', 10)
        dispatch(dom.window, 'pointermove', 50)
        dispatch(dom.window, 'pointerup', 50)
      })
      if (savedWidth !== 400 + 40 / scale) throw new Error(`resize at ${scale} saved ${savedWidth}; expected world-space delta`)
    }
  } finally {
    await React.act(async () => root.unmount())
    useGraphStore.setState({ updateNode: previous.updateNode })
    restore()
  }
}

export async function testMediaOverlayWorldProjectionUsesSharedPaintScale() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const root = dom.window.document.getElementById('root')
    if (!root) throw new Error('expected root container')
    const panel = dom.window.document.createElement('section')
    root.appendChild(panel)
    const cameraScale = 0.334
    const sharedPaintScale = 0.58
    const tx = 10
    const ty = 20
    const worldCenter = { x: 500, y: 400 }
    const panelSize = { w: 360, h: 203 }
    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true,
      loop: 'onDemand',
      items: [{ id: 'media-panel' }],
      density: 'default',
      viewportW: 1175,
      viewportH: 962,
      readTransform: () => ({
        k: cameraScale,
        x: tx,
        y: ty,
        applyX: (value: number) => value * cameraScale + tx,
        applyY: (value: number) => value * cameraScale + ty,
      }) as any,
      computeSizingZoomK: () => sharedPaintScale,
      panelDisplay: 'flex',
      projectWithWorldTransformScale: true,
      getPanelSizeForId: () => panelSize,
      getElementForId: id => id === 'media-panel' ? panel : null,
      getNodeWorldCenterForId: () => worldCenter,
      sizingConfig: { widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360 },
      clampToViewport: null,
    })

    loop.schedule()
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const paintedScale = Number((panel.style as CSSStyleDeclaration & { zoom?: string }).zoom || 0)
    if (Math.abs(paintedScale - sharedPaintScale) > 1e-6) {
      throw new Error(`expected Rich Media to use the shared Card paint scale ${sharedPaintScale}, got ${paintedScale}`)
    }
    const paintedCenterX = Number.parseFloat(panel.style.left) * paintedScale + panelSize.w * paintedScale / 2
    const paintedCenterY = Number.parseFloat(panel.style.top) * paintedScale + panelSize.h * paintedScale / 2
    const expectedCenterX = worldCenter.x * cameraScale + tx
    const expectedCenterY = worldCenter.y * cameraScale + ty
    if (Math.abs(paintedCenterX - expectedCenterX) > 0.51 || Math.abs(paintedCenterY - expectedCenterY) > 0.51) {
      throw new Error(`expected shared paint scale to preserve the camera-projected center ${expectedCenterX},${expectedCenterY}, got ${paintedCenterX},${paintedCenterY}`)
    }
    loop.stop()
  } finally {
    restore()
  }
}

export async function testMediaOverlayFollowsLiveNodeAnchorsAcrossGestures() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const ids = ['image-a', 'image-b']
    const panels = ids.map(() => dom.window.document.createElement('section'))
    panels.forEach(panel => dom.window.document.body.appendChild(panel))
    const centers = [{ x: 1200.25, y: 700.75 }, { x: 1200.5, y: 701.25 }]
    let transform = zoomIdentity.translate(480.125, -30.25).scale(0.1)
    let reads = 0
    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true, loop: 'onDemand', items: ids.map(id => ({ id })),
      density: 'default', viewportW: 900, viewportH: 700,
      anchorToNode: true,
      // Even overlapping panels retain their graph anchors.
      schema: defaultSchema, collision: { enabled: true },
      readTransform: () => { reads += 1; return transform },
      getElementForId: id => panels[ids.indexOf(id)] || null,
      getNodeWorldCenterForId: id => centers[ids.indexOf(id)] || null,
      sizingConfig: { widthRatio: 0.2, widthMinPx: 210, widthMaxPx: 360, quantizeStepPx: 1 },
      clampToViewport: null,
    })
    const assertAnchored = (gesture: string) => panels.forEach((panel, index) => {
      const matrix = panel.style.transform.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(',').map(Number)
      if (!matrix || matrix.length !== 6) throw new Error(`${gesture}: missing matrix placement`)
      const cx = matrix[4]! + Number.parseFloat(panel.style.width) * matrix[0]! / 2
      const cy = matrix[5]! + Number.parseFloat(panel.style.height) * matrix[3]! / 2
      const expected = transform.apply([centers[index]!.x, centers[index]!.y])
      if (Math.hypot(cx - expected[0], cy - expected[1]) > 0.002) {
        throw new Error(`${gesture}: media detached from node: ${cx},${cy} vs ${expected}`)
      }
    })
    loop.flush()
    assertAnchored('initial overlap')
    for (let step = 1; step <= 12; step += 1) {
      transform = zoomIdentity.translate(480.125 + step * 0.125, -30.25 - step * 0.25).scale(0.1 + step * 0.031)
      loop.flush()
      assertAnchored('fractional pan and zoom')
    }
    centers[0]!.x += 101.125
    centers[0]!.y -= 42.875
    loop.flush()
    assertAnchored('node drag')
    centers.forEach(center => { center.x += 30.125; center.y += 11.75 })
    loop.flush()
    assertAnchored('cluster drag')
    loop.schedule()
    loop.schedule()
    const beforeFlush = reads
    loop.flush()
    await new Promise(resolve => setTimeout(resolve, 10))
    if (reads !== beforeFlush + 1) throw new Error('flush must consume the trailing RAF')
    const observer = new dom.window.MutationObserver(() => {})
    panels.forEach(panel => observer.observe(panel, { attributes: true }))
    loop.flush()
    if (observer.takeRecords().length) throw new Error('unchanged geometry must not rewrite panel styles')
    observer.disconnect()
    loop.schedule()
    loop.stop()
    const beforeStop = reads
    await new Promise(resolve => setTimeout(resolve, 10))
    if (reads !== beforeStop) throw new Error('stopped layout must not schedule work')
  } finally {
    restore()
  }
}

export async function testMediaOverlayHeaderDragConsumesFinalPointerSample() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useOverlayInteractions2d } = await import('@/components/GraphCanvasRoot/hooks/useOverlayInteractions2d')
  const { useGraphStore } = await import('@/hooks/useGraphStore')
  const previousView = useGraphStore.getState().workspaceViewMode
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    useGraphStore.setState({ workspaceViewMode: 'canvas' })
    const node = { id: 'media-drag', label: 'Media', type: 'media', properties: {}, x: 100, y: 200 }
    const svg = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('data-kg-layout-frozen', '1')
    let interactions: ReturnType<typeof useOverlayInteractions2d> | undefined
    let frames = 0
    const args: Parameters<typeof useOverlayInteractions2d>[0] = {
      activeRef: { current: true }, svgRef: { current: svg }, zoomRef: { current: null },
      simulationRef: { current: null }, sceneGraphDataRef: { current: { type: 'knowledge-graph', nodes: [node], edges: [] } },
      graphDataRevision: 1, schemaRef: { current: defaultSchema },
      requestOverlaySchedule: () => { frames += 1 },
    }
    function Harness() { interactions = useOverlayInteractions2d(args); return null }
    await React.act(async () => { root.render(React.createElement(Harness)) })
    if (!interactions) throw new Error('missing overlay interaction owner')
    interactions.beginHeaderDrag(node.id, 110, 210)
    interactions.moveHeaderDrag(40, 30, 150, 240)
    // Pointer-up may arrive before the queued animation frame.
    interactions.endHeaderDrag()
    if (node.x !== 140 || node.y !== 230) {
      throw new Error(`last pointer sample lost: ${node.x},${node.y}`)
    }
    if (frames === 0) throw new Error('drag completion did not request projection')
    const completedFrames = frames
    await new Promise(resolve => setTimeout(resolve, 10))
    if (frames !== completedFrames) throw new Error('drag left a pending frame after pointer-up')
  } finally {
    await React.act(async () => { root.unmount() })
    useGraphStore.setState({ workspaceViewMode: previousView })
    restore()
  }
}
