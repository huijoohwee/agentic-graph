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

type SurfaceFields = 'active' | 'webglSupported' | 'surfaceMode'
type GameSurface = Pick<ReturnType<typeof readGameModeSnapshot>, SurfaceFields>
type FlightSurface = Pick<ReturnType<typeof readFlightSimSnapshot>, SurfaceFields>
type CitySnapshot = ReturnType<typeof readCitySimSnapshot>
type CitySurface = Pick<CitySnapshot, 'active'> & {
  lastResult: Pick<NonNullable<CitySnapshot['lastResult']>, 'operation'> | null
}
let gameSurface: GameSurface | undefined
let flightSurface: FlightSurface | undefined
let citySurface: CitySurface | undefined

// Shared canvas hosts own surface admission. Frame/HUD owners subscribe to the
// full runtime independently; pose, tick, and cost publications must not rebuild
// the viewport. Stable projections also satisfy useSyncExternalStore's identity contract.
function readGameSurface(): GameSurface {
  const next = readGameModeSnapshot()
  if (!gameSurface || gameSurface.active !== next.active || gameSurface.webglSupported !== next.webglSupported
    || gameSurface.surfaceMode !== next.surfaceMode) {
    gameSurface = { active: next.active, webglSupported: next.webglSupported, surfaceMode: next.surfaceMode }
  }
  return gameSurface
}

function readFlightSurface(): FlightSurface {
  const next = readFlightSimSnapshot()
  if (!flightSurface || flightSurface.active !== next.active || flightSurface.webglSupported !== next.webglSupported
    || flightSurface.surfaceMode !== next.surfaceMode) {
    flightSurface = { active: next.active, webglSupported: next.webglSupported, surfaceMode: next.surfaceMode }
  }
  return flightSurface
}

function readCitySurface(): CitySurface {
  const next = readCitySimSnapshot()
  if (!citySurface || citySurface.active !== next.active || citySurface.lastResult?.operation !== next.lastResult?.operation) {
    citySurface = { active: next.active, lastResult: next.lastResult ? { operation: next.lastResult.operation } : null }
  }
  return citySurface
}

export function useCanvasGameplayOverlayState() {
  const gameMode = React.useSyncExternalStore(
    subscribeGameModeSnapshot,
    readGameSurface,
    readGameSurface,
  )
  const flightSim = React.useSyncExternalStore(
    subscribeFlightSimSnapshot,
    readFlightSurface,
    readFlightSurface,
  )
  const citySim = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySurface,
    readCitySurface,
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
