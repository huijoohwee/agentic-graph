import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8')
}

export function testXrSpatialCaptureFallbackReadinessKeepsCanonicalAcceptanceBoundary() {
  const canvasManifest = readSource('package.json')
  const sourceSmokeRunner = readSource('..', 'scripts', 'run-xr-spatial-capture-fallback-source-smoke.mjs')
  const testingDocumentation = readSource('..', 'docs', 'documents', 'agentic-graph-testing-document.md')
  const readinessDocumentation = readSource('..', 'docs', 'documents', 'agentic-graph-xr-spatial-capture-fallback-readiness.md')
  const runtimeApiDocumentation = readSource('..', 'docs', 'documents', 'agentic-graph-xr-invocation-runtime-api.md')
  const xrModeDocumentation = readSource('..', 'docs', 'documents', 'agentic-graph-xr-mode-prd-tad.md')
  // The historical XR v2 design is immutable, not the mutable fallback runtime guide.
  execFileSync(process.execPath, [resolve(process.cwd(), '..', 'scripts', 'xr-v2', 'pin-consistency-checker.mjs'), '--json'], { timeout: 30_000, maxBuffer: 128 * 1024 })

  if (!canvasManifest.includes('"test:smoke:xr-spatial-capture-fallback:source": "node ../scripts/run-xr-spatial-capture-fallback-source-smoke.mjs"')) {
    throw new Error('expected canvas manifest to keep XR source smoke bound to the repo-owned source runner')
  }

  for (const snippet of [
    'XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS',
    "name: 'XR native session policy'",
    "name: 'XR browser smoke contract'",
    "name: 'XR readiness contract'",
    "name: 'XR runtime-ready contract'",
    "'canvas.xrMode.nativeSessionPolicy'",
    "'xr.spatialCaptureFallback.browserSmokeContract'",
    "'xr.spatialCaptureFallback.readiness'",
    "'xr.spatialCaptureFallback.runtimeReady'",
  ]) {
    if (!sourceSmokeRunner.includes(snippet)) {
      throw new Error(`expected XR source runner to keep the canonical source verification chain: ${snippet}`)
    }
  }

  for (const snippet of [
    'title: "agentic-graph XR Spatial Capture Fallback Readiness"',
    'doc_type: "Runtime Readiness Contract"',
    'status: "runtime-ready-dev"',
    'runtime_scope: "XR entry capability detection and spatial-capture fallback"',
    'deploy_boundary: "Dev-only"',
    'npm run xr:review-ready',
    'npm run xr:source-runner:test',
    'npm run xr:runtime-ready',
    'test:smoke:xr-spatial-capture-fallback:source',
    'test:smoke:xr-spatial-capture-fallback:browser',
    'canvas.xrMode.nativeSessionPolicy',
    'xr.spatialCaptureFallback.browserSmokeContract',
    'recommended_entry_mode: monocular-capture',
    'fresh runner-owned Vite server',
    'data/outputs/xr-spatial-capture-fallback-browser-smoke.json',
    'Dev-local runtime and source-proof boundary',
    'does not claim immersive hardware support',
    'production deployment, or Cloudflare mutation',
  ]) {
    if (!readinessDocumentation.includes(snippet)) {
      throw new Error(`expected XR readiness contract to preserve canonical proof boundary text: ${snippet}`)
    }
  }

  for (const documentation of [
    testingDocumentation,
    runtimeApiDocumentation,
  ]) {
    for (const snippet of [
      'npm run xr:review-ready',
      'npm run xr:source-runner:test',
      'npm run xr:runtime-ready',
      'agentic-graph-xr-spatial-capture-fallback-readiness.md',
    ]) {
      if (!documentation.includes(snippet)) {
        throw new Error(`expected XR docs to reference the readiness contract and acceptance command: ${snippet}`)
      }
    }
  }

  // Higher-level specs link to the fallback acceptance owner; they do not duplicate its commands.
  for (const documentation of [xrModeDocumentation]) {
    if (!documentation.includes('agentic-graph-xr-spatial-capture-fallback-readiness.md')) {
      throw new Error('expected aggregate XR specs to reference the fallback acceptance boundary')
    }
  }

  for (const documentation of [
    testingDocumentation,
    readinessDocumentation,
    runtimeApiDocumentation,
  ]) {
    if (!documentation.includes('scripts/run-xr-spatial-capture-fallback-source-smoke.mjs')) {
      throw new Error('expected XR acceptance docs to name the repo-owned XR source runner')
    }
  }

  for (const snippet of [
    'agentic-graph-xr-capability-snapshot/v1',
    '`immersive-session`',
    '`inline-viewer`',
    '`monocular-capture`',
    '`native-handoff`',
    '`unsupported`',
    'Open camera capture',
    'ThreeGraphXrSessionPolicy.ts',
    'ThreeGraphXr.tsx',
  ]) {
    if (!xrModeDocumentation.includes(snippet)) {
      throw new Error(`expected the current XR Mode guide to preserve fallback runtime truth: ${snippet}`)
    }
  }

  for (const forbiddenSnippet of [
    'webxr-ar',
    'webxr-vr',
    'pseudo-ar-depth-parallax',
    'flat-fallback',
    'kgAsset3dPipeline',
    'canvas.xrPipeline.',
    '/xr.capture',
  ]) {
    if (xrModeDocumentation.includes(forbiddenSnippet)) {
      throw new Error(`expected harmonized XR documents to remove unowned contract ${forbiddenSnippet}`)
    }
  }

  for (const [name, documentation] of [
    ['fallback readiness', readinessDocumentation],
    ['XR mode', xrModeDocumentation],
  ] as const) {
    const lineCount = documentation.split(/\r?\n/u).length
    if (lineCount > 600) throw new Error(`expected harmonized ${name} document to stay below 600 lines, got ${lineCount}`)
  }
}
