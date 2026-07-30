import React from 'react'
import { GameFpsWebglUnsupportedState } from '@/features/game-fps/GameFpsWebglUnsupportedState'
import { FlightSimWebglUnsupportedState } from '@/features/game-flight-sim/FlightSimWebglUnsupportedState'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import {
  enqueueCityInput,
  type CityInputSource,
} from '@/features/game-city-sim/citySimInputRuntime'
import { loadFlightSimMissionStage } from './flightSimMissionStageLoader'

const GameFpsMissionStageLazy = React.lazy(() =>
  import('@/features/game-fps/GameFpsMissionStage').then(mod => ({
    default: mod.GameFpsMissionStage,
  })),
)

const FlightSimMissionStageLazy = React.lazy(loadFlightSimMissionStage)
const CitySimStageLazy = React.lazy(() =>
  import('@/features/game-city-sim/CitySimStage').then(mod => ({
    default: mod.CitySimStage,
  })),
)

function CitySimMissionStage() {
  const snapshot = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  const selectParcel = React.useCallback((
    parcelId: string,
    source: CityInputSource,
  ) => {
    enqueueCityInput({
      source,
      selectParcelId: parcelId,
      requestedZone: null,
    })
  }, [])
  return (
    <CitySimStageLazy
      active={snapshot.active}
      columns={snapshot.city.columns}
      onSelectParcel={selectParcel}
      parcels={snapshot.city.parcels}
      rows={snapshot.city.rows}
      selectedParcelId={snapshot.selectedParcelId}
    />
  )
}

export function ThreeGameplayMissionStage(props: Readonly<{
  citySimActive: boolean
  coordinateScale: number
  flightSimActive: boolean
  gameFpsActive: boolean
  geospatialComposite: boolean
}>) {
  // The City grid has local coordinates, so Geo+XR leaves geographic visuals to
  // MapLibre and its existing Flight overlay rather than painting it above them.
  if (props.citySimActive && !props.geospatialComposite) {
    return <CitySimMissionStage />
  }
  if (props.gameFpsActive) {
    return <GameFpsMissionStageLazy coordinateScale={props.coordinateScale} />
  }
  if (props.flightSimActive) {
    return (
      <FlightSimMissionStageLazy
        actorsVisible={!props.geospatialComposite}
        coordinateScale={props.coordinateScale}
      />
    )
  }
  return null
}

export function ThreeGameplayWebglUnsupportedState(props: Readonly<{
  citySimActive: boolean
  flightSimActive: boolean
  gameFpsActive: boolean
}>) {
  if (props.citySimActive) {
    return (
      <section
        className="absolute inset-0 grid place-items-center p-4 text-center"
        data-kg-city-sim-webgl-unsupported="1"
        role="status"
      >
        City Simulation requires WebGL on the shared Canvas.
      </section>
    )
  }
  if (props.gameFpsActive) return <GameFpsWebglUnsupportedState />
  if (props.flightSimActive) return <FlightSimWebglUnsupportedState />
  return null
}
