import type {
  MotionCaptureCalibrationInput,
  MotionCaptureClockAlignmentInput,
  MotionCaptureExportArtifact,
  MotionCaptureExportFormat,
  MotionCaptureLimits,
  MotionCaptureObservationInput,
  MotionCaptureRecording,
  MotionCaptureSessionSnapshot,
  MotionCaptureSharedReconstructionInput,
  MotionCaptureSourceRegistration,
  MotionCaptureSourceState,
} from './motionCapturePlatformContract'

export type MotionCaptureRuntimeListener = (snapshot: MotionCaptureSessionSnapshot) => void
export type MotionCaptureIdKind = 'session' | 'source' | 'recording' | 'reconstruction'
export type MotionCaptureSessionRuntimeOptions = Readonly<{
  now?: () => number
  idFactory?: (kind: MotionCaptureIdKind) => string
  limits?: Partial<MotionCaptureLimits>
}>

export type MotionCaptureSessionRuntime = Readonly<{
  getSnapshot: () => MotionCaptureSessionSnapshot
  subscribe: (listener: MotionCaptureRuntimeListener) => () => void
  registerSource: (input: MotionCaptureSourceRegistration) => MotionCaptureSourceState
  removeSource: (sourceId: string) => MotionCaptureSessionSnapshot
  releaseAllSources: () => MotionCaptureSessionSnapshot
  setSourceClockAlignment: (sourceId: string, input: MotionCaptureClockAlignmentInput) => MotionCaptureSourceState
  setSourceCalibration: (sourceId: string, input: MotionCaptureCalibrationInput) => MotionCaptureSourceState
  setSharedReconstructionEvidence: (input: MotionCaptureSharedReconstructionInput) => MotionCaptureSessionSnapshot
  clearSharedReconstructionEvidence: () => MotionCaptureSessionSnapshot
  applyResearchEvidenceManifest: (input: unknown) => Promise<MotionCaptureSessionSnapshot>
  ingestObservation: (sourceId: string, input: MotionCaptureObservationInput) => MotionCaptureSessionSnapshot
  startRecording: () => MotionCaptureSessionSnapshot
  stopRecording: () => MotionCaptureSessionSnapshot
  clearRecording: () => MotionCaptureSessionSnapshot
  readRecording: () => MotionCaptureRecording | null
  exportRecording: (format: MotionCaptureExportFormat) => Promise<MotionCaptureExportArtifact>
}>
