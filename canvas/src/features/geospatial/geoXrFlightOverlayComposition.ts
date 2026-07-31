import type {
  CityGeoOverlaySnapshot,
  FlightGeoOverlayPresentationOwner,
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
}>): FlightGeoOverlayPresentationOwner {
  if (input.flightActive) return 'flight'
  if (input.cityActive) return 'city'
  return input.flightBootstrapRequested ? 'flight' : null
}

function publishAerialOverlay(input: Readonly<{
  city: CitySimSnapshot
  clearFlightOverlay: () => void
  flight: FlightSimSnapshot
  projectCityAerial: (city: CitySimSnapshot) => FlightSimGeospatialOverlay
  projectFlight: (flight: FlightSimSnapshot) => FlightSimGeospatialOverlay
  setFlightOverlay: (overlay: FlightSimGeospatialOverlay) => void
}>): GeoXrOverlayPublication {
  if (input.flight.active) {
    input.setFlightOverlay(input.projectFlight(input.flight))
    return 'flight'
  }
  if (input.city.active) {
    input.setFlightOverlay(input.projectCityAerial(input.city))
    return 'city'
  }
  input.clearFlightOverlay()
  return 'clear'
}

/**
 * Publishes City parcels and the independent aircraft/route overlay as one
 * ordered handoff. The outgoing owner restores map padding before the incoming
 * owner frames the retained MapLibre map.
 */
export function publishGeoXrOverlayComposition(input: Readonly<{
  city: CitySimSnapshot
  flight: FlightSimSnapshot
  projectCityAerial: (city: CitySimSnapshot) => FlightSimGeospatialOverlay
  projectCityOverlay: (city: CitySimSnapshot) => CityGeoOverlaySnapshot
  projectFlight: (flight: FlightSimSnapshot) => FlightSimGeospatialOverlay
  store: GeoXrOverlayStoreModule
}>): GeoXrOverlayPublication {
  const aerialInput = {
    city: input.city,
    clearFlightOverlay: input.store.clearFlightGeoOverlay,
    flight: input.flight,
    projectCityAerial: input.projectCityAerial,
    projectFlight: input.projectFlight,
    setFlightOverlay: input.store.setFlightGeoOverlay,
  }
  if (input.flight.active) {
    input.store.clearCityGeoOverlay()
    return publishAerialOverlay(aerialInput)
  }
  const publication = publishAerialOverlay(aerialInput)
  input.store.setCityGeoOverlay(input.projectCityOverlay(input.city))
  return publication
}
