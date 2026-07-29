export type FlightGeoOverlayPublisherLease = Readonly<{
  isCurrent: () => boolean
}>

let currentPublisherGeneration = 0

export function claimFlightGeoOverlayPublisherLease(): FlightGeoOverlayPublisherLease {
  const generation = ++currentPublisherGeneration
  return Object.freeze({
    isCurrent: () => generation === currentPublisherGeneration,
  })
}
