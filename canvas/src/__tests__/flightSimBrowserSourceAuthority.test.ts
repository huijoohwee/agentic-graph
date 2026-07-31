import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { readFlightSimBrowserAuthoritySources } from './helpers/flightSimBrowserSourceAuthorityFiles'
const repoRoot = resolve(process.cwd(), '..')
test('Flight browser proof activates only after applying the authored source', () => {
  const {
    browserBootstrap,
    browserProofBridge,
    cameraTrackingVerifier,
    cameraVerifier,
    citySemanticMediaVerifier,
    deadlineVerifier,
    evidenceValidator,
    geoXrLayoutVerifier,
    geoXrPresentationVerifier,
    geoXrRequirementsVerifier,
    geoXrVerifier,
    gympgrphApi,
    launcherRegression,
    mainEntry,
    missionVerifier,
    networkBoundary,
    previewPageVerifier,
    runner,
    runtimePhases,
    sceneVerifier,
    serverOwner,
    sourceSelection,
    sourceVerifier,
    touchSurfaceVerifier,
    touchVerifier,
    verifier,
  } = readFlightSimBrowserAuthoritySources(repoRoot)
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
  assert.match(evidenceValidator, /knowgrph-flight-sim-browser-run\/v5/)
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
  assert.match(browserProofBridge, /gympgrphStore: \(\) => import\('@\/lib\/gympgrph\/api'\)/)
  assert.match(gympgrphApi, /CITY_GEO_XR_LAYER_ORDER[\s\S]*hasExactCityGeoXrLayerOrder[\s\S]*readCityGeoXrLayerOrder/)
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
  assert.match(
    geoXrVerifier,
    /layout_occlusion = read_geo_xr_layout_occlusion\(page\)/,
  )
  assert.match(
    geoXrVerifier,
    /view\["mapPointerHit"\] = layout_occlusion\.get\("mapPointerHit"\)/,
  )
  assert.doesNotMatch(geoXrVerifier, /const candidates = \[/)
  assert.match(
    geoXrRequirementsVerifier,
    /environment\.stageFootprintAuthoredMeters/,
  )
  assert.match(geoXrRequirementsVerifier, /environment\.majorPoiAuthoredMeters/)
  assert.match(geoXrRequirementsVerifier, /environment\.majorPoiIds/)
  assert.match(geoXrRequirementsVerifier, /height_meters=0\.08/)
  assert.match(geoXrRequirementsVerifier, /width_meters=32/)
  assert.match(geoXrRequirementsVerifier, /height_meters=3\.6/)
  assert.doesNotMatch(geoXrLayoutVerifier, /heightMeters >= 20/)
  assert.match(
    geoXrLayoutVerifier,
    /proof\.id === 'marina-bay-sands:tower-center'/,
  )
  assert.match(
    geoXrPresentationVerifier,
    /def restore_flight_sim_panel\(page: Page\) -> None:/,
  )
  assert.match(
    geoXrPresentationVerifier,
    /state\.setFloatingPanelView\('flightSim'\)/,
  )
  assert.match(
    geoXrPresentationVerifier,
    /\[data-kg-flight-sim-floating-panel="1"\]'.*wait_for\(/s,
  )
  assert.match(
    geoXrPresentationVerifier,
    /def verify_flight_geo_xr_city_handoff\(/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /surface\?\.tagName \|\| ''/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /surface\?\.getAttribute\('aria-label'\) \|\| ''/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /data-kg-rich-media-selectable-surface/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /surface\?\.hasAttribute\('aria-hidden'\) === true/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /surface\.querySelectorAll\('canvas\.maplibregl-canvas'\)/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /document\.elementFromPoint\(/,
  )
  assert.match(
    citySemanticMediaVerifier,
    /centerHit === mapCanvas[\s\S]*mapInteractiveRoot\?\.contains\(centerHit\)/,
  )
  for (const cityProofRequirement of [
    'data-kg-floating-panel-view-trigger="cityBuilder"',
    'data-kg-city-sim-open="1"',
    'data-kg-city-sim-exit="1"',
    'data-kg-flight-sim-open="1"',
    'geospatialPreferenceEnabled',
    'mapLibreCanvasCount',
    'threeCanvasOwnerCount',
    'citySemanticSurfaceActive',
    'citySemanticSurfaceNodeName',
    'citySemanticSurfaceAccessibleName',
    'citySemanticSurfaceSelectableMarker',
    'citySemanticSurfaceAriaHidden',
    'citySemanticSurfaceVisibleMapLibreCanvasCount',
    'citySemanticSurfaceCenterMapLibreOwned',
    'cityMapLibreOwnerCount',
    'flightLayersReady',
    'overlayPhase',
    'overlayRoutePointCount',
    'sourceKinds',
    'environmentSourceFeatures',
    'environmentPoiIds',
    'renderedEnvironmentPoiIds',
    'environmentSourceExactlyMatchesOverlay',
    'cityGeoXrLayerOrderExact',
    'renderedEnvironmentFeatureCount',
  ]) {
    assert.ok(
      geoXrPresentationVerifier.includes(cityProofRequirement),
      `expected City handoff browser proof requirement: ${cityProofRequirement}`,
    )
  }
  const selectGeoViewIndex = geoXrPresentationVerifier.indexOf(
    'select_geo_xr_view(page, button_label)',
  )
  const restoreFlightPanelIndex = geoXrPresentationVerifier.indexOf(
    'restore_flight_sim_panel(page)',
    selectGeoViewIndex,
  )
  assert.ok(
    selectGeoViewIndex
      < geoXrPresentationVerifier.indexOf(
        'expected_view=view_mode',
        selectGeoViewIndex,
      )
      && geoXrPresentationVerifier.indexOf(
        'expected_view=view_mode',
        selectGeoViewIndex,
      ) < restoreFlightPanelIndex
      && restoreFlightPanelIndex
      < geoXrPresentationVerifier.indexOf(
        'require_visual_layout=True',
        restoreFlightPanelIndex,
      ),
    'expected each Geo view control to transition back to Flight Sim before its visual assertion',
  )
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
      /window\.__kgFlightSimBrowserProof\.importModule\(\s*'([^']+)'\s*,?\s*\)/g,
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
    evidenceValidator,
    /candidate\?\.runtimeRevision !== candidateHead/,
  )
  assert.match(
    evidenceValidator,
    /candidate\?\.runtimeBranch !== candidateBranch/,
  )
  assert.match(
    evidenceValidator,
    /source\?\.authoredSeedSha256 !== sourceSha256/,
  )
  assert.match(
    evidenceValidator,
    /source\?\.workspaceSourceSha256 !== sourceSha256/,
  )
  assert.match(
    evidenceValidator,
    /inputProof\?\.touchInteraction\?\.runId[\s\S]*missionProof\?\.runId/,
  )
  assert.match(evidenceValidator, /missionProof\?\.phase !== 'completed'/)
  assert.match(evidenceValidator, /missionProof\?\.transitions\?\.length !== 3/)
  assert.match(
    evidenceValidator,
    /gameplayNetworkBlock:\s*\{[\s\S]*?source: 'flight-runtime-network-guard'/,
  )
  assert.match(
    deadlineVerifier,
    /runtime\.rejectFlightSimGameplayNetworkAttempt\(/,
  )
  assert.match(deadlineVerifier, /networkExecutorInvoked = true/)
  assert.match(deadlineVerifier, /websocketExecutorInvoked = true/)
  assert.doesNotMatch(deadlineVerifier, /await window\.fetch\(attemptPath\)/)
  assert.match(evidenceValidator, /gameplayWebSocketBlock:\s*\{[\s\S]*?source: 'flight-runtime-network-guard'/)
  assert.match(evidenceValidator, /gameplayNetworkExecutorInvoked === false/)
  assert.match(evidenceValidator, /gameplayNetworkMissionStateRetained === true/)
  assert.match(evidenceValidator, /gameplayWebSocketExecutorInvoked === false/)
  assert.match(evidenceValidator, /gameplayWebSocketTransportObserved === false/)
  assert.match(evidenceValidator, /assertExactFlightSimBrowserVerificationLedger/)
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
  assert.match(evidenceValidator, /assertExactFlightSimOptionalBeaconAdmission\(/)
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
    cameraTrackingVerifier,
    /value\.get\("viewMode"\) in \{"3d", "3d-modern"\}/,
  )
  assert.match(
    cameraTrackingVerifier,
    /expected_pitch = preset\["pitch"\] if mode_3d else 0/,
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
  assert.match(
    missionVerifier,
    /const currentRunDecisions = snapshot\.pendingDecisions\.filter\([\s\S]*item => item\.payload\?\.runId === snapshot\.runId/,
  )
  assert.match(
    missionVerifier,
    /const waypointDecisions = currentRunDecisions\.filter/,
  )
  assert.match(
    missionVerifier,
    /const terminalDecisions = currentRunDecisions\.filter/,
  )
  assert.match(missionVerifier, /snapshot\.runId !== prior\.runId/)
  assert.match(missionVerifier, /snapshot\.runId !== expectedRunId/)
})
