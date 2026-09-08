import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'

const sliceBetween = (text: string, startNeedle: string, endNeedle: string): string => {
  const start = text.indexOf(startNeedle)
  const end = text.indexOf(endNeedle, Math.max(0, start))
  if (start < 0 || end <= start) return ''
  return text.slice(start, end)
}

export function testFlowCanvasWheelGestureUsesSubscribedInteractionSnapshot() {
  const bindText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'bindFlowCanvasNativeInteractions.ts'), 'utf8')
  const wheelText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'wheelAndGesture.ts'), 'utf8')
  const contextText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'interactions', 'context.ts'), 'utf8')

  const requiredSnippets = [
    'readFlowViewportInteractionSnapshot',
    'const unsubscribeViewportInteractionSnapshot = useGraphStore.subscribe(',
    'readViewportInteractionSnapshot: () => FlowViewportInteractionSnapshot',
    'readViewportInteractionSnapshot,',
    'const storeState = ctx.readViewportInteractionSnapshot()',
    'getSchema: () => ctx.readViewportInteractionSnapshot().schema',
    'disableAutoZoomModes: () => disableAutoZoomModesForUserGesture(ctx.readViewportInteractionSnapshot())',
    'deferInteractionCommits: true',
  ]
  const combined = `${bindText}\n${wheelText}\n${contextText}`
  for (const snippet of requiredSnippets) {
    if (!combined.includes(snippet)) throw new Error(`expected FlowCanvas wheel/gesture snapshot snippet: ${snippet}`)
  }

  if (wheelText.includes('useGraphStore')) {
    throw new Error('expected wheel and gesture handlers to use the subscribed interaction snapshot instead of reading the graph store')
  }

  const controllerBinding = sliceBetween(bindText, 'const viewportWheelController = createInfiniteCanvasViewportController({', '  try {')
  if (!controllerBinding) throw new Error('expected FlowCanvas native interaction binding to create a viewport wheel controller')
  if (controllerBinding.includes('useGraphStore.getState()')) {
    throw new Error('expected viewport controller callbacks to read the subscribed interaction snapshot instead of graph-store state')
  }
}

export async function testInfiniteCanvasViewportControllerDefersStoryboardWidgetViewportCommits() {
  const [{ createInfiniteCanvasViewportController }, d3] = await Promise.all([
    import('@/lib/canvas/infinite-canvas-engine'),
    import('d3'),
  ])
  let transform = d3.zoomIdentity
  const counts: Record<'commits' | 'interactionFrames', number> = { commits: 0, interactionFrames: 0 }
  const readCommitCount = () => counts.commits
  const readInteractionFrameCount = () => counts.interactionFrames
  const timers = new Map<number, () => void>()
  let nextTimerId = 1
  let fakeDateNow = 1000
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalDateNow = Date.now
  ;(globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: () => void) => {
    const id = nextTimerId++
    timers.set(id, cb)
    return id as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout
  ;(globalThis as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    timers.delete(id as unknown as number)
  }) as typeof clearTimeout
  ;(Date as unknown as { now: () => number }).now = () => fakeDateNow
  try {
    const createPanController = () => createInfiniteCanvasViewportController({
      active: () => true,
      adapter: {
        getTransform: () => transform,
        setTransform: t => {
          transform = t
        },
      },
      getSchema: () => ({ layout: {}, performance: { zoom: { wheelBehavior: 'pan' } } }) as never,
      getPreset: () => 'design',
      getPointerMode2d: () => 'pan',
      getWheelZoomCtrlMetaBoostMultiplier: () => 1,
      getCanvasPanSpeedMultiplier: () => 1,
      getCanvasInteractionSpeedMultiplier: () => 1,
      getFlowWheelZoomSpeedMultiplier: () => 1,
      getFlowWheelZoomIncrementMultiplier: () => 1,
      getFlowWheelZoomSmoothDuration: () => ({ minMs: 0, maxMs: 0 }),
      isSpacePanHeld: () => false,
      shouldIgnorePointerTarget: () => false,
      shouldIgnoreWheelEvent: () => false,
      lockUserSelect: () => undefined,
      unlockUserSelect: () => undefined,
      disableAutoZoomModes: () => undefined,
      onInteractionFrame: () => { counts.interactionFrames += 1 },
      onCommit: () => { counts.commits += 1 },
      deferInteractionCommits: true,
      getWheelAnchorFallback: () => null,
      setWheelAnchorFallback: () => undefined,
      readLocalPoint: () => ({ sx: 120, sy: 80, inBounds: true }),
      getBoundingRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect,
      pointerCapture: {
        setPointerCapture: () => undefined,
        releasePointerCapture: () => undefined,
        hasPointerCapture: () => true,
      },
      raf: {
        request: cb => {
          cb(200)
          return 1
        },
        cancel: () => undefined,
        now: () => 200,
      },
    })

    const controller = createPanController()
    const prevented = { value: 0 }
    controller.handleWheel({
      deltaX: 32,
      deltaY: 18,
      deltaMode: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      clientX: 120,
      clientY: 80,
      preventDefault: () => { prevented.value += 1 },
    } as unknown as WheelEvent)

    if (readCommitCount() !== 0) throw new Error(`expected wheel pan to defer Storyboard Widget viewport commit, got ${readCommitCount()}`)
    if (readInteractionFrameCount() !== 1) throw new Error(`expected wheel pan to keep drawing live transform, got ${readInteractionFrameCount()}`)
    if (transform.x === 0 && transform.y === 0) throw new Error('expected wheel pan to update live transform before commit')
    if (prevented.value !== 1) throw new Error('expected wheel pan to prevent default browser scrolling')

    const queued = Array.from(timers.values())
    if (queued.length !== 1) throw new Error(`expected one trailing deferred commit, got ${queued.length}`)
    fakeDateNow += 181
    queued[0]?.()
    if (readCommitCount() !== 1) throw new Error(`expected trailing commit after viewport interaction settles, got ${readCommitCount()}`)
    controller.destroy()

    transform = d3.zoomIdentity
    counts.commits = 0
    counts.interactionFrames = 0
    timers.clear()
    fakeDateNow += 181
    const destroyingController = createPanController()
    destroyingController.handleWheel({
      deltaX: 48,
      deltaY: 0,
      deltaMode: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      clientX: 120,
      clientY: 80,
      preventDefault: () => undefined,
    } as unknown as WheelEvent)
    if (readCommitCount() !== 0) throw new Error(`expected destroy-path wheel pan commit to defer before teardown, got ${readCommitCount()}`)
    if (timers.size !== 1) throw new Error(`expected destroy-path wheel pan to have one pending deferred commit, got ${timers.size}`)
    destroyingController.destroy()
    if (readCommitCount() !== 1) throw new Error(`expected controller destroy to flush pending Storyboard Widget viewport commit, got ${readCommitCount()}`)
    if (timers.size > 0) throw new Error(`expected controller destroy to clear pending deferred commit timer, got ${timers.size}`)

    transform = d3.zoomIdentity
    counts.commits = 0
    counts.interactionFrames = 0
    let nowMs = 1000
    fakeDateNow = nowMs
    const rafQueue: Array<(now: number) => void> = []
    const zoomController = createInfiniteCanvasViewportController({
      active: () => true,
      adapter: {
        getTransform: () => transform,
        setTransform: t => {
          transform = t
        },
      },
      getSchema: () => ({ layout: {}, performance: { zoom: { wheelBehavior: 'zoom' } } }) as never,
      getPreset: () => 'trackpad' as never,
      getPointerMode2d: () => 'pan',
      getWheelZoomCtrlMetaBoostMultiplier: () => 1,
      getCanvasPanSpeedMultiplier: () => 1,
      getCanvasInteractionSpeedMultiplier: () => 1,
      getFlowWheelZoomSpeedMultiplier: () => 1,
      getFlowWheelZoomIncrementMultiplier: () => 1,
      getFlowWheelZoomSmoothDuration: () => ({ minMs: 120, maxMs: 120 }),
      isSpacePanHeld: () => false,
      shouldIgnorePointerTarget: () => false,
      shouldIgnoreWheelEvent: () => false,
      lockUserSelect: () => undefined,
      unlockUserSelect: () => undefined,
      disableAutoZoomModes: () => undefined,
      onInteractionFrame: () => { counts.interactionFrames += 1 },
      onCommit: () => { counts.commits += 1 },
      deferInteractionCommits: true,
      getWheelAnchorFallback: () => null,
      setWheelAnchorFallback: () => undefined,
      readLocalPoint: () => ({ sx: 120, sy: 80, inBounds: true }),
      getBoundingRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect,
      pointerCapture: {
        setPointerCapture: () => undefined,
        releasePointerCapture: () => undefined,
        hasPointerCapture: () => true,
      },
      raf: {
        request: cb => {
          rafQueue.push(cb)
          return rafQueue.length
        },
        cancel: () => undefined,
        now: () => nowMs,
      },
    })

    zoomController.handleWheel({
      deltaX: 0,
      deltaY: -90,
      deltaMode: 0,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      clientX: 120,
      clientY: 80,
      preventDefault: () => undefined,
    } as unknown as WheelEvent)

    rafQueue.shift()?.(nowMs)
    nowMs += 24
    fakeDateNow = nowMs
    rafQueue.shift()?.(nowMs)
    if (readInteractionFrameCount() < 1) throw new Error('expected wheel zoom animation to update the live transform before final commit')
    if (readCommitCount() !== 0) throw new Error(`expected wheel zoom animation frame to defer commit, got ${readCommitCount()}`)
    nowMs += 160
    fakeDateNow = nowMs
    rafQueue.shift()?.(nowMs)
    if (readCommitCount() !== 1) throw new Error(`expected wheel zoom to commit once at animation end, got ${readCommitCount()}`)
    zoomController.destroy()
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    ;(Date as unknown as { now: () => number }).now = originalDateNow
  }
}

export function testInfiniteCanvasPointerMoveReusesDragSessionTuning() {
  const controllerText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'canvas', 'infinite-canvas-engine', 'controller.ts'), 'utf8')

  const requiredSnippets = [
    'const INTERACTION_DEFERRED_COMMIT_IDLE_MS = 180',
    'const hasActiveViewportInteraction = (): boolean => {',
    'if (remainingIdleMs > 0 || hasActiveViewportInteraction())',
    'interactionSpeed: number',
    'scaleExtent: { minK: number; maxK: number }',
    'zoomExponentMultiplier: number',
    'interactionSpeed,',
    'scaleExtent,',
    'zoomExponentMultiplier,',
    'const dx = rawDx * drag.interactionSpeed',
    'const dy = rawDy * drag.interactionSpeed',
    'scaleExtent: drag.scaleExtent',
    'zoomExponentMultiplier: drag.zoomExponentMultiplier',
  ]
  for (const snippet of requiredSnippets) {
    if (!controllerText.includes(snippet)) throw new Error(`expected infinite-canvas drag-session tuning snippet: ${snippet}`)
  }

  const pointerMoveText = sliceBetween(controllerText, "const handlePointerMove: InfiniteCanvasViewportController['handlePointerMove']", '  const endPointer')
  if (!pointerMoveText) throw new Error('expected infinite-canvas controller to expose a pointermove handler')
  const forbidden = [
    'args.getCanvasPanSpeedMultiplier()',
    'args.getCanvasInteractionSpeedMultiplier()',
    'args.getFlowWheelZoomSpeedMultiplier()',
    'args.getFlowWheelZoomIncrementMultiplier()',
    'readZoomSpeed(',
    'readScaleExtent(',
  ]
  for (const snippet of forbidden) {
    if (pointerMoveText.includes(snippet)) {
      throw new Error(`expected infinite-canvas pointermove to reuse pointerdown session tuning instead of ${snippet}`)
    }
  }
}

export function testStoryboardWidgetZoomRequestDefersCommitsUntilSettled() {
  const interactionRuntimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasInteractionRuntime.tsx'), 'utf8')
  const nativeZoomText = readFileSync(resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'applyZoomRequestNative.ts'), 'utf8')
  const zoomApplyBlock = sliceBetween(interactionRuntimeText, 'applyZoomRequestNative({', '    })')
  if (!zoomApplyBlock) throw new Error('expected FlowCanvas interaction runtime to apply native zoom requests')
  if (!zoomApplyBlock.includes("if (!storyboardWidgetMode) requestCommit()")) {
    throw new Error('expected Storyboard Widget zoom request frames to draw without committing every animation frame')
  }
  if (!zoomApplyBlock.includes('onCommit: requestCommit')) {
    throw new Error('expected Storyboard Widget zoom request to commit once through the native settled callback')
  }
  if (!nativeZoomText.includes('onCommit?: () => void')) {
    throw new Error('expected native zoom request API to expose a settled commit callback')
  }
  if (!nativeZoomText.includes('args.onCommit?.()')) {
    throw new Error('expected native zoom request to call the settled commit callback after transform updates')
  }
  const animationTickBlock = sliceBetween(nativeZoomText, 'const tick = (now: number) => {', '  const rafId = requestAnimationFrame(tick)')
  if (!animationTickBlock) throw new Error('expected native zoom request animation tick')
  const frameCommitIndex = animationTickBlock.indexOf('args.onFrame?.()')
  const settledCommitIndex = animationTickBlock.lastIndexOf('args.onCommit?.()')
  if (frameCommitIndex < 0 || settledCommitIndex < frameCommitIndex) {
    throw new Error('expected native zoom request to commit only after animation frames settle')
  }
}

export async function testStoryboardWidgetZoomRequestAnimationCommitsOnceAtSettle() {
  const [{ applyZoomRequestNative }, { useGraphStore }, { defaultSchema }, d3] = await Promise.all([
    import('@/components/FlowCanvas/applyZoomRequestNative'),
    import('@/hooks/useGraphStore'),
    import('@/lib/graph/schema'),
    import('d3'),
  ])
  const api = useGraphStore.getState()
  api.resetAll()
  useGraphStore.setState({
    schema: defaultSchema,
    canvasRenderMode: '2d',
    canvas2dRenderer: 'storyboard',
    graphDataRevision: 1,
    zoomDurationFitMs: 120,
    viewportFitReferenceWidth: 800,
    viewportFitReferenceHeight: 600,
    openWidgetNodeIds: [],
    flowWidgetPinnedByNodeId: {},
    flowWidgetWorldPosByNodeId: {},
    zoomRequest: { type: 'fit', intent: 'fitToView', at: Date.now() },
  } as never)

  const graphData = {
    type: 'Graph',
    context: 'flow',
    metadata: { kind: 'flow' },
    nodes: [
      { id: 'a', label: 'Alpha', x: -240, y: -120, properties: {} },
      { id: 'b', label: 'Beta', x: 320, y: 180, properties: {} },
    ],
    edges: [],
  } as never
  const runtime = {
    transform: d3.zoomIdentity,
    dirty: false,
  } as FlowNativeRuntime

  const rafQueue: Array<(now: number) => void> = []
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  }) as typeof requestAnimationFrame
  ;(globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

  const counts = { frames: 0, commits: 0 }
  const readFrames = () => counts.frames
  const readCommits = () => counts.commits
  try {
    applyZoomRequestNative({
      zoomRequest: { type: 'fit', intent: 'fitToView', at: Date.now() },
      runtime,
      graphData,
      width: 800,
      height: 600,
      selectedNodeId: null,
      selectedEdgeId: null,
      onFrame: () => {
        counts.frames += 1
      },
      onCommit: () => {
        counts.commits += 1
      },
    })

    if (readCommits() !== 0) throw new Error(`expected Storyboard Widget zoom request to avoid synchronous commit before RAF frames, got ${readCommits()}`)
    if (rafQueue.length !== 1) throw new Error(`expected one queued zoom animation frame, got ${rafQueue.length}`)

    rafQueue.shift()?.(performance.now() + 20)
    if (readFrames() !== 1) throw new Error(`expected first zoom animation frame to draw, got ${readFrames()}`)
    if (readCommits() !== 0) throw new Error(`expected first zoom animation frame to avoid commit, got ${readCommits()}`)
    if (rafQueue.length !== 1) throw new Error(`expected zoom animation to queue a continuation frame, got ${rafQueue.length}`)

    rafQueue.shift()?.(performance.now() + 240)
    if (readFrames() < 2) throw new Error(`expected final zoom animation frame to draw, got ${readFrames()}`)
    if (readCommits() !== 1) throw new Error(`expected Storyboard Widget zoom request to commit once after animation settles, got ${readCommits()}`)
    if (useGraphStore.getState().zoomRequest !== null) throw new Error('expected native zoom request to clear the consumed zoom request')
  } finally {
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    } else {
      delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
    }
    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    } else {
      delete (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
    }
    useGraphStore.setState(api, true)
  }
}
