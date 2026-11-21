import { buildRemoteVideoFrameFileName, type RemoteVideoFrameFormat, DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH } from 'grph-shared/rich-media/providers'
import { readSavedFrameDirectory, SAVED_FRAMES_CHANGED_EVENT, TRANSCRIPT_FRAME_BATCH_SIZE } from '@/lib/rich-media/videoFrameAssets'
import { readWorkspaceFrameFormat } from '@/lib/rich-media/videoFrameSettings'
import type { WorkspaceImportProgress } from './types'
import { forgetSavedVideoFrames } from '@/lib/rich-media/savedVideoFrameCatalog'
import { timestampLinkSeconds } from '@/lib/rich-media/videoTimestampLink'

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
  for (const match of markdown.matchAll(/https?:\/\/[^\s)<>"\]]+/gi)) {
    add(timestampLinkSeconds(match[0], sourceUrl), 1000)
  }
  return [...millis].sort((a, b) => a - b).map(ms => ms / 1000)
}

export async function saveTranscriptFrames(args: {
  sourceUrl: string
  text: string
  transcriptJsonText?: string | null
  format?: RemoteVideoFrameFormat
  onProgress?: (progress: WorkspaceImportProgress) => void
}, fetchPage: typeof fetch = fetch) {
  const { sourceUrl, format = readWorkspaceFrameFormat() } = args
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
    forgetSavedVideoFrames(sourceUrl)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SAVED_FRAMES_CHANGED_EVENT, { detail: sourceUrl }))
  }
}
