import assert from 'node:assert/strict'
import {
  copyFileSync,
  cpSync,
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

import { NamedVerificationAggregateError } from '../lib/named-verification-runner.mjs'
import {
  runXrV2SourceSmoke,
  XR_V2_SOURCE_VERIFICATIONS,
} from '../run-xr-v2-source-smoke.mjs'
import { verifyXrV2ReadinessDocumentation } from '../xr-v2/readiness-doc-contract.mjs'
import { verifyXrV2RuntimeSourceContract } from '../xr-v2/runtime-source-contract.mjs'

const QUIET_LOGGER = Object.freeze({ error() {}, info() {} })
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function createFixtureRoot(t) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'knowgrph-xr-v2-source-'))
  t.after(() => rmSync(fixtureRoot, { force: true, recursive: true }))
  return fixtureRoot
}

function copyFixtureFile(fixtureRoot, relativePath) {
  const destination = resolve(fixtureRoot, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(resolve(REPOSITORY_ROOT, relativePath), destination)
  return destination
}

function createDocumentationFixture(t) {
  const fixtureRoot = createFixtureRoot(t)
  for (const relativePath of [
    'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md',
    'docs/documents/knowgrph-xr-v2-runtime-readiness.md',
    'docs/TESTING.md',
    'docs/runtime-api.md',
  ]) {
    copyFixtureFile(fixtureRoot, relativePath)
  }
  return fixtureRoot
}

function createRuntimeFixture(t) {
  const fixtureRoot = createFixtureRoot(t)
  const runtimeDestination = resolve(fixtureRoot, 'canvas/src/features/xr-v2')
  mkdirSync(dirname(runtimeDestination), { recursive: true })
  cpSync(resolve(REPOSITORY_ROOT, 'canvas/src/features/xr-v2'), runtimeDestination, {
    recursive: true,
  })
  copyFixtureFile(fixtureRoot, 'canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts')
  return fixtureRoot
}

test('XR v2 source smoke exports the closed validation ledger', () => {
  assert.deepEqual(
    XR_V2_SOURCE_VERIFICATIONS.map(verification => verification.name),
    [
      'XR v2 public runtime adapter contract',
      'XR v2 browser smoke source contract',
      'XR v2 readiness documentation contract',
    ],
  )
})

test('XR v2 source smoke executes every stage and aggregates failures', async () => {
  const executed = []
  const failedNames = new Set([
    'XR v2 public runtime adapter contract',
    'XR v2 readiness documentation contract',
  ])
  await assert.rejects(
    runXrV2SourceSmoke({
      execute: async verification => {
        executed.push(verification.name)
        if (failedNames.has(verification.name)) throw new Error(`injected ${verification.name} failure`)
      },
      log: QUIET_LOGGER,
    }),
    error => {
      assert.ok(error instanceof NamedVerificationAggregateError)
      assert.equal(error.scope, 'XR v2 source smoke')
      assert.deepEqual(error.failures.map(failure => failure.name), [...failedNames])
      return true
    },
  )
  assert.deepEqual(executed, XR_V2_SOURCE_VERIFICATIONS.map(verification => verification.name))
})

test('XR v2 source smoke passes the requested repository root to every stage', async () => {
  const repositoryRoot = '/tmp/xr-v2-source-smoke-fixture'
  const seenRoots = []
  const report = await runXrV2SourceSmoke({
    execute: async (_verification, candidateRoot) => seenRoots.push(candidateRoot),
    log: QUIET_LOGGER,
    repositoryRoot,
  })
  assert.equal(report.failures.length, 0)
  assert.deepEqual(seenRoots, XR_V2_SOURCE_VERIFICATIONS.map(() => repositoryRoot))
})

test('XR v2 readiness docs positively bind the pinned authority and all criteria', () => {
  const result = verifyXrV2ReadinessDocumentation(REPOSITORY_ROOT)
  assert.equal(result.pinnedRevision, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7')
  assert.equal(result.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.equal(result.documents.length, 4)
})

test('XR v2 readiness docs fail closed when pinned authority is tampered', t => {
  const fixtureRoot = createDocumentationFixture(t)
  const target = resolve(fixtureRoot, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md')
  writeFileSync(
    target,
    readFileSync(target, 'utf8').replaceAll(
      '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7',
      '0000000000000000000000000000000000000000',
    ),
  )
  assert.throws(
    () => verifyXrV2ReadinessDocumentation(fixtureRoot),
    /pinned PRD\/TAD\/ADR overlay marker 5679d410/u,
  )
})

test('XR v2 readiness docs fail closed when an acceptance criterion disappears', t => {
  const fixtureRoot = createDocumentationFixture(t)
  const target = resolve(fixtureRoot, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md')
  writeFileSync(target, readFileSync(target, 'utf8').replaceAll('AC-12', 'AC-XII'))
  assert.throws(
    () => verifyXrV2ReadinessDocumentation(fixtureRoot),
    /pinned PRD\/TAD\/ADR overlay acceptance row AC-12/u,
  )
})

test('XR v2 readiness docs reject self-promoted runtime-ready status', t => {
  const fixtureRoot = createDocumentationFixture(t)
  const target = resolve(fixtureRoot, 'docs/TESTING.md')
  writeFileSync(target, `${readFileSync(target, 'utf8')}\nstatus: "runtime-ready"\n`)
  assert.throws(
    () => verifyXrV2ReadinessDocumentation(fixtureRoot),
    /avoid misleading marker status: "runtime-ready"/u,
  )
})

test('XR v2 runtime source positively binds the pinned conformance owner', () => {
  const result = verifyXrV2RuntimeSourceContract(REPOSITORY_ROOT)
  assert.equal(result.pinnedRevision, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7')
  assert.equal(result.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.ok(result.files.includes('canvas/src/features/xr-v2/pinnedContractConformance.ts'))
})

test('XR v2 runtime source fails closed when pinned authority is tampered', t => {
  const fixtureRoot = createRuntimeFixture(t)
  const target = resolve(
    fixtureRoot,
    'canvas/src/features/xr-v2/pinnedContractConformance.ts',
  )
  writeFileSync(
    target,
    readFileSync(target, 'utf8').replaceAll(
      '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7',
      '0000000000000000000000000000000000000000',
    ),
  )
  assert.throws(
    () => verifyXrV2RuntimeSourceContract(fixtureRoot),
    /XR v2 runtime marker 5679d410/u,
  )
})

test('XR v2 runtime source fails closed when a pinned criterion disappears', t => {
  const fixtureRoot = createRuntimeFixture(t)
  const target = resolve(
    fixtureRoot,
    'canvas/src/features/xr-v2/pinnedContractConformance.ts',
  )
  writeFileSync(target, readFileSync(target, 'utf8').replaceAll('AC-12', 'AC-XII'))
  assert.throws(
    () => verifyXrV2RuntimeSourceContract(fixtureRoot),
    /pinned conformance owner marker AC-12/u,
  )
})

test('XR v2 runtime source rejects a duplicate browser-identity owner', t => {
  const fixtureRoot = createRuntimeFixture(t)
  const target = resolve(
    fixtureRoot,
    'canvas/src/features/xr-v2/pinnedContractConformance.ts',
  )
  writeFileSync(target, `${readFileSync(target, 'utf8')}\nvoid navigator.userAgent\n`)
  assert.throws(
    () => verifyXrV2RuntimeSourceContract(fixtureRoot),
    /retain canonical ownership instead of navigator\.userAgent/u,
  )
})
