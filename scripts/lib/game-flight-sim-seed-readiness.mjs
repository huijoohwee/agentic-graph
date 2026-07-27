import {
  requireOrderedSourceMarkers as requireOrderedMarkers,
  requireSourceMarkers as requireMarkers,
} from './source-readiness-assertions.mjs'

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && JSON.stringify(actual) === JSON.stringify(expected)
}

function exactRecord(actual, expected) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
  const actualKeys = Object.keys(actual).sort()
  const expectedKeys = Object.keys(expected).sort()
  return exactArray(actualKeys, expectedKeys)
    && expectedKeys.every(key => actual[key] === expected[key])
}

export async function assertFlightSimSeedReadiness({
  seed,
  flightSeedPath,
  physicsSeedPath,
  readText,
}) {
  const runReadyDemo = seed.run_ready_demo
  const sharedScene = seed.shared_xr_scene
  const geoFlightOverlay = seed.geo_flight_overlay
  const assetPipeline = seed.asset_pipeline
  const flightSim = seed.flight_sim
  const training = seed.flight_training
  if (
    seed.status !== 'runtime-ready'
    || seed.runtime_status !== 'runtime-ready'
    || seed.runtime_claim !== 'local-runtime-ready'
    || seed.evidence_status !== 'exact-head source and browser proof required at every handoff'
    || seed.publish_scope !== 'local-only'
    || seed.authority_role !== 'derived runtime activation/proof projection'
    || seed.normative_kiro_authority !== '/.kiro/specs/knowgrph-game-flight-sim/'
    || seed.workspace_root_kiro_projection !== 'byte-identical local projection only; never a second authority'
    || seed.kgCanvasSurfaceMode !== 'xr'
    || seed.kgCanvasRenderMode !== '3d'
    || seed.kgCanvas3dMode !== 'xr'
    || !runReadyDemo
    || runReadyDemo.id !== 'flight-sim'
    || runReadyDemo.activation !== 'applied-source-document'
    || runReadyDemo.identity_conflict !== 'fail closed when path and source identity disagree'
    || runReadyDemo.canonical_source_file !== `/${flightSeedPath}`
    || runReadyDemo.presentation !== 'shared-xr-gameplay-overlay'
    || !Array.isArray(runReadyDemo.external_dependencies)
    || runReadyDemo.external_dependencies.length !== 0
    || !sharedScene
    || sharedScene.source_authority !== `/${physicsSeedPath}`
    || sharedScene.world_ownership !== 'overlay-only'
    || sharedScene.surface_owner !== 'XR Mode'
    || sharedScene.renderer_owner !== 'canvas/src/lib/three/ThreeGraph.impl.tsx'
    || sharedScene.collider_owner !== 'canvas/src/features/three/xrCanonicalSceneSpatialSource.ts'
    || sharedScene.camera_owner !== 'canvas/src/features/three/useXrNativeControllerDemoCamera.ts'
    || sharedScene.second_canvas_forbidden !== true
    || !geoFlightOverlay
    || geoFlightOverlay.activation !== 'selected authored environment plus source-authored Flight identity'
    || geoFlightOverlay.renderer_owner !== 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx'
    || geoFlightOverlay.overlay_owner !== 'canvas/src/features/game-flight-sim/FlightSimGeoSurfaceOverlay.tsx'
    || geoFlightOverlay.control_owner !== 'canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts'
    || geoFlightOverlay.route_projection_owner !== 'canvas/src/features/game-flight-sim/flightSimNavigationProjection.ts'
    || geoFlightOverlay.xr_canvas_mounted !== false
    || geoFlightOverlay.map_interaction_preserved !== true
    || !flightSim
    || flightSim.invocation !== '/flight.sim @canvas #flight operation=open'
    || flightSim.inspect_tool !== 'knowgrph.inspect_local_flight_sim'
    || flightSim.control_tool !== 'knowgrph.control_local_flight_sim'
  ) {
    throw new Error('Flight Sim seed must remain a source-authored overlay on the canonical XR or Geo surface')
  }
  if (
    !assetPipeline
    || !String(assetPipeline.primary || '').includes('TypeScript + JSON')
    || !String(assetPipeline.admission || '').includes('required vehicle-airplane')
    || !String(assetPipeline.opaque_binary_fallback || '').includes('optional-beacon')
    || assetPipeline.required_aircraft_glb_fallback_count !== 0
    || assetPipeline.optional_prop_glb_fallback_count !== 1
    || assetPipeline.glb_fallback_count !== 1
    || assetPipeline.optional_glb_sha256 !== 'be41f87bb745ba35c439336d932dd69c34223d26e117443a3c8556e44fce70cd'
    || assetPipeline.optional_glb_license !== 'CC0-1.0'
    || assetPipeline.runtime_model_calls !== 0
    || assetPipeline.runtime_network_calls !== 0
    || assetPipeline.external_reference_policy !== 'conceptual principles only; external project identity and URL are prohibited in product source and runtime metadata; no external project dependency'
    || assetPipeline.no_copy_scan_scope !== 'Flight-owned tracked paths for external repository locators, vendored paths, opaque source binaries, and missing policy markers'
    || assetPipeline.provenance_attestation !== 'Knowgrph contributors attest that the Flight Sim implementation, instructional content, and assets are source-authored'
    || assetPipeline.no_copy_gate_limitation !== 'the deterministic clean-room scanner cannot prove the absence of arbitrary derived code'
  ) {
    throw new Error('Flight Sim seed must retain tracked local asset authority and honest clean-room proof boundaries')
  }

  if (
    !training
    || !exactArray(
      training.missions,
      ['circuit-foundation', 'night-circuit', 'systems-recovery'],
    )
    || !exactArray(
      training.mission_outcomes,
      ['route progress', 'stable attitude', 'energy envelope', 'failure recovery', 'terminal result'],
    )
    || !exactArray(training.score_range, [0, 100])
    || !exactArray(training.terminal_grades, ['A', 'B', 'C', 'D'])
    || training.systems_first !== true
    || training.voice_instructor !== 'explicit browser speech synthesis over the visible deterministic coaching cue; text fallback always remains'
    || !exactArray(
      training.practice_failures,
      ['none', 'engine-power-loss', 'instrument-uncertainty', 'control-bias'],
    )
    || training.failure_tick_window !== '180 inclusive through 420 exclusive'
    || training.night_owner !== 'shared authored XR atmosphere and lighting'
    || !exactArray(
      training.panel_surfaces,
      ['media', 'animation', 'motion-control', 'game-mode', 'flight-sim', 'camera'],
    )
    || training.outcome_schema !== 'knowgrph-flight-training-outcome/v1'
    || training.outcome_persistence !== 'one idempotent dialogue_outcome Decision on explicit terminal Save; never auto-save'
  ) {
    throw new Error('Flight Sim seed must retain mission training, scoring, voice, failure, and six-panel projection contracts')
  }

  const nativeFlightDemo = seed.native_flight_demo
  if (
    !nativeFlightDemo
    || nativeFlightDemo.deterministic_step !== true
    || nativeFlightDemo.fixed_step !== 'exactly 1/60 second (approximately 16.667 ms, 60 Hz)'
    || nativeFlightDemo.max_catch_up_ticks_per_advance !== 5
    || nativeFlightDemo.waypoint_count !== 3
    || nativeFlightDemo.landing_pad_count !== 1
    || nativeFlightDemo.capture_radius_meters !== 50
    || !exactArray(
      nativeFlightDemo.lifecycle,
      ['develop-and-run', 'pause', 'resume', 'reset', 'exit'],
    )
  ) {
    throw new Error('Flight Sim seed must retain its exact fixed-step mission and lifecycle contract')
  }

  if (
    !exactArray(
      flightSim.operations,
      [
        'open', 'start', 'stop', 'restart', 'throttle',
        'mission-foundation', 'mission-night', 'mission-systems',
        'failure-none', 'failure-engine', 'failure-instruments', 'failure-controls',
        'voice-on', 'voice-off', 'coach',
        'save', 'exit',
      ],
    )
    || flightSim.simulation_clock !== 'exact 1/60-second fixed ticks, at most five catch-up ticks per advance, ready at tick zero until normalized desktop, pointer, touch, gamepad, Motion Control, or MCP input'
    || !exactArray(
      flightSim.transactional_system_order,
      [
        'InputIntegrationSystem',
        'FlightModelSystem',
        'CollisionResolverSystem',
        'ObjectiveSystem',
      ],
    )
    || flightSim.cost_log_owner !== 'AgenticECS.worldTick:post-systems'
    || flightSim.projection_owner !== 'captureFlightSimMission:post-commit'
    || flightSim.system_contract_reconciliation !== 'four meaningful journaled systems; Cost_Log is harness-owned after systems and render/HUD projection is captured only after commit'
  ) {
    throw new Error('Flight Sim seed must retain four transactional systems and its post-step owners')
  }

  if (
    !exactRecord(flightSim.normal_cost_log, {
      model: 'none',
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hits: 0,
      estimated_cost_usd: 0,
      incomplete: false,
    })
    || !exactRecord(flightSim.blocked_inference_cost_log, {
      model: 'none',
      prompt_tokens: 'unknown',
      completion_tokens: 'unknown',
      cache_hits: 0,
      estimated_cost_usd: 0,
      incomplete: true,
      error: 'blocked_inference',
    })
  ) {
    throw new Error('Flight Sim seed Cost_Log examples must use the exact canonical fields')
  }

  if (
    flightSim.exit_world_behavior !== 'dispose and discard the ECS World, pending state, and unsaved mission progress'
    || flightSim.stop_start !== 'resume the exact in-memory mission tick and state'
    || flightSim.decision_persistence !== 'browser-local WorkspaceFs; terminal Decisions remain pending until explicit Save and are never auto-saved'
    || !exactArray(
      flightSim.admitted_decision_types,
      ['dialogue_outcome', 'quest_flag', 'world_tick_result'],
    )
    || flightSim.malformed_hydration !== 'preserve bytes and block Start and Restart until explicit Reset'
    || flightSim.validation_input_forbid_hardcode_in_repo !== true
  ) {
    throw new Error('Flight Sim seed must retain Decisions-only lifecycle and persistence boundaries')
  }

  const runtimeValidation = seed.runtime_validation
  if (
    !runtimeValidation
    || !exactArray(runtimeValidation.required_states, ['ready', 'flying', 'stopped'])
    || runtimeValidation.replayable !== true
    || runtimeValidation.local_assets_only !== true
    || runtimeValidation.required_external_calls !== false
    || runtimeValidation.first_playable_frame_limit_ms !== 3000
    || runtimeValidation.property_proof !== '45 named fast-check properties at 100 runs each (4,500 generated cases)'
    || runtimeValidation.focused_source_tests_minimum !== 127
    || typeof runtimeValidation.browser_proof !== 'string'
    || !runtimeValidation.browser_proof.includes('two fresh serial runs')
    || !runtimeValidation.browser_proof.includes('clean branch, HEAD, tree, authored seed SHA-256, and source path before launch')
    || !exactArray(runtimeValidation.browser_evidence, [
      'data/outputs/game-flight-sim-browser-smoke-run-1.json',
      'data/outputs/game-flight-sim-browser-smoke-run-2.json',
    ])
    || runtimeValidation.status !== 'local runtime-ready; exact-head source/browser evidence required at every handoff; protected integration pending'
  ) {
    throw new Error('Flight Sim seed must retain explicit source, browser, and protected-integration proof fields')
  }

  const grammarAutoHydrationSource = await readText(
    'canvas/src/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration.tsx',
  )
  requireMarkers(grammarAutoHydrationSource, [
    'AgenticOsRemoteGrammarAutoHydrationContext = React.createContext(true)',
    'useSourceFilesBootstrapReady()',
    'isNativeXrRunReadyDemoActive(',
    'args.runtimeIdentityProofRequested || !args.offlineNativeXrActive',
  ], 'offline native XR automatic grammar fence')
  const grammarClientSource = await readText(
    'canvas/src/features/agentic-os/agenticOsRemoteGrammarClient.ts',
  )
  requireMarkers(grammarClientSource, [
    'useAgenticOsRemoteGrammarAutoHydration()',
    'if (!autoHydrationAllowed || sigils.length === 0) return',
  ], 'automatic remote grammar hydration policy')
  const appSource = await readText('canvas/src/App.tsx')
  requireOrderedMarkers(appSource, [
    '<CanvasSourceAuthorityBoundary>',
    '<AgenticOsRemoteGrammarAutoHydrationBoundary>',
    '<KnowgrphRuntimeIdentityRuntime />',
  ], 'source-aware automatic grammar boundary')

  const runReadySource = await readText(
    'canvas/src/features/workspace-fs/workspaceRunReadyDemos.ts',
  )
  requireMarkers(runReadySource, [
    "export const FLIGHT_SIM_RUN_READY_DEMO_ID = 'flight-sim'",
    'export const diagnoseWorkspaceRunReadyDemoActivation = (',
    'export const resolveWorkspaceRunReadyDemoIdForDocument = (',
    "'RUN_READY_IDENTITY_CONFLICT'",
    "'RUN_READY_IDENTITY_UNREGISTERED'",
    "return diagnostic.ok ? diagnostic.id : ''",
    'readWorkspaceRunReadyDemoId(documentPath, documentText) === FLIGHT_SIM_RUN_READY_DEMO_ID',
  ], 'source-authored Flight Sim activation')
  const activationSource = await readText(
    'canvas/src/features/canvas/FlightSimRunReadyDemoRuntime.tsx',
  )
  requireMarkers(activationSource, [
    'isFlightSimRunReadyDemoActive(markdownDocumentName, markdownDocumentText)',
    'ownsDocumentLaunchRef',
    'exitFlightSimSurface({ restorePreviousSurface: false })',
  ], 'Flight Sim source activation runtime')

  const trainingSource = await readText(
    'canvas/src/features/game-flight-sim/flightSimTrainingScenario.ts',
  ) + await readText(
    'canvas/src/features/game-flight-sim/flightSimTrainingRuntime.ts',
  ) + await readText(
    'canvas/src/features/game-flight-sim/FlightSimTrainingSurfaceProjection.tsx',
  )
  requireMarkers(trainingSource, [
    "'circuit-foundation'",
    "'night-circuit'",
    "'systems-recovery'",
    "'engine-power-loss'",
    "'instrument-uncertainty'",
    "'control-bias'",
    'tick >= 180',
    'tick < 420',
    'score: training.score',
    "schema: 'knowgrph-flight-training-outcome/v1'",
    'window.speechSynthesis.speak(utterance)',
    'data-kg-flight-training-score',
  ], 'mission-based Flight training runtime')

  const panelProjectionSource = await Promise.all([
    'canvas/src/features/command-menu/MediaCatalogPanelView.tsx',
    'canvas/src/features/three/XrAnimationFloatingPanelView.tsx',
    'canvas/src/features/three/MotionControlFloatingPanelView.tsx',
    'canvas/src/features/game-fps/GameModeFloatingPanelView.tsx',
    'canvas/src/features/game-flight-sim/FlightSimFloatingPanelView.tsx',
    'canvas/src/features/strybldr/StrybldrCameraFloatingPanelView.tsx',
  ].map(path => readText(path)))
  requireMarkers(panelProjectionSource.join('\n'), [
    'surface="media"',
    'surface="animation"',
    'surface="motion-control"',
    'surface="game-mode"',
    'surface="flight-sim"',
    'surface="camera"',
  ], 'six FloatingPanel Flight training projections')

  const trainingOwners = await readText(
    'canvas/src/features/three/XrNativeControllerDemoEnvironment.tsx',
  ) + await readText(
    'canvas/src/features/three/XrNativeControllerDemoStage.tsx',
  ) + await readText(
    'canvas/src/lib/three/flightSimMissionStageLoader.ts',
  )
  requireMarkers(trainingOwners, [
    "night ? '#050a1a'",
    'intensity={night ? 0.13 : 0.4}',
    'importWithRetry(importMissionStage',
    'retries: 2',
    'retryDelayMs: 50',
  ], 'shared-owner night presentation and bounded mission-stage retry')
}
