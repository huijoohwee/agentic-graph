import React from 'react'
import { assertWebpageHtmlPreviewBudget, WebpageHtmlPreviewLimitError } from '@/lib/websites/webpageHtmlPreviewBudget'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import { runInIdle } from '@/features/panels/utils/idle'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildCodeViewerSrcdoc,
  buildWebpageHtmlSrcdocAsync,
  fetchWebpageConversionJsonViaConvert,
  fetchWebpageHtmlAuto,
  fetchWebsiteImportArtifact,
} from '@/lib/websites/webpageIframeSrcdoc'
import { buildCodebaseAssetPath, buildWebpageProxyUrl, inferIframeScriptPolicyFromHtml, isHttpUrl, normalizeCodebaseRelPath } from '@/lib/url'
import { getOrCreateWebpageSandboxBlobUrl } from '@/lib/websites/webpageSandboxBlobUrlCache'

function resolveLocalCodebaseAssetUrl(args: {
  rawUrl: string
  fileDirRel: string
  siteRootRel: string
}): string | null {
  const raw = String(args.rawUrl || '').trim()
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(raw)) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/__')) return raw
  const rootRel = normalizeCodebaseRelPath(args.siteRootRel || args.fileDirRel)
  const fileDirRel = normalizeCodebaseRelPath(args.fileDirRel)
  const joined = raw.startsWith('/')
    ? normalizeCodebaseRelPath(rootRel ? `${rootRel}/${raw.replace(/^\/+/, '')}` : raw)
    : normalizeCodebaseRelPath(fileDirRel ? `${fileDirRel}/${raw}` : raw)
  if (!joined) return null
  return buildCodebaseAssetPath(joined)
}

function rewriteLocalHtmlSrcsetValue(
  srcset: string,
  args: { fileDirRel: string; siteRootRel: string },
): string {
  const raw = String(srcset || '').trim()
  if (!raw) return raw
  return raw
    .split(',')
    .map(part => {
      const trimmed = String(part || '').trim()
      if (!trimmed) return trimmed
      const firstWhitespace = trimmed.search(/\s/)
      const candidateUrl = firstWhitespace >= 0 ? trimmed.slice(0, firstWhitespace) : trimmed
      const descriptor = firstWhitespace >= 0 ? trimmed.slice(firstWhitespace) : ''
      const rewritten = resolveLocalCodebaseAssetUrl({
        rawUrl: candidateUrl,
        fileDirRel: args.fileDirRel,
        siteRootRel: args.siteRootRel,
      })
      return rewritten ? `${rewritten}${descriptor}` : trimmed
    })
    .join(', ')
}

function rewriteLocalHtmlForCodebaseAssets(args: {
  rawHtml: string
  fileDirRel: string
  siteRootRel: string
}): string {
  let next = String(args.rawHtml || '')
  if (!next) return next
  next = next.replace(/\b(src|href|poster|data)\s*=\s*(["'])([\s\S]*?)\2/gi, (_m, attr: string, quote: string, value: string) => {
    const rewritten = resolveLocalCodebaseAssetUrl({
      rawUrl: value,
      fileDirRel: args.fileDirRel,
      siteRootRel: args.siteRootRel,
    })
    return `${attr}=${quote}${rewritten || value}${quote}`
  })
  next = next.replace(/\b(srcset|data-srcset)\s*=\s*(["'])([\s\S]*?)\2/gi, (_m, attr: string, quote: string, value: string) => {
    return `${attr}=${quote}${rewriteLocalHtmlSrcsetValue(value, args)}${quote}`
  })
  next = next.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (match: string, quote: string, value: string) => {
    const rewritten = resolveLocalCodebaseAssetUrl({
      rawUrl: value,
      fileDirRel: args.fileDirRel,
      siteRootRel: args.siteRootRel,
    })
    if (!rewritten || rewritten === value) return match
    return `url(${quote}${rewritten}${quote})`
  })
  return next
}

function resolveDirectHtmlProxyScriptPolicy(args: {
  url: string
  explicitPolicy?: 'strip' | 'allow' | null
}): 'strip' | 'allow' {
  if (args.explicitPolicy === 'allow') return 'allow'
  if (args.explicitPolicy === 'strip') return 'strip'
  const storePolicy = useGraphStore.getState().webpageViewerScriptPolicy
  return storePolicy === 'strip' ? 'strip' : 'allow'
}

export function useWebpageIframeSrcdoc(args: {
  enabled: boolean
  url: string
  view: 'html' | 'json'
  websiteImportMeta: { importId: string; nodeId: string; outputDirRel?: string } | null
  includeImages?: boolean
  htmlOverride?: string | null
  scriptPolicy?: 'strip' | 'allow' | null
  siteRootRel?: string | null
  onStatusProgress?: (label: string, current?: number | null, total?: number | null, bytesCurrent?: number | null, bytesTotal?: number | null) => void
  onStatusWithAutoClear?: (label: string, ttlMs?: number) => void
}): { srcDoc: string | null; src: string | null; error: string | null } {
  const [state, setState] = React.useState<{ srcDoc: string | null; src: string | null; error: string | null }>({
    srcDoc: null,
    src: null,
    error: null,
  })

  const onStatusProgressRef = React.useRef(args.onStatusProgress)
  const onStatusWithAutoClearRef = React.useRef(args.onStatusWithAutoClear)
  React.useEffect(() => {
    onStatusProgressRef.current = args.onStatusProgress
    onStatusWithAutoClearRef.current = args.onStatusWithAutoClear
  }, [args.onStatusProgress, args.onStatusWithAutoClear])

  const importId = args.websiteImportMeta?.importId
  const nodeId = args.websiteImportMeta?.nodeId
  const outputDirRel = args.websiteImportMeta?.outputDirRel
  const debouncedUrl = useDebouncedValue(args.url, 120, args.enabled)
  const debouncedHtmlOverride = useDebouncedValue(args.htmlOverride ?? null, 250, args.enabled)

  React.useEffect(() => {
    const websiteImportMeta = importId && nodeId ? { importId, nodeId, outputDirRel } : null
    if (!args.enabled) {
      setState(prev => (prev.srcDoc === null && prev.src === null && prev.error === null ? prev : { srcDoc: null, src: null, error: null }))
      return
    }
    const url = String(debouncedUrl || '').trim()
    if (!url) {
      setState(prev => (prev.srcDoc === null && prev.src === null && prev.error === null ? prev : { srcDoc: null, src: null, error: null }))
      return
    }

    let cancelled = false
    const ctrl = new AbortController()
    const includeImages = args.includeImages ?? (useGraphStore.getState().webpageImportIncludeImages !== false)
    const richMediaPanelMode = useGraphStore.getState().richMediaPanelMode
    const preferEmbed = richMediaPanelMode === 'embed'

    void (async () => {
      onStatusProgressRef.current?.('Updating view')
      if (args.view === 'json') {
        onStatusProgressRef.current?.('Loading JSON')
        const rawJson = await (async () => {
          if (websiteImportMeta) {
            try {
              const t = await fetchWebsiteImportArtifact({
                importId: websiteImportMeta.importId,
                nodeId: websiteImportMeta.nodeId,
                outputDirRel: websiteImportMeta.outputDirRel,
                kind: 'conversionJson',
                signal: ctrl.signal,
              })
              if (t && t.trim()) return t
            } catch (error) {
              if (ctrl.signal.aborted) throw error
              void 0
            }
          }
          return await fetchWebpageConversionJsonViaConvert({
            url,
            includeImages,
            signal: ctrl.signal,
          })
        })()

        onStatusProgressRef.current?.('Rendering JSON')
        const pretty = await runInIdle(() => {
          const t = String(rawJson || '')
          if (t.length > 900_000) {
            return `${t.slice(0, 900_000)}\n\n…(clipped ${t.length - 900_000} chars)…`
          }
          try {
            const parsed = JSON.parse(t) as unknown
            return JSON.stringify(parsed, null, 2)
          } catch {
            return t
          }
        }, { timeoutMs: 50 })
        return buildCodeViewerSrcdoc({ baseHref: url, title: url, mode: 'json', text: pretty })
      }

      const override = typeof debouncedHtmlOverride === 'string' && debouncedHtmlOverride.trim() ? debouncedHtmlOverride : null
      if (args.view === 'html' && override == null && !websiteImportMeta && isHttpUrl(url)) {
        const scriptPolicy = resolveDirectHtmlProxyScriptPolicy({ url, explicitPolicy: args.scriptPolicy })
        const nextSrc = buildWebpageProxyUrl(url, scriptPolicy)
        return { kind: 'proxy' as const, src: nextSrc }
      }

      onStatusProgressRef.current?.('Loading HTML')
      const rawHtml = await (async () => {
        if (override) return override
        if (websiteImportMeta) {
          try {
            return await fetchWebsiteImportArtifact({
              importId: websiteImportMeta.importId,
              nodeId: websiteImportMeta.nodeId,
              outputDirRel: websiteImportMeta.outputDirRel,
              kind: 'rawHtml',
              htmlPreview: true,
              signal: ctrl.signal,
            })
          } catch (error) {
            if (ctrl.signal.aborted || error instanceof WebpageHtmlPreviewLimitError) throw error
            void 0
          }
        }
        return await fetchWebpageHtmlAuto({
          url,
          htmlPreview: true,
          signal: ctrl.signal,
          onProgress: (bytes, bytesTotal) => {
            try {
              onStatusProgressRef.current?.('Loading HTML', null, null, bytes, bytesTotal ?? null)
            } catch {
              void 0
            }
          },
        })
      })()

      if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      assertWebpageHtmlPreviewBudget(rawHtml)
      // Captures already contain rendered content; replaying scripts can rehydrate the entire site.
      const scriptPolicy = args.scriptPolicy ?? (websiteImportMeta
        ? 'strip' : preferEmbed ? 'allow' : inferIframeScriptPolicyFromHtml(rawHtml))

      const siteRootRel = String(args.siteRootRel || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
      const localDirRel = (() => {
        const normalized = url.split(/[?#]/)[0].replace(/\\/g, '/').replace(/^\/+/, '')
        const parts = normalized.split('/').filter(Boolean)
        if (parts.length <= 1) return ''
        return parts.slice(0, -1).join('/')
      })()
      const baseHref = /^https?:\/\//i.test(url)
        ? url
        : 'https://example.invalid/'

      const htmlPreprocessed = (() => {
        if (/^https?:\/\//i.test(url)) return rawHtml
        return rewriteLocalHtmlForCodebaseAssets({
          rawHtml,
          fileDirRel: localDirRel,
          siteRootRel,
        })
      })()

      onStatusProgressRef.current?.('Rendering HTML')
      const built = await runInIdle(
        () => {
          if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          return buildWebpageHtmlSrcdocAsync({
            html: htmlPreprocessed,
            baseHref,
            scriptPolicy,
            onProgress: (step) => {
              try {
                onStatusProgressRef.current?.(`Sanitizing HTML: ${step}`)
              } catch {
                void 0
              }
            },
          })
        },
        { timeoutMs: 50 },
      )
      return { url, scriptPolicy, built }
    })()
      .then((res) => {
        if (cancelled) return
        if (res && typeof res === 'object' && 'kind' in res && (res as { kind?: unknown }).kind === 'proxy') {
          const nextSrc = String((res as { src?: unknown }).src || '')
          setState(prev => (prev.srcDoc === null && prev.src === nextSrc && prev.error === null ? prev : { srcDoc: null, src: nextSrc, error: null }))
          onStatusWithAutoClearRef.current?.('Updated', 1200)
          return
        }
        if (typeof res === 'string') {
          const srcDoc = res
          setState(prev => (prev.srcDoc === srcDoc && prev.src === null && prev.error === null ? prev : { srcDoc, src: null, error: null }))
          onStatusWithAutoClearRef.current?.('Updated', 1200)
          return
        }
        const blobKey = `webpage:${res.url}:view:${args.view}:policy:${res.scriptPolicy}:override:${typeof debouncedHtmlOverride === 'string' ? debouncedHtmlOverride.length : 0}`
        const blobUrl = res.built.tooLargeForSrcdoc ? getOrCreateWebpageSandboxBlobUrl({ key: blobKey, html: res.built.html }) : ''
        const nextSrc = res.built.tooLargeForSrcdoc && blobUrl ? blobUrl : null
        const nextSrcDoc = nextSrc ? null : res.built.html
        setState(prev =>
          prev.srcDoc === nextSrcDoc && prev.src === nextSrc && prev.error === null ? prev : { srcDoc: nextSrcDoc, src: nextSrc, error: null },
        )
        onStatusWithAutoClearRef.current?.('Updated', 1200)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '') : ''
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name || '') : ''
        const abortLike = ctrl.signal.aborted || name === 'AbortError' || /aborted/i.test(msg)
        if (abortLike) {
          onStatusWithAutoClearRef.current?.('Cancelled', 800)
          return
        }
        onStatusWithAutoClearRef.current?.('Preview unavailable', 2400)
        const fallback = buildCodeViewerSrcdoc({ baseHref: url, title: url, mode: 'text', text: msg || 'Request failed' })
        setState(prev =>
          prev.srcDoc === fallback && prev.src === null && prev.error === (msg || 'Request failed')
            ? prev
            : { srcDoc: fallback, src: null, error: msg || 'Request failed' },
        )
      })

    return () => {
      cancelled = true
      try {
        ctrl.abort()
      } catch {
        void 0
      }
    }
  }, [
    args.enabled,
    debouncedHtmlOverride,
    debouncedUrl,
    args.view,
    args.siteRootRel,
    args.scriptPolicy,
    args.includeImages,
    importId,
    nodeId,
    outputDirRel,
  ])

  return state
}
