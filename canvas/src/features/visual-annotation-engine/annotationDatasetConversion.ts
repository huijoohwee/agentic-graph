import { saveVisualAnnotationDataset, type VisualAnnotationDataset, type VisualDatasetAnnotation, type VisualDatasetMask } from './annotationDataset'

export type VisualAnnotationDatasetConversionFormat = 'agentic-graph-json' | 'coco-json'

export type VisualAnnotationDatasetConversionResult = {
  datasetId: string
  filename: string
  format: VisualAnnotationDatasetConversionFormat
  mimeType: 'application/json'
  text: string
}

const readString = (value: unknown, fallback: string): string => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const bboxToCoco = (bbox: VisualDatasetAnnotation['bbox']): [number, number, number, number] => [
  Number((bbox[0] * 1000).toFixed(3)),
  Number((bbox[1] * 1000).toFixed(3)),
  Number((bbox[2] * 1000).toFixed(3)),
  Number((bbox[3] * 1000).toFixed(3)),
]

const maskToCocoSegmentation = (mask: VisualDatasetMask | undefined): number[][] => {
  if (!mask) return []
  return mask.polygons.map(polygon => polygon.flatMap(point => [
    Number((point[0] * 1000).toFixed(3)),
    Number((point[1] * 1000).toFixed(3)),
  ]))
}

export function convertVisualAnnotationDataset(
  dataset: VisualAnnotationDataset,
  opts?: { filename?: string; format?: VisualAnnotationDatasetConversionFormat },
): VisualAnnotationDatasetConversionResult {
  const format = opts?.format || 'agentic-graph-json'
  if (format === 'agentic-graph-json') {
    const saved = saveVisualAnnotationDataset(dataset, { filename: opts?.filename })
    return { datasetId: saved.datasetId, filename: saved.filename, format, mimeType: saved.mimeType, text: saved.text }
  }

  const categoryIdByLabel = new Map<string, number>()
  const categories: Array<{ id: number; name: string }> = []
  const images = dataset.samples.map((sample, index) => ({
    id: index + 1,
    file_name: sample.assetUrl,
    width: 1000,
    height: 1000,
    ...(typeof sample.frameIndex === 'number' ? { frame_index: sample.frameIndex } : {}),
    ...(typeof sample.timestampMs === 'number' ? { timestamp_ms: sample.timestampMs } : {}),
  }))
  const annotations = dataset.samples.flatMap((sample, sampleIndex) => sample.annotations.map((annotation, annotationIndex) => {
    let categoryId = categoryIdByLabel.get(annotation.label)
    if (!categoryId) {
      categoryId = categoryIdByLabel.size + 1
      categoryIdByLabel.set(annotation.label, categoryId)
      categories.push({ id: categoryId, name: annotation.label })
    }
    return {
      id: sampleIndex * 100000 + annotationIndex + 1,
      image_id: sampleIndex + 1,
      category_id: categoryId,
      bbox: bboxToCoco(annotation.bbox),
      area: Number((annotation.bbox[2] * annotation.bbox[3] * 1000000).toFixed(3)),
      iscrowd: 0,
      segmentation: maskToCocoSegmentation(annotation.mask),
      ...(typeof annotation.confidence === 'number' ? { score: annotation.confidence } : {}),
      ...(annotation.trackId ? { track_id: annotation.trackId } : {}),
    }
  }))
  return {
    datasetId: dataset.datasetId,
    filename: readString(opts?.filename, `${dataset.datasetId}.coco.json`),
    format,
    mimeType: 'application/json',
    text: JSON.stringify({ images, annotations, categories }, null, 2),
  }
}
