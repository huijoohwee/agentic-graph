import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const script = fileURLToPath(import.meta.url)
process.chdir(resolve(dirname(script), '..'))
if (!process.argv.includes('--verify')) {
  await runLocalViteBrowserSmoke({ logLabel: 'xr-scene-mp4', devServerPort: process.env.AG_XR_MP4_PORT || '4198',
    devServerPath: '/agentic-graph/', baseUrlEnvName: 'AG_XR_MP4_BASE_URL', verifierCommand: process.execPath,
    verifierArgs: [script, '--verify'], verifierFailureLabel: 'XR MP4 export', devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid' })
} else {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ executablePath: findLocalChromiumExecutable() || undefined, headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    const base = process.env.AG_XR_MP4_BASE_URL
    // Keep Vite's actual React-refresh preamble while replacing only the app entry.
    const servedHtml = await (await fetch(`${base}/agentic-graph/`)).text()
    const fixtureHtml = servedHtml.replace(/<script\b[^>]*src=["'][^"']*\/src\/main\.tsx[^"']*["'][^>]*>\s*<\/script>/g, '')
      .replace('id="root"', 'id="fixture"')
    assert.notEqual(fixtureHtml, servedHtml, 'native Vite fixture must remove the application entry')
    assert.ok(!fixtureHtml.includes('src="/src/main.tsx"'))
    // An isolated harness mounts the actual native renderer and Timeline owners once.
    await page.route('**/__xr_mp4_fixture__', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }))
    await page.goto(`${base}/__xr_mp4_fixture__`)
    const evidence = await page.evaluate(async () => {
      const importSource = path => import(`/src/${path}`)
      const dependency = async (source, token) => {
        const code = await (await fetch(`/src/${source}`)).text()
        const paths = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map(match => match[1])
        const path = paths.find(candidate => candidate.includes(token))
        if (!path) throw new Error(`Vite did not resolve the installed ${token} dependency.`)
        return import(path)
      }
      const React = (await dependency('features/three/XrSceneLibrarySubject.tsx', '/react.js')).default
      const reactDom = await dependency('main.tsx', 'react-dom_client')
      const { createRoot } = reactDom.default || reactDom
      if (typeof createRoot !== 'function') throw new Error('Installed React DOM has no createRoot export.')
      await importSource('index.css')
      const { default: ThreeGraph } = await importSource('lib/three/ThreeGraph.impl.tsx')
      const { useWorkspaceExportBridge } = await importSource('features/markdown-workspace/main/useWorkspaceExportBridge.ts')
      const { getMarkdownWorkspaceActionBridge } = await importSource('features/markdown-explorer/workspaceActionBridge.ts')
      const { LaunchDropdownExportMenu } = await importSource('lib/toolbar/LaunchDropdownExportMenu.tsx')
      const toasts = []
      const pushUiToast = toast => { toasts.push(toast) }
      function ExportMenu() {
        const documentKey = useGraphStore(state => state.markdownDocumentName)
        const text = useGraphStore(state => state.markdownDocumentText)
        const bridge = useWorkspaceExportBridge({ activeDocumentKey: documentKey, activeText: text, markdownEditText: null,
          showWebpageHtml: false, iframeSrcDoc: '', viewerEl: null, pushUiToast, getViewerRefCurrent: () => null })
        const [actions, setActions] = React.useState({})
        React.useEffect(() => { setActions(getMarkdownWorkspaceActionBridge().export || {}) }, [bridge.mp4Running, documentKey])
        return React.createElement('ul', { id: 'native-export' }, React.createElement(LaunchDropdownExportMenu, {
          canExport: true, exportActions: actions, exportMenuOpen: true, pdfMenuOpen: false, menuItemClass: '', menuIconClass: '',
          openExportMenu() {}, closeExportMenu() {}, openPdfMenu() {}, closePdfMenu() {}, runExportAction: (_label, action) => action?.(),
        }))
      }
      const { XrCameraMotionSection } = await importSource('features/three/XrCameraMotionSection.tsx')
      const { useGraphStore } = await importSource('hooks/useGraphStore.ts')
      const { completeSourceFilesBootstrap } = await importSource('features/source-files/sourceFilesBootstrapReadiness.ts')
      const { hydrateCanonicalXrMotionReferenceRuntime } = await importSource('features/three/XrMotionReferenceRuntimeBridge.tsx')
      const { applyXrCameraMove } = await importSource('features/three/xrCameraMoveRuntime.ts')
      const { readXrAnimationTransport, updateXrAnimationTransport } = await importSource('features/three/xrAnimationTransportRuntime.ts')
      const { readXrMotionReferenceRuntime } = await importSource('features/three/xrMotionReferenceRuntime.ts')
      const plan = { fps: 30, durationSeconds: 2, stageId: 'tropical-playground',
        subjects: [{ id: 'mp4-performer', label: 'MP4 performer', assetId: 'character-pig', category: 'people',
          position: [0, 0, 0], rotationYDegrees: 0, scale: 1, color: '#de784b' }],
        cast: [{ actorId: 'mp4-performer', animation: { kind: 'character-motion', presetId: 'dance', startTimeSeconds: 0, loop: true },
          marks: [{ timeSeconds: 0, position: [-1, 0, 0], transition: 'linear' }, { timeSeconds: 2, position: [1, 0, 0] }] }] }
      const graph = { type: 'Graph', nodes: [], edges: [], metadata: { kgXrMotionReference: plan } }
      completeSourceFilesBootstrap()
      useGraphStore.setState({ markdownDocumentName: 'mp4-smoke.md', markdownDocumentText: '# MP4 native scene',
        graphData: graph, rawGraphData: graph, canvasRenderMode: '3d', canvas3dMode: 'xr', bottomSurfaceTab: 'timeline', bottomSurfaceCollapsed: false })
      hydrateCanonicalXrMotionReferenceRuntime()
      const host = document.getElementById('fixture')
      const root = createRoot(host)
      root.render(React.createElement(React.Fragment, null,
        React.createElement('div', { style: { position: 'relative', width: 640, height: 420 } }, React.createElement(ThreeGraph, { active: true, mode: 'xr' })),
        React.createElement(XrCameraMotionSection), React.createElement(ExportMenu)))
      const tracks = []
      const originalCapture = HTMLCanvasElement.prototype.captureStream
      HTMLCanvasElement.prototype.captureStream = function (...args) {
        const stream = originalCapture.apply(this, args); tracks.push(...stream.getTracks()); return stream
      }
      const waitFor = async predicate => {
        const deadline = performance.now() + 15_000
        while (!predicate()) {
          if (performance.now() > deadline) throw new Error('Native XR fixture did not become ready.')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
      try {
        await waitFor(() => useGraphStore.getState().canvasSnapshotFns['3d']?.captureVideo)
        const cameraMove = applyXrCameraMove({ moveId: 'orbit-clockwise', anchorId: 'mp4-performer', playheadSeconds: 0 })
        if (!cameraMove.applied) throw new Error(cameraMove.message)
        updateXrAnimationTransport({ operation: 'scrub', timeSeconds: 0.5 })
        const before = readXrAnimationTransport()
        const source = JSON.stringify(readXrMotionReferenceRuntime().plan)
        const capture = useGraphStore.getState().canvasSnapshotFns['3d'].captureVideo
        const result = await capture({})
        if (result.status === 'unsupported') return result
        if (tracks.some(track => track.readyState !== 'ended')) throw new Error('A recording track survived successful export.')
        if (JSON.stringify(readXrMotionReferenceRuntime().plan) !== source) throw new Error('Export changed the authored source.')
        if (readXrAnimationTransport().timeSeconds !== before.timeSeconds) throw new Error('Export did not restore the playhead.')
        const controller = new AbortController()
        const cancelled = capture({ signal: controller.signal })
        const cancelTimer = setTimeout(() => controller.abort(), 300)
        try { await cancelled; throw new Error('Cancelled capture unexpectedly completed.') }
        catch (error) { if (error.name !== 'AbortError') throw error }
        finally { clearTimeout(cancelTimer) }
        if (tracks.some(track => track.readyState !== 'ended')) throw new Error('A recording track survived cancellation.')
        const clickExport = label => {
          const button = [...document.querySelectorAll('#native-export button')].find(item => item.textContent === label)
          if (!button) throw new Error(`Native export action missing: ${label}`)
          button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        }
        clickExport('MP4 (.mp4) — XR scene (silent)')
        await waitFor(() => [...document.querySelectorAll('#native-export button')].some(item => item.textContent === 'Cancel MP4 export'))
        await waitFor(() => tracks.some(track => track.readyState === 'live'))
        clickExport('Cancel MP4 export')
        await waitFor(() => toasts.some(toast => toast.message === 'MP4 export cancelled.'))
        await waitFor(() => !getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        clickExport('MP4 (.mp4) — XR scene (silent)')
        await waitFor(() => getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        await waitFor(() => tracks.some(track => track.readyState === 'live'))
        useGraphStore.setState({ markdownDocumentName: 'next-scene.md', markdownDocumentText: '# Next scene',
          timelineTransportDocumentKey: 'next-scene.md#xr-motion', timelineTransportPosition: 0.01, timelineTransportPlaying: false })
        await waitFor(() => !getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        if (useGraphStore.getState().timelineTransportPosition !== 0.01) throw new Error('Stale export restored into the next document.')
        if (tracks.some(track => track.readyState !== 'ended')) throw new Error('A recording track survived document switching.')
        return { nativeMenuCancellationVerified: true, documentSwitchVerified: true, status: result.status, byteSize: result.blob.size, mimeType: result.blob.type, ...result.evidence, cancellationVerified: true }
      } finally {
        HTMLCanvasElement.prototype.captureStream = originalCapture
        root.unmount()
      }
    })
    if (evidence.status === 'captured') {
      assert.ok(evidence.byteSize > 0)
      assert.equal(evidence.decodedFrames, 3)
      assert.ok(evidence.renderedFrames >= 3)
      assert.ok(new Set(evidence.sampleHashes).size >= 2, 'native scene/camera frames should visibly change')
      assert.ok(Math.abs(evidence.durationSeconds - 2) <= 0.4)
      assert.equal(evidence.cancellationVerified, true)
      assert.equal(evidence.nativeMenuCancellationVerified, true)
      assert.equal(evidence.documentSwitchVerified, true)
    } else assert.equal(evidence.status, 'unsupported')
    console.log(JSON.stringify({ schema: 'agentic-graph.xr-scene-mp4-browser/v1', evidence }, null, 2))
  } finally { await browser.close() }
}
