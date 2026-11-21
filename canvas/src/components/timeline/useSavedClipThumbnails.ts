import React from 'react'
import { readMermaidGanttFrameSamples } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'
import { useGraphStore } from '@/hooks/useGraphStore'
import { DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH, remoteVideoFrameMimeType } from 'grph-shared/rich-media/providers'
import { SAVED_FRAMES_CHANGED_EVENT } from '@/lib/rich-media/videoFrameAssets'
import { loadSavedVideoFrames, type SavedVideoFrameCatalog } from '@/lib/rich-media/savedVideoFrameCatalog'
import { readSavedFrameSelection, subscribeSavedFrameSelection } from '@/lib/rich-media/savedVideoFrameSelection'
import { readWorkspaceFrameFormat } from '@/lib/rich-media/videoFrameSettings'
import type { TimelineMediaReaderThumbnail } from './timelineMediaReader'

const MAX_VISIBLE = 16
type ClipWindow = { sourceStartSeconds: number; sourceEndSeconds: number }

function frameSource(url?: string) {
  if (!url?.startsWith(DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH + '?')) return ''
  return new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('url') || ''
}

export function savedClipThumbnailTimes(times: readonly number[], window: ClipWindow, selected?: number) {
  const eligible = times.filter(time => time >= window.sourceStartSeconds && time <= window.sourceEndSeconds)
  if (eligible.length <= MAX_VISIBLE) return eligible
  const samples = Array.from({ length: MAX_VISIBLE }, (_, i) => eligible[Math.round(i * (eligible.length - 1) / (MAX_VISIBLE - 1))])
  if (selected != null && eligible.includes(selected) && !samples.includes(selected)) {
    const closest = samples.reduce((best, time, i) => Math.abs(time - selected) < Math.abs(samples[best] - selected) ? i : best, 0)
    samples[closest] = selected
  }
  return samples
}

export function useSavedClipThumbnails(original: readonly TimelineMediaReaderThumbnail[], window: ClipWindow | null, authoredRow: string) {
  const imported = useGraphStore(state => /(?:^|\n)kgVideoAgentImport:\s*true\s*\n/.test(state.markdownDocumentText || ''))
  const source = React.useMemo(() => imported && original.length
    ? frameSource(original[0].rasterDataUrl) || frameSource(readMermaidGanttFrameSamples(authoredRow)[0]?.url)
    : '', [imported, original, authoredRow])
  const [listing, setListing] = React.useState<{ source: string; catalog?: SavedVideoFrameCatalog }>()
  React.useEffect(() => {
    if (!source) return
    let active = true
    const load = () => {
      void loadSavedVideoFrames(source).then(catalog => {
        if (active) setListing({ source, catalog })
      }, () => { if (active) setListing({ source }) })
    }
    const refresh = (event: Event) => { if ((event as CustomEvent).detail === source) load() }
    load()
    globalThis.window.addEventListener(SAVED_FRAMES_CHANGED_EVENT, refresh)
    return () => { active = false; globalThis.window.removeEventListener(SAVED_FRAMES_CHANGED_EVENT, refresh) }
  }, [source])
  const selection = React.useSyncExternalStore(subscribeSavedFrameSelection, readSavedFrameSelection, () => null)
  const catalog = listing?.source === source ? listing.catalog : undefined
  const thumbnails = React.useMemo(() => {
    if (!source) return original
    if (!catalog?.times.length) return []
    const bounds = window || { sourceStartSeconds: original[0].timestampSeconds, sourceEndSeconds: original[original.length - 1].timestampSeconds }
    const selected = selection?.sourceUrl === source ? selection : null
    const format = readWorkspaceFrameFormat()
    return savedClipThumbnailTimes(catalog.times, bounds, selected?.seconds).map(seconds => {
      const requested = seconds === selected?.seconds ? selected.image?.url : undefined
      const frame = (requested && catalog.at(seconds, format, requested)) || catalog.at(seconds, format)!
      const encoding = frame.format === 'jpg' ? 'jpeg' : frame.format
      const mime = remoteVideoFrameMimeType(frame.format)
      return { ...original[0], timestampSeconds: seconds, dataUrl: frame.url, rasterDataUrl: frame.url, format: encoding,
        rasterFormat: encoding, mimeType: mime, rasterMimeType: mime } satisfies TimelineMediaReaderThumbnail
    })
  }, [original, source, catalog, window, selection])
  return { source, thumbnails }
}
