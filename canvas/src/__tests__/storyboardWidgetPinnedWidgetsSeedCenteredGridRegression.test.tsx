import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import StoryboardWidgetCanvas from '@/components/StoryboardWidgetCanvas'
import { computeCollectiveFollowPinnedScale, computeWidgetScaledSize, WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { viewportCenterToWorld } from '@/lib/zoom/viewport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'

const STORYBOARD_SEED_TIMEOUT_MS = 1600
const STORYBOARD_TEST_POLL_MS = 5

const waitForStoryboardTick = () => new Promise<void>(resolve => setTimeout(resolve, STORYBOARD_TEST_POLL_MS))

const renderStoryboardCanvas = async (root: ReturnType<typeof createRoot>, element: React.ReactElement) => {
  await act(async () => {
    root.render(element)
    await waitForStoryboardTick()
  })
}

const unmountStoryboardCanvas = async (root: ReturnType<typeof createRoot> | null) => {
  if (!root) return
  await act(async () => {
    root.unmount()
    await waitForStoryboardTick()
  })
}

const installStoryboardWidgetViewportRect = (dom: ReturnType<typeof initJsdomHarness>['dom'], width = 800, height = 600) => {
  const rect = {
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rect
  }
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height })
}

export async function testStoryboardWidgetPinnedWidgetsInitCenteredEvenGrid() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'n1', label: 'n1', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n2', label: 'n2', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n3', label: 'n3', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n4', label: 'n4', type: 'Anchor', x: 0, y: 0, properties: {} },
        ],
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsSeed' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'flow',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(['n1', 'n2', 'n3', 'n4'])
    api.setFlowWidgetWorldPosByNodeId({})
    api.setFlowWidgetPinnedByNodeId({})

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await renderStoryboardCanvas(root, React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const ids = ['n1', 'n2', 'n3', 'n4']
    const waitForSeed = async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const st = useGraphStore.getState()
        const worldById =
          (st as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
            .flowWidgetWorldPosByNodeId || {}
        const ok = ids.every(id => {
          const w = worldById[id]
          return w && Number.isFinite(w.x) && Number.isFinite(w.y)
        })
        if (ok) return worldById
        await waitForStoryboardTick()
      }
      throw new Error('expected seeded world positions')
    }
    const worldById = await waitForSeed()

    const z = { k: 1, x: 0, y: 0 }
    const viewportW = 800
    const viewportH = 600
    const center = viewportCenterToWorld({ transform: z, viewportW, viewportH })
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK: z.k,
      viewportW,
      viewportH,
      count: ids.length,
      baseWidth: 360,
      baseHeight: 520,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width / z.k
    const panelWorldH = panelScreen.height / z.k

    const centers = ids.map(id => {
      const p = worldById[id]!
      return { x: p.x + panelWorldW / 2, y: p.y + panelWorldH / 2 }
    })
    const centroid = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 })
    centroid.x /= centers.length
    centroid.y /= centers.length

    if (Math.abs(centroid.x - center.x) > 2 || Math.abs(centroid.y - center.y) > 2) {
      throw new Error(`expected centroid ~${center.x},${center.y} got ${centroid.x},${centroid.y}`)
    }

    const rects = ids.map(id => {
      const p = worldById[id]!
      const left = p.x * z.k + z.x
      const top = p.y * z.k + z.y
      return { id, left, top, right: left + panelScreen.width, bottom: top + panelScreen.height }
    })
    for (let i = 0; i < rects.length; i += 1) {
      const a = rects[i]!
      for (let j = i + 1; j < rects.length; j += 1) {
        const b = rects[j]!
        const overlapX = a.left < b.right && b.left < a.right
        const overlapY = a.top < b.bottom && b.top < a.bottom
        if (overlapX && overlapY) throw new Error(`expected no overlap: ${a.id} vs ${b.id}`)
      }
    }
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsInitCenteredWithViewportOffset() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'n1', label: 'n1', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n2', label: 'n2', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n3', label: 'n3', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n4', label: 'n4', type: 'Anchor', x: 0, y: 0, properties: {} },
        ],
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsSeedOffsetCenter' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    const transform = { k: 1.2, x: 180, y: -90 }
    api.setZoomState(transform)
    api.setOpenWidgetNodeIds(['n1', 'n2', 'n3', 'n4'])
    api.setFlowWidgetWorldPosByNodeId({})
    api.setFlowWidgetPinnedByNodeId({})

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    await renderStoryboardCanvas(root, React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const ids = ['n1', 'n2', 'n3', 'n4']
    const waitForSeed = async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const st = useGraphStore.getState()
        const worldById =
          (st as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
            .flowWidgetWorldPosByNodeId || {}
        const ok = ids.every(id => {
          const w = worldById[id]
          return w && Number.isFinite(w.x) && Number.isFinite(w.y)
        })
        if (ok) return worldById
        await waitForStoryboardTick()
      }
      throw new Error('expected seeded world positions with non-zero viewport offset')
    }
    const worldById = await waitForSeed()

    const viewportW = 800
    const viewportH = 600
    const center = viewportCenterToWorld({ transform, viewportW, viewportH })
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK: transform.k,
      viewportW,
      viewportH,
      count: ids.length,
      baseWidth: 360,
      baseHeight: 520,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width / transform.k
    const panelWorldH = panelScreen.height / transform.k

    const centers = ids.map(id => {
      const p = worldById[id]!
      return { x: p.x + panelWorldW / 2, y: p.y + panelWorldH / 2 }
    })
    const centroid = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 })
    centroid.x /= centers.length
    centroid.y /= centers.length

    const gridCenteredTolerancePx = 24
    if (Math.abs(centroid.x - center.x) > gridCenteredTolerancePx || Math.abs(centroid.y - center.y) > gridCenteredTolerancePx) {
      throw new Error(`expected centroid near ${center.x},${center.y} with non-zero viewport offset, got ${centroid.x},${centroid.y}`)
    }
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsReseedWhenViewportStabilizes() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { ResizeObserver?: new (cb: ResizeObserverCallback) => ResizeObserver }
    installStoryboardWidgetViewportRect(dom)

    const resizeObservers: ResizeObserverCallback[] = []
    class ResizeObserverStub {
      callback: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.callback = cb
        resizeObservers.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
    anyWindow.ResizeObserver = ResizeObserverStub as unknown as new (cb: ResizeObserverCallback) => ResizeObserver

    const api = useGraphStore.getState()
    api.resetAll()

    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'n1', label: 'n1', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n2', label: 'n2', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n3', label: 'n3', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n4', label: 'n4', type: 'Anchor', x: 0, y: 0, properties: {} },
        ],
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsViewportResize' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(['n1', 'n2', 'n3', 'n4'])
    api.setFlowWidgetWorldPosByNodeId({})
    api.setFlowWidgetPinnedByNodeId({})

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderStoryboardCanvas(root, React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const ids = ['n1', 'n2', 'n3', 'n4']
    const readWorld = () =>
      ((useGraphStore.getState() as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
        .flowWidgetWorldPosByNodeId || {}) as Record<string, { x: number; y: number }>
    const waitForSeed = async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const worldById = readWorld()
        const ok = ids.every(id => {
          const w = worldById[id]
          return w && Number.isFinite(w.x) && Number.isFinite(w.y)
        })
        if (ok) return worldById
        await waitForStoryboardTick()
      }
      throw new Error('expected seeded world positions')
    }

    const initialWorld = await waitForSeed()
    const measureRoot = await (async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const viewportRoot = doc.querySelector('[data-kg-canvas-viewport-root="1"]') as HTMLElement | null
        if (viewportRoot) return viewportRoot
        const storyboardRoot = doc.querySelector('[aria-label="Storyboard"]') as HTMLElement | null
        if (storyboardRoot) return storyboardRoot
        await waitForStoryboardTick()
      }
      throw new Error('expected Storyboard measurement root')
    })()

    measureRoot.getBoundingClientRect = () =>
      ({
        left: 540,
        top: 24,
        width: 260,
        height: 600,
        right: 800,
        bottom: 624,
        x: 540,
        y: 24,
        toJSON: () => ({}),
      }) as DOMRect

    for (let i = 0; i < resizeObservers.length; i += 1) {
      resizeObservers[i]!([] as ResizeObserverEntry[], {} as ResizeObserver)
    }

    const z = { k: 1, x: 0, y: 0 }
    const center = viewportCenterToWorld({ transform: z, viewportW: 260, viewportH: 600 })
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK: z.k,
      viewportW: 260,
      viewportH: 600,
      count: ids.length,
      baseWidth: 360,
      baseHeight: 520,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width / z.k
    const panelWorldH = panelScreen.height / z.k
    const readCentroid = (worldById: Record<string, { x: number; y: number }>) => {
      const centers = ids.map(id => {
        const p = worldById[id]!
        return { x: p.x + panelWorldW / 2, y: p.y + panelWorldH / 2 }
      })
      const centroid = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 })
      centroid.x /= centers.length
      centroid.y /= centers.length
      return centroid
    }
    const resized = await (async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      let latestFinite: { worldById: Record<string, { x: number; y: number }>; moved: boolean; centroid: { x: number; y: number } } | null = null
      while (Date.now() < deadline) {
        const worldById = readWorld()
        const hasFinite = ids.every(id => {
          const w = worldById[id]
          return !!w && Number.isFinite(w.x) && Number.isFinite(w.y)
        })
        if (hasFinite) {
          const moved = ids.some(id => {
            const a = initialWorld[id]
            const b = worldById[id]
            return !!a && !!b && (Math.abs(a.x - b.x) > 0.0001 || Math.abs(a.y - b.y) > 0.0001)
          })
          const centroid = readCentroid(worldById)
          latestFinite = { worldById, moved, centroid }
          if (moved && Math.abs(centroid.x - center.x) <= 2 && Math.abs(centroid.y - center.y) <= 2) return latestFinite
        }
        await waitForStoryboardTick()
      }
      if (latestFinite) return latestFinite
      throw new Error('expected reseeded world positions after viewport resize')
    })()
    const centroid = resized.centroid

    const gridCenteredTolerancePx = 8
    if (resized.moved && (Math.abs(centroid.x - center.x) > gridCenteredTolerancePx || Math.abs(centroid.y - center.y) > gridCenteredTolerancePx)) {
      throw new Error(`expected resized centroid ~${center.x},${center.y} got ${centroid.x},${centroid.y}`)
    }
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsReseedWhenInitiallyStacked() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'n1', label: 'n1', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n2', label: 'n2', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n3', label: 'n3', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n4', label: 'n4', type: 'Anchor', x: 0, y: 0, properties: {} },
        ],
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsInitialStack' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(['n1', 'n2', 'n3', 'n4'])
    api.setFlowWidgetPinnedByNodeId({})
    api.setFlowWidgetWorldPosByNodeId({
      n1: { x: 400, y: 300 },
      n2: { x: 400, y: 300 },
      n3: { x: 400, y: 300 },
      n4: { x: 400, y: 300 },
    })

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderStoryboardCanvas(root, React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const ids = ['n1', 'n2', 'n3', 'n4']
    const readWorld = () =>
      ((useGraphStore.getState() as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
        .flowWidgetWorldPosByNodeId || {}) as Record<string, { x: number; y: number }>

    const worldById = await (async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const current = readWorld()
        const unique = new Set(ids.map(id => `${Math.round((current[id]?.x || 0) * 1000)}:${Math.round((current[id]?.y || 0) * 1000)}`))
        if (unique.size === ids.length) return current
        await waitForStoryboardTick()
      }
      throw new Error('expected stacked widgets to reseed into spread positions')
    })()
    const zoomK = useGraphStore.getState().zoomState?.k || 1
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK,
      viewportW: 800,
      viewportH: 600,
      count: ids.length,
      baseWidth: WIDGET_BASE_SIZE.width,
      baseHeight: WIDGET_BASE_SIZE.height,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const rects = ids.map(id => {
      const p = worldById[id]!
      return { id, left: p.x, top: p.y, right: p.x + panelScreen.width / zoomK, bottom: p.y + panelScreen.height / zoomK }
    })
    for (let i = 0; i < rects.length; i += 1) {
      const a = rects[i]!
      for (let j = i + 1; j < rects.length; j += 1) {
        const b = rects[j]!
        const overlapX = a.left < b.right && b.left < a.right
        const overlapY = a.top < b.bottom && b.top < a.bottom
        if (overlapX && overlapY) throw new Error(`expected no overlap after reseed: ${a.id} vs ${b.id}; zoom=${zoomK}, rects=${JSON.stringify(rects)}`)
      }
    }
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsReseedWhenInitiallyVerticalStrip() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: [
          { id: 'n1', label: 'n1', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n2', label: 'n2', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n3', label: 'n3', type: 'Anchor', x: 0, y: 0, properties: {} },
          { id: 'n4', label: 'n4', type: 'Anchor', x: 0, y: 0, properties: {} },
        ],
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsVerticalStrip' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(['n1', 'n2', 'n3', 'n4'])
    api.setFlowWidgetPinnedByNodeId({})
    api.setFlowWidgetWorldPosByNodeId({
      n1: { x: 400, y: 40 },
      n2: { x: 400, y: 220 },
      n3: { x: 400, y: 400 },
      n4: { x: 400, y: 580 },
    })

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderStoryboardCanvas(root, React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const ids = ['n1', 'n2', 'n3', 'n4']
    const readWorld = () =>
      ((useGraphStore.getState() as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
        .flowWidgetWorldPosByNodeId || {}) as Record<string, { x: number; y: number }>

    const worldById = await (async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const current = readWorld()
        const uniqueX = new Set(ids.map(id => Math.round((current[id]?.x || 0) * 1000)))
        if (uniqueX.size >= 2) return current
        await waitForStoryboardTick()
      }
      throw new Error('expected vertical-strip widgets to reseed into spread positions')
    })()

    const uniqueX = new Set(ids.map(id => Math.round((worldById[id]?.x || 0) * 1000)))
    if (uniqueX.size < 2) throw new Error('expected reseeded vertical-strip widgets to use multiple columns')
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsReseedDenseMixedSetStaysCenteredAndAvoidsStripCollapse() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    const ids = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']
    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: ids.map(id => ({ id, label: id, type: 'Anchor', x: 0, y: 0, properties: {} })),
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsDenseMixedSet' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(ids)
    api.setFlowWidgetPinnedByNodeId({})
    api.setFlowWidgetWorldPosByNodeId({
      n1: { x: 120, y: 300 },
      n2: { x: 520, y: 300 },
      n3: { x: 920, y: 300 },
      n4: { x: 1320, y: 300 },
      n5: { x: 1720, y: 300 },
      n6: { x: 2120, y: 300 },
    })

    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    root.render(React.createElement(StoryboardWidgetCanvas, { active: true } as never))

    const readWorld = () =>
      ((useGraphStore.getState() as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
        .flowWidgetWorldPosByNodeId || {}) as Record<string, { x: number; y: number }>

    const worldById = await (async () => {
      const deadline = Date.now() + 1200
      while (Date.now() < deadline) {
        const current = readWorld()
        const uniqueRows = new Set(ids.map(id => Math.round((current[id]?.y || 0) * 1000)))
        const uniqueCols = new Set(ids.map(id => Math.round((current[id]?.x || 0) * 1000)))
        if (uniqueRows.size >= 2 && uniqueCols.size >= 2) return current
        await new Promise<void>(resolve => setTimeout(resolve, 5))
      }
      throw new Error('expected dense mixed-set widgets to reseed into a balanced multi-row, multi-column spread')
    })()

    const viewportW = 800
    const viewportH = 600
    const center = viewportCenterToWorld({ transform: { k: 1, x: 0, y: 0 }, viewportW, viewportH })
    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK: 1,
      viewportW,
      viewportH,
      count: ids.length,
      baseWidth: 360,
      baseHeight: 520,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width
    const panelWorldH = panelScreen.height

    const centers = ids.map(id => {
      const p = worldById[id]!
      return { x: p.x + panelWorldW / 2, y: p.y + panelWorldH / 2 }
    })
    const centroid = centers.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 })
    centroid.x /= centers.length
    centroid.y /= centers.length

    if (Math.abs(centroid.x - center.x) > 2 || Math.abs(centroid.y - center.y) > 2) {
      throw new Error(`expected dense reseed centroid ~${center.x},${center.y} got ${centroid.x},${centroid.y}`)
    }

    const uniqueRows = new Set(ids.map(id => Math.round((worldById[id]?.y || 0) * 1000)))
    const uniqueCols = new Set(ids.map(id => Math.round((worldById[id]?.x || 0) * 1000)))
    if (uniqueRows.size < 2 || uniqueCols.size < 2) {
      throw new Error(`expected dense reseed to avoid strip collapse, got rows=${uniqueRows.size}, cols=${uniqueCols.size}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testStoryboardWidgetPinnedWidgetsReseedAvoidsActiveSurfaceRichMediaObstacles() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installStoryboardWidgetViewportRect(dom)

    const api = useGraphStore.getState()
    api.resetAll()

    const ids = ['n1', 'n2', 'n3', 'n4']
    useGraphStore.setState(s => ({
      ...s,
      graphData: {
        type: 'Graph',
        nodes: ids.map(id => ({ id, label: id, type: 'Anchor', x: 0, y: 0, properties: {} })),
        edges: [],
        metadata: { kind: 'test', source: 'storyboardWidgetPinnedWidgetsRichMediaObstacle' },
      },
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'document',
      documentStructureBaselineLock: false,
    }))

    api.setZoomState({ k: 1, x: 0, y: 0 })
    api.setOpenWidgetNodeIds(ids)
    api.setFlowWidgetPinnedByNodeId({})
    api.setFlowWidgetWorldPosByNodeId({
      n1: { x: 400, y: 280 },
      n2: { x: 400, y: 280 },
      n3: { x: 400, y: 280 },
      n4: { x: 400, y: 280 },
    })

    const doc = dom.window.document
    const surfaceRoot = doc.createElement('section')
    surfaceRoot.setAttribute('data-kg-storyboard-widget-surface-root', 'surface-test')
    doc.body.appendChild(surfaceRoot)

    const activeRichMedia = doc.createElement('section')
    activeRichMedia.setAttribute('data-kg-storyboard-widget-mode', '1')
    activeRichMedia.setAttribute('data-kg-storyboard-widget-surface', 'surface-test')
    activeRichMedia.setAttribute('data-kg-rich-media-overlay', '1')
    activeRichMedia.setAttribute('data-node-id', 'rich-active')
    ;(activeRichMedia as unknown as { dataset: DOMStringMap }).dataset.nodeId = 'rich-active'
    ;(activeRichMedia as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 320,
      top: 180,
      width: 220,
      height: 180,
      right: 540,
      bottom: 360,
      x: 320,
      y: 180,
      toJSON: () => ({}),
    }) as DOMRect
    surfaceRoot.appendChild(activeRichMedia)

    const inactiveSurfaceRoot = doc.createElement('section')
    inactiveSurfaceRoot.setAttribute('data-kg-storyboard-widget-surface-root', 'surface-other')
    doc.body.appendChild(inactiveSurfaceRoot)

    const inactiveRichMedia = doc.createElement('section')
    inactiveRichMedia.setAttribute('data-kg-storyboard-widget-mode', '1')
    inactiveRichMedia.setAttribute('data-kg-storyboard-widget-surface', 'surface-other')
    inactiveRichMedia.setAttribute('data-kg-rich-media-overlay', '1')
    inactiveRichMedia.setAttribute('data-node-id', 'rich-inactive')
    ;(inactiveRichMedia as unknown as { dataset: DOMStringMap }).dataset.nodeId = 'rich-inactive'
    ;(inactiveRichMedia as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
      left: 40,
      top: 40,
      width: 240,
      height: 180,
      right: 280,
      bottom: 220,
      x: 40,
      y: 40,
      toJSON: () => ({}),
    }) as DOMRect
    inactiveSurfaceRoot.appendChild(inactiveRichMedia)

    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await renderStoryboardCanvas(
      root,
      React.createElement(StoryboardWidgetCanvas, { active: true, storyboardWidgetSurfaceId: 'surface-test' } as never),
    )

    const readWorld = () =>
      ((useGraphStore.getState() as unknown as { flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }> })
        .flowWidgetWorldPosByNodeId || {}) as Record<string, { x: number; y: number }>

    const worldById = await (async () => {
      const deadline = Date.now() + STORYBOARD_SEED_TIMEOUT_MS
      while (Date.now() < deadline) {
        const current = readWorld()
        const unique = new Set(ids.map(id => `${Math.round((current[id]?.x || 0) * 1000)}:${Math.round((current[id]?.y || 0) * 1000)}`))
        if (unique.size >= 2) return current
        await waitForStoryboardTick()
      }
      throw new Error('expected widgets to reseed away from active-surface rich-media obstacle')
    })()

    const panelScale = computeCollectiveFollowPinnedScale({
      zoomK: 1,
      viewportW: 800,
      viewportH: 600,
      count: ids.length,
      baseWidth: 360,
      baseHeight: 520,
    })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const activeObstacle = { left: 320, top: 180, right: 540, bottom: 360 }
    const inactiveObstacle = { left: 40, top: 40, right: 280, bottom: 220 }

    const rects = ids.map(id => {
      const p = worldById[id]!
      return { id, left: p.x, top: p.y, right: p.x + panelScreen.width, bottom: p.y + panelScreen.height }
    })

    const overlapsActive = rects.some(rect => rect.left < activeObstacle.right && activeObstacle.left < rect.right && rect.top < activeObstacle.bottom && activeObstacle.top < rect.bottom)
    const overlapsInactive = rects.some(rect => rect.left < inactiveObstacle.right && inactiveObstacle.left < rect.right && rect.top < inactiveObstacle.bottom && inactiveObstacle.top < rect.bottom)

    if (overlapsActive) {
      throw new Error('expected widget reseed to avoid active-surface rich-media obstacle')
    }
    if (!overlapsInactive) {
      throw new Error('expected non-active-surface rich-media obstacle to stay excluded from widget collision input')
    }
  } finally {
    try {
      await unmountStoryboardCanvas(root)
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
