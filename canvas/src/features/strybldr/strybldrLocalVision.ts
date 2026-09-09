import type { StrybldrElement } from './strybldrTypes'
import { hashText } from '@/features/parsers/hash'

type DetrDetection = {
  label?: string
  score?: number
  box?: {
    xmin?: number
    ymin?: number
    xmax?: number
    ymax?: number
  }
}

type DetrDetector = (input: string, options: { threshold: number; percentage: true }) => Promise<DetrDetection[]>

let detrDetectorPromise: Promise<unknown> | null = null

const shortHash = (value: unknown): string => hashText(String(value ?? '')).slice(0, 12)

const clamp01 = (value: unknown): number => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const getStrybldrDetrDetector = async (): Promise<DetrDetector> => {
  if (!detrDetectorPromise) {
    const mod = await import('@huggingface/transformers')
    const pipeline = mod.pipeline as unknown as (task: 'object-detection', model: string) => Promise<DetrDetector>
    detrDetectorPromise = pipeline('object-detection', 'Xenova/detr-resnet-50')
  }
  return await detrDetectorPromise as DetrDetector
}

const toImageInputUrl = (input: File | Blob | string): { url: string; revoke: () => void } => {
  if (typeof input === 'string') return { url: input, revoke: () => undefined }
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return { url: '', revoke: () => undefined }
  try {
    const url = URL.createObjectURL(input)
    return {
      url,
      revoke: () => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          void 0
        }
      },
    }
  } catch {
    return { url: '', revoke: () => undefined }
  }
}

export async function runStrybldrDetrObjectDetection(args: {
  input: File | Blob | string
  sourceUnitId: string
  threshold?: number
}): Promise<StrybldrElement[]> {
  const imageInput = toImageInputUrl(args.input)
  if (!imageInput.url) return []
  try {
    const detector = await getStrybldrDetrDetector()
    const output = await detector(imageInput.url, { threshold: args.threshold ?? 0.5, percentage: true }) as DetrDetection[]
    return (Array.isArray(output) ? output : [])
      .map((item, index): StrybldrElement | null => {
        const label = String(item.label || '').trim()
        if (!label) return null
        return {
          id: `strybldr-el-${shortHash(`${args.sourceUnitId}:detr:${label}:${index}`)}`,
          sourceUnitId: args.sourceUnitId,
          label,
          confidence: clamp01(item.score),
          sourceBox: item.box
            ? {
                xmin: clamp01(item.box.xmin),
                ymin: clamp01(item.box.ymin),
                xmax: clamp01(item.box.xmax),
                ymax: clamp01(item.box.ymax),
                unit: 'percentage',
              }
            : null,
          evidenceKind: 'local-object-detection',
          provider: 'transformers-detr',
          order: index + 1,
          summary: `${label} detected locally with DETR.`,
          action: `Treat ${label} as an editable storyboard element.`,
          prompt: `Animate the detected ${label} while preserving its relative position in the source image.`,
        }
      })
      .filter((item): item is StrybldrElement => !!item)
  } finally {
    imageInput.revoke()
  }
}

export async function runStrybldrHumanGeometry(args: {
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
  sourceUnitId: string
}): Promise<StrybldrElement[]> {
  const mod = await import('@vladmandic/human')
  const HumanCtor = mod.default
  const human = new HumanCtor({
    backend: 'webgl',
    async: true,
    warmup: 'none',
    face: {
      enabled: true,
      description: { enabled: false },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
    },
    body: { enabled: true },
    hand: { enabled: true },
    object: { enabled: false },
    gesture: { enabled: false },
  })
  const result = await human.detect(args.input)
  const elements: StrybldrElement[] = []
  const persons = Array.isArray((result as { persons?: unknown }).persons) ? (result as { persons?: unknown[] }).persons || [] : []
  for (let i = 0; i < persons.length; i += 1) {
    elements.push({
      id: `strybldr-el-${shortHash(`${args.sourceUnitId}:human:person:${i}`)}`,
      sourceUnitId: args.sourceUnitId,
      label: `Person ${i + 1}`,
      confidence: 0.5,
      sourceBox: null,
      evidenceKind: 'local-human-geometry',
      provider: 'human',
      order: i + 1,
      summary: 'Person geometry detected locally without identity, demographic, or embedding fields.',
      action: 'Use pose and placement only; do not infer identity.',
      prompt: 'Animate the person geometry while preserving privacy-safe pose cues.',
    })
  }
  return elements
}
