import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(process.cwd(), '..')

test('Flight browser proof activates only after applying the authored source', () => {
  const runner = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/run_game_flight_sim_browser_smoke.mjs',
    ),
    'utf8',
  )
  const verifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/verify_game_flight_sim_browser_smoke.py',
    ),
    'utf8',
  )
  const runtimePhases = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_runtime_phases.py',
    ),
    'utf8',
  )
  const sourceSelection = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_source_selection.py',
    ),
    'utf8',
  )
  const sourceVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_source.py',
    ),
    'utf8',
  )
  const browserBootstrap = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_bootstrap.py',
    ),
    'utf8',
  )
  const browserProofBridge = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/testing/flightSimBrowserProofBridge.ts',
    ),
    'utf8',
  )
  const mainEntry = readFileSync(
    resolve(repoRoot, 'canvas/src/main.tsx'),
    'utf8',
  )
  const networkBoundary = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_network.py',
    ),
    'utf8',
  )
  const deadlineVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_deadlines.py',
    ),
    'utf8',
  )
  const serverOwner = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/run-local-vite-browser-smoke.mjs',
    ),
    'utf8',
  )
  const launcherRegression = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/__tests__/game-flight-sim-browser-smoke-launcher.test.mjs',
    ),
    'utf8',
  )
  const previewPageVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/__tests__/verify_game_flight_sim_preview_page.py',
    ),
    'utf8',
  )
  const touchVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_mobile.py',
    ),
    'utf8',
  )
  const touchSurfaceVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_mobile_surface.py',
    ),
    'utf8',
  )
  const missionVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_mission.py',
    ),
    'utf8',
  )
  const sceneVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_scene.py',
    ),
    'utf8',
  )
  const geoXrVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_geo_xr.py',
    ),
    'utf8',
  )
  const cameraTrackingVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_camera_tracking.py',
    ),
    'utf8',
  )
  const cameraVerifier = readFileSync(
    resolve(
      repoRoot,
      'canvas/scripts/lib/game_flight_sim_smoke_camera.py',
    ),
    'utf8',
  )
  assert.match(
    runner,
    /delete process\.env\.VITE_KNOWGRPH_RUN_READY_DEMO/,
  )
  assert.doesNotMatch(
    runner,
    /VITE_KNOWGRPH_RUN_READY_DEMO\s*\|\|=\s*['"]flight-sim['"]/,
  )
  assert.doesNotMatch(
    runner,
    /VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH\s*=/,
  )
  assert.match(runner, /const runCount = 2/)
  assert.match(runner, /existingServerPolicy: 'forbid'/)
  assert.match(runner, /buildExactProductionPreview\(candidate\)/)
  assert.match(runner, /KG_SKIP_DOCS_UPDATE: '1'/)
  assert.match(runner, /VITE_BASE_PATH: '\/'/)
  assert.match(
    runner,
    /VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF: '1'/,
  )
  assert.match(runner, /indexSource\.includes\('\/@vite\/client'\)/)
  assert.match(runner, /devServerStartMode: 'vite-preview-runner'/)
  assert.match(runner, /productionBuild,/)
  assert.match(runner, /knowgrph-flight-sim-browser-run\/v5/)
  assert.match(runner, /knowgrph-flight-sim-browser-proof\/v5/)
  assert.match(
    verifier,
    /target_url = f"\{BASE_URL\}\/\?kgFlightSimBrowserProof=1"/,
  )
  assert.match(
    mainEntry,
    /VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF === '1'/,
  )
  assert.match(
    mainEntry,
    /\.get\('kgFlightSimBrowserProof'\) === '1'/,
  )
  assert.match(
    mainEntry,
    /import\('@\/features\/testing\/flightSimBrowserProofBridge'\)/,
  )
  assert.match(
    browserBootstrap,
    /knowgrph-flight-sim-browser-proof-bridge\/v1/,
  )
  assert.match(
    browserBootstrap,
    /window\.__kgFlightSimBrowserProof\?\.schema/,
  )
  assert.match(
    browserBootstrap,
    /arg=FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA/,
  )
  assert.match(
    browserProofBridge,
    /Unknown Flight browser proof module/,
  )
  assert.match(
    browserProofBridge,
    /flightSimRuntime: \(\) => import\('@\/features\/game-flight-sim\/flightSimRuntime'\)/,
  )
  assert.match(sourceSelection, /get_by_role\(\s*["']button["']/)
  assert.match(sourceSelection, /name=["']Workspace View["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Editor Workspace["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Storage Sync: On["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Storage Sync: Off["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Folder docs["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Folder workspace-seeds["'],\s*exact=True/)
  assert.match(sourceSelection, /workspace_view_button\.click\(\)/)
  assert.match(sourceSelection, /storage_sync_on_button\.click\(\)/)
  assert.match(sourceSelection, /editor_workspace_button\.click\(\)/)
  assert.match(sourceSelection, /name=["']Show Explorer pane["'],\s*exact=True/)
  assert.match(sourceSelection, /name=["']Source Files["'],\s*exact=True/)
  assert.match(sourceSelection, /explorer_toggle\.check\(\)/)
  assert.match(sourceSelection, /source_files_button\.click\(\)/)
  assert.match(sourceSelection, /docs_button\.click\(\)/)
  assert.match(sourceSelection, /workspace_seeds_button\.click\(\)/)
  assert.match(sourceSelection, /name=f["']File \{flight_basename\}["'],\s*exact=True/)
  assert.match(sourceSelection, /flight_button\.click\(\)/)
  assert.match(sourceSelection, /physics_button\.click\(\)/)
  assert.match(sourceSelection, /canvas === window\.__kgFlightSimCanvas/)
  assert.match(sourceSelection, /isXrPhysicsRunReadyDemoActive/)
  assert.match(sourceSelection, /flightHudCount/)
  assert.match(
    sourceSelection,
    /\[aria-label="Workspace editor overlay shell"\]/,
  )
  assert.match(
    sourceSelection,
    /button\[title="Close"\]/,
  )
  assert.match(
    sourceSelection,
    /close_button\.first\.click\(timeout=5_000\)/,
  )
  assert.doesNotMatch(
    sourceSelection,
    /setWorkspaceViewState\(|setWorkspaceCanvasPaneOpen\(/,
  )
  assert.ok(
    sourceVerifier.indexOf(
      'selection_round_trip = verify_source_file_button_round_trip(',
    )
      < sourceVerifier.indexOf(
        'selection_surface_transition = close_source_files_selection_surface(page)',
      ),
  )
  assert.ok(
    sourceVerifier.indexOf(
      'selection_surface_transition = close_source_files_selection_surface(page)',
    )
      < sourceVerifier.indexOf(
        'application = _apply_exact_authored_source(page, expected_source_text)',
      ),
  )
  assert.ok(
    sourceVerifier.indexOf('physicsSourceSha256:')
      < sourceVerifier.indexOf('startedAtMs: performance.now()'),
    'expected proof-only imports and baseline reads before the frame clock',
  )
  const frameClockIndex = sourceVerifier.indexOf(
    'startedAtMs: performance.now()',
  )
  assert.ok(
    frameClockIndex
      < sourceVerifier.indexOf('.setActivePath(sourcePath)', frameClockIndex),
    'expected the frame clock immediately before source application',
  )
  for (const sourceReader of [sceneVerifier, geoXrVerifier]) {
    assert.match(sourceReader, /await source\.getData\(\)/)
    assert.match(sourceReader, /source\?\.serialize\?\.\(\)\?\.data/)
    assert.doesNotMatch(sourceReader, /source\?\._data\?\.features/)
  }
  assert.ok(
    runtimePhases.indexOf('prepare_source_files_selection_surface(page)')
      < runtimePhases.indexOf('prepare_authored_physics_surface(page)'),
    'expected Source Files UI setup before the Physics canvas baseline is pinned',
  )
  assert.ok(
    runtimePhases.indexOf('prepare_authored_physics_surface(page)')
      < runtimePhases.indexOf('reset_observed_errors()'),
    'expected Flight network/error evidence to begin after the stable Physics baseline',
  )
  assert.match(verifier, /blocked_requests\.clear\(\)/)
  assert.doesNotMatch(networkBoundary, /["']\/src\/["']/)
  assert.doesNotMatch(networkBoundary, /["']\/@vite\//)
  const browserHelperRoot = resolve(repoRoot, 'canvas/scripts/lib')
  const requestedBrowserModuleKeys = new Set<string>()
  for (const browserHelperPath of readdirSync(browserHelperRoot)
    .filter(path => /^game_flight_sim_smoke_.*\.py$/.test(path))) {
    const source = readFileSync(
      resolve(browserHelperRoot, browserHelperPath),
      'utf8',
    )
    assert.doesNotMatch(source, /import\(\s*['"]\/src\//)
    if (source.includes('auxiliaryCanvasesLocalOnly')) {
      assert.match(source, /\.monaco-editor/)
    }
    for (const match of source.matchAll(
      /window\.__kgFlightSimBrowserProof\.importModule\('([^']+)'\)/g,
    )) {
      requestedBrowserModuleKeys.add(match[1])
    }
  }
  const bridgeModuleKeys = [
    ...browserProofBridge.matchAll(
      /^\s{2}([A-Za-z][A-Za-z0-9]*): \(\) => import\(/gm,
    ),
  ].map(match => match[1])
  assert.deepEqual(
    [...requestedBrowserModuleKeys].sort(),
    bridgeModuleKeys.sort(),
  )
  for (const browserVerifierPath of [
    'game_flight_sim_smoke_camera.py',
    'game_flight_sim_smoke_camera_tracking.py',
    'game_flight_sim_smoke_deadlines.py',
    'game_flight_sim_smoke_geo_xr.py',
    'game_flight_sim_smoke_lifecycle.py',
    'game_flight_sim_smoke_mission.py',
    'game_flight_sim_smoke_mobile.py',
    'game_flight_sim_smoke_mobile_surface.py',
    'game_flight_sim_smoke_navigation.py',
    'game_flight_sim_smoke_runtime_phases.py',
    'game_flight_sim_smoke_scene.py',
    'game_flight_sim_smoke_source.py',
    'game_flight_sim_smoke_web_mcp.py',
  ]) {
    const source = readFileSync(
      resolve(repoRoot, 'canvas/scripts/lib', browserVerifierPath),
      'utf8',
    )
    assert.doesNotMatch(source, /import\(\s*['"]\/src\//)
    assert.match(
      source,
      /window\.__kgFlightSimBrowserProof\.importModule\(/,
    )
  }
  assert.ok(
    runner.indexOf(
      'const productionBuild = await buildExactProductionPreview(candidate)',
    ) < runner.indexOf('const runs = await runSerialBrowserProof({'),
  )
  assert.match(runner, /KG_GAME_FLIGHT_SIM_EXPECTED_HEAD/)
  assert.match(runner, /KG_GAME_FLIGHT_SIM_EXPECTED_SOURCE_SHA256/)
  assert.match(runner, /freshServerPerRun: true/)
  assert.match(
    runner,
    /candidate\?\.runtimeRevision !== candidateHead/,
  )
  assert.match(
    runner,
    /candidate\?\.runtimeBranch !== candidateBranch/,
  )
  assert.match(
    runner,
    /source\?\.authoredSeedSha256 !== sourceSha256/,
  )
  assert.match(
    runner,
    /source\?\.workspaceSourceSha256 !== sourceSha256/,
  )
  assert.match(
    runner,
    /inputProof\?\.touchInteraction\?\.runId[\s\S]*missionProof\?\.runId/,
  )
  assert.match(runner, /missionProof\?\.phase !== 'completed'/)
  assert.match(runner, /missionProof\?\.transitions\?\.length !== 3/)
  assert.match(
    runner,
    /gameplayNetworkBlock:\s*\{[\s\S]*?source: 'flight-runtime-network-guard'/,
  )
  assert.match(
    deadlineVerifier,
    /runtime\.rejectFlightSimGameplayNetworkAttempt\(/,
  )
  assert.match(deadlineVerifier, /networkExecutorInvoked = true/)
  assert.match(deadlineVerifier, /websocketExecutorInvoked = true/)
  assert.doesNotMatch(deadlineVerifier, /await window\.fetch\(attemptPath\)/)
  assert.match(runner, /gameplayWebSocketBlock:\s*\{[\s\S]*?source: 'flight-runtime-network-guard'/)
  assert.match(runner, /gameplayNetworkExecutorInvoked === false/)
  assert.match(runner, /gameplayNetworkMissionStateRetained === true/)
  assert.match(runner, /gameplayWebSocketExecutorInvoked === false/)
  assert.match(runner, /gameplayWebSocketTransportObserved === false/)
  assert.match(runner, /assertExactFlightSimBrowserVerificationLedger/)
  assert.match(verifier, /page\.on\("websocket", record_websocket\)/)
  assert.match(verifier, /context\.route\("\*\*\/\*", route_request\)/)
  assert.match(verifier, /context\.on\("request", record_request\)/)
  assert.match(verifier, /context\.on\("response", record_response\)/)
  assert.doesNotMatch(verifier, /page\.route\("\*\*\/\*", route_request\)/)
  assert.doesNotMatch(verifier, /page\.on\("request", record_request\)/)
  assert.doesNotMatch(verifier, /page\.on\("response", record_response\)/)
  assert.match(verifier, /request\.service_worker is not None/)
  assert.doesNotMatch(verifier, /request\.frame/)
  assert.match(verifier, /"serviceWorkerRequests": \[/)
  assert.match(verifier, /context\.route_web_socket\("\*\*\/\*", route_websocket\)/)
  for (const prePageContextOwner of [
    'context.route("**/*", route_request)',
    'context.on("request", record_request)',
    'context.on("response", record_response)',
    'context.route_web_socket("**/*", route_websocket)',
  ]) {
    assert.ok(
      verifier.indexOf(prePageContextOwner)
        < verifier.indexOf('page = context.new_page()'),
    )
  }
  assert.doesNotMatch(verifier, /page\.route_web_socket\(websocket_probe_url/)
  assert.doesNotMatch(verifier, /\.connect_to_server\(/)
  assert.match(verifier, /"webSocketAttempts": \{/)
  assert.match(verifier, /"optionalBeacon": active_scene\["optionalBeacon"\]/)
  assert.match(runner, /assertExactFlightSimOptionalBeaconAdmission\(/)
  assert.match(touchVerifier, /chromium-cdp-emulated-touch/)
  assert.match(touchVerifier, /pointer_down\.get\("isTrusted"\) is not True/)
  assert.match(missionVerifier, /accelerated-public-production-runtime/)
  assert.match(missionVerifier, /snapshot\.tick !== prior\.tick \+ 1/)
  assert.match(
    cameraTrackingVerifier,
    /document\.elementFromPoint\(x, y\) === canvas/,
  )
  assert.match(
    cameraTrackingVerifier,
    /get_by_label\("Capture flight pointer", exact=True\)/,
  )
  assert.match(
    cameraVerifier,
    /map_interaction = verify_map_pointer_drag\(page\)/,
  )
  assert.match(cameraTrackingVerifier, /hit_tested_map_canvas_point\(page\)/)
  assert.match(cameraTrackingVerifier, /page\.mouse\.down\(\)/)
  assert.doesNotMatch(cameraVerifier, /canvas\.bounding_box\(\)/)
  assert.doesNotMatch(
    cameraTrackingVerifier,
    /canvas\.click\(\s*force=True/,
  )
  assert.match(
    touchSurfaceVerifier,
    /MOBILE_TOUCH_OCCLUDER_CLOSE_LIMIT = 3/,
  )
  assert.match(
    touchSurfaceVerifier,
    /\[aria-label="Workspace editor overlay shell"\]/,
  )
  assert.match(
    touchSurfaceVerifier,
    /main\[aria-label="Markdown Editor and Viewer"\]/,
  )
  assert.match(
    touchSurfaceVerifier,
    /\[data-kg-floating-panel-root="true"\]/,
  )
  assert.match(touchSurfaceVerifier, /button\[title="Close"\]/)
  assert.match(touchSurfaceVerifier, /close_button\.first\.click\(timeout=5_000\)/)
  assert.match(
    touchSurfaceVerifier,
    /const topHit = document\.elementFromPoint\(center\.x, center\.y\)/,
  )
  assert.match(
    touchSurfaceVerifier,
    /topHit === control \|\| Boolean\(topHit && control\.contains\(topHit\)\)/,
  )
  assert.doesNotMatch(touchSurfaceVerifier, /elementsFromPoint/)
  assert.doesNotMatch(touchSurfaceVerifier, /\.click\(\s*force=True/)
  assert.doesNotMatch(
    touchSurfaceVerifier,
    /setFloatingPanelOpen\(false\)|setWorkspaceViewState\(/,
  )
  assert.doesNotMatch(
    touchVerifier,
    /dispatchEvent\(new (?:PointerEvent|TouchEvent|MouseEvent)/,
  )
  assert.match(
    touchVerifier,
    /\[data-kg-three-canvas-owner="1"\]/,
  )
  assert.ok(
    touchVerifier.indexOf('"Emulation.setTouchEmulationEnabled"')
      < touchVerifier.indexOf('box = control.bounding_box()'),
  )
  assert.ok(
    touchVerifier.indexOf('box = control.bounding_box()')
      < touchVerifier.indexOf('"Input.dispatchTouchEvent"'),
  )
  assert.match(sceneVerifier, /expected_landing_state = \(/)
  assert.match(
    sceneVerifier,
    /map_overlay\.get\("landingStates"\)/,
  )
  assert.match(sceneVerifier, /mission_phase == "completed"/)
  assert.match(
    sceneVerifier,
    /map_overlay\.get\("pendingWaypointCount"\)/,
  )
  assert.match(sceneVerifier, /scene\.get\("flightVisualCount"\) != 0/)
  assert.match(
    serverOwner,
    /refusing responsive pre-existing server/,
  )
  assert.match(serverOwner, /Unsupported devServerStartMode/)
  assert.match(serverOwner, /devServerStartMode === 'vite-preview-runner'/)
  assert.match(serverOwner, /\['--outDir', previewOutDir\]/)
  assert.match(launcherRegression, /runLocalViteBrowserSmoke\(\{/)
  assert.match(launcherRegression, /existingServerPolicy: 'forbid'/)
  assert.match(launcherRegression, /devServerStartMode: 'vite-preview-runner'/)
  assert.match(launcherRegression, /previewOutDir,/)
  assert.match(launcherRegression, /kgFlightSimPreactivationReady = '1'/)
  assert.match(
    previewPageVerifier,
    /context\.route_web_socket\("\*\*\/\*", block_websocket\)/,
  )
  assert.ok(
    previewPageVerifier.indexOf(
      'context.route_web_socket("**/*", block_websocket)',
    ) < previewPageVerifier.indexOf('page = context.new_page()'),
  )
  assert.doesNotMatch(previewPageVerifier, /\.connect_to_server\(/)
  assert.match(
    previewPageVerifier,
    /data-kg-flight-sim-hud="1"/,
  )
  for (const proofField of [
    'runtimeRevision',
    'FIRST_PLAYABLE_FRAME_LIMIT_MS',
    'touchInteraction',
    'missionProof',
    'verificationLedger',
  ]) {
    assert.match(verifier, new RegExp(proofField))
  }
  for (const proofField of [
    'authoredSeedSha256',
    'workspaceSourceSha256',
    'durationMs',
    'verify_flight_deadline_contracts',
    'verify_mobile_touch_interaction',
    'complete_authored_flight_mission',
  ]) {
    assert.match(runtimePhases, new RegExp(proofField))
  }
  assert.ok(
    runtimePhases.indexOf(
      'source_application, source = apply_and_verify_exact_authored_source',
    )
      < runtimePhases.indexOf("page.locator('[data-kg-flight-sim-hud=\"1\"]')"),
  )
  assert.ok(
    runtimePhases.indexOf('"runtime deadline contracts"')
      < runtimePhases.indexOf('"first playable frame"'),
  )
  assert.match(
    runtimePhases,
    /"first playable frame"[\s\S]*depends_on=\("runtime deadline contracts",\)/,
  )
})
