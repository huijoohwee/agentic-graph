import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { assertRemoteRevisionAuthority } from '../immutable-release-manifest.mjs'
import { classifyServiceWorkerReleaseTransition } from '../service-worker-release-transition.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const integrationWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'integration.yml'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8')
const releaseSmoke = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'smoke-test.sh'), 'utf8')
const promotionWorkflow = fs.readFileSync(path.resolve(repoRoot, '.github', 'workflows', 'promote-agentic-canvas-os.yml'), 'utf8')
const agentReadySmoke = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'check-agent-ready.mjs'), 'utf8')
const docsSeedScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'seed-storage-docs-to-cloudflare.mjs'), 'utf8')
const docsSeedLibrary = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'lib', 'seed-storage-documents-d1.mjs'), 'utf8')
const pagesSyncScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'sync-pages-knowgrph.mjs'), 'utf8')
const pagesFunctionsBuildScript = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'build-pages-functions-worker.mjs'), 'utf8')
const agentReadyFunction = fs.readFileSync(path.resolve(repoRoot, 'cloudflare', 'pages', 'knowgrph-agent-ready.mjs'), 'utf8')
const agentReadyToolContract = fs.readFileSync(path.resolve(repoRoot, 'canvas', 'src', 'features', 'agent-ready', 'knowgrphAgentReadyToolContract.mjs'), 'utf8')
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
const packageScripts = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8')).scripts

test('integration isolates protected merge and main checks by exact revision', () => {
  assert.match(
    integrationWorkflow,
    /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/,
  )
  assert.match(
    integrationWorkflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
  )
  assert.doesNotMatch(integrationWorkflow, /group: integration-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/)
  assert.doesNotMatch(integrationWorkflow, /cancel-in-progress: true/)
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
  assert.match(protectedMainAuthorityScript, /remote = 'origin'/)
  assert.match(protectedMainAuthorityScript, /readRemoteRevision\(\{\s*remote,\s*targetRef: PROTECTED_MAIN_REF,\s*cwd,/)
  assert.match(protectedMainAuthorityScript, /assertRemoteRevisionAuthority\(\{/)
  assert.doesNotMatch(protectedMainAuthorityScript, /SHA_PATTERN|ZERO_SHA|requireRevision/)
  assert.equal(
    packageScripts['release:main-authority:check'],
    'node ./scripts/assert-protected-main-release-authority.mjs',
  )
})

test('integration forbids alternate standalone Game Mode and XR Physics source owners', () => {
  assert.equal(packageScripts['game-mode:source-authority'], 'node ./scripts/check-game-fps-readiness.mjs')
  assert.match(packageScripts['conflict:source'], /^npm run game-mode:source-authority && /)
  assert.match(gameModeSourceAuthorityScript, /authorityExecutableRoots/)
  assert.match(gameModeSourceAuthorityScript, /deletedStandaloneMarkers/)
  assert.match(gameModeSourceAuthorityScript, /workspaceSeedPaths/)
  assert.match(gameModeSourceAuthorityScript, /declaresStandaloneXrWorld/)
  assert.match(gameModeSourceAuthorityScript, /gameAwareThreeOwners/)
  assert.match(gameModeSourceAuthorityScript, /xrPhysicsThreeOwners/)
  assert.match(gameModeSourceAuthorityScript, /__pbt__\|__tests__\|fixtures\|test\|tests/)
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
  const verifyJob = releaseWorkflow.slice(
    releaseWorkflow.indexOf('\n  verify:'),
    releaseWorkflow.indexOf('\n  deploy:'),
  )

  assert.match(verifyJob, /name: Build and sync verified candidate/)
  assert.match(verifyJob, /KNOWGRPH_SOURCE_REVISION: \$\{\{ inputs\.source_sha \}\}/)
  assert.match(verifyJob, /VITE_KNOWGRPH_STORAGE_BASE_URL: https:\/\/airvio\.co/)
  assert.match(verifyJob, /run: npm run pages:build-sync/)
  assert.match(verifyJob, /name: Materialize and verify localhost review candidate/)
  assert.match(verifyJob, /name: Bind immutable production candidate/)
  assert.match(verifyJob, /name: Upload production authorization evidence/)
  assert.doesNotMatch(verifyJob, /run: npm run pages:sync/)
})

test('Pages mirror sync preserves the agent-ready route and tool module closure', () => {
  const localModuleImports = [...new Set(
    [agentReadyFunction, agentReadyToolContract]
      .flatMap(source => [...source.matchAll(/from ["'](\.\.?\/[^"']+)["']/g)])
      .map(([, modulePath]) => path.posix.basename(modulePath)),
  )]

  assert.ok(localModuleImports.length > 0)
  assert.match(pagesSyncScript, /collectLocalModuleClosureCopies/)
  assert.match(pagesSyncScript, /localModuleSpecifiers/)
  assert.match(pagesSyncScript, /path\.relative\(knowgrphRoot, sourcePath\)/)
  assert.match(pagesSyncScript, /collectLocalModuleClosureCopies\(\[agentReadyToolContractSource\]\)/)
  assert.match(pagesFunctionsBuildScript, /process\.env\.KNOWGRPH_PUBLISH_REPOSITORY_ROOT/)
})

test('apex Home has one canonical shell and a real Pages not-found boundary', () => {
  assert.doesNotMatch(rootAgentReadyFunction, /rootHtmlResponse|rootNoscriptFallbackMarkup|loadWebMcpScript/)
  assert.doesNotMatch(rootAgentReadyFunction, /data-kg-live-canvas-launch|<iframe class="live-canvas"/)
  assert.match(rootAgentReadyFunction, /throw new Error\("canonical Knowgrph app shell is invalid"\)/)
  assert.match(productionFidelityScript, /missing assets must not resolve through the apex Home app shell/)
  assert.match(productionFidelityScript, /missingResponse\.status, 404/)
  assert.match(productionFidelityScript, /'\/index\.html'/)
  assert.match(productionFidelityScript, /'\/hackamap\/'/)
  assert.match(productionFidelityScript, /the Pages 404 boundary must preserve the sibling Singabldr app/)
  assert.match(productionFidelityScript, /\/singabldr\/manifest\.webmanifest/)
  assert.match(productionFidelityScript, /\/singabldr\/sw\.js/)
  assert.match(productionMirrorArtifactScript, /'404\.html'/)
  assert.match(productionMirrorArtifactScript, /productionMirrorArtifactDeletionEntries = \['index\.html'\]/)
  assert.match(releaseWorkflow, /huijoohwee\/404\.html/)
})

test('production release requires an exact reviewed candidate, human environment gate, and retains rollback evidence', () => {
  assert.match(releaseWorkflow, /on:\s*\n\s*workflow_dispatch:/)
  assert.match(releaseWorkflow, /concurrency:\s*\n\s*group: production-release\s*\n\s*cancel-in-progress: false/)
  assert.doesNotMatch(releaseWorkflow, /\n\s*push:/)
  assert.match(releaseWorkflow, /source_sha:/)
  assert.match(releaseWorkflow, /local_review_candidate:/)
  assert.match(releaseWorkflow, /environment:\s*\n\s*name: production/)
  assert.match(releaseWorkflow, /PRODUCTION_CANDIDATE_DIGEST: \$\{\{ needs\.verify\.outputs\.candidate_digest \}\}/)
  assert.match(productionAuthorizationScript, /agentic-local-review-candidate\/v1/)
  assert.match(productionAuthorizationScript, /agentic-production-release-candidate\/v1/)
  assert.match(releaseWorkflow, /name: Enforce sole deployment ownership/)
  assert.match(releaseWorkflow, /runtime:pages:owner-enforce/)
  assert.match(releaseWorkflow, /name: Capture current production rollback target/)
  assert.match(releaseWorkflow, /runtime:pages:capture-current/)
  assert.match(releaseWorkflow, /name: Capture exact candidate deployment origin/)
  assert.match(releaseWorkflow, /runtime:pages:capture-candidate/)
  assert.match(releaseWorkflow, /runtime:pages:rollback/)
  assert.match(releaseWorkflow, /if: failure\(\) && steps\.deploy_pages\.outcome == 'success'/)
})

test('production release bounds transient artifacts and durably retains typed lifecycle receipts', () => {
  const retentionDays = [...releaseWorkflow.matchAll(/retention-days:\s*(\d+)/g)]
    .map(([, days]) => Number(days))
  assert.deepEqual(retentionDays, [1, 1, 90, 1, 90])
  assert.match(releaseWorkflow, /name: production-\$\{\{ inputs\.source_sha \}\}/)
  assert.match(releaseWorkflow, /name: immutable-release-manifest-\$\{\{ inputs\.source_sha \}\}/)
  assert.match(releaseWorkflow, /name: production-authorization-\$\{\{ inputs\.source_sha \}\}/)
  assert.match(releaseWorkflow, /name: production-lifecycle-\$\{\{ inputs\.source_sha \}\}-\$\{\{ github\.run_id \}\}/)
  assert.match(releaseWorkflow, /name: production-lifecycle-complete-\$\{\{ inputs\.source_sha \}\}-\$\{\{ github\.run_id \}\}/)
})

test('production release records the exact terminal interaction, protected-environment human, and nine neutral receipts', () => {
  assert.match(releaseWorkflow, /permissions:\s*\n\s*actions: read\s*\n\s*contents: read/)
  assert.match(releaseWorkflow, /actions\/runs\/\$\{\{ github\.run_id \}\}\/approvals/)
  assert.match(releaseWorkflow, /name: Create neutral release lifecycle receipts/)
  assert.match(releaseWorkflow, /name: Record exact human authorization and claim release controller/)
  assert.match(releaseWorkflow, /name: Record live verification receipt/)
  assert.match(releaseWorkflow, /name: Record publication receipt/)
  assert.match(releaseWorkflow, /PRODUCTION_LIFECYCLE_CANDIDATE_DIGEST/)
  assert.match(productionLifecycleScript, /collaborative-release-lifecycle-contract\.mjs/)
  assert.match(productionLifecycleScript, /production release requires exactly one authenticated human approval/)
  assert.match(productionLifecycleScript, /protected environment authorization drifted from the prepared candidate digest/)
  assert.equal(packageScripts['production:authorize'], 'node ./scripts/production-terminal-authorization.mjs')
  assert.match(productionTerminalAuthorizationScript, /requires an interactive terminal/)
  assert.match(productionTerminalAuthorizationScript, /createProductionAuthorizationPrompt/)
  assert.match(productionTerminalAuthorizationScript, /formatProductionAuthorizationPrompt/)
  assert.match(productionTerminalAuthorizationScript, /prepareAuthorizationPromptInteraction/)
  assert.match(productionTerminalAuthorizationScript, /finalizeAuthorizationPromptInteraction/)
  assert.match(productionTerminalAuthorizationScript, /extractAuthorizationReplyFromPromptText/)
  assert.match(productionTerminalAuthorizationScript, /canonical main drifted during the authorization prompt/)
  assert.match(productionTerminalAuthorizationScript, /readAuthorizationRuntime/)
  assert.match(productionTerminalAuthorizationScript, /local-runtime-lib\.mjs/)
  assert.doesNotMatch(productionTerminalAuthorizationScript, /runtime:local:status/)
  assert.match(productionTerminalAuthorizationScript, /lifecycleCandidateDigest/)
  assert.match(productionTerminalAuthorizationScript, /current_user_can_approve === true/)
  assert.match(productionTerminalAuthorizationScript, /pending_deployments/)
  assert.match(releaseWorkflow, /--release-candidate "\$RUNNER_TEMP\/production-authorization\/production-release-candidate\.json"/)
  assert.match(releaseWorkflow, /--local-review "\$RUNNER_TEMP\/production-authorization\/local-review-candidate\.json"/)
  assert.doesNotMatch(productionTerminalAuthorizationScript, /execFileSync\(['"]open|gh\s+browse/)
  for (const receipt of [
    'overlap-preservation-receipt.json',
    'overlap-disposition-receipt.json',
    'integration-receipt.json',
    'runtime-review-receipt.json',
    'candidate-manifest.json',
    'authorization-interaction-receipt.json',
    'human-authorization-receipt.json',
    'live-verification-receipt.json',
    'publication-receipt.json',
  ]) {
    assert.match(productionLifecycleScript, new RegExp(receipt.replace('.', '\\.')))
  }
})

test('Agentic Canvas OS docs promote automatically through protected Knowgrph integration', () => {
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
  const verifyJob = releaseWorkflow.slice(
    releaseWorkflow.indexOf('\n  verify:'),
    releaseWorkflow.indexOf('\n  deploy:'),
  )
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const deployIndex = deployJob.indexOf('name: Deploy verified artifact')
  const prewarmIndex = deployJob.indexOf('name: Prewarm returning-user service worker profile')
  const smokeIndex = deployJob.indexOf('name: Verify live runtime')
  const candidateIndex = deployJob.indexOf('name: Capture exact candidate deployment origin')
  const fidelityIndex = deployJob.indexOf('name: Verify exact deployment markers and candidate browser fidelity')
  const serviceWorkerUpgradeIndex = deployJob.indexOf('name: Verify returning-user service worker revision convergence')
  const liveVerificationIndex = deployJob.indexOf('name: Record live verification receipt')
  const publishIndex = deployJob.indexOf('name: Publish verified production mirror')
  const rollbackSmokeIndex = deployJob.indexOf('name: Verify restored production runtime')

  assert.ok(prewarmIndex >= 0)
  assert.ok(prewarmIndex < deployIndex)
  assert.ok(deployIndex >= 0)
  assert.ok(candidateIndex > deployIndex)
  assert.ok(smokeIndex > deployIndex)
  assert.ok(fidelityIndex > smokeIndex)
  assert.ok(serviceWorkerUpgradeIndex > fidelityIndex)
  assert.ok(liveVerificationIndex > serviceWorkerUpgradeIndex)
  assert.ok(publishIndex > liveVerificationIndex)
  assert.ok(rollbackSmokeIndex > publishIndex)
  const liveSmokeStep = deployJob.slice(smokeIndex, fidelityIndex)
  const rollbackSmokeStep = deployJob.slice(rollbackSmokeIndex)
  assert.match(
    liveSmokeStep,
    /KNOWGRPH_AGENT_READY_BASE_URL: \$\{\{ steps\.candidate\.outputs\.deployment_url \}\}/,
  )
  assert.match(
    rollbackSmokeStep,
    /KNOWGRPH_AGENT_READY_BASE_URL: \$\{\{ steps\.previous\.outputs\.production_origin \}\}/,
  )
  assert.match(releaseSmoke, /require\('\.\/config\/surface-registry\.json'\)/)
  assert.match(releaseSmoke, /registry\.publicOrigin/)
  assert.match(releaseSmoke, /KNOWGRPH_AGENT_READY_BASE_URL:-\$configured_public_origin/)
  assert.doesNotMatch(releaseSmoke, /pages\.dev/)
  assert.match(agentReadySmoke, /const requestOriginUrl = new URL\(process\.env\.KNOWGRPH_AGENT_READY_BASE_URL \|\| canonicalBaseUrl\)\.origin/)
  assert.equal(
    (agentReadySmoke.match(/fetch\(toRequestUrl\(/g) || []).length,
    3,
    'every agent-ready request must use the selected transport origin',
  )
  assert.match(agentReadySmoke, /name: 'root-homepage-app-alias'/)
  assert.match(agentReadySmoke, /name: 'markdown-negotiation'/)
  const deployStep = deployJob.slice(
    deployIndex,
    deployJob.indexOf('name: Capture exact candidate deployment origin'),
  )
  const preDeployAuthorityIndex = deployStep.indexOf('release:main-authority:check')
  const pagesDeployIndex = deployStep.indexOf('wrangler pages deploy')
  assert.ok(preDeployAuthorityIndex >= 0)
  assert.ok(pagesDeployIndex > preDeployAuthorityIndex)
  assert.match(deployStep, /--commit-hash="\$RELEASE_SHA"/)
  const protectedMutationSteps = [
    ['Enforce sole deployment ownership', 'runtime:pages:owner-enforce'],
    ['Deploy verified artifact', 'wrangler pages deploy'],
    ['Reconcile canonical docs into D1', 'storage:d1:seed:docs'],
    ['Publish verified production mirror', 'git push origin HEAD:main'],
  ]
  for (const [stepName, mutationCommand] of protectedMutationSteps) {
    const stepStart = deployJob.indexOf(`name: ${stepName}`)
    const nextStepStart = deployJob.indexOf('\n      - name:', stepStart + 1)
    const stepSource = deployJob.slice(
      stepStart,
      nextStepStart === -1 ? deployJob.length : nextStepStart,
    )
    const authorityIndex = stepSource.indexOf('release:main-authority:check')
    const mutationIndex = stepSource.indexOf(mutationCommand)
    assert.ok(stepStart >= 0, `${stepName} must exist`)
    assert.ok(authorityIndex >= 0, `${stepName} must revalidate protected main`)
    assert.ok(mutationIndex > authorityIndex, `${stepName} must revalidate before mutation`)
    assert.match(stepSource, /release:candidate:authorization -- verify/, `${stepName} must revalidate candidate authorization`)
  }
  assert.match(
    deployJob,
    /name: Publish verified production mirror[\s\S]*npm --prefix \.\.\/knowgrph run --silent release:main-authority:check/,
  )
  assert.match(deployJob, /PRODUCTION_ORIGIN: \$\{\{ steps\.candidate\.outputs\.deployment_url \}\}/)
  assert.match(deployJob, /PRODUCTION_MARKER_ORIGIN: \$\{\{ steps\.candidate\.outputs\.deployment_url \}\}/)
  assert.equal(
    (
      deployJob.match(
        /PRODUCTION_SW_PROFILE_ORIGIN: \$\{\{ steps\.previous\.outputs\.production_origin \}\}/g,
      ) || []
    ).length,
    2,
    'prewarm and verify must share the configured stable Pages production origin',
  )
  assert.match(deployJob, /PRODUCTION_BROWSER_HEADLESS: 'false'/)
  assert.match(deployJob, /xvfb-run --auto-servernum npm run production:fidelity:check/)
  assert.match(
    deployJob,
    /timeout --foreground --kill-after=30s 8m xvfb-run --auto-servernum npm run production:sw-upgrade:prewarm/,
  )
  assert.match(
    deployJob,
    /timeout --foreground --kill-after=30s 12m xvfb-run --auto-servernum npm run production:sw-upgrade:verify/,
  )
  assert.match(deployJob, /PRODUCTION_SW_PROFILE_DIR: \$\{\{ runner\.temp \}\}\/knowgrph-production-sw-profile/)
  assert.match(deployJob, /PRODUCTION_SW_EVIDENCE_PATH: \$\{\{ runner\.temp \}\}\/knowgrph-production-sw-evidence\.json/)
  assert.match(productionServiceWorkerUpgradeScript, /chromium\.launchPersistentContext\(profileDirectory/)
  assert.match(productionServiceWorkerUpgradeScript, /PRODUCTION_SW_PROFILE_ORIGIN is required/)
  assert.match(productionServiceWorkerUpgradeScript, /const profileOrigin = normalizeOrigin\(profileOriginInput\)/)
  assert.match(productionServiceWorkerUpgradeScript, /knowgrph-production-service-worker-transition\/v3/)
  assert.match(productionServiceWorkerUpgradeScript, /assert\.equal\(evidence\.profileOrigin, profileOrigin\)/)
  assert.doesNotMatch(productionServiceWorkerUpgradeScript, /knowgrph-production-service-worker-upgrade\/v[12]/)
  assert.doesNotMatch(productionServiceWorkerUpgradeScript, /PRODUCTION_PUBLIC_ORIGIN/)
  assert.doesNotMatch(productionServiceWorkerUpgradeScript, /https:\/\/airvio\.co/)
  assert.match(productionServiceWorkerUpgradeScript, /serviceWorkers: 'allow'/)
  assert.match(productionServiceWorkerUpgradeScript, /navigator\.serviceWorker\.getRegistrations\(\)/)
  assert.match(productionServiceWorkerUpgradeScript, /registrations\.length !== 1/)
  assert.match(productionServiceWorkerUpgradeScript, /canonicalWorkerScope/)
  assert.match(productionServiceWorkerRegistrationProof, /canonicalWorkerScriptUrl/)
  assert.match(productionServiceWorkerUpgradeScript, /requireRevisionBoundRegistration: true/)
  assert.match(productionServiceWorkerUpgradeScript, /registration\.updateViaCache === 'none'/)
  assert.match(productionServiceWorkerUpgradeScript, /registration\.activeState === 'activated'/)
  assert.match(productionServiceWorkerUpgradeScript, /registration\.installingScriptUrl === ''/)
  assert.match(productionServiceWorkerUpgradeScript, /registration\.waitingScriptUrl === ''/)
  assert.match(productionServiceWorkerUpgradeScript, /activeAttestedRevision/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.activeAttestedRevision === expectedRevision/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.controllerAttestedRevision === expectedRevision/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.activeChatRuntimeSchema === CHAT_RUNTIME_SCHEMA/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.controllerChatRuntimeSchema === CHAT_RUNTIME_SCHEMA/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.controllerMatchesActive/)
  assert.match(productionServiceWorkerUpgradeScript, /KG_SERVICE_WORKER_SOURCE_REVISION_REQUEST/)
  assert.match(productionServiceWorkerUpgradeScript, /KG_CHAT_STREAM_RUNTIME_ATTEST_REQUEST/)
  assert.match(productionServiceWorkerUpgradeScript, /verifyPublishedWorkerSources\(expectedRevision\)/)
  assert.match(productionServiceWorkerUpgradeScript, /public chat runtime must not retain legacy lifecycle listeners/)
  assert.match(productionServiceWorkerUpgradeScript, /precacheAssetNamespaces/)
  assert.match(productionServiceWorkerUpgradeScript, /precacheAssetNamespaces\[0\] === expectedRevision/)
  assert.match(productionServiceWorkerUpgradeScript, /cachedAssetNamespaces/)
  assert.match(productionServiceWorkerUpgradeScript, /cachedAssetNamespaces\[0\] === expectedRevision/)
  assert.match(productionServiceWorkerUpgradeScript, /cachedHtmlPaths/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.cachedHtmlPaths\.length === 0/)
  assert.match(productionServiceWorkerUpgradeScript, /preservedSiblingHtmlPaths/)
  assert.match(productionServiceWorkerUpgradeScript, /service worker convergence must preserve sibling application HTML caches/)
  assert.match(productionServiceWorkerUpgradeScript, /precacheHtmlPaths/)
  assert.match(productionServiceWorkerUpgradeScript, /evidence\.precacheHtmlPaths\.length === 0/)
  assert.match(productionServiceWorkerUpgradeScript, /seedReturningUserCacheProof/)
  assert.match(serviceWorkerReleaseTransitionScript, /same-revision-recovery/)
  assert.match(serviceWorkerReleaseTransitionScript, /revision-upgrade/)
  assert.match(serviceWorkerUpgradeCacheProofScript, /service-worker-upgrade-stale-runtime-proof\.js/)
  assert.match(serviceWorkerUpgradeCacheProofScript, /kgSwUpgradeStaleHtmlProof/)
  assert.match(serviceWorkerUpgradeCacheProofScript, /caches\.open\('kg-static'\)/)
  assert.match(serviceWorkerUpgradeCacheProofScript, /singabldr-pwa:static:20260504-2/)
  assert.match(serviceWorkerUpgradeCacheProofScript, /\/favicon\.ico\?kgSwUpgradeStaleHtmlProof=/)
  assert.match(
    productionServiceWorkerUpgradeScript,
    /assert\.deepEqual\(\s*evidence\.seededCachePaths\?\.htmlPaths,/,
  )
  assert.match(productionServiceWorkerUpgradeScript, /initialNavigationResponse\.fromServiceWorker\(\)/)
  assert.match(productionServiceWorkerUpgradeScript, /reloadNavigationResponse\.fromServiceWorker\(\)/)
  assert.match(productionServiceWorkerUpgradeScript, /const upgradeObservation = observePageFailures\(upgradePage\)/)
  assert.match(productionServiceWorkerUpgradeScript, /upgrade-tab JavaScript module requests returned HTML/)
  assert.match(productionServiceWorkerUpgradeScript, /upgrade-tab browser errors/)
  assert.match(productionServiceWorkerUpgradeScript, /service worker convergence must preserve local-first browser storage/)
  assert.match(productionServiceWorkerUpgradeScript, /production HTTP must remain the sole HTML owner/)
  assert.doesNotMatch(productionServiceWorkerUpgradeScript, /\.unregister\(/)
  assert.doesNotMatch(productionServiceWorkerUpgradeScript, /caches\.delete/)
  assert.match(productionFidelityScript, /scriptsOutsideExactReleaseNamespace/)
  assert.match(productionFidelityScript, /browserAssetScripts\.filter/)
  assert.match(productionFidelityScript, /knowgrph\/assets\/\$\{expectedSourceRevision\}/)
  assert.match(productionFidelityScript, /Physics runtime running with/)
  assert.match(productionFidelityScript, /Beach Ball/)
  assert.match(productionFidelityScript, /KNOWGRPH_WORKSPACE_SEED_INVENTORY/)
  assert.match(productionFidelityScript, /waitForWorkspaceSeedInventory/)
  assert.match(productionFidelityScript, /aside\[aria-label="Markdown Explorer"\]/)
  assert.match(productionFidelityScript, /section\[aria-label="Source Files"\]/)
  assert.doesNotMatch(productionFidelityScript, /getByRole\('region', \{ name: 'Source Files'/)
  assert.match(productionFidelityScript, /name: 'Workspace View'/)
  assert.match(productionFidelityScript, /name: 'Editor Workspace'/)
  assert.match(productionFidelityScript, /openWorkspaceFolder\(sourceFilesContent, 'docs'\)/)
  assert.match(productionFidelityScript, /openWorkspaceFolder\(sourceFilesContent, 'workspace-seeds'\)/)
  assert.match(productionFidelityScript, /Explorer Source Files workspace-seeds inventory mismatch/)
  assert.match(productionFidelityScript, /page\.frames\(\)\.filter/)
  assert.match(productionFidelityScript, /url\.searchParams\.get\('kgPreview'\) === '1'/)
  assert.match(productionFidelityScript, /evidenceByTarget\.reduce/)
  assert.match(productionFidelityScript, /browserHeadless/)
  assert.match(productionFidelityScript, /heavyRuntimeIntents/)
  assert.match(productionFidelityScript, /bodyTextTail/)
  assert.match(productionFidelityScript, /page\.locator\('body'\)/)
  assert.doesNotMatch(productionFidelityScript, /contentFrame\(\)\.locator\('body'\)/)
  assert.match(productionFidelityScript, /Validation seed fallback/)
  assert.match(productionFidelityScript, /__kgHomeSourceAuthorityEvidence/)
  assert.match(productionFidelityScript, /prematureSceneMounts/)
  assert.match(productionFidelityScript, /waitForHomeSourceAuthority/)
  assert.doesNotMatch(productionFidelityScript, /PRODUCTION_PUBLIC_ORIGIN|publicOrigin/)
  assert.match(productionFidelityScript, /documentLoadedRootCount/)
  assert.match(productionFidelityScript, /data-kg-xr-document-loaded/)
  assert.match(productionFidelityScript, /data-kg-xr-scene-media-drop/)
  assert.match(productionFidelityScript, /data-kg-xr-empty-world/)
  assert.match(productionFidelityScript, /--use-gl=angle/)
  assert.match(productionFidelityScript, /--use-angle=swiftshader-webgl/)
  assert.match(productionFidelityScript, /--enable-unsafe-swiftshader/)
  assert.match(productionFidelityScript, /Home must retain exactly one canonical XR Canvas/)
  assert.match(productionFidelityScript, /Home must not activate Game Mode before explicit invocation/)
  assert.match(productionFidelityScript, /LIVE_CANVAS_HERO_SOURCE_SESSION_KEY/)
  assert.match(productionFidelityScript, /conflictingShareToken/)
  assert.match(productionFidelityScript, /persisted source conflict must be removed at the Home source owner/)
  assert.match(productionFidelityScript, /stale Home source recovery constructed a fallback XR owner/)
  assert.doesNotMatch(verifyJob, /HUIJOOHWEE_PUSH_TOKEN/)
  assert.match(deployJob, /git push origin HEAD:main/)
  assert.match(deployJob, /HUIJOOHWEE_PUSH_TOKEN/)
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

test('deploy dependency bootstrap retries bounded transient registry failures', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))

  assert.match(deployJob, /for attempt in 1 2 3; do/)
  assert.match(deployJob, /if npm ci; then/)
  assert.match(deployJob, /if \[ "\$attempt" -eq 3 \]; then/)
  assert.match(deployJob, /sleep "\$\(\(attempt \* 10\)\)"/)
})

test('generated mirror and rollback are bound to immutable runtime identities', () => {
  assert.match(productionReadinessBuild, /knowgrph-production-runtime-readiness\/v2/)
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

  assert.match(artifactStep, /huijoohwee\/content\/knowgrph/)
  assert.match(artifactStep, /huijoohwee\/knowgrph/)
  assert.match(artifactStep, /include-hidden-files: true/)
  assert.match(artifactStep, /\.knowgrph-production-artifact-manifest\.json/)
})

test('deploy reconciles verified additions and deletions into the exact mirror base', () => {
  const deployJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  deploy:'))
  const downloadIndex = deployJob.indexOf('name: Download verified artifacts')
  const reconcileIndex = deployJob.indexOf('name: Reconcile verified artifact into exact mirror base')
  const deployIndex = deployJob.indexOf('name: Deploy verified artifact')

  assert.match(releaseWorkflow, /mirror_revision: \$\{\{ steps\.mirror_revision\.outputs\.revision \}\}/)
  assert.match(deployJob, /ref: \$\{\{ needs\.verify\.outputs\.mirror_revision \}\}/)
  assert.match(deployJob, /path: \$\{\{ runner\.temp \}\}\/production-mirror-artifact/)
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

  assert.match(deployJob, /KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: \$\{\{ github\.workspace \}\}\/agentic-canvas-os\/docs/)
  assert.match(releaseWorkflow, /docs_repository: \$\{\{ steps\.agentic_canvas_os_docs\.outputs\.repository \}\}/)
  assert.match(deployJob, /repository: \$\{\{ needs\.verify\.outputs\.docs_repository \}\}/)
  assert.match(deployJob, /ref: \$\{\{ needs\.verify\.outputs\.docs_revision \}\}/)
  assert.match(
    deployJob,
    /name: Reconcile canonical docs into D1[\s\S]*npm run storage:d1:seed:docs/,
  )
  assert.ok(checkoutIndex >= 0, 'expected the deploy job to checkout the pinned canonical docs revision')
  assert.ok(seedIndex > checkoutIndex, 'expected D1 reconciliation after the pinned docs checkout')
  assert.ok(smokeIndex > seedIndex, 'expected live smoke after D1 reconciliation')
})

test('agent-ready smoke probes the current canonical docs corpus', () => {
  assert.match(agentReadySmoke, /'agentic-canvas-os',\s+'docs',\s+'RELEASE-WORKFLOW\.md'/m)
  assert.match(agentReadySmoke, /const contentAwareSearchQuery = 'revision-fence'/)
  assert.match(agentReadySmoke, /String\(entry\?\.canonicalPath \|\| ''\) === 'agentic-canvas-os\/docs\/AGENT-DEFINITIONS\.md'/)
  assert.doesNotMatch(agentReadySmoke, /knowgrph-modularity-prd-tad\.md/)
  assert.doesNotMatch(agentReadySmoke, /knowgrph-strybldr-starter-template/)
})

test('canonical docs reconciliation uses the lockfile Wrangler version', () => {
  assert.match(docsSeedScript, /'--no-install',\s+'wrangler',\s+'d1'/m)
  assert.doesNotMatch(docsSeedScript, /wrangler@latest/)
})

test('canonical docs reconciliation proves stored content and exact chunk parity', () => {
  const directSeedIndex = docsSeedScript.indexOf('if (shouldUseDirectD1ControlPlane)')
  const publicExportIndex = docsSeedScript.indexOf("console.log('[knowgrph] export start: before-seed')")
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
