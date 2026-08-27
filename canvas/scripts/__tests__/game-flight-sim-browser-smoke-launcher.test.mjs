import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  normalizeGameFlightSimCandidateBranch,
  resolveGameFlightSimBrowserPaths,
} from '../lib/game-flight-sim-browser-paths.mjs'
import { runLocalViteBrowserSmoke } from '../lib/run-local-vite-browser-smoke.mjs'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('Flight browser smoke owns build output from the Canvas package root', () => {
  const runnerPath = join(
    canvasRoot,
    'scripts',
    'run_game_flight_sim_browser_smoke.mjs',
  )
  const paths = resolveGameFlightSimBrowserPaths(pathToFileURL(runnerPath))

  assert.equal(paths.canvasRoot, canvasRoot)
  assert.equal(paths.repoRoot, resolve(canvasRoot, '..'))
  assert.equal(paths.distIndexPath, join(canvasRoot, 'dist', 'index.html'))
  assert.notEqual(
    paths.distIndexPath,
    join(canvasRoot, 'scripts', 'dist', 'index.html'),
  )
})

test('Flight browser smoke loads compiled evidence only after the isolated build', async () => {
  const source = await readFile(join(
    canvasRoot,
    'scripts',
    'run_game_flight_sim_browser_smoke.mjs',
  ), 'utf8')
  const buildIndex = source.indexOf(
    'await buildExactProductionPreview(candidate)',
  )
  const evidenceImportIndex = source.indexOf(
    "await import('./lib/game-flight-sim-browser-evidence-validation.mjs')",
  )

  assert.ok(buildIndex >= 0)
  assert.ok(evidenceImportIndex > buildIndex)
})

test('Flight browser smoke normalizes detached Git identity without weakening named branches', () => {
  assert.equal(normalizeGameFlightSimCandidateBranch('HEAD'), 'detached')
  assert.equal(
    normalizeGameFlightSimCandidateBranch('agent/device/flight-proof'),
    'agent/device/flight-proof',
  )
  assert.throws(
    () => normalizeGameFlightSimCandidateBranch(''),
    /candidate branch is required/,
  )
})

function reserveLocalPort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve a local Flight preview port'))
        return
      }
      server.close(error => {
        if (error) reject(error)
        else resolvePromise(address.port)
      })
    })
  })
}

test('Flight smoke launcher serves a real preview page without WebSockets', {
  timeout: 120_000,
}, async () => {
  const priorWorkingDirectory = process.cwd()
  const port = await reserveLocalPort()
  const previewOutDir = await mkdtemp(
    join(tmpdir(), 'agenticgraph-flight-preview-preflight-'),
  )
  await writeFile(
    join(previewOutDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <body>
    <main id="root"></main>
    <script type="module">
      document.querySelector('#root').dataset.kgFlightSimPreactivationReady = '1'
    </script>
  </body>
</html>
`,
    'utf8',
  )
  process.chdir(canvasRoot)
  try {
    await runLocalViteBrowserSmoke({
      logLabel: 'game-flight-sim-preview-preflight',
      devServerPort: String(port),
      devServerPath: '/',
      baseUrlEnvName: 'AG_GAME_FLIGHT_SIM_PREVIEW_PREFLIGHT_BASE_URL',
      verifierCommand: 'python3',
      verifierArgs: [
        'scripts/__tests__/verify_game_flight_sim_preview_page.py',
      ],
      verifierFailureLabel: 'Game Flight Sim preview preflight',
      prepareBeforeStart: false,
      devServerStartMode: 'vite-preview-runner',
      existingServerPolicy: 'forbid',
      previewOutDir,
    })
  } finally {
    process.chdir(priorWorkingDirectory)
    await rm(previewOutDir, { force: true, recursive: true })
  }
})
