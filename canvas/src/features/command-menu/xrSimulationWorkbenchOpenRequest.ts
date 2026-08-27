const XR_SIMULATION_WORKBENCH_OPEN_EVENT = 'agenticgraph:xr-simulation-workbench-open'

let xrSimulationWorkbenchOpenRevision = 0

export function requestXrSimulationWorkbenchOpen(): void {
  xrSimulationWorkbenchOpenRevision += 1
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(XR_SIMULATION_WORKBENCH_OPEN_EVENT))
}

export function readXrSimulationWorkbenchOpenRevision(): number {
  return xrSimulationWorkbenchOpenRevision
}

export function subscribeXrSimulationWorkbenchOpenRequest(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(XR_SIMULATION_WORKBENCH_OPEN_EVENT, listener)
  return () => window.removeEventListener(XR_SIMULATION_WORKBENCH_OPEN_EVENT, listener)
}
