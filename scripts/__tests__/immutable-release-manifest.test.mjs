import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { stat } from 'node:fs/promises'
import test from 'node:test'
import { repoRoot } from '../collaboration-contract.mjs'
import {
  buildImmutableReleaseManifest,
  resolveGitHubRepository,
  serializeImmutableReleaseManifest,
  validateImmutableReleaseManifestSource,
} from '../immutable-release-manifest.mjs'
import { resolveGitMetadataDirectory } from '../publish-immutable.mjs'

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim()
const targetRef = 'refs/heads/agent/test-device/runtime-revision-identity'
const localHostnameTargetRef = 'refs/heads/agent/katrinas-macbook-pro.local/runtime-revision-identity'

test('immutable release manifest accepts canonical GitHub repository slugs and remote URLs', () => {
  assert.equal(resolveGitHubRepository('huijoohwee/agentic-graph'), 'huijoohwee/agentic-graph')
  assert.equal(resolveGitHubRepository('https://github.com/huijoohwee/agentic-graph.git'), 'huijoohwee/agentic-graph')
  assert.equal(resolveGitHubRepository('git@github.com:huijoohwee/agentic-graph.git'), 'huijoohwee/agentic-graph')
})

test('checkout-free publication resolves the Git metadata directory instead of assuming .git is a directory', async () => {
  const gitDirectory = resolveGitMetadataDirectory()
  assert.equal((await stat(gitDirectory)).isDirectory(), true)
})

test('immutable release manifest binds one exact source tree to the pinned docs and catalog revision', async () => {
  const manifest = await buildImmutableReleaseManifest({ sourceRevision, targetRef })
  assert.equal(manifest.sourceRevision, sourceRevision)
  assert.equal(manifest.catalogRevision, manifest.agenticCanvasOs.revision)
  assert.match(manifest.sourceTree, /^[0-9a-f]{40}$/)
  const result = await validateImmutableReleaseManifestSource(
    serializeImmutableReleaseManifest(manifest),
    {
      sourceRevision,
      agenticCanvasOsRevision: manifest.agenticCanvasOs.revision,
    },
  )
  assert.match(result.digest, /^[0-9a-f]{64}$/)
})

test('immutable release manifest accepts workflow-generated local hostname branches', async () => {
  const manifest = await buildImmutableReleaseManifest({
    sourceRevision,
    targetRef: localHostnameTargetRef,
  })
  assert.equal(manifest.targetRef, localHostnameTargetRef)
})

test('immutable release manifest rejects mutable target refs and cross-commit replay', async () => {
  await assert.rejects(
    buildImmutableReleaseManifest({
      sourceRevision,
      targetRef: 'refs/heads/main',
      publicationMode: 'checkout-free',
      pushHookMode: 'repository-owned-object-gate',
    }),
    /contract-valid unprotected task branch/,
  )
  const manifest = await buildImmutableReleaseManifest({ sourceRevision, targetRef })
  await assert.rejects(
    validateImmutableReleaseManifestSource(
      serializeImmutableReleaseManifest(manifest),
      { sourceRevision: 'f'.repeat(40) },
    ),
    /source revision mismatch/,
  )
})
