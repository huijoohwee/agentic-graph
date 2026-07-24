import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
  STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  readStoryboardWidgetOverlaySurfaceId,
  resolveStoryboardWidgetOverlayProxyTarget,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { distinctStoryboardOverlayRectsOverlap } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeRichMediaObstacles'

export async function testStoryboardWidgetOverlaySurfaceResolutionFallsBackToSurfaceRoot() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const doc = dom.window.document
    const canvas = doc.createElement('canvas')
    doc.body.appendChild(canvas)

    const surface = doc.createElement('section')
    surface.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-a')
    doc.body.appendChild(surface)

    const richMediaRoot = doc.createElement('section')
    richMediaRoot.setAttribute('data-kg-storyboard-widget-mode', '1')
    richMediaRoot.setAttribute('data-kg-rich-media-overlay', '1')
    richMediaRoot.setAttribute('data-node-id', 'panel-a')
    surface.appendChild(richMediaRoot)

    const target = doc.createElement('div')
    richMediaRoot.appendChild(target)
    const surfaceCanvas = doc.createElement('canvas')
    surface.appendChild(surfaceCanvas)

    if (readStoryboardWidgetOverlaySurfaceId(richMediaRoot) !== 'surface-a') {
      throw new Error('expected Storyboard Widget overlay surface resolution to fall back to the owning surface root')
    }

    const resolved = resolveStoryboardWidgetOverlayProxyTarget({
      target,
      canvasEl: canvas,
      storyboardWidgetSurfaceId: 'surface-a',
    })
    if (resolved.kind !== 'overlay') {
      throw new Error(`expected surface-root-owned Rich Media overlay to resolve for active proxy gestures, got ${resolved.kind}`)
    }

    const resolvedFromCanvasSurface = resolveStoryboardWidgetOverlayProxyTarget({
      target,
      canvasEl: surfaceCanvas,
    })
    if (resolvedFromCanvasSurface.kind !== 'overlay') {
      throw new Error(`expected Storyboard Widget overlay proxy resolver to derive active surface identity from the owning canvas root, got ${resolvedFromCanvasSurface.kind}`)
    }

    const stale = resolveStoryboardWidgetOverlayProxyTarget({
      target,
      canvasEl: canvas,
      storyboardWidgetSurfaceId: 'surface-b',
    })
    if (stale.kind !== 'none') {
      throw new Error('expected Storyboard Widget overlay proxy resolver to reject overlays under a non-active surface root')
    }
  } finally {
    restore()
  }
}

export async function testStoryboardWidgetActiveSurfaceObstacleCollectionIsSurfaceBoundedAndCanonical() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const doc = dom.window.document
    const body = doc.body

    const surfaceA = doc.createElement('section')
    surfaceA.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-a')
    body.appendChild(surfaceA)

    const surfaceB = doc.createElement('section')
    surfaceB.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-b')
    body.appendChild(surfaceB)

    const makeOverlay = (args: {
      parent: HTMLElement
      surfaceId: string
      nodeId: string
      widgetId?: string
      richMedia?: boolean
      left: number
      top: number
      width: number
      height: number
    }) => {
      const el = doc.createElement('section')
      el.setAttribute('data-kg-storyboard-widget-mode', '1')
      el.setAttribute('data-kg-storyboard-widget-surface', args.surfaceId)
      if (args.widgetId) el.setAttribute('data-kg-widget', args.widgetId)
      else el.setAttribute('data-node-id', args.nodeId)
      if (args.richMedia) el.setAttribute('data-kg-rich-media-overlay', '1')
      ;(el as unknown as { dataset: DOMStringMap }).dataset.nodeId = args.nodeId
      ;(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
        left: args.left,
        top: args.top,
        width: args.width,
        height: args.height,
        right: args.left + args.width,
        bottom: args.top + args.height,
        x: args.left,
        y: args.top,
        toJSON: () => ({}),
      }) as DOMRect
      args.parent.appendChild(el)
      return el
    }

    makeOverlay({
      parent: surfaceA,
      surfaceId: 'surface-a',
      nodeId: 'shared-node',
      richMedia: true,
      left: 20,
      top: 20,
      width: 120,
      height: 80,
    })
    makeOverlay({
      parent: surfaceA,
      surfaceId: 'surface-a',
      nodeId: 'shared-node',
      widgetId: 'shared-node',
      left: 24,
      top: 24,
      width: 220,
      height: 160,
    })
    makeOverlay({
      parent: surfaceA,
      surfaceId: 'surface-a',
      nodeId: 'only-a',
      widgetId: 'only-a',
      left: 300,
      top: 80,
      width: 180,
      height: 120,
    })
    makeOverlay({
      parent: surfaceB,
      surfaceId: 'surface-b',
      nodeId: 'only-b',
      widgetId: 'only-b',
      left: 600,
      top: 100,
      width: 180,
      height: 120,
    })

    const queryActiveSurfaceOverlays = (surfaceId: string): HTMLElement[] => {
      const surfaceRoot = doc.querySelector<HTMLElement>(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${surfaceId}"]`)
      const queryRoot: ParentNode = surfaceRoot || doc
      return Array.from(queryRoot.querySelectorAll<HTMLElement>(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR))
        .filter(el => readStoryboardWidgetOverlaySurfaceId(el) === surfaceId)
    }

    const surfaceAEntries = collectCanonicalStoryboardWidgetOverlayRectEntries(queryActiveSurfaceOverlays('surface-a'))
    const surfaceBEntries = collectCanonicalStoryboardWidgetOverlayRectEntries(queryActiveSurfaceOverlays('surface-b'))

    if (surfaceAEntries.length !== 2) {
      throw new Error(`expected surface-a canonical obstacle collection to return 2 entries, got ${surfaceAEntries.length}`)
    }
    if (surfaceBEntries.length !== 1) {
      throw new Error(`expected surface-b canonical obstacle collection to return 1 entry, got ${surfaceBEntries.length}`)
    }

    const sharedNodeEntry = surfaceAEntries.find(entry => entry.id === 'shared-node')
    if (!sharedNodeEntry) {
      throw new Error('expected surface-a canonical obstacle collection to include shared-node')
    }
    if (Math.round(sharedNodeEntry.rect.width) !== 220 || Math.round(sharedNodeEntry.rect.height) !== 160) {
      throw new Error(
        `expected surface-a canonical obstacle collection to prefer the larger widget-shell rect, got ${sharedNodeEntry.rect.width}x${sharedNodeEntry.rect.height}`,
      )
    }
    if (surfaceAEntries.some(entry => entry.id === 'only-b')) {
      throw new Error('expected surface-a canonical obstacle collection to exclude overlays from other active surfaces')
    }
    if (surfaceBEntries.some(entry => entry.id === 'shared-node' || entry.id === 'only-a')) {
      throw new Error('expected surface-b canonical obstacle collection to exclude overlays from surface-a')
    }
  } finally {
    restore()
  }
}

export async function testStoryboardWidgetActiveSurfaceObstacleCollectionIgnoresTinyParkedOffscreenRichMediaPlaceholders() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const doc = dom.window.document
    const body = doc.body
    const surface = doc.createElement('section')
    surface.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-a')
    body.appendChild(surface)

    const makeOverlay = (args: {
      nodeId: string
      widgetId?: string
      richMedia?: boolean
      left: number
      top: number
      width: number
      height: number
    }) => {
      const el = doc.createElement('section')
      el.setAttribute('data-kg-storyboard-widget-mode', '1')
      el.setAttribute('data-kg-storyboard-widget-surface', 'surface-a')
      if (args.widgetId) el.setAttribute('data-kg-widget', args.widgetId)
      else el.setAttribute('data-node-id', args.nodeId)
      if (args.richMedia) el.setAttribute('data-kg-rich-media-overlay', '1')
      ;(el as unknown as { dataset: DOMStringMap }).dataset.nodeId = args.nodeId
      ;(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
        left: args.left,
        top: args.top,
        width: args.width,
        height: args.height,
        right: args.left + args.width,
        bottom: args.top + args.height,
        x: args.left,
        y: args.top,
        toJSON: () => ({}),
      }) as DOMRect
      surface.appendChild(el)
      return el
    }

    makeOverlay({
      nodeId: 'panel-a',
      richMedia: true,
      left: -209,
      top: -83,
      width: 2,
      height: 2,
    })
    makeOverlay({
      nodeId: 'widget-a',
      widgetId: 'widget-a',
      left: 240,
      top: 140,
      width: 220,
      height: 160,
    })

    const overlays = Array.from(surface.querySelectorAll(STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR)) as HTMLElement[]
    const entries = collectCanonicalStoryboardWidgetOverlayRectEntries(overlays)
    if (entries.length !== 1 || entries[0]?.id !== 'widget-a') {
      throw new Error(`expected tiny parked rich-media placeholder to be ignored, got ${JSON.stringify(entries.map(entry => entry.id))}`)
    }
  } finally {
    restore()
  }
}

export async function testStoryboardWidgetActiveSurfaceObstacleCollectionPrefersInteractiveRichMediaRootOverPinnedProxy() {
  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const doc = dom.window.document
    const surface = doc.createElement('section')
    surface.setAttribute(STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR, 'surface-a')
    doc.body.appendChild(surface)

    const makeRichMedia = (args: {
      pinned?: boolean
      left: number
      top: number
      width: number
      height: number
    }) => {
      const el = doc.createElement('section')
      el.setAttribute('data-kg-storyboard-widget-mode', '1')
      el.setAttribute('data-kg-storyboard-widget-surface', 'surface-a')
      el.setAttribute('data-kg-rich-media-overlay', '1')
      el.setAttribute('data-node-id', 'panel-a')
      if (args.pinned) el.setAttribute('data-kg-canvas-overlay-pinned', '1')
      ;(el as unknown as { dataset: DOMStringMap }).dataset.nodeId = 'panel-a'
      ;(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
        left: args.left,
        top: args.top,
        width: args.width,
        height: args.height,
        right: args.left + args.width,
        bottom: args.top + args.height,
        x: args.left,
        y: args.top,
        toJSON: () => ({}),
      }) as DOMRect
      surface.appendChild(el)
      return el
    }

    makeRichMedia({ pinned: true, left: 10, top: 10, width: 360, height: 240 })
    makeRichMedia({ left: 500, top: 320, width: 112, height: 72 })

    const overlays = Array.from(surface.querySelectorAll(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)) as HTMLElement[]
    const entries = collectCanonicalStoryboardWidgetOverlayRectEntries(overlays)
    const entry = entries[0] || null
    if (entries.length !== 1 || entry?.id !== 'panel-a') {
      throw new Error(`expected one canonical Rich Media entry, got ${JSON.stringify(entries.map(item => item.id))}`)
    }
    if (Math.round(entry.rect.left) !== 500 || Math.round(entry.rect.top) !== 320) {
      throw new Error(`expected unpinned Storyboard Widget Rich Media root to beat larger passive pinned proxy, got ${entry.rect.left},${entry.rect.top}`)
    }
  } finally {
    restore()
  }
}

export function testStoryboardWidgetPinnedCardTreatsDistinctRichMediaAsCollisionObstacle() {
  const card = { id: 'card-a', left: 100, top: 100, width: 240, height: 180 }
  const richMedia = { id: 'rich-media:panel-a', left: 220, top: 180, width: 320, height: 220 }
  if (!distinctStoryboardOverlayRectsOverlap(card, richMedia, 12)) {
    throw new Error('expected overlapping pinned card and Rich Media panel to require layout separation')
  }
  if (distinctStoryboardOverlayRectsOverlap(
    { ...card, id: 'panel-a' },
    richMedia,
    12,
  )) {
    throw new Error('expected a Rich Media proxy not to collide with its own canonical overlay')
  }
  if (distinctStoryboardOverlayRectsOverlap(
    card,
    { ...card, id: 'storyboard-card:card-a' },
    12,
  )) {
    throw new Error('expected a Storyboard card not to collide with its own authored-placement obstacle')
  }
}
