import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createProductionMirrorArtifactManifest,
  productionMirrorArtifactEntries,
  productionMirrorArtifactManifestName,
  reconcileProductionMirrorArtifact,
} from '../production-mirror-artifact.mjs'
import {
  assertManagedDeletedPaths,
  assertTrackedDeletedPaths,
  removeEmptyLegacyMirrorDirectories,
  removePlannedMirrorFiles,
} from '../production-mirror-artifact-deletions.mjs'
import { assertSealedLegacyNamedFileInventory } from '../legacy-mirror-inventory.mjs'
import { LEGACY_MIRROR_LIVE_ONLY_EXACT_PATHS } from '../mirror-namespace-contract.mjs'
import { XR_V2_LEGACY_MIRROR_RELATIVE_PATHS } from '../xr-v2/production-publish-contract.mjs'

const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
)

const runGit = (root, args) => execFileSync('git', args, {
  cwd: root,
  env: isolatedGitEnvironment,
})

const writeFile = async (root, relativePath, body) => {
  const filePath = path.resolve(root, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, body)
}

const initializeRepository = root => {
  runGit(root, ['init', '--quiet'])
  runGit(root, ['config', 'user.name', 'Runtime Test'])
  runGit(root, ['config', 'user.email', 'runtime-test@example.com'])
  runGit(root, ['add', '-A'])
  runGit(root, ['commit', '--quiet', '-m', 'base'])
}

const createBaseMirror = async root => {
  const marker = '{"status":"old"}\n'
  await Promise.all([
    writeFile(root, 'README.md', 'unrelated mirror content\n'),
    writeFile(root, '404.html', '<h1>old not found</h1>\n'),
    writeFile(root, 'index.html', '<h1>legacy root fallback</h1>\n'),
    writeFile(root, '.well-known/runtime-readiness.json', marker),
    writeFile(root, 'content/agentic-graph/.well-known/runtime-readiness.json', marker),
    writeFile(root, 'content/agentic-graph/assets/old/entry.js', 'old content asset\n'),
    writeFile(root, 'agentic-graph/assets/old/entry.js', 'old public asset\n'),
    writeFile(root, 'image/agentic-graph/video-frame/old.png', 'old canonical image\n'),
    writeFile(root, 'functions/health.js', 'export const health = true\n'),
    writeFile(root, 'canvas/runtime.mjs', 'export const canvas = true\n'),
    writeFile(root, 'contracts/semantic-key.js', 'export const contract = true\n'),
    writeFile(root, 'grph-shared/dist/runtime.js', 'export const shared = true\n'),
    writeFile(root, '_worker.js', 'export default {}\n'),
    writeFile(root, '_routes.json', '{}\n'),
    writeFile(root, '_headers', '/agentic-graph/*\n  X-Test: true\n'),
    writeFile(root, '_redirects', '/old /new 301\n'),
    writeFile(root, 'content/knowgrph/xr-v2/unrelated.txt', 'preserve sibling\n'),
  ])
}

const copyArtifactEntries = async (mirrorRoot, artifactRoot) => {
  for (const relativePath of productionMirrorArtifactEntries) {
    const sourcePath = path.resolve(mirrorRoot, relativePath)
    const targetPath = path.resolve(artifactRoot, relativePath)
    const sourceStat = await fs.stat(sourcePath)
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.cp(sourcePath, targetPath, { force: true, recursive: sourceStat.isDirectory() })
  }
  await fs.copyFile(
    path.resolve(mirrorRoot, productionMirrorArtifactManifestName),
    path.resolve(artifactRoot, productionMirrorArtifactManifestName),
  )
}

test('reconciliation copies hidden readiness markers and removes tracked stale assets', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-'))
  t.after(() => fs.rm(temporaryRoot, { force: true, recursive: true }))
  const verifiedMirror = path.resolve(temporaryRoot, 'verified-mirror')
  const deployMirror = path.resolve(temporaryRoot, 'deploy-mirror')
  const artifactRoot = path.resolve(temporaryRoot, 'artifact')
  await fs.mkdir(verifiedMirror, { recursive: true })
  await fs.mkdir(artifactRoot, { recursive: true })
  await createBaseMirror(verifiedMirror)
  await fs.mkdir(path.resolve(verifiedMirror, 'functions', 'agenticgraph'), { recursive: true })
  initializeRepository(verifiedMirror)
  await fs.cp(verifiedMirror, deployMirror, { recursive: true })

  await Promise.all([
    fs.rm(path.resolve(verifiedMirror, 'index.html')),
    fs.rm(path.resolve(verifiedMirror, 'content/agentic-graph/assets/old'), { force: true, recursive: true }),
    fs.rm(path.resolve(verifiedMirror, 'agentic-graph/assets/old'), { force: true, recursive: true }),
  ])
  const marker = '{"status":"verified-build"}\n'
  await Promise.all([
    writeFile(verifiedMirror, '404.html', '<h1>canonical not found</h1>\n'),
    writeFile(verifiedMirror, 'README.md', 'source-owned mirror README\n'),
    writeFile(verifiedMirror, '.well-known/runtime-readiness.json', marker),
    writeFile(verifiedMirror, 'content/agentic-graph/.well-known/runtime-readiness.json', marker),
    writeFile(verifiedMirror, 'content/agentic-graph/assets/new/entry.js', 'new content asset\n'),
    writeFile(verifiedMirror, 'agentic-graph/assets/new/entry.js', 'new public asset\n'),
    writeFile(verifiedMirror, 'image/agentic-graph/video-frame/frame.png', 'canonical frame\n'),
  ])
  await createProductionMirrorArtifactManifest({ mirrorRoot: verifiedMirror })
  await copyArtifactEntries(verifiedMirror, artifactRoot)
  const manifest = await reconcileProductionMirrorArtifact({ artifactRoot, mirrorRoot: deployMirror })

  assert.deepEqual(manifest.deletedPaths, [
    'agentic-graph/assets/old/entry.js',
    'content/agentic-graph/assets/old/entry.js',
    'index.html',
  ].sort())
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'index.html')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'content/agentic-graph/assets/old/entry.js')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'agentic-graph/assets/old/entry.js')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'functions/agenticgraph')), { code: 'ENOENT' })
  assert.equal(
    await fs.readFile(path.resolve(deployMirror, 'content/knowgrph/xr-v2/unrelated.txt'), 'utf8'),
    'preserve sibling\n',
  )
  assert.deepEqual(await fs.readdir(path.resolve(deployMirror, 'content/agentic-graph/assets')), ['new'])
  assert.deepEqual(await fs.readdir(path.resolve(deployMirror, 'agentic-graph/assets')), ['new'])
  assert.equal(await fs.readFile(path.resolve(deployMirror, 'README.md'), 'utf8'), 'source-owned mirror README\n')
  assert.equal(await fs.readFile(path.resolve(deployMirror, '404.html'), 'utf8'), '<h1>canonical not found</h1>\n')
  assert.equal(await fs.readFile(path.resolve(deployMirror, 'content/agentic-graph/.well-known/runtime-readiness.json'), 'utf8'), marker)
  assert.equal(await fs.readFile(path.resolve(deployMirror, '.well-known/runtime-readiness.json'), 'utf8'), marker)
  assert.equal(await fs.readFile(path.resolve(deployMirror, 'agentic-graph/assets/new/entry.js'), 'utf8'), 'new public asset\n')
  assert.equal(await fs.readFile(path.resolve(deployMirror, 'image/agentic-graph/video-frame/frame.png'), 'utf8'), 'canonical frame\n')
})

test('reconciliation streams exact large Git blobs and live files', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-large-'))
  t.after(() => fs.rm(temporaryRoot, { force: true, recursive: true }))
  const verifiedMirror = path.resolve(temporaryRoot, 'verified-mirror')
  const deployMirror = path.resolve(temporaryRoot, 'deploy-mirror')
  const artifactRoot = path.resolve(temporaryRoot, 'artifact')
  await fs.mkdir(verifiedMirror, { recursive: true })
  await fs.mkdir(artifactRoot, { recursive: true })
  await createBaseMirror(verifiedMirror)
  const largeBytes = Buffer.alloc((2 * 1024 * 1024) + 17)
  for (let index = 0; index < largeBytes.length; index += 1) largeBytes[index] = index % 251
  const expectedDigest = createHash('sha256').update(largeBytes).digest('hex')
  await writeFile(verifiedMirror, 'index.html', largeBytes)
  initializeRepository(verifiedMirror)
  await fs.cp(verifiedMirror, deployMirror, { recursive: true })

  await fs.rm(path.resolve(verifiedMirror, 'index.html'))
  await writeFile(verifiedMirror, 'agentic-graph/assets/large.bin', largeBytes)
  const { manifest } = await createProductionMirrorArtifactManifest({ mirrorRoot: verifiedMirror })
  await copyArtifactEntries(verifiedMirror, artifactRoot)
  await reconcileProductionMirrorArtifact({ artifactRoot, mirrorRoot: deployMirror })

  assert.deepEqual(manifest.deletedPaths, ['index.html'])
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'index.html')), { code: 'ENOENT' })
  const deployedBytes = await fs.readFile(path.resolve(deployMirror, 'agentic-graph/assets/large.bin'))
  assert.equal(deployedBytes.byteLength, largeBytes.byteLength)
  assert.equal(createHash('sha256').update(deployedBytes).digest('hex'), expectedDigest)
  assert.ok(deployedBytes.equals(largeBytes))
})

test('legacy directory cleanup removes only empty explicit roots', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-empty-legacy-root-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  await fs.mkdir(path.resolve(root, 'agenticgraph', 'nested'), { recursive: true })
  await fs.mkdir(path.resolve(root, 'image', 'knowgrph'), { recursive: true })
  await writeFile(root, 'content/knowgrph/unrelated.txt', 'preserve\n')

  await removeEmptyLegacyMirrorDirectories({ root })

  await assert.rejects(fs.stat(path.resolve(root, 'agenticgraph')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(root, 'image/knowgrph')), { code: 'ENOENT' })
  assert.equal(await fs.readFile(path.resolve(root, 'content/knowgrph/unrelated.txt'), 'utf8'), 'preserve\n')
})

test('manifest creation rejects deletions outside the production artifact boundary', async t => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-boundary-'))
  t.after(() => fs.rm(mirrorRoot, { force: true, recursive: true }))
  await writeFile(mirrorRoot, 'outside-artifact-boundary.md', 'protected\n')
  initializeRepository(mirrorRoot)
  await fs.rm(path.resolve(mirrorRoot, 'outside-artifact-boundary.md'))

  await assert.rejects(
    createProductionMirrorArtifactManifest({ mirrorRoot }),
    /Production sync deleted unmanaged path: outside-artifact-boundary\.md/,
  )
})

test('manifest creation rejects an unlisted legacy XR sibling deletion', async t => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-xr-boundary-'))
  t.after(() => fs.rm(mirrorRoot, { force: true, recursive: true }))
  await writeFile(mirrorRoot, 'content/knowgrph/xr-v2/unrelated.txt', 'protected\n')
  initializeRepository(mirrorRoot)
  await fs.rm(path.resolve(mirrorRoot, 'content/knowgrph/xr-v2/unrelated.txt'))

  await assert.rejects(
    createProductionMirrorArtifactManifest({ mirrorRoot }),
    /Production sync deleted unmanaged path: content\/knowgrph\/xr-v2\/unrelated\.txt/,
  )
})

test('manifest creation rejects a byte-modified sealed legacy XR deletion', async t => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-xr-content-'))
  t.after(() => fs.rm(mirrorRoot, { force: true, recursive: true }))
  const relativePath = XR_V2_LEGACY_MIRROR_RELATIVE_PATHS[0]
  await writeFile(mirrorRoot, relativePath, 'operator-authored replacement bytes\n')
  initializeRepository(mirrorRoot)
  await fs.rm(path.resolve(mirrorRoot, relativePath))

  await assert.rejects(
    createProductionMirrorArtifactManifest({ mirrorRoot }),
    /Legacy XR v2 file inventory content drifted/,
  )
})

test('manifest creation rejects a partial legacy image inventory before it can be deleted', async t => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-image-boundary-'))
  t.after(() => fs.rm(mirrorRoot, { force: true, recursive: true }))
  await writeFile(mirrorRoot, 'image/agenticgraph/unlisted.png', 'protected\n')
  initializeRepository(mirrorRoot)
  await fs.rm(path.resolve(mirrorRoot, 'image/agenticgraph/unlisted.png'))

  await assert.rejects(
    createProductionMirrorArtifactManifest({ mirrorRoot }),
    /Legacy mirror root inventory drifted for image\/agenticgraph/,
  )
})

test('manifest creation rejects the ignored live legacy file when Git tracks it', async t => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-production-artifact-live-only-'))
  t.after(() => fs.rm(mirrorRoot, { force: true, recursive: true }))
  await writeFile(mirrorRoot, LEGACY_MIRROR_LIVE_ONLY_EXACT_PATHS[0], 'must remain live-only\n')
  initializeRepository(mirrorRoot)

  await assert.rejects(
    createProductionMirrorArtifactManifest({ mirrorRoot }),
    /Ignored live legacy path must not be tracked by Git/,
  )
})

test('artifact deletion helpers require complete sealed paths and tracked files', () => {
  assert.throws(
    () => assertManagedDeletedPaths({
      deletedPaths: [],
      sealedLegacyPaths: new Set(['image/agenticgraph/video-frame/frame.png']),
      isManagedPath: () => true,
      label: 'Production artifact',
    }),
    /did not retire every sealed legacy path/,
  )
  assert.throws(
    () => assertTrackedDeletedPaths({
      deletedPaths: ['functions'],
      trackedPaths: new Set(['functions/health.js']),
      label: 'Production artifact',
    }),
    /deletion is not a tracked base file: functions/,
  )
  assert.throws(
    () => assertSealedLegacyNamedFileInventory({ relativePaths: ['agenticgraph-unexpected.md'] }),
    /Legacy named-file inventory contains an unexpected, missing, or partially retired path/,
  )
})

test('planned deletion preserves a replacement introduced after identity quarantine', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-delete-race-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  const relativePath = 'index.html'
  const original = Buffer.from('admitted legacy bytes\n')
  const replacement = Buffer.from('concurrent replacement bytes\n')
  await writeFile(root, relativePath, original)

  let failure
  try {
    await removePlannedMirrorFiles({
      root,
      entries: [{ relativePath, sha256: createHash('sha256').update(original).digest('hex') }],
      label: 'Production artifact deletion',
      onFilesQuarantined: async () => fs.writeFile(path.join(root, relativePath), replacement),
    })
  } catch (error) {
    failure = error
  }

  assert.equal(failure?.code, 'mirror_deletion_exclusive_ownership_lost')
  assert.equal(failure?.name, 'ProductionMirrorDeletionError')
  assert.equal(failure?.details?.preserved?.length, 1)
  assert.ok(failure.details.preserved[0].quarantinePath.startsWith(`${root}${path.sep}`))
  assert.ok((await fs.readFile(failure.details.preserved[0].quarantinePath)).equals(original))
  assert.ok((await fs.readFile(path.join(root, relativePath))).equals(replacement))
})

test('planned deletion reports an exact committed recovery receipt when quarantine purge fails', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-delete-purge-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  const entries = [
    { relativePath: 'index.html', body: Buffer.from('first admitted bytes\n') },
    { relativePath: 'legacy.html', body: Buffer.from('second admitted bytes\n') },
  ].map(entry => ({
    ...entry,
    sha256: createHash('sha256').update(entry.body).digest('hex'),
  }))
  for (const entry of entries) await writeFile(root, entry.relativePath, entry.body)
  let purgeCalls = 0
  let failure
  try {
    await removePlannedMirrorFiles({
      root,
      entries,
      label: 'Production artifact deletion',
      purgeQuarantineFile: async filePath => {
        purgeCalls += 1
        if (purgeCalls === 2) throw new Error('injected quarantine purge failure')
        await fs.unlink(filePath)
      },
    })
  } catch (error) {
    failure = error
  }

  assert.equal(failure?.code, 'mirror_deletion_committed_cleanup_required')
  assert.equal(failure?.details?.committed, true)
  assert.deepEqual(failure?.details?.purged, ['index.html'])
  assert.equal(failure?.details?.preserved?.length, 1)
  assert.equal(failure.details.preserved[0].relativePath, 'legacy.html')
  assert.equal(failure.details.preserved[0].sha256, entries[1].sha256)
  assert.ok((await fs.readFile(failure.details.preserved[0].quarantinePath)).equals(entries[1].body))
  for (const entry of entries) {
    await assert.rejects(fs.lstat(path.join(root, entry.relativePath)), { code: 'ENOENT' })
  }
})

test('reconciliation rejects and preserves a deleted path that reappears after commit', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-delete-reappear-'))
  t.after(() => fs.rm(temporaryRoot, { force: true, recursive: true }))
  const verifiedMirror = path.resolve(temporaryRoot, 'verified-mirror')
  const deployMirror = path.resolve(temporaryRoot, 'deploy-mirror')
  const artifactRoot = path.resolve(temporaryRoot, 'artifact')
  await fs.mkdir(verifiedMirror, { recursive: true })
  await fs.mkdir(artifactRoot, { recursive: true })
  await createBaseMirror(verifiedMirror)
  initializeRepository(verifiedMirror)
  await fs.cp(verifiedMirror, deployMirror, { recursive: true })
  const relativePath = 'agentic-graph/assets/old/entry.js'
  await fs.rm(path.resolve(verifiedMirror, relativePath))
  await createProductionMirrorArtifactManifest({ mirrorRoot: verifiedMirror })
  await copyArtifactEntries(verifiedMirror, artifactRoot)
  const replacement = Buffer.from('concurrent replacement after deletion commit\n')

  await assert.rejects(
    reconcileProductionMirrorArtifact({
      artifactRoot,
      mirrorRoot: deployMirror,
      onDeletionCommitted: async () => writeFile(deployMirror, relativePath, replacement),
    }),
    (error) => error?.code === 'mirror_deletion_path_reappeared'
      && error?.details?.committed === true
      && error?.details?.relativePath === relativePath,
  )
  assert.ok((await fs.readFile(path.resolve(deployMirror, relativePath))).equals(replacement))
})
