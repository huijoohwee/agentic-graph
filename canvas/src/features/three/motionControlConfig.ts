export const MOTION_CONTROL_SCHEMA = 'agentic-graph-motion-control/v1'
export const MOTION_CONTROL_MODEL_ID = 'google-blazepose-ghum-full-float16'
export const MOTION_CONTROL_INPUT_SIZE = 256
export const MOTION_CONTROL_LANDMARK_COUNT = 33
export const MOTION_CONTROL_MIN_CONFIDENCE = 0.5

const LITERT_ASSET_DIRECTORY = 'litert/'
const POSE_MODEL_FILE = 'pose_landmarks_detector.tflite'

function runtimeBaseUrl(): URL {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return new URL(import.meta.env.BASE_URL || '/', `${origin}/`)
}

export function motionControlLiteRtWasmUrl(): string {
  return new URL(LITERT_ASSET_DIRECTORY, runtimeBaseUrl()).toString()
}

export function motionControlPoseModelUrl(): string {
  return new URL(`${LITERT_ASSET_DIRECTORY}${POSE_MODEL_FILE}`, runtimeBaseUrl()).toString()
}

export const MOTION_CONTROL_MODEL_PROVENANCE = Object.freeze({
  modelId: MOTION_CONTROL_MODEL_ID,
  owner: 'Google AI Edge',
  license: 'Apache-2.0',
  source: 'official-pose-landmarker-full-task',
  sourceVersion: 'float16/1',
  inputShape: Object.freeze([1, MOTION_CONTROL_INPUT_SIZE, MOTION_CONTROL_INPUT_SIZE, 3]),
  outputLandmarks: MOTION_CONTROL_LANDMARK_COUNT,
})
