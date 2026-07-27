function requireMarkers(source, markers, label) {
  const missing = markers.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(`${label} is missing required markers: ${missing.join(', ')}`)
  }
}

function forbidMarkers(source, markers, label) {
  const present = markers.filter(marker => source.includes(marker))
  if (present.length > 0) {
    throw new Error(`${label} contains forbidden markers: ${present.join(', ')}`)
  }
}

function exactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be exactly ${expected.join(', ')}`)
  }
}

export async function assertFlightSimVerificationReadiness({ readText }) {
  const packageSource = JSON.parse(await readText('package.json'))
  if (
    packageSource.scripts?.['game-flight-sim:runtime-ready']
      !== 'node ./scripts/run-game-flight-sim-runtime-ready.mjs'
    || packageSource.scripts?.['game-flight-sim:orchestration:test']
      !== 'node --test ./scripts/__tests__/game-flight-sim-verification-aggregation.test.mjs && node --test ./canvas/scripts/__tests__/game-flight-sim-browser-smoke-launcher.test.mjs && python3 -m unittest discover -s ./canvas/scripts/__tests__ -p \'test_game_flight_sim_smoke_ledger.py\''
    || packageSource.scripts?.['game-flight-sim:negative-gates:test']
      !== 'node --test ./scripts/__tests__/game-flight-sim-negative-gates.test.mjs ./scripts/__tests__/game-flight-sim-readiness-contract.test.mjs'
  ) {
    throw new Error('Flight Sim runtime readiness must use the named aggregate and negative gates')
  }

  const runnerSource = await readText('scripts/run-game-flight-sim-runtime-ready.mjs')
  const stageInventory = runnerSource.slice(
    runnerSource.indexOf('export const FLIGHT_SIM_RUNTIME_VERIFICATIONS'),
    runnerSource.indexOf('export function executeVerificationCommand'),
  )
  const stageNames = [...stageInventory.matchAll(/^\s+name: '([^']+)',$/gm)]
    .map(match => match[1])
  exactArray(stageNames, [
    'linked package preparation',
    'source authority',
    'native Agentic ECS integration',
    'focused Flight Sim source tests',
    'negative authoring, dependency, license, and clean-room gates',
    'verification aggregation contracts',
    'Canvas TypeScript',
    'production build',
  ], 'Flight Sim aggregate verification stages')
  requireMarkers(runnerSource, [
    'export const FLIGHT_SIM_RUNTIME_VERIFICATIONS = Object.freeze([',
    "name: 'clean checkout preflight'",
    'runtime-ready requires an initially clean checkout',
    'createWorkspace = createGitVerificationWorkspace',
    'workspace.repositoryRoot',
    'collectNamedVerifications({',
    "name: 'repository source immutability'",
    "name: 'caller checkout isolation'",
    "throwForNamedFailures('Game Flight Sim runtime readiness', failures)",
  ], 'Flight Sim named runtime aggregate')
  const isolationSource = await readText(
    'scripts/lib/git-verification-workspace.mjs',
  )
  requireMarkers(isolationSource, [
    'export async function createGitVerificationWorkspace(repositoryRoot)',
    "'--local'",
    "'--shared'",
    "'--no-checkout'",
    "'--reflink=auto'",
    'COPYFILE_FICLONE',
    'assertNoDependencyLinkEscape(',
    'assertSafeIsolationPath(isolationParent, isolationRoot)',
    'export async function assertGitVerificationWorkspace({',
  ], 'Flight Sim exact local verification isolation')

  const offlineAuthoringSource = await readText(
    'scripts/lib/game-flight-sim-offline-authoring.mjs',
  )
  requireMarkers(offlineAuthoringSource, [
    "'image-to-3d-model-call'",
    "'network-fetch'",
    "'cloudflare-resource-request'",
    'blocked disallowed operation before commit',
    'export const FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS = Object.freeze({',
    'function runOfflineAuthorWorker()',
    'export async function writeFlightSimOfflineAuthoredOutput(...options)',
    'accepts no caller-controlled author, path, or commit callback',
    'const outputs = await readFlightSimOfflineAuthoredOutput()',
    'await commitCanonicalOutputs(outputs)',
    'await rename(output.stagedPath, output.targetPath)',
    'restoreCommittedOutputs(committedOutputs)',
  ], 'Flight Sim offline authoring transaction')
  forbidMarkers(offlineAuthoringSource, [
    'options.commit',
    'await commit(',
    'authorModuleUrl: pathToFileURL',
  ], 'Flight Sim offline authoring transaction')
  const offlineAuthorContractSource = await readText(
    'scripts/lib/game-flight-sim-offline-author-contract.mjs',
  )
  requireMarkers(offlineAuthorContractSource, [
    'FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL',
    'FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT',
    'CANONICAL_STATIC_IMPORT',
    'AUTHORITY_BYPASS_PATTERN',
    'REEXPORT_BYPASS_PATTERN',
    "JSON.stringify(imports) !== JSON.stringify(['node:crypto'])",
    'rejected a non-canonical author authority',
    'rejected an unaudited import or dynamic execution seam',
  ], 'Flight Sim fixed offline author authority')
  const offlineAuthorWorkerSource = await readText(
    'scripts/lib/game-flight-sim-offline-author-worker.mjs',
  )
  requireMarkers(offlineAuthorWorkerSource, [
    'installNetworkFence()',
    'syncBuiltinESMExports()',
    'assertFlightSimOfflineAuthorSource({',
    'workerData.authorModuleUrl',
    'workerData.authorExport',
    'offline-author-worker=1',
    'await settleDeferredWork()',
    "block('network-fetch')",
    "block('image-to-3d-model-call')",
    "block('cloudflare-resource-request')",
  ], 'Flight Sim isolated offline author worker')
  const optionalPropAuthorSource = await readText(
    'scripts/lib/game-flight-sim-optional-prop-author.mjs',
  )
  requireMarkers(optionalPropAuthorSource, [
    "import { createHash } from 'node:crypto'",
    'export function authorFlightSimOptionalProp()',
    "generator: 'knowgrph-offline-flight-sim-fallback/v1'",
  ], 'Flight Sim fixed optional-prop author')
  const generatorSource = await readText(
    'scripts/generate-game-flight-sim-optional-prop-glb.mjs',
  )
  requireMarkers(generatorSource, [
    'FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS',
    'readFlightSimOfflineAuthoredOutput',
    'writeFlightSimOfflineAuthoredOutput',
    'await readFlightSimOfflineAuthoredOutput()',
    'await writeFlightSimOfflineAuthoredOutput()',
  ], 'Flight Sim offline GLB generator')
  forbidMarkers(generatorSource, [
    'writeFile',
    'commit:',
    'game-flight-sim-optional-prop-author.mjs',
    'authorFlightSimOptionalProp',
  ], 'Flight Sim offline GLB generator')

  const negativeGateTests = await readText(
    'scripts/__tests__/game-flight-sim-negative-gates.test.mjs',
  )
  requireMarkers(negativeGateTests, [
    'observes each real disallowed operation before commit and preserves bytes',
    "const capturedTransport = globalThis[key]",
    "import { get } from 'node:http'",
    "setTimeout(() => globalThis[key]",
    "import{writeFileSync}from'node:fs'",
    "process.getBuiltinModule('node:fs')",
    "process['getBuiltinModule']('node:fs')",
    'createRequire loader',
    "export*from'./side-effecting-helper.mjs'",
    'canonical offline writer preflights its exact output pair before atomic rename',
    'writeFlightSimOfflineAuthoredOutput({',
    'malicious-author-ran',
    'names a crafted unauthorized runtime package',
    'names a crafted non-OSI license',
    'reports a crafted external-project boundary violation',
  ], 'Flight Sim crafted negative gates')

  const deadlineSource = await readText(
    'canvas/src/features/game-flight-sim/flightSimDeadlineRuntime.ts',
  )
  requireMarkers(deadlineSource, [
    'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCK_LIMIT_MS = 1_000',
    'FLIGHT_SIM_HUD_UPDATE_LIMIT_MS = 100',
    'FLIGHT_SIM_READY_FRAME_LIMIT_MS = 100',
    'FLIGHT_SIM_WEBGL_ADMISSION_LIMIT_MS = 100',
    'export function measureFlightSimWebglAdmission(',
    'export function measureFlightSimGameplayNetworkBlock(',
  ], 'Flight Sim production deadline owner')
  const deadlineIntegrationSource = await readText(
    'canvas/src/features/game-flight-sim/flightSimDeadlineIntegration.ts',
  )
  requireMarkers(deadlineIntegrationSource, [
    'measureFlightSimWebglAdmission(() => readWebglSupport())',
    'export function startFlightSimWithReadyFrame(',
    'export function rejectFlightSimGameplayNetworkAttemptWithinDeadline(',
    'blockFlightSimGameplayNetworkAttempt(mission, operation, executor)',
  ], 'Flight Sim production deadline integration')
  const deadlineTests = await readText(
    'canvas/src/__tests__/flightSimDeadlineContracts.test.ts',
  )
  requireMarkers(deadlineTests, [
    'actual WebGL probe is synchronous and a probe over 100 ms fails closed',
    'ready-frame and HUD deadlines record asynchronous presentation semantics',
    'production runtime blocks a gameplay network attempt within 1 s and retains mission state',
  ], 'Flight Sim deadline tests')
  const browserDeadlineSource = await readText(
    'canvas/scripts/lib/game_flight_sim_smoke_deadlines.py',
  )
  requireMarkers(browserDeadlineSource, [
    'def verify_flight_deadline_contracts(',
    'websocket_probe_url: str,',
    'websocket_probe_events: list[str],',
    'websocket_probe_route_hits: list[str],',
    'Flight WebGL admission was not synchronous within 100 ms',
    'Flight ready frame was not presented by native MapLibre',
    'Flight gameplay network attempt was not blocked within 1 s',
    'Flight WebSocket attempt was not synchronously blocked before',
    'Flight HUD did not reflect its runtime update within 100 ms',
  ], 'Flight Sim browser deadline proof')
  const browserPhasesSource = await readText(
    'canvas/scripts/lib/game_flight_sim_smoke_runtime_phases.py',
  )
  requireMarkers(browserPhasesSource, [
    'from lib.game_flight_sim_smoke_deadlines import verify_flight_deadline_contracts',
    'lambda: verify_flight_deadline_contracts(',
    'websocket_probe_url=websocket_probe_url',
    'websocket_probe_events=websocket_probe_events',
    'websocket_probe_route_hits=websocket_probe_route_hits',
  ], 'Flight Sim browser deadline integration')
  const browserVerifierSource = await readText(
    'canvas/scripts/verify_game_flight_sim_browser_smoke.py',
  )
  requireMarkers(browserVerifierSource, [
    'target_url = f"{BASE_URL}/?kgFlightSimBrowserProof=1"',
    'page.on("websocket", record_websocket)',
    'context.route_web_socket("**/*", route_websocket)',
    '"productionFenceEscapeObserved": bool(',
    '"webSocketAttempts": {',
    '"unexpectedRouteHits":',
    '"serverTransportAllowed": False',
    '"transportObserved": False',
  ], 'Flight Sim pre-navigation WebSocket transport proof')
  forbidMarkers(browserVerifierSource, [
    '.connect_to_server(',
  ], 'Flight Sim pre-navigation WebSocket transport proof')
  const browserBootstrapSource = await readText(
    'canvas/scripts/lib/game_flight_sim_smoke_bootstrap.py',
  )
  requireMarkers(browserBootstrapSource, [
    'FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA = (',
    '"knowgrph-flight-sim-browser-proof-bridge/v1"',
    'window.__kgFlightSimBrowserProof?.schema === expectedSchema',
    'page.wait_for_function(',
    'arg=FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA',
    'Flight production candidate page did not load',
  ], 'Flight Sim production browser bootstrap')
  forbidMarkers(browserBootstrapSource, [
    'VITE_WARMUP_MODULES',
    'warm_vite_module_graph',
    "import('/src/",
    'import("/src/',
  ], 'Flight Sim production browser bootstrap')
  const browserProofBridgeSource = await readText(
    'canvas/src/features/testing/flightSimBrowserProofBridge.ts',
  )
  requireMarkers(browserProofBridgeSource, [
    'FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA =',
    "'knowgrph-flight-sim-browser-proof-bridge/v1'",
    'const MODULE_IMPORTERS = Object.freeze({',
    "flightSimRuntime: () => import('@/features/game-flight-sim/flightSimRuntime')",
    'Object.prototype.hasOwnProperty.call(MODULE_IMPORTERS, key)',
    'Unknown Flight browser proof module',
  ], 'Flight Sim production browser proof bridge')
  const mainEntrySource = await readText('canvas/src/main.tsx')
  requireMarkers(mainEntrySource, [
    "import.meta.env.VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF === '1'",
    ".get('kgFlightSimBrowserProof') === '1'",
    "import('@/features/testing/flightSimBrowserProofBridge')",
    'module.installFlightSimBrowserProofBridge()',
  ], 'Flight Sim production browser proof activation')
  const localViteBrowserSmokeSource = await readText(
    'canvas/scripts/lib/run-local-vite-browser-smoke.mjs',
  )
  requireMarkers(localViteBrowserSmokeSource, [
    "devServerStartMode === 'vite-preview-runner'",
    "['preview']",
    "['--outDir', previewOutDir]",
    'previewOutDir = \'\'',
    'Unsupported devServerStartMode',
  ], 'Flight Sim owned Vite preview server')
  const previewLauncherRegressionSource = await readText(
    'canvas/scripts/__tests__/game-flight-sim-browser-smoke-launcher.test.mjs',
  )
  requireMarkers(previewLauncherRegressionSource, [
    'runLocalViteBrowserSmoke({',
    "devServerStartMode: 'vite-preview-runner'",
    "existingServerPolicy: 'forbid'",
    'previewOutDir,',
    "kgFlightSimPreactivationReady = '1'",
    'verify_game_flight_sim_preview_page.py',
  ], 'Flight Sim real preview launcher regression')
  const previewPageVerifierSource = await readText(
    'canvas/scripts/__tests__/verify_game_flight_sim_preview_page.py',
  )
  requireMarkers(previewPageVerifierSource, [
    'context.route_web_socket("**/*", block_websocket)',
    'page = context.new_page()',
    'data-kg-flight-sim-hud="1"',
    'websocket_events or websocket_route_hits',
    'Flight preview preflight passed: real preview page executed with zero ',
    'pre-Flight WebSocket attempts.',
  ], 'Flight Sim real preview page regression')
  forbidMarkers(previewPageVerifierSource, [
    '.connect_to_server(',
  ], 'Flight Sim real preview page regression')
  if (
    previewPageVerifierSource.indexOf(
      'context.route_web_socket("**/*", block_websocket)',
    ) > previewPageVerifierSource.indexOf('page = context.new_page()')
  ) {
    throw new Error(
      'Flight Sim preview regression must install its wildcard route before page creation',
    )
  }
  const browserAggregateSource = await readText(
    'canvas/scripts/run_game_flight_sim_browser_smoke.mjs',
  )
  requireMarkers(browserAggregateSource, [
    'const deadlineContracts = {',
    'observation?.synchronous === contract.synchronous',
    'observation?.limitMs === contract.limitMs',
    "'fetch:GET:/api/storage/flight-sim-browser-deadline-proof'",
    "gameplayNetworkBlockedError?.code",
    'gameplayNetworkTransportObserved === false',
    'gameplayWebSocketBlock',
    'gameplayWebSocketBlockedError?.code',
    'gameplayWebSocketMissionStateRetained === true',
    'gameplayWebSocketTransportObserved === false',
    'gameplayWebSocketRouteHits?.length === 0',
    'assertExactFlightSimBrowserVerificationLedger(',
    'assertExactFlightSimOptionalBeaconAdmission(',
    'runIsolatedBrowserProof({',
    'prepareEvidence: prepareIsolatedEvidence',
    'assertGitVerificationWorkspace({',
    'buildExactProductionPreview(candidate)',
    'resolveGameFlightSimBrowserPaths(import.meta.url)',
    "KG_SKIP_DOCS_UPDATE: '1'",
    "VITE_BASE_PATH: '/'",
    "VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF: '1'",
    'cwd: canvasRoot',
    'const indexBytes = await readFile(distIndexPath)',
    "indexSource.includes('/@vite/client')",
    "devServerStartMode: 'vite-preview-runner'",
    'productionBuild,',
  ], 'Flight Sim exact deadline evidence aggregate')
  forbidMarkers(browserAggregateSource, [
    'const canvasRoot = path.dirname(scriptPath)',
  ], 'Flight Sim exact deadline evidence aggregate')
  const productionBuildCalls = (
    browserAggregateSource.match(
      /const productionBuild = await buildExactProductionPreview\(candidate\)/g,
    ) || []
  ).length
  if (
    productionBuildCalls !== 1
    || browserAggregateSource.indexOf(
      'const productionBuild = await buildExactProductionPreview(candidate)',
    ) > browserAggregateSource.indexOf(
      'const runs = await runSerialBrowserProof({',
    )
  ) {
    throw new Error(
      'Flight Sim production preview must build exactly once before serial runs',
    )
  }
  const browserOrchestrationSource = await readText(
    'scripts/lib/game-flight-sim-browser-proof-orchestration.mjs',
  )
  requireMarkers(browserOrchestrationSource, [
    'export async function runIsolatedBrowserProof({',
    'createWorkspace = createGitVerificationWorkspace',
    "'repository source immutability'",
    "'caller checkout isolation'",
    'evidencePublication = await prepareEvidence(',
    'await workspace.dispose()',
    'await evidencePublication.commit()',
    'await evidencePublication.discard()',
  ], 'Flight Sim isolated browser proof orchestration')
  if (
    browserOrchestrationSource.indexOf('await evidencePublication.commit()')
    < browserOrchestrationSource.indexOf('await workspace.dispose()')
  ) {
    throw new Error(
      'Flight Sim browser evidence must publish only after isolated cleanup',
    )
  }
  const evidencePublicationSource = await readText(
    'scripts/lib/game-flight-sim-browser-evidence-publication.mjs',
  )
  requireMarkers(evidencePublicationSource, [
    'prepareFlightSimBrowserEvidencePublication',
    'restorePriorEvidence({',
    'async commit({ onPublishStep } = {})',
    'async discard()',
    'prior browser evidence',
  ], 'Flight Sim transactional browser evidence publication')
  const verificationAggregationTests = await readText(
    'scripts/__tests__/game-flight-sim-verification-aggregation.test.mjs',
  )
  requireMarkers(verificationAggregationTests, [
    'discards tracked and untracked child mutations from its isolated checkout',
    'discards tracked and untracked mutations detected inside its isolated child',
    'rolls back every prior byte after an injected mid-publication failure',
    'cleanup failure discards staged evidence before caller publication',
  ], 'Flight Sim verification failure-path regressions')
  const browserVerificationNames = JSON.parse(await readText(
    'canvas/scripts/contracts/game-flight-sim-browser-verifications.json',
  ))
  exactArray(browserVerificationNames, [
    'Source Files apply',
    'runtime deadline contracts',
    'first playable frame',
    'transparent Flight runtime Canvas',
    'Geo+XR four-view presentation',
    'strict browser WebMCP',
    'stop and Start lifecycle',
    'Motion Control panel handoff',
    'desktop playable input and HUD telemetry',
    'blur lifecycle',
    'strict throttle and restart',
    'Flight camera views and local navigation',
    'Timeline camera round-trip',
    'mobile HUD',
    'mobile touch control',
    'ordered mission completion',
    'Geo+XR Flight layer after mission',
    'Exit lifecycle and World disposal',
    'surface failure restoration',
    'Geo provider transport ownership',
    'workspace seed authority',
    'browser error surface',
  ], 'Flight Sim browser verification inventory')

  const browserNetworkSource = await readText(
    'canvas/scripts/lib/game_flight_sim_smoke_network.py',
  )
  requireMarkers(browserNetworkSource, [
    'PROOF_LOCAL_BLOCKED_PATH_PREFIXES',
    '"/api"',
    'PROOF_LOCAL_WORKSPACE_LIST_PATH = "/__kg_fs_list"',
    'PROOF_LOCAL_STATIC_PATH_PREFIXES',
    'PROOF_LOCAL_STATIC_SUFFIXES',
    'GEO_PROVIDER_READ_PATHS',
    'def request_is_proof_local_read(request: Any, local_origin: str) -> bool:',
    'def request_is_geo_provider_read(',
    'def summarize_websocket_attempts(',
    'def assert_transport_ownership(',
  ], 'Flight Sim browser transport ownership classifier')
  forbidMarkers(browserNetworkSource, [
    '"/src/"',
    '"/node_modules/"',
    '"/@vite/"',
    '"/@vite/client"',
  ], 'Flight Sim browser transport ownership classifier')
  const browserSceneSource = await readText(
    'canvas/scripts/lib/game_flight_sim_smoke_scene.py',
  )
  requireMarkers(browserSceneSource, [
    'FLIGHT_OPTIONAL_BEACON_PATH',
    'FLIGHT_OPTIONAL_BEACON_SHA256',
    'rendererCanvas?.dataset.kgFlightSimOptionalBeacon',
    'kgFlightOverlayKind',
    '"pendingWaypointCount"',
    'activeLandingCount',
    'flightVisualNames,',
    '"meshDescendantCount"',
    'Flight optional beacon did not retain its admitted local GLB',
  ], 'Flight Sim rendered fallback identity proof')
  const browserEvidenceSource = await readText(
    'scripts/lib/game-flight-sim-browser-evidence.mjs',
  )
  requireMarkers(browserEvidenceSource, [
    'game-flight-sim-browser-verifications.json',
    'assertExactFlightSimBrowserVerificationLedger',
    'assertExactFlightSimOptionalBeaconAdmission',
    'beacon path, SHA-256, opacity, and mesh identity',
    'did not retain the exact admitted optional',
  ], 'Flight Sim exact browser verification inventory')
}
