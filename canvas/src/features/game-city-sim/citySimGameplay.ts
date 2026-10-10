import type { CityGeoGameplayState } from 'gympgrph'
import { deriveRegionalPoiLocators } from 'grph-shared/geospatial/regionalPoiGeo'
import type { CityGrid } from './citySimModel'
import { resolveRegionalPoiProfile } from '@/features/geospatial/regionalPoiProfileCatalog'

export type CityGameplayMoveResult = Readonly<{
  state: CityGeoGameplayState
  taskCompleted: boolean
  error?: never
}> | Readonly<{
  state: null
  taskCompleted: false
  error: string
}>

export function createInitialCityGameplay(
  city: CityGrid,
): CityGeoGameplayState {
  const profile = resolveRegionalPoiProfile(city.regionalPoiProfileId)
  const poiIds = profile.pois.map(poi => poi.id)
  if (poiIds.length < 2) {
    throw new Error('City activity needs at least two POIs for a player and a goal.')
  }
  const player = deriveRegionalPoiLocators(profile)
    .find(locator => locator.poiId === poiIds[0])
  if (!player) throw new Error('City activity needs a geographic player start point.')
  return Object.freeze({
    completedTasks: 0,
    playerCoordinate: player.coordinate,
    playerPoiId: poiIds[0],
    playerSelected: false,
    profileId: profile.id,
    revision: 0,
    taskPoiId: poiIds[1],
  })
}

export function moveCityGameplayPlayer(
  city: CityGrid,
  current: CityGeoGameplayState | null | undefined,
  destinationPoiId: string,
): CityGameplayMoveResult {
  const poiIds = resolveRegionalPoiProfile(city.regionalPoiProfileId)
    .pois
    .map(poi => poi.id)
  if (!poiIds.includes(destinationPoiId)) {
    return Object.freeze({
      error: `Unknown City activity destination ${destinationPoiId || '(empty)'}.`,
      state: null,
      taskCompleted: false,
    })
  }
  const active = current?.profileId === city.regionalPoiProfileId
    ? current
    : createInitialCityGameplay(city)
  if (destinationPoiId === active.playerPoiId) {
    return Object.freeze({ state: active, taskCompleted: false })
  }
  const taskCompleted = destinationPoiId === active.taskPoiId
  const destination = deriveRegionalPoiLocators(resolveRegionalPoiProfile(city.regionalPoiProfileId))
    .find(locator => locator.poiId === destinationPoiId)
  if (!destination) {
    return Object.freeze({
      error: `City activity destination ${destinationPoiId} has no geographic locator.`,
      state: null,
      taskCompleted: false,
    })
  }
  let nextTaskPoiId = active.taskPoiId
  if (taskCompleted) {
    const destinationIndex = poiIds.indexOf(destinationPoiId)
    for (let offset = 1; offset < poiIds.length; offset += 1) {
      const candidate = poiIds[(destinationIndex + offset) % poiIds.length]
      if (candidate !== destinationPoiId) {
        nextTaskPoiId = candidate
        break
      }
    }
  }
  return Object.freeze({
    state: Object.freeze({
      completedTasks: active.completedTasks + Number(taskCompleted),
      playerCoordinate: destination.coordinate,
      playerPoiId: destinationPoiId,
      playerSelected: active.playerSelected ?? false,
      profileId: active.profileId,
      revision: active.revision + 1,
      taskPoiId: nextTaskPoiId,
    }),
    taskCompleted,
  })
}

export function selectCityGameplayPlayer(
  current: CityGeoGameplayState | null | undefined,
  selected: boolean,
): CityGeoGameplayState | null {
  if (!current || current.playerSelected === selected) return current ?? null
  return Object.freeze({
    ...current,
    playerSelected: selected,
    revision: current.revision + 1,
  })
}

export function moveCityGameplayPlayerToCoordinate(
  current: CityGeoGameplayState | null | undefined,
  coordinate: readonly [longitude: number, latitude: number],
): CityGeoGameplayState | null {
  const [longitude, latitude] = coordinate
  if (
    !current
    || current.playerSelected !== true
    || !Number.isFinite(longitude)
    || !Number.isFinite(latitude)
    || longitude < -180
    || longitude > 180
    || latitude < -85
    || latitude > 85
  ) return null
  return Object.freeze({
    ...current,
    playerCoordinate: Object.freeze([longitude, latitude]) as readonly [number, number],
    revision: current.revision + 1,
  })
}
