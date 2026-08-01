import React from 'react'
import { GameFpsWebglUnsupportedState } from '@/features/game-fps/GameFpsWebglUnsupportedState'
import { FlightSimWebglUnsupportedState } from '@/features/game-flight-sim/FlightSimWebglUnsupportedState'
import { loadFlightSimMissionStage } from './flightSimMissionStageLoader'

const GameFpsMissionStageLazy = React.lazy(() =>
  import('@/features/game-fps/GameFpsMissionStage').then(mod => ({
    default: mod.GameFpsMissionStage,
  })),
)

const FlightSimMissionStageLazy = React.lazy(loadFlightSimMissionStage)

export function ThreeGameplayMissionStage(props: Readonly<{
  coordinateScale: number
  flightSimActive: boolean
  gameFpsActive: boolean
  geospatialComposite: boolean
}>) {
  if (props.gameFpsActive) {
    return <GameFpsMissionStageLazy coordinateScale={props.coordinateScale} />
  }
  if (props.flightSimActive) {
    return (
      <FlightSimMissionStageLazy
        geospatialComposite={props.geospatialComposite}
      />
    )
  }
  return null
}

export function ThreeGameplayWebglUnsupportedState(props: Readonly<{
  flightSimActive: boolean
  gameFpsActive: boolean
}>) {
  if (props.gameFpsActive) return <GameFpsWebglUnsupportedState />
  if (props.flightSimActive) return <FlightSimWebglUnsupportedState />
  return null
}
