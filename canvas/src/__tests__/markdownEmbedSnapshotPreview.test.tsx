import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { fetchYouTubeTranscriptConversion } from '@/lib/net/youtubeTranscriptConversion'
import { Z_INDEX_MENU } from '@/lib/ui/zIndex'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

type FetchResponseStub = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

const buildSyntheticYouTubeId = (seed: string): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  let out = ''
  for (let i = 0; i < 11; i += 1) {
    hash ^= i + 0x9e3779b9
    hash = Math.imul(hash, 0x85ebca6b) >>> 0
    out += alphabet[hash % alphabet.length] || 'A'
  }
  return out
}

export async function testMarkdownPreviewRendersWebpageSnapshotForStandaloneLinkAndScriptEmbed() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const markdownText = [
      '[Example](https://example.com/abc)',
      '',
      '<blockquote><a href="https://example.com/embed">Embed</a></blockquote><script async src="https://example.com/widget.js"></script>',
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

    for (let i = 0; i < 12; i += 1) await tick()

    const snapshots = Array.from(container.querySelectorAll('[data-kg-webpage-snapshot="1"]')) as Element[]
    if (snapshots.length < 2) throw new Error(`expected >=2 webpage snapshots, got: ${snapshots.length}`)

    const standalone = snapshots.find(el => String(el.getAttribute('data-src') || '').includes('example.com/abc'))
    if (!standalone) throw new Error('expected snapshot for standalone markdown link')
    const thumbnail = standalone.querySelector('[role="button"][data-kg-media-thumbnail="1"]')
    if (thumbnail?.getAttribute('aria-label') !== 'Example' || !thumbnail.textContent?.includes('Example')) {
      throw new Error('expected the visible and accessible preview name to preserve the authored link label')
    }
    if (standalone.querySelector('iframe')) throw new Error('a labeled link must retain snapshot rendering without loading a live frame')
    const opened: string[] = [], previousOpen = dom.window.open
    dom.window.open = url => { opened.push(String(url)); return null }
    try {
      for (const key of ['Enter', ' ']) await act(async () => {
        thumbnail.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      })
    } finally { dom.window.open = previousOpen }
    if (opened.length !== 2 || opened.some(url => url !== 'https://example.com/abc')) {
      throw new Error('Enter and Space must use the existing thumbnail open action and exact source URL')
    }
    const scriptEmbed = snapshots.find(el => String(el.getAttribute('data-src') || '').includes('example.com/embed'))
    if (!scriptEmbed) throw new Error('expected snapshot for HTML script embed')

    root.unmount()
  } finally {
    restoreDom()
  }
}

export async function testMarkdownPreviewRendersStandaloneYouTubeShortUrlInLargeDocumentMode() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const previousRichMediaPanelMode = useGraphStore.getState().richMediaPanelMode
  try {
    useGraphStore.setState({ richMediaPanelMode: 'snapshot' } as never)
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('standalone large document timestamp')
    const markdownText = [
      `https://youtu.be/${fakeId}?t=2178;`,
      ...Array.from({ length: 2600 }, (_, i) => `Paragraph ${i + 1}`),
    ].join('\n\n')

    await act(async () => {
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
    })

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    await act(async () => {
      for (let i = 0; i < 24; i += 1) await tick()
    })

    const videoSnapshot = container.querySelector('[data-kg-video-snapshot="1"]')
    if (!videoSnapshot) throw new Error('expected youtube short URL to render as a large-document snapshot')
    const src = String(videoSnapshot.getAttribute('data-src') || '')
    if (!src.includes(`/embed/${fakeId}`)) throw new Error('expected embedded youtube id to be preserved')
    if (!src.includes('start=2178')) throw new Error('expected youtube timestamp to be preserved')

    root.unmount()
  } finally {
    useGraphStore.setState({ richMediaPanelMode: previousRichMediaPanelMode } as never)
    restoreDom()
  }
}

export async function testMarkdownPreviewBudgetsRepeatedLargeDocumentYouTubeSnapshots() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('repeated large document timestamp')
    const finalTimestamp = 2178
    const markdownText = [
      `https://youtu.be/${fakeId}?t=42`,
      '',
      ...Array.from({ length: 80 }, (_, i) => [
        `https://youtu.be/${fakeId}?t=${i === 79 ? finalTimestamp : i + 50}`,
        `Transcript segment ${i + 1}`,
      ].join('\n')),
      ...Array.from({ length: 2600 }, (_, i) => `Paragraph ${i + 1}`),
    ].join('\n\n')

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

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < 12; i += 1) await tick()

    const snapshots = container.querySelectorAll('[data-kg-video-snapshot="1"]')
    if (snapshots.length !== 1) throw new Error(`expected one snapshot for repeated large-document YouTube URLs, got ${snapshots.length}`)
    if (!String(container.textContent || '').includes(`https://youtu.be/${fakeId}?t=${finalTimestamp}`)) {
      throw new Error('expected later transcript timestamp links to remain visible as text links')
    }

    root.unmount()
  } finally {
    restoreDom()
  }
}

export async function testMarkdownPreviewRendersLinkedYouTubeThumbnailImage() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('linked thumbnail image')
    const thumbnailUrl = `https://i.ytimg.com/vi/${fakeId}/hqdefault.jpg`
    const sourceUrl = `https://youtu.be/${fakeId}?t=2178`
    const markdownText = `[![Video thumbnail](${thumbnailUrl})](${sourceUrl})`

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

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < 12; i += 1) await tick()

    const image = container.querySelector('img[data-kg-media-thumbnail="1"]') as HTMLImageElement | null
    if (!image) throw new Error('expected linked YouTube thumbnail markdown image to render in Viewer')
    if (!String(image.getAttribute('src') || '').includes(encodeURIComponent(thumbnailUrl))) {
      throw new Error('expected thumbnail image src to preserve the YouTube thumbnail URL through the media proxy')
    }

    root.unmount()
  } finally {
    restoreDom()
  }
}

export async function testMarkdownPreviewShowsYouTubeTimestampPreviewOnHoverAndTap() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const anyWindow = dom.window as unknown as Window & {
    matchMedia?: Window['matchMedia']
  }
  const previousMatchMedia = anyWindow.matchMedia
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('hover and tap timestamp preview')
    const sourceUrl = `https://youtu.be/${fakeId}?t=421`
    const markdownText = `[7:01](${sourceUrl}) timestamped transcript segment`

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

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < 12; i += 1) await tick()

    const link = container.querySelector('[data-kg-youtube-timestamp-link="1"]') as HTMLAnchorElement | null
    if (!link) throw new Error('expected YouTube timestamp link to be marked for thumbnail preview')
    if (link.textContent !== '7:01') throw new Error('expected timestamp link label to remain compact')
    const linkPreviewKey = String(link.getAttribute('data-kg-rich-media-preview-key') || '')
    if (!linkPreviewKey.startsWith('rich-media-preview:')) {
      throw new Error('expected timestamp link to reuse the Rich Media preview semantic key')
    }
    if (doc.querySelector('[data-kg-youtube-timestamp-preview="1"]')) {
      throw new Error('expected timestamp preview to stay closed before interaction')
    }

    link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    await tick()
    let preview = doc.querySelector('[data-kg-youtube-timestamp-preview="1"]') as HTMLElement | null
    if (!preview) throw new Error('expected hover to reveal the YouTube timestamp preview')
    if (preview.getAttribute('data-kg-rich-media-preview-key') !== linkPreviewKey) {
      throw new Error('expected timestamp preview to reuse the link Rich Media preview semantic key')
    }
    if (preview.style.zIndex !== String(Z_INDEX_MENU)) {
      throw new Error(`expected timestamp preview to use the shared tooltip layer with z-index ${Z_INDEX_MENU}, got ${preview.style.zIndex || '<empty>'}`)
    }
    const videoSnapshot = preview.querySelector('[data-kg-video-snapshot="1"]') as HTMLElement | null
    if (!videoSnapshot) throw new Error('expected timestamp preview to reuse the shared video snapshot surface')
    const snapshotSrc = String(videoSnapshot.getAttribute('data-src') || '')
    if (snapshotSrc !== sourceUrl) {
      throw new Error(`expected timestamp preview snapshot to preserve the requested timestamp source URL, got ${snapshotSrc}`)
    }
    const thumb = preview.querySelector('[data-kg-media-thumbnail="1"]') as HTMLElement | null
    if (!thumb) throw new Error('expected timestamp preview snapshot thumbnail surface')
    if (!String(preview.textContent || '').includes('7:01')) {
      throw new Error('expected timestamp preview to expose the semantic timestamp label')
    }

    link.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, cancelable: true }))
    await tick()
    if (doc.querySelector('[data-kg-youtube-timestamp-preview="1"]')) {
      throw new Error('expected timestamp preview to close after hover leaves')
    }

    anyWindow.matchMedia = (() => ({
      matches: true,
      media: '(hover: none), (pointer: coarse)',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    })) as Window['matchMedia']
    const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    const notCancelled = link.dispatchEvent(click)
    await tick()
    preview = doc.querySelector('[data-kg-youtube-timestamp-preview="1"]') as HTMLElement | null
    if (notCancelled || !click.defaultPrevented) {
      throw new Error('expected first coarse-pointer tap to open preview before navigation')
    }
    if (!preview) throw new Error('expected tap to reveal the YouTube timestamp preview')

    root.unmount()
  } finally {
    anyWindow.matchMedia = previousMatchMedia
    restoreDom()
  }
}

export async function testMarkdownPreviewKeepsStandaloneTimestampMarkdownLinkInlineForHoverPreview() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('standalone timestamp markdown link hover preview')
    const sourceUrl = `https://youtu.be/${fakeId}?t=331`
    const markdownText = `[5:31](${sourceUrl})`

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

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < 12; i += 1) await tick()

    if (container.querySelector('[data-kg-video-snapshot="1"]')) {
      throw new Error('expected standalone timestamp markdown link to stay inline instead of promoting into a video snapshot block')
    }

    const link = container.querySelector(`a[data-kg-youtube-timestamp-link="1"][href="${sourceUrl}"]`) as HTMLAnchorElement | null
    if (!link) throw new Error('expected standalone timestamp markdown link to render as an inline hover-preview anchor')
    if (link.textContent !== '5:31') throw new Error('expected standalone timestamp markdown link label to remain semantic')

    link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    await tick()

    const preview = doc.querySelector('[data-kg-youtube-timestamp-preview="1"]') as HTMLElement | null
    if (!preview) throw new Error('expected standalone timestamp markdown link hover to reveal the shared inline preview')
    if (preview.style.zIndex !== String(Z_INDEX_MENU)) {
      throw new Error(`expected standalone timestamp hover preview to use the shared tooltip layer with z-index ${Z_INDEX_MENU}, got ${preview.style.zIndex || '<empty>'}`)
    }
    const videoSnapshot = preview.querySelector('[data-kg-video-snapshot="1"]') as HTMLElement | null
    if (!videoSnapshot) throw new Error('expected standalone timestamp hover preview to reuse the shared video snapshot surface')
    const snapshotSrc = String(videoSnapshot.getAttribute('data-src') || '')
    if (snapshotSrc !== sourceUrl) {
      throw new Error(`expected standalone timestamp hover preview to preserve the requested timestamp source URL, got ${snapshotSrc}`)
    }
    const thumb = preview.querySelector('[data-kg-media-thumbnail="1"]') as HTMLElement | null
    if (!thumb) throw new Error('expected standalone timestamp hover preview thumbnail surface')

    root.unmount()
  } finally {
    restoreDom()
  }
}

export async function testImportUrlYouTubeTimestampMarkdownRendersNormalLinkWithSharedPreview() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const g = globalThis as unknown as { fetch?: unknown }
  const prevFetch = g.fetch
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const fakeId = buildSyntheticYouTubeId('import url timestamp markdown viewer preview')
    const watchUrl = `https://www.youtube.com/watch?v=${fakeId}`
    const timestampUrl = `https://youtu.be/${fakeId}?t=421`
    const transcript = {
      ok: true,
      title: 'Imported Transcript',
      video_id: fakeId,
      source_url: watchUrl,
      segment_count: 1,
      segments: [
        { text: 'event transcript segment,', start: 421, duration: 3 },
      ],
    }

    g.fetch = (async () => {
      const response: FetchResponseStub = {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          name: `youtube-${fakeId}.md`,
          markdown: [
            '# Imported Transcript',
            '',
            timestampUrl,
            'event transcript segment,',
            '',
          ].join('\n'),
          transcript,
        }),
      }
      return response as unknown as Response
    }) as unknown as typeof fetch

    const conversion = await fetchYouTubeTranscriptConversion(watchUrl)
    if (!conversion || conversion.ok !== true) throw new Error('expected imported YouTube conversion result')
    if (!conversion.markdown.includes(`[7:01](${timestampUrl}) event transcript segment,`)) {
      throw new Error(`expected import conversion to emit timestamp Markdown link, got:\n${conversion.markdown}`)
    }

    root.render(
      React.createElement(MarkdownPreview, {
        markdownText: conversion.markdown,
        activeDocumentPath: '/imported-youtube.md',
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

    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < 12; i += 1) await tick()

    const link = container.querySelector(`a[data-kg-youtube-timestamp-link="1"][href="${timestampUrl}"]`) as HTMLAnchorElement | null
    if (!link) throw new Error('expected imported timestamp Markdown to render as a normal anchor link')
    if (link.textContent !== '7:01') throw new Error('expected imported timestamp link label to remain semantic')
    const linkPreviewKey = String(link.getAttribute('data-kg-rich-media-preview-key') || '')
    if (!linkPreviewKey.startsWith('rich-media-preview:')) {
      throw new Error('expected imported timestamp link to attach the shared Rich Media preview key')
    }

    link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    await tick()

    const preview = doc.querySelector('[data-kg-youtube-timestamp-preview="1"]') as HTMLElement | null
    if (!preview) throw new Error('expected imported timestamp link hover to reveal the shared inline preview')
    if (preview.getAttribute('data-kg-rich-media-preview-key') !== linkPreviewKey) {
      throw new Error('expected imported timestamp preview to reuse the link semantic key')
    }
    if (preview.style.zIndex !== String(Z_INDEX_MENU)) {
      throw new Error(`expected imported timestamp preview to use the shared tooltip layer with z-index ${Z_INDEX_MENU}, got ${preview.style.zIndex || '<empty>'}`)
    }
    const videoSnapshot = preview.querySelector('[data-kg-video-snapshot="1"]') as HTMLElement | null
    if (!videoSnapshot) throw new Error('expected imported timestamp preview to reuse the shared video snapshot surface')
    const snapshotSrc = String(videoSnapshot.getAttribute('data-src') || '')
    if (snapshotSrc !== timestampUrl) {
      throw new Error(`expected imported timestamp preview snapshot to preserve the requested timestamp source URL, got ${snapshotSrc}`)
    }
    const thumb = preview.querySelector('[data-kg-media-thumbnail="1"]') as HTMLElement | null
    if (!thumb) throw new Error('expected imported timestamp preview thumbnail surface')

    root.unmount()
  } finally {
    g.fetch = prevFetch
    restoreDom()
  }
}
