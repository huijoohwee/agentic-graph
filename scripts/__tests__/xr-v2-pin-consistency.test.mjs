import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  checkPinConsistency,
  derivePinTriple,
  verifyXrV2PinConsistency,
  XR_V2_PINNED_DOCUMENT_PATH,
} from '../xr-v2/pin-consistency-checker.mjs'
import {
  XR_V2_PINNED_DOCUMENT_BLOB,
  XR_V2_PINNED_DOCUMENT_BYTES,
  XR_V2_PINNED_DOCUMENT_REVISION,
  XR_V2_PINNED_DOCUMENT_SHA256,
} from '../xr-v2/readiness-doc-contract.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SURFACE_PATHS = Object.freeze([
  'canvas/src/features/xr-v2/pinnedSourceAuthority.ts',
  'canvas/src/features/xr-v2/pinnedContractConformance.ts',
  'canvas/src/features/xr-v2/xrV2InvocationRegistry.ts',
  'docs/documents/knowgrph-xr-v2-runtime-readiness.md',
  'docs/runtime-api.md',
  'docs/TESTING.md',
  'docs/workspace-seeds/README.md',
  'docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md',
  'scripts/video-editor/clean-room-source-contract.mjs',
  'scripts/xr-v2/readiness-doc-contract.mjs',
])

const removeFixtureTree = fixtureParent => {
  rmSync(fixtureParent, { force: true, maxRetries: 5, recursive: true, retryDelay: 50 })
}

function createCommittedFixture(t) {
  const fixtureParent = mkdtempSync(resolve(tmpdir(), 'knowgrph-xr-v2-pin-'))
  const root = resolve(fixtureParent, 'repository')
  t.after(() => removeFixtureTree(fixtureParent))
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', REPOSITORY_ROOT, root])
  execFileSync('git', ['-C', root, 'checkout', '--quiet', '--detach', 'HEAD'])
  for (const relativePath of SURFACE_PATHS) {
    const destination = resolve(root, relativePath)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(resolve(REPOSITORY_ROOT, relativePath), destination)
  }
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'XR v2 fixture'])
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync('git', ['-C', root, 'commit', '--quiet', '--allow-empty', '-m', 'fixture'])
  return root
}

test('pin derivation resolves the current committed authority exactly', () => {
  assert.deepEqual(derivePinTriple(REPOSITORY_ROOT, XR_V2_PINNED_DOCUMENT_REVISION), {
    revision: XR_V2_PINNED_DOCUMENT_REVISION,
    blob: XR_V2_PINNED_DOCUMENT_BLOB,
    bytes: XR_V2_PINNED_DOCUMENT_BYTES,
    sha256: XR_V2_PINNED_DOCUMENT_SHA256,
    version: '3.0.0',
  })
})

test('pin derivation fetches the pinned authority from a shallow checkout', t => {
  const fixtureParent = mkdtempSync(resolve(tmpdir(), 'knowgrph-xr-v2-shallow-'))
  t.after(() => removeFixtureTree(fixtureParent))
  const origin = resolve(fixtureParent, 'origin')
  const shallow = resolve(fixtureParent, 'shallow')
  const pinnedPath = resolve(origin, XR_V2_PINNED_DOCUMENT_PATH)
  execFileSync('git', ['init', '--quiet', origin])
  execFileSync('git', ['-C', origin, 'config', 'user.email', 'fixture@example.invalid'])
  execFileSync('git', ['-C', origin, 'config', 'user.name', 'XR v2 fixture'])
  mkdirSync(dirname(pinnedPath), { recursive: true })
  writeFileSync(pinnedPath, '---\nversion: "3.0.0"\n---\n')
  execFileSync('git', ['-C', origin, 'add', '.'])
  execFileSync('git', ['-C', origin, 'commit', '--quiet', '-m', 'pinned authority'])
  const pinnedRevision = execFileSync('git', ['-C', origin, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  writeFileSync(resolve(origin, 'latest.txt'), 'latest\n')
  execFileSync('git', ['-C', origin, 'add', '.'])
  execFileSync('git', ['-C', origin, 'commit', '--quiet', '-m', 'latest'])
  execFileSync('git', ['-C', origin, 'branch', '-M', 'main'])
  execFileSync('git', ['clone', '--quiet', '--depth=1', `file://${origin}`, shallow])

  assert.match(
    execFileSync(
      'git',
      ['-C', shallow, 'cat-file', '--batch-check=%(objecttype)'],
      { encoding: 'utf8', input: `${pinnedRevision}\n` },
    ).trim(),
    /\bmissing$/u,
  )
  const triple = derivePinTriple(shallow, pinnedRevision)
  assert.equal(triple.revision, pinnedRevision)
  assert.equal(triple.version, '3.0.0')
})

test('pin consistency agrees across a clean committed surface set', t => {
  const report = checkPinConsistency(createCommittedFixture(t))
  assert.equal(report.status, 'agreed')
  assert.equal(report.surfaces.length, 10)
  assert.deepEqual(report.disagreements, [])
  assert.equal(report.workingTree.matchesExpected, true)
})

test('pin consistency blocks without rewriting an uncommitted authority', t => {
  const root = createCommittedFixture(t)
  const pinnedPath = resolve(root, XR_V2_PINNED_DOCUMENT_PATH)
  writeFileSync(pinnedPath, `${readFileSync(pinnedPath, 'utf8')}\n`)
  const report = checkPinConsistency(root)
  assert.equal(report.status, 'blocked-uncommitted')
  assert.equal(report.workingTree.bytes, XR_V2_PINNED_DOCUMENT_BYTES + 1)
  assert.notEqual(report.workingTree.sha256, XR_V2_PINNED_DOCUMENT_SHA256)
  assert.throws(() => verifyXrV2PinConsistency(root), /blocked-uncommitted/u)
})

test('pin consistency names a stale documentation surface and values', t => {
  const root = createCommittedFixture(t)
  const runtimeApiPath = resolve(root, 'docs/runtime-api.md')
  writeFileSync(
    runtimeApiPath,
    readFileSync(runtimeApiPath, 'utf8').replace(
      XR_V2_PINNED_DOCUMENT_REVISION,
      '0'.repeat(40),
    ),
  )
  const report = checkPinConsistency(root)
  assert.equal(report.status, 'disagreed')
  assert.ok(report.disagreements.some(disagreement => (
    disagreement.path === 'docs/runtime-api.md'
    && disagreement.member === 'revision'
    && disagreement.expected === XR_V2_PINNED_DOCUMENT_REVISION
    && disagreement.observed === '0'.repeat(40)
  )))
})

test('pin consistency rejects consumers that retain imports but bypass the owners', t => {
  const tamperCases = [
    {
      path: 'scripts/video-editor/clean-room-source-contract.mjs',
      member: 'bytes',
      before: '=== XR_V2_PINNED_DOCUMENT_BYTES',
      after: '=== 1',
    },
    {
      path: 'canvas/src/features/xr-v2/pinnedContractConformance.ts',
      member: 'revision',
      before: 'pinnedSourceRevision: XR_V2_PINNED_SOURCE_REVISION',
      after: `pinnedSourceRevision: '${'0'.repeat(40)}'`,
    },
    {
      path: 'canvas/src/features/xr-v2/xrV2InvocationRegistry.ts',
      member: 'revision',
      before: 'XR_V2_PINNED_INVOCATION_SOURCE_REVISION = XR_V2_PINNED_SOURCE_REVISION',
      after: `XR_V2_PINNED_INVOCATION_SOURCE_REVISION = '${'0'.repeat(40)}'`,
    },
  ]

  for (const tamper of tamperCases) {
    const root = createCommittedFixture(t)
    const target = resolve(root, tamper.path)
    const source = readFileSync(target, 'utf8')
    assert.ok(source.includes(tamper.before), `fixture must contain ${tamper.before}`)
    writeFileSync(
      target,
      `${source.replace(tamper.before, tamper.after)}\n// ${tamper.before}\n/* ${tamper.before} */\n`,
    )
    const report = checkPinConsistency(root)
    assert.equal(report.status, 'disagreed')
    assert.ok(report.disagreements.some(disagreement => (
      disagreement.path === tamper.path
      && disagreement.member === tamper.member
      && disagreement.observed === null
    )))
  }
})

test('pin consistency rejects a stale active module owner hidden by expected comments', t => {
  const root = createCommittedFixture(t)
  const target = resolve(root, 'canvas/src/features/xr-v2/pinnedSourceAuthority.ts')
  const source = readFileSync(target, 'utf8')
  const expectedAssignment = `  '${XR_V2_PINNED_DOCUMENT_REVISION}'`
  assert.ok(source.includes(expectedAssignment))
  writeFileSync(
    target,
    `${source.replace(expectedAssignment, `  '${'0'.repeat(40)}'`)}\n// export const XR_V2_PINNED_SOURCE_REVISION =\n// ${expectedAssignment}\n`,
  )

  const report = checkPinConsistency(root)
  assert.equal(report.status, 'disagreed')
  assert.ok(report.disagreements.some(disagreement => (
    disagreement.path === 'canvas/src/features/xr-v2/pinnedSourceAuthority.ts'
    && disagreement.member === 'revision'
    && disagreement.expected === XR_V2_PINNED_DOCUMENT_REVISION
    && disagreement.observed === '0'.repeat(40)
  )))
})

test('pin consistency rejects a stale second documented pin occurrence', t => {
  const root = createCommittedFixture(t)
  const demoPath = resolve(
    root,
    'docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md',
  )
  const source = readFileSync(demoPath, 'utf8')
  const secondRevisionClaim = `source identity is commit\n\`${XR_V2_PINNED_DOCUMENT_REVISION}\``
  assert.ok(source.includes(secondRevisionClaim))
  writeFileSync(
    demoPath,
    source.replace(
      secondRevisionClaim,
      `source identity is commit\n\`${'0'.repeat(40)}\``,
    ),
  )

  const report = checkPinConsistency(root)
  assert.equal(report.status, 'disagreed')
  assert.ok(report.disagreements.some(disagreement => (
    disagreement.path === 'docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md'
    && disagreement.member === 'revision'
    && disagreement.expected === XR_V2_PINNED_DOCUMENT_REVISION
    && disagreement.observed === '0'.repeat(40)
  )))
})

test('pin consistency validates the full immutable source URL', t => {
  const root = createCommittedFixture(t)
  const demoPath = resolve(
    root,
    'docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md',
  )
  const source = readFileSync(demoPath, 'utf8')
  const staleUrl = `https://github.com/huijoohwee/knowgrph/blob/${'0'.repeat(40)}/${XR_V2_PINNED_DOCUMENT_PATH}`
  const expectedUrl = `https://github.com/huijoohwee/knowgrph/blob/${XR_V2_PINNED_DOCUMENT_REVISION}/${XR_V2_PINNED_DOCUMENT_PATH}`
  assert.ok(source.includes(expectedUrl))
  writeFileSync(demoPath, source.replace(expectedUrl, staleUrl))

  const report = checkPinConsistency(root)
  assert.equal(report.status, 'disagreed')
  assert.ok(report.disagreements.some(disagreement => (
    disagreement.path === 'docs/workspace-seeds/knowgrph-ar-vr-xr-runtime-readiness-demo.md'
    && disagreement.member === 'immutableUrl'
    && disagreement.expected === expectedUrl
    && disagreement.observed === staleUrl
  )))
})
