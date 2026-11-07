import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import type { AnnotationResult, AnnotationTaskOutput } from './annotationEngineSsot'
import { ANNOTATION_TASK_IDS } from './annotationEngineSsot'

export type LlmReadyPayload = {
  assetUrl: string
  modelId: string
  schemaVersion: string
  tasks: Record<string, AnnotationTaskOutput>
}

const hasText = (value: AnnotationTaskOutput | undefined): value is { text: string } => {
  return Boolean(value && 'text' in value && typeof value.text === 'string' && value.text.trim())
}

const hasObjects = (
  value: AnnotationTaskOutput | undefined,
): value is { objects: Array<{ label: string; bbox: [number, number, number, number]; confidence?: number }> } => {
  return Boolean(value && 'objects' in value && Array.isArray(value.objects))
}

const hasError = (value: AnnotationTaskOutput | undefined): value is { error: string } => {
  return Boolean(value && 'error' in value && typeof value.error === 'string')
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const clampNormalized = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

const isVideoAssetUrl = (assetUrl: string): boolean => /\.(?:mp4|webm|og[gv]|mov|m4v)(?:[?#]|$)/i.test(assetUrl)

export function toLlmReadyPayload(result: AnnotationResult): LlmReadyPayload {
  if (!result || result.ok !== true) {
    throw new TypeError('toLlmReadyPayload requires ok:true result')
  }
  return {
    assetUrl: result.assetUrl,
    modelId: result.modelId,
    schemaVersion: result.schemaVersion,
    tasks: result.tasks,
  }
}

export function toMarkdownSummary(result: AnnotationResult): string {
  if (!result || result.ok !== true) return 'No annotation data is available.'

  const sections: string[] = []
  const caption =
    result.tasks[ANNOTATION_TASK_IDS.caption]
    || result.tasks[ANNOTATION_TASK_IDS.detailedCaption]
    || result.tasks[ANNOTATION_TASK_IDS.moreDetailedCaption]
  if (hasText(caption)) {
    sections.push(['## Caption', caption.text.trim()].join('\n\n'))
  }

  const detection = result.tasks[ANNOTATION_TASK_IDS.objectDetection]
  if (hasObjects(detection) && detection.objects.length > 0) {
    sections.push([
      '## Detected Objects',
      ...detection.objects.map(object => `- ${String(object.label || '').trim() || 'unlabelled'}`),
    ].join('\n'))
  }

  const failedTasks = Object.keys(result.tasks)
    .filter(task => hasError(result.tasks[task]))
    .sort((left, right) => left.localeCompare(right))
  if (failedTasks.length > 0) {
    sections.push(['## Failed Tasks', ...failedTasks.map(task => `- ${task} (failed)`)].join('\n'))
  }

  return sections.length > 0 ? sections.join('\n\n') : 'No annotation data is available.'
}

export function toAnnotationPreviewSrcDoc(result: AnnotationResult): string {
  if (!result || result.ok !== true) return ''

  const detection = result.tasks[ANNOTATION_TASK_IDS.objectDetection]
  const objects = hasObjects(detection) ? detection.objects : []
  const annotations = objects.map((object, index) => {
    const [rawX, rawY, rawWidth, rawHeight] = object.bbox
    const x = clampNormalized(rawX)
    const y = clampNormalized(rawY)
    const width = Math.min(clampNormalized(rawWidth), 1 - x)
    const height = Math.min(clampNormalized(rawHeight), 1 - y)
    const label = String(object.label || '').trim() || `Object ${index + 1}`
    const confidence = typeof object.confidence === 'number'
      ? ` ${Math.round(clampNormalized(object.confidence) * 100)}%`
      : ''
    return `<li style="--kg-x:${x * 100}%;--kg-y:${y * 100}%;--kg-w:${width * 100}%;--kg-h:${height * 100}%"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(confidence.trim())}</span></li>`
  }).join('')
  const media = isVideoAssetUrl(result.assetUrl)
    ? `<video src="${escapeHtml(result.assetUrl)}" aria-label="Annotated video" controls playsinline preload="metadata"></video>`
    : `<img src="${escapeHtml(result.assetUrl)}" alt="Annotated ${escapeHtml(result.assetType === 'video_frame' ? 'video frame' : 'image')}" />`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{width:100%;height:100%;margin:0;background:#111827;color:#f8fafc;font-family:${UI_FONT_SANS}}body{display:grid;place-items:center}main{width:100%;height:100%;min-width:0;min-height:0}figure{width:100%;height:100%;display:grid;grid-template-rows:minmax(0,1fr) auto;margin:0;overflow:hidden;background:#030712}.stage{position:relative;display:inline-grid;place-self:center;max-width:100%;max-height:100%;min-width:0;min-height:0}.stage>img,.stage>video{grid-area:1/1;display:block;width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain}.stage>ol{position:absolute;inset:0;margin:0;padding:0;list-style:none;pointer-events:none}li{position:absolute;left:var(--kg-x);top:var(--kg-y);width:var(--kg-w);height:var(--kg-h);box-sizing:border-box;border:2px solid #22d3ee;background:rgba(34,211,238,.08);filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}li strong{position:absolute;left:-2px;top:-24px;max-width:calc(100% + 4px);padding:3px 6px;background:#0891b2;color:#fff;font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}li span{margin-left:4px;font-weight:500}figcaption{padding:8px 10px;background:#111827;color:#cbd5e1;font-size:12px}</style></head><body><main><figure><section class="stage">${media}<ol aria-label="Detected objects">${annotations}</ol></section><figcaption>${escapeHtml(objects.length)} detected object${objects.length === 1 ? '' : 's'} - ${escapeHtml(result.assetType === 'video_frame' ? `video frame at ${result.frameTimestampMs ?? 0}ms` : 'image')}</figcaption></figure></main></body></html>`
}
