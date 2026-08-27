import type * as d3 from 'd3'

const AG_REFREEZE_CANCEL_KEY = '__kgRefreezeCancel'

const raf =
  typeof (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'function'
    ? (globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => number }).requestAnimationFrame
    : ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number)

export const cancelPendingRefreeze = (svgEl?: SVGSVGElement | null) => {
  const any = svgEl as unknown as { [AG_REFREEZE_CANCEL_KEY]?: unknown }
  const cancel = any?.[AG_REFREEZE_CANCEL_KEY]
  if (typeof cancel === 'function') {
    try {
      ;(cancel as () => void)()
    } catch {
      void 0
    }
  }
  if (any && AG_REFREEZE_CANCEL_KEY in any) {
    try {
      any[AG_REFREEZE_CANCEL_KEY] = null
    } catch {
      void 0
    }
  }
}

export const scheduleSimulationRefreezeAfterDrag = (args: {
  simulation: d3.Simulation<unknown, d3.SimulationLinkDatum<unknown>>
  svgEl?: SVGSVGElement | null
  maxMs?: number
  alphaBelow?: number
}) => {
  const svgEl = args.svgEl
  if (!svgEl) return
  cancelPendingRefreeze(svgEl)

  let cancelled = false
  const startedAt = Date.now()
  const maxMs = typeof args.maxMs === 'number' && Number.isFinite(args.maxMs) ? Math.max(0, Math.floor(args.maxMs)) : 2500
  const alphaBelow =
    typeof args.alphaBelow === 'number' && Number.isFinite(args.alphaBelow) ? Math.max(0, Math.min(1, args.alphaBelow)) : 0.03

  const setFrozen = () => {
    try {
      svgEl.setAttribute('data-kg-layout-frozen', '1')
    } catch {
      void 0
    }
  }

  const stopSim = () => {
    try {
      args.simulation.alphaTarget(0)
    } catch {
      void 0
    }
    try {
      args.simulation.stop()
    } catch {
      void 0
    }
  }

  const step = () => {
    if (cancelled) return
    const now = Date.now()
    const elapsed = now - startedAt
    const alpha = (() => {
      try {
        const a = (args.simulation as unknown as { alpha?: () => number }).alpha?.()
        return typeof a === 'number' && Number.isFinite(a) ? a : 0
      } catch {
        return 0
      }
    })()
    if (alpha <= alphaBelow || elapsed >= maxMs) {
      setFrozen()
      stopSim()
      return
    }
    raf(step)
  }

  raf(step)
  ;(svgEl as unknown as { [AG_REFREEZE_CANCEL_KEY]?: unknown })[AG_REFREEZE_CANCEL_KEY] = () => {
    cancelled = true
  }
}
