import React from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import type { MarkdownPresentationApi } from '@/features/markdown-workspace/markdownWorkspaceTypes'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'

const WEBPAGE_TEST_URL = 'https://docs.byteplus.com/'

const waitUntil = async (predicate: () => boolean, timeoutMs = 1600) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  if (!predicate()) throw new Error(`workspace view did not become ready within ${timeoutMs}ms`)
}

export async function testMarkdownWorkspaceWebpageHtmlViewRendersIframe() {
  resetWorkspaceUrlContentCacheForTests()
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const state = useGraphStore.getState()
  const prevMode = state.richMediaPanelMode
  try {
    state.setRichMediaPanelMode('embed')
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }

    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async () => {
      return {
        ok: true,
        status: 200,
        text: async () => `<!doctype html><html><head><base href="${WEBPAGE_TEST_URL}"></head><body><h1>OK</h1></body></html>`,
      }
    }) as unknown

    const cases = [
      { view: 'html', expectsIframe: true },
      { view: 'json', expectsIframe: true },
      { view: 'markdown', expectsIframe: false },
    ] as const

    for (const { view, expectsIframe } of cases) {
      const text = ['---', `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`, `kgWebpageView: "${view}"`, '---', '', '# Title', ''].join('\n')
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: true,
          setExplorerOpen: () => {},
          layoutMode: 'viewer',
          setLayoutMode: () => {},
          markdownWordWrap: true,
          setMarkdownWordWrap: () => {},
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => {},
          onToggleFullscreen: () => {},
          presentationApiRef,
          isMarkdown: true,
          activeText: text,
          setActiveText: () => {},
          activeDocumentKey: '/webpage.md',
          highlightedLineRange: null,
          revealLineInEditor: () => {},
          showInViewer: () => {},
          showInPresentation: () => {},
          showInGallery: () => {},
          editorUri: 'inmemory://webpage.md',
          editorLanguage: 'markdown',
          editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
        }),
      )

      await waitUntil(() => {
        const iframe = doc.querySelector('section[aria-label="Webpage Viewer"] iframe')
        if (!expectsIframe) return !iframe
        if (!iframe) return false
        const src = iframe.getAttribute('src') || ''
        const srcdoc = iframe.getAttribute('srcdoc') || ''
        return view === 'html'
          ? src.startsWith('/__webpage_proxy?url=') || srcdoc.includes('<base')
          : !src && srcdoc.includes('<base') && srcdoc.includes('source_url')
      }, 2400)

      const iframe = doc.querySelector('section[aria-label="Webpage Viewer"] iframe')
      if (expectsIframe) {
        if (!iframe) throw new Error(`expected iframe for view=${view}`)
        const src = String(iframe.getAttribute('src') || '')
        const srcdoc = String(iframe.getAttribute('srcdoc') || '')

        if (view === 'html') {
          if (src) {
            if (!src.startsWith('/__webpage_proxy?url=')) {
              throw new Error(`expected iframe src to use webpage proxy for view=${view}, got: ${src}`)
            }
          } else {
            if (!srcdoc.includes('<base')) throw new Error(`expected srcdoc to include base tag for view=${view}`)
          }
        } else {
          if (src) throw new Error(`expected no iframe src for srcdoc mode view=${view}`)
          if (!srcdoc.includes('<base')) throw new Error(`expected srcdoc to include base tag for view=${view}`)
          if (!srcdoc.includes('source_url') || !srcdoc.includes('OK')) {
            throw new Error('expected JSON view to render converted source content')
          }
        }

        const sandbox = String(iframe.getAttribute('sandbox') || '')
        if (sandbox.includes('allow-top-navigation')) throw new Error('expected iframe sandbox to forbid top navigation')
      } else {
        if (iframe) throw new Error(`expected no iframe for view=${view}`)
      }
    }

    root.unmount()
  } finally {
    state.setRichMediaPanelMode(prevMode)
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}

export async function testMarkdownWorkspaceWebpageHtmlViewUsesWebsiteImportArtifactForHtml() {
  resetWorkspaceUrlContentCacheForTests()
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const state = useGraphStore.getState()
  const prevMode = state.richMediaPanelMode
  try {
    state.setRichMediaPanelMode('embed')
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }

    const seen: string[] = []
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown) => {
      const url = (() => {
        if (typeof input === 'string') return input
        if (input instanceof URL) return input.toString()
        if (input && typeof input === 'object' && 'url' in input) {
          const u = (input as { url?: unknown }).url
          return typeof u === 'string' ? u : String(u || '')
        }
        return ''
      })()
      seen.push(url)
      if (url.startsWith('/__website_import/artifact')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<!doctype html><html><head></head><body><h1>OK</h1></body></html>',
        }
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'not found',
      }
    }) as unknown

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

    const cases = [
      { view: 'html', nodeId: 'node-html' },
      { view: 'json', nodeId: 'node-json' },
    ] as const

    for (const { view, nodeId } of cases) {
      seen.length = 0
      const text = [
        '---',
        `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`,
        `kgWebpageView: "${view}"`,
        'kgWebsiteImportId: "import"',
        `kgWebsiteNodeId: "${nodeId}"`,
        '---',
        '',
        '# Title',
        '',
      ].join('\n')
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: true,
          setExplorerOpen: () => {},
          layoutMode: 'viewer',
          setLayoutMode: () => {},
          markdownWordWrap: true,
          setMarkdownWordWrap: () => {},
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => {},
          onToggleFullscreen: () => {},
          presentationApiRef,
          isMarkdown: true,
          activeText: text,
          setActiveText: () => {},
          activeDocumentKey: '/webpage.md',
          highlightedLineRange: null,
          revealLineInEditor: () => {},
          showInViewer: () => {},
          showInPresentation: () => {},
          showInGallery: () => {},
          editorUri: 'inmemory://webpage.md',
          editorLanguage: 'markdown',
          editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
        }),
      )

      await waitUntil(() => Boolean(doc.querySelector('iframe')), 2400)
      for (let i = 0; i < 6; i += 1) await tick()

      const iframe = doc.querySelector('iframe')
      if (!iframe) throw new Error(`expected iframe for view=${view}`)
      const src = String(iframe.getAttribute('src') || '')
      if (src) throw new Error(`expected no iframe src for srcdoc mode view=${view}`)
      const srcdoc = String(iframe.getAttribute('srcdoc') || '')
      if (!srcdoc.includes('<base')) throw new Error(`expected base tag injected for website import view=${view}`)
      if (!seen.some(u => u.startsWith('/__website_import/artifact'))) throw new Error(`expected website import artifact fetch view=${view}`)
      if (seen.some(u => u.startsWith('/__webpage_proxy'))) throw new Error(`expected no webpage proxy fetch when artifact available view=${view}`)
    }

    root.unmount()
  } finally {
    state.setRichMediaPanelMode(prevMode)
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}

export async function testMarkdownWorkspaceHtmlEditorSharesMarkdownSsot() {
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const state = useGraphStore.getState()
  const prevMode = state.richMediaPanelMode
  let root: ReturnType<typeof createRoot> | null = null
  try {
    state.setRichMediaPanelMode('snapshot')
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown) => {
      throw new Error(`expected HTML editor workspace to mount direct proxy iframe without prefetching ${String(input || '')}`)
    }) as unknown
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }

    const text = ['---', `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`, 'kgWebpageView: "html"', '---', '', '# Title', ''].join('\n')

    root.render(
      React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: true,
        setExplorerOpen: () => {},
        layoutMode: 'editor',
        setLayoutMode: () => {},
        markdownWordWrap: true,
        setMarkdownWordWrap: () => {},
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => {},
        onToggleFullscreen: () => {},
        presentationApiRef,
        isMarkdown: true,
        activeText: text,
        setActiveText: () => {},
        disableEditorMutations: false,
        activeDocumentKey: '/webpage.md',
        highlightedLineRange: null,
        revealLineInEditor: () => {},
        showInViewer: () => {},
        showInPresentation: () => {},
        showInGallery: () => {},
        editorUri: 'inmemory://webpage.md',
        editorLanguage: 'markdown',
        editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
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
    for (let i = 0; i < 5; i += 1) await tick()

    await waitUntil(() => Boolean(doc.querySelector('section[aria-label="Webpage Viewer"] iframe')), 2400)
    const iframe = doc.querySelector('section[aria-label="Webpage Viewer"] iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected HTML view to render webpage iframe inside editor workspace')
    const src = String(iframe.getAttribute('src') || '')
    if (!src.startsWith('/__webpage_proxy?url=')) {
      throw new Error(`expected HTML editor workspace iframe to use webpage proxy, got ${src}`)
    }
    if (doc.querySelector('[data-kg-webpage-snapshot="1"]')) {
      throw new Error('expected HTML editor workspace to render source HTML, not a snapshot placeholder')
    }
    const viewerPane = doc.querySelector('section[aria-label="Viewer"]')
    if (!viewerPane) throw new Error('expected editor layout to keep the Viewer pane mounted')
    const htmlPane = doc.querySelector('section[aria-label="HTML Viewer"] section[aria-label="Webpage Viewer"]')
    if (!htmlPane) throw new Error('expected editor layout to keep the selected HTML viewer pane mounted')

    root.unmount()
    root = null
  } finally {
    root?.unmount()
    state.setRichMediaPanelMode(prevMode)
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}

export async function testMarkdownWorkspaceWebpageMarkdownViewerRendersRichMedia() {
  const { dom, restore } = initJsdomHarness()
  const prevFetch = (globalThis as unknown as { fetch?: unknown }).fetch
  const state = useGraphStore.getState()
  const prevMode = state.richMediaPanelMode
  let root: ReturnType<typeof createRoot> | null = null
  try {
    state.setRichMediaPanelMode('embed')
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async (input: unknown) => {
      throw new Error(`expected webpage Markdown rich media rendering not to fetch webpage HTML, got ${String(input || '')}`)
    }) as unknown
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }
    const imageUrl = 'https://assets.example.test/image/content/abc123'
    const videoUrl = 'https://assets.example.test/media/clip.mp4'
    const audioUrl = 'https://assets.example.test/media/sound.mp3'
    const text = [
      '---',
      `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`,
      'kgWebpageView: "markdown"',
      '---',
      '',
      `![](${imageUrl})`,
      '',
      `![](${videoUrl})`,
      '',
      `![](${audioUrl})`,
      '',
    ].join('\n')

    root.render(
      React.createElement(MarkdownWorkspaceMain, {
        themeMode: 'light',
        uiPanelTextFontClass: 'font-sans',
        uiPanelMonospaceTextClass: 'font-mono',
        explorerOpen: true,
        setExplorerOpen: () => {},
        layoutMode: 'viewer',
        setLayoutMode: () => {},
        markdownWordWrap: true,
        setMarkdownWordWrap: () => {},
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => {},
        onToggleFullscreen: () => {},
        presentationApiRef,
        isMarkdown: true,
        activeText: text,
        setActiveText: () => {},
        activeDocumentKey: '/webpage-rich-media.md',
        highlightedLineRange: null,
        revealLineInEditor: () => {},
        showInViewer: () => {},
        showInPresentation: () => {},
        showInGallery: () => {},
        editorUri: 'inmemory://webpage-rich-media.md',
        editorLanguage: 'markdown',
        editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
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

    if (container.querySelector('[data-kg-card-inline-media-pill="1"]')) {
      throw new Error(`expected webpage Markdown Viewer to render full rich media, not chips; html=${container.innerHTML}`)
    }
    const decodeAttr = (value: string): string => {
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
    const img = container.querySelector('img[data-kg-card-media-kind="image"]') as HTMLImageElement | null
    if (!img || !decodeAttr(String(img.getAttribute('src') || '')).includes('/image/content/abc123')) {
      throw new Error(`expected no-extension image-path URL to render as full image, html=${container.innerHTML}`)
    }
    const video = container.querySelector('video[data-kg-card-media-kind="video"]') as HTMLVideoElement | null
    if (!video || !decodeAttr(String(video.getAttribute('src') || '')).includes('/media/clip.mp4')) {
      throw new Error(`expected video URL to render as full video, html=${container.innerHTML}`)
    }
    const audio = container.querySelector('audio') as HTMLAudioElement | null
    if (!audio || !decodeAttr(String(audio.getAttribute('src') || '')).includes('/media/sound.mp3')) {
      throw new Error(`expected audio URL to render as full audio, html=${container.innerHTML}`)
    }
  } finally {
    root?.unmount()
    state.setRichMediaPanelMode(prevMode)
    ;(globalThis as unknown as { fetch?: unknown }).fetch = prevFetch
    restore()
  }
}

export { testMarkdownWorkspaceImportUrlHtmlPageSsotAndViewModes } from './workspaceImportHtmlViewModes.test'

export async function testMarkdownWorkspaceEditorTextOverrideWorks() {
  const { dom, restore } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const editorRef = { current: null as MonacoTextEditorHandle | null }
    const presentationApiRef = { current: null as MarkdownPresentationApi | null }

    const cases = [
      {
        view: 'json',
        overrideText: JSON.stringify({ ok: true, mode: 'json' }, null, 2),
      },
      {
        view: 'markdown',
        overrideText: ['---', `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`, 'kgWebpageView: "markdown"', '---', '', '# Webpage Markdown Artifact: docs.byteplus.com', '', '```text kg-webpage-layout', '[MOCKUP]', '```', ''].join('\n'),
      },
    ] as const

    for (const { view, overrideText } of cases) {
      const markdown = ['---', `kgWebpageUrl: "${WEBPAGE_TEST_URL}"`, `kgWebpageView: "${view}"`, '---', '', '# Title', ''].join('\n')
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
          uiPanelTextFontClass: 'font-sans',
          uiPanelMonospaceTextClass: 'font-mono',
          explorerOpen: true,
          setExplorerOpen: () => {},
          layoutMode: 'editor',
          setLayoutMode: () => {},
          markdownWordWrap: true,
          setMarkdownWordWrap: () => {},
          markdownTextHighlight: false,
          setMarkdownTextHighlight: () => {},
          onToggleFullscreen: () => {},
          presentationApiRef,
          isMarkdown: true,
          activeText: markdown,
          setActiveText: () => {
            throw new Error('expected editor mutations disabled')
          },
          editorTextOverride: overrideText,
          disableEditorMutations: true,
          activeDocumentKey: '/webpage.md',
          highlightedLineRange: null,
          revealLineInEditor: () => {},
          showInViewer: () => {},
          showInPresentation: () => {},
          showInGallery: () => {},
          editorUri: 'inmemory://webpage.md',
          editorLanguage: 'markdown',
          editorRef: editorRef as unknown as React.MutableRefObject<MonacoTextEditorHandle | null>,
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
    for (let i = 0; i < 5; i += 1) await tick()

      const textarea = doc.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
      if (!textarea) throw new Error('expected editor textarea')
      if (textarea.value !== overrideText) throw new Error('expected editorTextOverride rendered')
      if (!textarea.readOnly) throw new Error('expected editor readonly')
    }

    root.unmount()
  } finally {
    restore()
  }
}
