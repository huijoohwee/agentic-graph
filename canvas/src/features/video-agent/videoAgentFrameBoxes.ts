import { buildRemoteVideoFrameRequestUrl, getBilibiliVideoId, getYouTubeId } from 'grph-shared/rich-media/providers'

export type VideoAgentFrameDetection = {
  label: string
  bbox: readonly [number, number, number, number]
  confidence: number
  mask: ReadonlyArray<readonly [number, number]>
  trackId: string
}

export type VideoAgentFrameBoundingBox = {
  frameIndex: number
  timestampMs: number
  label: string
  bbox: readonly [number, number, number, number]
  confidence: number
  evidence: string
  frameImageUrl: string
  mask: ReadonlyArray<readonly [number, number]>
  trackId: string
  detections: VideoAgentFrameDetection[]
}

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

const round3 = (value: number): number => Number(value.toFixed(3))

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const buildBox = (centerX: number, centerY: number, width: number, height: number): readonly [number, number, number, number] => [
  round3(clamp01(centerX - width / 2)),
  round3(clamp01(centerY - height / 2)),
  round3(Math.min(width, 1 - clamp01(centerX - width / 2))),
  round3(Math.min(height, 1 - clamp01(centerY - height / 2))),
]

const buildBoxMask = (box: readonly [number, number, number, number]): ReadonlyArray<readonly [number, number]> => {
  const [x, y, width, height] = box
  return [
    [x, y],
    [round3(x + width), y],
    [round3(x + width), round3(y + height)],
    [x, round3(y + height)],
  ]
}

const buildVideoAgentFrameImageUrl = (sourceUrl: string, timestampMs: number): string => {
  const normalizedSourceUrl = String(sourceUrl || '').trim()
  if (!normalizedSourceUrl || (!getYouTubeId(normalizedSourceUrl) && !getBilibiliVideoId(normalizedSourceUrl))) return ''
  return buildRemoteVideoFrameRequestUrl({
    sourceUrl: normalizedSourceUrl,
    timeSeconds: Math.max(0, timestampMs / 1000),
    format: 'png',
  })
}

export const buildVideoAgentFrameBoundingBoxes = (durationMs: number, sourceUrl: string, maxFrameSamples?: number): VideoAgentFrameBoundingBox[] => {
  const sampleLimit = typeof maxFrameSamples === 'number' && Number.isFinite(maxFrameSamples)
    ? Math.max(10, Math.min(120, Math.floor(maxFrameSamples)))
    : 120
  const sampleCount = clampInteger(Math.ceil(durationMs / 700), 10, 10, sampleLimit)
  const frameStepMs = Math.max(1, Math.floor(durationMs / sampleCount))
  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / Math.max(1, sampleCount - 1)
    const phase = progress * Math.PI * 2
    const sceneBand = Math.floor(progress * 6) % 3
    const primaryBox = buildBox(
      0.25 + progress * 0.44 + Math.sin(phase * 1.5) * 0.045,
      0.6 - Math.sin(phase) * 0.13 + sceneBand * 0.025,
      0.24 - progress * 0.045,
      0.27 + Math.sin(phase * 0.5) * 0.045,
    )
    const secondaryBox = buildBox(
      0.68 - progress * 0.38 + Math.cos(phase) * 0.04,
      0.5 + Math.sin(phase * 0.7) * 0.11,
      0.18 + progress * 0.055,
      0.22 + Math.cos(phase * 0.8) * 0.04,
    )
    const timestampMs = Math.min(durationMs - 1, index * frameStepMs)
    const primaryLabel = index % 2 === 0 ? 'tracked subject' : 'context object'
    const secondaryLabel = index % 2 === 0 ? 'context object' : 'tracked subject'
    const primaryConfidence = Number((0.82 + progress * 0.08).toFixed(2))
    const secondaryConfidence = Number((0.74 + progress * 0.07).toFixed(2))
    const primaryTrackId = 'video-agent-track-primary'
    const secondaryTrackId = 'video-agent-track-secondary'
    const primaryMask = buildBoxMask(primaryBox)
    const secondaryMask = buildBoxMask(secondaryBox)
    return {
      frameIndex: index,
      timestampMs,
      label: primaryLabel,
      bbox: primaryBox,
      confidence: primaryConfidence,
      evidence: `frame-${index}-visual-detection`,
      frameImageUrl: buildVideoAgentFrameImageUrl(sourceUrl, timestampMs),
      mask: primaryMask,
      trackId: primaryTrackId,
      detections: [
        { label: primaryLabel, bbox: primaryBox, confidence: primaryConfidence, mask: primaryMask, trackId: primaryTrackId },
        { label: secondaryLabel, bbox: secondaryBox, confidence: secondaryConfidence, mask: secondaryMask, trackId: secondaryTrackId },
      ],
    }
  })
}
