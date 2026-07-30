import React from 'react'
import {
  readFlightSimSnapshot,
  subscribeFlightSimSnapshot,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  readGameModeSnapshot,
  subscribeGameModeSnapshot,
} from '@/features/game-fps/gameModeRuntime'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'

export function useCanvasGameplayOverlayState() {
  const gameMode = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    readGameModeSnapshot,
    readGameModeSnapshot,
  )
  const flightSim = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSimSnapshot,
    readFlightSimSnapshot,
  )
  const citySim = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  return {
    gameMode,
    flightSim,
    citySim,
    gameFpsActive: gameMode.active,
    flightSimActive: flightSim.active,
    citySimActive: citySim.active,
  } as const
}
