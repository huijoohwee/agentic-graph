import { deriveFilenameFromUrl } from '@/lib/url'
import { fetchWebpageMarkdown } from '@/lib/net/remoteMarkdownConversions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { fetchWebpageHtmlAuto, WEBPAGE_HTML_SOURCE_MAX_BYTES } from '@/lib/websites/webpageIframeSrcdoc'
import { looksLowFidelityWebpageMarkdown } from '@/lib/websites/webpageClientConvert'
import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { createProgressSession } from '@/lib/progress/progressTicker'
import { runInIdle } from '@/features/panels/utils/idle'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { looksLikeConnectionFailureWebpageShellText } from '@/lib/websites/webpageShellHeuristics'
import { htmlFallbackToMarkdownAllText } from './htmlTextFallback'
import { buildWebpageWorkspaceEntryStubText, buildWebpageWorkspaceEntryTextFromUpstreamMarkdown } from './webpageEntryText'
import { tryFetchApiNativeMarkdown } from './apiNative'
import type { WorkspaceUrlContent } from './types'
import {
  WORKSPACE_IMPORT_FINALIZE_SIDE_TASK_TIMEOUT_MS,
  WORKSPACE_IMPORT_SIDE_TASK_TIMEOUT_MS,
  startWorkspaceImportSideTask,
  waitForWorkspaceImportSideTask,
  type WorkspaceImportSideTask,
} from './importSideTask'
import { extractHtmlTextForShellProbe, extractWorkspaceWebpageHtmlTitle, looksLikeHydrationShellHtml } from './urlContentShell'
import {
  WORKSPACE_WEBPAGE_MARKDOWN_IMPORT_MAX_CHARS, WORKSPACE_WEBPAGE_MARKDOWN_REFRESH_MAX_CHARS,
  chooseDomRecoveredMarkdown, chooseWebpageMarkdownByContentCoverage, clipLargeWebpageMarkdown,
  hasRunOfEmptyMarkdownSections, looksLikeIncompleteWebpageCapture, looksLikeIncompleteWebpageHtml,
  looksLikeMostlyTitleOnlyMarkdown, shouldAcceptConvertedDomRecoveredMarkdown,
  exportDomPreferringScriptDisabled, readWorkspaceWebpageDomExport, SHARE_THINKING_CLICK_TEXT_HINTS,
  WORKSPACE_IMPORT_DOM_EXPORT_TIMEOUT_MS, AUTHENTICATED_WEBPAGE_IMPORT_MESSAGE,
  looksLikeAuthenticationPageShell, looksLikeAuthenticationPageText,
  type WorkspaceWebpageDomExportFn,
} from './webpageMarkdownFidelity'
import { shouldSkipUnifiedMarkdownConversion } from '@/lib/websites/webpageMarkdownConversionBudget'
import { isShareUrlArtifactEligible } from '@/features/chat/shareUrlArtifacts'
import { hasCollapsedWebpageDisclosures } from '@/lib/websites/webpageDisclosureExpansion'
import {
  autoTuneFromHtml,
  looksLikeJsShellText,
  shouldTreatAsSubstackUrl,
  type FetchMode,
  type WebpageViewMode,
} from './urlContentHeuristics'
import type { getWorkspaceUrlImportCanvasPreset } from './canvasPresets'
import { normalizeRecoveredWebpageMarkdown, type FetchWorkspaceUrlContentOpts } from './urlContentWebpageOptions'

export async function fetchWorkspaceWebpageUrlContent(args: {
  normalizedUrl: string
  opts?: FetchWorkspaceUrlContentOpts
  canvasPreset: ReturnType<typeof getWorkspaceUrlImportCanvasPreset>
  isWeChat: boolean
  requiresRecoverableExtensionlessContent: boolean
}): Promise<WorkspaceUrlContent> {
  const { normalizedUrl, opts, canvasPreset, isWeChat, requiresRecoverableExtensionlessContent } = args
  const base = deriveFilenameFromUrl(normalizedUrl, 'webpage')
  const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '') || 'webpage'
  const name = `${baseNoExt}.md`

  const mode: FetchMode = opts?.mode === 'refresh' ? 'refresh' : 'import'
  const maxMarkdownChars = mode === 'import' ? WORKSPACE_WEBPAGE_MARKDOWN_IMPORT_MAX_CHARS : WORKSPACE_WEBPAGE_MARKDOWN_REFRESH_MAX_CHARS
  const viewHint: WebpageViewMode | '' =
    opts?.viewHint === 'markdown' ? 'markdown' : opts?.viewHint === 'json' ? 'json' : opts?.viewHint === 'html' ? 'html' : ''
  const looksLikeSubstackUrl = shouldTreatAsSubstackUrl(normalizedUrl)

  const ctrl = new AbortController()
  const abortFromCaller = () => ctrl.abort(opts?.signal?.reason)
  if (opts?.signal?.aborted) abortFromCaller()
  else opts?.signal?.addEventListener('abort', abortFromCaller, { once: true })
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
    opts?.signal?.throwIfAborted()
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
    // URL import chooses conversion fidelity from the captured page itself.
    // A workspace-wide preference must not silently reduce a page import.
    fidelityLevel = 4

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
          expandDisclosures: true,
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
        if (htmlText.trim() && !looksLikeAuthenticationPageShell(htmlText)) {
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
          expandDisclosures: true,
          minWaitAfterLoadMs: 650,
          signal: ctrl.signal,
        })
        const textDiag = String(textDom?.diag || '').trim()
        if (!lastDomDiag && textDiag) lastDomDiag = textDiag
        const textTitle = String(textDom?.title || '').trim()
        if (!lastDomTitle && textTitle) lastDomTitle = textTitle
        const title = String(htmlDom?.title || textDom?.title || '').trim() || undefined
        const rawTextOnly = String(textDom?.text || '').trim()
        const textOnly = looksLikeAuthenticationPageText(String(title || ''), rawTextOnly) ? '' : rawTextOnly
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
    const tryRecoverMarkdownFromApiNativeBrowserSession = async (args?: { allowHtmlRecovery?: boolean }): Promise<string> => {
      if (mode !== 'import' || viewHint === 'json' || defaultView === 'json') return ''
      if ((viewHint === 'html' || defaultView === 'html') && args?.allowHtmlRecovery !== true) return ''
      const recovered = await tryFetchApiNativeMarkdown({ url: normalizedUrl, mode, viewHint: 'markdown', onProgress: opts?.onProgress,
        browserSessionId: opts?.browserSessionId, signal: ctrl.signal })
      ctrl.signal.throwIfAborted()
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
          expandDisclosures: true,
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
          expandDisclosures: true,
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
            const markdown = normalizeFallbackWebpageMarkdown(String(converted.markdown || ''))
            if (hasRunOfEmptyMarkdownSections(markdown)) {
              const recoveredFromDom = await tryRecoverMarkdownFromDomExport(55)
              if (recoveredFromDom && !hasRunOfEmptyMarkdownSections(recoveredFromDom)) return recoveredFromDom
            }
            return markdown
          }
        }
      } catch {
        void 0
      }

      const fetchImpl = (globalThis as unknown as { fetch?: unknown }).fetch
      let rawHtml = ''
      try {
        rawHtml = await fetchWebpageHtmlAuto({
          url: normalizedUrl,
          signal: ctrl.signal,
          bypassCache: mode === 'refresh' || (mode === 'import' && viewHint === 'markdown'),
          maxBytes: WEBPAGE_HTML_SOURCE_MAX_BYTES,
          fetchImpl: typeof fetchImpl === 'function' ? (fetchImpl as typeof fetch) : undefined,
        })
      } catch (error) {
        ctrl.signal.throwIfAborted()
        if ((error as { code?: unknown })?.code === 'WEBPAGE_HTML_SOURCE_LIMIT_EXCEEDED') throw error
        if (mode === 'import') {
          const recoveredFromApiNative = await tryRecoverMarkdownFromApiNativeBrowserSession()
          if (recoveredFromApiNative.trim()) return recoveredFromApiNative.trim()
          const recoveredFromDom = await tryRecoverMarkdownFromDomExport(90)
          if (recoveredFromDom.trim()) return recoveredFromDom.trim()
        }
        throw new Error('WEBPAGE_HTML_FETCH_FAILED')
      }
      ctrl.signal.throwIfAborted()
      const boundedHtml = await import('./urlContentHtml').then(({ prepareWorkspaceImportHtml }) => prepareWorkspaceImportHtml(rawHtml))
      const fetchedHtmlShellProbeText = extractHtmlTextForShellProbe(boundedHtml)
      const shouldSkipDomRecoveryForConnectionShell = mode === 'import' && looksLikeConnectionFailureWebpageShellText(fetchedHtmlShellProbeText)
      const fetchedHtmlLooksLikeAuthenticationShell = mode === 'import' && looksLikeAuthenticationPageShell(boundedHtml)
      const fetchedHtmlLooksLikeLowFidelityShell = mode === 'import' && (
        shouldSkipDomRecoveryForConnectionShell || fetchedHtmlLooksLikeAuthenticationShell
        || looksLikeHydrationShellHtml(boundedHtml) || looksLikeJsShellText(fetchedHtmlShellProbeText)
        || looksLikeIncompleteWebpageHtml(boundedHtml)
      )
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
            fallbackMarkdown = normalizeFallbackWebpageMarkdown(htmlFallbackToMarkdownAllText(boundedHtml))
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
                  maxInputChars: boundedHtml.length,
                  includeImages,
                  fidelityLevel,
                  includeHeadSection: false,
                  preferContentRoot: false,
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
      const markdownSelectionLowFidelity = mode === 'import' && !!markdownSelectionText && (
        fetchedHtmlLooksLikeAuthenticationShell || looksLowFidelityWebpageMarkdown(markdownSelectionText)
        || looksLikeIncompleteWebpageCapture(boundedHtml, markdownSelectionText)
      )
      const shouldRecoverImportFromDom = mode === 'import' && (
        fetchedHtmlLooksLikeLowFidelityShell || !markdownSelectionText
        || markdownSelectionText.length < 1400 || markdownSelectionLowFidelity
        || hasCollapsedWebpageDisclosures(boundedHtml)
      )
      if (shouldRecoverImportFromDom) {
        if (mode === 'import' && hasCollapsedWebpageDisclosures(boundedHtml) && !shouldSkipDomRecoveryForConnectionShell) {
          const recoveredFromDom = await tryRecoverMarkdownFromDomExport(90)
          if (recoveredFromDom.trim()) return recoveredFromDom.trim()
        }
        const recoveredFromApiNative = await tryRecoverMarkdownFromApiNativeBrowserSession({ allowHtmlRecovery: fetchedHtmlLooksLikeAuthenticationShell })
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
      if (mode === 'import' && looksLikeIncompleteWebpageCapture(boundedHtml, markdownSelectionText)) {
        throw Object.assign(
          new Error('The page returned only navigation or embedded shell content, so no partial document was saved. Retry with a rendered browser capture or an exported page file.'),
          { code: 'WEBPAGE_CONTENT_INCOMPLETE' },
        )
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

  if (mode === 'import' && upstreamMarkdown.length > maxMarkdownChars) {
    throw Object.assign(
      new Error(`Imported webpage Markdown exceeds the ${maxMarkdownChars}-character limit; no partial document was produced`),
      { code: 'WEBPAGE_MARKDOWN_LIMIT_EXCEEDED' },
    )
  }
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
  } catch (error) {
    const code = (error as { code?: unknown })?.code
    if (code === 'WEBPAGE_HTML_SOURCE_LIMIT_EXCEEDED' || code === 'HTML_INPUT_LIMIT_EXCEEDED' || code === 'WEBPAGE_MARKDOWN_LIMIT_EXCEEDED' || code === 'WEBPAGE_CONTENT_INCOMPLETE') {
      throw error
    }
    if (rejectLowFidelityConnectionShell || rejectLowFidelityWebpageShell) throw new Error(AUTHENTICATED_WEBPAGE_IMPORT_MESSAGE)
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
    opts?.signal?.removeEventListener('abort', abortFromCaller)
    try {
      if (!keepImportControllerForBackgroundSideTask) ctrl.abort()
    } catch {
      void 0
    }
  }

  if (mode === 'import' && requiresRecoverableExtensionlessContent) {
    throw new Error(AUTHENTICATED_WEBPAGE_IMPORT_MESSAGE)
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
