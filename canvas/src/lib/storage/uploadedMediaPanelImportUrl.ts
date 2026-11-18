import { resolveBinaryDownloadProxyUrl } from '@/lib/chatEndpoint'
import { deriveFilenameFromUrl, normalizeImportUrlInput, resolveDownloadedMediaAccessUrl } from '@/lib/url'
import { isVideoDownloadEligible } from '@/lib/video-download/isVideoDownloadEligible'
import { resolveVideoDownload } from '@/lib/video-download/videoDownloadResolver'
import type { VideoDownloadOptions } from '@/lib/video-download/types'
import { uploadFilesToUploadedMediaPanel, type UploadedMediaPanelUploadResult, type UploadedMediaPanelUploadSetItems } from '@/lib/storage/uploadedMediaPanelUpload'

type ImportUrlToUploadedMediaPanelArgs = {
  urlRaw: string
  setItems: UploadedMediaPanelUploadSetItems
  fetchImpl?: typeof fetch
  registerObjectUrl?: (url: string) => void
  onSynced?: (result: UploadedMediaPanelUploadResult) => void
  videoDownloadEndpoint?: string | null
}

type ResolveMediaImportUrlFileArgs = {
  urlRaw: string
  fetchImpl?: typeof fetch
  videoDownloadEndpoint?: string | null
}

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  avif: 'image/avif',
  flac: 'audio/flac',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  m4a: 'audio/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  png: 'image/png',
  svg: 'image/svg+xml',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
}

const DEFAULT_VIDEO_DOWNLOAD_OPTIONS: VideoDownloadOptions = {
  format: 'best',
  mediaKind: 'video-audio',
  quality: 'best',
  subtitleLang: '',
}

const normalizeContentType = (value: unknown): string => String(value || '').split(';')[0]?.trim().toLowerCase() || ''

const readMediaKindFromContentType = (contentType: string): 'image' | 'audio' | 'video' | null => {
  const type = normalizeContentType(contentType)
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  return null
}

const readExtensionFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    return String(parsed.pathname || '').match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() || ''
  } catch {
    return ''
  }
}

const readMediaContentTypeFromUrl = (url: string): string => {
  const extension = readExtensionFromUrl(url)
  return extension ? MEDIA_MIME_BY_EXTENSION[extension] || '' : ''
}

const ensureFilenameExtension = (filename: string, contentType: string): string => {
  const cleanName = String(filename || '').trim() || 'imported-media'
  if (/\.[a-z0-9]{2,8}$/i.test(cleanName)) return cleanName
  const extension = Object.entries(MEDIA_MIME_BY_EXTENSION).find(([, mime]) => mime === contentType)?.[0] || ''
  return extension ? `${cleanName}.${extension}` : cleanName
}

const fetchMediaUrlBlob = async (args: {
  fetchImpl: typeof fetch
  url: string
  contentTypeHint?: string
}): Promise<{ blob: Blob; contentType: string }> => {
  const proxyUrl = resolveBinaryDownloadProxyUrl(args.url)
  const fallbackContentType = normalizeContentType(args.contentTypeHint) || readMediaContentTypeFromUrl(args.url)
  const candidates = [args.url, proxyUrl].filter((value, index, values) => value && values.indexOf(value) === index)
  let lastError = ''
  for (const candidate of candidates) {
    try {
      const response = await args.fetchImpl(candidate, {
        headers: {
          accept: 'image/*,audio/*,video/*,*/*',
        },
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const blob = await response.blob()
      const headerContentType = normalizeContentType(response.headers.get('content-type'))
      const blobContentType = normalizeContentType(blob.type)
      const contentType = readMediaKindFromContentType(headerContentType)
        ? headerContentType
        : readMediaKindFromContentType(blobContentType)
          ? blobContentType
          : fallbackContentType
      if (!readMediaKindFromContentType(contentType)) {
        lastError = 'URL did not resolve to image, audio, or video media'
        continue
      }
      return { blob, contentType }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Request failed'
    }
  }
  throw new Error(lastError || 'Request failed')
}

export async function resolveMediaImportUrlFile(args: ResolveMediaImportUrlFileArgs): Promise<File> {
  const url = normalizeImportUrlInput(args.urlRaw)
  if (!url) throw new Error('Enter a valid http(s) media URL')
  const fetchImpl = args.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!fetchImpl) throw new Error('Fetch is unavailable')
  if (typeof File !== 'function') throw new Error('File uploads are unavailable')

  try {
    const { blob, contentType } = await fetchMediaUrlBlob({ fetchImpl, url })
    return new File([blob], ensureFilenameExtension(deriveFilenameFromUrl(url, 'imported-media'), contentType), { type: contentType, lastModified: Date.now() })
  } catch (directError) {
    if (!isVideoDownloadEligible(url)) throw directError
    const download = await resolveVideoDownload(url, DEFAULT_VIDEO_DOWNLOAD_OPTIONS, {
      endpoint: args.videoDownloadEndpoint,
      fetchImpl,
    })
    if (download.ok === false) throw new Error(download.error || 'Video download failed')
    const fileUrl = resolveDownloadedMediaAccessUrl(download.result)
    if (!fileUrl) throw new Error('Video download did not expose an accessible local media file')
    const { blob, contentType } = await fetchMediaUrlBlob({ fetchImpl, url: fileUrl, contentTypeHint: download.result.mimeType })
    return new File([blob], ensureFilenameExtension(download.result.fileName || deriveFilenameFromUrl(fileUrl, 'imported-media'), contentType), { type: contentType, lastModified: Date.now() })
  }
}

export async function importUrlToUploadedMediaPanel(args: ImportUrlToUploadedMediaPanelArgs): Promise<UploadedMediaPanelUploadResult[]> {
  const file = await resolveMediaImportUrlFile(args)
  return uploadFilesToUploadedMediaPanel({
    files: [file],
    setItems: args.setItems,
    registerObjectUrl: args.registerObjectUrl,
    onSynced: args.onSynced,
  })
}
