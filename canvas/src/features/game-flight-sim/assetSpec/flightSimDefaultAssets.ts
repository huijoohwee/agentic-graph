import {
  FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES,
  FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
  FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  loadFlightSimAssets,
  type FlightSimAssetLoadReport,
  type FlightSimLoadedAsset,
} from './flightSimAssetLoader'

type FlightSimLoadedAircraft = Extract<
  FlightSimLoadedAsset,
  Readonly<{ kind: 'asset-spec' }>
>
type FlightSimLoadedBeacon = Extract<
  FlightSimLoadedAsset,
  Readonly<{ kind: 'glb-fallback' }>
>

export type FlightSimDefaultAssetCatalog = Readonly<{
  report: FlightSimAssetLoadReport
  aircraft: FlightSimLoadedAircraft
  optionalBeacon: FlightSimLoadedBeacon
}>

export function readFlightSimDefaultAssetLoadReport(): FlightSimDefaultAssetCatalog {
  const report = loadFlightSimAssets(FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES)
  const aircraft = report.loaded.find(
    asset => asset.subjectId === FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  )
  const optionalBeacon = report.loaded.find(
    asset => asset.subjectId === FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
  )
  if (
    report.errors.length !== 0
    || report.loaded.length !== 2
    || report.glbFallbackCount !== 1
    || report.requiredAircraftGlbFallbackCount !== 0
    || aircraft?.kind !== 'asset-spec'
    || optionalBeacon?.kind !== 'glb-fallback'
  ) {
    const failures = report.errors.map(error => error.message).join('; ')
    throw new Error(
      `Flight Sim default assets failed closed admission: ${failures || 'incomplete default catalog'}`,
    )
  }
  return Object.freeze({
    report,
    aircraft,
    optionalBeacon,
  })
}
