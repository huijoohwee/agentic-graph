import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { buildWorkspaceHtmlExportDocument } from '@/features/markdown-workspace/main/exports/exportHtmlWorkspace'
import { buildHtmlViewerSnapshotDocument } from '@/features/markdown-workspace/main/exports/exportHtmlViewer'
import { buildMarkdownHtmlViewerDocument } from '@/features/markdown/htmlViewerCss'

const readJsonScriptPayload = (html: string, id: string): unknown => {
  const re = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)<\\/script>`)
  const match = html.match(re)
  if (!match) throw new Error(`missing JSON script payload ${id}`)
  return JSON.parse(match[1] || 'null')
}

export function testBuildWorkspaceHtmlExportDocumentEmbedsEditorAndCanvasPayloads() {
  const editorHtml = '<!doctype html><html><body><article data-editor="1">Editor Workspace</article><script>window.editor=1</script></body></html>'
  const canvasHtml = '<!doctype html><html><body><main data-canvas="1">Canvas</main><script>window.canvas=1</script></body></html>'
  const html = buildWorkspaceHtmlExportDocument({
    title: 'Demo Workspace',
    editorHtml,
    canvasHtml,
    meta: {
      kind: 'workspace',
      title: 'Demo Workspace',
      exportedAt: '2026-05-31T00:00:00.000Z',
      activeDocumentPath: '/demo.md',
      graphNodeCount: 3,
      graphEdgeCount: 2,
      graphSemanticKey: 'semantic-key',
      canvasMode: '2d',
    },
  })

  if (!html.includes('data-kg-workspace-export="workspace"')) throw new Error('expected workspace export marker')
  if (/<section\b|<\/div>/i.test(html)) throw new Error(`expected outer Workspace HTML export to avoid generic HTML division element containers, got: ${html}`)
  if (!html.includes('data-kg-workspace-export-section="editor-workspace"')) throw new Error('expected Editor Workspace section')
  if (!html.includes('data-kg-workspace-export-section="canvas"')) throw new Error('expected Canvas section')
  if (!html.includes('kg-workspace-editor-frame') || !html.includes('kg-workspace-canvas-frame')) {
    throw new Error('expected workspace export iframes')
  }
  if (String(readJsonScriptPayload(html, 'kg-workspace-export-editor-html')) !== editorHtml) {
    throw new Error('expected exact Editor Workspace HTML payload')
  }
  if (String(readJsonScriptPayload(html, 'kg-workspace-export-canvas-html')) !== canvasHtml) {
    throw new Error('expected exact Canvas HTML payload')
  }
  const meta = readJsonScriptPayload(html, 'kg-workspace-export-meta') as { graphSemanticKey?: unknown; canvasMode?: unknown }
  if (meta.graphSemanticKey !== 'semantic-key' || meta.canvasMode !== '2d') {
    throw new Error('expected workspace export metadata to preserve semantic key and canvas mode')
  }
}

export async function testWorkspaceHtmlExportBootsIframeSrcdocPayloads() {
  const editorHtml = '<!doctype html><html><body><article data-editor="1">Editor Workspace</article><script>window.editor=1</script></body></html>'
  const canvasHtml = '<!doctype html><html><body><main data-canvas="1">Canvas</main><script>window.canvas=1</script></body></html>'
  const html = buildWorkspaceHtmlExportDocument({
    title: 'Runtime Workspace',
    editorHtml,
    canvasHtml,
    meta: {
      kind: 'workspace',
      title: 'Runtime Workspace',
      exportedAt: '2026-05-31T00:00:00.000Z',
      activeDocumentPath: '/runtime.md',
      graphNodeCount: 1,
      graphEdgeCount: 0,
      graphSemanticKey: 'runtime-key',
      canvasMode: '3d',
    },
  })
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'file:///tmp/agentic-graph-runtime-workspace.html',
  })
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const editorFrame = dom.window.document.getElementById('kg-workspace-editor-frame') as HTMLIFrameElement | null
  const canvasFrame = dom.window.document.getElementById('kg-workspace-canvas-frame') as HTMLIFrameElement | null
  if (!editorFrame || !canvasFrame) throw new Error('expected Workspace HTML export iframes to exist')
  if (editorFrame.srcdoc !== editorHtml) throw new Error('expected Workspace runtime to assign exact Editor Workspace srcdoc payload')
  if (canvasFrame.srcdoc !== canvasHtml) throw new Error('expected Workspace runtime to assign exact Canvas srcdoc payload')
}

export function testWorkspaceHtmlExportReusesViewerCanvasBuildersAndSemanticKey() {
  const filePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'exports', 'exportHtmlWorkspace.ts')
  const text = readFileSync(filePath, 'utf8')
  const requiredSnippets = [
    'buildHtmlViewerSnapshotDocument',
    'buildHtmlCanvasWorkspaceDocument',
    'buildScopedGraphSemanticKey',
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) throw new Error(`expected Workspace HTML export to reuse ${snippet}`)
  }
  const forbiddenSnippets = [
    'querySelectorAll(',
    'buildGraphHtmlViewerMarkup',
    'renderGraphCanvasSvgForHtmlExport',
  ]
  for (const snippet of forbiddenSnippets) {
    if (text.includes(snippet)) throw new Error(`expected Workspace HTML export to avoid duplicate local owner: ${snippet}`)
  }
}

export function testMarkdownHtmlViewerDocumentNormalizesGenericDivContainers() {
  const html = buildMarkdownHtmlViewerDocument({
    title: 'Semantic Viewer',
    bodyHtml: [
      '<section class="outer" role="article">',
      '  <section class="inner">Readable content</section>',
      '</section>',
    ].join(''),
  })
  if (/<section\b|<\/div>/i.test(html)) {
    throw new Error(`expected generated markdown viewer HTML to avoid generic HTML division element containers, got: ${html}`)
  }
  if (!/<section\b[^>]*class="outer"[^>]*role="article"[^>]*>/.test(html)) {
    throw new Error(`expected role=article generic wrapper to become a semantic section with role metadata, got: ${html}`)
  }
  if (!/<section\b[^>]*class="inner"[^>]*>Readable content<\/section>/.test(html)) {
    throw new Error(`expected nested generic wrapper to become section, got: ${html}`)
  }
}

export async function testWorkspaceHtmlViewerFallbackAvoidsOpenViewerWarning() {
  const toasts: Array<{ message?: string }> = []
  const fallbackMarkdownText = ['# Editor Workspace', '', 'Fallback body from active text with footnote.[^1]', '', '- Item one', '', '[^1]: Footnote body'].join('\n')
  const html = await buildHtmlViewerSnapshotDocument({
    exportBaseName: 'editor-workspace',
    showWebpageHtml: false,
    iframeSrcDoc: null,
    viewerEl: null,
    viewerRefCurrent: null,
    fallbackMarkdownText,
    pushUiToast: toast => {
      toasts.push({ message: String(toast.message || '') })
    },
  })
  const webpageHtml = await buildHtmlViewerSnapshotDocument({
    exportBaseName: 'editor-webpage-workspace',
    showWebpageHtml: true,
    iframeSrcDoc: null,
    viewerEl: null,
    viewerRefCurrent: null,
    fallbackMarkdownText,
    pushUiToast: toast => {
      toasts.push({ message: String(toast.message || '') })
    },
  })

  if (!html) throw new Error('expected active editor text to build fallback Viewer HTML')
  if (!webpageHtml) throw new Error('expected active editor text to build fallback webpage Viewer HTML')
  if (!html.includes('data-kg-editor-workspace-fallback="markdown"')) throw new Error('expected editor workspace fallback marker')
  if (!webpageHtml.includes('data-kg-editor-workspace-fallback="markdown"')) throw new Error('expected webpage editor workspace fallback marker')
  if (!new RegExp('<h1\\b[^>]*>Editor Workspace</h1>').test(html)) throw new Error(`expected markdown fallback to render heading, got ${html}`)
  if (!html.includes('Fallback body from active text')) throw new Error('expected markdown fallback to preserve active text body')
  if (!html.includes('footnote')) throw new Error('expected markdown fallback to use full viewer markdown plugin support')
  if (!html.includes('data-kg-editor-workspace-source="1"')) throw new Error('expected markdown fallback to preserve Editor Workspace source context')
  if (!html.includes('[^1]: Footnote body')) throw new Error('expected markdown fallback source context to preserve raw active text')
  if (toasts.some(toast => String(toast.message || '').includes('Open the Viewer to export HTML'))) {
    throw new Error('expected Workspace HTML fallback to avoid Open the Viewer warning')
  }
}

export async function testHtmlViewerWebpageSrcDocInlinesStandaloneAssets() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/workspace' })
  const g = globalThis as unknown as {
    window?: unknown
    document?: unknown
    DOMParser?: unknown
    FileReader?: unknown
    fetch?: unknown
  }
  const prevWindow = g.window
  const prevDocument = g.document
  const prevDomParser = g.DOMParser
  const prevFileReader = g.FileReader
  const prevFetch = g.fetch
  try {
    g.window = dom.window as unknown
    g.document = dom.window.document as unknown
    g.DOMParser = dom.window.DOMParser as unknown
    g.FileReader = dom.window.FileReader as unknown
    g.fetch = (async (input: unknown) => {
      const requestUrl = String(input || '')
      const decoded = (() => {
        try {
          const u = new URL(requestUrl, 'http://localhost')
          return decodeURIComponent(u.searchParams.get('url') || requestUrl)
        } catch {
          return requestUrl
        }
      })()
      const bodyByPath = [
        ['/styles/site.css', '.hero{background-image:url("/assets/bg.png")}'],
        ['/assets/photo.png', 'photo'],
        ['/assets/hero@2x.png', 'hero2x'],
        ['/assets/poster.jpg', 'poster'],
        ['/assets/movie.mp4', 'movie'],
        ['/assets/bg.png', 'bg'],
      ] as const
      const found = bodyByPath.find(([path]) => decoded.includes(path))
      if (!found) return { ok: false, status: 404, headers: new Headers(), text: async () => '', blob: async () => new dom.window.Blob([]) } as Response
      const [path, body] = found
      const type = path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.mp4')
          ? 'video/mp4'
          : path.endsWith('.jpg')
            ? 'image/jpeg'
            : 'image/png'
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': type, 'content-length': String(body.length) }),
        text: async () => body,
        blob: async () => new dom.window.Blob([body], { type }),
      } as Response
    }) as unknown

    const html = await buildHtmlViewerSnapshotDocument({
      exportBaseName: 'web <bad>',
      showWebpageHtml: true,
      iframeSrcDoc: [
        '<!doctype html>',
        '<html><head>',
        '<base href="https://site.test/page/index.html" />',
        '<link rel="stylesheet" href="/styles/site.css" />',
        '</head><body>',
        '<section class="hero">',
        '<img alt="photo" src="assets/photo.png" />',
        '<picture><source srcset="/assets/hero@2x.png 2x" /><img alt="responsive" srcset="assets/photo.png 1x" /></picture>',
        '<video poster="/assets/poster.jpg"><source src="/assets/movie.mp4" type="video/mp4" /></video>',
        '</section>',
        '</body></html>',
      ].join(''),
      viewerEl: null,
      viewerRefCurrent: null,
      pushUiToast: () => void 0,
    })

    if (!html) throw new Error('expected webpage srcdoc export HTML')
    if (!html.includes('data-kg-export-inlined-stylesheet="/styles/site.css"')) throw new Error('expected linked stylesheet to be inlined')
    if (!html.includes('data:image/png;base64')) throw new Error('expected image and CSS background assets to be inlined as data URLs')
    if (!html.includes('data:image/jpeg;base64')) throw new Error('expected video poster to be inlined as a data URL')
    if (!html.includes('data:video/mp4;base64')) throw new Error('expected video source to be inlined as a data URL')
    if (html.includes('src="assets/photo.png"') || html.includes('href="/styles/site.css"')) {
      throw new Error(`expected webpage srcdoc export to remove local asset references, got ${html}`)
    }
    if (html.includes('<title>web <bad></title>')) throw new Error('expected generated titles to be escaped')
  } finally {
    g.window = prevWindow
    g.document = prevDocument
    g.DOMParser = prevDomParser
    g.FileReader = prevFileReader
    g.fetch = prevFetch
  }
}

export function testWorkspaceHtmlViewerFallbackUsesMarkdownPreviewOwner() {
  const filePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'exports', 'exportHtmlViewer.ts')
  const text = readFileSync(filePath, 'utf8')
  const requiredSnippets = [
    "import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'",
    'withForcedIntersectingObserver',
    'React.createElement(MarkdownPreview',
    'buildHtmlFromViewerRoot',
    'appendEditorWorkspaceSourceContext',
    'includeSourceContext: true',
    'data-kg-export-hidden-viewer-render',
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) throw new Error(`expected missing-Viewer fallback to reuse MarkdownPreview owner: ${snippet}`)
  }
  if (text.includes('getMarkdownItFast')) throw new Error('expected fallback to avoid the low-fidelity fast Markdown renderer')
}

export function testWorkspaceExportBridgePassesActiveEditorFallback() {
  const filePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'useWorkspaceExportBridge.ts')
  const text = readFileSync(filePath, 'utf8')
  const requiredSnippets = [
    'exportFallbackMarkdownText',
    'markdownEditText ??',
    "typeof viewerTextOverride === 'string' ? viewerTextOverride : activeText",
    'exportHtmlWorkspaceFromWorkspace',
  ]
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) throw new Error(`expected Workspace HTML bridge to pass active editor fallback: ${snippet}`)
  }
  if (!/exportHtmlViewerSnapshot\(\{[\s\S]*?fallbackMarkdownText:\s*exportFallbackMarkdownText[\s\S]*?\}\)/.test(text)) {
    throw new Error('expected HTML Viewer export action to pass active editor fallback text')
  }
  if (!/exportHtmlWorkspaceFromWorkspace\(\{[\s\S]*?fallbackMarkdownText:\s*exportFallbackMarkdownText[\s\S]*?\}\)/.test(text)) {
    throw new Error('expected Workspace HTML export action to pass active editor fallback text')
  }
}
