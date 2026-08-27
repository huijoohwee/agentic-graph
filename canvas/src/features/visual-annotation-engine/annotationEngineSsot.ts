export const AGENTICGRAPH_ANNOTATION_MODEL = 'AGENTICGRAPH_ANNOTATION_MODEL' as const
export const AGENTICGRAPH_ANNOTATION_BACKEND = 'AGENTICGRAPH_ANNOTATION_BACKEND' as const
export const AGENTICGRAPH_ANNOTATION_CACHE_PREFIX = 'AGENTICGRAPH_ANNOTATION_CACHE_PREFIX' as const

export const ANNOTATION_TASK_IDS = Object.freeze({
  caption: 'caption',
  detailedCaption: 'detailed_caption',
  moreDetailedCaption: 'more_detailed_caption',
  objectDetection: 'object_detection',
  denseRegionCaption: 'dense_region_caption',
  ocr: 'ocr',
} as const)

export type AnnotationTaskId = typeof ANNOTATION_TASK_IDS[keyof typeof ANNOTATION_TASK_IDS]

export const ANNOTATION_MODEL_IDS = Object.freeze({
  florence2Base: 'microsoft/Florence-2-base',
} as const)

export type AnnotationModelId = typeof ANNOTATION_MODEL_IDS[keyof typeof ANNOTATION_MODEL_IDS]
export type AnnotationAssetType = 'image' | 'video_frame'
export type AnnotationBBox = [number, number, number, number]

export type AnnotationTaskOutput =
  | { text: string }
  | { objects: Array<{ label: string; bbox: AnnotationBBox; confidence?: number }> }
  | { regions: Array<{ label: string; bbox: AnnotationBBox }> }
  | { text: string; blocks?: Array<{ text: string; bbox: AnnotationBBox }> }
  | { error: string }

export type AnnotationSpec = {
  assetUrl: string
  assetType: AnnotationAssetType
  tasks: AnnotationTaskId[]
  modelHint?: string
  frameTimestampMs?: number
}

export const ANNOTATION_SCHEMA_VERSION = 'agenticgraph-annotation/v1' as const

export type AnnotationResult = {
  ok: true
  annotationId: string
  assetUrl: string
  assetType: AnnotationAssetType
  modelId: string
  tasks: Record<string, AnnotationTaskOutput>
  processedAt: string
  durationMs: number
  schemaVersion: typeof ANNOTATION_SCHEMA_VERSION
  frameTimestampMs?: number
  outputPath?: string | null
  outputManifestPath?: string | null
  outputStorageUrl?: string | null
}

export type AnnotationError = {
  ok: false
  errorCode:
    | 'invalid_spec'
    | 'model_not_configured'
    | 'inference_failed'
    | 'artifact_write_failed'
    | 'frame_extraction_failed'
    | 'worker_not_supported'
  modelId?: string
  field?: string
  reason?: string
}

export type AnnotationRunResult = AnnotationResult | AnnotationError

export type WorkerRequest = {
  type: 'annotate'
  requestId: string
  spec: AnnotationSpec
  modelId: string
}

export type WorkerResponse =
  | { type: 'progress'; requestId: string; loaded: number; total: number }
  | { type: 'result'; requestId: string; result: Omit<AnnotationResult, 'annotationId' | 'ok'> }
  | { type: 'error'; requestId: string; errorCode: AnnotationError['errorCode']; reason: string }
