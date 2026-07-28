import assert from 'node:assert/strict'
import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertDependencyClosure,
} from '../lib/game-flight-sim-asset-readiness.mjs'
import {
  assertFlightSimBoundary,
} from '../lib/game-flight-sim-boundary.mjs'
import {
  assertFlightSimOfflineAuthorSource,
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
} from '../lib/game-flight-sim-offline-author-contract.mjs'
import {
  FLIGHT_SIM_DISALLOWED_AUTHORING_OPERATIONS,
  readFlightSimOfflineAuthoredOutput,
  writeFlightSimOfflineAuthoredOutput,
} from '../lib/game-flight-sim-offline-authoring.mjs'
import {
  assertFlightSimFeatureNetworkBoundary,
} from '../lib/game-flight-sim-network-readiness.mjs'
import {
  assertFlightSimSeedReadiness,
} from '../lib/game-flight-sim-seed-readiness.mjs'
import {
  parseYamlFrontmatter,
} from '../lib/source-readiness-assertions.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createDependencyFixture(t) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'flight-sim-dependencies-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const rootPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  )
  await Promise.all([
    cp(
      path.join(repositoryRoot, 'canvas/src/features/game-flight-sim'),
      path.join(fixtureRoot, 'canvas/src/features/game-flight-sim'),
      { recursive: true },
    ),
    cp(
      path.join(repositoryRoot, 'package.json'),
      path.join(fixtureRoot, 'package.json'),
    ),
    cp(
      path.join(repositoryRoot, 'package-lock.json'),
      path.join(fixtureRoot, 'package-lock.json'),
    ),
    ...(rootPackage.workspaces || []).map(async workspacePath => {
      const target = path.join(fixtureRoot, workspacePath, 'package.json')
      await mkdir(path.dirname(target), { recursive: true })
      await cp(path.join(repositoryRoot, workspacePath, 'package.json'), target)
    }),
  ])
  return fixtureRoot
}

test('offline authoring observes each real disallowed operation before commit and preserves bytes', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'flight-sim-authoring-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const committedPath = path.join(fixtureRoot, 'vehicle-airplane.scene.json')
  const committedBytes = Buffer.from('{"identity":"committed-aircraft"}\n', 'utf8')
  await writeFile(committedPath, committedBytes)
  const attempts = [
    {
      operation: 'image-to-3d-model-call',
      source: `export function author() { return trellisImageTo3d() }\n`,
    },
    {
      operation: 'network-fetch',
      source: `
const key = ['f', 'etch'].join('')
const capturedTransport = globalThis[key]
export function author() {
  return capturedTransport('https://example.invalid/forbidden-flight-asset')
}
`,
    },
    {
      operation: 'cloudflare-resource-request',
      source: `
export function author({ cloudflareResourceRequest }) {
  return cloudflareResourceRequest()
}
`,
    },
    {
      operation: 'network-fetch',
      source: `
import { get } from 'node:http'
export function author() { return get('http://example.invalid/forbidden') }
`,
    },
    {
      operation: 'network-fetch',
      source: `
const key = ['f', 'etch'].join('')
export function author() {
  setTimeout(() => globalThis[key]('https://example.invalid/late'), 0)
  return { generated: true }
}
`,
    },
  ]
  assert.deepEqual(
    [...new Set(attempts.map(item => item.operation))].sort(),
    [...FLIGHT_SIM_DISALLOWED_AUTHORING_OPERATIONS].sort(),
  )

  for (const attempt of attempts) {
    let commitInvoked = false
    assert.throws(
      () => {
        assertFlightSimOfflineAuthorSource({
          authorModuleUrl: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
          authorExport: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
          source: attempt.source,
        })
        commitInvoked = true
      },
      error => {
        assert.equal(error.code, 'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED')
        assert.equal(error.operation, attempt.operation)
        assert.equal(error.beforeCommit, true)
        assert.match(error.message, new RegExp(attempt.operation))
        return true
      },
    )
    assert.equal(commitInvoked, false)
    assert.deepEqual(await readFile(committedPath), committedBytes)
  }

  assert.throws(
    () => assertFlightSimOfflineAuthorSource({
      authorModuleUrl: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
      authorExport: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
      source: "export async function author() { return import('./helper.mjs') }\n",
    }),
    error => {
      assert.equal(error.code, 'FLIGHT_SIM_OFFLINE_AUTHOR_AUTHORITY_VIOLATION')
      assert.equal(error.beforeCommit, true)
      return true
    },
  )

  const canonicalImport = "import { createHash } from 'node:crypto'"
  const authorityBypasses = [
    {
      name: 'compact static filesystem import',
      source: `${canonicalImport}
import{writeFileSync}from'node:fs'
export function authorFlightSimOptionalProp() { return writeFileSync }
`,
    },
    {
      name: 'process built-in module loader',
      source: `${canonicalImport}
export function authorFlightSimOptionalProp() {
  return process.getBuiltinModule('node:fs')
}
`,
    },
    {
      name: 'computed process built-in module loader',
      source: `${canonicalImport}
export function authorFlightSimOptionalProp() {
  return process['getBuiltinModule']('node:fs')
}
`,
    },
    {
      name: 'CommonJS loader',
      source: `${canonicalImport}
export function authorFlightSimOptionalProp() { return require('node:fs') }
`,
    },
    {
      name: 'createRequire loader',
      source: `${canonicalImport}
export function authorFlightSimOptionalProp() {
  return createRequire(import.meta.url)('node:fs')
}
`,
    },
    {
      name: 'compact re-export loader',
      source: `${canonicalImport}
export*from'./side-effecting-helper.mjs'
export function authorFlightSimOptionalProp() { return {} }
`,
    },
    {
      name: 'comment-obfuscated re-export loader',
      source: `${canonicalImport}
export/* loader gap */*from'./side-effecting-helper.mjs'
export function authorFlightSimOptionalProp() { return {} }
`,
    },
  ]
  for (const bypass of authorityBypasses) {
    assert.throws(
      () => assertFlightSimOfflineAuthorSource({
        authorModuleUrl: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
        authorExport: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
        source: bypass.source,
      }),
      error => {
        assert.equal(error.code, 'FLIGHT_SIM_OFFLINE_AUTHOR_AUTHORITY_VIOLATION')
        assert.equal(error.beforeCommit, true)
        return true
      },
      bypass.name,
    )
    assert.deepEqual(await readFile(committedPath), committedBytes)
  }

  const maliciousMarkerPath = path.join(fixtureRoot, 'malicious-author-ran')
  const maliciousAuthorPath = path.join(fixtureRoot, 'malicious-author.mjs')
  await writeFile(
    maliciousAuthorPath,
    `
import { writeFile } from 'node:fs/promises'
await writeFile(${JSON.stringify(maliciousMarkerPath)}, 'executed')
export function author() { return { generated: false } }
`,
    'utf8',
  )
  let unauthorizedCommitInvoked = false
  await assert.rejects(
    writeFlightSimOfflineAuthoredOutput({
      authorModuleUrl: pathToFileURL(maliciousAuthorPath),
      commit: async () => {
        unauthorizedCommitInvoked = true
      },
    }),
    /accepts no caller-controlled author, path, or commit callback/,
  )
  assert.equal(unauthorizedCommitInvoked, false)
  await assert.rejects(readFile(maliciousMarkerPath), { code: 'ENOENT' })

  const canonicalSource = await readFile(
    fileURLToPath(FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL),
    'utf8',
  )
  assert.doesNotThrow(() => assertFlightSimOfflineAuthorSource({
    authorModuleUrl: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
    authorExport: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
    source: canonicalSource,
  }))
  const canonicalOutput = await readFlightSimOfflineAuthoredOutput()
  assert.ok(canonicalOutput.glb.byteLength > 0)
  assert.ok(canonicalOutput.source.byteLength > 0)
  assert.deepEqual(await readFile(committedPath), committedBytes)
})

test('canonical offline writer preflights its exact output pair before atomic rename', async t => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'flight-sim-atomic-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const fixtureLibraryRoot = path.join(fixtureRoot, 'scripts/lib')
  await mkdir(fixtureLibraryRoot, { recursive: true })
  const supportFiles = [
    'game-flight-sim-offline-author-contract.mjs',
    'game-flight-sim-offline-author-worker.mjs',
    'game-flight-sim-offline-authoring.mjs',
    'game-flight-sim-optional-prop-author.mjs',
  ]
  await Promise.all(supportFiles.map(fileName => cp(
    path.join(repositoryRoot, 'scripts/lib', fileName),
    path.join(fixtureLibraryRoot, fileName),
  )))
  const fallbackRoot = path.join(
    fixtureRoot,
    'canvas/src/features/game-flight-sim/assetSpec/fallbacks',
  )
  await mkdir(fallbackRoot, { recursive: true })
  const glbPath = path.join(fallbackRoot, 'optional-beacon.glb')
  const sourcePath = path.join(fallbackRoot, 'optionalBeaconGlb.generated.ts')
  const committedBytes = Buffer.from('committed-before-atomic-preflight')
  await writeFile(glbPath, committedBytes)
  await mkdir(sourcePath)

  const fixtureAuthoring = await import(
    `${pathToFileURL(path.join(
      fixtureLibraryRoot,
      'game-flight-sim-offline-authoring.mjs',
    )).href}?fixture=${Date.now()}`
  )
  await assert.rejects(
    fixtureAuthoring.writeFlightSimOfflineAuthoredOutput(),
    /must be a regular non-symlink file/,
  )
  assert.deepEqual(await readFile(glbPath), committedBytes)
  assert.equal((await lstat(sourcePath)).isDirectory(), true)
  assert.deepEqual(
    (await readdir(fallbackRoot)).filter(name => name.endsWith('.tmp')),
    [],
  )
})

test('gameplay guard exposes no browser transport ownership', async () => {
  const relativePath =
    'canvas/src/features/game-flight-sim/flightSimExternalCallGuard.ts'
  const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
  assert.doesNotThrow(() => assertFlightSimFeatureNetworkBoundary({
    relativePath,
    source,
  }))
  assert.throws(
    () => assertFlightSimFeatureNetworkBoundary({
      relativePath,
      source: `${source}\nglobalThis.fetch = async () => new Response()\n`,
    }),
    /must not own or replace browser transports/,
  )
  assert.throws(
    () => assertFlightSimFeatureNetworkBoundary({
      relativePath: 'canvas/src/features/game-flight-sim/escape.ts',
      source: 'new XMLHttpRequest()',
    }),
    /forbidden Flight Sim capability: XMLHttpRequest/,
  )
})

test('dependency gate names a crafted unauthorized runtime package', async t => {
  const fixtureRoot = await createDependencyFixture(t)
  const prohibitedPackage = ['@dimforge', 'rapier3d-compat'].join('/')
  await writeFile(
    path.join(
      fixtureRoot,
      'canvas/src/features/game-flight-sim/craftedUnauthorizedDependency.ts',
    ),
    `import '${prohibitedPackage}'\n`,
    'utf8',
  )
  await assert.rejects(
    assertDependencyClosure(fixtureRoot),
    error => {
      assert.match(error.message, /direct external dependency set changed/)
      assert.match(error.message, new RegExp(prohibitedPackage.replace('/', '\\/')))
      return true
    },
  )
})

test('dependency gate names a crafted non-OSI license', async t => {
  const fixtureRoot = await createDependencyFixture(t)
  const lockPath = path.join(fixtureRoot, 'package-lock.json')
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  lock.packages['node_modules/three'].license = 'Proprietary-Test-License'
  await writeJson(lockPath, lock)
  await assert.rejects(
    assertDependencyClosure(fixtureRoot),
    /Flight Sim dependency three license changed: expected MIT, received Proprietary-Test-License/,
  )
})

test('clean-room scanner reports a crafted external-project boundary violation', () => {
  assert.throws(
    () => assertFlightSimBoundary([{
      relativePath: 'canvas/src/features/game-flight-sim/copied-flight-model.ts',
      source: "export const remote = 'https://external.example/flight-runtime'",
    }]),
    error => {
      assert.match(error.message, /clean-room provenance boundary failed/)
      assert.match(error.message, /copied-flight-model\.ts/)
      assert.match(error.message, /https:\/\//)
      return true
    },
  )
})

test('clean-room scanner covers the native MapLibre Flight presentation owner', () => {
  assert.throws(
    () => assertFlightSimBoundary([{
      relativePath: 'gympgrph/src/flightGeoOverlayMapLibre.ts',
      source: "export const remote = 'https://external.example/map-runtime'",
    }]),
    /flightGeoOverlayMapLibre\.ts/,
  )
})

test('seed readiness rejects a missing course-director authority field', async () => {
  const flightSeedPath =
    'docs/workspace-seeds/knowgrph-game-flight-sim-demo.md'
  const source = await readFile(
    path.join(repositoryRoot, flightSeedPath),
    'utf8',
  )
  const seed = structuredClone(parseYamlFrontmatter(source, flightSeedPath))
  delete seed.native_flight_demo.navigation_inset.route_guidance_owner

  await assert.rejects(
    assertFlightSimSeedReadiness({
      seed,
      flightSeedPath,
      physicsSeedPath:
        'docs/workspace-seeds/knowgrph-physics-playground-demo.md',
      readText: relativePath => readFile(
        path.join(repositoryRoot, relativePath),
        'utf8',
      ),
    }),
    /exact source-authored course-director projection/,
  )
})
