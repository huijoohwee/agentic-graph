import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from 'playwright'
import { JSDOM } from 'jsdom'

import { buildHtmlViewerSnapshotDocument } from '@/features/markdown-workspace/main/exports/exportHtmlViewer'
import { buildWorkspaceHtmlExportDocument } from '@/features/markdown-workspace/main/exports/exportHtmlWorkspace'

type BrowserIssue = {
  page: string
  kind: 'pageerror' | 'console-error' | 'network'
  message: string
}

function readOptionalArg(name: string): string {
  const ix = process.argv.indexOf(name)
  const v = ix >= 0 ? process.argv[ix + 1] : ''
  return String(v || '').trim()
}

function resolvePath(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value)
}

async function assertFile(pathname: string, label: string): Promise<void> {
  const stat = await fs.stat(pathname).catch(() => null)
  if (!stat || !stat.isFile() || stat.size <= 0) throw new Error(`Missing ${label}: ${pathname}`)
}

function installBuilderDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'file:///agentic-graph-export-builder.html' })
  const g = globalThis as unknown as {
    window?: unknown
    document?: unknown
    DOMParser?: unknown
    FileReader?: unknown
    Blob?: unknown
    Headers?: unknown
  }
  const prev = {
    window: g.window,
    document: g.document,
    DOMParser: g.DOMParser,
    FileReader: g.FileReader,
    Blob: g.Blob,
    Headers: g.Headers,
  }
  g.window = dom.window as unknown
  g.document = dom.window.document as unknown
  g.DOMParser = dom.window.DOMParser as unknown
  g.FileReader = dom.window.FileReader as unknown
  g.Blob = dom.window.Blob as unknown
  g.Headers = dom.window.Headers as unknown
  return () => {
    g.window = prev.window
    g.document = prev.document
    g.DOMParser = prev.DOMParser
    g.FileReader = prev.FileReader
    g.Blob = prev.Blob
    g.Headers = prev.Headers
  }
}

async function buildViewerSmokeHtml(): Promise<string> {
  const restore = installBuilderDom()
  try {
    const onePxPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lc7zNwAAAABJRU5ErkJggg=='
    const html = await buildHtmlViewerSnapshotDocument({
      exportBaseName: 'viewer-export-browser-smoke',
      showWebpageHtml: true,
      iframeSrcDoc: [
        '<!doctype html>',
        '<html lang="en">',
        '<head><meta charset="utf-8" /><title>Viewer Export Browser Smoke</title></head>',
        '<body>',
        '<main data-kg-viewer-browser-smoke="1">',
        '<h1>Viewer Export Fixture</h1>',
        `<img alt="inline export proof" src="${onePxPng}" />`,
        '<p>Standalone viewer payload rendered.</p>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      viewerEl: null,
      viewerRefCurrent: null,
      pushUiToast: () => void 0,
    })
    if (!html || !html.trim()) throw new Error('Failed to build Viewer HTML smoke artifact')
    return html
  } finally {
    restore()
  }
}

async function writeSmokeArtifacts(args: {
  outputDir: string
  canvas2dPath: string
}): Promise<{ viewerPath: string; workspacePath: string }> {
  await fs.mkdir(args.outputDir, { recursive: true })
  const viewerHtml = await buildViewerSmokeHtml()
  const canvasHtml = await fs.readFile(args.canvas2dPath, 'utf8')
  if (!canvasHtml.trim()) throw new Error(`Canvas 2D artifact is empty: ${args.canvas2dPath}`)

  const viewerPath = path.join(args.outputDir, 'agentic-graph.ci.viewer.html')
  const workspacePath = path.join(args.outputDir, 'agentic-graph.ci.workspace.html')
  const workspaceHtml = buildWorkspaceHtmlExportDocument({
    title: 'agentic-graph Workspace Export Browser Smoke',
    editorHtml: viewerHtml,
    canvasHtml,
    meta: {
      kind: 'workspace',
      title: 'agentic-graph Workspace Export Browser Smoke',
      exportedAt: new Date(0).toISOString(),
      activeDocumentPath: '/browser-smoke.md',
      graphNodeCount: 1,
      graphEdgeCount: 0,
      graphSemanticKey: 'browser-smoke',
      canvasMode: '2d',
    },
  })
  await fs.writeFile(viewerPath, viewerHtml, 'utf8')
  await fs.writeFile(workspacePath, workspaceHtml, 'utf8')
  return { viewerPath, workspacePath }
}

async function withPage(args: {
  browser: Awaited<ReturnType<typeof chromium.launch>>
  label: string
  issues: BrowserIssue[]
  action: (page: Page) => Promise<void>
}): Promise<void> {
  const page = await args.browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', err => {
    args.issues.push({ page: args.label, kind: 'pageerror', message: String(err?.message || err) })
  })
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/Failed to load resource/i.test(text)) return
    args.issues.push({ page: args.label, kind: 'console-error', message: text })
  })
  await page.route('http://**/*', route => {
    args.issues.push({ page: args.label, kind: 'network', message: route.request().url() })
    void route.abort()
  })
  await page.route('https://**/*', route => {
    args.issues.push({ page: args.label, kind: 'network', message: route.request().url() })
    void route.abort()
  })
  try {
    await args.action(page)
  } finally {
    await page.close()
  }
}

async function verifyViewerArtifact(args: {
  browser: Awaited<ReturnType<typeof chromium.launch>>
  issues: BrowserIssue[]
  viewerPath: string
}): Promise<void> {
  await withPage({
    browser: args.browser,
    label: 'viewer',
    issues: args.issues,
    action: async page => {
      await page.goto(pathToFileURL(args.viewerPath).toString(), { waitUntil: 'load' })
      await page.waitForSelector('[data-kg-viewer-browser-smoke="1"]', { timeout: 5000 })
      const state = await page.evaluate(() => {
        const root = document.querySelector('[data-kg-viewer-browser-smoke="1"]') as HTMLElement | null
        const img = document.querySelector('img[alt="inline export proof"]') as HTMLImageElement | null
        return {
          text: String(root?.textContent || ''),
          imageSrc: String(img?.getAttribute('src') || ''),
          imageComplete: !!img?.complete,
        }
      })
      if (!state.text.includes('Viewer Export Fixture')) throw new Error(`Viewer artifact text missing: ${JSON.stringify(state)}`)
      if (!state.imageSrc.startsWith('data:image/png;base64,')) throw new Error(`Viewer artifact image was not standalone: ${state.imageSrc}`)
      if (!state.imageComplete) throw new Error('Viewer artifact image did not complete loading')
    },
  })
}

async function verifyCanvasArtifact(args: {
  browser: Awaited<ReturnType<typeof chromium.launch>>
  issues: BrowserIssue[]
  canvasPath: string
  mode: '2d' | '3d'
}): Promise<void> {
  await withPage({
    browser: args.browser,
    label: `canvas-${args.mode}`,
    issues: args.issues,
    action: async page => {
      await page.goto(pathToFileURL(args.canvasPath).toString(), { waitUntil: 'load' })
      await page.waitForSelector('#kg-root', { timeout: 8000 })
      await page.waitForSelector('#kg-stage', { timeout: 8000 })
      await page.waitForSelector('#kg-svgWrap svg', { timeout: 8000, state: args.mode === '3d' ? 'attached' : 'visible' })
      if (args.mode === '3d') await page.waitForSelector('#kg-root.kg-canvas3d', { timeout: 8000, state: 'attached' })
      const state = await page.evaluate(mode => {
        const root = document.querySelector('#kg-root') as HTMLElement | null
        const stage = document.querySelector('#kg-stage') as HTMLElement | null
        const svg = document.querySelector('#kg-svgWrap svg') as SVGSVGElement | null
        const webgl = document.querySelector('#kg-webgl') as HTMLCanvasElement | null
        const hud = document.querySelector('#kg-hud') as HTMLElement | null
        const rect = root?.getBoundingClientRect()
        const svgRect = svg?.getBoundingClientRect()
        const webglRect = webgl?.getBoundingClientRect()
        return {
          mode,
          hasRoot: !!root,
          hasStage: !!stage,
          hasSvg: !!svg,
          hasHud: !!hud,
          hasWebgl: !!webgl,
          rootClass: String(root?.className || ''),
          rootWidth: Number(rect?.width || 0),
          rootHeight: Number(rect?.height || 0),
          svgWidth: Number(svgRect?.width || 0),
          svgHeight: Number(svgRect?.height || 0),
          webglWidth: Number(webglRect?.width || 0),
          webglHeight: Number(webglRect?.height || 0),
          nodeCount: document.querySelectorAll('[data-node-id]').length,
          edgeCount: document.querySelectorAll('[data-edge-id]').length,
        }
      }, args.mode)
      if (!state.hasRoot || !state.hasStage || !state.hasSvg || !state.hasHud) {
        throw new Error(`Canvas ${args.mode} artifact missing runtime DOM: ${JSON.stringify(state)}`)
      }
      if (state.rootWidth < 100 || state.rootHeight < 100) {
        throw new Error(`Canvas ${args.mode} artifact rendered blank/small: ${JSON.stringify(state)}`)
      }
      if (args.mode === '2d' && (state.svgWidth < 100 || state.svgHeight < 100)) {
        throw new Error(`Canvas 2D artifact rendered blank/small SVG layer: ${JSON.stringify(state)}`)
      }
      if (args.mode === '3d' && (state.webglWidth < 100 || state.webglHeight < 100)) {
        throw new Error(`Canvas 3D artifact rendered blank/small WebGL layer: ${JSON.stringify(state)}`)
      }
      if (state.nodeCount <= 0) throw new Error(`Canvas ${args.mode} artifact has no rendered nodes: ${JSON.stringify(state)}`)
      if (args.mode === '3d' && (!state.hasWebgl || !state.rootClass.includes('kg-canvas3d'))) {
        throw new Error(`Canvas 3D artifact did not enter 3D runtime mode: ${JSON.stringify(state)}`)
      }
    },
  })
}

async function verifyWorkspaceArtifact(args: {
  browser: Awaited<ReturnType<typeof chromium.launch>>
  issues: BrowserIssue[]
  workspacePath: string
}): Promise<void> {
  await withPage({
    browser: args.browser,
    label: 'workspace',
    issues: args.issues,
    action: async page => {
      await page.goto(pathToFileURL(args.workspacePath).toString(), { waitUntil: 'load' })
      await page.waitForSelector('[data-kg-workspace-export="workspace"]', { timeout: 5000 })
      await page.waitForSelector('#kg-workspace-editor-frame', { timeout: 5000 })
      await page.waitForSelector('#kg-workspace-canvas-frame', { timeout: 5000 })
      const frameState = await page.evaluate(() => {
        const editor = document.querySelector('#kg-workspace-editor-frame') as HTMLIFrameElement | null
        const canvas = document.querySelector('#kg-workspace-canvas-frame') as HTMLIFrameElement | null
        return {
          editorSrcdocLength: String(editor?.srcdoc || '').length,
          canvasSrcdocLength: String(canvas?.srcdoc || '').length,
        }
      })
      if (frameState.editorSrcdocLength <= 100 || frameState.canvasSrcdocLength <= 100) {
        throw new Error(`Workspace iframe srcdoc payloads missing: ${JSON.stringify(frameState)}`)
      }
      const editorFrame = await (await page.$('#kg-workspace-editor-frame'))?.contentFrame()
      const canvasFrame = await (await page.$('#kg-workspace-canvas-frame'))?.contentFrame()
      if (!editorFrame || !canvasFrame) throw new Error('Workspace iframe content frames were not available')
      await editorFrame.waitForSelector('[data-kg-viewer-browser-smoke="1"]', { timeout: 5000 })
      await canvasFrame.waitForSelector('#kg-root', { timeout: 8000 })
      await canvasFrame.waitForSelector('#kg-svgWrap svg', { timeout: 8000 })
      const state = await canvasFrame.evaluate(() => ({
        text: String(document.body.textContent || ''),
        root: !!document.querySelector('#kg-root'),
        svg: !!document.querySelector('#kg-svgWrap svg'),
        nodeCount: document.querySelectorAll('[data-node-id]').length,
      }))
      if (!state.root || !state.svg || state.nodeCount <= 0) {
        throw new Error(`Workspace Canvas iframe did not render exported canvas: ${JSON.stringify(state)}`)
      }
    },
  })
}

async function main() {
  const canvas2dPath = resolvePath(readOptionalArg('--canvas-2d'))
  const canvas3dPath = resolvePath(readOptionalArg('--canvas-3d'))
  const outputDir = resolvePath(readOptionalArg('--output-dir')) || path.resolve(process.cwd(), '../../data/outputs')
  if (!canvas2dPath) throw new Error('Missing --canvas-2d')
  if (!canvas3dPath) throw new Error('Missing --canvas-3d')
  await assertFile(canvas2dPath, 'Canvas 2D HTML artifact')
  await assertFile(canvas3dPath, 'Canvas 3D HTML artifact')

  const { viewerPath, workspacePath } = await writeSmokeArtifacts({ outputDir, canvas2dPath })
  const browser = await chromium.launch({ headless: true })
  const issues: BrowserIssue[] = []
  try {
    await verifyViewerArtifact({ browser, issues, viewerPath })
    await verifyCanvasArtifact({ browser, issues, canvasPath: canvas2dPath, mode: '2d' })
    await verifyCanvasArtifact({ browser, issues, canvasPath: canvas3dPath, mode: '3d' })
    await verifyWorkspaceArtifact({ browser, issues, workspacePath })
  } finally {
    await browser.close()
  }

  if (issues.length) {
    const rendered = issues.map(issue => `${issue.page} ${issue.kind}: ${issue.message}`).join('\n')
    throw new Error(`HTML export browser verification found runtime issues:\n${rendered}`)
  }

  process.stdout.write([
    viewerPath,
    workspacePath,
    canvas2dPath,
    canvas3dPath,
    '',
  ].join('\n'))
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + '\n')
  process.exit(1)
})
