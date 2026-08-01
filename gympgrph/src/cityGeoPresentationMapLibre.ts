import {
  createCityGeoOverlaySnapshot,
  type CityGeoOverlaySnapshot,
  type CityGeoParcelState,
} from './cityGeoOverlay.js'
import {
  REGIONAL_POI_PRESENTATION_STATE_KEYS,
  REGIONAL_POI_SOURCE_ID,
} from './regionalPoiMapLibre.js'

export type CityGeoPresentationFeatureState = Readonly<{
  kgRegionalPoiPresentationFillColor: string
  kgRegionalPoiPresentationOutlineColor: string
  kgRegionalPoiPresentationSelected: boolean
  kgRegionalPoiPresentationSelectedOutlineColor: string
  kgRegionalPoiPresentationVariant: CityGeoParcelState['zone']
}>

export type CityGeoPresentationStateEntry = Readonly<{
  featureId: string
  poiId: string
  state: CityGeoPresentationFeatureState
}>

type AppliedPresentation = Readonly<{
  key: string
  featureIds: readonly string[]
  source: unknown
}>

const appliedPresentations = new WeakMap<object, AppliedPresentation>()
const stateKeys = Object.freeze(
  Object.values(REGIONAL_POI_PRESENTATION_STATE_KEYS),
)

function stateForParcel(
  snapshot: CityGeoOverlaySnapshot & Readonly<{
    profile: NonNullable<CityGeoOverlaySnapshot['profile']>
  }>,
  parcel: CityGeoParcelState,
): CityGeoPresentationFeatureState {
  const style = snapshot.profile.zoneStyles[parcel.zone]
  return Object.freeze({
    kgRegionalPoiPresentationFillColor: style.fillColor,
    kgRegionalPoiPresentationOutlineColor: style.outlineColor,
    kgRegionalPoiPresentationSelected:
      snapshot.selectedParcelId === parcel.id,
    kgRegionalPoiPresentationSelectedOutlineColor:
      snapshot.profile.selectedOutlineColor,
    kgRegionalPoiPresentationVariant: parcel.zone,
  })
}

export function cityGeoPresentationStateEntries(
  input: CityGeoOverlaySnapshot,
): readonly CityGeoPresentationStateEntry[] {
  const snapshot = createCityGeoOverlaySnapshot(input)
  if (!snapshot.active || !snapshot.profile) return Object.freeze([])
  const parcelById = new Map(snapshot.parcels.map(parcel => [parcel.id, parcel]))
  const validated = snapshot as CityGeoOverlaySnapshot & Readonly<{
    profile: NonNullable<CityGeoOverlaySnapshot['profile']>
  }>
  const stateByPoi = new Map([...parcelById].map(([poiId, parcel]) => [
    poiId,
    stateForParcel(validated, parcel),
  ]))
  return Object.freeze(snapshot.profile.regionalPoiProfile.surfaces.map(surface => (
    Object.freeze({
      featureId: `${snapshot.profile!.regionalPoiProfile.id}:${surface.id}`,
      poiId: surface.poiId,
      state: stateByPoi.get(surface.poiId)!,
    })
  )))
}

function presentationKey(entries: readonly CityGeoPresentationStateEntry[]): string {
  return entries.map(entry => [
    entry.featureId,
    entry.state.kgRegionalPoiPresentationVariant,
    entry.state.kgRegionalPoiPresentationSelected ? 'selected' : 'idle',
    entry.state.kgRegionalPoiPresentationFillColor,
    entry.state.kgRegionalPoiPresentationOutlineColor,
    entry.state.kgRegionalPoiPresentationSelectedOutlineColor,
  ].join(':')).join('|')
}

function removeOwnedFeatureState(map: any, featureId: string): boolean {
  if (typeof map?.removeFeatureState !== 'function') return false
  try {
    for (const key of stateKeys) {
      map.removeFeatureState({ source: REGIONAL_POI_SOURCE_ID, id: featureId }, key)
    }
    return true
  } catch {
    return !map?.getSource?.(REGIONAL_POI_SOURCE_ID)
  }
}

export function clearCityGeoPresentationFromMap(map: any): boolean {
  if (!map || typeof map !== 'object') return false
  const applied = appliedPresentations.get(map)
  if (!applied) return true
  let cleared = true
  for (const featureId of applied.featureIds) {
    if (!removeOwnedFeatureState(map, featureId)) cleared = false
  }
  appliedPresentations.delete(map)
  return cleared
}

function hasExpectedState(
  map: any,
  entry: CityGeoPresentationStateEntry,
): boolean {
  if (typeof map?.getFeatureState !== 'function') return false
  const live = map.getFeatureState({
    source: REGIONAL_POI_SOURCE_ID,
    id: entry.featureId,
  })
  return stateKeys.every(key => Object.is(live?.[key], entry.state[key]))
}

export function mapHasExactCityGeoPresentation(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
): boolean {
  try {
    const entries = cityGeoPresentationStateEntries(snapshot)
    if (!snapshot.active) return !appliedPresentations.has(map)
    return Boolean(map?.getSource?.(REGIONAL_POI_SOURCE_ID))
      && entries.every(entry => hasExpectedState(map, entry))
  } catch {
    return false
  }
}

export function applyCityGeoPresentationToMap(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
): boolean {
  if (!map || typeof map !== 'object') return false
  if (!snapshot.active) return clearCityGeoPresentationFromMap(map)
  const source = map.getSource?.(REGIONAL_POI_SOURCE_ID)
  if (!source || typeof map.setFeatureState !== 'function') return false
  let attemptedFeatureIds: readonly string[] = Object.freeze([])
  try {
    const entries = cityGeoPresentationStateEntries(snapshot)
    attemptedFeatureIds = Object.freeze(entries.map(entry => entry.featureId))
    const key = presentationKey(entries)
    const applied = appliedPresentations.get(map)
    if (
      applied?.key === key
      && applied.source === source
      && entries.every(entry => hasExpectedState(map, entry))
    ) return true
    if (applied && !clearCityGeoPresentationFromMap(map)) return false
    for (const entry of entries) {
      map.setFeatureState(
        { source: REGIONAL_POI_SOURCE_ID, id: entry.featureId },
        entry.state,
      )
    }
    appliedPresentations.set(map, Object.freeze({
      featureIds: Object.freeze(entries.map(entry => entry.featureId)),
      key,
      source,
    }))
    return entries.every(entry => hasExpectedState(map, entry))
  } catch (error) {
    for (const featureId of attemptedFeatureIds) {
      removeOwnedFeatureState(map, featureId)
    }
    appliedPresentations.delete(map)
    console.error('[kg-city] MapLibre regional POI presentation failed.', error)
    return false
  }
}
