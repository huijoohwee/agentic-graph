import { parseCityParcelId } from './citySimModel'
import { readCitySimSnapshot } from './citySimRuntimeState'

export type CitySimCameraFocusRequest = Readonly<{
  parcelId: string | null
  revision: number
}>

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: CitySimCameraFocusRequest = Object.freeze({
  parcelId: null,
  revision: 0,
})

function publish(parcelId: string | null): CitySimCameraFocusRequest {
  snapshot = Object.freeze({
    parcelId,
    revision: snapshot.revision + 1,
  })
  for (const listener of [...listeners]) listener()
  return snapshot
}

export function requestCitySimCameraFocus(
  parcelId: string | null,
): CitySimCameraFocusRequest {
  if (parcelId !== null && !parseCityParcelId(parcelId)) {
    throw new Error(`City camera focus parcel ${parcelId || '(empty)'} must use rNNcNN.`)
  }
  if (
    parcelId !== null
    && !readCitySimSnapshot().city.parcels.some(parcel => parcel.id === parcelId)
  ) {
    throw new Error(`City camera focus parcel ${parcelId} is outside the grid.`)
  }
  return publish(parcelId)
}

export function clearCitySimCameraFocusRequest(): CitySimCameraFocusRequest {
  return publish(null)
}

export function readCitySimCameraFocusRequest(): CitySimCameraFocusRequest {
  return snapshot
}

export function subscribeCitySimCameraFocusRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
