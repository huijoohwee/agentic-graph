import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const packageRoot = new URL('../', import.meta.url)

test('publish artifact is ESM, MIT, dependency-free, and complete', async () => {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', packageRoot)))
  assert.equal(packageJson.name, '@knowgrph/apple-spatial-input')
  assert.equal(packageJson.version, '0.1.0')
  assert.equal(packageJson.type, 'module')
  assert.equal(packageJson.license, 'MIT')
  assert.equal(packageJson.sideEffects, false)
  assert.equal(packageJson.dependencies, undefined)
  const publicApi = await import(new URL('dist/src/index.js', packageRoot))
  assert.equal(typeof publicApi.BrowserAppleSensorController, 'function')
  assert.equal(typeof publicApi.integrateFlightModel, 'function')
  assert.equal(typeof publicApi.resolveFlightSimFollowTarget, 'function')

  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  assert.equal(packed.status, 0, packed.stderr)
  const [manifest] = JSON.parse(packed.stdout)
  const files = new Set(manifest.files.map(file => file.path))
  for (const required of [
    'LICENSE',
    'README.md',
    'dist/src/index.js',
    'dist/src/index.d.ts',
    'schema/apple-spatial-input-profile.v1.schema.json',
  ]) assert.equal(files.has(required), true, `artifact is missing ${required}`)
  assert.equal([...files].some(file => file.startsWith('src/')), false)
  assert.equal([...files].some(file => file.startsWith('test/')), false)
})

test('source stays bounded and contains no persistence or egress path', () => {
  const sourceRoot = new URL('src/', packageRoot)
  for (const name of readdirSync(sourceRoot).filter(value => value.endsWith('.ts'))) {
    const source = readFileSync(new URL(name, sourceRoot), 'utf8')
    assert.ok(source.split('\n').length <= 600, `${name} exceeds 600 lines`)
    for (const forbidden of ['fetch(', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB']) {
      assert.equal(source.includes(forbidden), false, `${name} contains ${forbidden}`)
    }
  }
})
