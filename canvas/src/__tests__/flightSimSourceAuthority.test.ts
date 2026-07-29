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
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
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
  const surfacePresentation = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/flightSimSurfacePresentationRuntime.ts',
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
  const geospatialBridge = readFileSync(resolve(repoRoot, 'canvas/src/components/CanvasViewportGeospatialOverlay.tsx'), 'utf8')
  const surfacePreload = readFileSync(resolve(repoRoot, 'canvas/src/features/game-flight-sim/useFlightSimSurfacePreload.ts'), 'utf8')
  const viewport = readFileSync(resolve(repoRoot, 'canvas/src/components/CanvasViewport.tsx'), 'utf8')
  const runReadyOwner = readFileSync(resolve(repoRoot, 'canvas/src/features/canvas/FlightSimRunReadyDemoRuntime.tsx'), 'utf8')
  const geospatialPresentation = readFileSync(
    resolve(
      repoRoot,
      'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
    ),
    'utf8',
  )
  const surfaceControls = readFileSync(resolve(repoRoot, 'canvas/src/features/game-flight-sim/useFlightSimSurfaceControls.ts'), 'utf8')
  assert.match(surfacePreload, /preloadGeospatialMapRuntime\(\)/)
  assert.match(surfacePreload, /loadCanvasViewportGeospatialOverlay\(\)/)
  assert.match(surfacePreload, /React\.useLayoutEffect\(\(\) =>/)
  assert.match(
    surfacePreload,
    /preloadFlightSimMissionStage\(readFlightSimStageRuntimeController\(\)\)/,
  )
  assert.match(
    viewport,
    /React\.lazy\(loadCanvasViewportGeospatialOverlay\)/,
  )
  assert.match(viewport, /import \{ FlightSimHud \} from '@\/features\/game-flight-sim\/FlightSimHud'/)
  assert.match(viewport, /flightSimHudVisible \? <FlightSimHud \/> : null/)
  assert.doesNotMatch(viewport, /FlightSimHudLazy|loadFlightSimHud/)
  const ownedLaunchGuard = runReadyOwner.indexOf(
    'launchAttempt >= FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT',
  )
  const launchGeneration = runReadyOwner.indexOf(
    'const generation = launchGenerationRef.current + 1',
  )
  assert.ok(ownedLaunchGuard >= 0)
  assert.ok(launchGeneration > ownedLaunchGuard)
  assert.match(
    runReadyOwner,
    /const FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT = 2/,
  )
  assert.match(
    runReadyOwner,
    /const canRetry = retryable[\s\S]*currentAttempt < FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT/,
  )
  assert.match(
    runReadyOwner,
    /isFlightSimStagePresentationRetryableFailure\(message\)/,
  )
  assert.match(
    runReadyOwner,
    /startFlightSim\(\{[\s\S]*geospatialComposite: true,[\s\S]*previousCanvasSurface:/,
  )
  assert.match(
    geospatialBridge,
    /completeFlightSimStagePreparation\(requestId,\s*\{\s*framePresented: true,/,
  )
  assert.doesNotMatch(missionStage, /from '\.\/flightSimRuntime'/)
  assert.match(missionStage, /runtimeController\.readSnapshot\(\)/)
  const opening = runtime.indexOf('async function performFlightSimSurfaceOpen')
  const preload = runtime.indexOf(
    'preloadFlightSimMissionStage(flightSimStageRuntimeController)',
    opening,
  )
  const mapRuntimePreload = runtime.indexOf(
    'preloadFlightSimSurfacePresentation(options)',
    opening,
  )
  const activation = runtime.indexOf(
    'surfaceActivated = await activateFlightSimSurfacePresentation',
    opening,
  )
  const geospatialPreload = surfacePresentation.indexOf(
    'await preloadGeospatialMapRuntime()',
  )
  const geospatialActivation = surfacePresentation.indexOf(
    'await setGeospatialModeEnabled(true)',
  )
  const sharedSurfaceActivation = surfacePresentation.indexOf(
    'return activateXrSceneSurface',
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
    'await waitForFlightSimStagePresentation',
    opening,
  )
  const readyDeadline = runtime.indexOf(
    'return startFlightSimWithReadyFrame',
    opening,
  )
  assert.ok(
    opening >= 0
    && preload > opening
    && mapRuntimePreload > opening,
  )
  assert.ok(
    preload < activation
    && mapRuntimePreload < activation,
  )
  assert.match(runtime, /geospatialComposite\?: boolean/)
  assert.ok(
    geospatialPreload >= 0
    && geospatialActivation > geospatialPreload
    && sharedSurfaceActivation > geospatialActivation,
  )
  assert.match(
    surfacePresentation,
    /if \(!options\.geospatialComposite\) return[\s\S]*await preloadGeospatialMapRuntime\(\)/,
  )
  assert.match(
    surfacePresentation,
    /options\.geospatialComposite[\s\S]*geospatialComposite: true/,
  )
  assert.ok(activation < preparationRequest)
  assert.ok(preparationRequest < opened)
  assert.ok(opened < preparedStage)
  assert.match(
    runtime,
    /const profileChanged =\s*defaultRuntime\.profile\(\)\.sourceKey !== nextProfile\.sourceKey/,
  )
  assert.match(
    runtime,
    /if \(\s*\(entering \|\| profileChanged\)\s*&& hasFlightSimBrowserPresentationRuntime\(\)\s*\)/,
  )
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
  const hiddenProjectionGate = stagePreparationAfterRender.indexOf(
    'if (!actorsVisible)',
  )
  const r3fPreparationCompletion = stagePreparationAfterRender.indexOf(
    'completeFlightSimStagePreparation(stagePreparationRequestId)',
  )
  assert.ok(hiddenProjectionGate >= 0)
  assert.ok(r3fPreparationCompletion > hiddenProjectionGate)
  assert.match(
    stagePreparationAfterRender.slice(
      hiddenProjectionGate,
      r3fPreparationCompletion,
    ),
    /delete canvas\.dataset\.kgFlightSimFirstFrame[\s\S]*return/,
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
  const readyPresentationGate = surfaceControls.indexOf(
    'isFlightSimReadyFramePresentationPending(',
  )
  const desktopInputConsumption = surfaceControls.indexOf(
    'desktopBindingRef.current?.consumeInput()',
  )
  assert.ok(
    readyPresentationGate >= 0
    && desktopInputConsumption > readyPresentationGate,
  )
  assert.match(
    geospatialPresentation,
    /map\.on\('render', listener\)[\s\S]*map\.triggerRepaint\?\.\(\)/,
  )
  assert.match(
    geospatialPresentation,
    /canvas\.dataset\.kgFlightSimFirstFrameSurface = 'maplibre'/,
  )
  assert.match(
    geospatialPresentation,
    /onPresented\?\.\(presentation\)/,
  )
  assert.match(
    geospatialBridge,
    /onFlightOverlayPresented=\{handleFlightOverlayPresented\}/,
  )
  assert.match(
    geospatialBridge,
    /presentation\.phase === 'stopped'[\s\S]*completeFlightSimStagePreparation\(requestId,\s*\{\s*framePresented: true,/,
  )
  assert.match(
    geospatialBridge,
    /presentation\.phase === 'ready'[\s\S]*presentation\.tick === 0[\s\S]*completeFlightSimMapLibreReadyFrame\(/,
  )
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
    'surfaceActivated = await activateFlightSimSurfacePresentation',
    surfaceOpen,
  )
  const suspendRuntime = runtime.indexOf(
    'suspendAuthoredRuntime()',
    activateSurface,
  )
  assert.ok(surfaceOpen >= 0 && acquireSyncSuspension > surfaceOpen)
  assert.ok(acquireSyncSuspension < activateSurface)
  assert.ok(activateSurface < suspendRuntime)
  assert.doesNotMatch(runtime, /installFlightSimGameplayNetworkFence/)
  const exitSurface = runtime.indexOf('export function exitFlightSimSurface')
  const restorePreviousSurface = runtime.indexOf(
    '...restoreSurfaceOwnership(',
    exitSurface,
  )
  const releaseSyncSuspension = runtime.indexOf(
    'restoreWorkspaceSeedSyncOwnership()',
    restorePreviousSurface,
  )
  assert.ok(exitSurface >= 0 && restorePreviousSurface > exitSurface)
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
    'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  )
  assert.equal(
    flightCamera.runtime_canvas_driver_owner,
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
      route_guidance_owner: 'canvas/src/features/game-flight-sim/flightSimRouteGuidance.ts',
      objective_guide: 'one conditional aircraft-to-active-objective segment shared with native MapLibre, exclusive plain Geo, and the HUD',
      hud_cue: 'objective label, rounded distance, and signed left/right heading error; per-tick cue is not a live region',
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
  assert.match(
    controllerCamera,
    /flightSimActive\s*\?\s*readFlightFollowTarget\(true,\s*coordinateScale,\s*renderer\)/,
  )
  assert.match(controllerCamera, /suspended \|\| !fixedFollow/)
  assert.doesNotMatch(controllerCamera, /flight-plan|planRestorePoseRef|planarFlightPresentation/)
  assert.doesNotMatch(controllerCamera, /camera\.up\.(?:copy|set)/)
  assert.match(controllerCamera, /renderer\.xr\.isPresenting/)
  assert.match(flightTarget, /resolveFlightSimFollowTarget/)
  assert.match(
    physicsRuntime,
    /const active = isNativeXrRunReadyDemoActive\(markdownDocumentName, markdownDocumentText\)/,
  )
  assert.match(physicsRuntime, /pauseXrNativeControllerDemo\(\)/)
  assert.match(physicsRuntime, /resumeXrNativeControllerDemo\(\)/)
  assert.match(
    physicsRuntime,
    /activatesXrSurface[\s\S]*activateXrSceneSurface\(\{ preserveGameplay: !dedicatedDemo \}\)/,
  )
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
