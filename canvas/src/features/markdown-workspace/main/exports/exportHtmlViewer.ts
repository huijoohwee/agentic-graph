import { saveBlobWithPicker, downloadBlob } from '@/lib/graph/save'
import type { UiToastInput } from '@/hooks/store/types'
import { applyImageLikeProxySrc } from '@/lib/url'
import { applyMediaProxySrc } from 'grph-shared/url'
import { writeAgenticOsCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'
import { getMarkdownIt } from '@/features/markdown/markdownIt'
import { buildMarkdownHtmlViewerDocument } from '@/features/markdown/htmlViewerCss'
import React from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { withForcedIntersectingObserver } from './exportPdfIntersectionObserver'

export type SnapshotInlineAssetKind = 'image' | 'media' | 'asset'

export function resolveSnapshotInlineFetchUrl(absUrl: string, kind: SnapshotInlineAssetKind): string {
  const u = String(absUrl || '').trim()
  if (!u) return ''
  if (kind === 'image') return applyImageLikeProxySrc(u)
  return applyMediaProxySrc(u)
}

export type BuildHtmlViewerSnapshotDocumentArgs = {
  exportBaseName: string
  showWebpageHtml: boolean
  iframeSrcDoc: string | null
  viewerEl: HTMLElement | null
  viewerRefCurrent: HTMLElement | null
  activeDocumentPath?: string | null
  fallbackMarkdownText?: string | null
  pushUiToast: (toast: UiToastInput) => void
}

const escapeFallbackHtmlText = (raw: string): string =>
  String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeHtmlAttr = escapeFallbackHtmlText

const buildEditorWorkspaceSourceContextHtml = (markdownText?: string | null): string => {
  const text = String(markdownText ?? '')
  if (!text.trim()) return ''
  return [
    '<details data-kg-editor-workspace-source="1">',
    '  <summary>Source</summary>',
    `  <pre>${escapeFallbackHtmlText(text)}</pre>`,
    '</details>',
  ].join('\n')
}

const appendEditorWorkspaceSourceContext = (bodyHtml: string, markdownText?: string | null): string => {
  const html = String(bodyHtml || '')
  if (html.includes('data-kg-editor-workspace-source="1"')) return html
  const sourceHtml = buildEditorWorkspaceSourceContextHtml(markdownText)
  if (!sourceHtml) return html
  return [html, sourceHtml].join('\n')
}

export function buildFallbackMarkdownViewerDocument(args: {
  exportBaseName: string
  markdownText?: string | null
}): string | null {
  const text = String(args.markdownText ?? '')
  if (!text.trim()) return null
  const markdownHtml = getMarkdownIt().render(text)
  return buildMarkdownHtmlViewerDocument({
    title: String(args.exportBaseName || '').trim() || 'document',
    bodyHtml: [
      '<section data-kg-editor-workspace-fallback="markdown">',
      markdownHtml,
      '</section>',
      buildEditorWorkspaceSourceContextHtml(text),
    ].join('\n'),
  })
}

export async function buildHtmlViewerSnapshotDocument(args: BuildHtmlViewerSnapshotDocumentArgs): Promise<string | null> {
  try {
    const MAX_INLINE_ASSET_BYTES = 25 * 1024 * 1024
    const assetCache = new Map<string, string | null>()

    const blobToDataUrl = async (blob: Blob): Promise<string> => {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to read blob.'))
        reader.readAsDataURL(blob)
      })
    }

    const tryInlineUrlAsData = async (cacheKey: string, fetchUrl: string): Promise<string | null> => {
      try {
        const cached = assetCache.get(cacheKey)
        if (cached !== undefined) return cached
        const resp = await fetch(fetchUrl)
        if (!resp.ok) {
          assetCache.set(cacheKey, null)
          return null
        }
        const len = Number(resp.headers.get('content-length') || '')
        if (Number.isFinite(len) && len > 0 && len > MAX_INLINE_ASSET_BYTES) {
          assetCache.set(cacheKey, null)
          return null
        }
        const blob = await resp.blob()
        if (blob.size > MAX_INLINE_ASSET_BYTES) {
          assetCache.set(cacheKey, null)
          return null
        }
        const dataUrl = await blobToDataUrl(blob)
        if (!dataUrl.startsWith('data:')) return null
        assetCache.set(cacheKey, dataUrl)
        return dataUrl
      } catch {
        return null
      }
    }

    const inlineUrlString = async (rawUrl: string, baseUrl: string, kind: SnapshotInlineAssetKind): Promise<string | null> => {
      try {
        const u = String(rawUrl || '').trim()
        if (!u) return null
        if (u.startsWith('data:') || u.startsWith('blob:')) return null
        if (u.startsWith('#')) return null
        if (/^javascript:/i.test(u)) return null
        const abs = new URL(u, baseUrl).toString()
        const fetchUrl = resolveSnapshotInlineFetchUrl(abs, kind) || abs
        return await tryInlineUrlAsData(abs, fetchUrl)
      } catch {
        return null
      }
    }

    const inlineSrcsetValue = async (rawSrcset: string, baseUrl: string, kind: SnapshotInlineAssetKind): Promise<string | null> => {
      const raw = String(rawSrcset || '').trim()
      if (!raw) return null
      const parts = raw.split(',').map(part => String(part || '').trim()).filter(Boolean)
      if (!parts.length) return null
      let changed = false
      const nextParts: string[] = []
      for (const part of parts) {
        const firstWhitespace = part.search(/\s/)
        const candidateUrl = firstWhitespace >= 0 ? part.slice(0, firstWhitespace) : part
        const descriptor = firstWhitespace >= 0 ? part.slice(firstWhitespace) : ''
        const dataUrl = await inlineUrlString(candidateUrl, baseUrl, kind)
        if (dataUrl) {
          changed = true
          nextParts.push(`${dataUrl}${descriptor}`)
        } else {
          nextParts.push(part)
        }
      }
      return changed ? nextParts.join(', ') : null
    }

    const inlineImagesInElement = async (root: ParentNode, baseUrl: string): Promise<void> => {
      const imgs = Array.from(root.querySelectorAll('img[src]')) as HTMLImageElement[]
      for (const img of imgs) {
        try {
          const src = String(img.getAttribute('src') || '').trim()
          if (!src) continue
          if (src.startsWith('data:') || src.startsWith('blob:')) continue
          const dataUrl = await inlineUrlString(src, baseUrl, 'image')
          if (!dataUrl) continue
          img.setAttribute('src', dataUrl)
          img.removeAttribute('srcset')
          img.removeAttribute('sizes')
        } catch {
          void 0
        }
      }

      const srcsetImgs = Array.from(root.querySelectorAll('img[srcset]')) as HTMLImageElement[]
      for (const img of srcsetImgs) {
        try {
          const srcset = String(img.getAttribute('srcset') || '').trim()
          if (!srcset) continue
          const next = await inlineSrcsetValue(srcset, baseUrl, 'image')
          if (!next) continue
          img.setAttribute('srcset', next)
        } catch {
          void 0
        }
      }

      const pictureSources = Array.from(root.querySelectorAll('picture source[srcset]')) as HTMLSourceElement[]
      for (const source of pictureSources) {
        try {
          const srcset = String(source.getAttribute('srcset') || '').trim()
          if (!srcset) continue
          const next = await inlineSrcsetValue(srcset, baseUrl, 'image')
          if (!next) continue
          source.setAttribute('srcset', next)
        } catch {
          void 0
        }
      }
    }

    const inlineMediaInElement = async (root: ParentNode, baseUrl: string): Promise<void> => {
      const media = Array.from(root.querySelectorAll('video,audio')) as Array<HTMLVideoElement | HTMLAudioElement>
      for (const el of media) {
        try {
          const src = String(el.getAttribute('src') || '').trim()
          if (src) {
            const dataUrl = await inlineUrlString(src, baseUrl, 'media')
            if (dataUrl) el.setAttribute('src', dataUrl)
          }
        } catch {
          void 0
        }
      }

      const sources = Array.from(root.querySelectorAll('source[src]')) as HTMLSourceElement[]
      for (const s of sources) {
        try {
          const src = String(s.getAttribute('src') || '').trim()
          if (!src) continue
          const dataUrl = await inlineUrlString(src, baseUrl, 'media')
          if (!dataUrl) continue
          s.setAttribute('src', dataUrl)
        } catch {
          void 0
        }
      }

      const videos = Array.from(root.querySelectorAll('video[poster]')) as HTMLVideoElement[]
      for (const v of videos) {
        try {
          const poster = String(v.getAttribute('poster') || '').trim()
          if (!poster) continue
          const dataUrl = await inlineUrlString(poster, baseUrl, 'image')
          if (!dataUrl) continue
          v.setAttribute('poster', dataUrl)
        } catch {
          void 0
        }
      }
    }

    const rewriteCssUrls = async (cssText: string, baseUrl: string): Promise<string> => {
      const raw = String(cssText || '')
      if (!raw.trim()) return raw
      const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi
      const unique = new Set<string>()
      let m: RegExpExecArray | null = null
      while ((m = re.exec(raw))) {
        const u = String(m[2] || '').trim()
        if (!u) continue
        if (u.startsWith('data:') || u.startsWith('blob:')) continue
        if (u.startsWith('#')) continue
        if (/^javascript:/i.test(u)) continue
        try {
          unique.add(new URL(u, baseUrl).toString())
        } catch {
          void 0
        }
      }
      if (!unique.size) return raw
      const mapping = new Map<string, string>()
      for (const abs of unique) {
        const fetchUrl = resolveSnapshotInlineFetchUrl(abs, 'asset') || abs
        const dataUrl = await tryInlineUrlAsData(abs, fetchUrl)
        if (!dataUrl) continue
        mapping.set(abs, dataUrl)
      }
      if (!mapping.size) return raw
      return raw.replace(re, (_whole, quote: string, u: string) => {
        try {
          const abs = new URL(String(u || '').trim(), baseUrl).toString()
          const rep = mapping.get(abs)
          if (!rep) return _whole
          const q = quote || '"'
          return `url(${q}${rep}${q})`
        } catch {
          return _whole
        }
      })
    }

    const inlineCssInElement = async (root: ParentNode, baseUrl: string): Promise<void> => {
      const styles = Array.from(root.querySelectorAll('style')) as HTMLStyleElement[]
      for (const s of styles) {
        try {
          const t = String(s.textContent || '')
          if (!t.trim()) continue
          const next = await rewriteCssUrls(t, baseUrl)
          if (next !== t) s.textContent = next
        } catch {
          void 0
        }
      }
      const styled = Array.from(root.querySelectorAll('[style]')) as HTMLElement[]
      for (const el of styled) {
        try {
          const style = String(el.getAttribute('style') || '')
          if (!style.includes('url(')) continue
          const next = await rewriteCssUrls(style, baseUrl)
          if (next !== style) el.setAttribute('style', next)
        } catch {
          void 0
        }
      }
    }

    const inlineLinkedStylesInDocument = async (doc: Document, baseUrl: string): Promise<void> => {
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]')) as HTMLLinkElement[]
      for (const link of links) {
        try {
          const href = String(link.getAttribute('href') || '').trim()
          if (!href) continue
          const abs = new URL(href, baseUrl)
          const fetchUrl = resolveSnapshotInlineFetchUrl(abs.toString(), 'asset') || abs.toString()
          const resp = await fetch(fetchUrl)
          if (!resp.ok) continue
          const len = Number(resp.headers.get('content-length') || '')
          if (Number.isFinite(len) && len > 0 && len > MAX_INLINE_ASSET_BYTES) continue
          const css = String(await resp.text())
          if (!css.trim()) continue
          const style = doc.createElement('style')
          style.setAttribute('data-kg-export-inlined-stylesheet', href)
          style.textContent = await rewriteCssUrls(css, abs.toString())
          link.replaceWith(style)
        } catch {
          void 0
        }
      }
    }

    const inlineScriptsInElement = async (root: ParentNode, baseUrl: string): Promise<void> => {
      const scripts = Array.from(root.querySelectorAll('script[src]')) as HTMLScriptElement[]
      for (const s of scripts) {
        try {
          const src = String(s.getAttribute('src') || '').trim()
          if (!src) continue
          const abs = new URL(src, baseUrl)
          if (abs.origin !== window.location.origin) continue
          const resp = await fetch(abs.toString())
          if (!resp.ok) continue
          const len = Number(resp.headers.get('content-length') || '')
          if (Number.isFinite(len) && len > 0 && len > MAX_INLINE_ASSET_BYTES) continue
          const js = String(await resp.text())
          if (!js.trim()) continue
          s.removeAttribute('src')
          s.textContent = js
        } catch {
          void 0
        }
      }
    }

    const buildNormalizedSrcDocHtml = (srcDoc: string): string => {
      const s = String(srcDoc || '').trim()
      const isFullDoc = /<html[\s>]/i.test(s) || /<!doctype[\s>]/i.test(s)
      if (isFullDoc && s) return s
      return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `  <title>${escapeFallbackHtmlText(args.exportBaseName)}</title>`,
        '</head>',
        '<body>',
        s,
        '</body>',
        '</html>',
        '',
      ].join('\n')
    }

    const readParsedDocumentBaseUrl = (doc: Document): string => {
      try {
        const href = String(doc.querySelector('base[href]')?.getAttribute('href') || '').trim()
        if (href) return new URL(href, window.location.href).toString()
      } catch {
        void 0
      }
      try {
        return window.location.href
      } catch {
        return 'about:blank'
      }
    }

    const buildHtmlFromSrcDoc = async (srcDoc: string): Promise<string> => {
      const normalized = buildNormalizedSrcDocHtml(srcDoc)
      if (typeof DOMParser === 'undefined') return normalized
      const parser = new DOMParser()
      const doc = parser.parseFromString(normalized, 'text/html')
      const root = doc.documentElement
      if (!root) return normalized
      const baseUrl = readParsedDocumentBaseUrl(doc)
      await inlineImagesInElement(root, baseUrl)
      await inlineMediaInElement(root, baseUrl)
      await inlineCssInElement(root, baseUrl)
      await inlineLinkedStylesInDocument(doc, baseUrl)
      await inlineScriptsInElement(root, baseUrl)
      if (!doc.querySelector('title')) {
        const title = doc.createElement('title')
        title.textContent = args.exportBaseName
        doc.head.appendChild(title)
      }
      return [
        '<!doctype html>',
        root.outerHTML,
        '',
      ].join('\n')
    }

    const buildCssVarsStyle = (prefixes: string[]): string => {
      try {
        const cs = window.getComputedStyle(document.documentElement)
        const out: string[] = []
        for (let i = 0; i < cs.length; i++) {
          const k = cs.item(i)
          if (!k || !k.startsWith('--')) continue
          if (!prefixes.some(p => k.startsWith(p))) continue
          const v = cs.getPropertyValue(k)
          if (!v || !v.trim()) continue
          out.push(`${k}:${v.trim()}`)
        }
        if (!out.length) return ''
        return `:root{${out.join(';')}}`
      } catch {
        return ''
      }
    }

    const collectDocumentCss = (): {
      inlineCssChunks: Array<{ cssText: string; baseUrl: string }>
      externalLinks: Array<{ href: string; outerHtml: string }>
    } => {
      const inlineCssChunks: Array<{ cssText: string; baseUrl: string }> = []
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules
          const parts: string[] = []
          for (const rule of Array.from(rules)) parts.push(rule.cssText)
          const cssText = parts.join('\n')
          if (!cssText.trim()) continue
          const baseUrl = sheet.href ? new URL(sheet.href, window.location.href).toString() : window.location.href
          inlineCssChunks.push({ cssText, baseUrl })
        } catch {
          void 0
        }
      }

      const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"][href]')) as HTMLLinkElement[]
      const externalLinks = links
        .filter(link => {
          try {
            const sheet = link.sheet as CSSStyleSheet | null
            if (!sheet) return true
            void sheet.cssRules
            return false
          } catch {
            return true
          }
        })
        .map(link => ({ href: String(link.getAttribute('href') || ''), outerHtml: link.outerHTML }))

      return { inlineCssChunks, externalLinks }
    }

    const renderFallbackMarkdownViewerRoot = async (): Promise<HTMLElement | null> => {
      const text = String(args.fallbackMarkdownText ?? '')
      if (!text.trim()) return null
      if (typeof document === 'undefined') return null
      const host = document.createElement('section')
      host.setAttribute('data-kg-export-hidden-viewer-render', '1')
      host.style.position = 'fixed'
      host.style.left = '-10000px'
      host.style.top = '0'
      host.style.width = '1120px'
      host.style.height = 'auto'
      host.style.opacity = '0'
      host.style.pointerEvents = 'none'
      host.style.overflow = 'visible'
      host.style.zIndex = '-1'
      document.body.appendChild(host)
      const root = createRoot(host)
      const restoreIntersectionObserver = withForcedIntersectingObserver()
      try {
        root.render(
          React.createElement(MarkdownPreview, {
            markdownText: text,
            activeDocumentPath: String(args.activeDocumentPath || '').trim() || '__html_viewer_export__',
            highlightedLineRange: null,
            markdownWordWrap: true,
            markdownPresentationMode: false,
            markdownTextHighlight: false,
            selectionKind: null,
            uiPanelTextFontClass: '',
            uiPanelMonospaceTextClass: '',
            previewOverlayScope: 'container',
            previewOverlayPortalTarget: null,
            previewScrollable: true,
            viewMode: 'viewer',
            showSidebar: false,
          }),
        )
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const start = Date.now()
        while (Date.now() - start < 1600) {
          const pending = host.querySelectorAll('[data-kg-mermaid-visibility-gate="pending"]')
          if (pending.length === 0) break
          await new Promise<void>(resolve => setTimeout(resolve, 80))
        }
        const previewRoot = host.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null
        return previewRoot ? (previewRoot.cloneNode(true) as HTMLElement) : null
      } catch {
        return null
      } finally {
        try {
          restoreIntersectionObserver()
        } catch {
          void 0
        }
        try {
          root.unmount()
        } catch {
          void 0
        }
        try {
          host.remove()
        } catch {
          void 0
        }
      }
    }

    const buildHtmlFromViewerRoot = async (
      root: HTMLElement,
      options?: { includeSourceContext?: boolean },
    ): Promise<string | null> => {
      const previewRoot = (root.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null) || root
      const article = (previewRoot.querySelector('article') as HTMLElement | null) || previewRoot
      const cloned = article.cloneNode(true) as HTMLElement
      await inlineImagesInElement(cloned, window.location.href)
      await inlineMediaInElement(cloned, window.location.href)
      await inlineCssInElement(cloned, window.location.href)
      await inlineScriptsInElement(cloned, window.location.href)
      const bodyHtml = options?.includeSourceContext
        ? appendEditorWorkspaceSourceContext(cloned.outerHTML, args.fallbackMarkdownText)
        : cloned.outerHTML

      const htmlClass = String(document.documentElement.className || '').trim()
      const { inlineCssChunks, externalLinks } = collectDocumentCss()
      const fetchedExternalCss: Array<{ cssText: string; baseUrl: string }> = []
      const externalLinkTags: string[] = []
      for (const link of externalLinks) {
        try {
          const href = String(link.href || '').trim()
          if (!href) continue
          const abs = new URL(href, window.location.href)
          const sameOrigin = abs.origin === window.location.origin
          if (!sameOrigin) {
            externalLinkTags.push(link.outerHtml)
            continue
          }
          const resp = await fetch(abs.toString())
          if (!resp.ok) {
            externalLinkTags.push(link.outerHtml)
            continue
          }
          const css = String(await resp.text())
          if (!css.trim()) continue
          fetchedExternalCss.push({ cssText: css, baseUrl: abs.toString() })
        } catch {
          externalLinkTags.push(link.outerHtml)
        }
      }

      const varsCss = buildCssVarsStyle(['--kg-'])
      const rewrittenExternal: string[] = []
      for (const chunk of fetchedExternalCss) {
        rewrittenExternal.push(await rewriteCssUrls(chunk.cssText, chunk.baseUrl))
      }
      const rewrittenInline: string[] = []
      for (const chunk of inlineCssChunks) {
        rewrittenInline.push(await rewriteCssUrls(chunk.cssText, chunk.baseUrl))
      }
      const combinedCss = [varsCss, ...rewrittenExternal, ...rewrittenInline].filter(Boolean).join('\n')
      const baseHref = (() => {
        try {
          const u = new URL(window.location.href)
          u.hash = ''
          return u.toString()
        } catch {
          return ''
        }
      })()

      return [
        '<!doctype html>',
        `<html lang="en"${htmlClass ? ` class="${htmlClass.replace(/"/g, '&quot;')}"` : ''}>`,
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `  <title>${escapeFallbackHtmlText(args.exportBaseName)}</title>`,
        baseHref ? `  <base href="${escapeHtmlAttr(baseHref)}" />` : '',
        externalLinkTags.length ? `  ${externalLinkTags.join('\n  ')}` : '',
        combinedCss ? '  <style>' + combinedCss.replace(/<\/style>/g, '<\\/style>') + '</style>' : '',
        '</head>',
        '<body>',
        bodyHtml,
        '</body>',
        '</html>',
        '',
      ].join('\n')
    }

    const buildFallbackViewerHtml = async (): Promise<string | null> => {
      const root = await renderFallbackMarkdownViewerRoot()
      const html = root ? await buildHtmlFromViewerRoot(root, { includeSourceContext: true }) : null
      if (html) return html
      return buildFallbackMarkdownViewerDocument({
        exportBaseName: args.exportBaseName,
        markdownText: args.fallbackMarkdownText,
      })
    }

    if (args.showWebpageHtml) {
      const s = String(args.iframeSrcDoc || '').trim()
      if (!s) {
        const fallback = await buildFallbackViewerHtml()
        if (fallback) return fallback
        args.pushUiToast({ id: 'export-html-missing-view', kind: 'warning', message: 'Open the Viewer to export HTML.' })
        return null
      }
      return await buildHtmlFromSrcDoc(s)
    }

    const root = args.viewerEl || args.viewerRefCurrent
    if (!root) {
      const fallback = await buildFallbackViewerHtml()
      if (fallback) return fallback
      args.pushUiToast({ id: 'export-html-missing-view', kind: 'warning', message: 'Open the Viewer to export HTML.' })
      return null
    }
    const html = await buildHtmlFromViewerRoot(root)

    return html
  } catch {
    return null
  }
}

export async function exportHtmlViewerSnapshot(args: BuildHtmlViewerSnapshotDocumentArgs & {
  activeDocumentPath?: string | null
}): Promise<void> {
  const html = await buildHtmlViewerSnapshotDocument(args)
  if (!html) return
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const name = `${args.exportBaseName}.html`
  const saved = await saveBlobWithPicker(blob, name, { description: 'HTML Files', accept: { 'text/html': ['.html'] } })
  if (saved === '') return
  if (!saved) downloadBlob(blob, name)
  await writeAgenticOsCompanionOutputText({
    workspacePath: args.activeDocumentPath,
    extension: 'html',
    variant: 'viewer',
    text: html,
  })
}
