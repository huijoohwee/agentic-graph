import {
  buildLocalFsFetchPath,
  buildCodebaseFilePath,
  deriveFilenameFromUrl,
  isLikelyAbsoluteFsPath,
  isYouTubeUrl,
  normalizeGitHubBlobLikeUrl,
  unwrapUserProvidedText,
} from '@/lib/url'
import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import { describeFetchRemoteTextFailure } from '@/lib/net/fetchRemoteTextFailure'
import { convertPdfUrlToMarkdown, fetchYouTubeTranscriptMarkdown } from '@/lib/net/remoteMarkdownConversions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildYouTubeWorkspaceEntryText, formatWorkspaceImportTranscriptStatusLine } from './youtubeEntryText'
import { getWorkspaceUrlImportCanvasPreset, normalizeWorkspaceUrlImportCanvas2dRenderer, normalizeWorkspaceUrlImportDocumentMode } from './canvasPresets'
import { buildWebpageWorkspaceEntryStubText, buildWebpageWorkspaceEntryTextFromUpstreamMarkdown } from './webpageEntryText'
import { tryFetchApiNativeMarkdown } from './apiNative'
import type { WorkspaceUrlContent } from './types'
import { clearInflightWorkspaceUrlContent, getCachedWorkspaceUrlContent, getInflightWorkspaceUrlContent, setCachedWorkspaceUrlContent, setInflightWorkspaceUrlContent } from './urlContentCache'
import { buildWorkspaceUrlContentCacheKey } from './urlContentKey'
import { shouldCacheWorkspaceUrlContent, shouldUseCachedWorkspaceUrlContent } from './urlContentCachePolicy'
import { resolveBinaryDownloadProxyUrl } from '@/lib/chatEndpoint'
import { getYouTubeId } from 'grph-shared/rich-media/providers'
import { GLB_ASSET_MIME_TYPE, GLTF_ASSET_MIME_TYPE, buildGlbAssetMarkdown, buildGltfAssetMarkdown, deriveModelWorkspaceDocumentNameFromUrl } from './glbAsset'
import { resolveSpatialCaptureUrlContentForImport } from './urlSpatialCaptureImportProbe'
import { buildCorpusMediaMetadataMarkdown, buildCorpusMediaWorkspaceDocumentName, inferCorpusMediaKind } from '@/features/queryable-corpus/corpusGraph'
import { deriveFallbackExtFromNormalizedLower, isWeChatArticleUrl, type FetchMode, type WebpageViewMode } from './urlContentHeuristics'
import { resolveSameOriginWorkspaceImportFetchPath } from './sameOriginFetchPath'
import {
  classifyWorkspaceImportUrlContent,
  workspaceImportUrlContentFormatExtension,
  workspaceImportUrlContentFormatMime,
} from './urlContentFormat'
import type { FetchWorkspaceUrlContentOpts } from './urlContentWebpageOptions'
export { setWorkspaceWebpageDomExportForTests } from './webpageMarkdownFidelity'
const urlContentCacheGenerations = new Map<string, number>()
let urlContentCacheGeneration = 0

function nextUrlContentCacheGeneration(key: string): number {
  const generation = ++urlContentCacheGeneration
  urlContentCacheGenerations.set(key, generation)
  while (urlContentCacheGenerations.size > 256) {
    const oldest = urlContentCacheGenerations.keys().next().value
    if (oldest === undefined) break
    urlContentCacheGenerations.delete(oldest)
  }
  return generation
}

function readUrlContentCacheGeneration(key: string): number {
  return urlContentCacheGenerations.get(key) || 0
}

const isRootRelativeFetchUrl = (value: string): boolean => {
  const raw = String(value || '').trim()
  if (!raw.startsWith('/')) return false
  if (raw.startsWith('/@fs/')) return false
  if (/^\/__codebase_(file|asset)(?:\?|$)/.test(raw)) return false
  return !isLikelyAbsoluteFsPath(raw)
}
const deriveFetchFilename = (rawUrl: string, fallback: string): string => {
  const derived = deriveFilenameFromUrl(rawUrl, fallback)
  if (derived !== fallback) return derived
  const pathOnly = String(rawUrl || '').replace(/^file:\/\//i, '').split(/[?#]/)[0] || ''
  const basename = pathOnly.split('/').filter(Boolean).pop() || ''
  if (!basename || (!isRootRelativeFetchUrl(rawUrl) && !/\.[a-z0-9]+$/i.test(basename))) return fallback
  try {
    return decodeURIComponent(basename).split('/').filter(Boolean).pop() || fallback
  } catch {
    return basename
  }
}
const hasTerminalUrlPathExtension = (rawUrl: string): boolean => {
  try {
    const pathname = new URL(rawUrl).pathname
    const basename = pathname.split('/').filter(Boolean).pop() || ''
    return /\.[a-z0-9]{1,16}$/i.test(basename)
  } catch {
    return false
  }
}
const canRetryWorkspaceUrlContentProbe = (result: Awaited<ReturnType<typeof fetchRemoteTextDetailed>>): boolean =>
  'kind' in result && (result.kind === 'network' || result.kind === 'timeout')
const forceWorkspaceImportFilenameExtension = (rawUrl: string, extension: string): string => {
  const derived = deriveFetchFilename(rawUrl, 'import').replace(/\.[a-z0-9]{1,16}$/i, '') || 'import'
  return `${derived}${extension}`
}
const fetchExtensionlessWorkspaceUrlText = async (args: {
  normalizedUrl: string
  onProgress?: (percentage: number) => void
}): Promise<WorkspaceUrlContent | null> => {
  const directHead = await fetchRemoteTextDetailed(args.normalizedUrl, {
    method: 'HEAD',
    useProxy: 'never',
  })
  const head = canRetryWorkspaceUrlContentProbe(directHead)
    ? await fetchRemoteTextDetailed(args.normalizedUrl, { method: 'HEAD', useProxy: 'always' })
    : directHead
  if (!head.ok) return null

  const hinted = classifyWorkspaceImportUrlContent({ contentType: head.contentType })
  if (!hinted.needsBody) return null

  args.onProgress?.(10)
  const body = await fetchRemoteTextDetailed(args.normalizedUrl, {
    method: 'GET',
    useProxy: head.usedProxy ? 'always' : 'never',
  })
  if ('kind' in body) throw new Error(describeFetchRemoteTextFailure(body))

  const classified = classifyWorkspaceImportUrlContent({
    contentType: body.contentType || head.contentType,
    text: body.text,
  })
  const extension = workspaceImportUrlContentFormatExtension(classified.format)
  const sourceMimeHint = workspaceImportUrlContentFormatMime(classified.format)
  if (!extension || !sourceMimeHint) return null

  args.onProgress?.(100)
  return {
    normalizedUrl: args.normalizedUrl,
    name: forceWorkspaceImportFilenameExtension(args.normalizedUrl, extension),
    text: body.text,
    sourceMimeHint,
  }
}
async function fetchWorkspaceUrlContentImpl(rawUrl: string, opts?: FetchWorkspaceUrlContentOpts): Promise<WorkspaceUrlContent> {
  opts?.signal?.throwIfAborted()
  const cleaned = unwrapUserProvidedText(String(rawUrl || '').trim()) || String(rawUrl || '').trim()
  if (!cleaned) throw new Error('Invalid URL')

  const normalizedUrl = normalizeGitHubBlobLikeUrl(cleaned) ?? cleaned
  if (normalizedUrl.includes('__ag_local_page_capture_')) {
    const { consumeWorkspacePageCapture, convertWorkspacePageCapture } = await import('./urlContentHtml')
    const capture = consumeWorkspacePageCapture(normalizedUrl)
    if (!capture) throw new Error('Copied page capture is missing. Copy the page and capture it again before importing.')
    opts?.onProgress?.(10)
    const upstreamMarkdown = await convertWorkspacePageCapture(capture)
    opts?.onProgress?.(90)
    const text = buildWebpageWorkspaceEntryTextFromUpstreamMarkdown({
      upstreamMarkdown,
      url: capture.sourceUrl,
      view: 'markdown',
      title: capture.title,
      fidelityLevel: 4,
      includeImages: true,
      canvasPreset: getWorkspaceUrlImportCanvasPreset(
        normalizeWorkspaceUrlImportCanvas2dRenderer(opts?.canvas2dRenderer),
        normalizeWorkspaceUrlImportDocumentMode(opts?.documentSemanticMode),
      ),
      preserveBodyFidelity: true,
    })
    const base = deriveFilenameFromUrl(capture.sourceUrl, 'webpage')
    const name = (base.replace(/\.[a-z0-9]+$/i, '') || 'webpage') + '.md'
    opts?.onProgress?.(100)
    return { normalizedUrl: capture.sourceUrl, name, text, ...(capture.title ? { title: capture.title } : {}) }
  }
  const sameOriginFetchPath = resolveSameOriginWorkspaceImportFetchPath(normalizedUrl)
  const normalizedLower = normalizedUrl.toLowerCase()
  const canvas2dRenderer = normalizeWorkspaceUrlImportCanvas2dRenderer(opts?.canvas2dRenderer)
  const documentSemanticMode = normalizeWorkspaceUrlImportDocumentMode(opts?.documentSemanticMode)
  const canvasPreset = getWorkspaceUrlImportCanvasPreset(canvas2dRenderer, documentSemanticMode)

  const isHttpUrl = /^https?:\/\//i.test(normalizedUrl)
  const isFileUrl = /^file:\/\//i.test(normalizedUrl)
  const isRootRelativeFetch = isRootRelativeFetchUrl(normalizedUrl)
  const directFetchPath = sameOriginFetchPath
    || (isRootRelativeFetch || (isHttpUrl && opts?.preferDirectFetch === true) ? normalizedUrl : '')
  const isLocalRepoPath =
    (!isHttpUrl && !isRootRelativeFetch && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalizedUrl)) || isFileUrl
  const localFsFetchPath =
    buildLocalFsFetchPath(normalizedUrl)
    || (isFileUrl ? buildLocalFsFetchPath(normalizedUrl.replace(/^file:\/\//i, '')) : null)
  const localRepoPath = isLocalRepoPath
    ? normalizedUrl
        .replace(/^file:\/\//i, '')
        .replace(/\\/g, '/')
        .replace(/^\.+\//, '')
        .replace(/^\/+/, '')
    : ''
  const localSiteRootRel = isLocalRepoPath
    ? (() => {
        const parts = localRepoPath.split('/').filter(Boolean)
        if (parts.length <= 1) return ''
        return parts.slice(0, -1).join('/')
      })()
    : ''

  const isYouTube = isYouTubeUrl(normalizedUrl)
  const isPdf = /\.pdf(\?|#|$)/i.test(normalizedUrl)
  const isGlb = /\.glb(\?|#|$)/i.test(normalizedLower)
  const isGltf = /\.gltf(\?|#|$)/i.test(normalizedLower)
  const isWeChat = isWeChatArticleUrl(normalizedUrl)
  if (isYouTube) {
    opts?.onProgress?.(10)
    const converted = await fetchYouTubeTranscriptMarkdown(normalizedUrl)
    opts?.onProgress?.(100)
    const conversionError = converted && converted.ok === false ? converted.error || 'YouTube transcript unavailable' : 'YouTube transcript unavailable'
    if (!converted || converted.ok === false) return { normalizedUrl, name: getYouTubeId(normalizedUrl) ? `youtube-${getYouTubeId(normalizedUrl)}.md` : 'youtube-video.md', text: ['# YouTube Video Source', '', normalizedUrl, '', formatWorkspaceImportTranscriptStatusLine(conversionError), ''].join('\n'), sourceMediaKind: 'video', sourceMimeHint: 'text/markdown' }
    return {
      normalizedUrl,
      name: String(converted.name || 'youtube-transcript.md'),
      text: buildYouTubeWorkspaceEntryText({ normalizedUrl, converted, viewHint: opts?.viewHint }),
      sourceMediaKind: 'video',
      sourceMimeHint: 'text/markdown', transcriptJsonText: converted.transcriptJsonText,
    }
  }

  if (isPdf) {
    opts?.onProgress?.(10)
    const converted = await convertPdfUrlToMarkdown(normalizedUrl)
    opts?.onProgress?.(100)
    if (!converted) throw new Error('PDF import failed')
    if (converted.ok === false) throw new Error(converted.error || 'PDF import failed')
    return {
      normalizedUrl,
      name: String(converted.name || 'document.md'),
      text: String(converted.markdown || ''),
      sourceMediaKind: 'paper',
      sourceMimeHint: 'text/markdown',
    }
  }

  if (isGlb || isGltf) {
    opts?.onProgress?.(10)
    const fetchPath =
      localFsFetchPath ||
      directFetchPath ||
      (isLocalRepoPath ? buildCodebaseFilePath(localRepoPath) : resolveBinaryDownloadProxyUrl(normalizedUrl))
    const accept = isGltf
      ? `${GLTF_ASSET_MIME_TYPE},application/json,text/plain,*/*`
      : `${GLB_ASSET_MIME_TYPE},application/octet-stream,*/*`
    const res = await fetch(fetchPath, { headers: { Accept: accept } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = isGltf ? await res.text() : await res.arrayBuffer()
    opts?.onProgress?.(100)
    const sourceUrl = localFsFetchPath && isFileUrl ? normalizedUrl.replace(/^file:\/\//i, '') : normalizedUrl
    const name = deriveFilenameFromUrl(normalizedUrl, isGltf ? 'model.gltf' : 'model.glb')
    return {
      normalizedUrl: sourceUrl,
      name: deriveModelWorkspaceDocumentNameFromUrl(normalizedUrl),
      sourceMediaKind: 'model',
      sourceMimeHint: isGltf ? GLTF_ASSET_MIME_TYPE : GLB_ASSET_MIME_TYPE,
      text: isGltf
        ? buildGltfAssetMarkdown({
            name,
            sourceKind: 'url',
            sourceUrl,
            text: String(payload || ''),
          })
        : buildGlbAssetMarkdown({
            name,
            sourceKind: 'url',
            sourceUrl,
            buffer: payload as ArrayBuffer,
          }),
    }
  }

  const spatialCaptureContent = await resolveSpatialCaptureUrlContentForImport({ normalizedUrl, sourceUrl: localFsFetchPath && isFileUrl ? normalizedUrl.replace(/^file:\/\//i, '') : normalizedUrl, headFetchPath: isHttpUrl || directFetchPath || localFsFetchPath ? localFsFetchPath || directFetchPath || resolveBinaryDownloadProxyUrl(normalizedUrl) : '' })
  if (spatialCaptureContent) {
    opts?.onProgress?.(100)
    return spatialCaptureContent
  }

  const twitterStatus = (() => {
    try {
      const u = new URL(normalizedUrl)
      const host = u.hostname.toLowerCase()
      const isX = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')
      if (!isX) return null
      const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/i) || u.pathname.match(/\/status\/(\d+)(?:\/|$)/i)
      const handle = m && m[1] && typeof m[1] === 'string' && /^\d+$/.test(m[1]) === false ? String(m[1]).trim() : ''
      const id = m && m[2] ? String(m[2]).trim() : m && m[1] && /^\d+$/.test(String(m[1])) ? String(m[1]).trim() : ''
      if (!id) return null
      const safeHandle = handle ? handle.replace(/[^a-z0-9_]+/gi, '-') : 'tweet'
      const canonical = handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/web/status/${id}`
      return { id, safeHandle, canonical }
    } catch {
      return null
    }
  })()
  if (twitterStatus) {
    return {
      normalizedUrl: twitterStatus.canonical,
      name: `${twitterStatus.safeHandle}-${twitterStatus.id}.md`,
      text: ['# X', '', `[](${twitterStatus.canonical})`, '', ''].join('\n'),
    }
  }

  const looksLikeImage = /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(normalizedLower)
  if (looksLikeImage) {
    const base = deriveFilenameFromUrl(normalizedUrl, 'image')
    const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '') || 'image'
    const name = `${baseNoExt}.md`
    return {
      normalizedUrl,
      name,
      text: ['# Image', '', `![](${normalizedUrl})`, '', `[](${normalizedUrl})`, ''].join('\n'),
      sourceMediaKind: 'image',
      sourceMimeHint: 'text/markdown',
    }
  }

  const videoFilename = deriveFetchFilename(normalizedUrl, 'video')
  const looksLikeVideo = inferCorpusMediaKind(videoFilename) === 'video' || inferCorpusMediaKind(normalizedUrl) === 'video'
  if (looksLikeVideo) {
    const originalName = videoFilename || deriveFilenameFromUrl(normalizedUrl, 'video')
    return {
      normalizedUrl,
      name: buildCorpusMediaWorkspaceDocumentName(originalName),
      text: buildCorpusMediaMetadataMarkdown({
        originalName,
        mimeHint: 'video/*',
        importMode: 'url',
        relativePath: normalizedUrl,
      }),
      sourceMediaKind: 'video',
      sourceMimeHint: 'video/*',
    }
  }

  const modeForApiNative: FetchMode = opts?.mode === 'refresh' ? 'refresh' : 'import'
  const viewHintForApiNative: WebpageViewMode | '' =
    opts?.viewHint === 'json' ? 'json' : opts?.viewHint === 'html' ? 'html' : opts?.viewHint === 'markdown' ? 'markdown' : ''
  if (modeForApiNative === 'refresh' || viewHintForApiNative === 'json') {
    const apiNative = await tryFetchApiNativeMarkdown({
      url: normalizedUrl,
      mode: modeForApiNative,
      viewHint: viewHintForApiNative,
      onProgress: opts?.onProgress,
      browserSessionId: opts?.browserSessionId,
      signal: opts?.signal,
    })
    if (apiNative) {
      const text = buildWebpageWorkspaceEntryTextFromUpstreamMarkdown({
        upstreamMarkdown: apiNative.upstreamMarkdown,
        url: apiNative.normalizedUrl,
        view: viewHintForApiNative || 'markdown',
        diag: apiNative.diagnostics,
        canvasPreset,
      })
      return { normalizedUrl: apiNative.normalizedUrl, name: apiNative.name, text, ...(apiNative.title ? { title: apiNative.title } : {}) }
    }
  }

  const looksLikeLocalHtml = isLocalRepoPath && /\.(html|htm)(\?|#|$)/i.test(normalizedLower)
  const looksLikeCodeOrData =
    /\.(json|jsonld|geojson|csv|yaml|yml|txt|js|ts|py|md|markdown|mdx|svg)(\?|#|$)/i.test(normalizedLower) ||
    looksLikeLocalHtml
  const requiresRecoverableExtensionlessContent =
    isHttpUrl && !looksLikeCodeOrData && !hasTerminalUrlPathExtension(normalizedUrl)
  if (requiresRecoverableExtensionlessContent) {
    const classifiedText = await fetchExtensionlessWorkspaceUrlText({
      normalizedUrl,
      onProgress: opts?.onProgress,
    })
    if (classifiedText) return classifiedText
  }
  if (!looksLikeCodeOrData) {
    const { fetchWorkspaceWebpageUrlContent } = await import('./urlContentWebpage')
    return await fetchWorkspaceWebpageUrlContent({
      normalizedUrl,
      opts,
      canvasPreset,
      isWeChat,
      requiresRecoverableExtensionlessContent,
    })
  }

  if (isLocalRepoPath) {
    if (localRepoPath.includes('..')) throw new Error('Invalid local path')
    const localSourceUrl = localFsFetchPath
      ? (isFileUrl ? normalizedUrl.replace(/^file:\/\//i, '') : normalizedUrl)
      : localRepoPath
    if (looksLikeLocalHtml) {
      const base = localRepoPath.split('/').pop() || 'webpage'
      const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '') || 'webpage'
      const name = `${baseNoExt}.md`
      const text = buildWebpageWorkspaceEntryStubText({
        url: localRepoPath,
        view: 'html',
        body: '',
        siteRootRel: localSiteRootRel || '',
        canvasPreset,
        fidelityLevel: canvasPreset ? 4 : undefined,
        includeImages: canvasPreset ? true : undefined,
      })
      return { normalizedUrl: localSourceUrl, name, text }
    }

    opts?.onProgress?.(10)
    const fetchPath = localFsFetchPath || buildCodebaseFilePath(localRepoPath)
    const res = await fetch(fetchPath, { headers: { Accept: '*/*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    opts?.onProgress?.(100)

    const fallbackExt = deriveFallbackExtFromNormalizedLower(normalizedLower)

    const base = localRepoPath.split('/').pop() || `import${fallbackExt}`
    const name = base.includes('.') ? base : `${base}${fallbackExt}`
    return { normalizedUrl: localSourceUrl, name, text }
  }

  opts?.onProgress?.(10)
  const res = directFetchPath
    ? await (async () => {
        const response = await fetch(directFetchPath, { headers: { Accept: 'text/markdown,text/plain,*/*' } })
        if (!response.ok) {
          return {
            ok: false,
            kind: 'http',
            url: directFetchPath,
            usedProxy: false,
            status: response.status,
          } as import('grph-shared/net/fetchRemoteText').FetchRemoteTextFailure
        }
        return { ok: true, text: await response.text(), url: directFetchPath, usedProxy: false } as const
      })()
    : await fetchRemoteTextDetailed(normalizedUrl, { preflightHead: true, preferProxy: true })
  opts?.onProgress?.(100)
  if (!res.ok) throw new Error(describeFetchRemoteTextFailure(res as import('grph-shared/net/fetchRemoteText').FetchRemoteTextFailure))
  const text = res.text

  const fallbackExt = deriveFallbackExtFromNormalizedLower(normalizedLower)

  const fallback = `import${fallbackExt}`
  const derived = deriveFetchFilename(normalizedUrl, fallback)
  const name = derived.includes('.') ? derived : `${derived}${fallbackExt}`
  return { normalizedUrl, name, text }
}

export async function fetchWorkspaceUrlContent(rawUrl: string, opts?: FetchWorkspaceUrlContentOpts): Promise<WorkspaceUrlContent> {
  opts?.signal?.throwIfAborted()
  const cleaned = unwrapUserProvidedText(String(rawUrl || '').trim()) || String(rawUrl || '').trim()
  if (!cleaned) throw new Error('Invalid URL')
  const normalizedUrl = normalizeGitHubBlobLikeUrl(cleaned) ?? cleaned
  if (normalizedUrl.includes('__ag_local_page_capture_')) return await fetchWorkspaceUrlContentImpl(cleaned, opts)
  const mode: FetchMode = opts?.mode === 'refresh' ? 'refresh' : 'import'
  const viewHint = opts?.viewHint === 'markdown' ? 'markdown' : opts?.viewHint === 'json' ? 'json' : opts?.viewHint === 'html' ? 'html' : ''
  const canvas2dRenderer = normalizeWorkspaceUrlImportCanvas2dRenderer(opts?.canvas2dRenderer)
  const documentSemanticMode = normalizeWorkspaceUrlImportDocumentMode(opts?.documentSemanticMode)
  const storeSnapshot = canvas2dRenderer ? null : useGraphStore.getState()
  const key = buildWorkspaceUrlContentCacheKey({
    normalizedUrl,
    mode,
    viewHint,
    canvas2dRenderer,
    documentSemanticMode,
    storeSnapshot,
  })
  const bypassCache = opts?.bypassCache === true || Boolean(opts?.browserSessionId) || Boolean(opts?.signal)
  const generation = bypassCache ? nextUrlContentCacheGeneration(key) : readUrlContentCacheGeneration(key)
  if (bypassCache) clearInflightWorkspaceUrlContent(key)
  else {
    const inflight = getInflightWorkspaceUrlContent(key)
    if (inflight) return await inflight
    const cached = getCachedWorkspaceUrlContent(key)
    if (shouldUseCachedWorkspaceUrlContent({ mode, viewHint, cached })) return cached
  }

  const p = (async () => {
    const res = await fetchWorkspaceUrlContentImpl(cleaned, opts)
    if (!opts?.browserSessionId && !opts?.signal && generation === readUrlContentCacheGeneration(key) && shouldCacheWorkspaceUrlContent({ mode, viewHint, value: res })) {
      setCachedWorkspaceUrlContent(key, res.thinkingTextTask ? { normalizedUrl: res.normalizedUrl, name: res.name, text: res.text, ...(res.title ? { title: res.title } : {}), ...(res.thinkingText ? { thinkingText: res.thinkingText } : {}) } : res)
    }
    return res
  })()
  setInflightWorkspaceUrlContent(key, p)
  try {
    return await p
  } finally {
    if (generation === readUrlContentCacheGeneration(key)) clearInflightWorkspaceUrlContent(key)
  }
}
