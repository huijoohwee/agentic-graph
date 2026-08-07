import { clampSpatialInputAxis } from './filter.js'

export interface SpatialInputAxes {
  readonly pitch: number
  readonly roll: number
  readonly yaw: number
  readonly throttleDelta: number
}

export type SpatialInputPatch = Partial<SpatialInputAxes>
export type SpatialInputAxis = keyof SpatialInputAxes

export class SpatialInputError extends TypeError {
  readonly code = 'nonFiniteControl'

  constructor(
    readonly axis: SpatialInputAxis,
    readonly sourceIndex: number,
  ) {
    super(`Spatial input ${axis} from source ${sourceIndex} must be finite.`)
    this.name = 'SpatialInputError'
  }
}

export const NEUTRAL_SPATIAL_INPUT: SpatialInputAxes = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleDelta: 0,
})

export function arbitrateSpatialInputAxis(
  values: readonly unknown[],
  axis: SpatialInputAxis = 'pitch',
): number {
  let selected = 0
  for (const [sourceIndex, value] of values.entries()) {
    if (value === null || value === undefined) continue
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) throw new SpatialInputError(axis, sourceIndex)
    const candidate = clampSpatialInputAxis(numeric)
    if (Math.abs(candidate) > Math.abs(selected)) selected = candidate
  }
  return selected
}

export function arbitrateSpatialInput(
  inputs: readonly (SpatialInputPatch | null | undefined)[],
): SpatialInputAxes {
  return Object.freeze({
    pitch: arbitrateSpatialInputAxis(inputs.map(input => input?.pitch), 'pitch'),
    roll: arbitrateSpatialInputAxis(inputs.map(input => input?.roll), 'roll'),
    yaw: arbitrateSpatialInputAxis(inputs.map(input => input?.yaw), 'yaw'),
    throttleDelta: arbitrateSpatialInputAxis(
      inputs.map(input => input?.throttleDelta),
      'throttleDelta',
    ),
  })
}

/**
 * Preserves invalid numeric input so the canonical flight-frame validator can
 * report it and retain the last valid frame instead of silently neutralizing it.
 */
export function mergeFlightSimInputs(inputs: readonly SpatialInputPatch[]): SpatialInputAxes {
  const selectLargestMagnitude = (values: readonly (number | undefined)[]): number => (
    values.reduce<number>((selected, candidateValue) => {
      const candidate = Number(candidateValue ?? 0)
      if (Number.isNaN(candidate)) return candidate
      return Math.abs(candidate) > Math.abs(selected) ? candidate : selected
    }, 0)
  )
  return Object.freeze({
    pitch: selectLargestMagnitude(inputs.map(input => input.pitch)),
    roll: selectLargestMagnitude(inputs.map(input => input.roll)),
    yaw: selectLargestMagnitude(inputs.map(input => input.yaw)),
    throttleDelta: selectLargestMagnitude(inputs.map(input => input.throttleDelta)),
  })
}
