import {
  MOTION_CONTROL_MODEL_ID,
  MOTION_CONTROL_MODEL_PROVENANCE,
  MOTION_CONTROL_SCHEMA,
} from './motionControlConfig'
import type { MotionControlSnapshot } from './motionControlRuntime'

export const INITIAL_MOTION_CONTROL_SNAPSHOT: MotionControlSnapshot = Object.freeze({
  schema: MOTION_CONTROL_SCHEMA,
  phase: 'off',
  requestedBackend: 'auto',
  effectiveBackend: 'none',
  fullyAccelerated: false,
  cameraActive: false,
  permission: 'unknown',
  modelId: MOTION_CONTROL_MODEL_ID,
  message: 'Motion Control is off.',
  fallbackReason: '',
  confidence: 0,
  latencyMs: 0,
  framesPerSecond: 0,
  pose: null,
  boundingBoxEnabled: false,
  boundingBox: null,
  revision: 0,
})

export function buildMotionControlRuntimeInspection(snapshot: MotionControlSnapshot) {
  return {
    schema: snapshot.schema,
    model: MOTION_CONTROL_MODEL_PROVENANCE,
    runtime: {
      phase: snapshot.phase,
      requestedBackend: snapshot.requestedBackend,
      effectiveBackend: snapshot.effectiveBackend,
      fullyAccelerated: snapshot.fullyAccelerated,
      cameraActive: snapshot.cameraActive,
      permission: snapshot.permission,
      message: snapshot.message,
      fallbackReason: snapshot.fallbackReason,
      confidence: snapshot.confidence,
      latencyMs: snapshot.latencyMs,
      framesPerSecond: snapshot.framesPerSecond,
      trackedLandmarkCount: snapshot.pose?.landmarks.length || 0,
      revision: snapshot.revision,
    },
    support: {
      secureContext: typeof window !== 'undefined' && window.isSecureContext,
      camera: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
      webGpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    },
    drivers: { selectedHumanoid: true, nativePhysicsController: true },
    preview: { boundingBoxEnabled: snapshot.boundingBoxEnabled, boundingBoxAvailable: snapshot.boundingBox !== null },
    privacy: { frameUpload: false, framePersistence: false, localInference: true },
  }
}
