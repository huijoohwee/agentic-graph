import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  buildVersionedAssetFileNames,
  resolveBuildAssetNamespace,
} from '../../canvas/viteBuildAssetNamespace.mjs'
import {
  buildServiceWorkerRevisionAuthoritySource,
  SERVICE_WORKER_REVISION_REQUEST,
  SERVICE_WORKER_REVISION_RESPONSE,
} from '../../canvas/viteServiceWorkerRevisionAuthority.mjs'
import { resolveBuiltChunkBudget } from '../hygiene-built-chunk-budget.mjs'

const SOURCE_REVISION = '0123456789abcdef0123456789abcdef01234567'

test('build assets are isolated under the exact source revision', () => {
  assert.equal(resolveBuildAssetNamespace(SOURCE_REVISION), `assets/${SOURCE_REVISION}`)
  assert.deepEqual(buildVersionedAssetFileNames(SOURCE_REVISION), {
    entryFileNames: `assets/${SOURCE_REVISION}/[name]-[hash].js`,
    chunkFileNames: `assets/${SOURCE_REVISION}/[name]-[hash].js`,
    assetFileNames: `assets/${SOURCE_REVISION}/[name]-[hash][extname]`,
  })
})

test('application and worker bundles share the exact revision namespace', () => {
  const viteConfig = fs.readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  const versionedOutputReferences = viteConfig.match(
    /buildVersionedAssetFileNames\(runtimeIdentity\.sourceRevision\)/g,
  ) || []

  assert.equal(versionedOutputReferences.length, 2)
  assert.match(
    viteConfig,
    /worker: \{[\s\S]*?rollupOptions: \{ output: \{ \.\.\.buildVersionedAssetFileNames\(runtimeIdentity\.sourceRevision\) \} \}/,
  )
})

test('build asset isolation fails closed without an exact revision', () => {
  for (const revision of ['', 'main', SOURCE_REVISION.slice(0, 12), SOURCE_REVISION.toUpperCase()]) {
    assert.throws(
      () => resolveBuildAssetNamespace(revision),
      /exact 40-character source revision SHA/,
    )
  }
})

test('service-worker revision authority is generated from the same exact source namespace', () => {
  const source = buildServiceWorkerRevisionAuthoritySource(SOURCE_REVISION)
  assert.match(source, new RegExp(`const sourceRevision = "${SOURCE_REVISION}"`))
  assert.match(source, new RegExp(SERVICE_WORKER_REVISION_REQUEST))
  assert.match(source, new RegExp(SERVICE_WORKER_REVISION_RESPONSE))
  for (const revision of ['', 'main', SOURCE_REVISION.slice(0, 12), SOURCE_REVISION.toUpperCase()]) {
    assert.throws(
      () => buildServiceWorkerRevisionAuthoritySource(revision),
      /exact source revision/,
    )
  }
})

test('chunk budgets recognize exact-revision asset namespaces', () => {
  const versionedPath = `canvas/dist/assets/${SOURCE_REVISION}/monaco-build.js`
  const legacyPath = 'canvas/dist/assets/monaco-build.js'
  assert.deepEqual(resolveBuiltChunkBudget(versionedPath), resolveBuiltChunkBudget(legacyPath))
  assert.equal(resolveBuiltChunkBudget(versionedPath).reason, 'lazy Monaco editor vendor chunk')
  assert.equal(
    resolveBuiltChunkBudget(`canvas/dist/assets/${SOURCE_REVISION.toUpperCase()}/monaco-build.js`).reason,
    'default asset budget',
  )
})
