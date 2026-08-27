import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { AnnotationAssetType, AnnotationBBox, AnnotationResult } from './annotationEngineSsot'
import { ANNOTATION_SCHEMA_VERSION, ANNOTATION_TASK_IDS } from './annotationEngineSsot'

export const VISUAL_ANNOTATION_DATASET_SCHEMA_VERSION = 'agenticgraph-visual-annotation-dataset/v1' as const
export const VISUAL_ZONE_COUNTING_SCHEMA_VERSION = 'agenticgraph-zone-counting/v1' as const

export type VisualDatasetAnnotation = {
  annotationId: string
  label: string
  bbox: AnnotationBBox
  confidence?: number
  mask?: VisualDatasetMask
  sourceTask: string
  trackId?: string
}

export type VisualDatasetMask = {
  polygons: ReadonlyArray<ReadonlyArray<readonly [number, number]>>
}

export type VisualDatasetSample = {
  sampleId: string
  assetUrl: string
  assetType: AnnotationAssetType
  annotations: VisualDatasetAnnotation[]
  frameIndex?: number
  timestampMs?: number
}

export type VisualAnnotationDataset = {
  schemaVersion: typeof VISUAL_ANNOTATION_DATASET_SCHEMA_VERSION
  datasetId: string
  sourceKind: 'annotation-results' | 'frame-boxes' | 'serialized-dataset' | 'mixed'
  samples: VisualDatasetSample[]
}

export type VisualAnnotationDatasetLoadResult =
  | { ok: true; dataset: VisualAnnotationDataset }
  | { ok: false; errorCode: 'invalid_dataset'; reason: string }

export type VisualAnnotationDatasetSaveResult = {
  datasetId: string
  filename: string
  mimeType: 'application/json'
  text: string
  sampleCount: number
  annotationCount: number
}

export type VisualDatasetSplitName = 'train' | 'validation' | 'test'

export type VisualAnnotationDatasetSplit = {
  datasetId: string
  splits: Record<VisualDatasetSplitName, VisualAnnotationDataset>
  summary: Record<VisualDatasetSplitName, number> & { total: number }
}

export type VisualZone = {
  zoneId: string
  label: string
  polygon: ReadonlyArray<readonly [number, number]>
}

export type VisualZoneDetection = {
  annotationId: string
  label: string
  bbox: AnnotationBBox
  zoneIds: string[]
  confidence?: number
}

export type VisualZoneCountingFrame = {
  sampleId: string
  frameIndex: number
  timestampMs?: number
  counts: Record<string, number>
  cumulativeCounts: Record<string, number>
  detections: VisualZoneDetection[]
}

export type VisualZoneCountingTimeline = {
  schemaVersion: typeof VISUAL_ZONE_COUNTING_SCHEMA_VERSION
  datasetId: string
  zones: VisualZone[]
  frames: VisualZoneCountingFrame[]
  totals: Record<string, number>
}

type FrameBoxInput = {
  bbox?: unknown
  confidence?: unknown
  detections?: unknown
  evidence?: unknown
  frameImageUrl?: unknown
  frameIndex?: unknown
  label?: unknown
  mask?: unknown
  timestampMs?: unknown
  trackId?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const parseJsonIfNeeded = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const clamp01 = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric))
}

const normalizeBBox = (value: unknown): AnnotationBBox | null => {
  if (!Array.isArray(value) || value.length !== 4) return null
  const [x, y, width, height] = value.map(Number)
  if (![x, y, width, height].every(Number.isFinite)) return null
  const left = clamp01(x)
  const top = clamp01(y)
  const clampedWidth = Math.max(0, Math.min(1 - left, Number(width)))
  const clampedHeight = Math.max(0, Math.min(1 - top, Number(height)))
  if (clampedWidth <= 0 || clampedHeight <= 0) return null
  return [left, top, clampedWidth, clampedHeight]
}

const normalizeMaskPoint = (value: unknown): readonly [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [clamp01(x), clamp01(y)]
}

const isPointArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.every(entry => Array.isArray(entry) && entry.length === 2)

const normalizeMask = (value: unknown): VisualDatasetMask | undefined => {
  const candidate = isRecord(value) && Array.isArray(value.polygons) ? value.polygons : value
  const polygonsInput = isPointArray(candidate) ? [candidate] : Array.isArray(candidate) ? candidate : []
  const polygons = polygonsInput.flatMap(polygon => {
    if (!isPointArray(polygon)) return []
    const points = polygon.flatMap(point => {
      const normalized = normalizeMaskPoint(point)
      return normalized ? [normalized] : []
    })
    return points.length >= 3 ? [points] : []
  })
  return polygons.length ? { polygons } : undefined
}

const readString = (value: unknown, fallback: string): string => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const readOptionalInteger = (value: unknown): number | undefined => {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined
}

const buildDatasetId = (parts: unknown): string =>
  buildScopedGraphSemanticKey('visual_dataset', { graphSemanticKey: JSON.stringify(parts) })

const buildSampleId = (parts: unknown): string =>
  buildScopedGraphSemanticKey('visual_dataset_sample', { graphSemanticKey: JSON.stringify(parts) })

const buildDetectionId = (parts: unknown): string =>
  buildScopedGraphSemanticKey('visual_dataset_detection', { graphSemanticKey: JSON.stringify(parts) })

const normalizeAnnotation = (
  value: unknown,
  sourceTask: string,
  fallbackParts: unknown,
): VisualDatasetAnnotation | null => {
  if (!isRecord(value)) return null
  const bbox = normalizeBBox(value.bbox)
  if (!bbox) return null
  const confidence = Number(value.confidence)
  const annotationId = readString(value.annotationId, buildDetectionId({ fallbackParts, bbox, sourceTask }))
  const out: VisualDatasetAnnotation = {
    annotationId,
    label: readString(value.label, 'detected object'),
    bbox,
    sourceTask,
  }
  const mask = normalizeMask(value.mask)
  if (Number.isFinite(confidence)) out.confidence = Math.max(0, Math.min(1, confidence))
  if (mask) out.mask = mask
  const trackId = readString(value.trackId, '')
  if (trackId) out.trackId = trackId
  return out
}

const normalizeSample = (value: unknown): VisualDatasetSample | null => {
  if (!isRecord(value)) return null
  const assetUrl = readString(value.assetUrl, '')
  if (!assetUrl) return null
  const assetType = value.assetType === 'video_frame' ? 'video_frame' : 'image'
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.flatMap((entry, index) => {
      const normalized = normalizeAnnotation(entry, readString((entry as { sourceTask?: unknown })?.sourceTask, 'object_detection'), { assetUrl, index })
      return normalized ? [normalized] : []
    })
    : []
  const frameIndex = readOptionalInteger(value.frameIndex)
  const timestampMs = readOptionalInteger(value.timestampMs)
  return {
    sampleId: readString(value.sampleId, buildSampleId({ assetUrl, assetType, frameIndex, timestampMs, annotations })),
    assetUrl,
    assetType,
    annotations,
    ...(typeof frameIndex === 'number' ? { frameIndex } : {}),
    ...(typeof timestampMs === 'number' ? { timestampMs } : {}),
  }
}

const samplesFromAnnotationResult = (result: AnnotationResult): VisualDatasetSample[] => {
  if (result.ok !== true || result.schemaVersion !== ANNOTATION_SCHEMA_VERSION) return []
  const annotations: VisualDatasetAnnotation[] = []
  const objectTask = result.tasks[ANNOTATION_TASK_IDS.objectDetection]
  if (objectTask && 'objects' in objectTask && Array.isArray(objectTask.objects)) {
    objectTask.objects.forEach((object, index) => {
      const normalized = normalizeAnnotation(object, ANNOTATION_TASK_IDS.objectDetection, {
        assetUrl: result.assetUrl,
        index,
        task: ANNOTATION_TASK_IDS.objectDetection,
      })
      if (normalized) annotations.push(normalized)
    })
  }
  const regionTask = result.tasks[ANNOTATION_TASK_IDS.denseRegionCaption]
  if (regionTask && 'regions' in regionTask && Array.isArray(regionTask.regions)) {
    regionTask.regions.forEach((region, index) => {
      const normalized = normalizeAnnotation(region, ANNOTATION_TASK_IDS.denseRegionCaption, {
        assetUrl: result.assetUrl,
        index,
        task: ANNOTATION_TASK_IDS.denseRegionCaption,
      })
      if (normalized) annotations.push(normalized)
    })
  }
  const sample = normalizeSample({
    assetUrl: result.assetUrl,
    assetType: result.assetType,
    annotations,
    timestampMs: result.frameTimestampMs,
  })
  return sample ? [sample] : []
}

const samplesFromFrameBoxes = (
  boxes: readonly FrameBoxInput[],
  sourceUrl: string,
): VisualDatasetSample[] => boxes.flatMap((box, index) => {
  const timestampMs = readOptionalInteger(box.timestampMs) ?? index
  const frameIndex = readOptionalInteger(box.frameIndex) ?? index
  const assetUrl = readString(box.frameImageUrl, sourceUrl)
  const primaryAnnotationInput = {
    annotationId: buildDetectionId({ sourceUrl, frameIndex, timestampMs, bbox: box.bbox }),
    label: box.label,
    bbox: box.bbox,
    confidence: box.confidence,
    mask: box.mask,
    trackId: box.trackId,
  }
  const detectionInputs = Array.isArray(box.detections) && box.detections.length
    ? box.detections
    : [primaryAnnotationInput]
  const annotations = detectionInputs.flatMap((detection, detectionIndex) => {
    const annotationInput = isRecord(detection) ? detection : primaryAnnotationInput
    const normalized = normalizeAnnotation({
      ...annotationInput,
      annotationId: readString(
        annotationInput.annotationId,
        buildDetectionId({ sourceUrl, frameIndex, timestampMs, bbox: annotationInput.bbox || box.bbox }) + `:${detectionIndex}`,
      ),
      bbox: annotationInput.bbox || box.bbox,
      confidence: annotationInput.confidence ?? box.confidence,
      label: annotationInput.label || box.label,
      mask: annotationInput.mask ?? box.mask,
      trackId: annotationInput.trackId ?? box.trackId,
    }, 'frameBoundingBox', { sourceUrl, frameIndex, timestampMs, index: detectionIndex })
    return normalized ? [normalized] : []
  })
  const sample = annotations.length ? normalizeSample({
    assetUrl,
    assetType: 'video_frame',
    annotations,
    frameIndex,
    timestampMs,
  }) : null
  return sample ? [sample] : []
})

export function loadVisualAnnotationDataset(input: unknown, opts?: {
  datasetId?: string
  sourceUrl?: string
  sourceKind?: VisualAnnotationDataset['sourceKind']
}): VisualAnnotationDatasetLoadResult {
  const candidate = parseJsonIfNeeded(input)
  if (!candidate) return { ok: false, errorCode: 'invalid_dataset', reason: 'dataset JSON is invalid' }

  let samples: VisualDatasetSample[] = []
  let sourceKind = opts?.sourceKind || 'mixed'
  if (isRecord(candidate) && candidate.schemaVersion === VISUAL_ANNOTATION_DATASET_SCHEMA_VERSION) {
    samples = Array.isArray(candidate.samples) ? candidate.samples.flatMap(sample => {
      const normalized = normalizeSample(sample)
      return normalized ? [normalized] : []
    }) : []
    sourceKind = 'serialized-dataset'
  } else if (isRecord(candidate) && Array.isArray(candidate.frameBoundingBoxes)) {
    samples = samplesFromFrameBoxes(candidate.frameBoundingBoxes as FrameBoxInput[], readString(candidate.sourceUrl, opts?.sourceUrl || ''))
    sourceKind = 'frame-boxes'
  } else if (Array.isArray(candidate) && candidate.some(item => isRecord(item) && Array.isArray(item.bbox))) {
    samples = samplesFromFrameBoxes(candidate as FrameBoxInput[], readString(opts?.sourceUrl, ''))
    sourceKind = 'frame-boxes'
  } else if (Array.isArray(candidate)) {
    samples = candidate.flatMap(item => samplesFromAnnotationResult(item as AnnotationResult))
    sourceKind = 'annotation-results'
  } else if (isRecord(candidate) && candidate.ok === true) {
    samples = samplesFromAnnotationResult(candidate as AnnotationResult)
    sourceKind = 'annotation-results'
  }

  if (samples.length === 0) {
    return { ok: false, errorCode: 'invalid_dataset', reason: 'dataset contains no loadable samples' }
  }
  const datasetId = readString(opts?.datasetId, buildDatasetId(samples.map(sample => sample.sampleId)))
  return {
    ok: true,
    dataset: {
      schemaVersion: VISUAL_ANNOTATION_DATASET_SCHEMA_VERSION,
      datasetId,
      sourceKind,
      samples,
    },
  }
}

export function saveVisualAnnotationDataset(dataset: VisualAnnotationDataset, opts?: { filename?: string }): VisualAnnotationDatasetSaveResult {
  const text = JSON.stringify(dataset, null, 2)
  return {
    datasetId: dataset.datasetId,
    filename: readString(opts?.filename, `${dataset.datasetId}.json`),
    mimeType: 'application/json',
    text,
    sampleCount: dataset.samples.length,
    annotationCount: dataset.samples.reduce((sum, sample) => sum + sample.annotations.length, 0),
  }
}

export function filterVisualAnnotationDatasetByZones(
  dataset: VisualAnnotationDataset,
  zones: readonly VisualZone[],
  opts?: {
    includeZoneIds?: readonly string[]
    excludeZoneIds?: readonly string[]
    labels?: readonly string[]
  },
): VisualAnnotationDataset {
  const includeZoneIds = new Set((opts?.includeZoneIds || []).map(String).filter(Boolean))
  const excludeZoneIds = new Set((opts?.excludeZoneIds || []).map(String).filter(Boolean))
  const labels = new Set((opts?.labels || []).map(label => String(label).trim().toLowerCase()).filter(Boolean))
  const samples = dataset.samples.flatMap(sample => {
    const annotations = sample.annotations.filter(annotation => {
      if (labels.size && !labels.has(annotation.label.trim().toLowerCase())) return false
      const center: [number, number] = [
        annotation.bbox[0] + annotation.bbox[2] / 2,
        annotation.bbox[1] + annotation.bbox[3] / 2,
      ]
      const zoneIds = zones.filter(zone => pointInPolygon(center, zone.polygon)).map(zone => zone.zoneId)
      if (includeZoneIds.size && !zoneIds.some(zoneId => includeZoneIds.has(zoneId))) return false
      if (excludeZoneIds.size && zoneIds.some(zoneId => excludeZoneIds.has(zoneId))) return false
      return true
    })
    return annotations.length ? [{ ...sample, annotations }] : []
  })
  return {
    ...dataset,
    datasetId: buildDatasetId({
      parent: dataset.datasetId,
      filter: {
        includeZoneIds: [...includeZoneIds],
        excludeZoneIds: [...excludeZoneIds],
        labels: [...labels],
      },
      samples: samples.map(sample => sample.sampleId),
    }),
    samples,
  }
}

const rankedSamples = (samples: readonly VisualDatasetSample[], seed: string): VisualDatasetSample[] =>
  [...samples].sort((left, right) => {
    const leftKey = buildDatasetId({ seed, sampleId: left.sampleId })
    const rightKey = buildDatasetId({ seed, sampleId: right.sampleId })
    return leftKey.localeCompare(rightKey) || left.sampleId.localeCompare(right.sampleId)
  })

export function splitVisualAnnotationDataset(dataset: VisualAnnotationDataset, opts?: {
  seed?: string
  trainRatio?: number
  validationRatio?: number
  testRatio?: number
}): VisualAnnotationDatasetSplit {
  const trainRatio = Math.max(0, Number(opts?.trainRatio ?? 0.7))
  const validationRatio = Math.max(0, Number(opts?.validationRatio ?? 0.2))
  const testRatio = Math.max(0, Number(opts?.testRatio ?? 0.1))
  const ratioTotal = trainRatio + validationRatio + testRatio || 1
  const ordered = rankedSamples(dataset.samples, readString(opts?.seed, dataset.datasetId))
  const trainCount = Math.min(ordered.length, Math.round(ordered.length * trainRatio / ratioTotal))
  const validationCount = Math.min(ordered.length - trainCount, Math.round(ordered.length * validationRatio / ratioTotal))
  const splitSamples: Record<VisualDatasetSplitName, VisualDatasetSample[]> = {
    train: ordered.slice(0, trainCount),
    validation: ordered.slice(trainCount, trainCount + validationCount),
    test: ordered.slice(trainCount + validationCount),
  }
  const buildSplit = (name: VisualDatasetSplitName): VisualAnnotationDataset => ({
    ...dataset,
    datasetId: buildDatasetId({ parent: dataset.datasetId, split: name, samples: splitSamples[name].map(sample => sample.sampleId) }),
    samples: splitSamples[name],
  })
  return {
    datasetId: dataset.datasetId,
    splits: {
      train: buildSplit('train'),
      validation: buildSplit('validation'),
      test: buildSplit('test'),
    },
    summary: {
      train: splitSamples.train.length,
      validation: splitSamples.validation.length,
      test: splitSamples.test.length,
      total: ordered.length,
    },
  }
}

export function mergeVisualAnnotationDatasets(datasets: readonly VisualAnnotationDataset[]): VisualAnnotationDataset {
  const sampleById = new Map<string, VisualDatasetSample>()
  for (const dataset of datasets) {
    for (const sample of dataset.samples) {
      const existing = sampleById.get(sample.sampleId)
      if (!existing) {
        sampleById.set(sample.sampleId, { ...sample, annotations: [...sample.annotations] })
        continue
      }
      const annotationIds = new Set(existing.annotations.map(annotation => annotation.annotationId))
      for (const annotation of sample.annotations) {
        if (!annotationIds.has(annotation.annotationId)) existing.annotations.push(annotation)
      }
    }
  }
  const samples = [...sampleById.values()].sort((left, right) => {
    const leftTime = left.timestampMs ?? left.frameIndex ?? 0
    const rightTime = right.timestampMs ?? right.frameIndex ?? 0
    return leftTime - rightTime || left.sampleId.localeCompare(right.sampleId)
  })
  return {
    schemaVersion: VISUAL_ANNOTATION_DATASET_SCHEMA_VERSION,
    datasetId: buildDatasetId({ merged: datasets.map(dataset => dataset.datasetId), samples: samples.map(sample => sample.sampleId) }),
    sourceKind: datasets.length === 1 ? datasets[0]?.sourceKind || 'mixed' : 'mixed',
    samples,
  }
}

export function buildHorizontalVisualZones(labels: readonly string[]): VisualZone[] {
  const cleaned = labels.map(label => readString(label, '')).filter(Boolean)
  const zoneLabels = cleaned.length > 0 ? cleaned : ['zone']
  return zoneLabels.map((label, index) => {
    const startX = index / zoneLabels.length
    const endX = (index + 1) / zoneLabels.length
    return {
      zoneId: buildDatasetId({ zone: label, index, total: zoneLabels.length }),
      label,
      polygon: [[startX, 0], [endX, 0], [endX, 1], [startX, 1]],
    }
  })
}

const pointInPolygon = (point: readonly [number, number], polygon: ReadonlyArray<readonly [number, number]>): boolean => {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current]
    const previousPoint = polygon[previous]
    if (!currentPoint || !previousPoint) continue
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) / ((previousPoint[1] - currentPoint[1]) || 1) + currentPoint[0])
    if (intersects) inside = !inside
  }
  return inside
}

export function countVisualDatasetZones(dataset: VisualAnnotationDataset, zones: readonly VisualZone[]): VisualZoneCountingTimeline {
  const totals = Object.fromEntries(zones.map(zone => [zone.zoneId, 0])) as Record<string, number>
  const frames = dataset.samples.map((sample, index): VisualZoneCountingFrame => {
    const counts = Object.fromEntries(zones.map(zone => [zone.zoneId, 0])) as Record<string, number>
    const detections = sample.annotations.map(annotation => {
      const center: [number, number] = [
        annotation.bbox[0] + annotation.bbox[2] / 2,
        annotation.bbox[1] + annotation.bbox[3] / 2,
      ]
      const zoneIds = zones.filter(zone => pointInPolygon(center, zone.polygon)).map(zone => zone.zoneId)
      for (const zoneId of zoneIds) {
        counts[zoneId] = (counts[zoneId] || 0) + 1
        totals[zoneId] = (totals[zoneId] || 0) + 1
      }
      return {
        annotationId: annotation.annotationId,
        label: annotation.label,
        bbox: annotation.bbox,
        zoneIds,
        ...(typeof annotation.confidence === 'number' ? { confidence: annotation.confidence } : {}),
      }
    })
    return {
      sampleId: sample.sampleId,
      frameIndex: sample.frameIndex ?? index,
      timestampMs: sample.timestampMs,
      counts,
      cumulativeCounts: { ...totals },
      detections,
    }
  })
  return {
    schemaVersion: VISUAL_ZONE_COUNTING_SCHEMA_VERSION,
    datasetId: dataset.datasetId,
    zones: zones.map(zone => ({ ...zone, polygon: [...zone.polygon] })),
    frames,
    totals,
  }
}
