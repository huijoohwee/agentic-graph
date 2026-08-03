export const XR_V2_CONTRACT_VERSION = '2.0.0' as const
export const XR_V2_CAPTURE_SNAPSHOT_SCHEMA = 'knowgrph-xr-capture-snapshot/v2' as const
export const XR_V2_CAPTURE_RESULT_SCHEMA = 'knowgrph-xr-capture-result/v2' as const
export const XR_V2_POST_PROCESS_JOB_SCHEMA = 'knowgrph-xr-post-process-job/v2' as const
export const XR_V2_STEREO_PAIR_SCHEMA = 'knowgrph-xr-stereo-pair/v2' as const

export type XrV2CapturePhase =
  | 'idle'
  | 'capturing-live'
  | 'capturing-raw'
  | 'completed'

export type XrV2FallbackReason = 'budget-breach' | 'live-processing-error'

export type XrV2CaptureConfiguration = Readonly<{
  frameBudgetMs: number
  consecutiveBudgetBreaches: number
  maxFrames: number
}>

export type XrV2CaptureFallback = Readonly<{
  triggeredAtFrameIndex: number
  observedDurationMs: number
  reason: XrV2FallbackReason
}>

export type XrV2CaptureSnapshot = Readonly<{
  schema: typeof XR_V2_CAPTURE_SNAPSHOT_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  sessionId: string
  phase: XrV2CapturePhase
  frameBudgetMs: number
  consecutiveBudgetBreachesRequired: number
  maxFrames: number
  rawFrameCount: number
  depthFrameCount: number
  synthesizedFrameCount: number
  consecutiveBudgetBreaches: number
  lastFrameIndex: number | null
  fallback: XrV2CaptureFallback | null
}>

export type XrV2CaptureFrame<TFrame> = Readonly<{
  frameIndex: number
  capturedAtMs: number
  frame: TFrame
}>

export type XrV2DepthEstimate<TDepth> = Readonly<{
  depth: TDepth
  confidence: number
}>

export type XrV2DepthEstimator<TFrame, TDepth> = Readonly<{
  estimate: (
    input: XrV2CaptureFrame<TFrame>,
  ) => XrV2DepthEstimate<TDepth> | Promise<XrV2DepthEstimate<TDepth>>
}>

export type XrV2StereoPair<TPreviewFrame> = Readonly<{
  schema: typeof XR_V2_STEREO_PAIR_SCHEMA
  frameIndex: number
  capturedAtMs: number
  left: TPreviewFrame
  right: TPreviewFrame
}>

export type XrV2StereoSynthesizer<TFrame, TDepth, TPreviewFrame> = Readonly<{
  synthesize: (input: Readonly<{
    frame: XrV2CaptureFrame<TFrame>
    estimate: XrV2DepthEstimate<TDepth>
  }>) => XrV2StereoPair<TPreviewFrame> | Promise<XrV2StereoPair<TPreviewFrame>>
}>

export type XrV2CaptureArtifacts = Readonly<{
  rawClipRef: string
  depthMetadataRef: string
}>

export type XrV2CaptureArtifactSink<TFrame, TDepth> = Readonly<{
  writeRawFrame: (
    frame: XrV2CaptureFrame<TFrame>,
  ) => void | Promise<void>
  writeDepthEstimate: (input: Readonly<{
    frameIndex: number
    capturedAtMs: number
    estimate: XrV2DepthEstimate<TDepth>
  }>) => void | Promise<void>
  finalize: (input: Readonly<{
    snapshot: XrV2CaptureSnapshot
  }>) => XrV2CaptureArtifacts | Promise<XrV2CaptureArtifacts>
}>

export type XrV2CaptureDiagnostic = Readonly<{
  code: 'live-processing-failed'
  frameIndex: number
  message: string
}>

export type XrV2PostProcessJob = Readonly<{
  schema: typeof XR_V2_POST_PROCESS_JOB_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  jobId: string
  sessionId: string
  status: 'queued'
  rawClipRef: string
  depthMetadataRef: string
  queuedAtMs: number
  fallback: XrV2CaptureFallback
}>

export type XrV2CaptureResult = Readonly<{
  schema: typeof XR_V2_CAPTURE_RESULT_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  sessionId: string
  synthesisMode: 'live' | 'post-process'
  artifacts: XrV2CaptureArtifacts
  snapshot: XrV2CaptureSnapshot
  postProcessJob: XrV2PostProcessJob | null
}>

export type XrV2CaptureClock = Readonly<{
  now: () => number
}>
