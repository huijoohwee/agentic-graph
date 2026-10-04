import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
import { hasExactAuthoredEnvironmentSubjectEvidence } from '../lib/game-flight-sim-browser-evidence-validation.mjs'

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
  assert.match(source, /game_flight_sim_smoke_watchdog\.py/)
  assert.match(source, /'--timeout-seconds', '600'/)
  assert.match(source, /'--startup-timeout-seconds', '60'/)
  assert.match(source, /game-flight-sim-browser-smoke-run-\$\{runIndex\}\.partial\.json/)
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
    join(tmpdir(), 'agentic-graph-flight-preview-preflight-'),
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
        'scripts/lib/game_flight_sim_smoke_watchdog.py',
        '--timeout-seconds', '60', '--', 'python3',
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

test('Flight watchdog timeout still removes the owned store and preview server', {
  timeout: 30_000,
}, async () => {
  const priorWorkingDirectory = process.cwd()
  const port = await reserveLocalPort()
  const fixture = await mkdtemp(join(tmpdir(), 'flight-watchdog-cleanup-'))
  const marker = join(fixture, 'store.json')
  await writeFile(join(fixture, 'index.html'), '<!doctype html><title>Owned preview</title>')
  process.chdir(canvasRoot)
  try {
    await assert.rejects(runLocalViteBrowserSmoke({
      logLabel: 'flight-watchdog-cleanup',
      devServerPort: String(port),
      baseUrlEnvName: 'FLIGHT_WATCHDOG_CLEANUP_BASE_URL',
      verifierCommand: 'python3',
      verifierArgs: [
        'scripts/lib/game_flight_sim_smoke_watchdog.py', '--timeout-seconds', '0.4',
        '--', process.execPath, '-e',
        "require('fs').writeFileSync(process.argv[1], JSON.stringify({store:process.env.AGENTIC_OS_WORKSPACE_STORE_ROOT}));setInterval(()=>{},1000)",
        marker,
      ],
      verifierFailureLabel: 'Bounded Flight cleanup',
      devServerStartMode: 'vite-preview-runner',
      existingServerPolicy: 'forbid',
      previewOutDir: fixture,
    }), /Bounded Flight cleanup exited with code 124/)
    const { store } = JSON.parse(await readFile(marker, 'utf8'))
    assert.match(store, /\.browser-smoke-store-/)
    await assert.rejects(stat(store), { code: 'ENOENT' })
    await assert.rejects(fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) }))
  } finally {
    process.chdir(priorWorkingDirectory)
    await rm(fixture, { force: true, recursive: true })
  }
})

function authoredSubjectEvidence() {
  return {
    authoredEnvironmentSubjects: [{ id: 'xr-subject:sailboat:1' }, { id: 'canopy' }],
    environmentSubjectIds: ['canopy', 'xr-subject:sailboat:1'],
    renderedEnvironmentSubjectIds: ['xr-subject:sailboat:1'],
    selectedEnvironmentSubjectsExact: true,
    environmentSourceExactlyMatchesOverlay: true,
  }
}

test('authored Flight environment accepts exact arbitrary IDs and visible authored subsets', () => {
  const view = authoredSubjectEvidence()
  assert.equal(hasExactAuthoredEnvironmentSubjectEvidence(view), true)
  view.renderedEnvironmentSubjectIds = ['canopy', 'xr-subject:sailboat:1']
  assert.equal(hasExactAuthoredEnvironmentSubjectEvidence(view), true)
  view.authoredEnvironmentSubjects = [{ id: 'neutral:α' }]
  view.environmentSubjectIds = ['neutral:α']
  view.renderedEnvironmentSubjectIds = ['neutral:α']
  assert.equal(hasExactAuthoredEnvironmentSubjectEvidence(view), true)
})

test('authored Flight environment rejects incomplete, duplicate, foreign and malformed identity evidence', () => {
  const cases = [
    ['no authored records', { authoredEnvironmentSubjects: undefined }],
    ['empty authored records', { authoredEnvironmentSubjects: [] }],
    ['malformed authored record', { authoredEnvironmentSubjects: [null] }],
    ['array authored record', { authoredEnvironmentSubjects: [[]] }],
    ['duplicate authored IDs', { authoredEnvironmentSubjects: [{ id: 'canopy' }, { id: 'canopy' }] }],
    ['blank authored ID', { authoredEnvironmentSubjects: [{ id: ' ' }] }],
    ['nonstring authored ID', { authoredEnvironmentSubjects: [{ id: 7 }] }],
    ['absent source', { environmentSubjectIds: undefined }],
    ['missing source subject', { environmentSubjectIds: ['canopy'] }],
    ['extra source subject', { environmentSubjectIds: ['canopy', 'xr-subject:sailboat:1', 'extra'] }],
    ['duplicate source ID', { environmentSubjectIds: ['canopy', 'canopy'] }],
    ['blank source ID', { environmentSubjectIds: ['canopy', ''] }],
    ['nonstring source ID', { environmentSubjectIds: ['canopy', 7] }],
    ['empty rendered IDs', { renderedEnvironmentSubjectIds: [] }],
    ['absent rendered IDs', { renderedEnvironmentSubjectIds: undefined }],
    ['foreign vehicle-looking ID', { renderedEnvironmentSubjectIds: ['vehicle-unrelated'] }],
    ['duplicate rendered ID', { renderedEnvironmentSubjectIds: ['canopy', 'canopy'] }],
    ['blank rendered ID', { renderedEnvironmentSubjectIds: [' '] }],
    ['nonstring rendered ID', { renderedEnvironmentSubjectIds: [7] }],
    ['inexact authored geometry', { selectedEnvironmentSubjectsExact: false }],
    ['inexact source projection', { environmentSourceExactlyMatchesOverlay: false }],
  ]
  for (const [label, changed] of cases) {
    assert.equal(hasExactAuthoredEnvironmentSubjectEvidence({ ...authoredSubjectEvidence(), ...changed }), false, label)
  }
})
