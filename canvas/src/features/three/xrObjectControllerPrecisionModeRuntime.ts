import {
  applyXrSharedObjectControllerMotion as applySharedMotion,
  resolveXrSharedObjectControllerMotionTarget as resolveSharedMotionTarget,
  type XrSharedObjectControllerMotionTarget,
  type XrSharedObjectControllerMotionResult,
} from './xrSharedAssetControlRuntime'
import { createXrNativeControllerInput, type XrNativeControllerInput } from './xrNativeControllerInput'
import type { XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntime'

export const XR_OBJECT_CONTROLLER_PRECISION_MODES = Object.freeze(['gesture', 'fine', 'standard'] as const)
export type XrObjectControllerPrecisionMode = typeof XR_OBJECT_CONTROLLER_PRECISION_MODES[number]

type RuntimeListener = () => void
const listeners = new Set<RuntimeListener>()
let precisionMode: XrObjectControllerPrecisionMode = 'gesture'

export function readXrSharedObjectControllerPrecisionMode(): XrObjectControllerPrecisionMode {
  return precisionMode
}

export function subscribeXrSharedObjectControllerPrecisionMode(listener: RuntimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setXrSharedObjectControllerPrecisionMode(value: unknown): boolean {
  if (typeof value !== 'string' || !XR_OBJECT_CONTROLLER_PRECISION_MODES.includes(value as XrObjectControllerPrecisionMode)) return false
  const next = value as XrObjectControllerPrecisionMode
  if (next === precisionMode) return true
  precisionMode = next
  for (const listener of [...listeners]) listener()
  return true
}

export function applyXrObjectControllerPrecisionMode(input: XrNativeControllerInput): XrNativeControllerInput {
  return precisionMode === 'gesture'
    ? input
    : createXrNativeControllerInput({ ...input, modifier: precisionMode === 'fine' })
}

export function resolveXrSharedObjectControllerMotionTarget(input: Readonly<{
  controllerInput: XrNativeControllerInput
  deltaSeconds: number
  runtime: XrMotionReferenceRuntimeSnapshot
}>): XrSharedObjectControllerMotionTarget | null {
  return resolveSharedMotionTarget({ ...input, controllerInput: applyXrObjectControllerPrecisionMode(input.controllerInput) })
}

export function applyXrSharedObjectControllerMotion(input: Readonly<{
  controllerInput: XrNativeControllerInput
  deltaSeconds: number
  runtime?: XrMotionReferenceRuntimeSnapshot
}>): XrSharedObjectControllerMotionResult {
  return applySharedMotion({ ...input, controllerInput: applyXrObjectControllerPrecisionMode(input.controllerInput) })
}
