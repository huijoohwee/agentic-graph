import { readFileSync } from 'node:fs'

export function testXrSpatialCaptureFallbackBrowserSmokeContract() {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const smokePageSource = readFileSync(new URL('../features/testing/XrSpatialCaptureFallbackSmokePage.tsx', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const sourceSmokeRunner = readFileSync(new URL('../../../scripts/run-xr-spatial-capture-fallback-source-smoke.mjs', import.meta.url), 'utf8')
  const runnerSource = readFileSync(new URL('../../scripts/run_xr_spatial_capture_fallback_browser_smoke.mjs', import.meta.url), 'utf8')
  const verifierSource = readFileSync(new URL('../../scripts/verify_xr_spatial_capture_fallback_browser_smoke.mjs', import.meta.url), 'utf8')
  const testingDocumentation = readFileSync(new URL('../../../docs/documents/agentic-graph-testing-document.md', import.meta.url), 'utf8')
  const readinessDocumentation = readFileSync(new URL('../../../docs/documents/agentic-graph-xr-spatial-capture-fallback-readiness.md', import.meta.url), 'utf8')
  const runtimeApiDocumentation = readFileSync(new URL('../../../docs/documents/agentic-graph-xr-invocation-runtime-api.md', import.meta.url), 'utf8')

  for (const snippet of [
    "pathname === '/__smoke__/xr-spatial-capture-fallback'",
    "kgPath === '/__smoke__/xr-spatial-capture-fallback'",
    'XrSpatialCaptureFallbackSmokePageLazy',
  ]) {
    if (!appSource.includes(snippet)) {
      throw new Error(`expected App smoke route wiring for XR spatial capture fallback browser smoke: ${snippet}`)
    }
  }

  for (const snippet of [
    'data-kg-xr-spatial-capture-smoke-page="1"',
    'data-kg-xr-spatial-capture-smoke-surface="1"',
    '<CanvasXrEntryPanel',
    'surfaceKind="spatial-capture"',
    'active',
  ]) {
    if (!smokePageSource.includes(snippet)) {
      throw new Error(`expected XR spatial capture fallback smoke page to mount the XR entry owner: ${snippet}`)
    }
  }

  if (!packageJson.includes('"test:smoke:xr-spatial-capture-fallback:source": "node ../scripts/run-xr-spatial-capture-fallback-source-smoke.mjs"')) {
    throw new Error('expected package.json to expose XR spatial capture fallback source smoke command')
  }
  for (const snippet of [
    "name: 'XR native session policy'",
    "name: 'XR browser smoke contract'",
  ]) {
    if (!sourceSmokeRunner.includes(snippet)) {
      throw new Error(`expected XR source smoke runner to preserve source proof ownership: ${snippet}`)
    }
  }
  if (!packageJson.includes('"test:smoke:xr-spatial-capture-fallback:browser": "node ./scripts/run_xr_spatial_capture_fallback_browser_smoke.mjs"')) {
    throw new Error('expected package.json to expose XR spatial capture fallback browser smoke command')
  }
  for (const snippet of [
    "logLabel: 'xr-spatial-capture-fallback-browser-smoke'",
    "devServerPath: '/agentic-graph/'",
    "baseUrlEnvName: 'AG_XR_SPATIAL_CAPTURE_SMOKE_BASE_URL'",
    "verifierArgs: ['./scripts/verify_xr_spatial_capture_fallback_browser_smoke.mjs']",
  ]) {
    if (!runnerSource.includes(snippet)) {
      throw new Error(`expected XR spatial capture fallback smoke runner to publish canonical local Vite wiring: ${snippet}`)
    }
  }

  for (const snippet of [
    "const smokeUrl = `${baseUrl}/__smoke__/xr-spatial-capture-fallback`",
    "data-kg-xr-spatial-capture-smoke-page",
    "data-kg-canvas-xr-surface-kind=\"spatial-capture\"",
    "data-kg-canvas-xr-entry-mode",
    "data-kg-canvas-xr-fallback-action=\"open-motion-control\"",
    "entryMode, 'monocular-capture'",
    "fallbackAction, 'open-motion-control'",
    'await fallbackAction.click()',
    "primaryModeAfterAction, 'capture'",
    'motionControlSurfaceOpen, true',
  ]) {
    if (!verifierSource.includes(snippet)) {
      throw new Error(`expected XR spatial capture fallback verifier to read the rendered browser contract: ${snippet}`)
    }
  }

  for (const snippet of [
    'npm run xr:runtime-ready',
    'test:smoke:xr-spatial-capture-fallback:source',
    'test:smoke:xr-spatial-capture-fallback:browser',
  ]) {
    if (!testingDocumentation.includes(snippet)
      || !readinessDocumentation.includes(snippet)
      || !runtimeApiDocumentation.includes(snippet)) {
      throw new Error(`expected XR fallback docs to reference the canonical acceptance path: ${snippet}`)
    }
  }

  for (const snippet of [
    'recommended_entry_mode: monocular-capture',
    'fresh runner-owned Vite server',
    'does not claim immersive hardware support',
  ]) {
    if (!readinessDocumentation.includes(snippet)) {
      throw new Error(`expected XR fallback readiness doc to record the precise proof boundary: ${snippet}`)
    }
  }
}
