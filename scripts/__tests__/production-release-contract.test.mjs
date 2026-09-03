import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { assertRemoteRevisionAuthority } from '../immutable-release-manifest.mjs'
import { classifyServiceWorkerReleaseTransition } from '../service-worker-release-transition.mjs'
import { seedReturningUserCacheProof } from '../service-worker-upgrade-cache-proof.mjs'
import {
  assertCandidatePagesAttribution,
  digestBytes,
  normalizeTransportInstant,
  validateTransportEvidence,
} from '../verify-production-release-transports.mjs'
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const integrationWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'integration.yml'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8'); const bootstrapWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'travel-mesh-bootstrap.yml'), 'utf8'); const bootstrapScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'travel-mesh-bootstrap.mjs'), 'utf8'); const bootstrapAuthorization = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'travel-mesh-bootstrap-authorization.mjs'), 'utf8')
const releaseSmoke = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'smoke-test.sh'), 'utf8')
const promotionWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'promote-agentic-canvas-os.yml'), 'utf8')
const agentReadySmoke = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'check-agent-ready.mjs'), 'utf8')
const docsSeedScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'seed-storage-docs-to-cloudflare.mjs'), 'utf8')
const docsSeedLibrary = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'lib', 'seed-storage-documents-d1.mjs'), 'utf8')
const pagesSyncScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'sync-pages-agenticgraph.mjs'), 'utf8')
const pagesFunctionsBuildScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'build-pages-functions-worker.mjs'), 'utf8')
const agentReadyFunction = fs.readFileSync(path.resolve(repoRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready.mjs'), 'utf8'); const storageOriginSources = [fs.readFileSync(path.resolve(repoRoot, 'cloudflare', 'pages', 'agenticgraph-agent-ready-shared.mjs'), 'utf8'), fs.readFileSync(path.resolve(repoRoot, 'docs', 'documents', 'agenticgraph-api-document.md'), 'utf8'), fs.readFileSync(path.resolve(repoRoot, 'docs', 'documents', 'agenticgraph-cross-repo-publish-topology.md'), 'utf8')]
const agentReadyToolContract = fs.readFileSync(path.resolve(repoRoot, 'canvas', 'src', 'features', 'agent-ready', 'agenticgraphAgentReadyToolContract.mjs'), 'utf8')
const rootAgentReadyFunction = fs.readFileSync(path.resolve(repoRoot, 'cloudflare', 'pages', 'root-agent-ready-index.mjs'), 'utf8')
const productionReadinessBuild = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-runtime-readiness-build.mjs'), 'utf8')
const pagesDeploymentScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'pages-production-deployment.mjs'), 'utf8')
const productionFidelityScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'verify-production-fidelity.mjs'), 'utf8')
const productionServiceWorkerUpgradeScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'verify-production-service-worker-upgrade.mjs'), 'utf8')
const productionServiceWorkerRegistrationProof = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-service-worker-registration-proof.mjs'), 'utf8')
const serviceWorkerUpgradeCacheProofScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'service-worker-upgrade-cache-proof.mjs'), 'utf8')
const serviceWorkerReleaseTransitionScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'service-worker-release-transition.mjs'), 'utf8')
const productionMirrorArtifactScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-mirror-artifact.mjs'), 'utf8')
const gameModeSourceAuthorityScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'check-game-fps-readiness.mjs'), 'utf8')
const protectedMainAuthorityScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'assert-protected-main-release-authority.mjs'), 'utf8')
const productionAuthorizationScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-release-authorization.mjs'), 'utf8')
const productionLifecycleScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-release-lifecycle.mjs'), 'utf8')
const productionTerminalAuthorizationScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'production-terminal-authorization.mjs'), 'utf8')
const productionReleaseTransportScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'verify-production-release-transports.mjs'), 'utf8'); const productionReleaseDependencyInstall = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'install-production-release-dependencies.sh'), 'utf8')
const packageScripts = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8')).scripts
const assertAllMatch = (source, patterns) => patterns.forEach(pattern => assert.match(source, pattern))
const assertNoneMatch = (source, patterns) => patterns.forEach(pattern => assert.doesNotMatch(source, pattern))
const assertIncludes = (source, fragments) => fragments.forEach(fragment => assert.ok(source.includes(fragment), `expected source to include ${fragment}`))
const assertExcludes = (source, fragments) => fragments.forEach(fragment => assert.ok(!source.includes(fragment), `expected source to exclude ${fragment}`))
const assertInOrder = (source, markers) => {
  let previousIndex = -1
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1)
    assert.ok(index > previousIndex, `expected ${marker} after the preceding release boundary`)
    previousIndex = index
  }
}
const workflowJob = name => {
  const start = releaseWorkflow.indexOf(`\n  ${name}:`); const relativeEnd = releaseWorkflow.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:/)
  return releaseWorkflow.slice(start, relativeEnd === -1 ? undefined : start + 1 + relativeEnd)
}
const workflowStep = (job, name) => { const start = job.indexOf(`name: ${name}`); const next = job.indexOf('\n      - name:', start + 1); return job.slice(start, next === -1 ? undefined : next) }
test('integration isolates protected merge and main checks by exact revision', () => {
  assertAllMatch(integrationWorkflow, [ /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, ])
  assertNoneMatch(integrationWorkflow, [ /group: integration-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/, /cancel-in-progress: true/, ])
})
test('production release rejects a stale delayed protected-main event', () => {
  const currentMain = 'a'.repeat(40)
  assert.deepEqual(
    assertRemoteRevisionAuthority({
      sourceRevision: currentMain,
      remoteRevision: currentMain,
      targetRef: 'refs/heads/main',
    }),
    {
      sourceRevision: currentMain,
      remoteRevision: currentMain,
      targetRef: 'refs/heads/main',
    },
  )
  assert.throws(
    () => assertRemoteRevisionAuthority({
      sourceRevision: 'b'.repeat(40),
      remoteRevision: currentMain,
      targetRef: 'refs/heads/main',
    }),
    /release source revision .* is stale; remote refs\/heads\/main is/,
  )
  assert.throws(
    () => assertRemoteRevisionAuthority({
      sourceRevision: '0'.repeat(40),
      remoteRevision: currentMain,
      targetRef: 'refs/heads/main',
    }),
    /release source revision must be an exact lowercase 40-character Git commit SHA/,
  )
  assertAllMatch(protectedMainAuthorityScript, [ /remote = 'origin'/, /readRemoteRevision\(\{\s*remote,\s*targetRef: PROTECTED_MAIN_REF,\s*cwd,/, /assertRemoteRevisionAuthority\(\{/, ])
  assertNoneMatch(protectedMainAuthorityScript, [/SHA_PATTERN|ZERO_SHA|requireRevision/])
  assert.equal(
    packageScripts['release:main-authority:check'],
    'node ./scripts/assert-protected-main-release-authority.mjs',
  )
})
test('integration forbids alternate standalone Game Mode and XR Physics source owners', () => {
  assert.equal(packageScripts['game-mode:source-authority'], 'node ./scripts/check-game-fps-readiness.mjs')
  assert.match(packageScripts['conflict:source'], /^npm run game-mode:source-authority && /)
  assertAllMatch(gameModeSourceAuthorityScript, [ /authorityExecutableRoots/, /deletedStandaloneMarkers/, /workspaceSeedPaths/, /declaresStandaloneXrWorld/, /gameAwareThreeOwners/, /xrPhysicsThreeOwners/,
    /__pbt__\|__tests__\|fixtures\|test\|tests/, ])
})
test('GitHub workflows pin Node 24 actions to immutable revisions', () => {
  const workflowRoot = path.resolve(repoRoot, '.github', 'workflows')
  const workflowSource = fs.readdirSync(workflowRoot)
    .filter(fileName => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
    .map(fileName => fs.readFileSync(path.resolve(workflowRoot, fileName), 'utf8'))
    .join('\n')
  const actionUses = [...workflowSource.matchAll(/uses:\s*(actions\/[A-Za-z0-9_.-]+)@([^\s#]+)/g)]
  assert.ok(actionUses.length > 0)
  for (const [, action, revision] of actionUses) {
    assert.match(revision, /^[0-9a-f]{40}$/, `${action} must use an immutable commit SHA`)
  }
  for (const action of ['checkout', 'setup-node', 'setup-python', 'upload-artifact', 'download-artifact']) {
    assert.match(workflowSource, new RegExp(`actions/${action}@[0-9a-f]{40}`))
  }
})
test('production release builds the exact localhost-reviewed candidate once before authorization', () => {
  const verifyJob = workflowJob('verify')
  assertAllMatch(verifyJob, [ /name: Build and sync verified candidate/, /AGENTICGRAPH_SOURCE_REVISION: ['"]?\$\{\{ inputs\.source_sha \}\}/, /VITE_AGENTICGRAPH_STORAGE_BASE_URL: ['"]?https:\/\/airvio\.co/,
    /run: npm run pages:build-sync/, /name: Materialize and verify release evidence/, /name: Bind immutable production candidate/, /name: Upload production authorization evidence/, ])
  assertNoneMatch(verifyJob, [/run: npm run pages:sync/])
})
test('Pages mirror sync preserves the agent-ready route and tool module closure', () => {
  const localModuleImports = [...new Set([agentReadyFunction, agentReadyToolContract].flatMap(source => [...source.matchAll(/from ["'](\.\.?\/[^"']+)["']/g)]).map(([, modulePath]) => path.posix.basename(modulePath)))]
  assert.ok(localModuleImports.length > 0)
  assertAllMatch(pagesSyncScript, [ /collectLocalModuleClosureCopies/, /localModuleSpecifiers/, /path\.relative\(agenticgraphRoot, sourcePath\)/, /collectLocalModuleClosureCopies\(\[agentReadyToolContractSource\]\)/, ])
  assertAllMatch(pagesFunctionsBuildScript, [/process\.env\.AGENTICGRAPH_PUBLISH_REPOSITORY_ROOT/])
  assert.match(storageOriginSources[0], /^export const STORAGE_FETCH_ORIGIN = "https:\/\/storage\.airvio\.co";$/m)
  assert.ok(storageOriginSources.slice(1).every(source => source.includes('https://storage.airvio.co')))
  assertNoneMatch(storageOriginSources.join('\n'), [/https:\/\/knowgrph-storage\.huijoohwee\.workers\.dev/, /https:\/\/agenticgraph-storage\.huijoohwee\.workers\.dev/]); assertNoneMatch(`${agentReadyFunction}\n${storageOriginSources[0]}`, [/https:\/\/[A-Za-z0-9.-]+\.workers\.dev/])
  assert.equal((agentReadyFunction.match(/\bSTORAGE_FETCH_ORIGIN\b/g) || []).length, 4); assertIncludes(agentReadyFunction, ['STORAGE_FETCH_ORIGIN,', 'fetch(`${STORAGE_FETCH_ORIGIN}${buildAgenticGraphStorageSourceFilesIndexPath()}`', 'fetch(`${STORAGE_FETCH_ORIGIN}${path}`', 'new URL(buildStorageDocPath(pathArgs.canonicalPath, pathArgs.workspaceId), STORAGE_FETCH_ORIGIN)'])
})
test('Pages mirror sync scopes XR capture and spatial tracking permissions to AgenticGraph', () => {
  assertAllMatch(pagesSyncScript, [ /GENERATED_XR_RUNTIME_HEADERS_START/, /'\/agenticgraph\/\*', '\/content\/agenticgraph\/\*'/, /'  ! Permissions-Policy'/, ])
  for (const directive of [
    'accelerometer=(self)',
    'autoplay=(self)',
    'camera=(self)',
    'display-capture=(self)',
    'gyroscope=(self)',
    'microphone=(self)',
    'xr-spatial-tracking=(self)',
  ]) {
    assert.ok(pagesSyncScript.includes(directive), `expected ${directive} in generated XR policy`)
  }
  for (const directive of ['clipboard-read=()', 'clipboard-write=()', 'geolocation=()', 'payment=()', 'usb=()']) {
    assert.ok(pagesSyncScript.includes(directive), `expected ${directive} to remain denied`)
  }
})
test('apex Home has one canonical shell and a real Pages not-found boundary', () => {
  assertNoneMatch(rootAgentReadyFunction, [ /rootHtmlResponse|rootNoscriptFallbackMarkup|loadWebMcpScript/, /data-kg-live-canvas-launch|<iframe class="live-canvas"/, ])
  assertAllMatch(rootAgentReadyFunction, [/throw new Error\("canonical AgenticGraph app shell is invalid"\)/])
  assertAllMatch(productionFidelityScript, [ /missing assets must not resolve through the apex Home app shell/, /missingResponse\.status, 404/, /'\/index\.html'/, /'\/hackamap\/'/,
    /the Pages 404 boundary must preserve the sibling Singabldr app/, /\/singabldr\/manifest\.webmanifest/, /\/singabldr\/sw\.js/, ])
  assertAllMatch(productionMirrorArtifactScript, [ /'404\.html'/, /productionMirrorArtifactDeletionEntries/, /XR_V2_LEGACY_MIRROR_RELATIVE_PATHS/, ])
  assertAllMatch(releaseWorkflow, [/huijoohwee\/404\.html/])
})
test('production fidelity smokes both XR v2 config routes before browser launch', () => {
  assertIncludes(productionFidelityScript, [
    '/xr-v2/models/depth-anything-v2-small/config.json',
    '/agenticgraph/xr-v2/models/depth-anything-v2-small/config.json',
    'XR v2 config route bodies must be byte-identical',
    "model_type, 'depth_anything'",
  ])
  assertInOrder(productionFidelityScript, [
    'await verifyXrV2DepthConfigRoutes()',
    'chromium.launch',
  ])
})
test('production release requires an exact reviewed candidate, human environment gate, and retains rollback evidence', () => {
  assertAllMatch(releaseWorkflow, [ /on:\s*\n\s*workflow_dispatch:/, /concurrency:\s*\n\s*group: production-release\s*\n\s*cancel-in-progress: false/,
    /source_sha:/, /local_review_candidate:/, /release_evidence:[\s\S]*required: true/, /environment:\s*\n\s*name: production/, /PRODUCTION_CANDIDATE_DIGEST: ['"]?\$\{\{ needs\.verify\.outputs\.candidate_digest \}\}/,
    /name: Enforce sole deployment ownership/, /runtime:pages:owner-enforce/, /name: Capture current production rollback target/, /name: Capture authoritative candidate deployment/, /runtime:pages:rollback/,
    /name: Determine pre-publication rollback eligibility/, /steps\.rollback_eligibility\.outputs\.eligible == 'true'/, ])
  assertNoneMatch(releaseWorkflow, [/\n\s*push:/, /runtime:pages:capture-current/, /runtime:pages:capture-candidate/])
  assertAllMatch(productionAuthorizationScript, [/agentic-local-review-candidate\/v1/, /agentic-production-release-candidate\/v1/])
  assertAllMatch(productionReleaseTransportScript, [ /canonical_deployment/, /deploymentRunIdentity: String\(detail\.result\?\.deployment_trigger\?\.metadata\?\.commit_message/, /assertCandidatePagesAttribution\(\{/,
    /persistPagesApiEvidence\(\{ observation, evidenceDir, prefix \}\)/, ])
})
test('provider bootstrap is separate, exactly authorized, upgrade-only, and enables release last', () => {
  assertAllMatch(bootstrapWorkflow, [ /workflow_dispatch:/, /environment: production/, /plan_run_id:/, /resume_run_id:/, /secrets\.AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN/, /secrets\.AGENTICGRAPH_STORAGE_SIGNING_SECRET/, /MARKETPLACE_SERVICE: agenticgraph-marketplace-production/, /TRAVEL_MESH_PROBE_SPEC_JSON: '\[\{"id":"mcp"/, /travel-mesh-bootstrap-plan-\$\{\{ inputs\.source_sha \}\}-\$\{\{ github\.run_id \}\}/, /actions\/runs\/\$run_id/, /\.repository\.full_name == \$repository/, /\.event == "workflow_dispatch"/, /\.head_sha == \$sha/, /\.conclusion/, /artifact_digest/, /sha256sum -c travel-mesh-bootstrap-plan\.sha256/, /Persist resumable bootstrap apply evidence/ ]); assertAllMatch(bootstrapAuthorization, [ /authorize travel-mesh-provider-bootstrap/, /adopted-response-loss/, /provider packet must never contain secret values|must never contain secret values/, /beforeInventoryDigest/ ]); assertAllMatch(bootstrapScript, [ /marketplace.*mcp-shell.*settlement-executor.*net-settlement.*flight-discovery/s, /travel-commerce.*mcp.*operator-gateway.*storage/s, /disable-public-subdomains.*routes-and-custom-domain.*live-probes.*persist-receipt.*enable-release/s, /633355bf-1a52-4085-bd3c-eba4220ff152/, /private-unrouted-secret-free-503-shell/, /requireStableCompleteInventory/, /durable pending bootstrap envelope/, /responseLossAdoptable: id => !\['project-environment-packet', 'live-probes'\]/, /atomicWrite/ ])
  const runBodies = [...bootstrapWorkflow.matchAll(/\n\s{8}run: \|\n((?:\s{10}.*(?:\n|$))*)/g)].map(match => match[1]).join('\n'); assert.doesNotMatch(runBodies, /\$\{\{\s*inputs\.(?:source_sha|mode|plan_run_id|resume_run_id|exact_authorization)\s*\}\}/); assert.doesNotMatch(bootstrapWorkflow.slice(0, bootstrapWorkflow.indexOf('name: Bind protected main and private packet')), /secrets\./); assertNoneMatch(`${bootstrapWorkflow}\n${releaseWorkflow}`, [/secrets\.KNOWGRPH_(?:AGENT_RUNTIME_BEARER_TOKEN|STORAGE_SIGNING_SECRET)/, /vars\.(?:MARKETPLACE_SERVICE|TRAVEL_(?:COMMERCE_SERVICE|EXPERIENCE_DISCOVERY_SERVICE|FLIGHT_DISCOVERY_SERVICE|MCP_SERVICE|MESH_PROBE_SPEC_JSON|NET_SETTLEMENT_SERVICE|OPERATOR_GATEWAY_SERVICE|OVERFLOW_SERVICE|SETTLEMENT_EXECUTOR_SERVICE|STORAGE_SERVICE))/]); assertNoneMatch(bootstrapWorkflow, [/environment: production\n    env:/, /TRAVEL_MESH_BOOTSTRAP_PLAN_JSON/, /push:/, /pull_request:/, /schedule:/, /repository_dispatch:/]); const deployJob = workflowJob('deploy'); assertInOrder(deployJob, [ 'name: Require completed travel mesh bootstrap before Pages', 'name: Preflight protected travel mesh without mutation', 'name: Deploy verified artifact' ]); assertIncludes(workflowStep(deployJob, 'Require completed travel mesh bootstrap before Pages'), [ 'test "$TRAVEL_MESH_RELEASE_ENABLED" = true', 'node ./scripts/travel-mesh-bootstrap.mjs verify' ]); assertExcludes(deployJob, ["if: vars.TRAVEL_MESH_RELEASE_ENABLED == 'true'", "steps.deploy_travel_mesh.outcome == 'skipped'"])
})
test('transport capture normalizes provider timestamps with extra fractional precision', () => {
  assert.equal(normalizeTransportInstant('2026-08-13T22:52:36.924975Z', 'Pages deployment completion'), '2026-08-13T22:52:36.924Z')
})
test('production release bounds transient artifacts and durably retains typed lifecycle receipts', () => {
  const retentionDays = [...releaseWorkflow.matchAll(/retention-days:\s*(\d+)/g)]
    .map(([, days]) => Number(days))
  assert.deepEqual(retentionDays, [1, 1, 90, 1, 90, 90, 90, 90])
  assertAllMatch(releaseWorkflow, [/name: ['"]?production-\$\{\{ inputs\.source_sha \}\}/])
  for (const name of ['immutable-release-manifest', 'production-authorization', 'production-lifecycle', 'production-lifecycle-complete', 'production-release-evidence', 'production-lifecycle-rolled-back', 'production-release-raw']) {
    assert.match(releaseWorkflow, new RegExp(`name: ['"]?${name}-\\$\\{\\{ inputs\\.source_sha \\}\\}`))
  }
})
test('production release records the terminal interaction, protected-environment human, and lifecycle carrier', () => {
  assertAllMatch(releaseWorkflow, [ /permissions:\s*\n\s*actions: read\s*\n\s*contents: read/, /actions\/runs\/\$\{\{ github\.run_id \}\}\/approvals/, /name: Create neutral release lifecycle receipts/, /name: Record exact human authorization and claim release controller/, /name: Record live verification receipt/, /name: Record publication receipt/, /PRODUCTION_LIFECYCLE_CANDIDATE_DIGEST/,
    /--release-candidate "\$RUNNER_TEMP\/production-authorization\/production-release-candidate\.json"/, /--local-review "\$RUNNER_TEMP\/production-authorization\/local-review-candidate\.json"/, ])
  assertAllMatch(productionLifecycleScript, [ /production-release-lifecycle-contract\.mjs/, /contracts\/production-release-lifecycle\.v1\.schema\.json/, /contracts\/production-release-lifecycle\.v2\.schema\.json/, /production release requires exactly one authenticated human approval/, /protected environment authorization drifted from the prepared candidate digest/, ])
  assertNoneMatch(productionLifecycleScript, [ /scripts\/collaborative-release-lifecycle-contract\.mjs/,
    /docs\/schemas\/collaborative-release-lifecycle\.v[12]\.schema\.json/, ])
  assert.equal(packageScripts['production:authorize'], 'node ./scripts/production-terminal-authorization.mjs'); assert.match(packageScripts['test:publish-sync:contract'], /scripts\/__tests__\/production-release-lifecycle-contract\.test\.mjs/)
  assertAllMatch(productionTerminalAuthorizationScript, [ /requires an interactive terminal/, /createProductionAuthorizationPrompt/, /formatProductionAuthorizationPrompt/, /prepareAuthorizationPromptInteraction/,
    /finalizeAuthorizationPromptInteraction/, /extractAuthorizationReplyFromPromptText/, /canonical main drifted during the authorization prompt/, /readAuthorizationRuntime/,
    /local-runtime-lib\.mjs/, /lifecycleCandidateDigest/, /current_user_can_approve === true/, /pending_deployments/, ])
  assertNoneMatch(productionTerminalAuthorizationScript, [/runtime:local:status/, /execFileSync\(['"]open|gh\s+browse/])
  for (const receipt of [
    'overlap-preservation-receipt.json',
    'overlap-disposition-receipt.json',
    'integration-receipt.json',
    'runtime-review-receipt.json',
    'candidate-manifest.json',
    'authorization-interaction-receipt.json',
    'human-authorization-receipt.json',
    'deployment-receipt.json',
    'state-reconciliation-receipt.json',
    'live-verification-receipt-v2.json',
    'publication-receipt-v2.json',
    'collaborative-release-lifecycle-v2.json',
  ]) {
    assert.match(`${productionLifecycleScript}\n${releaseWorkflow}`, new RegExp(receipt.replace('.', '\\.')))
  }
})
test('release evidence and last-known-good rollback identity are bound before production mutation', () => {
  const verifyJob = workflowJob('verify')
  const deployJob = workflowJob('deploy')
  assertInOrder(verifyJob, ['name: Materialize and verify release evidence', 'release:lifecycle:receipts -- create'])
  assertInOrder(deployJob, [ 'name: Capture current production rollback target', 'name: Revalidate last-known-good rollback identity', 'name: Enforce sole deployment ownership', 'name: Deploy verified artifact', ])
  assertIncludes(verifyJob, [ 'agenticgraph-production-release-evidence/v1', '--release-evidence "$RUNNER_TEMP/release-evidence.json"', '--integrated-at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"', ])
  assertNoneMatch(verifyJob, [/git show[^\n]*(?:%cI|%ct)/])
  assertIncludes(productionReleaseTransportScript, [ 'deploymentCommitRevision: pages.deploymentCommitRevision', 'sourceRevision: pages.sourceRevision',
    "schema: 'agenticgraph-production-rollback-recapture/v1'", 'assert.deepEqual(rollbackIdentity, releaseEvidence.rollbackIdentity', 'assert.equal(identityDigest, releaseEvidence.rollbackTargetDigest', ])
  assertIncludes(deployJob, [ 'git -C ../huijoohwee ls-remote origin refs/heads/main', 'fromJSON(inputs.release_evidence).rollbackIdentity.pages.sourceRevision', ])
  assertExcludes(workflowStep(deployJob, 'Checkout rollback AgenticGraph source'), [ 'rollbackIdentity.pages.deploymentCommitRevision', ])
})
test('production evidence wiring records exact Pages, D1, transport, browser, and cache observations', () => {
  const deployJob = workflowJob('deploy')
  assertIncludes(deployJob, [ "WRANGLER_OUTPUT_FILE_PATH: '${{ runner.temp }}/wrangler-pages-deploy.ndjson'", '--deployment-capture "$RUNNER_TEMP/candidate-pages-deployment.json"',
    '--previous-deployment "$RUNNER_TEMP/previous-production-rollback-recapture.json"', 'predeploy-d1-state-evidence.json', '--evidence-output "$RUNNER_TEMP/d1-reconciliation-evidence.json"',
    '.reconciledAt "$RUNNER_TEMP/d1-reconciliation-evidence.json"', '--carrier "$RUNNER_TEMP/production-lifecycle/collaborative-release-lifecycle-v2.json"', ])
  assertIncludes(`${deployJob}\n${productionReleaseTransportScript}`, [ 'previous-pages-observation.json', 'previous-d1-state-evidence.json', 'previous-production-rollback-recapture.json',
    'previous-production-rollback-digest.txt', 'immutable-origin-smoke.log', 'stable-pages-smoke.log', 'public-route-smoke.log', 'production-fidelity-evidence.json', 'production-sw-convergence-evidence.json',
    'production-transport-evidence.json', ])
  assertIncludes(productionReleaseTransportScript, [ '`${prefix}-pages-deployment-api.json`', '`${prefix}-pages-runtime-readiness.json`', ])
  assertInOrder(deployJob, [ 'name: Record exact Pages deployment receipt', 'name: Upload and activate exact-candidate travel mesh versions', 'name: Reconcile canonical docs into D1', 'name: Record direct D1 state reconciliation receipt',
    'name: Verify live runtime', 'name: Verify immutable and public production transports', 'name: Record live verification receipt', 'name: Record publication receipt', 'name: Seal and validate terminal lifecycle carrier', ])
})
test('production rollback is authoritative, pre-publication only, and emits a terminal carrier', () => {
  const deployJob = workflowJob('deploy')
  assertInOrder(deployJob, [ 'name: Deploy verified artifact', 'name: Capture authoritative candidate deployment', 'name: Record exact Pages deployment receipt', 'name: Determine pre-publication rollback eligibility',
    'name: Checkout rollback AgenticGraph source', 'name: Install rollback dependencies', 'name: Resolve rollback docs dependency', 'name: Checkout rollback Agentic Canvas OS docs',
    'name: Roll back Pages to exact last-known-good deployment', 'name: Restore and reconcile last-known-good D1 state', 'name: Capture authoritative restored Pages deployment',
    'name: Verify restored immutable Pages runtime', 'name: Verify restored stable Pages runtime', 'name: Verify restored public custom-domain runtime', 'name: Record restored production transport evidence',
    'name: Seal and validate rolled-back lifecycle carrier', ])
  assertAllMatch(deployJob, [ /id: deploy_pages\s*\n\s*continue-on-error: true/, /name: Persist raw production release observations\s*\n\s*if: always\(\)/, ])
  assertIncludes(deployJob, [ 'id: deployment_authority', "steps.deployment_authority.outputs.mutation_proven == 'true'", "steps.publish_mirror.outputs.publication_committed != 'true'", 'publication_attempted=true',
    "steps.publish_mirror.outputs.publication_attempted != 'true'", "steps.checkout_rollback_source.outcome == 'success'", "steps.install_rollback_dependencies.outcome == 'success'",
    "steps.rollback_docs.outcome == 'success'", "steps.checkout_rollback_docs.outcome == 'success'", "steps.rollback_pages.outcome == 'success'", "steps.rollback_state.outcome == 'success'",
    "steps.restored_pages.outcome == 'success'", "steps.restored_immutable_smoke.outcome == 'success'", "steps.restored_stable_smoke.outcome == 'success'", "steps.restored_public_smoke.outcome == 'success'",
    "steps.restored_transports.outcome == 'success'", '--failure-observation "$RUNNER_TEMP/release-failure-observation.json"',
    '--restored-pages "$RUNNER_TEMP/restored-pages-evidence.json"', '--restored-state "$RUNNER_TEMP/restored-d1-state-evidence.json"', '--restored-transports "$RUNNER_TEMP/restored-transport-evidence.json"',
    '--observed-mirror "$RUNNER_TEMP/observed-mirror-identity.json"', '--completion rolled-back', 'collaborative-release-lifecycle-rollback-v2.json', ])
  const eligibility = releaseWorkflow.slice(
    releaseWorkflow.indexOf('name: Determine pre-publication rollback eligibility'),
    releaseWorkflow.indexOf('name: Preserve deployed state after publication boundary'),
  )
  assertExcludes(eligibility, ["steps.deploy_pages.outcome == 'success'"])
  assertAllMatch(productionReleaseTransportScript, [ /schema: 'agenticgraph-pages-deployment-capture\/v1', status: 'deployed', adapterId: PAGES_API_ADAPTER/, /schema: 'agenticgraph-production-release-failure-observation\/v1'/,
    /deployment\|state-reconciliation\|live-verification\|publication\|receipt-persistence/, /schema: 'agenticgraph-production-restored-pages-evidence\/v1', status: 'restored', adapterId: PAGES_API_ADAPTER/,
    /schema: 'agenticgraph-production-observed-mirror-identity\/v1'/, ])
})
test('Pages candidate attribution rejects concurrent same-SHA and mismatched Wrangler deployments', () => {
  const sourceRevision = 'a'.repeat(40)
  const deploymentId = 'candidate-deployment'
  const runIdentity = 'github-actions:huijoohwee/agentic-graph:123:2:pages'
  const attempt = {
    schema: 'agenticgraph-pages-deployment-attempt/v1', status: 'attempt-started',
    previousDeploymentId: 'previous-deployment', runIdentity, sourceRevision,
    startedAt: '2026-08-13T01:00:00.000Z',
  }
  const identity = {
    deploymentId, deploymentOrigin: 'https://candidate.pages.dev',
    deploymentCommitRevision: sourceRevision, sourceRevision,
    deployedAt: '2026-08-13T01:00:01.000Z',
  }
  const wranglerBytes = Buffer.from([
    JSON.stringify({ type: 'pages-deploy', version: 1, deployment_id: deploymentId }),
    JSON.stringify({ type: 'pages-deploy-detailed', version: 1, deployment_id: deploymentId }),
  ].join('\n'))
  assert.equal(assertCandidatePagesAttribution({ identity, deploymentRunIdentity: runIdentity, attempt, wranglerBytes }), identity)
  assert.throws(
    () => assertCandidatePagesAttribution({ identity, deploymentRunIdentity: 'manual same-SHA deploy', attempt, wranglerBytes }),
    /not owned by this run/,
  )
  assert.throws(
    () => assertCandidatePagesAttribution({
      identity, deploymentRunIdentity: runIdentity, attempt,
      wranglerBytes: Buffer.from(JSON.stringify({ type: 'pages-deploy', version: 1, deployment_id: 'racing-deployment' })),
    }),
    /differs from Wrangler output/,
  )
  assert.throws(
    () => assertCandidatePagesAttribution({
      identity: { ...identity, deployedAt: attempt.startedAt }, deploymentRunIdentity: runIdentity, attempt, wranglerBytes,
    }),
    /must complete after attempt start/,
  )
  assert.equal(assertCandidatePagesAttribution({
    identity, deploymentRunIdentity: runIdentity, attempt,
    wranglerBytes: Buffer.from('{"type":"pages-deploy"'),
  }), identity, 'truncated Wrangler output may fall back only to the exact provider run marker')
})
test('Pages capture failure preserves a typed mutation-possible reconciliation boundary', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const deployStep = deployJob.slice(
    deployJob.indexOf('name: Deploy verified artifact'),
    deployJob.indexOf('name: Capture authoritative candidate deployment'),
  )
  const attemptIndex = deployStep.indexOf('verify-production-release-transports.mjs attempt')
  const wranglerIndex = deployStep.indexOf('wrangler pages deploy')
  assert.ok(attemptIndex >= 0 && wranglerIndex > attemptIndex)
  assert.match(deployStep.slice(attemptIndex, wranglerIndex), /attempted=true mutation_possible=true/)
  assert.match(deployStep, /--commit-message="\$pages_attempt_identity"/)
  assert.match(deployJob, /--attempt "\$RUNNER_TEMP\/pages-deployment-attempt\.json"/)
  assert.match(deployJob, /--wrangler-output "\$RUNNER_TEMP\/wrangler-pages-deploy\.ndjson"/)
  assert.match(deployJob, /--reconciliation-output "\$RUNNER_TEMP\/pages-mutation-reconciliation\.json"/)
  assert.match(deployJob, /steps\.deployment_authority\.outputs\.mutation_proven == 'true'/)
  assert.match(deployJob, /steps\.deploy_pages\.outputs\.mutation_possible == 'true'/)
  assert.match(productionReleaseTransportScript, /agenticgraph-pages-mutation-reconciliation\/v1/)
  assert.match(productionReleaseTransportScript, /status: 'preserve-required'/)
  assert.match(productionReleaseTransportScript, /mutationPossible: true, mutationProven: false/)
})
test('transport evidence keeps immutable, stable Pages, and public routes distinct with apex/app marker parity', () => {
  const sourceRevision = 'a'.repeat(40)
  const manifestDigest = 'b'.repeat(64)
  const markerBytesDigest = digestBytes('marker-bytes')
  const marker = {
    bodyDigest: markerBytesDigest,
    sourceRevision,
    agenticCanvasOsRevision: 'c'.repeat(40),
    catalogRevision: 'c'.repeat(40),
    artifactDigest: 'd'.repeat(64),
    immutableManifestDigest: manifestDigest,
  }
  const transports = ['immutable', 'stable-pages', 'public'].map((id, index) => ({
    id,
    origin: `https://${id}-${index}.example.com`,
    smoke: { evidenceDigest: 'e'.repeat(64), checkCount: 3 },
    markers: { apex: { ...marker }, app: { ...marker } },
    routes: {
      apex: { routeOwner: 'root-agent-ready-pages', status: 200 },
      app: { routeOwner: 'agenticgraph-agent-ready-pages', status: 200 },
    },
  }))
  const evidence = {
    schema: 'agenticgraph-production-transport-evidence/v1',
    status: 'passed',
    sourceRevision,
    immutableManifestDigest: manifestDigest,
    markerBytesParity: true,
    markerBytesDigest,
    transports,
  }
  assert.equal(validateTransportEvidence({ evidence, sourceRevision, manifestDigest }), evidence)
  const markerMismatch = structuredClone(evidence)
  markerMismatch.transports[1].markers.app.bodyDigest = 'f'.repeat(64)
  assert.throws(
    () => validateTransportEvidence({ evidence: markerMismatch, sourceRevision, manifestDigest }),
    /apex\/app readiness marker bytes differ/,
  )
  const ownerMismatch = structuredClone(evidence)
  ownerMismatch.transports[2].routes.apex.routeOwner = 'agenticgraph-agent-ready-pages'
  assert.throws(
    () => validateTransportEvidence({ evidence: ownerMismatch, sourceRevision, manifestDigest }),
    /apex route owner drifted/,
  )
  assert.match(productionReleaseTransportScript, /\/\.well-known\/runtime-readiness\.json/)
  assert.match(productionReleaseTransportScript, /\/agenticgraph\/\.well-known\/runtime-readiness\.json/)
  assert.match(releaseWorkflow, /Terminal carrier file digest:[^\n]*sha256sum/)
  assert.doesNotMatch(releaseWorkflow, /\.carrierDigest/)
})
test('Agentic Canvas OS docs promote automatically through protected AgenticGraph integration', () => {
  assert.match(promotionWorkflow, /schedule:\s*\n\s*- cron:/)
  assert.doesNotMatch(promotionWorkflow, /workflow_dispatch:/)
  assert.match(promotionWorkflow, /secrets\.HUIJOOHWEE_PUSH_TOKEN/)
  assert.match(promotionWorkflow, /gh pr create --draft/)
  assert.match(promotionWorkflow, /gh pr merge "\$url" --auto --squash/)
})
test('production release reconciles competing Cloudflare Pages Git deployment ownership', () => {
  assert.match(pagesDeploymentScript, /enforce-direct-upload-owner/)
  assert.match(pagesDeploymentScript, /method: 'PATCH'/)
  assert.match(pagesDeploymentScript, /production_deployments_enabled: false/)
  assert.match(pagesDeploymentScript, /preview_deployment_setting: 'none'/)
})
test('verified production mirror is published only after live smoke', () => {
  const verifyJob = workflowJob('verify')
  const deployJob = workflowJob('deploy')
  assertInOrder(deployJob, [ 'name: Prewarm returning-user service worker profile', 'name: Deploy verified artifact', 'name: Capture authoritative candidate deployment', 'name: Verify live runtime',
    'name: Verify exact deployment markers and candidate browser fidelity', 'name: Verify returning-user service worker revision convergence',
    'name: Record live verification receipt', 'name: Publish verified production mirror', 'name: Verify restored immutable Pages runtime', ])
  assertIncludes(workflowStep(deployJob, 'Verify live runtime'), [ 'AGENTICGRAPH_AGENT_READY_BASE_URL: ${{ steps.deployment_authority.outputs.deployment_url }}', ])
  assertIncludes(workflowStep(deployJob, 'Verify restored immutable Pages runtime'), [ 'AGENTICGRAPH_AGENT_READY_BASE_URL: ${{ steps.restored_pages.outputs.deployment_url }}', ])
  assertIncludes(releaseSmoke, [ "require('./config/surface-registry.json')", 'registry.publicOrigin', 'AGENTICGRAPH_AGENT_READY_BASE_URL:-$configured_public_origin', ])
  assertExcludes(releaseSmoke, ['pages.dev'])
  assertIncludes(agentReadySmoke, [ 'const requestOriginUrl = new URL(process.env.AGENTICGRAPH_AGENT_READY_BASE_URL || canonicalBaseUrl).origin', "name: 'root-homepage-app-alias'", "name: 'markdown-negotiation'", ])
  assert.equal(
    (agentReadySmoke.match(/fetch\(toRequestUrl\(/g) || []).length,
    3,
    'every agent-ready request must use the selected transport origin',
  )
  const deployStep = workflowStep(deployJob, 'Deploy verified artifact')
  assertInOrder(deployStep, ['release:main-authority:check', 'wrangler pages deploy'])
  assertIncludes(deployStep, ['--commit-hash="$RELEASE_SHA"'])
  const protectedMutationSteps = [
    ['Enforce sole deployment ownership', 'runtime:pages:owner-enforce'],
    ['Deploy verified artifact', 'wrangler pages deploy'],
    ['Reconcile canonical docs into D1', 'storage:d1:seed:docs'],
    ['Publish verified production mirror', 'gh pr merge "$url" --repo huijoohwee/huijoohwee --squash --delete-branch'],
  ]
  for (const [stepName, mutationCommand] of protectedMutationSteps) {
    const stepSource = workflowStep(deployJob, stepName)
    assertInOrder(stepSource, ['release:main-authority:check', mutationCommand])
    assertIncludes(stepSource, ['release:candidate:authorization -- verify'])
  }
  const publishStep = workflowStep(deployJob, 'Publish verified production mirror')
  assertInOrder(publishStep, [ 'mirror_head_sha="$(git rev-parse HEAD)"', 'git push origin HEAD:"refs/heads/$branch"', 'for attempt in $(seq 1 60); do',
    'gh pr checks "$url" --repo huijoohwee/huijoohwee --required --watch --interval 5', 'npm --prefix ../agenticgraph run --silent release:main-authority:check',
    'gh pr merge "$url" --repo huijoohwee/huijoohwee --squash --delete-branch', ])
  assertIncludes(publishStep, [ 'body_file="$RUNNER_TEMP/production-mirror-pr-body.md"', 'gh pr create --repo huijoohwee/huijoohwee', '--body-file "$body_file"', 'mirror_required_check_count=', 'Runtime Readiness Gate',
    'Mirror PR did not report required check: $mirror_check_name', 'timeout --foreground --kill-after=30s 25m', '--match-head-commit "$mirror_head_sha"', ])
  assertExcludes(publishStep, ['Mirror PR has no reported checks; continuing with release validation.'])
  assertIncludes(deployJob, [ 'PRODUCTION_ORIGIN: ${{ steps.deployment_authority.outputs.deployment_url }}', 'PRODUCTION_MARKER_ORIGIN: ${{ steps.deployment_authority.outputs.deployment_url }}',
    "PRODUCTION_BROWSER_HEADLESS: 'false'", 'xvfb-run --auto-servernum npm run --silent production:fidelity:check',
    'timeout --foreground --kill-after=30s 8m xvfb-run --auto-servernum npm run production:sw-upgrade:prewarm',
    'timeout --foreground --kill-after=30s 12m xvfb-run --auto-servernum npm run --silent production:sw-upgrade:verify', 'PRODUCTION_SW_PROFILE_DIR: ${{ runner.temp }}/agenticgraph-production-sw-profile',
    'PRODUCTION_SW_EVIDENCE_PATH: ${{ runner.temp }}/agenticgraph-production-sw-evidence.json', ])
  assert.equal(
    (
      deployJob.match(
        /PRODUCTION_SW_PROFILE_ORIGIN: ['"]?\$\{\{ steps\.previous\.outputs\.production_origin \}\}/g,
      ) || []
    ).length,
    2,
    'prewarm and verify must share the configured stable Pages production origin',
  )
  assertIncludes(productionServiceWorkerUpgradeScript, [ 'chromium.launchPersistentContext(profileDirectory', 'PRODUCTION_SW_PROFILE_ORIGIN is required',
    'const profileOrigin = normalizeOrigin(profileOriginInput)', 'agenticgraph-production-service-worker-transition/v3', 'assert.equal(evidence.profileOrigin, profileOrigin)', "serviceWorkers: 'allow'",
    'navigator.serviceWorker.getRegistrations()', 'registrations.length !== 1', 'canonicalWorkerScope', 'requireRevisionBoundRegistration: true', "registration.updateViaCache === 'none'",
    "registration.activeState === 'activated'", "registration.installingScriptUrl === ''", "registration.waitingScriptUrl === ''", 'activeAttestedRevision', 'evidence.activeAttestedRevision === expectedRevision',
    'evidence.controllerAttestedRevision === expectedRevision', 'evidence.activeChatRuntimeSchema === CHAT_RUNTIME_SCHEMA',
    'evidence.controllerChatRuntimeSchema === CHAT_RUNTIME_SCHEMA', 'evidence.controllerMatchesActive', 'AG_SERVICE_WORKER_SOURCE_REVISION_REQUEST', 'AG_CHAT_STREAM_RUNTIME_ATTEST_REQUEST',
    'verifyPublishedWorkerSources(expectedRevision)', 'public chat runtime must not retain legacy lifecycle listeners',
    'precacheAssetNamespaces', 'precacheAssetNamespaces[0] === expectedRevision', 'cachedAssetNamespaces', 'cachedAssetNamespaces[0] === expectedRevision', 'cachedHtmlPaths', 'evidence.cachedHtmlPaths.length === 0',
    'preservedSiblingHtmlPaths', 'service worker convergence must preserve sibling application HTML caches', 'precacheHtmlPaths', 'evidence.precacheHtmlPaths.length === 0', 'seedReturningUserCacheProof',
    'evidence.seededCachePaths?.htmlPaths', 'initialNavigationResponse.fromServiceWorker()', 'reloadNavigationResponse.fromServiceWorker()', 'const upgradeObservation = observePageFailures(upgradePage)',
    'upgrade-tab JavaScript module requests returned HTML', 'upgrade-tab browser errors', 'service worker convergence must preserve local-first browser storage', 'production HTTP must remain the sole HTML owner', ])
  assertExcludes(productionServiceWorkerUpgradeScript, [ 'agenticgraph-production-service-worker-upgrade/v1', 'agenticgraph-production-service-worker-upgrade/v2',
    'PRODUCTION_PUBLIC_ORIGIN', 'https://airvio.co', '.unregister(', 'caches.delete', ])
  assertIncludes(productionServiceWorkerRegistrationProof, ['canonicalWorkerScriptUrl'])
  assertIncludes(serviceWorkerReleaseTransitionScript, ['same-revision-recovery', 'revision-upgrade'])
  assertIncludes(serviceWorkerUpgradeCacheProofScript, [ 'service-worker-upgrade-stale-runtime-proof.js', 'kgSwUpgradeStaleHtmlProof', "caches.open('kg-static')",
    'singabldr-pwa:static:20260504-2', '/favicon.ico?kgSwUpgradeStaleHtmlProof=', ])
  assertIncludes(productionFidelityScript, [ 'scriptsOutsideExactReleaseNamespace', 'browserAssetScripts.filter', 'agenticgraph/assets/${expectedSourceRevision}',
    'Physics runtime running with', 'Beach Ball', 'AGENTICGRAPH_WORKSPACE_SEED_INVENTORY', 'waitForWorkspaceSeedInventory',
    'aside[aria-label="Markdown Explorer"]', 'section[aria-label="Source Files"]', "name: 'Workspace View'", "name: 'Editor Workspace'", "openWorkspaceFolder(sourceFilesContent, 'docs')",
    "openWorkspaceFolder(sourceFilesContent, 'workspace-seeds')", 'Explorer Source Files workspace-seeds inventory mismatch',
    'page.frames().filter', "url.searchParams.get('kgPreview') === '1'", 'evidenceByTarget.reduce', 'browserHeadless', 'heavyRuntimeIntents', 'bodyTextTail', "page.locator('body')", 'Validation seed fallback',
    '__kgHomeSourceAuthorityEvidence', 'prematureSceneMounts', 'waitForHomeSourceAuthority', 'documentLoadedRootCount',
    'data-kg-xr-document-loaded', 'data-kg-xr-scene-media-drop', 'data-kg-xr-empty-world', '--use-gl=angle',
    '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', 'Home must retain exactly one canonical XR Canvas',
    'Home must not activate Game Mode before explicit invocation', 'LIVE_CANVAS_HERO_SOURCE_SESSION_KEY', 'conflictingShareToken', 'persisted source conflict must be removed at the Home source owner',
    'stale Home source recovery constructed a fallback XR owner', ])
  assertExcludes(productionFidelityScript, [ "getByRole('region', { name: 'Source Files'", "contentFrame().locator('body')", 'PRODUCTION_PUBLIC_ORIGIN', 'publicOrigin', ])
  assertExcludes(verifyJob, ['HUIJOOHWEE_PUSH_TOKEN'])
  assert.match(publishStep, /gh pr merge "\$url" --repo huijoohwee\/huijoohwee --squash --delete-branch\s+--match-head-commit "\$mirror_head_sha"/)
  assertIncludes(deployJob, [ 'gh pr create --repo huijoohwee/huijoohwee', 'body_file="$RUNNER_TEMP/production-mirror-pr-body.md"',
    "printf '%s\\n'", 'gh pr create --repo huijoohwee/huijoohwee --base main --head "$branch" --title "$title" --body-file "$body_file"',
    'gh pr checks "$url" --repo huijoohwee/huijoohwee --required --watch --interval 5', '--match-head-commit "$mirror_head_sha"', 'git checkout --detach origin/main', 'HUIJOOHWEE_PUSH_TOKEN', ])
})
test('service worker release transition distinguishes upgrade from recovery', () => {
  const previousRevision = '1'.repeat(40)
  const expectedRevision = '2'.repeat(40)
  assert.equal(classifyServiceWorkerReleaseTransition({ previousRevision, expectedRevision }), 'revision-upgrade')
  assert.equal(classifyServiceWorkerReleaseTransition({
    previousRevision: expectedRevision,
    expectedRevision,
  }), 'same-revision-recovery')
  assert.throws(
    () => classifyServiceWorkerReleaseTransition({ previousRevision: 'main', expectedRevision }),
    /previous revision must be an exact source revision/,
  )
})
test('returning-user cache proof forwards the requested stale revision', async () => {
  const staleRevision = '3'.repeat(40)
  const page = {
    evaluate: async (_callback, payload) => payload,
  }
  assert.deepEqual(await seedReturningUserCacheProof(page, staleRevision), {
    revision: staleRevision,
    scope: 'agenticgraph',
  })
  assert.deepEqual(await seedReturningUserCacheProof(page), {
    revision: '',
    scope: 'agenticgraph',
  })
  assert.deepEqual(await seedReturningUserCacheProof(page, staleRevision, 'knowgrph'), {
    revision: staleRevision,
    scope: 'knowgrph',
  })
})
test('deploy dependency bootstrap retries bounded transient registry failures', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  assert.match(deployJob, /bash \.\/scripts\/install-production-release-dependencies\.sh/)
  assertAllMatch(productionReleaseDependencyInstall, [ /for attempt in 1 2 3; do/, /if npm ci; then/,
    /if \[ "\$attempt" -eq 3 \]; then/, /sleep "\$\(\(attempt \* 10\)\)"/, /npx playwright install --with-deps chromium/, ])
})
test('mirror publication waits for its required check to appear before merge', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const publishStep = deployJob.slice(
    deployJob.indexOf('name: Publish verified production mirror'),
    deployJob.indexOf('name: Record publication receipt'),
  )
  const checkNameIndex = publishStep.indexOf('mirror_check_name="Runtime Readiness Gate"')
  const checkDiscoveryIndex = publishStep.indexOf('for attempt in $(seq 1 60); do')
  const checkWatchIndex = publishStep.indexOf('gh pr checks "$url" --repo huijoohwee/huijoohwee --required --watch --interval 5')
  const mergeIndex = publishStep.indexOf('gh pr merge "$url" --repo huijoohwee/huijoohwee --squash --delete-branch')
  assert.ok(checkNameIndex >= 0)
  assert.ok(checkDiscoveryIndex > checkNameIndex)
  assert.match(publishStep, /select\(\.name == "Runtime Readiness Gate"\)/)
  assert.match(publishStep, /Mirror PR did not report required check: \$mirror_check_name/)
  assert.doesNotMatch(publishStep, /Mirror PR has no reported checks; continuing/)
  assert.match(publishStep, /gh pr checks "\$url" --repo huijoohwee\/huijoohwee --required --watch --interval 5/)
  assert.ok(checkWatchIndex > checkDiscoveryIndex)
  assert.ok(mergeIndex > checkWatchIndex)
})
test('generated mirror and rollback are bound to immutable runtime identities', () => {
  assert.match(productionReadinessBuild, /agenticgraph-production-runtime-readiness\/v2/)
  assert.match(pagesSyncScript, /runtimeReadinessPaths/)
  assert.match(productionReadinessBuild, /calculateRuntimeArtifactDigest/)
  assert.match(productionReadinessBuild, /calculateImmutableReleaseManifestDigest/)
  assert.match(pagesSyncScript, /sourceRevision/)
  assert.match(pagesDeploymentScript, /deployment_trigger\?\.metadata\?\.commit_hash/)
  assert.match(pagesDeploymentScript, /capture-candidate/)
  assert.match(pagesDeploymentScript, /deployment_url/)
  assert.match(pagesDeploymentScript, /writeOutput\('production_origin', productionPagesOrigin\)/)
  assert.match(pagesDeploymentScript, /CLOUDFLARE_PAGES_PROJECT must be one lowercase DNS label/)
  assert.match(pagesDeploymentScript, /const pagesHostname = `\$\{projectName\}\.pages\.dev`/)
  assert.match(pagesDeploymentScript, /pages\.dev/)
  assert.match(pagesDeploymentScript, /\/rollback`/)
  assert.doesNotMatch(pagesDeploymentScript, /console\.log\([^\n]*(?:apiToken|CLOUDFLARE_API_TOKEN)/)
})
test('production artifact includes the public app-shell mirror fetched by Pages Functions', () => {
  const artifactStep = releaseWorkflow.slice(
    releaseWorkflow.indexOf('name: Upload verified release artifact'),
    releaseWorkflow.indexOf('\n  deploy:'),
  )
  assert.match(artifactStep, /huijoohwee\/content\/agenticgraph/)
  assert.match(artifactStep, /huijoohwee\/agenticgraph/)
  assert.match(artifactStep, /include-hidden-files: true/)
  assert.match(artifactStep, /\.agenticgraph-production-artifact-manifest\.json/)
})
test('deploy reconciles verified additions and deletions into the exact mirror base', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const downloadIndex = deployJob.indexOf('name: Download verified artifacts')
  const reconcileIndex = deployJob.indexOf('name: Reconcile verified artifact into exact mirror base')
  const deployIndex = deployJob.indexOf('name: Deploy verified artifact')
  assert.match(releaseWorkflow, /mirror_revision: ['"]?\$\{\{ steps\.mirror_revision\.outputs\.revision \}\}/)
  assert.match(deployJob, /ref: ['"]?\$\{\{ needs\.verify\.outputs\.mirror_revision \}\}/)
  assert.match(deployJob, /path: ['"]?\$\{\{ runner\.temp \}\}\/production-mirror-artifact/)
  assert.match(deployJob, /production:mirror-artifact:reconcile/)
  assert.ok(downloadIndex >= 0)
  assert.ok(reconcileIndex > downloadIndex)
  assert.ok(deployIndex > reconcileIndex)
  assert.match(productionMirrorArtifactScript, /deletedPaths/)
  assert.match(productionMirrorArtifactScript, /Production artifact cannot delete unmanaged path/)
  assert.match(productionMirrorArtifactScript, /readiness markers must be byte-identical/)
})
test('production release reconciles the exact canonical docs revision before live smoke', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const checkoutIndex = deployJob.indexOf('Checkout exact Agentic Canvas OS docs SSOT')
  const seedIndex = deployJob.indexOf('Reconcile canonical docs into D1')
  const smokeIndex = deployJob.indexOf('Verify live runtime')
  assert.match(deployJob, /AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT: ['"]?\$\{\{ github\.workspace \}\}\/agentic-canvas-os\/docs/)
  assert.match(releaseWorkflow, /docs_repository: ['"]?\$\{\{ steps\.agentic_canvas_os_docs\.outputs\.repository \}\}/)
  assert.match(deployJob, /repository: ['"]?\$\{\{ needs\.verify\.outputs\.docs_repository \}\}/)
  assert.match(deployJob, /ref: ['"]?\$\{\{ needs\.verify\.outputs\.docs_revision \}\}/)
  assert.match(
    deployJob,
    /name: Reconcile canonical docs into D1[\s\S]*npm run storage:d1:seed:docs/,
  )
  assert.ok(checkoutIndex >= 0, 'expected the deploy job to checkout the pinned canonical docs revision')
  assert.ok(seedIndex > checkoutIndex, 'expected D1 reconciliation after the pinned docs checkout')
  assert.ok(smokeIndex > seedIndex, 'expected live smoke after D1 reconciliation')
})
test('agent-ready smoke probes the current canonical docs corpus', () => {
  assert.match(agentReadySmoke, /'agentic-canvas-os',\s+'docs',\s+'AGENTS\.md'/m)
  assert.match(agentReadySmoke, /const contentAwareSearchQuery = 'revision-fence'/)
  assert.match(agentReadySmoke, /String\(entry\?\.canonicalPath \|\| ''\) === 'agentic-canvas-os\/docs\/AGENT-DEFINITIONS\.md'/)
  assert.doesNotMatch(agentReadySmoke, /agenticgraph-modularity-prd-tad\.md/)
  assert.doesNotMatch(agentReadySmoke, /agenticgraph-strybldr-starter-template/)
})
test('canonical docs reconciliation uses the lockfile Wrangler version', () => {
  assert.match(docsSeedScript, /'--no-install',\s+'wrangler',\s+'d1'/m)
  assert.doesNotMatch(docsSeedScript, /wrangler@latest/)
})
test('canonical docs reconciliation proves stored content and exact chunk parity', () => {
  const directSeedIndex = docsSeedScript.indexOf('if (shouldUseDirectD1ControlPlane)')
  const publicExportIndex = docsSeedScript.indexOf("console.log('[agenticgraph] export start: before-seed')")
  const directSeedFunction = docsSeedScript.slice(
    docsSeedScript.indexOf('const seedDocumentsDirectlyToD1'),
    docsSeedScript.indexOf('const run = async'),
  )
  assert.match(docsSeedScript, /expectedDocumentSeeds: documentSeeds/)
  assert.match(docsSeedScript, /exportedDocumentChunks: exported\.documentChunks/)
  assert.match(docsSeedScript, /exportWorkspaceDirectlyFromD1/)
  assert.match(docsSeedScript, /graph-snapshots-readback/)
  assert.match(docsSeedScript, /assertNoD1GraphSnapshots\(exported\.graphSnapshots\)/)
  assert.match(docsSeedScript, /buildDirectD1ReconciliationStatements/)
  assert.match(docsSeedScript, /'--command',[\s\S]*'--json'/)
  assert.match(docsSeedScript, /maxBuffer: 64 \* 1024 \* 1024/)
  assert.match(docsSeedScript, /const shouldUseDirectD1ControlPlane = isCanonicalProductionOrigin/)
  assert.match(docsSeedScript, /WHERE workspace_id = .*\n.*AND deleted = 0/)
  assert.match(docsSeedScript, /content-parity=passed/)
  assert.match(docsSeedScript, /snapshots=\$\{snapshotParity\.graphSnapshotCount\}/)
  assert.doesNotMatch(docsSeedScript, /joohwee\.pages\.dev/)
  assert.match(docsSeedLibrary, /documents\.revision >= excluded\.revision/)
  assert.match(docsSeedLibrary, /authoritativeUpdatedAtMs/)
  assert.match(docsSeedLibrary, /DELETE FROM graph_snapshots/)
  assert.match(docsSeedLibrary, /canonical_path NOT IN/)
  assert.match(docsSeedLibrary, /document_id NOT IN/)
  assert.equal(
    (directSeedFunction.match(/executeD1SqlFile\(/g) || []).length,
    1,
    'expected one rollback-safe D1 import for the complete authoritative corpus',
  )
  assert.match(directSeedFunction, /authoritative-corpus-reconciliation/)
  assert.ok(directSeedIndex >= 0, 'expected a direct D1 production branch')
  assert.ok(publicExportIndex > directSeedIndex, 'expected direct production reconciliation before any public storage export')
})
