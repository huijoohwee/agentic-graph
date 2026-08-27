import {
  ANNOTATION_SCHEMA_VERSION,
  ANNOTATION_TASK_IDS,
  type AnnotationTaskOutput,
  type WorkerRequest,
  type WorkerResponse,
} from './annotationEngineSsot'

const postWorkerMessage = (message: WorkerResponse): void => {
  self.postMessage(message)
}

export function buildFlorenceTaskPrompt(taskId: string): string {
  switch (taskId) {
    case 'caption': return '<CAPTION>'
    case 'detailed_caption': return '<DETAILED_CAPTION>'
    case 'more_detailed_caption': return '<MORE_DETAILED_CAPTION>'
    case 'object_detection': return '<OD>'
    case 'dense_region_caption': return '<DENSE_REGION_CAPTION>'
    case 'ocr': return '<OCR>'
    default: return `<${String(taskId || 'TASK').toUpperCase()}>`
  }
}

export function shapeTaskOutput(taskId: string, raw: unknown): AnnotationTaskOutput {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as AnnotationTaskOutput
  if (taskId === 'object_detection') return { objects: [] }
  if (taskId === 'dense_region_caption') return { regions: [] }
  return { text: String(raw || '') }
}

function readAssetName(assetUrl: string): string {
  const value = String(assetUrl || '').trim()
  if (!value) return 'visual asset'
  try {
    const parsed = new URL(value, 'https://agenticgraph.local')
    const pathname = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
    return decodeURIComponent(pathname).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'visual asset'
  } catch {
    const segment = value.split(/[/?#]/).filter(Boolean).pop() || value
    return segment.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'visual asset'
  }
}

function readAssetKind(assetUrl: string, assetType: string): string {
  if (assetType === 'video_frame') return 'video frame'
  const lower = String(assetUrl || '').toLowerCase()
  if (/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/.test(lower)) return 'image'
  return 'visual asset'
}

export function buildHeuristicAnnotationResult(request: WorkerRequest, startedAt = Date.now()) {
  const { spec, modelId } = request
  const assetName = readAssetName(spec.assetUrl)
  const assetKind = readAssetKind(spec.assetUrl, spec.assetType)
  const frameText = spec.assetType === 'video_frame' && typeof spec.frameTimestampMs === 'number'
    ? ` at ${spec.frameTimestampMs}ms`
    : ''
  const tasks = spec.tasks.reduce<Record<string, AnnotationTaskOutput>>((out, taskId) => {
    switch (taskId) {
      case ANNOTATION_TASK_IDS.objectDetection:
        out[taskId] = {
          objects: [
            { label: assetKind, bbox: [0.08, 0.08, 0.84, 0.84], confidence: 0.51 },
          ],
        }
        break
      case ANNOTATION_TASK_IDS.denseRegionCaption:
        out[taskId] = {
          regions: [
            { label: `${assetKind} foreground region for ${assetName}`, bbox: [0.08, 0.08, 0.84, 0.84] },
          ],
        }
        break
      case ANNOTATION_TASK_IDS.ocr:
        out[taskId] = { text: '', blocks: [] }
        break
      case ANNOTATION_TASK_IDS.detailedCaption:
      case ANNOTATION_TASK_IDS.moreDetailedCaption:
      case ANNOTATION_TASK_IDS.caption:
      default:
        out[taskId] = { text: `Runtime-local ${assetKind} annotation for ${assetName}${frameText}.` }
        break
    }
    return out
  }, {})

  return {
    assetUrl: spec.assetUrl,
    assetType: spec.assetType,
    modelId,
    tasks,
    processedAt: new Date().toISOString(),
    durationMs: Math.max(1, Date.now() - startedAt),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    ...(typeof spec.frameTimestampMs === 'number' ? { frameTimestampMs: spec.frameTimestampMs } : {}),
  }
}

if (typeof self !== 'undefined') {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const startedAt = Date.now()
    const { requestId } = event.data
    try {
      postWorkerMessage({
        type: 'result',
        requestId,
        result: buildHeuristicAnnotationResult(event.data, startedAt),
      })
    } catch (error) {
      postWorkerMessage({
        type: 'error',
        requestId,
        errorCode: 'inference_failed',
        reason: error instanceof Error ? error.message : String(error || 'unknown error'),
      })
    }
  }
}

void ANNOTATION_SCHEMA_VERSION
