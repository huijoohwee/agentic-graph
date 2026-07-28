import type { ComponentType } from 'react'

type FlightSimHudLazyModule = Readonly<{
  default: ComponentType
}>

let hudModulePromise: Promise<FlightSimHudLazyModule> | null = null

export function loadFlightSimHud(): Promise<FlightSimHudLazyModule> {
  if (hudModulePromise) return hudModulePromise
  const requestedPromise = import('./FlightSimHud')
    .then(module => Object.freeze({ default: module.FlightSimHud }))
  hudModulePromise = requestedPromise
  void requestedPromise.catch(() => {
    if (hudModulePromise === requestedPromise) hudModulePromise = null
  })
  return requestedPromise
}

export async function preloadFlightSimHud(): Promise<void> {
  await loadFlightSimHud()
}
