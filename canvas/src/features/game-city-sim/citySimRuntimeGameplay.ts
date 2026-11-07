import {
  moveCityGameplayPlayer,
  moveCityGameplayPlayerToCoordinate,
  selectCityGameplayPlayer,
} from './citySimGameplay'
import type { CitySimSnapshot } from './citySimRuntimeState'

type CitySimGameplayDeps = Readonly<{
  guestReadOnlyResult: (operation: string) => CitySimSnapshot
  isGuestReadOnly: () => boolean
  publish: (update: Pick<CitySimSnapshot, 'gameplay'>) => unknown
  publishFailure: (operation: string, code: string, message: string) => CitySimSnapshot
  publishSuccess: (
    operation: string,
    message: string,
    update: Pick<CitySimSnapshot, 'gameplay'>,
  ) => CitySimSnapshot
  readSnapshot: () => CitySimSnapshot
}>

export function createCitySimGameplayCommands({
  guestReadOnlyResult,
  isGuestReadOnly,
  publish,
  publishFailure,
  publishSuccess,
  readSnapshot,
}: CitySimGameplayDeps) {
  function travelCitySimPlayerToPoi(poiId: string): CitySimSnapshot {
    const snapshot = readSnapshot()
    if (isGuestReadOnly()) return guestReadOnlyResult('travel')
    if (!snapshot.active) return publishFailure('travel', 'city-inactive', 'Open City Builder on Geo+XR before moving the player.')
    const moved = moveCityGameplayPlayer(snapshot.city, snapshot.gameplay, poiId)
    if (!moved.state) return publishFailure('travel', 'invalid-destination', moved.error)
    const taskMessage = moved.taskCompleted
      ? `Goal reached. ${moved.state.completedTasks} task${moved.state.completedTasks === 1 ? '' : 's'} completed.`
      : `Player moved to ${poiId}. The current goal remains ${moved.state.taskPoiId}.`
    return publishSuccess('travel', taskMessage, { gameplay: moved.state })
  }

  function setCitySimPlayerSelected(selected: boolean): boolean {
    const snapshot = readSnapshot()
    if (isGuestReadOnly() || !snapshot.active || !snapshot.gameplay) return false
    const gameplay = selectCityGameplayPlayer(snapshot.gameplay, selected)
    if (!gameplay) return false
    if (gameplay !== snapshot.gameplay) publish({ gameplay })
    return true
  }

  function moveCitySimPlayerToCoordinate(coordinate: readonly [longitude: number, latitude: number]): boolean {
    const snapshot = readSnapshot()
    if (isGuestReadOnly() || !snapshot.active || !snapshot.gameplay) return false
    const gameplay = moveCityGameplayPlayerToCoordinate(snapshot.gameplay, coordinate)
    if (!gameplay) return false
    publish({ gameplay })
    return true
  }

  return { moveCitySimPlayerToCoordinate, setCitySimPlayerSelected, travelCitySimPlayerToPoi }
}
