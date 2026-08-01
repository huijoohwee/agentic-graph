import type {
  CityGeoOverlaySnapshot,
  GeospatialPresentationCameraOwner,
} from 'gympgrph'
import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import type { FlightSimSnapshot } from '@/features/game-flight-sim/flightSimModel'
import type { FlightSimGeospatialOverlay } from '@/features/game-flight-sim/flightSimGeospatialProjection'

export type GeoXrOverlayPublication = 'city' | 'flight' | 'clear'

export type GeoXrOverlayStoreModule = Readonly<{
  clearCityGeoOverlay: () => void
  clearFlightGeoOverlay: () => void
  setCityGeoOverlay: (overlay: CityGeoOverlaySnapshot) => void
  setFlightGeoOverlay: (overlay: FlightSimGeospatialOverlay) => void
}>

export function resolveGeoXrGameplayPresentationOwner(input: Readonly<{
  cityActive: boolean
  flightActive: boolean
  flightBootstrapRequested: boolean
}>): GeospatialPresentationCameraOwner {
  if (input.flightActive) return 'flight'
  if (input.cityActive) return 'city'
  return input.flightBootstrapRequested ? 'flight' : null
}

function publishFlightOverlay(input: Readonly<{
  clearFlightOverlay: () => void
  flight: FlightSimSnapshot
  projectFlight: (flight: FlightSimSnapshot) => FlightSimGeospatialOverlay
  setFlightOverlay: (overlay: FlightSimGeospatialOverlay) => void
}>): GeoXrOverlayPublication {
  if (input.flight.active) {
    input.setFlightOverlay(input.projectFlight(input.flight))
    return 'flight'
  }
  input.clearFlightOverlay()
  return 'clear'
}

/** Publishes exactly one gameplay overlay branch; City always clears Flight. */
export function publishGeoXrOverlayComposition(input: Readonly<{
  city: CitySimSnapshot
  flight: FlightSimSnapshot
  projectCityOverlay: (city: CitySimSnapshot) => CityGeoOverlaySnapshot
  projectFlight: (flight: FlightSimSnapshot) => FlightSimGeospatialOverlay
  store: GeoXrOverlayStoreModule
}>): GeoXrOverlayPublication {
  const flightInput = {
    clearFlightOverlay: input.store.clearFlightGeoOverlay,
    flight: input.flight,
    projectFlight: input.projectFlight,
    setFlightOverlay: input.store.setFlightGeoOverlay,
  }
  if (input.flight.active) {
    input.store.clearCityGeoOverlay()
    return publishFlightOverlay(flightInput)
  }
  publishFlightOverlay(flightInput)
  input.store.setCityGeoOverlay(input.projectCityOverlay(input.city))
  return input.city.active ? 'city' : 'clear'
}
