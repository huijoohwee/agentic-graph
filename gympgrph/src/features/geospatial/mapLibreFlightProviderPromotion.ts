export type MapLibreFlightProviderStyle =
  | string
  | Readonly<Record<string, unknown>>

export type MapLibreFlightProviderStyleApplyScheduler = (
  apply: () => void,
) => () => void

export type MapLibreFlightProviderPromotionResult =
  | 'applied'
  | 'admission-changed'
  | 'identity-changed'
  | 'terminated'

export type MapLibreFlightProviderPromotionState = {
  cancelProviderStyleApply: (() => void) | null
  cancelProviderStyleLoad: (() => void) | null
  disposed: boolean
  generation: number
  map: any
}

const MAPLIBRE_FLIGHT_PROVIDER_PROMOTION_IDLE_TIMEOUT_MS = 1_000

export function cancelMapLibreFlightProviderStyleApply(
  state: MapLibreFlightProviderPromotionState,
): void {
  try {
    state.cancelProviderStyleApply?.()
  } catch {
    void 0
  }
  state.cancelProviderStyleApply = null
}

export function cancelMapLibreFlightProviderStyleLoad(
  state: MapLibreFlightProviderPromotionState,
): void {
  try {
    state.cancelProviderStyleLoad?.()
  } catch {
    void 0
  }
  state.cancelProviderStyleLoad = null
}

export function scheduleMapLibreFlightProviderStyleApply(
  apply: () => void,
): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const requestId = globalThis.requestIdleCallback(apply, {
      timeout: MAPLIBRE_FLIGHT_PROVIDER_PROMOTION_IDLE_TIMEOUT_MS,
    })
    return () => globalThis.cancelIdleCallback(requestId)
  }
  if (typeof globalThis.requestAnimationFrame === 'function') {
    let secondFrame: number | null = null
    const firstFrame = globalThis.requestAnimationFrame(() => {
      secondFrame = globalThis.requestAnimationFrame(apply)
    })
    return () => {
      globalThis.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) globalThis.cancelAnimationFrame(secondFrame)
    }
  }
  const timeout = setTimeout(apply, 0)
  return () => clearTimeout(timeout)
}

function waitForProviderStyleApplyOpportunity(options: Readonly<{
  generation: number
  schedule: MapLibreFlightProviderStyleApplyScheduler
  state: MapLibreFlightProviderPromotionState
}>): Promise<boolean> {
  const { generation, schedule, state } = options
  cancelMapLibreFlightProviderStyleApply(state)
  return new Promise(resolve => {
    let settled = false
    let cancelScheduled: () => void = () => void 0
    const settle = (scheduled: boolean) => {
      if (settled) return
      settled = true
      if (state.cancelProviderStyleApply === cancel) {
        state.cancelProviderStyleApply = null
      }
      resolve(
        scheduled
        && !state.disposed
        && state.generation === generation,
      )
    }
    const cancel = () => {
      cancelScheduled()
      settle(false)
    }
    state.cancelProviderStyleApply = cancel
    cancelScheduled = schedule(() => settle(true))
  })
}

export async function promoteMapLibreFlightProviderStyle(
  options: Readonly<{
    generation: number
    hasExactFlightOverlay: () => boolean
    hasCurrentProviderPresentation: () => boolean
    loadProviderStyle: (
      signal: AbortSignal,
    ) => Promise<MapLibreFlightProviderStyle>
    onApplied: () => void
    onError?: (error: unknown) => void
    retainFlightOverlay: (
      previousStyle: Readonly<Record<string, any>> | undefined,
      nextStyle: Readonly<Record<string, any>>,
    ) => Record<string, any> | null
    retainOverlay: boolean
    scheduleProviderApply: MapLibreFlightProviderStyleApplyScheduler
    state: MapLibreFlightProviderPromotionState
  }>,
): Promise<MapLibreFlightProviderPromotionResult> {
  const {
    generation,
    hasExactFlightOverlay,
    hasCurrentProviderPresentation,
    loadProviderStyle,
    onApplied,
    onError,
    retainFlightOverlay,
    retainOverlay,
    scheduleProviderApply,
    state,
  } = options
  const abortController = new AbortController()
  const cancelLoad = () => abortController.abort()
  cancelMapLibreFlightProviderStyleLoad(state)
  state.cancelProviderStyleLoad = cancelLoad
  try {
    const providerStyle = await loadProviderStyle(abortController.signal)
    if (state.cancelProviderStyleLoad === cancelLoad) {
      state.cancelProviderStyleLoad = null
    }
    if (state.disposed || state.generation !== generation) return 'terminated'
    if (retainOverlay && !hasCurrentProviderPresentation()) {
      return 'identity-changed'
    }
    if (
      retainOverlay
      && !await waitForProviderStyleApplyOpportunity({
        generation,
        schedule: scheduleProviderApply,
        state,
      })
    ) return 'terminated'
    if (retainOverlay && !hasCurrentProviderPresentation()) {
      return 'identity-changed'
    }
    if (retainOverlay && !hasExactFlightOverlay()) {
      return 'admission-changed'
    }
    if (typeof state.map.setStyle !== 'function') {
      return 'admission-changed'
    }
    if (retainOverlay) {
      // URL-backed MapLibre style swaps fetch before transformStyle runs. Build
      // and validate the full provider + Flight style synchronously instead so
      // a later run/phase publication cannot strip either owned source stack.
      if (typeof providerStyle === 'string') {
        return 'admission-changed'
      }
      let previousStyle: Readonly<Record<string, any>> | undefined
      try {
        previousStyle = state.map.getStyle?.()
      } catch {
        previousStyle = undefined
      }
      if (!previousStyle) return 'admission-changed'
      const retainedStyle = retainFlightOverlay(
        previousStyle,
        providerStyle,
      )
      if (!retainedStyle) return 'admission-changed'
      state.map.setStyle(retainedStyle, { diff: true })
    } else {
      state.map.setStyle(providerStyle, { diff: true })
    }
    onApplied()
    return 'applied'
  } catch (error) {
    if (
      !abortController.signal.aborted
      && !state.disposed
      && state.generation === generation
    ) onError?.(error)
    return 'terminated'
  } finally {
    if (state.cancelProviderStyleLoad === cancelLoad) {
      state.cancelProviderStyleLoad = null
    }
  }
}
