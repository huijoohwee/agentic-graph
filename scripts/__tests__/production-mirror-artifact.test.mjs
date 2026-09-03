import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
} from '../production-mirror-artifact-deletions.mjs'
import { assertSealedLegacyNamedFileInventory } from '../legacy-mirror-inventory.mjs'

const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
)

const legacyXrPaths = [
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/config.json',
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/preprocessor_config.json',
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/onnx/model_q4f16.onnx',
  'content/knowgrph/xr-v2/wasm/ort-wasm-simd-threaded.mjs',
  'content/knowgrph/xr-v2/wasm/ort-wasm-simd-threaded.wasm',
]

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
    ...legacyXrPaths.map(relativePath => writeFile(root, relativePath, `legacy ${relativePath}\n`)),
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
    ...legacyXrPaths.map(relativePath => fs.rm(path.resolve(verifiedMirror, relativePath))),
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
    ...[...legacyXrPaths].sort(),
    'index.html',
  ].sort())
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'index.html')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'content/agentic-graph/assets/old/entry.js')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.resolve(deployMirror, 'agentic-graph/assets/old/entry.js')), { code: 'ENOENT' })
  for (const relativePath of legacyXrPaths) {
    await assert.rejects(fs.stat(path.resolve(deployMirror, relativePath)), { code: 'ENOENT' })
  }
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
