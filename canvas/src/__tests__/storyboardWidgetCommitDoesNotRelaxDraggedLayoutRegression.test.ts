import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FlowNativeInteractionsContext } from '@/components/FlowCanvas/interactions/context'

export function testStoryboardWidgetCommitDoesNotRelaxDraggedLayout() {
  const p1 = resolve(process.cwd(), 'src', 'components', 'FlowCanvas.tsx')
  const flowCanvas = readFileSync(p1, 'utf8')
  if (!flowCanvas.includes("disableRelaxOnCommit: canvas2dRenderer === 'storyboard'")) {
    throw new Error('expected FlowCanvas to disable commit relaxation in StoryboardWidget mode')
  }
  const p2 = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowRequestCommit.ts')
  const hook = readFileSync(p2, 'utf8')
  if (!hook.includes('disableRelaxOnCommit')) {
    throw new Error('expected useFlowRequestCommit to accept a disableRelaxOnCommit option')
  }
  if (!hook.includes('function scheduleFlowCommitTask') || !hook.includes('globalThis.queueMicrotask')) {
    throw new Error('expected Storyboard Widget commit scheduling to persist settled viewport state without waiting for a paint frame')
  }
  if (!hook.includes('trailingCommitRef') || !hook.includes('pendingCommitRef.current')) {
    throw new Error('expected Storyboard Widget commit scheduling to coalesce trailing viewport commits instead of dropping them')
  }
  if (!hook.includes('if (disableRelaxOnCommit === true)')) {
    throw new Error('expected useFlowRequestCommit to bypass relaxFlowSceneNodePositions when disableRelaxOnCommit is true')
  }
  if (!hook.includes('shouldCommitFlowLayoutPositions({')) {
    throw new Error('expected useFlowRequestCommit to centralize layout-position commit eligibility')
  }
}

export async function testStoryboardWidgetPanZoomCommitDoesNotWriteLayoutPositions() {
  const { shouldCommitFlowLayoutPositions } = await import('@/components/FlowCanvas/useFlowRequestCommit')
  const panZoomCommit = shouldCommitFlowLayoutPositions({
    workspaceMutationBlocked: false,
    cacheKey: 'storyboardWidget:document',
    hasLayoutWriter: true,
    positionsDirtySinceCommit: false,
    hasScene: true,
  })
  if (panZoomCommit) {
    throw new Error('expected pan/zoom-only Storyboard Widget commits to skip layout-position writes')
  }

  const draggedElementCommit = shouldCommitFlowLayoutPositions({
    workspaceMutationBlocked: false,
    cacheKey: 'storyboardWidget:document',
    hasLayoutWriter: true,
    positionsDirtySinceCommit: true,
    hasScene: true,
  })
  if (!draggedElementCommit) {
    throw new Error('expected actual dragged element commits to write layout positions')
  }

  const workspaceBlockedStoryboardWidgetCommit = shouldCommitFlowLayoutPositions({
    workspaceMutationBlocked: true,
    allowLayoutCommitWhenWorkspaceBlocked: true,
    cacheKey: 'storyboardWidget:document',
    hasLayoutWriter: true,
    positionsDirtySinceCommit: true,
    hasScene: true,
  })
  if (!workspaceBlockedStoryboardWidgetCommit) {
    throw new Error('expected Storyboard Widget workspace drags to persist moved positions while workspace overlay is open')
  }

  const workspaceBlockedNonFlowCommit = shouldCommitFlowLayoutPositions({
    workspaceMutationBlocked: true,
    allowLayoutCommitWhenWorkspaceBlocked: false,
    cacheKey: 'flow:document',
    hasLayoutWriter: true,
    positionsDirtySinceCommit: true,
    hasScene: true,
  })
  if (workspaceBlockedNonFlowCommit) {
    throw new Error('expected non-Storyboard Widget workspace-blocked commits to skip layout-position writes')
  }
}

export async function testStoryboardWidgetPointerPanZoomMovesDoNotCommitEveryFrame() {
  const [{ createFlowNativePointerMoveHandler }, { createFlowNativePointerUpHandler }, d3] = await Promise.all([
    import('@/components/FlowCanvas/interactions/pointerMove'),
    import('@/components/FlowCanvas/interactions/pointerUp'),
    import('d3'),
  ])
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: FrameRequestCallback) => {
    void cb
    return 1
  }) as typeof requestAnimationFrame
  try {
    const counts: Record<'commit' | 'interactionFrames', number> = { commit: 0, interactionFrames: 0 }
    const canvasEl = {
      style: { cursor: 'default' },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      hasPointerCapture: () => true,
      releasePointerCapture: () => void 0,
    } as unknown as HTMLCanvasElement
    const runtime = {
      transform: d3.zoomIdentity.translate(10, 20).scale(2),
      viewportW: 800,
      viewportH: 600,
      pendingRaf: 1,
      dirty: false,
      scene: null,
    }
    const dragRef: FlowNativeInteractionsContext['args']['dragRef'] = {
      current: {
        type: 'pan',
        startSx: 100,
        startSy: 120,
        startTx: 10,
        startTy: 20,
        interactionSpeed: 1,
        pointerId: 7,
      },
    }
    const ctx = {
      canvasEl,
      runtime,
      touchPointsById: new Map<number, { sx: number; sy: number }>(),
      edgeScroll: { update: () => ({ dx: 0, dy: 0 }), reset: () => void 0 },
      args: {
        active: true,
        canvasEl,
        runtime,
        viewportControlsPreset: 'trackpad',
        selectionOnDrag: false,
        collisionDuringDrag: false,
        requestCommit: () => { counts.commit += 1 },
        buildDrawArgs: () => ({}),
        setSelectionBox: () => void 0,
        onInteractionFrame: () => { counts.interactionFrames += 1 },
        dragRef,
        lastPointerInCanvasRef: { current: null },
        lastWheelIntentRef: { current: null },
        zoomWheelGuardRef: { current: {} },
        userSelectLockPointerIdRef: { current: null },
        positionsDirtySinceCommitRef: { current: false },
        collisionSchemaRef: { current: null },
        collisionGraphDataRef: { current: null },
        collisionFlowConfigRef: { current: null },
        collisionPresentationRef: { current: null },
      },
      getPreset: () => 'trackpad',
      readEffectiveSelectMode: () => 'multi',
      computeScaleExtent: () => ({ minK: 0.1, maxK: 8 }),
      viewportWheelController: { handleWheel: () => false, destroy: () => void 0 },
      readViewportInteractionSnapshot: () => ({}) as never,
      cancelActiveDragIfStale: () => false,
      scheduleDragRelax: () => void 0,
    } as unknown as FlowNativeInteractionsContext
    const move = createFlowNativePointerMoveHandler(ctx)
    const up = createFlowNativePointerUpHandler(ctx)
    const readCommitCount = (): number => counts.commit
    const readInteractionFrameCount = (): number => counts.interactionFrames
    const eventBase = {
      pointerId: 7,
      pointerType: 'mouse',
      buttons: 1,
      target: canvasEl,
      currentTarget: canvasEl,
      preventDefault() {},
    }

    move({ ...eventBase, offsetX: 130, offsetY: 150 } as unknown as PointerEvent)
    if (readCommitCount() !== 0) throw new Error(`expected pan move to avoid commit, got ${readCommitCount()}`)
    if (runtime.transform.x !== 40 || runtime.transform.y !== 50 || runtime.transform.k !== 2) {
      throw new Error(`expected pan move to update live transform, got ${runtime.transform.x},${runtime.transform.y},${runtime.transform.k}`)
    }
    if (readInteractionFrameCount() <= 0) throw new Error('expected pan move to emit an interaction frame')
    up({ ...eventBase, buttons: 0, offsetX: 130, offsetY: 150 } as unknown as PointerEvent)
    if (readCommitCount() !== 1) throw new Error(`expected pan pointer end to commit once, got ${readCommitCount()}`)

    counts.commit = 0
    counts.interactionFrames = 0
    runtime.transform = d3.zoomIdentity
    dragRef.current = {
      type: 'pinch',
      pointerIdA: 1,
      pointerIdB: 2,
      pointerId: 1,
      startTransform: d3.zoomIdentity,
      startA: { sx: 100, sy: 100 },
      startB: { sx: 200, sy: 100 },
      scaleExtent: { minK: 0.1, maxK: 8 },
      zoomExponentMultiplier: 1,
    }
    ctx.touchPointsById.set(1, { sx: 100, sy: 100 })
    ctx.touchPointsById.set(2, { sx: 250, sy: 100 })
    move({ ...eventBase, pointerId: 2, pointerType: 'touch', offsetX: 250, offsetY: 100 } as unknown as PointerEvent)
    if (readCommitCount() !== 0) throw new Error(`expected pinch move to avoid commit, got ${readCommitCount()}`)
    if (!(runtime.transform.k > 1)) throw new Error(`expected pinch move to update live zoom, got k=${runtime.transform.k}`)
    up({ ...eventBase, pointerId: 2, pointerType: 'touch', buttons: 0, offsetX: 250, offsetY: 100 } as unknown as PointerEvent)
    if (readCommitCount() !== 1) throw new Error(`expected pinch pointer end to commit once, got ${readCommitCount()}`)

    counts.commit = 0
    runtime.transform = d3.zoomIdentity.translate(5, 6).scale(1)
    ctx.edgeScroll.update = () => ({ dx: 11, dy: -9 })
    dragRef.current = {
      type: 'node',
      nodeId: 'n1',
      startWorldX: 0,
      startWorldY: 0,
      startNodeX: 0,
      startNodeY: 0,
      clamp: null,
      snapGrid: { enabled: false, size: 24, x: 24, y: 24, grid: [24, 24] },
      helperLinesEnabled: true,
      edgeScrollEnabled: true,
      pointerId: 7,
    }
    move({ ...eventBase, offsetX: 2, offsetY: 3 } as unknown as PointerEvent)
    if (readCommitCount() !== 0) throw new Error(`expected edge-scroll move to avoid commit, got ${readCommitCount()}`)
    if (runtime.transform.x !== 16 || runtime.transform.y !== -3) {
      throw new Error(`expected edge-scroll to update live transform, got ${runtime.transform.x},${runtime.transform.y}`)
    }
  } finally {
    if (originalRequestAnimationFrame) {
      ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = originalRequestAnimationFrame
    }
  }
}
