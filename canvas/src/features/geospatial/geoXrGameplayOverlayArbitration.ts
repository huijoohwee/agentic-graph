import type { CitySimSnapshot } from '@/features/game-city-sim/citySimRuntimeState'
import type { FlightSimSnapshot } from '@/features/game-flight-sim/flightSimModel'
import type { FlightSimGeospatialOverlay } from '@/features/game-flight-sim/flightSimGeospatialProjection'

export type GeoXrGameplayOverlayPublication = 'city' | 'flight' | 'clear'

export function applyGeoXrGameplayOverlayPublication(
  input: Readonly<{
    city: CitySimSnapshot
    clearOverlay: () => void
    flight: FlightSimSnapshot
    projectCity: (city: CitySimSnapshot) => FlightSimGeospatialOverlay
    projectFlight: (flight: FlightSimSnapshot) => FlightSimGeospatialOverlay
    setOverlay: (overlay: FlightSimGeospatialOverlay) => void
  }>,
): GeoXrGameplayOverlayPublication {
  if (input.flight.active) {
    input.setOverlay(input.projectFlight(input.flight))
    return 'flight'
  }
  if (input.city.active) {
    input.setOverlay(input.projectCity(input.city))
    return 'city'
  }
  input.clearOverlay()
  return 'clear'
}
