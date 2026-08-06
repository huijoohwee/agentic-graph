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
  assertXrV2SourceCheckoutGraph,
  resolveXrV2SourceCheckoutContext,
} from '../xr-v2/browser-smoke-contract.mjs'
import {
  runXrV2SourceSmoke,
  XR_V2_SOURCE_VERIFICATIONS,
} from '../run-xr-v2-source-smoke.mjs'
import { verifyXrV2ReadinessDocumentation } from '../xr-v2/readiness-doc-contract.mjs'
import { verifyXrV2RuntimeSourceContract } from '../xr-v2/runtime-source-contract.mjs'

const QUIET_LOGGER = Object.freeze({ error() {}, info() {} })
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAIN_REVISION = '1'.repeat(40)
const CANDIDATE_REVISION = '2'.repeat(40)
const MERGE_REVISION = '3'.repeat(40)
const TASK_BRANCH = 'agent/katrinas-macbook-pro.local/xr-pinned-runtime-readiness-ci-fix'

function githubPullRequestEnvironment(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_BASE_REF: 'main',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_HEAD_REF: TASK_BRANCH,
    GITHUB_REF: 'refs/pull/683/merge',
    GITHUB_REPOSITORY: 'huijoohwee/knowgrph',
    GITHUB_SHA: MERGE_REVISION,
    KNOWGRPH_PR_BASE_REF: 'main',
    KNOWGRPH_PR_HEAD_REF: TASK_BRANCH,
    KNOWGRPH_PR_NUMBER: '683',
    KNOWGRPH_REPOSITORY: 'huijoohwee/knowgrph',
    KNOWGRPH_SOURCE_REVISION: CANDIDATE_REVISION,
    KNOWGRPH_TARGET_REF: `refs/heads/${TASK_BRANCH}`,
    ...overrides,
  }
}

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

test('XR v2 browser smoke omits a missing local Chromium executable', () => {
  const source = readFileSync(
    resolve(REPOSITORY_ROOT, 'canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs'),
    'utf8',
  )
  assert.match(source, /const executablePath = findLocalChromiumExecutable\(\)/u)
  assert.match(source, /\.\.\.\(executablePath \? \{ executablePath \} : \{\}\)/u)
  assert.doesNotMatch(source, /executablePath: findLocalChromiumExecutable\(\)/u)
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

test('XR v2 source checkout keeps attached branch identity authoritative', () => {
  const context = resolveXrV2SourceCheckoutContext({
    attachedBranch: TASK_BRANCH,
    environment: githubPullRequestEnvironment({ GITHUB_SHA: '0'.repeat(40) }),
    headRevision: CANDIDATE_REVISION,
  })
  assert.deepEqual(context, {
    sourceBranch: TASK_BRANCH,
    sourceCandidateRevision: CANDIDATE_REVISION,
    sourceCheckoutState: 'attached',
    sourceLane: 'task-review',
  })
  assert.equal(resolveXrV2SourceCheckoutContext({
    attachedBranch: 'main',
    environment: {},
    headRevision: MAIN_REVISION,
  }).sourceLane, 'canonical-main')
})

test('XR v2 source checkout admits an exact GitHub pull-request merge', () => {
  const context = resolveXrV2SourceCheckoutContext({
    attachedBranch: '',
    environment: githubPullRequestEnvironment(),
    headRevision: MERGE_REVISION,
  })
  const observed = assertXrV2SourceCheckoutGraph(context, {
    originMainRevision: MAIN_REVISION,
    parentRevisions: [MAIN_REVISION, CANDIDATE_REVISION],
    remoteHeadRevision: CANDIDATE_REVISION,
  })
  assert.equal(observed.sourceCheckoutState, 'github-pull-request-merge')
  assert.equal(observed.sourceLane, 'pull-request-integration')
  assert.equal(observed.sourceCandidateRevision, CANDIDATE_REVISION)
  assert.deepEqual(observed.sourceParentRevisions, [MAIN_REVISION, CANDIDATE_REVISION])
})

test('XR v2 source checkout rejects partial or spoofed detached CI identity', () => {
  for (const [field, value] of [
    ['GITHUB_ACTIONS', 'false'],
    ['GITHUB_EVENT_NAME', 'push'],
    ['GITHUB_SHA', CANDIDATE_REVISION],
    ['GITHUB_HEAD_REF', 'main'],
    ['GITHUB_BASE_REF', 'release'],
    ['GITHUB_REF', 'refs/heads/main'],
    ['GITHUB_REPOSITORY', 'fork/knowgrph'],
    ['KNOWGRPH_PR_BASE_REF', 'release'],
    ['KNOWGRPH_PR_HEAD_REF', 'main'],
    ['KNOWGRPH_PR_NUMBER', '0'],
    ['KNOWGRPH_REPOSITORY', 'fork/knowgrph'],
    ['KNOWGRPH_SOURCE_REVISION', 'not-a-sha'],
    ['KNOWGRPH_TARGET_REF', 'refs/heads/main'],
  ]) {
    assert.throws(() => resolveXrV2SourceCheckoutContext({
      attachedBranch: '',
      environment: githubPullRequestEnvironment({ [field]: value }),
      headRevision: MERGE_REVISION,
    }), undefined, field)
  }
})

test('XR v2 source checkout rejects remote or merge-parent drift', () => {
  const context = resolveXrV2SourceCheckoutContext({
    attachedBranch: '',
    environment: githubPullRequestEnvironment(),
    headRevision: MERGE_REVISION,
  })
  for (const input of [
    { remoteHeadRevision: MAIN_REVISION, parentRevisions: [MAIN_REVISION, CANDIDATE_REVISION] },
    { remoteHeadRevision: CANDIDATE_REVISION, parentRevisions: [CANDIDATE_REVISION, MAIN_REVISION] },
    { remoteHeadRevision: CANDIDATE_REVISION, parentRevisions: [MAIN_REVISION] },
    { remoteHeadRevision: CANDIDATE_REVISION, parentRevisions: [MAIN_REVISION, CANDIDATE_REVISION, MERGE_REVISION] },
  ]) {
    assert.throws(() => assertXrV2SourceCheckoutGraph(context, {
      originMainRevision: MAIN_REVISION,
      ...input,
    }))
  }
})

test('XR v2 readiness docs positively bind the pinned authority and all criteria', () => {
  const result = verifyXrV2ReadinessDocumentation(REPOSITORY_ROOT)
  assert.equal(result.pinnedRevision, '5679d4101f5470fb85816b6df4f2ec0af6ca4eb7')
  assert.equal(result.pinnedBlob, '1c0cc60e8cdfaf4bc1b599e11cd5aba109ad6544')
  assert.equal(result.pinnedBytes, 75_393)
  assert.equal(
    result.pinnedSha256,
    '9dfcb6b55a5cb510177f0108ebccedace5d640390dbeef4d69a63f1e89edb6ea',
  )
  assert.equal(result.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.equal(result.documents.length, 4)
})

test('XR v2 readiness docs fail closed when pinned authority is tampered', t => {
  const fixtureRoot = createDocumentationFixture(t)
  const target = resolve(fixtureRoot, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md')
  writeFileSync(target, `${readFileSync(target, 'utf8')}\n`)
  assert.throws(
    () => verifyXrV2ReadinessDocumentation(fixtureRoot),
    /immutable pinned PRD\/TAD\/ADR drift/u,
  )
})

test('XR v2 readiness docs fail closed when an acceptance criterion disappears', t => {
  const fixtureRoot = createDocumentationFixture(t)
  const target = resolve(fixtureRoot, 'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md')
  writeFileSync(target, readFileSync(target, 'utf8').replaceAll('AC-12', 'AC-XII'))
  assert.throws(
    () => verifyXrV2ReadinessDocumentation(fixtureRoot),
    /immutable pinned PRD\/TAD\/ADR drift/u,
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
    /pinned conformance owner marker 5679d410/u,
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
