import {
  MOTION_CONTROL_INPUT_SIZE,
  MOTION_CONTROL_MODEL_ID,
} from './motionControlConfig'
import {
  compileMotionControlPoseModel,
  loadMotionControlLiteRt,
  validateMotionControlPoseModel,
  type MotionControlEffectiveBackend,
} from './motionControlRuntime'
import { valuesAreFinite } from './motionControlRuntimeNumbers'

export const MOTION_CONTROL_LITERT_READINESS_SCHEMA = 'agenticgraph-motion-control-litert-readiness/v1'

export type MotionControlLiteRtReadinessEvidence = Readonly<{
  schema: typeof MOTION_CONTROL_LITERT_READINESS_SCHEMA
  modelId: typeof MOTION_CONTROL_MODEL_ID
  requestedBackend: 'wasm' | 'webgpu'
  effectiveBackend: Exclude<MotionControlEffectiveBackend, 'none'>
  fullyAccelerated: boolean
  inputShape: readonly number[]
  outputShapes: readonly (readonly number[])[]
  outputElementCounts: readonly number[]
  finiteOutputValues: true
  inferenceCount: 1
  deterministicInput: 'constant-rgb-0.5'
  cameraCaptureRequested: false
}>

export async function runMotionControlLiteRtReadinessProbe(
  requestedBackend: 'wasm' | 'webgpu' = 'wasm',
): Promise<MotionControlLiteRtReadinessEvidence> {
  const liteRt = await loadMotionControlLiteRt()
  const compiled = await compileMotionControlPoseModel(requestedBackend)
  const inputShape = [1, MOTION_CONTROL_INPUT_SIZE, MOTION_CONTROL_INPUT_SIZE, 3] as const
  const inputValues = new Float32Array(MOTION_CONTROL_INPUT_SIZE * MOTION_CONTROL_INPUT_SIZE * 3)
  inputValues.fill(0.5)
  const input = new liteRt.Tensor(inputValues, [...inputShape])
  let outputs: import('@litertjs/core').Tensor[] = []
  try {
    validateMotionControlPoseModel(compiled.model)
    outputs = await compiled.model.run(input)
    const outputValues = await Promise.all(outputs.map(output => output.data()))
    if (outputs.length === 0 || outputValues.some(values => !valuesAreFinite(values))) {
      throw new Error('The pose model readiness inference returned missing or non-finite output values.')
    }
    return Object.freeze({
      schema: MOTION_CONTROL_LITERT_READINESS_SCHEMA,
      modelId: MOTION_CONTROL_MODEL_ID,
      requestedBackend,
      effectiveBackend: compiled.effectiveBackend,
      fullyAccelerated: compiled.effectiveBackend === 'webgpu' && compiled.model.isFullyAccelerated,
      inputShape: Object.freeze([...inputShape]),
      outputShapes: Object.freeze(compiled.model.getOutputDetails().map(detail => Object.freeze(Array.from(detail.shape)))),
      outputElementCounts: Object.freeze(outputValues.map(values => values.length)),
      finiteOutputValues: true,
      inferenceCount: 1,
      deterministicInput: 'constant-rgb-0.5',
      cameraCaptureRequested: false,
    })
  } finally {
    input.delete()
    outputs.forEach(output => output.delete())
    compiled.model.delete()
  }
}
