import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME } from '@/features/markdown/ui/dataViewChipStyles'
import { normalizeEscapedInlineMediaMarkdown } from '@/features/markdown/ui/inlineMediaMarkdown'
import { buildInlineMediaEmbed } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
export async function testMarkdownPreviewRendersMarkdownImageAndVideoAudioIframe() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const originalFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  try {
    ;(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input && typeof (input as { url?: unknown }).url === 'string' ? (input as { url: string }).url : '')
      if (typeof url === 'string' && url.includes('/__fetch_remote?url=')) {
        const html = '<!doctype html><html><head><title>Example</title></head><body><h1>Hello</h1></body></html>'
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      if (typeof url === 'string' && url.includes('/__webpage_proxy?url=')) {
        const html = '<!doctype html><html><head><title>Example</title></head><body><h1>Hello</h1></body></html>'
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      if (typeof originalFetch === 'function') return await (originalFetch as (i: unknown) => Promise<Response>)(input)
      throw new Error('fetch not available')
    }
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const markdownText = [
      'PNG:',
      '',
      '![](https://example.com/a.png)',
      '',
      'JPG:',
      '',
      '![](https://example.com/a.jpg)',
      '',
      'Proxied JPEG:',
      '',
      '![](/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fb.jpeg)',
      '',
      'Autolink PNG:',
      '',
      '<https://substackcdn.com/image/fetch/$s_!kA4x!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0bc01ebb-a883-4e5c-bd2b-fa7aaa872edb_1600x1059.png>',
      '',
      'WeChat img (no extension):',
      '',
      '![](https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=jpeg)',
      '',
      'Inline image: ![inline](https://example.com/inline.png)',
      '',
      'Agentic OS: /runtime-ready.check #frontmatter @operator #not-registered',
      '',
      'Agentic OS code: `/memory.seed #harness @source.frontmatter`',
      '',
      'Local webpage asset path image:',
      '',
      '![](/__webpage_asset_path/https%3A%2F%2Fmmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png)',
      '',
      'Direct no-extension article image:',
      '',
      '![article](https://cassette.sphdigital.com.sg/image/straitstimes/04c048580dbbd2204b1b172b998af8bb480077470466d51c0853f5eb4d5b8541)',
      '',
      'Video:',
      '',
      '![](https://example.com/demo.mp4)',
      '',
      'Audio:',
      '',
      '![](https://example.com/demo.mp3)',
      '',
      'IFrame:',
      '',
      '![iframe](https://example.com/)',
      '',
      'Webpage URL:',
      '',
      '![](https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck)',
      '',
    ].join('\n')
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
        markdownViewerMediaMode: 'image',
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 16; i += 1) await tick()
    const img = container.querySelector('img') as HTMLImageElement | null
    if (!img) throw new Error(`expected markdown image png to render; html=${container.innerHTML}`)
    if (!img.getAttribute('data-kg-card-media-kind')) {
      throw new Error(`expected markdown image to reuse shared CardMediaPreview, html=${container.innerHTML}`)
    }
    const imgSrc = String(img.getAttribute('src') || '')
    if (!/a\.png/i.test(decodeURIComponent(imgSrc))) throw new Error(`expected png img src, got: ${imgSrc}`)
    const imgEls = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
    const imgSrcs = imgEls.map(el => String(el.getAttribute('src') || ''))
    const hasJpg = imgSrcs.some(s => /a\.jpg/i.test(decodeURIComponent(s)))
    if (!hasJpg) {
      throw new Error(`expected jpg markdown image to render as img, got: ${imgSrcs.join(', ')}`)
    }
    const hasProxiedJpeg = imgSrcs.some(s => {
      const raw = String(s || '')
      if (!raw.includes('/__fetch_remote?url=')) return false
      try {
        return decodeURIComponent(raw).includes('example.com/b.jpeg')
      } catch {
        return raw.includes('b.jpeg')
      }
    })
    if (!hasProxiedJpeg) {
      throw new Error(`expected proxied jpeg markdown image to render as img, got: ${imgSrcs.join(', ')}`)
    }
    const hasSubstack = imgSrcs.some(s => {
      const raw = String(s || '')
      if (raw.includes('substackcdn.com/image/fetch')) return true
      if (raw.includes('substackcdn.com%2Fimage%2Ffetch')) return true
      try {
        return decodeURIComponent(raw).includes('substackcdn.com/image/fetch')
      } catch {
        return false
      }
    })
    if (!hasSubstack) {
      throw new Error(`expected autolink image url to render as img, got: ${imgSrcs.join(', ')}`)
    }
    const hasWeChat = imgSrcs.some(s => {
      const raw = String(s || '')
      try {
        return decodeURIComponent(raw).includes('mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=jpeg')
      } catch {
        return raw.includes('mmbiz.qpic.cn')
      }
    })
    if (!hasWeChat) {
      throw new Error(`expected wechat image url to render as img, got: ${imgSrcs.join(', ')}`)
    }
    const hasArticleImage = imgSrcs.some(s => {
      const raw = String(s || '')
      try {
        return decodeURIComponent(raw).includes('cassette.sphdigital.com.sg/image/straitstimes/04c048580dbbd2204b1b172b998af8bb480077470466d51c0853f5eb4d5b8541')
      } catch {
        return raw.includes('cassette.sphdigital.com.sg/image/straitstimes/')
      }
    })
    if (!hasArticleImage) {
      throw new Error(`expected no-extension article image url with image path hint to render as img, got: ${imgSrcs.join(', ')}`)
    }
    const video = container.querySelector('video') as HTMLVideoElement | null
    if (!video) throw new Error('expected markdown image with mp4 to render as video')
    if (video.getAttribute('data-kg-card-media-kind') !== 'video') {
      throw new Error(`expected markdown video to reuse shared CardMediaPreview, html=${container.innerHTML}`)
    }
    const videoSrc = String(video.getAttribute('src') || '')
    if (!/demo\.mp4/i.test(decodeURIComponent(videoSrc))) throw new Error(`expected mp4 video src, got: ${videoSrc}`)
    const downloadLinks = Array.from(container.querySelectorAll('a[download][aria-label="Download media"]')) as HTMLAnchorElement[]
    const downloadHrefs = downloadLinks.map(link => String(link.getAttribute('href') || ''))
    const hasImageDownload = downloadHrefs.some(href => href.includes('/__chat_asset_proxy?url=') && decodeURIComponent(href).includes('https://example.com/a.png'))
    if (!hasImageDownload) throw new Error(`expected standalone image to expose a download link, got: ${downloadHrefs.join(', ')}`)
    const hasInlineImageDownload = downloadHrefs.some(href => href.includes('/__chat_asset_proxy?url=') && decodeURIComponent(href).includes('https://example.com/inline.png'))
    if (!hasInlineImageDownload) throw new Error(`expected inline markdown image to expose a download link, got: ${downloadHrefs.join(', ')}`)
    const hasWebpageAssetPathDownload = downloadHrefs.some(href => href.includes('/__webpage_asset_path/') && decodeURIComponent(href).includes('mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png'))
    if (!hasWebpageAssetPathDownload) throw new Error(`expected local webpage asset path image to expose a download link, got: ${downloadHrefs.join(', ')}`)
    const hasVideoDownload = downloadHrefs.some(href => href.includes('/__chat_asset_proxy?url=') && decodeURIComponent(href).includes('https://example.com/demo.mp4'))
    if (!hasVideoDownload) throw new Error(`expected standalone video to expose a download link, got: ${downloadHrefs.join(', ')}`)
    const audio = container.querySelector('audio') as HTMLAudioElement | null
    if (!audio) throw new Error('expected markdown image with mp3 to render as audio')
    const audioSrc = String(audio.getAttribute('src') || '')
    if (!/demo\.mp3/i.test(decodeURIComponent(audioSrc))) throw new Error(`expected mp3 audio src, got: ${audioSrc}`)
    const iframes = Array.from(container.querySelectorAll('iframe')) as HTMLIFrameElement[]
    const nonSrcDocIframes = iframes.filter(el => !!el.getAttribute('src'))
    if (nonSrcDocIframes.length > 0) {
      throw new Error(
        `expected non-direct iframe embeds to render as snapshot previews; iframe srcs=${nonSrcDocIframes
          .map(el => String(el.getAttribute('src') || ''))
          .join(', ')}`,
      )
    }
    const snapshots = Array.from(container.querySelectorAll('[data-kg-webpage-snapshot="1"]')) as Element[]
    const hasExampleSnapshot = snapshots.some(el => String(el.getAttribute('data-src') || '').includes('https://example.com/'))
    if (!hasExampleSnapshot) throw new Error(`expected iframe-marked url to render as snapshot preview; html=${container.innerHTML}`)
    const hasYcSnapshot = snapshots.some(el =>
      String(el.getAttribute('data-src') || '').includes('https://www.ycombinator.com/library/8d-how-to-build-a-great-series-a-pitch-and-deck'),
    )
    if (!hasYcSnapshot) throw new Error(`expected webpage url to render as snapshot preview; html=${container.innerHTML}`)
    root.unmount()
  } finally {
    ;(globalThis as unknown as { fetch?: unknown }).fetch = originalFetch
    restoreDom()
  }
}
export async function testMarkdownPreviewViewerMediaDefaultsToInlineChip() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const markdownText = [
      '---',
      'mediaUrl: https://example.com/storyboard-beats.png',
      '---',
      '',
      '1. Approve the storyboard cards before any paid or mutating provider call.',
      'Use {{mediaUrl}} as the source preview.',
      'This is the ![Image: mediaUrl](https://example.com/storyboard-beats.png) minimum viable source preview.',
      '',
      '![buddydrone.jpg](https://example.com/buddydrone.jpg)',
      '',
      'Agentic OS: /runtime-ready.check #frontmatter @operator #not-registered',
      '',
      'Agentic OS code: `/memory.seed #harness @source.frontmatter`',
      '',
      'Review #image source.',
    ].join('\n')
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 8; i += 1) await tick()
    const mediaChipThumbnail = Array.from(container.querySelectorAll('[data-kg-card-inline-media-pill="1"] [data-kg-inline-command-thumbnail="image"] img') as NodeListOf<HTMLImageElement>)
      .find(img => String(img.getAttribute('src') || '').includes('buddydrone.jpg')) || null
    if (!mediaChipThumbnail) throw new Error(`expected Viewer media chip to reuse shared inline mini thumbnail, html=${container.innerHTML}`)
    const mediaChip = mediaChipThumbnail.closest('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!mediaChip) throw new Error(`expected default Viewer media to render as inline chip, html=${container.innerHTML}`)
    if (!String(mediaChip.textContent || '').includes('buddydrone.jpg')) {
      throw new Error(`expected Viewer media chip to preserve media label, got ${JSON.stringify(mediaChip.textContent)}`)
    }
    if (!String(mediaChipThumbnail.getAttribute('src') || '').includes('buddydrone.jpg')) {
      throw new Error(`expected Viewer media chip thumbnail to use resolved media URL, got ${JSON.stringify(mediaChipThumbnail.getAttribute('src'))}`)
    }
    const mediaVariableChip = container.querySelector('a[data-kg-var-key="mediaUrl"] [data-kg-inline-command-thumbnail="image"] img') as HTMLImageElement | null
    if (!mediaVariableChip) throw new Error(`expected mediaUrl variable chip to reuse shared inline mini thumbnail, html=${container.innerHTML}`)
    if (mediaVariableChip.getAttribute('src') !== 'https://example.com/storyboard-beats.png') {
      throw new Error(`expected mediaUrl variable thumbnail to use resolved media URL, got ${JSON.stringify(mediaVariableChip.getAttribute('src'))}`)
    }
    const mediaVariableAnchor = mediaVariableChip.closest('a[data-kg-var-key="mediaUrl"]') as HTMLAnchorElement | null
    if (!mediaVariableAnchor?.getAttribute('data-kg-var-source')?.includes('Source: frontmatter line 2') || !mediaVariableAnchor.getAttribute('title')?.includes('@mediaUrl - Markdown variable')) {
      throw new Error(`expected mediaUrl Viewer variable chip to expose @-aligned hover source metadata, got ${JSON.stringify(mediaVariableAnchor?.outerHTML || '')}`)
    }
    if (mediaVariableAnchor.getAttribute('data-kg-var-token') !== '@mediaUrl' || !String(mediaVariableAnchor.textContent || '').includes('@mediaUrl')) {
      throw new Error(`expected mediaUrl Viewer variable chip to render the actual @ token, got ${JSON.stringify(mediaVariableAnchor.outerHTML)}`)
    }
    if (!String(mediaVariableAnchor.className || '').includes('cursor-help') || !String(mediaVariableAnchor.className || '').includes('inline-flex')) {
      throw new Error(`expected mediaUrl Viewer variable chip to reuse shared media chip styling, got ${JSON.stringify(mediaVariableAnchor.className)}`)
    }
    const mediaAltChip = Array.from(container.querySelectorAll('[data-kg-card-inline-media-pill="1"]') as NodeListOf<HTMLElement>)
      .find(element => element.getAttribute('data-kg-card-inline-media-token') === '@mediaUrl') || null
    if (!mediaAltChip) throw new Error(`expected markdown image alt mediaUrl chip to expose the actual @ token, html=${container.innerHTML}`)
    if (!String(mediaAltChip.textContent || '').includes('@mediaUrl') || String(mediaAltChip.textContent || '').includes('Image: mediaUrl')) {
      throw new Error(`expected markdown image alt chip to display @mediaUrl, got ${JSON.stringify(mediaAltChip.outerHTML)}`)
    }
    if (!mediaAltChip.getAttribute('data-kg-card-inline-media-source')?.includes('@mediaUrl - Markdown media reference') || !mediaAltChip.getAttribute('title')?.includes('Media: https://example.com/storyboard-beats.png')) {
      throw new Error(`expected markdown image alt chip to expose source metadata, got ${JSON.stringify(mediaAltChip.outerHTML)}`)
    }
    const download = container.querySelector('a[download][aria-label="Download media"]')
    if (download) throw new Error(`expected default Viewer chip media to omit full-media download chrome, html=${container.innerHTML}`)
    const keywordChip = container.querySelector('[data-kg-card-inline-keyword-pill="1"]') as HTMLElement | null
    if (!keywordChip) throw new Error(`expected # keyword to reuse shared inline chip utility in Viewer, html=${container.innerHTML}`)
    for (const expectedClass of DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME.split(/\s+/).filter(Boolean)) {
      if (!keywordChip.className.includes(expectedClass)) {
        throw new Error(`expected Viewer # chip to include shared inline class ${expectedClass}, got ${keywordChip.className}`)
      }
    }
    const slashInvocationChip = container.querySelector('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="/runtime-ready.check"]') as HTMLAnchorElement | null
    if (!slashInvocationChip) throw new Error(`expected Agentic OS / invocation chip to render as functional source link, html=${container.innerHTML}`)
    if (!slashInvocationChip.href.includes('https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-COMMAND.md')) {
      throw new Error(`expected Agentic OS / invocation chip to link to command dictionary source, got ${slashInvocationChip.href}`)
    }
    if (!slashInvocationChip.getAttribute('title')?.includes('Source: https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-COMMAND.md')) {
      throw new Error(`expected Agentic OS / invocation chip to expose hover source, got ${JSON.stringify(slashInvocationChip.outerHTML)}`)
    }
    const hashInvocationChip = container.querySelector('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="#frontmatter"]') as HTMLAnchorElement | null
    if (!hashInvocationChip) throw new Error(`expected Agentic OS # invocation chip to render as functional source link, html=${container.innerHTML}`)
    if (!hashInvocationChip.href.includes('https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-SEMANTIC.md')) {
      throw new Error(`expected Agentic OS # invocation chip to link to semantic dictionary source, got ${hashInvocationChip.href}`)
    }
    const bindingInvocationChip = container.querySelector('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="@operator"]') as HTMLAnchorElement | null
    if (!bindingInvocationChip) throw new Error(`expected Agentic OS @ invocation chip to render as functional source link, html=${container.innerHTML}`)
    if (!bindingInvocationChip.href.includes('https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs/DICTIONARY-BINDING.md')) {
      throw new Error(`expected Agentic OS @ invocation chip to link to binding dictionary source, got ${bindingInvocationChip.href}`)
    }
    const inlineCodeSlashInvocationChip = Array.from(container.querySelectorAll('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="/memory.seed"]') as NodeListOf<HTMLAnchorElement>)
      .find(element => element.closest('code')) || null
    if (!inlineCodeSlashInvocationChip?.href.includes('DICTIONARY-COMMAND.md')) {
      throw new Error(`expected Agentic OS inline-code / invocation chip to link to command source, html=${container.innerHTML}`)
    }
    const inlineCodeHashInvocationChip = Array.from(container.querySelectorAll('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="#harness"]') as NodeListOf<HTMLAnchorElement>)
      .find(element => element.closest('code')) || null
    if (!inlineCodeHashInvocationChip?.href.includes('DICTIONARY-SEMANTIC.md')) {
      throw new Error(`expected Agentic OS inline-code # invocation chip to link to semantic source, html=${container.innerHTML}`)
    }
    const inlineCodeBindingInvocationChip = Array.from(container.querySelectorAll('a[data-kg-agentic-os-invocation-chip="1"][data-kg-agentic-os-invocation-token="@source.frontmatter"]') as NodeListOf<HTMLAnchorElement>)
      .find(element => element.closest('code')) || null
    if (!inlineCodeBindingInvocationChip?.href.includes('DICTIONARY-BINDING.md')) {
      throw new Error(`expected Agentic OS inline-code @ invocation chip to link to binding source, html=${container.innerHTML}`)
    }
    const unknownKeywordChip = Array.from(container.querySelectorAll('[data-kg-card-inline-keyword-pill="1"]') as NodeListOf<HTMLElement>)
      .find(element => String(element.textContent || '').includes('not-registered')) || null
    if (!unknownKeywordChip || unknownKeywordChip.tagName.toLowerCase() === 'a' || unknownKeywordChip.getAttribute('data-kg-agentic-os-invocation-chip') === '1') {
      throw new Error(`expected unknown # chip to stay neutral, got ${JSON.stringify(unknownKeywordChip?.outerHTML || '')}`)
    }
    root.unmount()
  } finally {
    restoreDom()
  }
}
export function testNormalizeEscapedInlineMediaMarkdownRestoresCanonicalImageToken() {
  const source = 'This is the !\\[strybldr-starter-source.png]\\(http\\://localhost:5178/api/storage/media/airvio/runs/upload-017d 1e/image/strybldr-starter-source-017d 1e.png?kg\\_media\\_token=abc 123\\) seed.'
  const normalized = normalizeEscapedInlineMediaMarkdown(source)
  if (!normalized.includes('![strybldr-starter-source.png](http://localhost:5178/api/storage/media/airvio/runs/upload-017d1e/image/strybldr-starter-source-017d1e.png?agentic_os_media_token=abc123)')) {
    throw new Error(`expected escaped inline media markdown to normalize to canonical source token, got ${normalized}`)
  }
  if (normalized.includes('!\\[') || normalized.includes('\\(') || normalized.includes('kg\\_media\\_token')) {
    throw new Error(`expected escaped inline media punctuation to be repaired, got ${normalized}`)
  }
}
export async function testMarkdownPreviewViewerEscapedInlineMediaRendersSharedChip() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const markdownText = 'This is the !\\[strybldr-starter-source.png]\\(http\\://localhost:5178/api/storage/media/airvio/runs/upload-017d 1e/image/strybldr-starter-source-017d 1e.png?kg\\_media\\_token=abc 123\\) minimum viable runnable Strybldr seed.'
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 8; i += 1) await tick()
    const chip = Array.from(container.querySelectorAll('[data-kg-card-inline-media-pill="1"]') as NodeListOf<HTMLElement>)
      .find(element => String(element.textContent || '').includes('strybldr-starter-source.png')) || null
    if (!chip) throw new Error(`expected escaped/mutated inline media markdown to render as shared chip, html=${container.innerHTML}`)
    const img = chip.querySelector('img') as HTMLImageElement | null
    const src = String(img?.getAttribute('src') || '')
    const decoded = (() => {
      try {
        return decodeURIComponent(src)
      } catch {
        return src
      }
    })()
    if (!decoded.includes('upload-017d1e') || /\s/.test(decoded)) {
      throw new Error(`expected escaped media chip to repair whitespace-corrupted storage URL, got ${JSON.stringify(src)}`)
    }
    const text = String(container.textContent || '')
    if (text.includes('!\\[') || text.includes('\\(')) {
      throw new Error(`expected escaped/mutated inline media source not to leak as raw Markdown, text=${JSON.stringify(text)}`)
    }
    root.unmount()
  } finally {
    restoreDom()
  }
}
export async function testMarkdownPreviewViewerMediaImageModeRendersFullMedia() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: '![buddydrone.jpg](https://example.com/buddydrone.jpg)',
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
        markdownViewerMediaMode: 'image',
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 8; i += 1) await tick()
    const mediaChip = container.querySelector('[data-kg-card-inline-media-pill="1"]')
    if (mediaChip) throw new Error(`expected image mode to render full media, not inline chip, html=${container.innerHTML}`)
    const img = container.querySelector('img[data-kg-card-media-kind="image"]') as HTMLImageElement | null
    if (!img) throw new Error(`expected image mode to render full image media, html=${container.innerHTML}`)
    const download = container.querySelector('a[download][aria-label="Download media"]')
    if (!download) throw new Error(`expected image mode to preserve full-media download chrome, html=${container.innerHTML}`)
    root.unmount()
  } finally {
    restoreDom()
  }
}
export async function testMarkdownPreviewViewerMediaChipHoverToggleRendersFullMedia() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: '4. Approve the @storyboard cards before any paid or mutating provider call. ![Image: image-088c7665f3bdba06.jpg](https://example.com/image-088c7665f3bdba06.jpg)',
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 8; i += 1) await tick()
    const mediaChip = container.querySelector('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!mediaChip) throw new Error(`expected default Viewer media to render as inline chip, html=${container.innerHTML}`)
    const mediaChipText = String(mediaChip.textContent || '')
    if (!mediaChipText.includes('image-088c7665f3bdba06.jpg')) {
      throw new Error(`expected media chip to preserve asset label, got ${JSON.stringify(mediaChipText)}`)
    }
    if (mediaChipText.includes('Image:')) {
      throw new Error(`expected media chip to strip prose-like Image: prefix, got ${JSON.stringify(mediaChipText)}`)
    }
    const toggle = container.querySelector('[data-kg-card-inline-media-toggle="1"]') as HTMLButtonElement | null
    if (!toggle) throw new Error(`expected Viewer media chip to expose hover/focus full-media toggle, html=${container.innerHTML}`)
    const initialFullImage = container.querySelector('[data-kg-card-inline-media-expanded="1"] img[data-kg-card-media-kind="image"]')
    if (initialFullImage) throw new Error(`expected full media to stay hidden until the user toggles it, html=${container.innerHTML}`)
    await act(async () => {
      toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    for (let i = 0; i < 4; i += 1) await tick()
    const expanded = container.querySelector('[data-kg-card-inline-media-expanded="1"]') as HTMLElement | null
    if (!expanded) throw new Error(`expected chip toggle to render full media, html=${container.innerHTML}`)
    const img = expanded.querySelector('img[data-kg-card-media-kind="image"]') as HTMLImageElement | null
    if (!img) throw new Error(`expected expanded media to render full image, html=${container.innerHTML}`)
    if (String(img.className || '').includes('!h-3')) {
      throw new Error(`expected expanded media to avoid inline thumbnail sizing, class=${img.className}`)
    }
    const collapse = container.querySelector('[data-kg-card-inline-media-collapse="1"]') as HTMLButtonElement | null
    if (!collapse) throw new Error(`expected expanded media to expose inline-chip collapse, html=${container.innerHTML}`)
    await act(async () => {
      collapse.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    for (let i = 0; i < 4; i += 1) await tick()
    const restoredChip = container.querySelector('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!restoredChip) throw new Error(`expected collapse to restore inline media chip, html=${container.innerHTML}`)
    root.unmount()
  } finally {
    restoreDom()
  }
}
export async function testMarkdownPreviewViewerMediaCommandEmbedWithWhitespaceUrlUsesSharedInlineChip() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const embed = buildInlineMediaEmbed({
      kind: 'image',
      url: 'http://localhost:5173/api/storage/media/airvio/runs/upload-730fe/image/buddydrone-730fe 6850f 0fc 26f.jpg?agentic_os_media_token=abc',
      label: 'Image: buddydrone-730fe 6850f 0fc 26f.jpg',
    })
    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: `The ${embed} template is intentionally neutral.`,
        activeDocumentPath: '/test.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: false,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        previewOverlayScope: 'container',
        previewOverlayPortalTarget: null,
        previewScrollable: false,
        showSidebar: false,
      }),
    )
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: () => void) => number }
    const tick = () =>
      new Promise<void>(resolve => {
        const raf = anyWindow.requestAnimationFrame
        if (raf) {
          raf(() => resolve())
          return
        }
        setTimeout(() => resolve(), 0)
      })
    for (let i = 0; i < 8; i += 1) await tick()
    const text = String(container.textContent || '')
    if (text.includes('![') || text.includes('](')) {
      throw new Error(`expected whitespace media URL to render through shared inline chip, not raw markdown; text=${JSON.stringify(text)} html=${container.innerHTML}`)
    }
    const mediaChip = container.querySelector('[data-kg-card-inline-media-pill="1"]') as HTMLElement | null
    if (!mediaChip) throw new Error(`expected shared inline media chip for whitespace URL embed, html=${container.innerHTML}`)
    const image = container.querySelector('img[data-kg-card-media-kind="image"]') as HTMLImageElement | null
    if (image && String(image.getAttribute('src') || '').includes(' ')) {
      throw new Error(`expected media src to avoid raw spaces, got ${image.getAttribute('src')}`)
    }
    root.unmount()
  } finally {
    restoreDom()
  }
}
