let flightSimSurfaceLifecycleGeneration = 0
const flightSimSurfaceOpenControllers = new Set<AbortController>()
const flightSimGeospatialBootstrapListeners = new Set<() => void>()
let flightSimGeospatialBootstrapRequestCount = 0

export class FlightSimSurfaceOpenStaleError extends Error {
  constructor() {
    super('Flight Sim surface open was invalidated by a newer lifecycle action')
    this.name = 'FlightSimSurfaceOpenStaleError'
  }
}

class FlightSimSurfaceOpenSettledError extends Error {
  constructor() {
    super('Flight Sim surface open operation settled')
    this.name = 'FlightSimSurfaceOpenSettledError'
  }
}

export type FlightSimSurfaceOpenController = Readonly<{
  controller: AbortController
  detachCallerSignal: () => void
}>

function notifyFlightSimGeospatialBootstrapListeners(): void {
  for (const listener of flightSimGeospatialBootstrapListeners) {
    try {
      listener()
    } catch {
      void 0
    }
  }
}

export function acquireFlightSimGeospatialBootstrapRequest(): () => void {
  flightSimGeospatialBootstrapRequestCount += 1
  if (flightSimGeospatialBootstrapRequestCount === 1) {
    notifyFlightSimGeospatialBootstrapListeners()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    flightSimGeospatialBootstrapRequestCount = Math.max(
      0,
      flightSimGeospatialBootstrapRequestCount - 1,
    )
    if (flightSimGeospatialBootstrapRequestCount === 0) {
      notifyFlightSimGeospatialBootstrapListeners()
    }
  }
}

export function readFlightSimGeospatialBootstrapRequested(): boolean {
  return flightSimGeospatialBootstrapRequestCount > 0
}

export function subscribeFlightSimGeospatialBootstrapRequest(
  listener: () => void,
): () => void {
  flightSimGeospatialBootstrapListeners.add(listener)
  return () => flightSimGeospatialBootstrapListeners.delete(listener)
}

export function readFlightSimSurfaceLifecycleGeneration(): number {
  return flightSimSurfaceLifecycleGeneration
}

export function isFlightSimSurfaceOpenCurrent(
  expectedGeneration: number,
): boolean {
  return expectedGeneration === flightSimSurfaceLifecycleGeneration
}

export function throwIfFlightSimSurfaceOpenStale(
  expectedGeneration: number,
): void {
  if (isFlightSimSurfaceOpenCurrent(expectedGeneration)) return
  throw new FlightSimSurfaceOpenStaleError()
}

export function createFlightSimSurfaceOpenController(
  callerSignal?: AbortSignal,
): FlightSimSurfaceOpenController {
  const controller = new AbortController()
  const handleCallerAbort = () => {
    controller.abort(callerSignal?.reason)
  }
  if (callerSignal?.aborted) handleCallerAbort()
  else callerSignal?.addEventListener('abort', handleCallerAbort, { once: true })
  flightSimSurfaceOpenControllers.add(controller)
  return Object.freeze({
    controller,
    detachCallerSignal: () => {
      callerSignal?.removeEventListener('abort', handleCallerAbort)
    },
  })
}

export function settleFlightSimSurfaceOpenController(
  openController: FlightSimSurfaceOpenController,
): void {
  openController.controller.abort(new FlightSimSurfaceOpenSettledError())
  flightSimSurfaceOpenControllers.delete(openController.controller)
  openController.detachCallerSignal()
}

export function invalidateFlightSimSurfaceOpens(): void {
  flightSimSurfaceLifecycleGeneration += 1
  const reason = new FlightSimSurfaceOpenStaleError()
  for (const controller of [...flightSimSurfaceOpenControllers]) {
    controller.abort(reason)
  }
}
