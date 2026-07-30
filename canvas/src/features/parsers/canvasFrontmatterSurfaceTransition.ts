import {
  commitCanvasGeospatialSurfaceOwnership,
  type CanvasGeospatialSurfaceOwnershipOptions,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'

type CanvasFrontmatterSurfaceTransitionQueue = Readonly<{
  request: (
    enabled: boolean,
    options?: CanvasFrontmatterSurfacePresentationOptions,
  ) => Promise<void>
  wait: () => Promise<void>
}>

type CanvasFrontmatterSurfacePresentationOptions = Readonly<{
  afterCommit?: () => boolean | void | Promise<boolean | void>
  isCurrent?: () => boolean
}>

export function createCanvasFrontmatterSurfaceTransitionQueue(
  dependencies: Readonly<{
    commit: (
      enabled: boolean,
      options: CanvasGeospatialSurfaceOwnershipOptions,
    ) => Promise<void>
    isCommitted: (enabled: boolean) => boolean
  }>,
): CanvasFrontmatterSurfaceTransitionQueue {
  let transitionTail = Promise.resolve()
  let requestedMode: boolean | null = null
  let transitionPending = false
  let transitionFailed = false
  let requestedCurrentCheck: (() => boolean) | undefined

  const request = (
    enabled: boolean,
    options: CanvasFrontmatterSurfacePresentationOptions = {},
  ): Promise<void> => {
    if (
      transitionPending
      && requestedMode === enabled
      && requestedCurrentCheck === options.isCurrent
    ) {
      return transitionTail
    }
    if (
      !transitionPending
      && !transitionFailed
      && dependencies.isCommitted(enabled)
    ) {
      requestedMode = enabled
      requestedCurrentCheck = options.isCurrent
      if (options.isCurrent?.() === false) return transitionTail
      const presentation = Promise.resolve(options.afterCommit?.()).then(
        committed => {
          if (committed === false) {
            throw new Error('The requested Canvas surface could not claim ownership.')
          }
        },
      )
      transitionTail = presentation
      return transitionTail
    }

    const precedingTransition = transitionFailed
      ? transitionTail.catch(() => undefined)
      : transitionTail
    requestedMode = enabled
    requestedCurrentCheck = options.isCurrent
    transitionPending = true
    transitionFailed = false
    // Enqueue with the canonical owner immediately. Passing the frontmatter
    // predecessor into that owner preserves cross-owner request order while
    // still failing a genuine predecessor failure closed.
    const requestedTransition = dependencies.commit(enabled, {
      afterCommit: options.afterCommit,
      isCurrent: options.isCurrent,
      waitFor: precedingTransition,
    })
    transitionTail = requestedTransition
    void requestedTransition.then(
      () => {
        if (transitionTail !== requestedTransition) return
        transitionPending = false
        transitionFailed = false
      },
      () => {
        if (transitionTail !== requestedTransition) return
        transitionPending = false
        transitionFailed = true
      },
    )
    return requestedTransition
  }

  return Object.freeze({
    request,
    wait: () => transitionTail,
  })
}

const canvasFrontmatterSurfaceTransitions =
  createCanvasFrontmatterSurfaceTransitionQueue({
    commit: commitCanvasGeospatialSurfaceOwnership,
    // Preference and DOM snapshots cannot prove that the gympgrph owner and
    // active native MapLibre lease agree. Always enter the canonical owner;
    // its runtime check is idempotent and fail-closed.
    isCommitted: () => false,
  })
let canvasFrontmatterSurfaceRequestGeneration = 0
let canvasFrontmatterSurfacePresentationTail: Promise<void> = Promise.resolve()
let canvasFrontmatterSurfacePresentationSettled = true

function trackCanvasFrontmatterSurfacePresentation(
  presentation: Promise<void>,
): void {
  canvasFrontmatterSurfacePresentationTail = presentation
  canvasFrontmatterSurfacePresentationSettled = false
  void presentation.then(
    () => {
      if (canvasFrontmatterSurfacePresentationTail !== presentation) return
      canvasFrontmatterSurfacePresentationSettled = true
    },
    () => {
      if (canvasFrontmatterSurfacePresentationTail !== presentation) return
      canvasFrontmatterSurfacePresentationSettled = true
    },
  )
}

export function beginCanvasFrontmatterSurfaceRequest(): () => boolean {
  const generation = ++canvasFrontmatterSurfaceRequestGeneration
  // A neutral successor has no ownership request of its own. It must still
  // detach from a rejected stale predecessor rather than inheriting that
  // document's failure.
  trackCanvasFrontmatterSurfacePresentation(
    canvasFrontmatterSurfacePresentationTail.catch(() => undefined),
  )
  return () => generation === canvasFrontmatterSurfaceRequestGeneration
}

export function requestCanvasFrontmatterGeospatialSurface(
  enabled: boolean,
  options: CanvasFrontmatterSurfacePresentationOptions = {},
): Promise<void> {
  const transition =
    canvasFrontmatterSurfaceTransitions.request(enabled, options)
  trackCanvasFrontmatterSurfacePresentation(transition)
  // Async document and Flight activation paths await this exact promise. The
  // attached observer prevents a synchronous-only preset caller from creating
  // an unhandled rejection before one of those owners joins the tail.
  void transition.catch(() => undefined)
  return transition
}

export function waitForCanvasFrontmatterSurfaceTransition(): Promise<void> {
  return canvasFrontmatterSurfacePresentationTail
}

/**
 * A Flight open already queued behind an active document handoff must observe
 * that handoff's failure. A later independent retry must not inherit a
 * rejection that has already settled and rolled its owner back.
 */
export function waitForActiveCanvasFrontmatterSurfaceTransition(): Promise<void> {
  return canvasFrontmatterSurfacePresentationSettled
    ? Promise.resolve()
    : canvasFrontmatterSurfacePresentationTail
}
