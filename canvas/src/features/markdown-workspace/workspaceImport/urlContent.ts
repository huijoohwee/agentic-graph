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
import { convertPdfUrlToMarkdown, fetchWebpageMarkdown, fetchYouTubeTranscriptMarkdown } from '@/lib/net/remoteMarkdownConversions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { fetchWebpageHtmlAuto } from '@/lib/websites/webpageIframeSrcdoc'
import { exportWebpageDomViaHiddenIframe } from '@/lib/websites/webpageDomExport'
import { looksLowFidelityWebpageMarkdown } from '@/lib/websites/webpageClientConvert'
import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { createProgressSession } from '@/lib/progress/progressTicker'
import { runInIdle } from '@/features/panels/utils/idle'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { looksLikeConnectionFailureWebpageShellText } from '@/lib/websites/webpageShellHeuristics'
import { htmlFallbackToMarkdownAllText, normalizeWebpageCardAndListBlocks } from './htmlTextFallback'
import { buildYouTubeWorkspaceEntryText, formatWorkspaceImportTranscriptStatusLine } from './youtubeEntryText'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { getWorkspaceUrlImportCanvasPreset, normalizeWorkspaceUrlImportCanvas2dRenderer, normalizeWorkspaceUrlImportDocumentMode } from './canvasPresets'
import { buildWebpageWorkspaceEntryStubText, buildWebpageWorkspaceEntryTextFromUpstreamMarkdown } from './webpageEntryText'
import { tryFetchApiNativeMarkdown } from './apiNative'
import type { WorkspaceUrlContent } from './types'
import { clearInflightWorkspaceUrlContent, getCachedWorkspaceUrlContent, getInflightWorkspaceUrlContent, setCachedWorkspaceUrlContent, setInflightWorkspaceUrlContent } from './urlContentCache'
import { buildWorkspaceUrlContentCacheKey } from './urlContentKey'
import { shouldCacheWorkspaceUrlContent, shouldUseCachedWorkspaceUrlContent } from './urlContentCachePolicy'
import { WORKSPACE_IMPORT_FINALIZE_SIDE_TASK_TIMEOUT_MS, WORKSPACE_IMPORT_SIDE_TASK_TIMEOUT_MS, startWorkspaceImportSideTask, waitForWorkspaceImportSideTask, type WorkspaceImportSideTask } from './importSideTask'
import { extractHtmlTextForShellProbe, extractWorkspaceWebpageHtmlTitle, looksLikeHydrationShellHtml } from './urlContentShell'
import { resolveBinaryDownloadProxyUrl } from '@/lib/chatEndpoint'
import { WORKSPACE_WEBPAGE_MARKDOWN_IMPORT_MAX_CHARS, WORKSPACE_WEBPAGE_MARKDOWN_REFRESH_MAX_CHARS, chooseDomRecoveredMarkdown, chooseWebpageMarkdownByContentCoverage, clipLargeWebpageMarkdown, looksLikeMostlyTitleOnlyMarkdown, shouldAcceptConvertedDomRecoveredMarkdown } from './webpageMarkdownFidelity'
import { shouldSkipUnifiedMarkdownConversion } from '@/lib/websites/webpageMarkdownConversionBudget'
import { isShareUrlArtifactEligible } from '@/features/chat/shareUrlArtifacts'
import { getYouTubeId } from 'grph-shared/rich-media/providers'
import { GLB_ASSET_MIME_TYPE, GLTF_ASSET_MIME_TYPE, buildGlbAssetMarkdown, buildGltfAssetMarkdown, deriveModelWorkspaceDocumentNameFromUrl } from './glbAsset'
import { resolveSpatialCaptureUrlContentForImport } from './urlSpatialCaptureImportProbe'
import { buildCorpusMediaMetadataMarkdown, buildCorpusMediaWorkspaceDocumentName, inferCorpusMediaKind } from '@/features/queryable-corpus/corpusGraph'
import {
  autoTuneFromHtml,
  deriveFallbackExtFromNormalizedLower,
  isWeChatArticleUrl,
  looksLikeJsShellText,
  shouldTreatAsSubstackUrl,
  type FetchMode,
  type WebpageViewMode,
} from './urlContentHeuristics'
import { resolveSameOriginWorkspaceImportFetchPath } from './sameOriginFetchPath'
import {
  classifyWorkspaceImportUrlContent,
  workspaceImportUrlContentFormatExtension,
  workspaceImportUrlContentFormatMime,
} from './urlContentFormat'
type FetchWorkspaceUrlContentOpts = { mode?: FetchMode; onProgress?: (percentage: number) => void; viewHint?: WebpageViewMode; canvas2dRenderer?: Canvas2dRendererId | null; documentSemanticMode?: 'document' | 'keyword' | null; preferDirectFetch?: boolean }
type WorkspaceWebpageDomExportFn = typeof exportWebpageDomViaHiddenIframe
let workspaceWebpageDomExportOverride: WorkspaceWebpageDomExportFn | null = null
const SHARE_THINKING_CLICK_TEXT_HINTS = ['Show thinking trajectory', 'Show thinking', 'Show reasoning', 'Show thought process', 'View thinking', 'View reasoning', 'Thinking', 'Reasoning', '\u663e\u793a\u601d\u8003\u8fc7\u7a0b']
const WORKSPACE_IMPORT_DOM_EXPORT_TIMEOUT_MS = 10_000
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
const normalizeRecoveredWebpageMarkdown = (markdown: string): string =>
  restoreWebpageMarkdownSyntaxFidelity(normalizeWebpageCardAndListBlocks(markdown)).trim()
const readWorkspaceWebpageDomExport = (): WorkspaceWebpageDomExportFn =>
  workspaceWebpageDomExportOverride || exportWebpageDomViaHiddenIframe
const looksLikeInsufficientHtmlDomExport = (html: string): boolean => {
  const raw = String(html || '').trim()
  if (!raw) return true
  if (looksLikeHydrationShellHtml(raw)) return true
  return looksLikeJsShellText(extractHtmlTextForShellProbe(raw))
}
const shouldRetryDomExportWithScripts = (args: {
  mode: 'text' | 'html' | 'layout'
  result: Awaited<ReturnType<WorkspaceWebpageDomExportFn>> | null
}): boolean => {
  const result = args.result
  if (!result) return true
  if (args.mode === 'text') {
    const text = String(result.text || '').trim()
    if (!text) return true
    return text.length < 120 || looksLikeJsShellText(text)
  }
  if (args.mode === 'html') {
    return looksLikeInsufficientHtmlDomExport(String(result.text || ''))
  }
  return false
}
const exportDomPreferringScriptDisabled = async (
  exportDom: WorkspaceWebpageDomExportFn,
  args: Parameters<WorkspaceWebpageDomExportFn>[0],
): Promise<Awaited<ReturnType<WorkspaceWebpageDomExportFn>> | null> => {
  const passive = await exportDom({ ...args, preferScriptDisabled: true })
  if (!shouldRetryDomExportWithScripts({ mode: args.mode, result: passive })) return passive
  const active = await exportDom({ ...args, preferScriptDisabled: false })
  return active || passive
}
export function setWorkspaceWebpageDomExportForTests(fn: WorkspaceWebpageDomExportFn | null): void {
  workspaceWebpageDomExportOverride = fn
}
async function fetchWorkspaceUrlContentImpl(rawUrl: string, opts?: FetchWorkspaceUrlContentOpts): Promise<WorkspaceUrlContent> {
  const cleaned = unwrapUserProvidedText(String(rawUrl || '').trim()) || String(rawUrl || '').trim()
  if (!cleaned) throw new Error('Invalid URL')

  const normalizedUrl = normalizeGitHubBlobLikeUrl(cleaned) ?? cleaned
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
  if (isHttpUrl && !looksLikeCodeOrData && !hasTerminalUrlPathExtension(normalizedUrl)) {
    const classifiedText = await fetchExtensionlessWorkspaceUrlText({
      normalizedUrl,
      onProgress: opts?.onProgress,
    })
    if (classifiedText) return classifiedText
  }
  if (!looksLikeCodeOrData) {
    const base = deriveFilenameFromUrl(normalizedUrl, 'webpage')
    const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '') || 'webpage'
    const name = `${baseNoExt}.md`

    const mode: FetchMode = opts?.mode === 'refresh' ? 'refresh' : 'import'
    const maxMarkdownChars = mode === 'import' ? WORKSPACE_WEBPAGE_MARKDOWN_IMPORT_MAX_CHARS : WORKSPACE_WEBPAGE_MARKDOWN_REFRESH_MAX_CHARS
    const viewHint: WebpageViewMode | '' =
      opts?.viewHint === 'markdown' ? 'markdown' : opts?.viewHint === 'json' ? 'json' : opts?.viewHint === 'html' ? 'html' : ''
    const looksLikeSubstackUrl = shouldTreatAsSubstackUrl(normalizedUrl)

    const ctrl = new AbortController()
    const progressSession = opts?.onProgress
      ? createProgressSession({ onProgress: opts.onProgress, intervalMs: 300, maxPercentage: 90, maxStepPercentage: 15 })
      : null

    let includeImages = true
    let defaultView: WebpageViewMode = opts?.viewHint === 'markdown' ? 'markdown' : 'html'
    let fidelityLevel: 1 | 2 | 3 | 4 = 4
    let lastFetchedHtml = ''
    let lastDomDiag = ''
    let lastDomTitle = ''
    let shouldConvertToMarkdown = false
    let shouldFallbackToPlainText = false
    let preserveUpstreamBodyFidelity = false
    let keepImportControllerForBackgroundSideTask = false
    let rejectLowFidelityConnectionShell = false
    let rejectLowFidelityWebpageShell = false
    let importedThinkingTextTask: WorkspaceImportSideTask<string> | null = null
    let lastApiNativeThinkingText = ''
    const normalizeFallbackWebpageMarkdown = (markdown: string): string =>
      normalizeRecoveredWebpageMarkdown(clipLargeWebpageMarkdown(markdown, maxMarkdownChars).text)
    try {
      progressSession?.start()

      const store = useGraphStore.getState()
      includeImages = canvasPreset ? true : store.webpageImportIncludeImages !== false
      defaultView = (
        opts?.viewHint === 'markdown'
          ? 'markdown'
          : opts?.viewHint === 'json'
            ? 'json'
            : opts?.viewHint === 'html'
              ? 'html'
              : mode === 'refresh'
                ? 'html'
                : store.webpageImportView
      ) as WebpageViewMode
      fidelityLevel = (() => {
        if (canvasPreset) return 4
        const raw = store.webpageArtifactFidelityMaxLevel
        const n = Number.isFinite(raw) ? Math.floor(Number(raw)) : 4
        return n <= 1 ? 1 : n >= 4 ? 4 : (n as 1 | 2 | 3)
      })()

      if (looksLikeSubstackUrl) {
        defaultView = 'markdown'
        includeImages = true
        fidelityLevel = 4
      }

      const forceConvertToMarkdown = opts?.viewHint === 'markdown'
      shouldConvertToMarkdown = forceConvertToMarkdown || mode !== 'refresh' || looksLikeSubstackUrl || isWeChat
      shouldFallbackToPlainText = forceConvertToMarkdown

      const tryRecoverMarkdownFromDomExport = async (progressPercentage: number): Promise<string> => {
        if (looksLikeSubstackUrl) return ''
        try {
          const exportDom = readWorkspaceWebpageDomExport()
          const htmlDom = await exportDomPreferringScriptDisabled(exportDom, {
            url: normalizedUrl,
            mode: 'html',
            timeoutMs: WORKSPACE_IMPORT_DOM_EXPORT_TIMEOUT_MS,
            maxChars: 12_000_000,
            scrollCrawl: true,
            expandFaq: true,
            minWaitAfterLoadMs: 650,
            signal: ctrl.signal,
          })
          let textDom: Awaited<ReturnType<WorkspaceWebpageDomExportFn>> | null = null
          const domDiag = String(htmlDom?.diag || '').trim()
          if (domDiag) lastDomDiag = domDiag
          const domTitle = String(htmlDom?.title || '').trim()
          if (domTitle) lastDomTitle = domTitle
          let convertedDomMarkdown = ''

          const htmlText = String(htmlDom?.text || '')
          if (htmlText.trim()) {
            lastFetchedHtml = htmlText
            const tuned = autoTuneFromHtml({
              html: lastFetchedHtml,
              includeImages,
              fidelityLevel,
              defaultView,
              mode,
              forceConvertToMarkdown,
              isWeChat,
            })
            includeImages = tuned.includeImages
            fidelityLevel = tuned.fidelityLevel
            defaultView = tuned.defaultView
            opts?.onProgress?.(progressPercentage)
            const converted = await runInIdle(
              async () =>
                await convertHtmlToMarkdownUnified({
                  html: htmlText,
                  baseUrl: normalizedUrl,
                  maxInputChars: 12_000_000,
                  includeImages,
                  fidelityLevel,
                  includeHeadSection: false,
                }),
              { timeoutMs: 1200 },
            )
            if (converted.ok === true && converted.markdown.trim()) {
              convertedDomMarkdown = normalizeRecoveredWebpageMarkdown(converted.markdown)
            }
          }
          if (shouldAcceptConvertedDomRecoveredMarkdown({
            markdown: convertedDomMarkdown,
            title: domTitle || undefined,
          })) {
            return convertedDomMarkdown
          }

          textDom = await exportDomPreferringScriptDisabled(exportDom, {
            url: normalizedUrl,
            mode: 'text',
            timeoutMs: WORKSPACE_IMPORT_DOM_EXPORT_TIMEOUT_MS,
            maxChars: 12_000_000,
            scrollCrawl: true,
            expandFaq: true,
            minWaitAfterLoadMs: 650,
            signal: ctrl.signal,
          })
          const textDiag = String(textDom?.diag || '').trim()
          if (!lastDomDiag && textDiag) lastDomDiag = textDiag
          const textTitle = String(textDom?.title || '').trim()
          if (!lastDomTitle && textTitle) lastDomTitle = textTitle
          const textOnly = String(textDom?.text || '').trim()
          const title = String(htmlDom?.title || textDom?.title || '').trim() || undefined
          const renderedTextMarkdown = textOnly.length >= 120 && !looksLikeJsShellText(textOnly) ? textOnly : ''
          if (convertedDomMarkdown || renderedTextMarkdown) {
            const domSelection = chooseDomRecoveredMarkdown({
              mode,
              convertedMarkdown: convertedDomMarkdown,
              renderedTextMarkdown,
            })
            if (domSelection.source === 'rendered' && domSelection.markdown.trim()) preserveUpstreamBodyFidelity = true
            if (domSelection.source === 'converted' && domSelection.markdown.trim()) {
              if (shouldAcceptConvertedDomRecoveredMarkdown({
                markdown: domSelection.markdown,
                title,
              })) {
                return domSelection.markdown
              }
            }
            if (domSelection.source === 'rendered' && domSelection.markdown.length >= 220) {
              return domSelection.markdown
            }
          }
          if (renderedTextMarkdown.length >= 400) {
            preserveUpstreamBodyFidelity = true
            return renderedTextMarkdown
          }
          if (textOnly.length >= 400) {
            if (!looksLikeJsShellText(textOnly)) return restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown(textOnly, title))
          }
        } catch {
          void 0
        }
        return ''
      }
      const tryRecoverMarkdownFromApiNativeBrowserSession = async (): Promise<string> => {
        if (mode !== 'import' || viewHint !== 'markdown') return ''
        const recovered = await tryFetchApiNativeMarkdown({ url: normalizedUrl, mode, viewHint: 'markdown', onProgress: opts?.onProgress })
        const markdown = normalizeRecoveredWebpageMarkdown(String(recovered?.upstreamMarkdown || ''))
        if (!markdown || looksLowFidelityWebpageMarkdown(markdown)) return ''
        preserveUpstreamBodyFidelity = true
        if (recovered?.diagnostics && !lastDomDiag) lastDomDiag = recovered.diagnostics
        if (recovered?.title) lastDomTitle = recovered.title
        if (recovered?.thinkingMarkdown) lastApiNativeThinkingText = recovered.thinkingMarkdown
        return markdown
      }

      const tryRecoverShareThinkingTextFromDomExport = async (signal: AbortSignal): Promise<string> => {
        if (looksLikeSubstackUrl || !isShareUrlArtifactEligible(normalizedUrl)) return ''
        try {
          const exportDom = readWorkspaceWebpageDomExport()
          let convertedThinkingMarkdown = ''
          const htmlDom = await exportDomPreferringScriptDisabled(exportDom, {
            url: normalizedUrl,
            mode: 'html',
            timeoutMs: 45_000,
            maxChars: 12_000_000,
            scrollCrawl: true,
            expandFaq: true,
            minWaitAfterLoadMs: 650,
            clickTextHints: SHARE_THINKING_CLICK_TEXT_HINTS,
            textCaptureTarget: 'clicked-next-sibling',
            signal,
          })
          const htmlDiag = String(htmlDom?.diag || '').trim()
          if (!lastDomDiag && htmlDiag) lastDomDiag = htmlDiag
          const htmlTitle = String(htmlDom?.title || '').trim()
          if (!lastDomTitle && htmlTitle) lastDomTitle = htmlTitle
          const htmlText = String(htmlDom?.text || '').trim()
          if (htmlText) {
            const converted = await runInIdle(
              async () =>
                await convertHtmlToMarkdownUnified({
                  html: htmlText,
                  baseUrl: normalizedUrl,
                  maxInputChars: 12_000_000,
                  includeImages: true,
                  fidelityLevel: 4,
                  includeHeadSection: false,
                  preferContentRoot: false,
                }),
              { timeoutMs: 1200 },
            )
            if (converted.ok === true && converted.markdown.trim()) {
              convertedThinkingMarkdown = normalizeRecoveredWebpageMarkdown(converted.markdown)
            }
          }
          const textDom = await exportDomPreferringScriptDisabled(exportDom, {
            url: normalizedUrl,
            mode: 'text',
            timeoutMs: 45_000,
            maxChars: 12_000_000,
            scrollCrawl: true,
            expandFaq: true,
            minWaitAfterLoadMs: 650,
            clickTextHints: SHARE_THINKING_CLICK_TEXT_HINTS,
            textCaptureTarget: 'clicked-next-sibling',
            signal,
          })
          const textDiag = String(textDom?.diag || '').trim()
          if (!lastDomDiag && textDiag) lastDomDiag = textDiag
          const textTitle = String(textDom?.title || '').trim()
          if (!lastDomTitle && textTitle) lastDomTitle = textTitle
          const textOnly = String(textDom?.text || '').replace(/\r\n/g, '\n').trim()
          const renderedThinkingMarkdown =
            textOnly.length >= 80 && !looksLikeJsShellText(textOnly)
              ? restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown(textOnly))
              : ''
          if (convertedThinkingMarkdown || renderedThinkingMarkdown) {
            const selection = chooseDomRecoveredMarkdown({
              mode: 'import',
              convertedMarkdown: convertedThinkingMarkdown,
              renderedTextMarkdown: renderedThinkingMarkdown,
              preferStructuredMarkdown: true,
            })
            if (selection.markdown.trim()) return selection.markdown.trim()
          }
        } catch {
          void 0
        }
        return ''
      }
      const readImportedThinkingText = async (args?: { timeoutMs?: number; abortOnTimeout?: boolean }): Promise<string> => {
        if (mode !== 'import' || !isShareUrlArtifactEligible(normalizedUrl)) return ''
        if (!importedThinkingTextTask) importedThinkingTextTask = startWorkspaceImportSideTask({ parentSignal: ctrl.signal, run: tryRecoverShareThinkingTextFromDomExport })
        return await waitForWorkspaceImportSideTask({ task: importedThinkingTextTask, fallback: '', timeoutMs: args?.timeoutMs ?? WORKSPACE_IMPORT_SIDE_TASK_TIMEOUT_MS, ...(args?.abortOnTimeout === undefined ? {} : { abortOnTimeout: args.abortOnTimeout }) })
      }
      const finalizeWebpageContent = async (text: string): Promise<WorkspaceUrlContent> => {
        const thinkingText =
          String(lastApiNativeThinkingText || '').trim()
          || await readImportedThinkingText({ timeoutMs: WORKSPACE_IMPORT_FINALIZE_SIDE_TASK_TIMEOUT_MS, abortOnTimeout: false })
        const thinkingTextTask = !thinkingText && importedThinkingTextTask ? waitForWorkspaceImportSideTask({ task: importedThinkingTextTask, fallback: '', timeoutMs: WORKSPACE_IMPORT_SIDE_TASK_TIMEOUT_MS, abortOnTimeout: true }).catch(() => '') : undefined
        if (thinkingTextTask) keepImportControllerForBackgroundSideTask = true
        return { normalizedUrl, name, title: String(lastDomTitle || '').trim() || undefined, text, ...(thinkingText ? { thinkingText } : {}), ...(thinkingTextTask ? { thinkingTextTask } : {}) }
      }
      if (mode === 'import' && isShareUrlArtifactEligible(normalizedUrl)) importedThinkingTextTask = startWorkspaceImportSideTask({ parentSignal: ctrl.signal, run: tryRecoverShareThinkingTextFromDomExport })
      const upstreamMarkdown = await (async () => {
        try {
          if (shouldConvertToMarkdown && mode === 'refresh') {
            const converted = await fetchWebpageMarkdown(normalizedUrl, { includeImages })
            if (converted && converted.ok === true && typeof converted.markdown === 'string') {
              return normalizeFallbackWebpageMarkdown(String(converted.markdown || ''))
            }
          }
        } catch {
          void 0
        }

        if (mode === 'refresh') {
          const recoveredFromDom = await tryRecoverMarkdownFromDomExport(55)
          if (recoveredFromDom) return recoveredFromDom
        }

        const fetchImpl = (globalThis as unknown as { fetch?: unknown }).fetch
        let rawHtml = ''
        try {
          rawHtml = await fetchWebpageHtmlAuto({
            url: normalizedUrl,
            signal: ctrl.signal,
            bypassCache: mode === 'refresh' || (mode === 'import' && viewHint === 'markdown'),
            fetchImpl: typeof fetchImpl === 'function' ? (fetchImpl as typeof fetch) : undefined,
          })
        } catch {
          if (mode === 'import') {
            const recoveredFromApiNative = await tryRecoverMarkdownFromApiNativeBrowserSession()
            if (recoveredFromApiNative.trim()) return recoveredFromApiNative.trim()
            const recoveredFromDom = await tryRecoverMarkdownFromDomExport(90)
            if (recoveredFromDom.trim()) return recoveredFromDom.trim()
          }
          throw new Error('WEBPAGE_HTML_FETCH_FAILED')
        }
        const boundedHtml = rawHtml.length > 5_000_000 ? rawHtml.slice(0, 5_000_000) : rawHtml
        const fetchedHtmlShellProbeText = extractHtmlTextForShellProbe(boundedHtml)
        const shouldSkipDomRecoveryForConnectionShell = mode === 'import' && viewHint === 'markdown' && looksLikeConnectionFailureWebpageShellText(fetchedHtmlShellProbeText)
        const fetchedHtmlLooksLikeLowFidelityShell =
          mode === 'import'
          && viewHint === 'markdown'
          && (shouldSkipDomRecoveryForConnectionShell || looksLikeHydrationShellHtml(boundedHtml) || looksLikeJsShellText(fetchedHtmlShellProbeText))
        lastFetchedHtml = boundedHtml
        if (!lastDomTitle) lastDomTitle = extractWorkspaceWebpageHtmlTitle(boundedHtml)
        const tuned = autoTuneFromHtml({
          html: lastFetchedHtml,
          includeImages,
          fidelityLevel,
          defaultView,
          mode,
          forceConvertToMarkdown,
          isWeChat,
        })
        includeImages = tuned.includeImages
        fidelityLevel = tuned.fidelityLevel
        defaultView = tuned.defaultView
        shouldConvertToMarkdown = tuned.shouldConvertToMarkdown
        shouldFallbackToPlainText = tuned.shouldFallbackToPlainText
        opts?.onProgress?.(65)

        if (!tuned.shouldConvertToMarkdown) {
          const recovered = normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(boundedHtml))
          return recovered.trim()
        }

        const markdownSelection = await (async () => {
          let convertedMarkdown = ''
          let fallbackMarkdown = ''
          if (forceConvertToMarkdown && shouldSkipUnifiedMarkdownConversion(boundedHtml)) {
            try {
              const clipped = boundedHtml.length > 1_500_000 ? boundedHtml.slice(0, 1_500_000) : boundedHtml
              fallbackMarkdown = normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(clipped))
            } catch {
              fallbackMarkdown = ''
            }
          } else {
            try {
              const converted = await runInIdle(
                async () =>
                  await convertHtmlToMarkdownUnified({
                    html: boundedHtml,
                    baseUrl: normalizedUrl,
                    maxInputChars: 5_000_000,
                    includeImages,
                    fidelityLevel,
                    includeHeadSection: false,
                  }),
                { timeoutMs: 1200 },
              )
              if (converted.ok === true && converted.markdown.trim()) {
                convertedMarkdown = normalizeRecoveredWebpageMarkdown(converted.markdown)
              }
            } catch {
              void 0
            }
            if (mode === 'import') {
              try {
                fallbackMarkdown = await runInIdle(async () => normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(boundedHtml)), { timeoutMs: 900 })
              } catch {
                fallbackMarkdown = ''
              }
            }
          }
          return chooseWebpageMarkdownByContentCoverage({
            mode,
            convertedMarkdown,
            fallbackMarkdown,
          })
        })()
        const markdownSelectionText = markdownSelection.markdown.trim()
        const markdownSelectionLowFidelity = mode === 'import' && !!markdownSelectionText && looksLowFidelityWebpageMarkdown(markdownSelectionText)
        const shouldRecoverImportFromDom =
          mode === 'import'
          && (
            !markdownSelectionText
            || markdownSelectionText.length < 1400
            || markdownSelectionLowFidelity
          )
        if (shouldRecoverImportFromDom) {
          const recoveredFromApiNative = await tryRecoverMarkdownFromApiNativeBrowserSession()
          if (recoveredFromApiNative.trim()) return recoveredFromApiNative.trim()
          if (!shouldSkipDomRecoveryForConnectionShell) {
            const recoveredFromDom = await tryRecoverMarkdownFromDomExport(90)
            if (recoveredFromDom.trim()) return recoveredFromDom.trim()
          }
        }
        opts?.onProgress?.(85)
        const markdownSelectionTitleOnly = !!lastDomTitle && looksLikeMostlyTitleOnlyMarkdown(markdownSelectionText, lastDomTitle)
        if (markdownSelectionText && !markdownSelectionLowFidelity && !markdownSelectionTitleOnly) {
          if (markdownSelection.source === 'fallback') preserveUpstreamBodyFidelity = true
          return markdownSelectionText
        }
        if (shouldSkipDomRecoveryForConnectionShell && (markdownSelectionLowFidelity || !markdownSelectionText)) {
          rejectLowFidelityConnectionShell = true
          throw new Error('AUTHENTICATED_BROWSER_SESSION_REQUIRED')
        }
        if (fetchedHtmlLooksLikeLowFidelityShell && (markdownSelectionLowFidelity || markdownSelectionTitleOnly || !markdownSelectionText)) {
          rejectLowFidelityWebpageShell = true
          throw new Error('AUTHENTICATED_BROWSER_SESSION_REQUIRED')
        }
        if (markdownSelectionLowFidelity || markdownSelectionTitleOnly) return ''

        if (!tuned.shouldFallbackToPlainText) return ''

        const fallbackMarkdown = await runInIdle(async () => normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(boundedHtml)), { timeoutMs: 900 })
        if (mode === 'import' && looksLowFidelityWebpageMarkdown(fallbackMarkdown)) {
          if (fetchedHtmlLooksLikeLowFidelityShell) {
            rejectLowFidelityWebpageShell = true
            throw new Error('AUTHENTICATED_BROWSER_SESSION_REQUIRED')
          }
          return ''
        }
        if (fallbackMarkdown.trim()) preserveUpstreamBodyFidelity = true
        return fallbackMarkdown
      })()

      progressSession?.finish(100)
      opts?.onProgress?.(95)

      const clipped = clipLargeWebpageMarkdown(upstreamMarkdown, maxMarkdownChars)
      const text = await runInIdle(
        () =>
          buildWebpageWorkspaceEntryTextFromUpstreamMarkdown({
            upstreamMarkdown: clipped.text,
            url: normalizedUrl,
            view: defaultView,
            title: lastDomTitle,
            diag: clipped.clipped ? [String(lastDomDiag || '').trim(), `clipped: ${maxMarkdownChars}`].filter(Boolean).join('\n') : lastDomDiag,
            fidelityLevel: mode === 'import' && !canvasPreset ? undefined : fidelityLevel,
            includeImages: mode === 'import' && !canvasPreset ? undefined : includeImages,
            canvasPreset,
            preserveBodyFidelity: preserveUpstreamBodyFidelity,
          }),
        { timeoutMs: 120 },
      )
      opts?.onProgress?.(100)
      if (text && text.trim() && !isFrontmatterOnlyDoc(text)) return await finalizeWebpageContent(text)

      const minimal = buildWebpageWorkspaceEntryStubText({
        url: normalizedUrl,
        view: defaultView,
        body: String(upstreamMarkdown || '').trim(),
        canvasPreset,
        fidelityLevel: canvasPreset ? 4 : undefined,
        includeImages: canvasPreset ? true : undefined,
      })
      if (minimal.trim() && !isFrontmatterOnlyDoc(minimal)) return await finalizeWebpageContent(minimal)
    } catch {
      if (rejectLowFidelityConnectionShell || rejectLowFidelityWebpageShell) throw new Error('Authenticated browser session required for this webpage import. Start the API-native browser runtime and retry.')
      if (mode === 'refresh') {
        const recoveredBody = lastFetchedHtml && shouldFallbackToPlainText ? normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(lastFetchedHtml)) : ''
        const recovered = buildWebpageWorkspaceEntryStubText({
          url: normalizedUrl,
          view: defaultView,
          body: recoveredBody.trim(),
          canvasPreset,
          fidelityLevel: canvasPreset ? 4 : undefined,
          includeImages: canvasPreset ? true : undefined,
        })
        if (recovered.trim() && !isFrontmatterOnlyDoc(recovered)) return { normalizedUrl, name, text: recovered }
      }
    } finally {
      progressSession?.cleanup()
      try {
        if (!keepImportControllerForBackgroundSideTask) ctrl.abort()
      } catch {
        void 0
      }
    }

    const fallbackView: WebpageViewMode =
      opts?.viewHint === 'markdown' ? 'markdown' : opts?.viewHint === 'json' ? 'json' : opts?.viewHint === 'html' ? 'html' : 'html'
    const text = buildWebpageWorkspaceEntryStubText({
      url: normalizedUrl,
      view: fallbackView,
      body: `[](${normalizedUrl})\n`,
      hydrate: false,
      canvasPreset,
      fidelityLevel: canvasPreset ? 4 : undefined,
      includeImages: canvasPreset ? true : undefined,
    })
    return { normalizedUrl, name, text }
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
  const cleaned = unwrapUserProvidedText(String(rawUrl || '').trim()) || String(rawUrl || '').trim()
  if (!cleaned) throw new Error('Invalid URL')
  const normalizedUrl = normalizeGitHubBlobLikeUrl(cleaned) ?? cleaned
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
  const cached = getCachedWorkspaceUrlContent(key)
  if (shouldUseCachedWorkspaceUrlContent({ mode, viewHint, cached })) return cached
  const inflight = getInflightWorkspaceUrlContent(key)
  if (inflight) return await inflight

  const p = (async () => {
    const res = await fetchWorkspaceUrlContentImpl(cleaned, opts)
    if (shouldCacheWorkspaceUrlContent({ mode, viewHint, value: res })) {
      setCachedWorkspaceUrlContent(key, res.thinkingTextTask ? { normalizedUrl: res.normalizedUrl, name: res.name, text: res.text, ...(res.title ? { title: res.title } : {}), ...(res.thinkingText ? { thinkingText: res.thinkingText } : {}) } : res)
    }
    return res
  })()
  setInflightWorkspaceUrlContent(key, p)
  try {
    return await p
  } finally {
    clearInflightWorkspaceUrlContent(key)
  }
}
