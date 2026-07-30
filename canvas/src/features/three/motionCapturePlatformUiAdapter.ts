import type {
  MotionCaptureExportArtifact,
  MotionCaptureExportFormat,
  MotionCaptureSessionSnapshot,
  MotionCaptureSourceState,
} from './motionCapturePlatformContract'
import {
  motionCaptureSessionRuntime,
  readMotionCaptureSessionSnapshot,
  subscribeMotionCaptureSession,
} from './motionCaptureSessionRuntime'
import { inspectMotionControlCapturePlatform } from './motionControlCapturePlatformBridge'
import {
  readMotionCapturePeerSharingSnapshot,
  setMotionCapturePeerSharingEnabled,
  subscribeMotionCapturePeerSharing,
} from './motionCapturePeerRuntime'

export type MotionCaptureCalibrationUiAction = 'begin' | 'reset'

export type MotionCapturePlatformUiAdapter = Readonly<{
  readSession: () => MotionCaptureSessionSnapshot
  subscribeSession: (listener: () => void) => () => void
  readBridge: typeof inspectMotionControlCapturePlatform
  readPeerSharing: typeof readMotionCapturePeerSharingSnapshot
  subscribePeerSharing: typeof subscribeMotionCapturePeerSharing
  setPeerSharingEnabled: typeof setMotionCapturePeerSharingEnabled
  setCalibrationStatus: (sourceId: string, action: MotionCaptureCalibrationUiAction) => MotionCaptureSourceState
  startRecording: () => MotionCaptureSessionSnapshot
  stopRecording: () => MotionCaptureSessionSnapshot
  clearRecording: () => MotionCaptureSessionSnapshot
  applyResearchEvidenceManifest: (input: unknown) => Promise<MotionCaptureSessionSnapshot>
  exportRecording: (format: MotionCaptureExportFormat) => Promise<MotionCaptureExportArtifact>
}>

let cachedSessionSnapshot = readMotionCaptureSessionSnapshot()

function readSession(): MotionCaptureSessionSnapshot {
  const next = readMotionCaptureSessionSnapshot()
  if (next.revision === cachedSessionSnapshot.revision) return cachedSessionSnapshot
  cachedSessionSnapshot = next
  return cachedSessionSnapshot
}

function subscribeSession(listener: () => void): () => void {
  return subscribeMotionCaptureSession(snapshot => {
    cachedSessionSnapshot = snapshot
    listener()
  })
}

function setCalibrationStatus(
  sourceId: string,
  action: MotionCaptureCalibrationUiAction,
): MotionCaptureSourceState {
  const source = readMotionCaptureSessionSnapshot().sources.find(candidate => candidate.sourceId === sourceId)
  if (!source) throw new Error('motion-capture-source-not-found')
  return motionCaptureSessionRuntime.setSourceCalibration(sourceId, {
    status: action === 'begin' ? 'calibrating' : 'uncalibrated',
    coordinateSpace: source.coordinateSpace,
  })
}

export const motionCapturePlatformUiAdapter: MotionCapturePlatformUiAdapter = Object.freeze({
  readSession,
  subscribeSession,
  readBridge: inspectMotionControlCapturePlatform,
  readPeerSharing: readMotionCapturePeerSharingSnapshot,
  subscribePeerSharing: subscribeMotionCapturePeerSharing,
  setPeerSharingEnabled: setMotionCapturePeerSharingEnabled,
  setCalibrationStatus,
  startRecording: motionCaptureSessionRuntime.startRecording,
  stopRecording: motionCaptureSessionRuntime.stopRecording,
  clearRecording: motionCaptureSessionRuntime.clearRecording,
  applyResearchEvidenceManifest: motionCaptureSessionRuntime.applyResearchEvidenceManifest,
  exportRecording: motionCaptureSessionRuntime.exportRecording,
})
