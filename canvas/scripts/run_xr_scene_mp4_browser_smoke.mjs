import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const script = fileURLToPath(import.meta.url)
process.chdir(resolve(dirname(script), '..'))
if (!process.argv.includes('--verify')) {
  await runLocalViteBrowserSmoke({ logLabel: 'xr-scene-mp4', devServerPort: process.env.AG_XR_MP4_PORT || '4198',
    devServerPath: '/agentic-graph/', baseUrlEnvName: 'AG_XR_MP4_BASE_URL', verifierCommand: process.execPath,
    verifierArgs: [script, '--verify'], verifierFailureLabel: 'XR MP4 export', devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid' })
} else {
  const startedAt = Date.now()
  const pageErrors = []
  let phase = 'launch'
  let browserServer
  const reportPhase = next => {
    phase = next
    console.log(JSON.stringify({ phase, elapsedMs: Date.now() - startedAt }))
  }
  // This deadline runs outside the page: renderer starvation also prevents page timers.
  const watchdog = setTimeout(() => {
    console.error(JSON.stringify({ error: 'XR MP4 verifier exceeded 120 seconds.', phase, pageErrors }))
    const forcedExit = setTimeout(() => { browserServer?.process().kill('SIGKILL'); process.exit(1) }, 2_000)
    void Promise.resolve(browserServer?.kill()).then(() => { clearTimeout(forcedExit); process.exit(1) }, () => {})
  }, 120_000)
  try {
    reportPhase('launch')
    const { chromium } = await import('playwright')
    // Keep an exact owned process handle for deadline cleanup, including a stalled renderer.
    browserServer = await chromium.launchServer({ headless: true, timeout: 30_000, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 10_000 })
    for (const viewport of [{ name: 'desktop', width: 1024, height: 768 }, { name: 'mobile', width: 390, height: 844 }]) {
    reportPhase(`viewport:${viewport.name}`)
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(15_000)
    let rejectPageError
    const pageFailure = new Promise((_resolve, reject) => { rejectPageError = reject })
    void pageFailure.catch(() => {})
    page.on('pageerror', error => {
      const message = error.stack || error.message
      if (pageErrors.length < 8) pageErrors.push(message)
      console.error(JSON.stringify({ pageError: message, phase }))
      rejectPageError(error)
    })
    let consoleErrors = 0
    page.on('console', message => {
      const value = message.text()
      if (value.startsWith('XR_MP4_PHASE:')) reportPhase(value.slice('XR_MP4_PHASE:'.length))
      else if (value.startsWith('XR_MP4_CLOCK:')) console.log(value.slice('XR_MP4_CLOCK:'.length))
      else if (message.type() === 'error' && consoleErrors++ < 8) console.error(JSON.stringify({ browserError: value, phase }))
    })
    page.on('crash', () => rejectPageError(new Error(`XR MP4 browser page crashed during ${phase}.`)))
    const base = process.env.AG_XR_MP4_BASE_URL
    reportPhase('fixture-html')
    // Keep Vite's actual React-refresh preamble while replacing only the app entry.
    const servedHtml = await (await fetch(`${base}/agentic-graph/`, { signal: AbortSignal.timeout(15_000) })).text()
    const fixtureHtml = servedHtml.replace(/<script\b[^>]*src=["'][^"']*\/src\/main\.tsx[^"']*["'][^>]*>\s*<\/script>/g, '')
      .replace('id="root"', 'id="fixture"')
    assert.notEqual(fixtureHtml, servedHtml, 'native Vite fixture must remove the application entry')
    assert.ok(!fixtureHtml.includes('src="/src/main.tsx"'))
    // An isolated harness mounts the actual native renderer and Timeline owners once.
    await page.route('**/__xr_mp4_fixture__', route => route.fulfill({ contentType: 'text/html', body: fixtureHtml }))
    reportPhase('fixture-navigation')
    await page.goto(`${base}/__xr_mp4_fixture__`)
    const evidence = await Promise.race([pageFailure, page.evaluate(async () => {
      const report = label => console.info(`XR_MP4_PHASE:${label}`)
      const importSource = path => { report(`import:${path}`); return import(`/src/${path}`) }
      const dependency = async (source, token) => {
        report(`dependency:${token}`)
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
      const { RICH_MEDIA_TIMELINE_TRANSPORT_EVENT } = await importSource('lib/render/richMediaTimelineSync.ts')
      const plan = { fps: 30, durationSeconds: 2, stageId: 'tropical-playground',
        subjects: [{ id: 'mp4-performer', label: 'MP4 performer', assetId: 'character-pig', category: 'people',
          position: [0, 0, 0], rotationYDegrees: 0, scale: 1, color: '#de784b' }],
        cast: [{ actorId: 'mp4-performer', animation: { kind: 'character-motion', presetId: 'dance', startTimeSeconds: 0, loop: true },
          marks: [{ timeSeconds: 0, position: [-1, 0, 0], transition: 'linear' }, { timeSeconds: 2, position: [1, 0, 0] }] }] }
      const graph = { type: 'Graph', nodes: [], edges: [], metadata: { kgXrMotionReference: plan } }
      report('source-bootstrap')
      completeSourceFilesBootstrap()
      useGraphStore.setState({ markdownDocumentName: 'mp4-smoke.md', markdownDocumentText: '# MP4 native scene',
        graphData: graph, rawGraphData: graph, canvasRenderMode: '3d', canvas3dMode: 'xr', bottomSurfaceTab: 'timeline', bottomSurfaceCollapsed: false })
      hydrateCanonicalXrMotionReferenceRuntime()
      report('root-render')
      const host = document.getElementById('fixture')
      const root = createRoot(host)
      root.render(React.createElement(React.Fragment, null,
        React.createElement('div', { style: { position: 'relative', width: '100%', maxWidth: 480, height: 300 } }, React.createElement(ThreeGraph, { active: true, mode: 'xr' })),
        React.createElement(XrCameraMotionSection), React.createElement(ExportMenu)))
      const tracks = []
      const originalCapture = HTMLCanvasElement.prototype.captureStream
      const originalStart = MediaRecorder.prototype.start
      const originalStop = MediaRecorder.prototype.stop
      let clockStarts = 0; let startedAtZero = false; let openingReadComplete = false
      const clockFrames = []
      const copyTimings = []; let copyCount = 0; let copyTotalMs = 0; let copyMaxMs = 0
      let recordingStartedAt = null
      const observeClockStart = event => {
        if (recordingStartedAt !== null && event.detail.playing && clockFrames.length < 256) {
          clockFrames.push({ elapsedMs: Math.round(performance.now() - recordingStartedAt), timeMs: event.detail.timeMs })
        }
        if (!event.detail.clockStart) return
        if (event.detail.position !== 0 || event.detail.timeMs !== 0) throw new Error('Native startup did not acknowledge zero.')
        clockStarts++; report('native-clock-zero-acknowledged')
      }
      window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observeClockStart)
      const originalReadPixels = CanvasRenderingContext2D.prototype.getImageData
      const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage
      MediaRecorder.prototype.start = function (...args) {
        startedAtZero = clockStarts > 0 && openingReadComplete && readXrAnimationTransport().timeSeconds === 0
        report('recorder-start-request')
        copyTimings.length = 0; copyCount = 0; copyTotalMs = 0; copyMaxMs = 0
        recordingStartedAt = performance.now()
        this.addEventListener('start', () => report('recorder-start-event'), { once: true })
        return originalStart.apply(this, args)
      }
      MediaRecorder.prototype.stop = function (...args) {
        report('recorder-stop')
        console.info(`XR_MP4_CLOCK:${JSON.stringify({ clockFrames, copyTimings, copyCount, copyTotalMs, copyMaxMs, recordingElapsedMs: performance.now() - recordingStartedAt })}`)
        recordingStartedAt = null
        return originalStop.apply(this, args)
      }
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (recordingStartedAt === null || !(args[0] instanceof HTMLCanvasElement)) return originalDrawImage.apply(this, args)
        const started = performance.now()
        try { return originalDrawImage.apply(this, args) } finally {
          const durationMs = performance.now() - started
          copyCount++; copyTotalMs += durationMs; copyMaxMs = Math.max(copyMaxMs, durationMs)
          if (copyTimings.length < 128) copyTimings.push({ elapsedMs: Math.round(started - recordingStartedAt), durationMs,
            source: [args[0].width, args[0].height], target: [this.canvas.width, this.canvas.height] })
        }
      }
      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        report('pixel-read')
        const pixels = originalReadPixels.apply(this, args)
        openingReadComplete = true
        report('pixel-read-complete')
        return pixels
      }
      HTMLCanvasElement.prototype.captureStream = function (...args) {
        const stream = originalCapture.apply(this, args); tracks.push(...stream.getTracks()); return stream
      }
      const waitFor = async (label, predicate) => {
        report(label)
        const deadline = performance.now() + 15_000
        while (!predicate()) {
          if (performance.now() > deadline) throw new Error(`Native XR fixture timed out during ${label}.`)
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
      try {
        await waitFor('canvas-registration', () => useGraphStore.getState().canvasSnapshotFns['3d']?.captureVideo)
        const cameraMove = applyXrCameraMove({ moveId: 'orbit-clockwise', anchorId: 'mp4-performer', playheadSeconds: 0 })
        if (!cameraMove.applied) throw new Error(cameraMove.message)
        updateXrAnimationTransport({ operation: 'scrub', timeSeconds: 0.5 })
        const before = readXrAnimationTransport()
        const source = JSON.stringify(readXrMotionReferenceRuntime().plan)
        const capture = useGraphStore.getState().canvasSnapshotFns['3d'].captureVideo
        report('capture-and-decode')
        let reportedEnd = false
        const result = await capture({ onProgress: fraction => {
          if (fraction === 0) report('shared-timeline-playing')
          if (!reportedEnd && fraction >= 0.95) { reportedEnd = true; report('authored-endpoint-rendered') }
        } })
        report(`capture-result:${result.status}`)
        if (result.status === 'unsupported') return result
        const startupHandshakeVerified = clockStarts === 1 && startedAtZero
        if (!startupHandshakeVerified) throw new Error('Native clock did not hold zero through opening readback and recorder start.')
        if (tracks.some(track => track.readyState !== 'ended')) throw new Error('A recording track survived successful export.')
        if (JSON.stringify(readXrMotionReferenceRuntime().plan) !== source) throw new Error('Export changed the authored source.')
        if (readXrAnimationTransport().timeSeconds !== before.timeSeconds) throw new Error('Export did not restore the playhead.')
        report('capture-cancellation')
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
        await waitFor('menu-cancel-action', () => [...document.querySelectorAll('#native-export button')].some(item => item.textContent === 'Cancel MP4 export'))
        await waitFor('menu-capture-track', () => tracks.some(track => track.readyState === 'live'))
        clickExport('Cancel MP4 export')
        await waitFor('menu-cancel-toast', () => toasts.some(toast => toast.message === 'MP4 export cancelled.'))
        await waitFor('menu-cancel-teardown', () => !getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        clickExport('MP4 (.mp4) — XR scene (silent)')
        await waitFor('document-switch-capture', () => getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        await waitFor('document-switch-track', () => tracks.some(track => track.readyState === 'live'))
        useGraphStore.setState({ markdownDocumentName: 'next-scene.md', markdownDocumentText: '# Next scene',
          timelineTransportDocumentKey: 'next-scene.md#xr-motion', timelineTransportPosition: 0.01, timelineTransportPlaying: false })
        await waitFor('document-switch-teardown', () => !getMarkdownWorkspaceActionBridge().export?.cancelMediaExport)
        if (useGraphStore.getState().timelineTransportPosition !== 0.01) throw new Error('Stale export restored into the next document.')
        if (tracks.some(track => track.readyState !== 'ended')) throw new Error('A recording track survived document switching.')
        return { startupHandshakeVerified, nativeMenuCancellationVerified: true, documentSwitchVerified: true, status: result.status, byteSize: result.blob.size, mimeType: result.blob.type, ...result.evidence, cancellationVerified: true }
      } finally {
        report('fixture-unmount')
        HTMLCanvasElement.prototype.captureStream = originalCapture
        MediaRecorder.prototype.start = originalStart
        MediaRecorder.prototype.stop = originalStop
        window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observeClockStart)
        CanvasRenderingContext2D.prototype.getImageData = originalReadPixels
        CanvasRenderingContext2D.prototype.drawImage = originalDrawImage
        root.unmount()
      }
    })])
    reportPhase('assert-evidence')
    assert.equal(pageErrors.length, 0)
    if (evidence.status === 'captured') {
      assert.ok(evidence.byteSize > 0)
      assert.equal(evidence.decodedFrames, 3)
      assert.ok(evidence.renderedFrames >= 3)
      assert.ok(new Set(evidence.sampleHashes).size >= 2, 'native scene/camera frames should visibly change')
      assert.ok(Math.abs(evidence.durationSeconds - 2) <= 0.4)
      assert.equal(evidence.cancellationVerified, true)
      assert.equal(evidence.nativeMenuCancellationVerified, true)
      assert.equal(evidence.documentSwitchVerified, true)
      assert.equal(evidence.startupHandshakeVerified, true)
      assert.equal(evidence.initialFrameVerified, true)
      assert.ok(evidence.initialFrameMeanError <= 12)
      assert.equal(evidence.finalFrameVerified, true)
      assert.ok(evidence.finalFrameMeanError <= 12)
    } else assert.equal(evidence.status, 'unsupported')
    console.log(JSON.stringify({ schema: 'agentic-graph.xr-scene-mp4-browser/v1', viewport, evidence }, null, 2))
    await page.close()
    }
  } catch (error) {
    console.error(JSON.stringify({ verifierError: error.stack || error.message, phase }))
    throw error
  } finally {
    reportPhase('browser-cleanup')
    const forceClose = setTimeout(() => { void browserServer?.kill() }, 3_000)
    try { await browserServer?.close() } catch { await browserServer?.kill() }
    finally { clearTimeout(forceClose); clearTimeout(watchdog) }
  }
}
