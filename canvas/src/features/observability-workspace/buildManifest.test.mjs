import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createObservabilityBuildManifestPlugin } from './buildManifest.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('manifest records final on-disk output bytes after the bundler writes them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'graph-observability-build-'))
  try {
    const assets = path.join(root, 'assets')
    await mkdir(assets)
    const plugin = createObservabilityBuildManifestPlugin({
      sourceRevision: 'a'.repeat(40), sourceDirty: false, workspaceManifestDigest: 'b'.repeat(64),
    })
    plugin.generateBundle({}, {
      'observability.html': { type: 'asset', source: '<html>pre-write</html>' },
      'assets/dashboard.js': { type: 'chunk', code: 'export const value = "pre-write"' },
    })

    // Simulate Vite/Rollup finalizing bytes after generateBundle has seen the bundle.
    const finalHtml = Buffer.from('<html>post-write</html>\n')
    const finalScript = Buffer.from('export const value = "post-write";\n')
    await writeFile(path.join(root, 'observability.html'), finalHtml)
    await writeFile(path.join(assets, 'dashboard.js'), finalScript)
    await plugin.writeBundle({ dir: root })

    const manifest = JSON.parse(await readFile(path.join(root, 'observability-build.json'), 'utf8'))
    assert.equal(manifest.schema, 'agentic-graph/observability-build/v1')
    assert.equal(manifest.sourceRevision, 'a'.repeat(40))
    assert.equal(manifest.sourceDirty, false)
    assert.equal(manifest.workspaceManifestDigest, 'b'.repeat(64))
    assert.deepEqual(manifest.outputs, [
      { path: 'assets/dashboard.js', bytes: finalScript.length, sha256: hash(finalScript) },
      { path: 'observability.html', bytes: finalHtml.length, sha256: hash(finalHtml) },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('manifest refuses outputs at the native chunk-size boundary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'graph-observability-build-limit-'))
  try {
    const plugin = createObservabilityBuildManifestPlugin({
      sourceRevision: 'a'.repeat(40), sourceDirty: false, workspaceManifestDigest: 'b'.repeat(64),
    })
    plugin.generateBundle({}, { 'observability.html': { type: 'asset', source: 'html' }, 'large.js': { type: 'chunk', code: 'x' } })
    await writeFile(path.join(root, 'observability.html'), 'html')
    await writeFile(path.join(root, 'large.js'), Buffer.alloc(500_000, 1))
    await assert.rejects(plugin.writeBundle({ dir: root }), /exceeds 500000 bytes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
