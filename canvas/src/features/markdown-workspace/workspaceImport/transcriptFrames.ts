import { buildRemoteVideoFrameFileName, DEFAULT_REMOTE_VIDEO_FRAME_FORMAT, DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH, getYouTubeId, parseYouTubeStartSeconds } from 'grph-shared/rich-media/providers'
import { readSavedFrameDirectory, SAVED_FRAMES_CHANGED_EVENT, TRANSCRIPT_FRAME_BATCH_SIZE } from '@/lib/rich-media/videoFrameAssets'
import type { WorkspaceImportProgress } from './types'

function timestampLinkSeconds(href: string, source: URL, videoId: string | null): number | null {
  try {
    const link = new URL(href, source)
    const time = link.searchParams.get('t') ?? link.searchParams.get('start') ?? new URLSearchParams(link.hash.slice(1)).get('t')
    if (!time) return null
    const seconds = /^\d+(?:\.\d+)?$/.test(time) ? Number(time) : parseYouTubeStartSeconds(link.href)
    if (videoId && getYouTubeId(link.href) === videoId) return seconds
    function mediaIdentity(url: URL) {
      const value = new URL(url)
      value.searchParams.delete('t')
      value.searchParams.delete('start')
      value.hash = ''
      return value.href
    }
    return mediaIdentity(link) === mediaIdentity(source) ? seconds : null
  } catch { return null }
}

/** Use recorded source times only. Paragraph playback links can differ from fractional cue starts. */
export function transcriptFrameTimes(sourceUrl: string, markdown: string, transcriptJson?: string | null): number[] {
  const millis = new Set<number>()
  function add(value: unknown, scale: number) {
    if (value === undefined || value === null || value === '' || typeof value === 'boolean') return
    const ms = Math.round(Number(value) * scale)
    if (Number.isSafeInteger(ms) && ms >= 0) millis.add(ms)
  }
  if (transcriptJson) {
    const transcript = JSON.parse(transcriptJson)
    if (Array.isArray(transcript?.segments)) {
      for (const cue of transcript.segments) {
        if (!cue || typeof cue !== 'object') continue
        const seconds = cue.start ?? cue.start_s ?? cue.start_seconds
        if (seconds != null) add(seconds, 1000)
        else add(cue.startMs, 1)
      }
    }
  }
  const source = new URL(sourceUrl)
  const videoId = getYouTubeId(sourceUrl)
  for (const match of markdown.matchAll(/https?:\/\/[^\s)<>"\]]+/gi)) {
    add(timestampLinkSeconds(match[0], source, videoId), 1000)
  }
  return [...millis].sort((a, b) => a - b).map(ms => ms / 1000)
}

export async function saveTranscriptFrames(args: {
  sourceUrl: string
  text: string
  transcriptJsonText?: string | null
  format?: 'png' | 'jpg'
  onProgress?: (progress: WorkspaceImportProgress) => void
}, fetchPage: typeof fetch = fetch) {
  const { sourceUrl, format = DEFAULT_REMOTE_VIDEO_FRAME_FORMAT } = args
  const times = transcriptFrameTimes(sourceUrl, args.text, args.transcriptJsonText)
  if (!times.length) return
  const saved = await readSavedFrameDirectory(sourceUrl, undefined, fetchPage)
  const present = new Set(saved.files)
  const name = (timeSeconds: number) => buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds, format })
  const missing = times.filter(time => !present.has(name(time)))
  let complete = times.length - missing.length
  const report = () => args.onProgress?.({
    phase: 'writing', current: complete, total: times.length, label: `Saved ${complete} of ${times.length} timestamp frames`,
  })
  report()
  if (!missing.length) return
  try {
    for (let i = 0; i < missing.length; i += TRANSCRIPT_FRAME_BATCH_SIZE) {
      const batch = missing.slice(i, i + TRANSCRIPT_FRAME_BATCH_SIZE)
      const query = new URLSearchParams({ url: sourceUrl, times: batch.join(','), format })
      const url = DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH + '?' + query
      for (let attempt = 0; ; attempt++) {
        const response = await fetchPage(url, { method: 'POST', headers: { 'X-Workspace-Frame-Import': '1' } })
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('This host does not support saving video timestamp frames.')
        const result = await response.json()
        if (!response.ok || result.ok !== true) {
          // A long import can outlive an individual decoder lease. Saved files survive the retry.
          if (!attempt && (response.status === 504 || (response.status === 502 && /deadline/i.test(result.error)))) continue
          throw new Error(result.error || 'The workspace frame extractor is unavailable.')
        }
        if (!Array.isArray(result.files) || result.files.length !== batch.length ||
          batch.some((time, index) => result.files[index] !== name(time))) throw new Error('Incomplete timestamp frame receipt.')
        break
      }
      complete += batch.length
      report()
    }
  } catch (error) {
    throw new Error(`Timestamp frames: ${complete} of ${times.length} confirmed. ${error instanceof Error ? error.message : String(error)} Reimport to resume.`)
  } finally {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SAVED_FRAMES_CHANGED_EVENT, { detail: sourceUrl }))
  }
}
