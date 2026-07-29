import type { TensorDetails } from '@litertjs/core'

export const sigmoid = (value: number): number => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, value))))
export const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
export const shapeElements = (details: TensorDetails): number => Array.from(details.shape).reduce((product, value) => product * value, 1)
export const shapeMatches = (details: TensorDetails, expected: readonly number[]): boolean => {
  const actual = Array.from(details.shape)
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}
export function valuesAreFinite(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) if (!Number.isFinite(values[index])) return false
  return true
}
