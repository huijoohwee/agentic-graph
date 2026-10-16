import type {
  FlightSimSnapshot,
  FlightSimTickInput,
} from './flightSimModel'

export type FlightSimSimulationClock = Readonly<{
  requestStep: () => void
  dispose: () => void
}>

export async function runFlightSimStageSimulationStep(options: Readonly<{
  input: FlightSimTickInput
  stageInput: (input: FlightSimTickInput) => FlightSimSnapshot
  advanceFixedStep: () => Promise<FlightSimSnapshot>
}>): Promise<FlightSimSnapshot> {
  const staged = options.stageInput(options.input)
  if (
    staged.runtimeError
    || (staged.phase !== 'ready' && staged.phase !== 'flying')
  ) {
    return staged
  }
  return options.advanceFixedStep()
}

export function createFlightSimSimulationClock(options: Readonly<{
  runStep: () => Promise<void>
  onStepError: (error: unknown) => void
  minimumStepIntervalMs: number
  readMinimumStepIntervalMs?: () => number
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => unknown
  cancelScheduled?: (handle: unknown) => void
}>): FlightSimSimulationClock {
  if (!Number.isFinite(options.minimumStepIntervalMs) || options.minimumStepIntervalMs < 0) {
    throw new Error('Flight Sim clock interval must be a non-negative finite number')
  }
  const now = options.now || (() => (typeof performance === 'undefined' ? Date.now() : performance.now()))
  const schedule = options.schedule || ((callback: () => void, delayMs: number) => (
    globalThis.setTimeout(callback, delayMs)
  ))
  const cancelScheduled = options.cancelScheduled || ((handle: unknown) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  })
  let disposed = false
  let running = false
  let requested = false
  let scheduled: Readonly<{ handle: unknown; dueAt: number }> | null = null
  let lastStartedAt = Number.NEGATIVE_INFINITY

  const drain = () => {
    if (disposed || running || !requested) return
    let minimumStepIntervalMs: number
    try {
      minimumStepIntervalMs = options.readMinimumStepIntervalMs?.() ?? options.minimumStepIntervalMs
      if (!Number.isFinite(minimumStepIntervalMs) || minimumStepIntervalMs < 0) {
        throw new Error('Flight Sim clock interval must be a non-negative finite number')
      }
    } catch (error) {
      requested = false
      options.onStepError(error)
      return
    }
    const dueAt = lastStartedAt + minimumStepIntervalMs
    const delayMs = Math.max(0, dueAt - now())
    if (scheduled) {
      if (delayMs > 0 && scheduled.dueAt === dueAt) return
      cancelScheduled(scheduled.handle)
      scheduled = null
    }
    if (delayMs > 0) {
      const pending = { handle: undefined as unknown, dueAt }
      pending.handle = schedule(() => {
        if (scheduled !== pending) return
        scheduled = null
        drain()
      }, delayMs)
      scheduled = pending
      return
    }
    requested = false
    running = true
    lastStartedAt = now()
    void Promise.resolve()
      .then(() => { if (!disposed) return options.runStep() })
      .catch(error => {
        if (!disposed) options.onStepError(error)
      })
      .finally(() => {
        running = false
        drain()
      })
  }
  return Object.freeze({
    requestStep() {
      if (disposed) return
      requested = true
      drain()
    },
    dispose() {
      disposed = true
      requested = false
      if (scheduled) cancelScheduled(scheduled.handle)
      scheduled = null
    },
  })
}
