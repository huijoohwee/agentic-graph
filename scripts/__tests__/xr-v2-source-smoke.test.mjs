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
  verifyXrV2BrowserSmokeSourceContract,
  XR_V2_BROWSER_SMOKE_SOURCE_PATHS,
} from '../xr-v2/browser-smoke-contract.mjs'
import { requireXrV2RuntimeIdentity } from '../xr-v2/workspace-seed-runtime-contract.mjs'
import {
  runXrV2SourceSmoke,
  XR_V2_SOURCE_VERIFICATIONS,
} from '../run-xr-v2-source-smoke.mjs'
import {
  verifyXrV2ReadinessDocumentation,
  XR_V2_PINNED_DOCUMENT_BLOB,
  XR_V2_PINNED_DOCUMENT_BYTES,
  XR_V2_PINNED_DOCUMENT_REVISION,
  XR_V2_PINNED_DOCUMENT_SHA256,
} from '../xr-v2/readiness-doc-contract.mjs'
import { verifyXrV2RuntimeSourceContract } from '../xr-v2/runtime-source-contract.mjs'
import {
  verifyWorkspaceSeedAuthority,
  XR_V2_SEED_BASENAME,
  XR_V2_SEED_RELATIVE_PATH,
} from '../workspace-seed-authority.mjs'

const QUIET_LOGGER = Object.freeze({ error() {}, info() {} })
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAIN_REVISION = '1'.repeat(40)
const CANDIDATE_REVISION = '2'.repeat(40)
const MERGE_REVISION = '3'.repeat(40)
const TASK_BRANCH = 'agent/katrinas-macbook-pro.local/xr-pinned-runtime-readiness-ci-fix'

test('XR v2 unit coverage is serialized to avoid CI worker stalls', () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'))
  const unitCommand = String(packageJson.scripts?.['xr-v2:unit'] || '')
  assert.match(unitCommand, /node --import tsx --test --test-concurrency=1 /u)
  assert.equal(unitCommand.match(/--test-concurrency=1/gu)?.length, 1)
})

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
  for (const relativePath of [
    'canvas/src/features/three/xrPhysicsRuntime.ts',
    'canvas/src/features/three/xrSpatialPhysicsAdapter.ts',
    'canvas/src/lib/three/ThreeGraphXrSessionPolicy.ts',
  ]) {
    copyFixtureFile(fixtureRoot, relativePath)
  }
  return fixtureRoot
}

function createBrowserSmokeFixture(t) {
  const fixtureRoot = createFixtureRoot(t)
  for (const relativePath of XR_V2_BROWSER_SMOKE_SOURCE_PATHS) {
    copyFixtureFile(fixtureRoot, relativePath)
  }
  return fixtureRoot
}

function assertXrV2SeedIdentity(source) {
  requireXrV2RuntimeIdentity({
    basename: XR_V2_SEED_BASENAME,
    relativePath: XR_V2_SEED_RELATIVE_PATH,
    source,
  })
}

test('XR v2 source smoke exports the closed validation ledger', () => {
  assert.deepEqual(
    XR_V2_SOURCE_VERIFICATIONS.map(verification => verification.name),
    [
      'XR v2 pin consistency',
      'XR v2 public runtime adapter contract',
      'XR v2 browser smoke source contract',
      'XR v2 readiness documentation contract',
    ],
  )
})

test('XR v2 workspace browser smoke prefers explicit then bundled Chromium and omits a missing executable', () => {
  for (const verifier of [
    'canvas/scripts/verify_xr_v2_browser_smoke.mjs',
    'canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs',
  ]) {
    const source = readFileSync(resolve(REPOSITORY_ROOT, verifier), 'utf8')
    assert.match(
      source,
      /const executablePath = findLocalChromiumExecutable\(\s*process\.env\.KG_XR_V2_CHROMIUM_EXECUTABLE,\s*chromium\.executablePath\(\),?\s*\)/u,
    )
    assert.match(source, /\.\.\.\(executablePath \? \{ executablePath \} : \{\}\)/u)
    assert.doesNotMatch(source, /executablePath: findLocalChromiumExecutable\(/u)
  }
})

test('XR v2 workspace browser smoke selects the actual Explorer seed without an environment bypass', () => {
  const runner = readFileSync(
    resolve(REPOSITORY_ROOT, 'canvas/scripts/run_xr_v2_workspace_seed_browser_smoke.mjs'),
    'utf8',
  )
  const verifier = readFileSync(
    resolve(REPOSITORY_ROOT, 'canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs'),
    'utf8',
  )
  assert.doesNotMatch(runner, /VITE_KNOWGRPH_RUN_READY_DEMO/u)
  const selection = verifier.indexOf('await seedRow.click()')
  const mountedRuntime = verifier.indexOf("const runtime = page.locator('[data-kg-xr-v2-authoring-runtime=\"1\"]')")
  assert.match(verifier, /openEditorWorkspace=1/u)
  assert.match(verifier, /getByRole\('navigation', \{ name: 'Source files', exact: true \}\)/u)
  assert.match(verifier, /Folder workspace-seeds/u)
  assert.match(verifier, /File knowgrph-ar-vr-xr-runtime-readiness-demo\.md/u)
  assert.ok(selection >= 0)
  assert.ok(mountedRuntime > selection)
  for (const marker of [
    'data-kg-three-canvas-owner',
    'data-kg-xr-document-loaded',
    'data-kg-motion-control-runtime',
    'data-kg-motion-control-device-sensors',
    'data-kg-xr-v2-immersive-enter',
    'generic XR session controls must stay unmounted',
  ]) assert.match(verifier, new RegExp(marker, 'u'))
})

test('XR v2 browser source rejects weakened explicit AC-11/AC-12 evidence flow', async t => {
  const verifierPath = 'canvas/scripts/verify_xr_v2_workspace_seed_browser_smoke.mjs'
  assert.doesNotThrow(() => verifyXrV2BrowserSmokeSourceContract(REPOSITORY_ROOT))
  const mutations = [
    ['software WebGL GL backend', "'--use-gl=angle'", "'--disable-gpu'"],
    ['software WebGL ANGLE backend', "'--use-angle=swiftshader-webgl'", "'--use-angle=default'"],
    ['explicit SwiftShader admission', "'--enable-unsafe-swiftshader'", "'--disable-software-rasterizer'"],
    ['initial cold navigation timeout', 'timeout: coldStartTimeoutMs,\n  })', 'timeout: 30_000,\n  })'],
    ['local-first scope', "'data-kg-xr-v2-saved-asset-scope'), 'local-first-explicit-existing-storage'", "'data-kg-xr-v2-saved-asset-scope'), 'cross-device'"],
    ['cross-device blocker', 'shared-storage-auth-and-server-digest-not-enforced', 'cross-device-ready'],
    ['stable mounted readiness', '__kgXrV2StableReadinessFrames >= 12', '__kgXrV2StableReadinessFrames >= 1'],
    ['AC-11 initial evidence', "'data-kg-xr-v2-ac-11-evidence'), 'not-observed'", "'data-kg-xr-v2-ac-11-evidence'), 'browser-observed'"],
    ['AC-12 initial evidence', "'data-kg-xr-v2-ac-12-evidence'), 'not-observed'", "'data-kg-xr-v2-ac-12-evidence'), 'browser-observed'"],
    ['camera click', 'await startCamera.click()', 'await startCamera.hover()'],
    ['capture click', 'await startSpatialCapture.click()', 'await startSpatialCapture.hover()'],
    ['saved capture', "getAttribute('data-kg-xr-v2-spatial-capture-phase') === 'saved'", "getAttribute('data-kg-xr-v2-spatial-capture-phase') === 'recording'"],
    ['camera stop', 'await stopCamera.click()', 'await stopCamera.hover()'],
    ['reload', "await page.reload({ waitUntil: 'domcontentloaded' })", "await page.waitForLoadState('domcontentloaded')"],
    ['catalog listing', "await savedAsset.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })", "await savedAsset.waitFor({ state: 'hidden', timeout: coldStartTimeoutMs })"],
    ['asset open', "await savedAsset.locator('[data-kg-xr-v2-saved-asset-open=\"1\"]').click()", "await savedAsset.locator('[data-kg-xr-v2-saved-asset-open=\"1\"]').hover()"],
    ['asset render', "getAttribute('data-kg-xr-v2-saved-asset-observed') === 'true'", "getAttribute('data-kg-xr-v2-saved-asset-observed') === 'false'"],
    ['AC-11 source binding', "getAttribute('data-kg-xr-v2-ac-11-source-asset'), savedAssetId", "getAttribute('data-kg-xr-v2-ac-11-source-asset'), 'fixture'"],
    ['cross-device publish click', 'await publishCrossDevice.click()', 'await publishCrossDevice.hover()'],
    ['cross-device manifest last', 'manifestPush > Math.max(...blobUploads)', 'manifestPush < Math.max(...blobUploads)'],
    ['AC-11 click', 'await runPackaging.click()', 'await runPackaging.hover()'],
    ['AC-11 panel observation', "'data-kg-xr-v2-ac-11-evidence') === 'browser-observed'", "'data-kg-xr-v2-ac-11-evidence') === 'not-observed'"],
    ['AC-11 canonical observation', "'[data-kg-xr-v2-ac=\"AC-11\"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),\n    'browser-observed'", "'[data-kg-xr-v2-ac=\"AC-11\"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),\n    'not-observed'"],
    ['AC-12 click', 'await runConnectedPreview.click()', 'await runConnectedPreview.hover()'],
    ['AC-12 panel observation', "'data-kg-xr-v2-ac-12-evidence') === 'browser-observed'", "'data-kg-xr-v2-ac-12-evidence') === 'not-observed'"],
    ['AC-12 canonical observation', "'[data-kg-xr-v2-ac=\"AC-12\"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),\n    'browser-observed'", "'[data-kg-xr-v2-ac=\"AC-12\"]').getAttribute('data-kg-xr-v2-ac-local-evidence'),\n    'not-observed'"],
    ['AC-12 mounted author revision', "getAttribute('data-kg-xr-v2-ac-12-authoring-edit-revision'), '1'", "getAttribute('data-kg-xr-v2-ac-12-authoring-edit-revision'), '0'"],
    ['AC-12 mounted author render', "Number(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-author-rendered-at-ms')) > 0", "Number(await reloadedDelivery.getAttribute('data-kg-xr-v2-ac-12-author-rendered-at-ms')) < 0"],
    ['cross-device second client', 'secondContext = await browser.newContext({ permissions: [] })', 'secondContext = context'],
    ['second-client cold navigation timeout', "await secondPage.goto(`${baseUrl}/knowgrph/?openEditorWorkspace=1`, {\n    waitUntil: 'domcontentloaded',\n    timeout: coldStartTimeoutMs,", "await secondPage.goto(`${baseUrl}/knowgrph/?openEditorWorkspace=1`, {\n    waitUntil: 'domcontentloaded',\n    timeout: 30_000,"],
    ['cross-device refresh click', 'await secondList.click()', 'await secondList.hover()'],
    ['cross-device reopen click', 'await secondRead.click()', 'await secondRead.hover()'],
    ['cross-device atomic catalog import', "getAttribute('data-kg-xr-v2-cross-device-phase') === 'ready' && Boolean(asset)", "getAttribute('data-kg-xr-v2-cross-device-phase') === 'ready' && !asset"],
  ]
  for (const [label, from, to] of mutations) {
    await t.test(label, t => {
      const fixtureRoot = createBrowserSmokeFixture(t)
      const target = resolve(fixtureRoot, verifierPath)
      const source = readFileSync(target, 'utf8')
      const mutated = source.replace(from, to)
      assert.notEqual(mutated, source, `fixture is missing ${from}`)
      writeFileSync(target, mutated)
      assert.throws(
        () => verifyXrV2BrowserSmokeSourceContract(fixtureRoot),
        /workspace XR v2 browser verifier requires ordered/u,
      )
    })
  }
})

test('XR v2 workspace seed rejects evidence and cross-device claim drift', async t => {
  const mutations = [
    ['saved-asset persistence', 'saved_asset_persistence: device-local-indexeddb-with-explicit-existing-storage-publish', 'saved_asset_persistence: cloud'],
    ['cross-device status', 'cross_device_reopen_status: client-adapter-ready-external-promotion-blocked', 'cross_device_reopen_status: ready'],
    ['cross-device blocker', 'cross_device_reopen_blocker: shared-storage-auth-and-server-digest-not-enforced', 'cross_device_reopen_blocker: none'],
    ['shared XR source authority', 'source_authority: /docs/workspace-seeds/knowgrph-physics-playground-demo.md', 'source_authority: /docs/workspace-seeds/alternate-world.md'],
    ['shared XR world ownership', 'world_ownership: overlay-only', 'world_ownership: standalone'],
    ['shared XR renderer owner', 'renderer_owner: canvas/src/lib/three/ThreeGraph.impl.tsx', 'renderer_owner: canvas/src/features/xr-v2/SecondCanvas.tsx'],
    ['second XR Canvas prohibition', 'second_r3f_canvas_forbidden: true', 'second_r3f_canvas_forbidden: false'],
    ['AC-4 evidence', 'evidence: browser-observable-after-selected-saved-asset render', 'evidence: browser-observed'],
    ['AC-4 promotion', 'promotion_boundary: physical four-tier viewer matrix, hardened shared storage, and two-device reopen', 'promotion_boundary: none'],
    ['AC-4 evidence state', 'evidenceState: browser-observable-after-saved-asset-render', 'evidenceState: browser-backed'],
    ['AC-4 output', 'Keep evidence not-observed until a persisted capture survives reload and explicit open, then two distinct timestamped frames render on an attached depth/Three surface or raw-video playback time advances; listing, selection, canplay, or session entry alone is never evidence.', 'Session entry proves viewer readiness.'],
    ['AC-11 evidence', 'evidence: browser-observable-after-explicit-package-and-play action', 'evidence: browser-backed'],
    ['AC-11 promotion', 'promotion_boundary: target-browser user-capture track and codec preservation', 'promotion_boundary: none'],
    ['AC-11 evidence state', 'evidenceState: browser-observable-after-explicit-action', 'evidenceState: browser-backed'],
    ['AC-11 output', 'Use Verify packaging on the explicitly opened identity-bound capture; evidence appears only after every pre-mux encoded source sample decodes, the mux preserves exact codec/count/payload bytes, and the mounted WebM advances.', 'Packaging is assumed.'],
    ['AC-12 evidence', 'evidence: browser-observable-after-explicit-local-connected-preview action', 'evidence: browser-backed'],
    ['AC-12 promotion', 'promotion_boundary: physical two-device transport and measured latency', 'promotion_boundary: none'],
    ['AC-12 evidence state', 'evidenceState: browser-observable-after-explicit-action', 'evidenceState: browser-backed'],
    ['AC-12 output', 'Use Run local preview; evidence appears only after an exact mounted-scene edit crosses real WebRTC peers, paints the attached viewer canvas in a later frame, and is then acknowledged within the bound without reload.', 'Connected preview is assumed.'],
  ]
  const source = readFileSync(resolve(REPOSITORY_ROOT, XR_V2_SEED_RELATIVE_PATH), 'utf8')
  assert.doesNotThrow(() => assertXrV2SeedIdentity(source))
  for (const [label, from, to] of mutations) {
    await t.test(label, () => {
      const mutated = source.replaceAll(from, to)
      assert.notEqual(mutated, source, `fixture is missing ${from}`)
      assert.throws(() => assertXrV2SeedIdentity(mutated), /invalid authority/u)
    })
  }
})

test('XR v2 canonical workspace seed is required by authored inventory authority', async () => {
  const result = await verifyWorkspaceSeedAuthority({ knowgrphRoot: REPOSITORY_ROOT })
  assert.ok(result.knowgrphInventory.includes(XR_V2_SEED_BASENAME))
})

test('XR v2 clean bootstrap selects the canonical workspace-seed path', () => {
  const source = readFileSync(
    resolve(REPOSITORY_ROOT, 'canvas/src/features/workspace-fs/workspaceRunReadyDemos.ts'),
    'utf8',
  )
  assert.match(
    source,
    /id: XR_V2_RUN_READY_DEMO_ID,[\s\S]*?validationSeedRelPath: XR_V2_DEMO_REPO_REL_PATH,[\s\S]*?seedRelPathCandidates: \[XR_V2_DEMO_REPO_REL_PATH\]/u,
  )
  assert.doesNotMatch(
    source,
    /id: XR_V2_RUN_READY_DEMO_ID,[\s\S]*?validationSeedRelPath: XR_V2_DEMO_WORKSPACE_SEED_BASENAME/u,
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
  assert.equal(result.pinnedRevision, XR_V2_PINNED_DOCUMENT_REVISION)
  assert.equal(result.pinnedBlob, XR_V2_PINNED_DOCUMENT_BLOB)
  assert.equal(result.pinnedBytes, XR_V2_PINNED_DOCUMENT_BYTES)
  assert.equal(result.pinnedSha256, XR_V2_PINNED_DOCUMENT_SHA256)
  assert.equal(result.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.equal(result.documents.length, 4)
})

test('XR v2 hosted gate produces the browser observation before upload', () => {
  const workflow = readFileSync(
    resolve(REPOSITORY_ROOT, '.github/workflows/integration.yml'),
    'utf8',
  )
  const producer = workflow.indexOf('node canvas/scripts/run_xr_v2_browser_smoke.mjs')
  const upload = workflow.indexOf('path: knowgrph/data/outputs/xr-v2-browser-smoke.json')
  assert.ok(producer >= 0, 'hosted XR gate must run the observation producer')
  assert.ok(upload > producer, 'observation upload must follow its producer')
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
  assert.equal(result.pinnedRevision, XR_V2_PINNED_DOCUMENT_REVISION)
  assert.equal(result.schema, 'knowgrph-xr-v2-pinned-contract-conformance/v1')
  assert.ok(result.files.includes('canvas/src/features/xr-v2/pinnedContractConformance.ts'))
  assert.deepEqual(result.ac14Owners, [
    'canvas/src/features/xr-v2/behaviorDispatcher.ts',
    'canvas/src/features/xr-v2/collisionEventBridge.ts',
    'canvas/src/features/xr-v2/__tests__/collisionEventBridge.test.ts',
    'canvas/src/features/three/xrSpatialPhysicsAdapter.ts',
    'canvas/src/features/three/xrPhysicsRuntime.ts',
  ])
})

test('XR v2 runtime source fails closed when AC-14 bridge or focused proof owners are removed', t => {
  for (const removedPaths of [
    ['canvas/src/features/xr-v2/collisionEventBridge.ts'],
    ['canvas/src/features/xr-v2/__tests__/collisionEventBridge.test.ts'],
    [
      'canvas/src/features/xr-v2/collisionEventBridge.ts',
      'canvas/src/features/xr-v2/__tests__/collisionEventBridge.test.ts',
    ],
  ]) {
    const fixtureRoot = createRuntimeFixture(t)
    for (const relativePath of removedPaths) rmSync(resolve(fixtureRoot, relativePath))
    assert.throws(
      () => verifyXrV2RuntimeSourceContract(fixtureRoot),
      /expected AC-14 collision event bridge (?:owner|focused proof) at/u,
    )
  }
})

test('XR v2 runtime source rejects AC-14 export, trigger, proof, and event-plumbing tampering', t => {
  const tamperCases = [
    {
      relativePath: 'canvas/src/features/xr-v2/index.ts',
      marker: "export * from './collisionEventBridge'",
      replacement: "export type * from './collisionEventBridge'",
      expected: /AC-14 public XR v2 index export marker/u,
    },
    {
      relativePath: 'canvas/src/features/xr-v2/behaviorDispatcher.ts',
      marker: "  | 'collision-begin'\n",
      replacement: '',
      expected: /collision-begin and collision-end BehaviorTrigger variants/u,
    },
    {
      relativePath: 'canvas/src/features/xr-v2/collisionEventBridge.ts',
      marker: "case 'collision-began': return { kind: 'collision-begin', trigger: 'collision-begin' }",
      replacement: "case 'collision-began': return null",
      expected: /collision event bridge owner marker case 'collision-began'/u,
    },
    {
      relativePath: 'canvas/src/features/xr-v2/__tests__/collisionEventBridge.test.ts',
      marker: "test('XR adapter and runtime step results preserve native spatial physics events'",
      replacement: "test('removed native event plumbing proof'",
      expected: /collision event bridge focused proof marker/u,
    },
    {
      relativePath: 'canvas/src/features/three/xrSpatialPhysicsAdapter.ts',
      marker: 'const events = freezeSpatialPhysicsEvents(args.simulation.engine.drainEvents())',
      replacement: 'const events = freezeSpatialPhysicsEvents([])',
      expected: /spatial physics adapter owner marker/u,
    },
    {
      relativePath: 'canvas/src/features/three/xrPhysicsRuntime.ts',
      marker: 'events.push(...result.events)',
      replacement: 'void result.events',
      expected: /exactly 2 times; found 1/u,
    },
  ]
  for (const tamperCase of tamperCases) {
    const fixtureRoot = createRuntimeFixture(t)
    const target = resolve(fixtureRoot, tamperCase.relativePath)
    const source = readFileSync(target, 'utf8')
    assert.ok(source.includes(tamperCase.marker), tamperCase.relativePath)
    writeFileSync(target, source.replace(tamperCase.marker, tamperCase.replacement))
    assert.throws(
      () => verifyXrV2RuntimeSourceContract(fixtureRoot),
      tamperCase.expected,
      tamperCase.relativePath,
    )
  }
})

test('XR v2 runtime source fails closed when pinned authority is tampered', t => {
  const fixtureRoot = createRuntimeFixture(t)
  const target = resolve(
    fixtureRoot,
    'canvas/src/features/xr-v2/pinnedSourceAuthority.ts',
  )
  writeFileSync(
    target,
    readFileSync(target, 'utf8').replaceAll(
      XR_V2_PINNED_DOCUMENT_REVISION,
      '0000000000000000000000000000000000000000',
    ),
  )
  assert.throws(
    () => verifyXrV2RuntimeSourceContract(fixtureRoot),
    error => error instanceof Error
      && error.message.includes(`marker ${XR_V2_PINNED_DOCUMENT_REVISION}`),
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
