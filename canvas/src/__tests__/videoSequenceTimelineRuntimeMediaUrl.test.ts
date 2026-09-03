import { resolveTimelinePlanSourceUrl } from '@/components/timeline/timelinePlanSync'
import type { VideoSequenceTimelineSource } from '@/components/timeline/videoSequenceTimeline'

export function testVideoSequenceTimelineSourceUrlUsesCurrentLocalOrigin() {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalNow = Date.now
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost:5172' } }
  Date.now = () => 1_700_000_000_000
  try {
    const source: VideoSequenceTimelineSource = { byteSize: 100, id: 'clip_opening', importMode: 'url', mimeHint: 'video/mp4', originalName: 'opening.mp4', relativePath: 'opening.mp4', sourceUrl: 'http://localhost:5173/api/storage/media/airvio/runs/upload-demo/video/opening.mp4?agentic_os_media_token=stale', durationSeconds: 15, workspacePath: '' }
    const runtimeUrl = resolveTimelinePlanSourceUrl(source)
    if (!runtimeUrl.startsWith('http://localhost:5172/api/storage/media/airvio/runs/upload-demo/video/opening.mp4?agentic_os_media_token=')) throw new Error(`expected persisted local storage media source to bind to current runtime origin, got ${runtimeUrl}`)
    if (runtimeUrl.includes('localhost:5173') || runtimeUrl.includes('agentic_os_media_token=stale')) throw new Error(`expected persisted local storage media source to refresh stale local origin and token, got ${runtimeUrl}`)
  } finally {
    Date.now = originalNow
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}

export function testVideoSequenceTimelineSourceUrlIsStableWithinTokenTtl() {
  const originalWindow = (globalThis as { window?: unknown }).window
  const originalNow = Date.now
  let nowMs = 1_700_000_000_000
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost:5172' } }
  Date.now = () => nowMs
  try {
    const source: VideoSequenceTimelineSource = { byteSize: 100, id: 'clip_opening', importMode: 'url', mimeHint: 'video/mp4', originalName: 'opening.mp4', relativePath: 'opening.mp4', sourceUrl: 'http://localhost:5173/api/storage/media/airvio/runs/upload-demo/video/opening.mp4?agentic_os_media_token=stale', durationSeconds: 15, workspacePath: '' }
    const firstRuntimeUrl = resolveTimelinePlanSourceUrl(source)
    nowMs += 1_000
    const secondRuntimeUrl = resolveTimelinePlanSourceUrl(source)
    if (secondRuntimeUrl !== firstRuntimeUrl) throw new Error(`expected video-sequence source URL to stay stable during media-reader loops, got ${firstRuntimeUrl} then ${secondRuntimeUrl}`)
  } finally {
    Date.now = originalNow
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}
