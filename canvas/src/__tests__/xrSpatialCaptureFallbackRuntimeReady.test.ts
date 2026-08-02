import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8')
}

export function testXrSpatialCaptureFallbackRuntimeReadyKeepsRepoOwnedLocalAcceptance() {
  const rootManifest = JSON.parse(readSource('..', 'package.json')) as {
    scripts?: Record<string, string>
  }
  const canvasManifest = JSON.parse(readSource('package.json')) as {
    scripts?: Record<string, string>
  }
  const sourceSmokeRunner = readSource('..', 'scripts', 'run-xr-spatial-capture-fallback-source-smoke.mjs')
  const testingDocumentation = readSource('..', 'docs', 'documents', 'knowgrph-testing-document.md')
  const readinessDocumentation = readSource('..', 'docs', 'documents', 'knowgrph-xr-spatial-capture-fallback-readiness.md')
  const runtimeApiDocumentation = readSource('..', 'docs', 'documents', 'knowgrph-xr-invocation-runtime-api.md')

  const runtimeReadyCommand = rootManifest.scripts?.['xr:runtime-ready']
  if (runtimeReadyCommand !== 'npm -C canvas run test:smoke:xr-spatial-capture-fallback:source && npm -C canvas run test:smoke:xr-spatial-capture-fallback:browser') {
    throw new Error(`expected xr:runtime-ready to chain the normalized XR source and browser smokes, got ${JSON.stringify(runtimeReadyCommand)}`)
  }
  if (rootManifest.scripts?.['xr:source-runner:test'] !== 'node --test ./scripts/__tests__/xr-spatial-capture-fallback-source-smoke.test.mjs') {
    throw new Error('expected the root manifest to expose the XR source runner contract test')
  }
  if (rootManifest.scripts?.['xr:review-ready'] !== 'npm run xr:source-runner:test && npm run xr:runtime-ready') {
    throw new Error('expected the root manifest to expose the XR one-command review path')
  }

  if (canvasManifest.scripts?.['test:smoke:xr-spatial-capture-fallback:source'] !== 'node ../scripts/run-xr-spatial-capture-fallback-source-smoke.mjs') {
    throw new Error('expected XR source smoke to delegate to the repo-owned source runner')
  }

  for (const forbiddenSnippet of [
    'wrangler',
    'pages:build',
    'pages:deploy-cloudflare',
    'docs:update',
    'docs:preview:update',
    'npm -C canvas run build',
  ]) {
    if (runtimeReadyCommand.includes(forbiddenSnippet)) {
      throw new Error(`expected xr:runtime-ready to stay local and proof-only without ${forbiddenSnippet}`)
    }
  }

  for (const forbiddenSnippet of [
    'wrangler',
    'pages:build',
    'pages:deploy-cloudflare',
    'docs:update',
    'docs:preview:update',
    'npm -C canvas run build',
    'KG_SKIP_DOCS_UPDATE',
  ]) {
    if (sourceSmokeRunner.includes(forbiddenSnippet)) {
      throw new Error(`expected XR source runner to stay source-proof only without ${forbiddenSnippet}`)
    }
  }

  for (const documentation of [
    testingDocumentation,
    readinessDocumentation,
    runtimeApiDocumentation,
  ]) {
    if (!documentation.includes('npm run xr:runtime-ready')) {
      throw new Error('expected XR acceptance docs to name the repo-owned runtime-ready command')
    }
  }

  for (const documentation of [
    testingDocumentation,
    readinessDocumentation,
  ]) {
    if (!documentation.includes('npm run xr:source-runner:test')) {
      throw new Error('expected XR acceptance docs to name the repo-owned source-runner contract command')
    }
  }

  for (const documentation of [
    testingDocumentation,
    readinessDocumentation,
    runtimeApiDocumentation,
  ]) {
    if (!documentation.includes('npm run xr:review-ready')) {
      throw new Error('expected XR review docs to name the one-command review path')
    }
  }

  for (const snippet of [
    'deploy_boundary: "Dev-only"',
    'does not claim immersive hardware support',
    'production deployment, or Cloudflare mutation',
  ]) {
    if (!readinessDocumentation.includes(snippet)) {
      throw new Error(`expected XR readiness contract to keep the local-only runtime-ready boundary: ${snippet}`)
    }
  }
}
