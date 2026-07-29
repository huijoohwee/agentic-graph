import type {
  MapLibreFlightBootstrapStyleIdentity,
} from './mapLibreFlightBootstrapStyleIdentity.js'

export type MapLibreFlightProviderPresentation = Readonly<{
  phase: 'stopped' | 'ready'
  profileId: string
  readyFrameRequestId: number | null
  revision: string
  runId: number
  tick: number
}>

export type MapLibreFlightBootstrapState = {
  bootstrapApplied: boolean
  bootstrapExpectedStyle: MapLibreFlightBootstrapStyleIdentity | null
  bootstrapGeneration: number
  bootstrapPending: boolean
  bootstrapStyle: Readonly<Record<string, unknown>> | null
  bootstrapSettledListeners: Set<() => void>
  cancelBootstrapStyleLoad: (() => void) | null
  cancelProviderStyleApply: (() => void) | null
  cancelProviderStyleLoad: (() => void) | null
  deadlineFramePresented: boolean
  disposed: boolean
  generation: number
  map: any
  providerPresentation: MapLibreFlightProviderPresentation | null
  queueProviderAdmission: (() => void) | null
  rearmProviderPromotion: (() => void) | null
  removeRenderBinding: (() => void) | null
}

const bootstrapStateByMap =
  new WeakMap<object, MapLibreFlightBootstrapState>()

export function ensureMapLibreFlightBootstrapState(
  map: any,
): MapLibreFlightBootstrapState | null {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) return null
  let state = bootstrapStateByMap.get(map)
  if (!state) {
    state = {
      bootstrapApplied: false,
      bootstrapExpectedStyle: null,
      bootstrapGeneration: 0,
      bootstrapPending: false,
      bootstrapStyle: null,
      bootstrapSettledListeners: new Set(),
      cancelBootstrapStyleLoad: null,
      cancelProviderStyleApply: null,
      cancelProviderStyleLoad: null,
      deadlineFramePresented: false,
      disposed: false,
      generation: 0,
      map,
      providerPresentation: null,
      queueProviderAdmission: null,
      rearmProviderPromotion: null,
      removeRenderBinding: null,
    }
    bootstrapStateByMap.set(map, state)
  }
  return state
}

export function readMapLibreFlightBootstrapState(
  map: any,
): MapLibreFlightBootstrapState | null {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) return null
  return bootstrapStateByMap.get(map) || null
}

export function deleteMapLibreFlightBootstrapState(map: any): void {
  if (!map || (typeof map !== 'object' && typeof map !== 'function')) return
  bootstrapStateByMap.delete(map)
}
