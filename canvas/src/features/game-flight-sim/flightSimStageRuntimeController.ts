import type {
  FlightSimInputPatch,
  FlightSimSnapshot,
  FlightSimSpatialProfile,
} from './flightSimModel'

export type FlightSimStageRuntimeController = Readonly<{
  advanceByFixedStep: () => Promise<FlightSimSnapshot>
  isHydrationPending: () => boolean
  readSnapshot: () => FlightSimSnapshot
  readSpatialProfile: () => FlightSimSpatialProfile
  reportRenderFailure: (error: unknown) => FlightSimSnapshot
  setInput: (patch: FlightSimInputPatch) => FlightSimSnapshot
  stop: () => FlightSimSnapshot
  subscribe: (listener: () => void) => () => void
}>
