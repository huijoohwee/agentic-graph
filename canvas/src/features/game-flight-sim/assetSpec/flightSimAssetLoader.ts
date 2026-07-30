import { inspectGlbBytes } from '@/lib/assets/gltfFormat'
import {
  FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
  readFlightSimAircraftAssetSpec,
  type FlightSimAircraftAssetSpec,
} from './flightSimAssetSpec'
import {
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_HEX,
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_SHA256,
  FLIGHT_SIM_OPTIONAL_BEACON_GLB_SOURCE_PATH,
} from './fallbacks/optionalBeaconGlb.generated'

export const FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID = 'vehicle-airplane' as const
export const FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID = 'optional-beacon' as const
export const FLIGHT_SIM_OPTIONAL_GLB_LICENSE = 'CC0-1.0' as const
export const FLIGHT_SIM_FALLBACK_DIRECTORY =
  'canvas/src/features/game-flight-sim/assetSpec/fallbacks/' as const

export type FlightSimGlbFallbackReference = Readonly<{
  subjectId: string
  path: string
  source: 'committed-local-file'
  opaque: true
  sha256: string
  license: string
}>

export type FlightSimAssetCandidate = Readonly<{
  subjectId: string
  assetSpec?: unknown
  glbFallback?: unknown
}>

export type FlightSimLoadedAsset = Readonly<
  | {
      subjectId: string
      kind: 'asset-spec'
      opaque: false
      assetSpec: FlightSimAircraftAssetSpec
    }
  | {
      subjectId: string
      kind: 'glb-fallback'
      opaque: true
      source: 'committed-local-file'
      path: string
      sha256: string
      license: string
      bytes: Readonly<Uint8Array>
    }
>

export type FlightSimAssetLoadError = Readonly<{
  subjectId: string
  code:
    | 'invalid-asset-spec'
    | 'missing-required-asset-spec'
    | 'invalid-glb-fallback'
    | 'remote-glb-fallback'
    | 'unavailable-glb-fallback'
    | 'invalid-glb-bytes'
  message: string
  path?: string
}>

export type FlightSimAssetLoadReport = Readonly<{
  subjects: readonly string[]
  loaded: readonly FlightSimLoadedAsset[]
  errors: readonly FlightSimAssetLoadError[]
  glbFallbackCount: number
  requiredAircraftGlbFallbackCount: 0
}>

export type FlightSimCommittedLocalAssetReader = (
  sourcePath: string,
) => Readonly<Uint8Array> | null

export const FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK: FlightSimGlbFallbackReference =
  Object.freeze({
    subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
    path: FLIGHT_SIM_OPTIONAL_BEACON_GLB_SOURCE_PATH,
    source: 'committed-local-file',
    opaque: true,
    sha256: FLIGHT_SIM_OPTIONAL_BEACON_GLB_SHA256,
    license: FLIGHT_SIM_OPTIONAL_GLB_LICENSE,
  })

export const FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES: readonly FlightSimAssetCandidate[] =
  Object.freeze([
    Object.freeze({
      subjectId: FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
      assetSpec: FLIGHT_SIM_AIRCRAFT_ASSET_SPEC,
    }),
    Object.freeze({
      subjectId: FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID,
      glbFallback: FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK,
    }),
  ])

function bytesFromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error('Flight Sim bundled GLB bytes are not canonical hexadecimal')
  }
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export const readBundledFlightSimCommittedLocalAsset: FlightSimCommittedLocalAssetReader =
  sourcePath => (
    sourcePath === FLIGHT_SIM_OPTIONAL_BEACON_GLB_SOURCE_PATH
      ? bytesFromHex(FLIGHT_SIM_OPTIONAL_BEACON_GLB_HEX)
      : null
  )

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string`)
  }
  return value
}

function validateFallbackPath(value: unknown): string {
  const sourcePath = requiredString(value, 'Flight Sim GLB fallback path')
  if (/^[a-z][a-z0-9+.-]*:/i.test(sourcePath) || sourcePath.startsWith('//')) {
    throw Object.assign(new Error('remote GLB fallback is not permitted'), {
      code: 'remote-glb-fallback',
    })
  }
  if (
    sourcePath.startsWith('/')
    || sourcePath.includes('\\')
    || sourcePath.split('/').some(segment => segment === '.' || segment === '..' || !segment)
    || !sourcePath.startsWith(FLIGHT_SIM_FALLBACK_DIRECTORY)
  ) {
    throw new Error('GLB fallback must remain under the committed Flight Sim fallback directory')
  }
  return sourcePath
}

function readFallbackReference(
  value: unknown,
  expectedSubjectId: string,
): FlightSimGlbFallbackReference {
  const fallback = record(value, `Flight Sim asset ${expectedSubjectId} GLB fallback`)
  const actualKeys = Object.keys(fallback).sort()
  const expectedKeys = ['license', 'opaque', 'path', 'sha256', 'source', 'subjectId'].sort()
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} GLB fallback has unknown or missing fields`)
  }
  if (fallback.subjectId !== expectedSubjectId) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} GLB fallback identity does not match`)
  }
  if (fallback.source !== 'committed-local-file' || fallback.opaque !== true) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} GLB fallback must be opaque committed-local data`)
  }
  const sourcePath = validateFallbackPath(fallback.path)
  if (expectedSubjectId !== FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} has no admitted GLB fallback`)
  }
  if (sourcePath !== FLIGHT_SIM_OPTIONAL_BEACON_GLB_SOURCE_PATH) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} GLB fallback path is not admitted`)
  }
  if (fallback.license !== FLIGHT_SIM_OPTIONAL_GLB_LICENSE) {
    throw new Error(`Flight Sim asset ${expectedSubjectId} GLB fallback license is not admitted`)
  }
  const sha256 = requiredString(fallback.sha256, 'Flight Sim GLB fallback sha256')
  if (
    !/^[0-9a-f]{64}$/.test(sha256)
    || sha256 !== FLIGHT_SIM_OPTIONAL_BEACON_GLB_SHA256
  ) {
    throw new Error('Flight Sim GLB fallback sha256 does not match its admitted local asset')
  }
  return Object.freeze({
    subjectId: expectedSubjectId,
    path: sourcePath,
    source: 'committed-local-file',
    opaque: true,
    sha256,
    license: FLIGHT_SIM_OPTIONAL_GLB_LICENSE,
  })
}

function errorResult(
  subjectId: string,
  code: FlightSimAssetLoadError['code'],
  message: string,
  sourcePath?: string,
): FlightSimAssetLoadError {
  return Object.freeze({
    subjectId,
    code,
    message: `Flight Sim asset ${subjectId}: ${message}`,
    ...(sourcePath ? { path: sourcePath } : {}),
  })
}

function loadCandidate(
  candidate: FlightSimAssetCandidate,
  readCommittedLocalAsset: FlightSimCommittedLocalAssetReader,
): FlightSimLoadedAsset | FlightSimAssetLoadError {
  const subjectId = requiredString(candidate.subjectId, 'Flight Sim asset subjectId')
  if (Object.hasOwn(candidate, 'assetSpec')) {
    try {
      if (subjectId !== FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID) {
        throw new Error('only the required aircraft owns the current Asset_Spec contract')
      }
      return Object.freeze({
        subjectId,
        kind: 'asset-spec',
        opaque: false,
        assetSpec: readFlightSimAircraftAssetSpec(candidate.assetSpec),
      })
    } catch (error) {
      return errorResult(
        subjectId,
        'invalid-asset-spec',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  if (subjectId === FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID) {
    return errorResult(
      subjectId,
      'missing-required-asset-spec',
      'required aircraft Asset_Spec is unavailable; its GLB fallback is not eligible',
    )
  }
  let fallback: FlightSimGlbFallbackReference
  try {
    fallback = readFallbackReference(candidate.glbFallback, subjectId)
  } catch (error) {
    const code = (error as { code?: string })?.code === 'remote-glb-fallback'
      ? 'remote-glb-fallback'
      : 'invalid-glb-fallback'
    return errorResult(
      subjectId,
      code,
      error instanceof Error ? error.message : String(error),
    )
  }
  let bytes: Readonly<Uint8Array> | null
  try {
    bytes = readCommittedLocalAsset(fallback.path)
  } catch (error) {
    return errorResult(
      subjectId,
      'unavailable-glb-fallback',
      `committed local fallback is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      fallback.path,
    )
  }
  if (!bytes) {
    return errorResult(
      subjectId,
      'unavailable-glb-fallback',
      'committed local fallback is unavailable',
      fallback.path,
    )
  }
  const ownedBytes = Uint8Array.from(bytes)
  const admittedBytes = bytesFromHex(FLIGHT_SIM_OPTIONAL_BEACON_GLB_HEX)
  if (
    ownedBytes.byteLength !== admittedBytes.byteLength
    || ownedBytes.some((byte, index) => byte !== admittedBytes[index])
  ) {
    return errorResult(
      subjectId,
      'invalid-glb-bytes',
      'committed local fallback bytes do not match the admitted SHA-256 asset',
      fallback.path,
    )
  }
  const inspection = inspectGlbBytes(ownedBytes)
  if (
    !inspection.validContainer
    || !inspection.validGltfAsset
    || inspection.externalResourceUris.length !== 0
  ) {
    return errorResult(
      subjectId,
      'invalid-glb-bytes',
      'committed local fallback is not a self-contained valid GLB 2.0 asset',
      fallback.path,
    )
  }
  return Object.freeze({
    subjectId,
    kind: 'glb-fallback',
    opaque: true,
    source: 'committed-local-file',
    path: fallback.path,
    sha256: fallback.sha256,
    license: fallback.license,
    bytes: ownedBytes,
  })
}

export function loadFlightSimAssets(
  candidates: readonly FlightSimAssetCandidate[],
  options: Readonly<{
    readCommittedLocalAsset?: FlightSimCommittedLocalAssetReader
  }> = {},
): FlightSimAssetLoadReport {
  const readCommittedLocalAsset =
    options.readCommittedLocalAsset || readBundledFlightSimCommittedLocalAsset
  const loaded: FlightSimLoadedAsset[] = []
  const errors: FlightSimAssetLoadError[] = []
  for (const candidate of candidates) {
    const result = loadCandidate(candidate, readCommittedLocalAsset)
    if ('code' in result) errors.push(result)
    else loaded.push(result)
  }
  const glbFallbackCount = loaded.filter(asset => asset.kind === 'glb-fallback').length
  return Object.freeze({
    subjects: Object.freeze(candidates.map(candidate => candidate.subjectId)),
    loaded: Object.freeze(loaded),
    errors: Object.freeze(errors),
    glbFallbackCount,
    requiredAircraftGlbFallbackCount: 0,
  })
}
