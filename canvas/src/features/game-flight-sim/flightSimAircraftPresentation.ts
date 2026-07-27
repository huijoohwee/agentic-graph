import type { SpatialVector } from '@/features/physics/spatialPhysicsTypes'

export const FLIGHT_SIM_AIRCRAFT_ORIENTATION_NODE =
  'kg_flight_sim_aircraft_model_orientation' as const

export const FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD = Object.freeze([
  0,
  -1,
  0,
] as const) as SpatialVector

export const FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION = Object.freeze([
  -Math.PI / 2,
  0,
  Math.PI,
] as const)

export const FLIGHT_SIM_AIRCRAFT_FORWARD = Object.freeze([
  0,
  0,
  -1,
] as const) as SpatialVector
