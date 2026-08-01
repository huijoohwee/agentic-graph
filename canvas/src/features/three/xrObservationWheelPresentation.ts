import type {
  XrRegionalPoiSurface,
} from './regionalPoiXrPresentation'

export type XrObservationWheelSupport = Readonly<{
  position: readonly [x: number, y: number, z: number]
  rotationZ: number
  size: readonly [width: number, height: number, depth: number]
}>

export function deriveXrObservationWheelSupports(
  surface: XrRegionalPoiSurface,
): readonly XrObservationWheelSupport[] {
  if (surface.presentation !== 'observation-wheel') {
    throw new TypeError(
      `XR surface ${surface.id} is not an observation wheel`,
    )
  }
  const radius = surface.size[1] * 0.48
  const width = Math.max(0.08, radius * 0.08)
  const depth = Math.max(0.1, surface.size[2] * 0.12)
  const targetY = surface.position[1]
  if (!Number.isFinite(targetY) || targetY <= 0) {
    throw new RangeError(
      `XR observation wheel ${surface.id} must be above ground`,
    )
  }

  return Object.freeze([-1, 1].map(side => {
    const bottomX = side * radius * 0.68
    const topX = side * radius * 0.12
    const deltaX = topX - bottomX
    const height = Math.hypot(deltaX, targetY)
    const rotationZ = Math.atan2(-deltaX, targetY)
    const centerY = height * Math.cos(rotationZ) / 2
      + width * Math.abs(Math.sin(rotationZ)) / 2
    return Object.freeze({
      position: Object.freeze([
        (bottomX + topX) / 2,
        centerY - surface.position[1],
        0,
      ]) as readonly [number, number, number],
      rotationZ,
      size: Object.freeze([width, height, depth]) as readonly [
        number,
        number,
        number,
      ],
    })
  }))
}
