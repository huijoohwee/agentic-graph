import React from 'react'
import type { PreferredMediaImageFormat } from '@/lib/media/mediaFormatPreference'
import type { VideoSequenceTimelineSource } from './videoSequenceTimeline'
import {
  fetchNativeMediaContainerBytes,
  readNativeIsoBmffContainerSummary,
} from './timelineMediaMetadata'

export type TimelineMediaReaderStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

export type TimelineMediaReaderSummary = {
  audioTrackCount: number
  audioChannelCount: number
  audioSampleRate: number
  averageVideoBitrate: number
  averageVideoFrameRate: number
  audioWaveformSamples: number[]
  byteSize: number
  bytesRead: number
  canDecodeAudio: boolean | null
  canDecodeVideo: boolean | null
  compatibleBrands: string[]
  containerBrand: string
  displayHeight: number
  displayWidth: number
  durationSeconds: number
  durationSource: 'computed' | 'metadata' | ''
  formatName: string
  metadataReadRatio: number
  mimeType: string
  primaryAudioCodec: string
  primaryVideoCodec: string
  status: TimelineMediaReaderStatus
  thumbnailHeight: number
  thumbnails: TimelineMediaReaderThumbnail[]
  thumbnailWidth: number
  timeResolution: number
  videoTrackCount: number
}

export type TimelineMediaReaderThumbnail = {
  dataUrl: string
  format: PreferredMediaImageFormat
  height: number
  mimeType: string
  rasterDataUrl: string
  rasterFormat: Exclude<PreferredMediaImageFormat, 'svg'>
  rasterMimeType: string
  timestampSeconds: number
  width: number
}

type NativeMediaElementSummary = {
  durationSeconds: number
  displayHeight: number
  displayWidth: number
  canPlayMp4: boolean | null
}

const EMPTY_TIMELINE_MEDIA_READER_SUMMARY: TimelineMediaReaderSummary = {
  audioTrackCount: 0,
  audioChannelCount: 0,
  audioSampleRate: 0,
  averageVideoBitrate: 0,
  averageVideoFrameRate: 0,
  audioWaveformSamples: [],
  byteSize: 0,
  bytesRead: 0,
  canDecodeAudio: null,
  canDecodeVideo: null,
  compatibleBrands: [],
  containerBrand: '',
  displayHeight: 0,
  displayWidth: 0,
  durationSeconds: 0,
  durationSource: '',
  formatName: '',
  metadataReadRatio: 0,
  mimeType: '',
  primaryAudioCodec: '',
  primaryVideoCodec: '',
  status: 'idle',
  thumbnailHeight: 0,
  thumbnails: [],
  thumbnailWidth: 0,
  timeResolution: 0,
  videoTrackCount: 0,
}

const TIMELINE_MEDIA_READER_CACHE = new Map<string, Promise<TimelineMediaReaderSummary>>()
const NATIVE_MEDIA_METADATA_TIMEOUT_MS = 3000
const NATIVE_MEDIA_THUMBNAIL_MIN_COUNT = 9
const NATIVE_MEDIA_THUMBNAIL_MAX_COUNT = 24
const NATIVE_MEDIA_THUMBNAIL_HEIGHT = 90
const NATIVE_MEDIA_THUMBNAIL_MAX_WIDTH = 160
const NATIVE_MEDIA_THUMBNAIL_TIMEOUT_MS = 4500
const NATIVE_MEDIA_WAVEFORM_SAMPLE_COUNT = 1024
const NATIVE_MEDIA_WAVEFORM_TIMEOUT_MS = 5000
const NATIVE_IMAGE_THUMBNAIL_HEIGHT = 90
const NATIVE_IMAGE_THUMBNAIL_MAX_WIDTH = 160

const clean = (value: unknown): string => String(value || '').trim()

const readPositiveNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const toSvgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const isNativeImageMediaUrl = (url: string): boolean => {
  const normalized = clean(url).toLowerCase()
  return /^data:image\//.test(normalized) || /(?:^|\/)image(?:\/|$)/.test(normalized) || /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/.test(normalized)
}

const readImageFormatFromUrl = (url: string): PreferredMediaImageFormat => {
  const normalized = clean(url).toLowerCase()
  if (/\.svg(?:[?#]|$)|^data:image\/svg\+xml/.test(normalized)) return 'svg'
  if (/\.webp(?:[?#]|$)|^data:image\/webp/.test(normalized)) return 'webp'
  if (/\.png(?:[?#]|$)|^data:image\/png/.test(normalized)) return 'png'
  return 'jpeg'
}

function loadNativeMediaElementMetadata(url: string): Promise<NativeMediaElementSummary> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
    }
    const finish = (summary: NativeMediaElementSummary) => {
      cleanup()
      resolve(summary)
    }
    const timeoutId = window.setTimeout(() => {
      finish({ canPlayMp4: null, displayHeight: 0, displayWidth: 0, durationSeconds: 0 })
    }, NATIVE_MEDIA_METADATA_TIMEOUT_MS)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      finish({
        canPlayMp4: !!video.canPlayType('video/mp4'),
        displayHeight: readPositiveNumber(video.videoHeight),
        displayWidth: readPositiveNumber(video.videoWidth),
        durationSeconds: readPositiveNumber(video.duration),
      })
    }
    video.onerror = () => {
      finish({ canPlayMp4: !!video.canPlayType('video/mp4'), displayHeight: 0, displayWidth: 0, durationSeconds: 0 })
    }
    video.src = url
    video.load()
  })
}

const waitForMediaEvent = (media: HTMLMediaElement, eventName: keyof HTMLMediaElementEventMap, timeoutMs: number): Promise<boolean> => new Promise(resolve => {
  const cleanup = () => {
    window.clearTimeout(timeoutId)
    media.removeEventListener(eventName, handleEvent)
    media.removeEventListener('error', handleError)
  }
  const finish = (ok: boolean) => {
    cleanup()
    resolve(ok)
  }
  const handleEvent = () => finish(true)
  const handleError = () => finish(false)
  const timeoutId = window.setTimeout(() => finish(false), timeoutMs)
  media.addEventListener(eventName, handleEvent, { once: true })
  media.addEventListener('error', handleError, { once: true })
})

const resolveThumbnailTimestamps = (durationSeconds: number, count: number): number[] => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || count <= 0) return []
  const safeEnd = Math.max(0, durationSeconds - 0.05)
  if (count === 1) return [Math.min(safeEnd, Math.max(0, durationSeconds * 0.5))]
  return Array.from({ length: count }, (_, index) => {
    const ratio = (index + 0.5) / count
    return Math.min(safeEnd, Math.max(0, durationSeconds * ratio))
  })
}

const resolveNativeMediaThumbnailCount = (durationSeconds: number): number => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return NATIVE_MEDIA_THUMBNAIL_MIN_COUNT
  return Math.min(
    NATIVE_MEDIA_THUMBNAIL_MAX_COUNT,
    Math.max(NATIVE_MEDIA_THUMBNAIL_MIN_COUNT, Math.ceil(durationSeconds)),
  )
}

const readCanvasRasterThumbnail = (canvas: HTMLCanvasElement): {
  dataUrl: string
  format: Exclude<PreferredMediaImageFormat, 'svg'>
  mimeType: string
} => {
  const webp = canvas.toDataURL('image/webp', 0.78)
  if (webp.startsWith('data:image/webp')) {
    return { dataUrl: webp, format: 'webp', mimeType: 'image/webp' }
  }
  const png = canvas.toDataURL('image/png')
  if (png.startsWith('data:image/png')) {
    return { dataUrl: png, format: 'png', mimeType: 'image/png' }
  }
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.76),
    format: 'jpeg',
    mimeType: 'image/jpeg',
  }
}

const buildSemanticThumbnailSvgDataUrl = (args: {
  height: number
  label: string
  rasterDataUrl: string
  rasterFormat: Exclude<PreferredMediaImageFormat, 'svg'>
  timestampSeconds: number
  width: number
}): string => {
  const title = `${args.label} thumbnail ${args.timestampSeconds.toFixed(2)}s`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><desc>Native in-repo timeline thumbnail generated from a video frame; embedded raster format ${escapeXml(args.rasterFormat)}.</desc><metadata>{"kind":"video-thumbnail","format":"svg","rasterFormat":"${args.rasterFormat}","timestampSeconds":${Number(args.timestampSeconds.toFixed(6))},"microsecondTimestamp":${Math.max(0, Math.round(args.timestampSeconds * 1_000_000))}}</metadata><image href="${args.rasterDataUrl}" width="${args.width}" height="${args.height}" preserveAspectRatio="xMidYMid slice"/></svg>`
  return toSvgDataUrl(svg)
}

function loadNativeImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image()
    const cleanup = () => {
      window.clearTimeout(timeoutId)
    }
    const finish = (nextImage: HTMLImageElement | null) => {
      cleanup()
      resolve(nextImage)
    }
    const timeoutId = window.setTimeout(() => finish(null), NATIVE_MEDIA_METADATA_TIMEOUT_MS)
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = url
  })
}

async function loadNativeImageThumbnails(url: string): Promise<TimelineMediaReaderThumbnail[]> {
  if (!url || typeof window === 'undefined' || typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return []
  const image = await loadNativeImageElement(url)
  if (!image) return []
  const sourceWidth = readPositiveNumber(image.naturalWidth) || readPositiveNumber(image.width) || 16
  const sourceHeight = readPositiveNumber(image.naturalHeight) || readPositiveNumber(image.height) || 9
  const thumbnailHeight = NATIVE_IMAGE_THUMBNAIL_HEIGHT
  const thumbnailWidth = Math.max(1, Math.min(NATIVE_IMAGE_THUMBNAIL_MAX_WIDTH, Math.round((sourceWidth / sourceHeight) * thumbnailHeight)))
  const fallbackFormat = readImageFormatFromUrl(url)
  const fallbackRasterFormat = fallbackFormat === 'webp' || fallbackFormat === 'png' || fallbackFormat === 'jpeg' ? fallbackFormat : 'png'
  const fallbackMimeType = fallbackRasterFormat === 'webp' ? 'image/webp' : fallbackRasterFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
  let rasterThumbnail = { dataUrl: url, format: fallbackRasterFormat, mimeType: fallbackMimeType }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = thumbnailWidth
    canvas.height = thumbnailHeight
    const context = canvas.getContext('2d', { alpha: false })
    if (context) {
      context.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight)
      rasterThumbnail = readCanvasRasterThumbnail(canvas)
    }
  } catch {
    rasterThumbnail = { dataUrl: url, format: fallbackRasterFormat, mimeType: fallbackMimeType }
  }
  return [{
    dataUrl: buildSemanticThumbnailSvgDataUrl({
      height: thumbnailHeight,
      label: 'Image',
      rasterDataUrl: rasterThumbnail.dataUrl,
      rasterFormat: rasterThumbnail.format,
      timestampSeconds: 0,
      width: thumbnailWidth,
    }),
    format: 'svg',
    height: thumbnailHeight,
    mimeType: 'image/svg+xml',
    rasterDataUrl: rasterThumbnail.dataUrl,
    rasterFormat: rasterThumbnail.format,
    rasterMimeType: rasterThumbnail.mimeType,
    timestampSeconds: 0,
    width: thumbnailWidth,
  }]
}

async function loadNativeVideoThumbnails(args: {
  displayHeight: number
  displayWidth: number
  durationSeconds: number
  url: string
}): Promise<TimelineMediaReaderThumbnail[]> {
  if (
    !args.url
    || !Number.isFinite(args.durationSeconds)
    || args.durationSeconds <= 0
    || typeof document === 'undefined'
    || typeof HTMLCanvasElement === 'undefined'
  ) return []
  const sourceWidth = readPositiveNumber(args.displayWidth) || 16
  const sourceHeight = readPositiveNumber(args.displayHeight) || 9
  const thumbnailHeight = NATIVE_MEDIA_THUMBNAIL_HEIGHT
  const thumbnailWidth = Math.max(1, Math.min(NATIVE_MEDIA_THUMBNAIL_MAX_WIDTH, Math.round((sourceWidth / sourceHeight) * thumbnailHeight)))
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  canvas.width = thumbnailWidth
  canvas.height = thumbnailHeight
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return []
  try {
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    const metadataReadyPromise = waitForMediaEvent(video, 'loadedmetadata', NATIVE_MEDIA_METADATA_TIMEOUT_MS)
    video.src = args.url
    video.load()
    const metadataReady = await metadataReadyPromise
    if (!metadataReady) return []
    const thumbnails: TimelineMediaReaderThumbnail[] = []
    for (const timestampSeconds of resolveThumbnailTimestamps(args.durationSeconds, resolveNativeMediaThumbnailCount(args.durationSeconds))) {
      const seekReadyPromise = waitForMediaEvent(video, 'seeked', NATIVE_MEDIA_THUMBNAIL_TIMEOUT_MS)
      video.currentTime = timestampSeconds
      const seekReady = await seekReadyPromise
      if (!seekReady) continue
      try {
        context.drawImage(video, 0, 0, thumbnailWidth, thumbnailHeight)
        const rasterThumbnail = readCanvasRasterThumbnail(canvas)
        thumbnails.push({
          dataUrl: buildSemanticThumbnailSvgDataUrl({
            height: thumbnailHeight,
            label: 'Video',
            rasterDataUrl: rasterThumbnail.dataUrl,
            rasterFormat: rasterThumbnail.format,
            timestampSeconds,
            width: thumbnailWidth,
          }),
          format: 'svg',
          height: thumbnailHeight,
          mimeType: 'image/svg+xml',
          rasterDataUrl: rasterThumbnail.dataUrl,
          rasterFormat: rasterThumbnail.format,
          rasterMimeType: rasterThumbnail.mimeType,
          timestampSeconds,
          width: thumbnailWidth,
        })
      } catch {
        return thumbnails
      }
    }
    return thumbnails
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

async function loadNativeAudioWaveformSamples(url: string): Promise<number[]> {
  if (!url || typeof window === 'undefined' || typeof AudioContext === 'undefined') return []
  const audioContext = new AudioContext()
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), NATIVE_MEDIA_WAVEFORM_TIMEOUT_MS)
    const buffer = await fetch(url, { signal: controller.signal }).then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error('audio fetch failed'))).finally(() => window.clearTimeout(timeoutId))
    const decoded = await audioContext.decodeAudioData(buffer.slice(0))
    const channelCount = Math.max(1, decoded.numberOfChannels)
    const samplesPerBucket = Math.max(1, Math.floor(decoded.length / NATIVE_MEDIA_WAVEFORM_SAMPLE_COUNT))
    return Array.from({ length: NATIVE_MEDIA_WAVEFORM_SAMPLE_COUNT }, (_, bucketIndex) => {
      const start = bucketIndex * samplesPerBucket
      const end = Math.min(decoded.length, start + samplesPerBucket)
      let peak = 0
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const channel = decoded.getChannelData(channelIndex)
        for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(channel[index] || 0))
      }
      return Math.round(Math.max(4, Math.min(100, peak * 100)))
    })
  } catch {
    return []
  } finally {
    void audioContext.close()
  }
}

const buildNativeAudioPacketWaveformSamples = (sampleSizes: readonly number[]): number[] => {
  if (!sampleSizes.length) return []
  const maxSize = Math.max(1, ...sampleSizes)
  return sampleSizes.map(size => Math.round(Math.max(4, Math.min(100, (size / maxSize) * 100))))
}

const canDecodeCodec = (codec: string, kind: 'audio' | 'video'): boolean | null => {
  if (!codec || typeof document === 'undefined') return null
  const probe = document.createElement(kind === 'audio' ? 'audio' : 'video')
  const container = kind === 'audio' ? 'audio/mp4' : 'video/mp4'
  const result = probe.canPlayType(`${container}; codecs="${codec}"`) || probe.canPlayType(container)
  return result ? true : false
}

async function loadTimelineMediaReaderSummaryUncached(url: string): Promise<TimelineMediaReaderSummary> {
  if (!url || typeof window === 'undefined' || typeof document === 'undefined') return EMPTY_TIMELINE_MEDIA_READER_SUMMARY
  if (isNativeImageMediaUrl(url)) {
    const thumbnails = await loadNativeImageThumbnails(url)
    if (thumbnails.length) {
      return {
        ...EMPTY_TIMELINE_MEDIA_READER_SUMMARY,
        displayHeight: thumbnails[0]?.height || 0,
        displayWidth: thumbnails[0]?.width || 0,
        durationSeconds: 1,
        durationSource: 'computed',
        formatName: readImageFormatFromUrl(url),
        mimeType: thumbnails[0]?.rasterMimeType || 'image/*',
        status: 'ready',
        thumbnailHeight: thumbnails[0]?.height || 0,
        thumbnails,
        thumbnailWidth: thumbnails[0]?.width || 0,
      }
    }
  }
  const [mediaElement, container] = await Promise.all([
    loadNativeMediaElementMetadata(url),
    fetchNativeMediaContainerBytes(url).then(readNativeIsoBmffContainerSummary),
  ])
  const durationSeconds = container.durationSeconds || mediaElement.durationSeconds
  const displayWidth = container.displayWidth || mediaElement.displayWidth
  const displayHeight = container.displayHeight || mediaElement.displayHeight
  const videoTrackCount = container.videoTrackCount || (displayWidth > 0 || displayHeight > 0 ? 1 : 0)
  const [thumbnails, decodedAudioWaveformSamples] = await Promise.all([
    videoTrackCount > 0 ? loadNativeVideoThumbnails({ displayHeight, displayWidth, durationSeconds, url }) : Promise.resolve([]),
    container.audioTrackCount > 0 ? loadNativeAudioWaveformSamples(url) : Promise.resolve([]),
  ])
  const audioWaveformSamples = decodedAudioWaveformSamples.length ? decodedAudioWaveformSamples : buildNativeAudioPacketWaveformSamples(container.audioSampleSizes)
  const status: TimelineMediaReaderStatus = durationSeconds > 0 || videoTrackCount > 0 || container.audioTrackCount > 0
    ? 'ready'
    : (mediaElement.canPlayMp4 === false ? 'unsupported' : 'error')
  return {
    audioTrackCount: container.audioTrackCount,
    audioChannelCount: container.audioChannelCount,
    audioSampleRate: container.audioSampleRate,
    averageVideoBitrate: container.averageVideoBitrate,
    averageVideoFrameRate: container.averageVideoFrameRate,
    audioWaveformSamples,
    byteSize: container.byteSize,
    bytesRead: container.bytesRead,
    canDecodeAudio: canDecodeCodec(container.primaryAudioCodec, 'audio'),
    canDecodeVideo: canDecodeCodec(container.primaryVideoCodec, 'video') ?? mediaElement.canPlayMp4,
    compatibleBrands: container.compatibleBrands,
    containerBrand: container.containerBrand,
    displayHeight,
    displayWidth,
    durationSeconds,
    durationSource: container.durationSeconds ? 'computed' : (mediaElement.durationSeconds ? 'metadata' : ''),
    formatName: container.formatName,
    metadataReadRatio: container.metadataReadRatio,
    mimeType: container.mimeType,
    primaryAudioCodec: container.primaryAudioCodec,
    primaryVideoCodec: container.primaryVideoCodec,
    status,
    thumbnailHeight: thumbnails[0]?.height || 0,
    thumbnails,
    thumbnailWidth: thumbnails[0]?.width || 0,
    timeResolution: container.timeResolution,
    videoTrackCount,
  }
}

export function loadTimelineMediaReaderSummary(url: string): Promise<TimelineMediaReaderSummary> {
  const key = clean(url)
  if (!key) return Promise.resolve(EMPTY_TIMELINE_MEDIA_READER_SUMMARY)
  const cached = TIMELINE_MEDIA_READER_CACHE.get(key)
  if (cached) return cached
  const pending = loadTimelineMediaReaderSummaryUncached(key)
  TIMELINE_MEDIA_READER_CACHE.set(key, pending)
  return pending
}

export function useTimelineMediaReaderSummary(args: {
  active: boolean
  url: string
}): TimelineMediaReaderSummary {
  const url = clean(args.url)
  const [summary, setSummary] = React.useState<TimelineMediaReaderSummary>(EMPTY_TIMELINE_MEDIA_READER_SUMMARY)

  React.useEffect(() => {
    if (!args.active || !url) {
      setSummary(EMPTY_TIMELINE_MEDIA_READER_SUMMARY)
      return
    }
    let cancelled = false
    setSummary({ ...EMPTY_TIMELINE_MEDIA_READER_SUMMARY, status: 'loading' })
    void loadTimelineMediaReaderSummary(url).then(nextSummary => {
      if (cancelled) return
      setSummary(nextSummary)
    })
    return () => {
      cancelled = true
    }
  }, [args.active, url])

  return summary
}

export function useTimelineMediaReaderSummaries(args: {
  active: boolean
  urls: readonly string[]
}): Readonly<Record<string, TimelineMediaReaderSummary>> {
  const urlsKey = JSON.stringify(Array.from(new Set(args.urls.map(clean).filter(Boolean))).sort())
  const urls = React.useMemo<string[]>(() => JSON.parse(urlsKey), [urlsKey])
  const [summaries, setSummaries] = React.useState<Readonly<Record<string, TimelineMediaReaderSummary>>>({})

  React.useEffect(() => {
    if (!args.active || !urls.length) {
      setSummaries({})
      return
    }
    let cancelled = false
    setSummaries(Object.fromEntries(urls.map(url => [url, { ...EMPTY_TIMELINE_MEDIA_READER_SUMMARY, status: 'loading' }])))
    void Promise.all(urls.map(async url => [url, await loadTimelineMediaReaderSummary(url)] as const)).then(entries => {
      if (cancelled) return
      setSummaries(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [args.active, urls])

  return summaries
}

export function mergeTimelineMediaReaderSummaryWithSource(
  summary: TimelineMediaReaderSummary,
  source: VideoSequenceTimelineSource | null | undefined,
): TimelineMediaReaderSummary {
  if (!source) return summary
  const durationSeconds = readPositiveNumber(source.durationSeconds)
  const displayWidth = readPositiveNumber(source.displayWidth)
  const displayHeight = readPositiveNumber(source.displayHeight)
  const frameRate = readPositiveNumber(source.frameRate)
  const byteSize = source.byteSize != null ? readPositiveNumber(source.byteSize) : 0
  const hasSourceMetadata = durationSeconds > 0 || displayWidth > 0 || displayHeight > 0 || frameRate > 0 || byteSize > 0 || !!clean(source.mimeHint)
  if (!hasSourceMetadata) return summary
  return {
    ...summary,
    averageVideoFrameRate: summary.averageVideoFrameRate || frameRate,
    byteSize: summary.byteSize || byteSize,
    displayHeight: summary.displayHeight || displayHeight,
    displayWidth: summary.displayWidth || displayWidth,
    durationSeconds: summary.durationSeconds || durationSeconds,
    durationSource: summary.durationSource || (durationSeconds > 0 ? 'metadata' : ''),
    mimeType: summary.mimeType || clean(source.mimeHint),
    status: summary.status === 'idle' || summary.status === 'error' ? 'ready' : summary.status,
    videoTrackCount: summary.videoTrackCount || (displayWidth > 0 || displayHeight > 0 || durationSeconds > 0 ? 1 : 0),
  }
}
