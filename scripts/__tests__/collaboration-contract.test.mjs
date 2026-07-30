import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  readContract,
  selectAffectedCommands,
  validatePullRequestMetadata,
  validateTaskBranch,
} from '../collaboration-contract.mjs'
import { findProtectedPushes, parsePrePushEntries } from '../check-pre-push-refs.mjs'
import {
  classifyPrePushGate,
  withoutGitLocalEnvironment,
} from '../run-pre-push-gate.mjs'
import {
  buildLocalCollaborationBrowserEnv,
  buildLocalCollaborationPersistenceArgs,
  buildLocalCollaborationWorkerArgs,
  buildLocalCollaborationWorkerEnv,
  resolveLocalCollaborationStackConfig,
} from '../lib/collaboration-local-stack.js'

test('device lifecycle commands delegate to the canonical Agentic Canvas OS checkout wrapper', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts?.['device:complete'], 'node ../agentic-canvas-os/scripts/device-branch.mjs complete')
  assert.equal(pkg.scripts?.['device:end'], 'node ../agentic-canvas-os/scripts/device-branch.mjs end')
  assert.equal(pkg.scripts?.['device:park'], 'node ../agentic-canvas-os/scripts/device-branch.mjs park')
})

test('collaboration browser gate edits through the canonical active editor owner', () => {
  const smoke = fs.readFileSync(new URL('../../canvas/scripts/verify-multi-user-collaboration-e2e.ts', import.meta.url), 'utf8')
  const queryParams = fs.readFileSync(new URL('../../canvas/src/lib/routing/queryParams.ts', import.meta.url), 'utf8')
  const connectStart = smoke.indexOf('async function connectAuthenticatedRoom')
  const connectEnd = smoke.indexOf('async function waitForActiveDocumentReady', connectStart)
  const connectRuntime = smoke.slice(connectStart, connectEnd)
  const connectionTry = connectRuntime.indexOf('try {')
  const panelOpen = connectRuntime.indexOf('await openCollaborationPanel(page)')
  const buttonReady = connectRuntime.indexOf("await connectButton.waitFor({ state: 'visible'")
  const connectionCatch = connectRuntime.indexOf('} catch (error)')
  const mainStart = smoke.indexOf('async function main()')
  const mainEnd = smoke.indexOf('\nmain()', mainStart)
  const mainRuntime = smoke.slice(mainStart, mainEnd)
  const mainConnection = mainRuntime.indexOf('connectAuthenticatedRoom(ownerPage)')
  const mainBeforeConnection = mainRuntime.slice(0, mainConnection)

  assert.match(queryParams, /QUERY_PARAM_RUNTIME_IDENTITY_PROOF = 'kgRuntimeIdentityProof'/)
  assert.match(smoke, /QUERY_PARAM_RUNTIME_IDENTITY_PROOF/)
  assert.match(smoke, /url\.searchParams\.set\(QUERY_PARAM_RUNTIME_IDENTITY_PROOF, '1'\)/)
  assert.match(smoke, /\.kg-markdown-editor-pane \.view-lines/)
  assert.match(smoke, /editorSurfaceCount !== 1/)
  assert.match(smoke, /editorRoot\?\.contains\(document\.activeElement\)/)
  assert.match(smoke, /keyboard\.insertText/)
  assert.match(smoke, /assertRoomStatus\(WORKER_URL, ownerConnectedSnapshot\.markdownDocumentName\)/)
  assert.match(smoke, /for \(let attempt = 0; attempt < 20; attempt \+= 1\)/)
  assert.match(smoke, /collaboration panel did not acknowledge the bounded open request/)
  assert.match(smoke, /markdownWorkspaceIndexingInFlight/)
  assert.match(smoke, /async function waitForRuntimeIdentityProofConvergence/)
  assert.match(smoke, /isPassingRuntimeIdentityProof\(ownerProof\)[\s\S]*isPassingRuntimeIdentityProof\(guestProof\)[\s\S]*ownerProof\.verificationDigest === guestProof\.verificationDigest/)
  assert.match(smoke, /catalogHydrationAttempts <= 2/)
  assert.doesNotMatch(smoke, /waitForRuntimeIdentityPass/)
  assert.ok(connectionTry >= 0)
  assert.ok(connectionTry < panelOpen)
  assert.ok(panelOpen < buttonReady)
  assert.ok(buttonReady < connectionCatch)
  assert.ok(mainStart >= 0)
  assert.ok(mainEnd > mainStart)
  assert.ok(mainConnection >= 0)
  assert.doesNotMatch(mainBeforeConnection, /openCollaborationPanel/)
  assert.match(smoke, /await waitForActiveDocumentReady\(page\)[\s\S]*await closeFloatingPanelIfOpen\(page\)[\s\S]*await connectButton\.click/)
  assert.match(smoke, /KG_COLLABORATION_E2E_RESULT_PATH/)
  assert.match(smoke, /renameSync\(temporaryPath, RESULT_PATH\)/)
  assert.doesNotMatch(smoke, /\.click\(\{[^}]*force:\s*true/)
  assert.doesNotMatch(smoke, /graphState\.setActiveMarkdownDocument/)
  assert.match(smoke, /restoreLocalDocumentSnapshot\(localDocumentSnapshot\)/)
})

test('local collaboration browser identities remain stable across repeated gate runs', () => {
  const config = resolveLocalCollaborationStackConfig({ repoRoot: '/tmp/knowgrph-test', env: {} })
  const browserEnv = buildLocalCollaborationBrowserEnv(config, {})
  const workerEnv = buildLocalCollaborationWorkerEnv(config, {})
  const workerArgs = buildLocalCollaborationWorkerArgs(config, 8877)
  const persistenceArgs = buildLocalCollaborationPersistenceArgs(config)

  assert.equal(config.ownerAppUrl, 'http://127.0.0.1:5175/')
  assert.equal(config.guestAppUrl, 'http://127.0.0.1:5174/')
  assert.notEqual(config.ownerAppUrl, 'http://127.0.0.1:5173/')
  assert.notEqual(config.ownerAppUrl, config.guestAppUrl)
  const storageWorker = config.services.find(service => service.id === 'storage-worker')
  assert.equal(storageWorker?.readyUrl, 'http://127.0.0.1:8787/api/storage/relay/capabilities')
  assert.equal(
    storageWorker?.readyOptions?.headers?.authorization,
    `Bearer ${config.ownerSessionToken}`,
  )
  assert.equal(storageWorker?.readyOptions?.headers?.origin, 'http://127.0.0.1:5175')
  assert.equal(storageWorker?.readyOptions?.schema, 'knowgrph-storage-relay-capabilities/v1')
  assert.deepEqual(storageWorker?.runtimeArgs, ['--local-upstream', '127.0.0.1'])
  assert.deepEqual(storageWorker?.runtimeVars, {
    KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID: config.workspaceId,
  })
  assert.equal(config.ownerClientDeviceId, 'dev:collaboration-owner-local')
  assert.equal(config.guestClientDeviceId, 'dev:collaboration-guest-local')
  assert.equal(browserEnv.KG_COLLABORATION_E2E_OWNER_DEVICE_ID, config.ownerClientDeviceId)
  assert.equal(browserEnv.KG_COLLABORATION_E2E_GUEST_DEVICE_ID, config.guestClientDeviceId)
  assert.equal(browserEnv.KG_COLLABORATION_E2E_DOC_PATH, config.documentPath)
  assert.equal(config.mutableSourcePath, '/tmp/knowgrph-test/docs/workspace-seeds/knowgrph-physics-playground-demo.md')
  assert.equal(config.env.VITE_WORKSPACE_MUTABLE_SOURCE_ABS_PATH, config.mutableSourcePath)
  assert.equal(workerEnv.KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID, config.workspaceId)
  assert.equal(workerEnv.KNOWGRPH_STORAGE_LOCAL_RUNTIME, 'true')
  assert.deepEqual(workerArgs.slice(-4), [
    '--var',
    `KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID:${config.workspaceId}`,
    '--var',
    'KNOWGRPH_STORAGE_LOCAL_RUNTIME:true',
  ])
  assert.deepEqual(persistenceArgs, [
    '--persist-to',
    '/tmp/knowgrph-test/cloudflare/workers/knowgrph-storage/.wrangler/state',
  ])
  assert.equal(workerArgs.includes(config.storagePersistencePath), true)
  assert.notEqual(config.ownerClientDeviceId, config.guestClientDeviceId)
})

test('local collaboration stack accepts run-scoped ports and persistence outside the repository', () => {
  const config = resolveLocalCollaborationStackConfig({
    repoRoot: '/tmp/knowgrph-test',
    env: {
      KG_COLLABORATION_E2E_OWNER_URL: 'http://127.0.0.1:15174/',
      KG_COLLABORATION_E2E_GUEST_URL: 'http://127.0.0.1:15175/',
      KG_COLLABORATION_E2E_WORKER_URL: 'http://127.0.0.1:15176',
      KG_COLLABORATION_E2E_PERSISTENCE_PATH: '/tmp/agentic-gates/run-1/wrangler',
    },
  })

  assert.equal(config.storagePersistencePath, '/tmp/agentic-gates/run-1/wrangler')
  assert.deepEqual(config.services.map(service => service.local?.port), [15174, 15175, 15176])
  assert.match(config.services[0].startupCommand, /--port 15174 --strictPort/)
  assert.match(config.services[1].startupCommand, /--port 15175 --strictPort/)
  assert.match(config.services[2].startupCommand, /--port 15176$/)
  assert.deepEqual(buildLocalCollaborationPersistenceArgs(config), [
    '--persist-to',
    '/tmp/agentic-gates/run-1/wrangler',
  ])
})

test('collaboration smoke preparation builds linked packages before readiness checks', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const readiness = fs.readFileSync(new URL('../check-collaboration-readiness.mjs', import.meta.url), 'utf8')
  const viteConfig = fs.readFileSync(new URL('../../canvas/vite.config.ts', import.meta.url), 'utf8')
  const preparationIndex = readiness.indexOf("args: ['run', 'smoke:prepare']")
  const docsGuardIndex = readiness.indexOf("name: 'docs guard'")

  assert.equal(pkg.scripts?.['smoke:prepare'], 'npm -C canvas run prepare:linked-packages')
  assert.ok(preparationIndex >= 0)
  assert.ok(preparationIndex < docsGuardIndex)
  assert.match(readiness, /resolveCanonicalSourceRoots/)
  assert.match(readiness, /KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT/)
  assert.match(readiness, /VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT/)
  assert.match(viteConfig, /optimizeDeps:[\s\S]*include:[\s\S]*'yjs'/)
})

test('release smoke prepares shared modules and defers only the x402 wallet gate', () => {
  const smoke = fs.readFileSync(new URL('../../.github/workflows/smoke-test.sh', import.meta.url), 'utf8')
  const preparationIndex = smoke.indexOf('npm run smoke:prepare')
  const readinessIndex = smoke.indexOf('npm run agent-ready:check')

  assert.ok(preparationIndex >= 0)
  assert.ok(preparationIndex < readinessIndex)
  assert.match(smoke, /KNOWGRPH_AGENT_READY_INCLUDE_X402=false/)
  assert.match(smoke, /require\('\.\/config\/surface-registry\.json'\)/)
  assert.match(smoke, /registry\.publicOrigin/)
  assert.match(smoke, /surface registry publicOrigin must be an HTTPS origin/)
  assert.match(smoke, /KNOWGRPH_AGENT_READY_BASE_URL:-\$configured_public_origin/)
  assert.doesNotMatch(smoke, /pages\.dev/)
  assert.match(smoke, /for attempt in 1 2 3 4 5/)
  assert.match(smoke, /sleep 15/)
})

test('canonical contract is valid and selects deduplicated affected checks', async () => {
  const contract = await readContract()
  const plan = selectAffectedCommands([
    'canvas/src/app/main.ts',
    'ecs/world.js',
    'mcp/server.js',
    'package.json',
    'README.md',
  ], contract)

  assert.deepEqual(plan.scopes, ['dependencies', 'canvas', 'runtime', 'documentation'])
  assert.deepEqual(plan.unmatchedPaths, [])
  assert.deepEqual(plan.commands, [
    ['npm', 'run', 'check'],
    ['npm', 'run', 'runtime:check'],
  ])
})

test('Agentic ECS source always selects the runtime gate', async () => {
  const contract = await readContract()
  const plan = selectAffectedCommands(['ecs/worldTick.js'], contract)

  assert.deepEqual(plan.scopes, ['runtime'])
  assert.deepEqual(plan.unmatchedPaths, [])
  assert.deepEqual(plan.commands, [['npm', 'run', 'runtime:check']])
})

test('surface policy owners always select the focused readiness gate', async () => {
  const contract = await readContract()
  const ownerPaths = [
    'config/surface-registry.json',
    'config/license-registry.json',
    'schemas/surface-registry.v1.schema.json',
    'scripts/surface/publication-gate.mjs',
    'data/surface/ledger/README.md',
    'docs/discoverability-ip-protection-runtime.md',
  ]

  for (const ownerPath of ownerPaths) {
    const plan = selectAffectedCommands([ownerPath], contract)
    assert.ok(plan.scopes.includes('surface_policy'), ownerPath)
    assert.deepEqual(plan.unmatchedPaths, [], ownerPath)
    assert.ok(
      plan.commands.some(command => command.join(' ') === 'npm run surface:verify'),
      ownerPath,
    )
  }
})

test('Rich Media preview timing owners always select schema and browser contract gates', async () => {
  const contract = await readContract()
  const timingOwnerPaths = [
    'canvas/schemas/rich-media-catalog-preview-timing.v1.schema.json',
    'canvas/scripts/lib/rich-media-catalog-preview-timing-schema.mjs',
    'canvas/scripts/validate_rich_media_catalog_preview_timing.mjs',
    'canvas/scripts/__tests__/rich-media-catalog-preview-timing-schema.test.mjs',
    'canvas/scripts/run_rich_media_browser_smoke.mjs',
    'canvas/scripts/verify_rich_media_browser_smoke.py',
    'canvas/src/features/testing/RichMediaBrowserSmokePage.tsx',
    'canvas/src/features/testing/richMediaBrowserSmokeFixtures.json',
    'canvas/src/__tests__/richMediaBrowserSmokeContract.test.ts',
  ]

  for (const ownerPath of timingOwnerPaths) {
    const plan = selectAffectedCommands([ownerPath], contract)
    assert.ok(plan.scopes.includes('rich_media_preview_timing'), ownerPath)
    assert.deepEqual(plan.unmatchedPaths, [], ownerPath)
    assert.ok(plan.commands.some(command => command.join(' ') === (
      'npm --prefix canvas run test:smoke:rich-media:timing-schema'
    )), ownerPath)
    assert.ok(plan.commands.some(command => command.join(' ') === (
      'npm --prefix canvas run test:ci:unit -- richMedia.browserSmokeContract'
    )), ownerPath)
  }
})

test('ready pull request metadata follows slash hash at grammar', async () => {
  const contract = await readContract()
  const metadata = validatePullRequestMetadata(`---
action: /fix
scope: "#canvas.render"
actor: "@codex-task"
base_sha: "0123456789abcdef0123456789abcdef01234567"
---
`, contract)

  assert.equal(metadata.scope, '#canvas.render')
})

test('draft pull requests may omit incomplete metadata', async () => {
  const contract = await readContract()
  assert.equal(validatePullRequestMetadata('', contract, { allowIncomplete: true }), null)
  assert.equal(validatePullRequestMetadata(`---
action: /change
scope: "#replace.with-semantic-scope"
actor: "@replace-with-owner"
base_sha: "replace-with-40-character-origin-main-sha"
---
`, contract, { allowIncomplete: true }), null)
  assert.throws(() => validatePullRequestMetadata('', contract), /must declare collaboration frontmatter/)
})

test('task branches encode one device and semantic scope', async () => {
  const contract = await readContract()
  assert.equal(validateTaskBranch('agent/macbook/canvas-render', contract, '#canvas.render'), 'agent/macbook/canvas-render')
  assert.equal(
    validateTaskBranch('agent/katrinas-macbook-pro.local/canvas-render', contract, '#canvas.render'),
    'agent/katrinas-macbook-pro.local/canvas-render',
  )
  assert.equal(
    validateTaskBranch('agent/build_host/canvas-render', contract, '#canvas.render'),
    'agent/build_host/canvas-render',
  )
  assert.throws(() => validateTaskBranch('feature/canvas-render', contract), /branch must satisfy/)
  assert.throws(() => validateTaskBranch('agent/macbook/canvas/render', contract), /branch must satisfy/)
  assert.throws(() => validateTaskBranch('agent/.local/canvas-render', contract), /branch must satisfy/)
  assert.throws(() => validateTaskBranch('agent/macbook/runtime-contract', contract, '#canvas.render'), /branch scope must be/)
})

test('protected cloud ledger is the only shared write-scope authority', async () => {
  const contract = await readContract()
  const checkerSource = fs.readFileSync(new URL('../check-collaboration-runtime.mjs', import.meta.url), 'utf8')
  const workflowSource = fs.readFileSync(new URL('../../.github/workflows/integration.yml', import.meta.url), 'utf8')

  assert.equal(contract.coordination.authority, 'agentic-canvas-os-remote-ledger')
  assert.equal(contract.coordination.ledger_repository, 'huijoohwee/agentic-canvas-os')
  assert.equal(contract.coordination.ledger_ref, 'refs/heads/agentic/collaboration-ledger')
  assert.equal(contract.coordination.overlap_policy, 'normalized-write-scope')
  assert.equal(contract.coordination.local_projection, 'pull-request-and-device-lease')
  assert.equal('unique_active_scope' in contract.coordination, false)
  assert.match(checkerSource, /cloud-collaboration\.mjs/)
  assert.match(checkerSource, /requiredState: 'review-ready'/)
  assert.doesNotMatch(checkerSource, /findActiveScopeConflicts|fetchOpenPullRequests/)
  assert.match(workflowSource, /KNOWGRPH_REQUIRE_REMOTE_AUTHORITY_CHECK/)
  assert.match(workflowSource, /KNOWGRPH_AGENTIC_CANVAS_OS_ROOT/)
  assert.doesNotMatch(workflowSource, /KNOWGRPH_REQUIRE_REMOTE_SCOPE_CHECK/)
})

test('pre-push protection is derived from canonical refs', async () => {
  const contract = await readContract()
  const input = [
    'refs/heads/agent/macbook/canvas-render a refs/heads/agent/macbook/canvas-render b',
    'refs/heads/main c refs/heads/main d',
  ].join('\n')
  assert.deepEqual(findProtectedPushes(input, contract.coordination.protected_push_refs), ['refs/heads/main'])
  const entries = parsePrePushEntries(input)
  assert.equal(entries.length, 2)
  assert.equal(classifyPrePushGate({
    entries: [entries[0]],
    headRevision: 'a',
    headRef: 'refs/heads/agent/macbook/canvas-render',
  }), 'checkout')
  assert.equal(classifyPrePushGate({
    entries: [entries[0]],
    headRevision: 'different',
    headRef: 'refs/heads/agent/macbook/canvas-render',
  }), 'object')
})

test('pre-push integration children cannot inherit repository-local Git routing', () => {
  const original = {
    GIT_DIR: '/repo/.git/worktrees/task',
    GIT_WORK_TREE: '/repo/task',
    GIT_INDEX_FILE: '/repo/.git/worktrees/task/index',
    PATH: '/usr/bin',
  }
  const sanitized = withoutGitLocalEnvironment(
    original,
    'GIT_DIR\nGIT_WORK_TREE\nGIT_INDEX_FILE',
  )
  assert.deepEqual(sanitized, { PATH: '/usr/bin' })
  assert.deepEqual(original, {
    GIT_DIR: '/repo/.git/worktrees/task',
    GIT_WORK_TREE: '/repo/task',
    GIT_INDEX_FILE: '/repo/.git/worktrees/task/index',
    PATH: '/usr/bin',
  })
})
