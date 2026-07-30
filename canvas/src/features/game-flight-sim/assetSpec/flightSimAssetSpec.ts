import { resolveXrSceneLibraryAsset } from '@/features/three/xrSceneLibrary'
import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'
import sourceSpec from './vehicle-airplane.scene.json'

export const FLIGHT_SIM_ASSET_SPEC_SCHEMA = 'knowgrph.img2threejs-scene/v1' as const

export type FlightSimAircraftAssetSpec = Readonly<{
  schema: typeof FLIGHT_SIM_ASSET_SPEC_SCHEMA
  id: 'vehicle-airplane'
  label: string
  representation: 'typescript-json'
  renderer: 'xr-procedural-vehicle'
  shape: 'airplane'
  dimensionsMeters: SpatialVector
  collisionHalfSizeMeters: SpatialVector
  defaultColor: string
  opaqueBinaryFallback: null
  runtimeModelCalls: 0
  runtimeNetworkCalls: 0
}>

const EXPECTED_KEYS = Object.freeze([
  'schema',
  'id',
  'label',
  'representation',
  'renderer',
  'shape',
  'dimensionsMeters',
  'collisionHalfSizeMeters',
  'defaultColor',
  'opaqueBinaryFallback',
  'runtimeModelCalls',
  'runtimeNetworkCalls',
])

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Flight Sim asset spec must be an object')
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>): void {
  const actual = Object.keys(value).sort()
  const expected = [...EXPECTED_KEYS].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`Flight Sim asset spec must contain exactly ${expected.join(', ')}`)
  }
}

function vector(value: unknown, label: string): SpatialVector {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain three numbers`)
  const numbers = value.map(Number)
  if (numbers.some(item => !Number.isFinite(item) || item <= 0 || item > 100)) {
    throw new Error(`${label} must contain bounded positive finite numbers`)
  }
  return Object.freeze(numbers) as unknown as SpatialVector
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string`)
  }
  return value
}

export function readFlightSimAircraftAssetSpec(value: unknown): FlightSimAircraftAssetSpec {
  const source = record(value)
  exactKeys(source)
  if (source.schema !== FLIGHT_SIM_ASSET_SPEC_SCHEMA) throw new Error('Flight Sim asset spec schema is unsupported')
  if (source.id !== 'vehicle-airplane') throw new Error('Flight Sim asset spec must own vehicle-airplane')
  if (source.representation !== 'typescript-json') throw new Error('Flight Sim asset must use the TypeScript + JSON representation')
  if (source.renderer !== 'xr-procedural-vehicle' || source.shape !== 'airplane') {
    throw new Error('Flight Sim aircraft must use the in-repo procedural airplane renderer')
  }
  if (source.opaqueBinaryFallback !== null) throw new Error('Flight Sim Must-scope aircraft has no opaque binary fallback')
  if (source.runtimeModelCalls !== 0 || source.runtimeNetworkCalls !== 0) {
    throw new Error('Flight Sim asset loading must remain model-free and network-free')
  }
  const dimensionsMeters = vector(source.dimensionsMeters, 'Flight Sim aircraft dimensions')
  const collisionHalfSizeMeters = vector(source.collisionHalfSizeMeters, 'Flight Sim collision half-size')
  const catalogAsset = resolveXrSceneLibraryAsset('vehicle-airplane')
  if (catalogAsset.id !== source.id || catalogAsset.shape !== source.shape) {
    throw new Error('Flight Sim aircraft spec conflicts with the canonical XR scene-library identity')
  }
  return Object.freeze({
    schema: FLIGHT_SIM_ASSET_SPEC_SCHEMA,
    id: 'vehicle-airplane',
    label: requiredString(source.label, 'Flight Sim asset label'),
    representation: 'typescript-json',
    renderer: 'xr-procedural-vehicle',
    shape: 'airplane',
    dimensionsMeters,
    collisionHalfSizeMeters,
    defaultColor: requiredString(source.defaultColor, 'Flight Sim asset color'),
    opaqueBinaryFallback: null,
    runtimeModelCalls: 0,
    runtimeNetworkCalls: 0,
  })
}

export const FLIGHT_SIM_AIRCRAFT_ASSET_SPEC = readFlightSimAircraftAssetSpec(sourceSpec)
export const FLIGHT_SIM_REQUIRED_AIRCRAFT_GLB_FALLBACK_COUNT = 0
