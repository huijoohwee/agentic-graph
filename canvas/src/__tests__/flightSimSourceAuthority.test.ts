import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { load as loadYaml } from 'js-yaml'
import { FLIGHT_SIM_CAMERA_VIEW_OPTIONS } from '@/features/game-flight-sim/flightSimCameraRuntime'
import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  XR_NATIVE_CONTROLLER_CAMERA_OPTIONS,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  diagnoseWorkspaceRunReadyDemoActivation,
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  FLIGHT_SIM_RUN_READY_DEMO_ID,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
  resolveWorkspaceRunReadyDemoIdForDocument,
  resolveWorkspaceRunReadyDemoSeed,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

const repoRoot = resolve(process.cwd(), '..')
const seedPath = resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH)
const seedSource = readFileSync(seedPath, 'utf8')
const physicsSeedSource = readFileSync(
  resolve(repoRoot, XR_PHYSICS_DEMO_REPO_REL_PATH),
  'utf8',
)

function frontmatter(source: string): Record<string, unknown> {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match)
  const parsed = loadYaml(match[1])
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  return parsed as Record<string, unknown>
}

test('Flight Sim activation is source-authored and path conflicts fail closed', () => {
  assert.equal(
    resolveWorkspaceRunReadyDemoSeed(FLIGHT_SIM_RUN_READY_DEMO_ID)?.validationSeedRelPath,
    FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument('/imports/local-flight.md', seedSource),
    FLIGHT_SIM_RUN_READY_DEMO_ID,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument(FLIGHT_SIM_DEMO_REPO_REL_PATH, seedSource),
    FLIGHT_SIM_RUN_READY_DEMO_ID,
  )
  assert.equal(
    resolveWorkspaceRunReadyDemoIdForDocument(XR_PHYSICS_DEMO_REPO_REL_PATH, seedSource),
    '',
  )
  const conflict = diagnoseWorkspaceRunReadyDemoActivation(
    XR_PHYSICS_DEMO_REPO_REL_PATH,
    seedSource,
  )
  assert.equal(conflict.ok, false)
  if (conflict.ok === false) {
    assert.equal(conflict.errorCode, 'RUN_READY_IDENTITY_CONFLICT')
    assert.match(conflict.message, /xr-physics/)
    assert.match(conflict.message, /flight-sim/)
  }
  const unregistered = diagnoseWorkspaceRunReadyDemoActivation(
    '/imports/unknown.md',
    seedSource.replace('id: "flight-sim"', 'id: "unregistered-flight"'),
  )
  assert.equal(unregistered.ok, false)
  if (unregistered.ok === false) {
    assert.equal(unregistered.errorCode, 'RUN_READY_IDENTITY_UNREGISTERED')
    assert.match(unregistered.message, /unregistered-flight/)
  }
})

test('Flight surface opening preloads the existing lazy mission stage before activation', () => {
  const viteConfig = readFileSync(
    resolve(repoRoot, 'canvas/vite.config.ts'),
    'utf8',
  )
  const loader = readFileSync(
    resolve(repoRoot, 'canvas/src/lib/three/flightSimMissionStageLoader.ts'),
    'utf8',
  )
  const overlay = readFileSync(
    resolve(repoRoot, 'canvas/src/lib/three/ThreeGameplayOverlay.tsx'),
    'utf8',
  )
  const runtime = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/flightSimRuntime.ts',
    ),
    'utf8',
  )
  const stageImport =
    "import('@/features/game-flight-sim/FlightSimMissionStage')"
  assert.match(
    viteConfig,
    /optimizeDeps:\s*\{[\s\S]*?include:\s*\[[\s\S]*?'maplibre-gl\/dist\/maplibre-gl\.js'[\s\S]*?'fflate'[\s\S]*?'three\/examples\/jsm\/loaders\/GLTFLoader\.js'/,
  )
  assert.match(
    viteConfig,
    /exclude:\s*\[\s*'gympgrph',\s*'grph-shared',\s*'entities'\s*\]/,
  )
  assert.equal(loader.split(stageImport).length - 1, 1)
  assert.match(
    loader,
    /if \(cachedPromise === requestedPromise\) cachedPromise = null/,
  )
  assert.match(
    overlay,
    /const FlightSimMissionStageLazy = React\.lazy\(loadFlightSimMissionStage\)/,
  )
  assert.match(loader, /module\.createFlightSimMissionStage\(runtimeController\)/)
  assert.match(
    overlay,
    /from '\.\/flightSimMissionStageLoader'/,
  )
  assert.match(
    runtime,
    /from '@\/lib\/three\/flightSimMissionStageLoader'/,
  )
  assert.doesNotMatch(runtime, /from '@\/lib\/three\/ThreeGameplayOverlay'/)
  assert.match(
    runtime,
    /const \[decisions\] = await Promise\.all\(\[[\s\S]*preloadFlightSimMissionStage\(flightSimStageRuntimeController\),[\s\S]*\]\)/,
  )
  const missionStage = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/FlightSimMissionStage.tsx',
    ),
    'utf8',
  )
  const geoSurface = readFileSync(resolve(repoRoot, 'canvas/src/features/game-flight-sim/FlightSimGeoSurfaceOverlay.tsx'), 'utf8')
  const surfaceControls = readFileSync(resolve(repoRoot, 'canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts'), 'utf8')
  assert.doesNotMatch(missionStage, /from '\.\/flightSimRuntime'/)
  assert.match(missionStage, /runtimeController\.readSnapshot\(\)/)
  const opening = runtime.indexOf('async function performFlightSimSurfaceOpen')
  const preload = runtime.indexOf(
    'preloadFlightSimMissionStage(flightSimStageRuntimeController)',
    opening,
  )
  const activation = runtime.indexOf(
    'surfaceActivated = activateXrSceneSurface',
    opening,
  )
  const opened = runtime.indexOf(
    'const opened = defaultRuntime.open(true)',
    opening,
  )
  const preparationRequest = runtime.indexOf(
    'stagePreparationRequestId = beginFlightSimStagePreparation()',
    opening,
  )
  const preparedStage = runtime.indexOf(
    'await waitForFlightSimStagePreparation',
    opening,
  )
  const readyDeadline = runtime.indexOf(
    'return startFlightSimWithReadyFrame',
    opening,
  )
  assert.ok(opening >= 0 && preload > opening)
  assert.ok(preload < activation)
  assert.ok(activation < preparationRequest)
  assert.ok(preparationRequest < opened)
  assert.ok(opened < preparedStage)
  assert.ok(preparedStage < readyDeadline)
  assert.match(missionStage, /addAfterEffect\(\(\) => \{/)
  assert.doesNotMatch(
    missionStage,
    /React\.useState\(\s*readCurrentFlightSimStagePreparationRequest/,
  )
  assert.match(
    missionStage,
    /addAfterEffect\(\(\) => \{[\s\S]*const stagePreparationRequestId =\s*readCurrentFlightSimStagePreparationRequest\(\)/,
  )
  assert.match(
    missionStage,
    /completeFlightSimStagePreparation\(\s*stagePreparationRequestId\s*\)/,
  )
  const afterRenderStart = missionStage.indexOf(
    'const removeAfterRender = addAfterEffect',
  )
  const afterRenderCleanup = missionStage.indexOf(
    'return () => {',
    afterRenderStart,
  )
  const stagePreparationAfterRender = missionStage.slice(
    afterRenderStart,
    afterRenderCleanup,
  )
  assert.doesNotMatch(
    stagePreparationAfterRender,
    /if \(!inputClaimedRef\.current\) return/,
  )
  assert.match(
    stagePreparationAfterRender,
    /completeFlightSimStagePreparation[\s\S]*invalidate\(\)/,
  )
  assert.doesNotMatch(
    missionStage,
    /presentation\.playable\s*=[\s\S]{0,160}inputClaimedRef\.current/,
  )
  assert.match(
    missionStage,
    /import \{ addAfterEffect, invalidate, useFrame, useThree \} from '@react-three\/fiber'/,
  )
  assert.match(missionStage, /const \{ gl \} = useThree\(\)/)
  assert.match(
    missionStage,
    /const syncRuntimeSnapshot = \(\) => \{[\s\S]*snapshotRef\.current = runtimeController\.readSnapshot\(\)[\s\S]*invalidate\(\)/,
  )
  assert.match(
    missionStage,
    /syncRuntimeSnapshot\(\)[\s\S]*return runtimeController\.subscribe\(syncRuntimeSnapshot\)/,
  )
  assert.match(
    surfaceControls,
    /subscribeThreeViewportInputOwnership\(acquireInput\)/,
  )
  assert.match(
    surfaceControls,
    /const acquireInput = \(\) => \{[\s\S]*claimThreeViewportInputOwnership\(INPUT_OWNER_ID,[\s\S]*installFlightSimDesktopInput\(element,[\s\S]*requestPresentationFrame\(\)/,
  )
  assert.match(missionStage, /useFlightSimSurfaceControls\(\{/)
  assert.match(geoSurface, /useFlightSimSurfaceControls\(\{/)
  assert.match(missionStage, /&& actorRef\.current/)
  const demandFrameSubscription = missionStage.indexOf(
    'const syncRuntimeSnapshot = () => {',
  )
  const afterRender = missionStage.indexOf('addAfterEffect(() => {')
  const inputOwnershipRetry = surfaceControls.indexOf(
    'subscribeThreeViewportInputOwnership(acquireInput)',
  )
  const deadlineCompletion = missionStage.indexOf(
    'completeFlightSimReadyFrame(presentation.runId, presentation.tick)',
  )
  const frameSubscriber = missionStage.indexOf('useFrame(() => {')
  assert.ok(demandFrameSubscription >= 0 && afterRender > demandFrameSubscription)
  assert.ok(inputOwnershipRetry >= 0)
  assert.ok(deadlineCompletion > afterRender)
  assert.ok(frameSubscriber > deadlineCompletion)
})

test('Flight surface fencing drains and restores both workspace seed-sync owners', () => {
  const runtime = readFileSync(
    resolve(repoRoot, 'canvas/src/features/game-flight-sim/flightSimRuntime.ts'),
    'utf8',
  )
  const surfaceOpenLifecycle = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/flightSimSurfaceOpenLifecycle.ts',
    ),
    'utf8',
  )
  const sourceFilesBootstrap = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/source-files/SourceFilesPersistenceBootstrap.tsx',
    ),
    'utf8',
  )
  const workspaceExplorer = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/lib/markdown-workspace-runtime/useMarkdownWorkspaceExplorerState.tsx',
    ),
    'utf8',
  )
  const deferredScheduler = readFileSync(resolve(repoRoot, 'canvas/src/lib/workspace/workspaceSeedSyncDeferredScheduler.ts'), 'utf8')
  const storageLifecycle = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesKnowgrphStorageLifecycle.ts'), 'utf8')
  const storageLoader = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesKnowgrphStorageRuntime.ts'), 'utf8')
  const storageClient = readFileSync(
    resolve(repoRoot, 'canvas/src/lib/storage/knowgrphStorageClientRuntime.ts'),
    'utf8',
  )
  const inboundStorageApply = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesInboundStorageApply.ts'), 'utf8')
  assert.match(
    sourceFilesBootstrap,
    /workspaceRematerializeSeedSyncScheduler\.schedule\(request\)/,
  )
  assert.match(
    deferredScheduler,
    /const schedule = \(request:[\s\S]*if \(inFlight\) return/,
  )
  assert.match(
    deferredScheduler,
    /const runScheduledRequest[\s\S]*const request = task\.takePending\(\)[\s\S]*if \(!request\) \{[\s\S]*return/,
  )
  assert.match(
    deferredScheduler,
    /await drainWorkspaceSeedSyncDeferredRequests\([\s\S]*task\.complete\(\)/,
  )
  assert.doesNotMatch(sourceFilesBootstrap, /workspaceMaterializeTimerRef|workspaceMaterializeInFlightRef/)
  assert.match(
    sourceFilesBootstrap,
    /runWorkspaceSeedSyncTask\(signal,[\s\S]*materializeActivePathWithSourceAuthority/,
  )
  assert.match(
    sourceFilesBootstrap,
    /runWorkspaceSeedSyncTask\(controller\.signal,[\s\S]*runBootstrapSourceFileHydration\(\)[\s\S]*materializeBootstrapWorkspaceSourceFiles/,
  )
  assert.match(
    sourceFilesBootstrap,
    /if \(!request\) \{\s*stopKnowgrphStorageWorkspaceRuntime\(\)\s*return/,
  )
  assert.match(
    sourceFilesBootstrap,
    /createKnowgrphStorageCurrentOwnershipHandler\([\s\S]*signal: args\.signal,[\s\S]*taskContext: args\.taskContext[\s\S]*await result\.completion/,
  )
  assert.match(
    sourceFilesBootstrap,
    /knowgrphStorageQueueOperations\.enqueue\(\{ ownership, request \}, async ownedRequest => \{[\s\S]*ownership: capturedOwnership[\s\S]*ensureKnowgrphStorageRuntimeDependencies\(capturedOwnership\)[\s\S]*runWorkspaceSeedSyncTask\(capturedOwnership\.signal,[\s\S]*deps\.syncSourceFilesToKnowgrphStorage/,
  )
  assert.match(
    sourceFilesBootstrap,
    /createKnowgrphStorageLatestOperationRunner<KnowgrphStorageOwnedQueueRequest>[\s\S]*const ownership = knowgrphStorageWorkspaceLifecycle\.readOwnership\(\)[\s\S]*knowgrphStorageQueueOperations\.enqueue\(\{ ownership, request \},[\s\S]*isCurrent\(capturedOwnership\)/,
  )
  assert.match(
    sourceFilesBootstrap,
    /clearKnowgrphStorageQueueState[\s\S]*knowgrphStorageQueueOperations\.clearPending\(\)/,
  )
  assert.match(
    storageLifecycle,
    /const next = pending[\s\S]*if \(next\) start\(next\)/,
  )
  assert.match(
    storageLifecycle,
    /if \(active\) \{\s*pending = entry\s*return\s*\}/,
  )
  assert.equal(
    sourceFilesBootstrap.match(/onPulledChangesApplied: createKnowgrphStoragePulledChangesHandler\(ownership\)/g)?.length,
    2,
  )
  assert.match(storageLifecycle, /lifecycle\.isCurrent\(ownership\) \|\| args\.signal\?\.aborted/)
  assert.match(storageLifecycle, /controller\?\.abort\(reason\)/)
  assert.match(storageLifecycle, /pending = null[\s\S]*pendingSignal = null/)
  assert.match(storageLifecycle, /loadKnowgrphStorageRuntimeDependencies/)
  assert.match(storageLoader, /runWorkspaceSeedSyncTask\(signal,[\s\S]*Promise\.all\(\[/)
  assert.match(storageClient, /runWorkspaceSeedSyncTask\(args\.signal,[\s\S]*pushKnowgrphStorageOutbox[\s\S]*pullKnowgrphStorageChanges/)
  assert.match(inboundStorageApply, /runWorkspaceSeedSyncTask\(signal, operation\)/)
  assert.match(inboundStorageApply, /runWorkspaceSeedSyncTaskWithContext\(taskContext, operation\)/)
  assert.match(inboundStorageApply, /fetch\(requestUrl, \{ signal: args\.signal \}\)/)
  const resumedRefresh = workspaceExplorer.indexOf(
    'return subscribeWorkspaceSeedSyncResumed',
  )
  const resumedActiveCheck = workspaceExplorer.indexOf(
    'if (!runtimeRef.current.active) return',
    resumedRefresh,
  )
  const resumedDeferredClear = workspaceExplorer.indexOf(
    'workspaceRefreshDeferredRef.current = false',
    resumedActiveCheck,
  )
  assert.ok(resumedRefresh >= 0 && resumedActiveCheck > resumedRefresh)
  assert.ok(resumedDeferredClear > resumedActiveCheck)
  assert.match(
    workspaceExplorer,
    /const refreshOnce[\s\S]*const finishSeedSyncTask = beginWorkspaceSeedSyncTask\(\)[\s\S]*workspaceRefreshDeferredRef\.current = true/,
  )
  assert.match(
    workspaceExplorer,
    /if \(!args\.active \|\| !workspaceRefreshDeferredRef\.current\) return[\s\S]*refresh\(\{ silent: true \}\)/,
  )
  const surfaceOpen = runtime.indexOf(
    'async function performFlightSimSurfaceOpen',
  )
  const acquireSyncSuspension = runtime.indexOf(
    'await acquireWorkspaceSeedSyncSuspension(options.signal)',
    surfaceOpen,
  )
  const activateSurface = runtime.indexOf(
    'surfaceActivated = activateXrSceneSurface',
    surfaceOpen,
  )
  const installFence = runtime.indexOf(
    'installFlightSimGameplayNetworkFence',
    activateSurface,
  )
  assert.ok(surfaceOpen >= 0 && acquireSyncSuspension > surfaceOpen)
  assert.ok(acquireSyncSuspension < activateSurface)
  assert.ok(activateSurface < installFence)
  const exitSurface = runtime.indexOf('export function exitFlightSimSurface')
  const uninstallFence = runtime.indexOf(
    'const failures = restoreGameplayNetworkOwnership()',
    exitSurface,
  )
  const releaseSyncSuspension = runtime.indexOf(
    'restoreWorkspaceSeedSyncOwnership()',
    uninstallFence,
  )
  const restorePreviousSurface = runtime.indexOf(
    '...restoreSurfaceOwnership(',
    uninstallFence,
  )
  assert.ok(exitSurface >= 0 && uninstallFence > exitSurface)
  assert.ok(uninstallFence < restorePreviousSurface)
  assert.ok(restorePreviousSurface < releaseSyncSuspension)
  assert.match(
    runtime,
    /invalidateFlightSimSurfaceOpens\(\)[\s\S]*cancelFlightSimHydration\(\)/,
  )
  assert.match(
    runtime,
    /locallyAcquiredSeedSyncRelease =[\s\S]*await acquireWorkspaceSeedSyncSuspension\(options\.signal\)[\s\S]*throwIfFlightSimSurfaceOpenStale\(expectedGeneration\)[\s\S]*releaseFlightSimWorkspaceSeedSyncSuspension =[\s\S]*locallyAcquiredSeedSyncRelease/,
  )
  assert.match(
    runtime,
    /defaultRuntime\.read\(\)\.active \|\| flightSimSurfaceOpenTail/,
  )
  assert.match(
    surfaceOpenLifecycle,
    /openController\.controller\.abort\(new FlightSimSurfaceOpenSettledError\(\)\)/,
  )
})

test('Flight Sim source declares the canonical Geo+XR composition', () => {
  const meta = frontmatter(seedSource)
  assert.equal(meta.status, 'runtime-ready')
  assert.equal(meta.runtime_status, 'runtime-ready')
  assert.equal(meta.runtime_claim, 'local-runtime-ready')
  assert.equal(
    meta.evidence_status,
    'exact-head source and browser proof required at every handoff',
  )
  assert.equal(meta.publish_scope, 'local-only')
  assert.equal(meta.kgCanvasSurfaceMode, 'geo-xr')
  assert.equal(meta.kgCanvasRenderMode, '3d')
  assert.equal(meta.kgCanvas3dMode, 'xr')
  assert.equal(meta.kgCanvas2dRenderer, undefined)
  assert.equal(meta.kgFloatingPanelOpen, true)
  assert.equal(meta.kgFloatingPanelView, 'flightSim')
  assert.equal(
    Object.keys(meta).some(key => key.startsWith('planned_')),
    false,
  )
  assert.deepEqual(meta.run_ready_demo, {
    id: 'flight-sim',
    activation: 'applied-source-document',
    identity_authority: 'source-authored run_ready_demo.id',
    imported_path_alias_required: false,
    identity_conflict: 'fail closed when path and source identity disagree',
    canonical_consumers: ['workspace', 'geo-xr-mode'],
    dev_command: 'npm run dev',
    canonical_source_file: '/docs/workspace-seeds/knowgrph-game-flight-sim-demo.md',
    env_selector: 'VITE_KNOWGRPH_RUN_READY_DEMO=flight-sim',
    validation_seed_path: '/knowgrph-game-flight-sim-demo.md',
    source_root: 'knowgrph/docs',
    source_backed: true,
    clean_canvas_recommended: true,
    native_runtime: true,
    presentation: 'shared-geo-xr-gameplay-overlay',
    document_presentation: 'runtime-ready-workspace-demo',
    auto_start: true,
    external_dependencies: [],
    forbid_external_copy_or_dependency: true,
  })
  assert.deepEqual(meta.shared_xr_scene, {
    source_authority: '/docs/workspace-seeds/knowgrph-physics-playground-demo.md',
    world_ownership: 'overlay-only',
    surface_owner: 'Geo+XR Mode',
    renderer_owner: 'canvas/src/lib/three/ThreeGraph.impl.tsx',
    collider_owner: 'canvas/src/features/three/xrCanonicalSceneSpatialSource.ts',
    camera_owner: 'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
    second_canvas_forbidden: true,
  })
  assert.deepEqual(meta.geo_flight_overlay, {
    activation: 'selected authored environment plus source-authored Flight identity',
    renderer_owner: 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
    overlay_owner: 'canvas/src/lib/three/ThreeGraph.impl.tsx',
    control_owner: 'canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts',
    route_projection_owner: 'canvas/src/features/game-flight-sim/flightSimNavigationProjection.ts',
    xr_canvas_mounted: true,
    map_interaction_preserved: false,
    composition: 'Geo is the visible background below one transparent shared XR Canvas; Flight controls own pointer input',
  })
  const authority = readFileSync(resolve(repoRoot, 'scripts/workspace-seed-authority.mjs'), 'utf8')
  const projectionStart = authority.indexOf('AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY')
  const projectionEnd = authority.indexOf('])', projectionStart)
  const projectionInventory = authority.slice(projectionStart, projectionEnd + 2)
  assert.match(projectionInventory, /PHYSICS_SEED_BASENAME/)
  assert.doesNotMatch(projectionInventory, /FLIGHT_SEED_BASENAME/)
})

test('Flight Sim reuses shared fixed-follow and free-orbit camera ownership', () => {
  const meta = frontmatter(seedSource)
  const physicsMeta = frontmatter(physicsSeedSource)
  const flightCamera = (
    meta.native_flight_demo as { camera?: Record<string, unknown> }
  ).camera!
  const physicsCamera = (
    physicsMeta.native_controller_demo as { camera?: Record<string, unknown> }
  ).camera!
  for (const key of [
    'default',
    'selector',
    'available',
    'invocation',
    'timeline_override',
  ]) {
    assert.deepEqual(flightCamera[key], physicsCamera[key])
  }
  assert.equal(
    flightCamera.catalog_owner,
    'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  )
  assert.equal(
    flightCamera.selection_owner,
    'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  )
  assert.equal(
    flightCamera.driver_owner,
    'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  )
  assert.deepEqual(
    XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.map(option => option.id),
    flightCamera.available,
  )
  assert.equal(XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE, flightCamera.default)
  assert.deepEqual(
    FLIGHT_SIM_CAMERA_VIEW_OPTIONS.map(option => option.id),
    flightCamera.flight_views,
  )
  assert.equal(
    flightCamera.flight_view_owner,
    'canvas/src/features/game-flight-sim/flightSimCameraRuntime.ts',
  )
  assert.deepEqual(
    (meta.native_flight_demo as {
      navigation_inset?: Record<string, unknown>
    }).navigation_inset,
    {
      orientation: 'north-up',
      source: 'authored mission spawn, ordered waypoints, landing pad, and aircraft snapshot',
      projection_owner: 'canvas/src/features/game-flight-sim/flightSimNavigationProjection.ts',
      runtime_network_calls: 0,
      external_map_or_token_required: false,
    },
  )
  const controls = readFileSync(
    resolve(repoRoot, 'canvas/src/features/three/Controls.tsx'),
    'utf8',
  )
  const controllerCamera = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
    ),
    'utf8',
  )
  const flightTarget = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/flightSimFollowTarget.ts',
    ),
    'utf8',
  )
  const physicsRuntime = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/canvas/XrPhysicsRunReadyDemoRuntime.tsx',
    ),
    'utf8',
  )
  assert.match(
    controls,
    /from '\.\/useXrNativeControllerDemoCamera'/,
  )
  assert.match(controls, /useXrNativeControllerDemoCamera\(\{/)
  assert.match(controls, /flightSimActive,/)
  assert.match(
    controllerCamera,
    /readXrNativeControllerCamera\(\)\.mode === 'fixed-follow'/,
  )
  assert.match(controllerCamera, /flightSimActive\s*\?\s*readFlightFollowTarget\(true,/)
  assert.match(controllerCamera, /renderer\.xr\.isPresenting/)
  assert.match(flightTarget, /resolveFlightSimFollowTarget/)
  assert.match(
    physicsRuntime,
    /const active = isNativeXrRunReadyDemoActive\(markdownDocumentName, markdownDocumentText\)/,
  )
  assert.match(physicsRuntime, /pauseXrNativeControllerDemo\(\)/)
  assert.match(physicsRuntime, /resumeXrNativeControllerDemo\(\)/)
  assert.doesNotMatch(
    flightTarget,
    /\b(?:camera|controls)\.(?:position|target|enablePan|enableRotate|enableZoom)/,
  )
  assert.equal(
    existsSync(
      resolve(repoRoot, 'canvas/src/features/three/useFlightSimCamera.ts'),
    ),
    false,
  )
  assert.doesNotMatch(controllerCamera, /new\s+(?:THREE\.)?PerspectiveCamera/)
})
