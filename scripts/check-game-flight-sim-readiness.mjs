import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { assertFlightSimCameraReadiness } from './game-flight-sim-camera-readiness.mjs'
import { assertFlightSimAssetReadiness } from './lib/game-flight-sim-asset-readiness.mjs'
import { assertFlightSimKiroReadiness } from './lib/game-flight-sim-kiro-readiness.mjs'
import { assertFlightSimFeatureNetworkBoundary } from './lib/game-flight-sim-network-readiness.mjs'
import { assertFlightSimPropertyReadiness } from './lib/game-flight-sim-property-readiness.mjs'
import { assertFlightSimSeedReadiness } from './lib/game-flight-sim-seed-readiness.mjs'
import { assertFlightSimSurfaceReadiness } from './lib/game-flight-sim-surface-readiness.mjs'
import { assertFlightSimVerificationReadiness } from './lib/game-flight-sim-verification-readiness.mjs'
import {
  parseYamlFrontmatter as parseFrontmatter,
  requireOrderedSourceMarkers as requireOrderedMarkers,
  requireSourceMarkers as requireMarkers,
} from './lib/source-readiness-assertions.mjs'
const repositoryRoot = process.cwd()
const flightFeatureRoot = 'canvas/src/features/game-flight-sim'
const flightPrdPath = 'docs/documents/knowgrph-game-flight-sim-prd-tad.md'
const flightSeedPath = 'docs/workspace-seeds/knowgrph-game-flight-sim-demo.md'
const physicsSeedPath = 'docs/workspace-seeds/knowgrph-physics-playground-demo.md'
const kiroSpecRoot = '.kiro/specs/knowgrph-game-flight-sim'
const requiredPaths = [
  `${kiroSpecRoot}/.config.kiro`,
  `${kiroSpecRoot}/requirements.md`,
  `${kiroSpecRoot}/design.md`,
  `${kiroSpecRoot}/tasks.md`,
  `${flightFeatureRoot}/FlightSimFloatingPanelView.tsx`,
  `${flightFeatureRoot}/FlightSimHud.tsx`,
  `${flightFeatureRoot}/FlightSimGeoSurfaceOverlay.tsx`,
  `${flightFeatureRoot}/FlightSimMissionStage.tsx`,
  `${flightFeatureRoot}/FlightSimTrainingSurfaceProjection.tsx`,
  `${flightFeatureRoot}/FlightSimWebglUnsupportedState.tsx`,
  `${flightFeatureRoot}/assetSpec/fallbacks/optionalBeaconGlb.generated.ts`,
  `${flightFeatureRoot}/assetSpec/flightSimAssetLoader.ts`,
  `${flightFeatureRoot}/assetSpec/flightSimDefaultAssets.ts`,
  `${flightFeatureRoot}/assetSpec/flightSimAssetSpec.ts`,
  `${flightFeatureRoot}/assetSpec/vehicle-airplane.scene.json`,
  `${flightFeatureRoot}/flightModel.ts`,
  `${flightFeatureRoot}/flightSimFollowTarget.ts`,
  `${flightFeatureRoot}/flightSimGeospatialProjection.ts`,
  `${flightFeatureRoot}/flightSimRouteGuidance.ts`,
  `${flightFeatureRoot}/flightSimDecisionAdmission.ts`,
  `${flightFeatureRoot}/flightSimDecisionStore.ts`,
  `${flightFeatureRoot}/flightSimHydrationGate.ts`,
  `${flightFeatureRoot}/flightSimInput.ts`,
  `${flightFeatureRoot}/flightSimMcpContract.mjs`,
  `${flightFeatureRoot}/flightSimMcpRuntime.ts`,
  `${flightFeatureRoot}/flightSimMission.ts`,
  `${flightFeatureRoot}/flightSimModel.ts`,
  `${flightFeatureRoot}/flightSimMotionControlAdapter.ts`,
  `${flightFeatureRoot}/flightSimPendingDecisions.ts`,
  `${flightFeatureRoot}/flightSimRuntime.ts`,
  `${flightFeatureRoot}/flightSimRuntimeCore.ts`,
  `${flightFeatureRoot}/flightSimRuntimeState.ts`,
  `${flightFeatureRoot}/flightSimSimulationClock.ts`,
  `${flightFeatureRoot}/flightSimSpatialProfile.ts`, `${flightFeatureRoot}/flightSimStageRuntimeController.ts`,
  `${flightFeatureRoot}/flightSimTrainingRuntime.ts`,
  `${flightFeatureRoot}/flightSimTrainingScenario.ts`,
  `${flightFeatureRoot}/useFlightSimSurfaceControls.ts`,
  `${flightFeatureRoot}/index.ts`,
  'canvas/src/App.tsx',
  'canvas/src/components/CanvasViewport.tsx',
  'canvas/src/components/CanvasViewportGeospatialOverlay.tsx',
  'canvas/src/lib/canvas/canvasSurfaceOwnershipRuntime.ts',
  'canvas/src/features/agentic-os/agenticOsRemoteGrammarClient.ts',
  'canvas/src/features/agentic-os/useAgenticOsRemoteGrammarAutoHydration.tsx',
  'canvas/src/features/agent-ready/flightSimAgentReadyContract.mjs',
  'canvas/src/features/agent-ready/flightSimWebMcpTools.ts',
  'canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs',
  'canvas/src/features/agent-ready/webMcpRuntime.ts',
  'canvas/src/features/canvas/FlightSimRunReadyDemoRuntime.tsx',
  'canvas/src/features/three/useXrNativeControllerDemoCamera.ts',
  'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  'canvas/src/features/workspace-fs/workspaceDecisionStore.ts',
  'canvas/src/features/workspace-fs/workspaceRunReadyDemos.ts',
  'canvas/src/lib/three/flightSimMissionStageLoader.ts', 'canvas/src/lib/three/ThreeGameplayOverlay.tsx',
  'canvas/src/lib/three/threeRendererLifecycle.ts',
  'canvas/src/lib/three/ThreeGraph.impl.tsx',
  'gympgrph/src/flightGeoOverlay.ts',
  'gympgrph/src/flightGeoEnvironmentMapLibre.ts',
  'gympgrph/src/flightGeoMapViewport.ts',
  'gympgrph/src/flightGeoOverlayMapLibre.ts',
  'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  'gympgrph/src/flightGeoOverlayMapLibrePayload.ts',
  'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
  'gympgrph/src/GeospatialHost.tsx',
  'canvas/src/__tests__/flightSimCore.test.ts',
  'canvas/src/__tests__/flightSimDecisionStore.test.ts',
  'canvas/src/__tests__/flightSimMcpRuntime.test.ts',
  'canvas/src/__tests__/flightSimMapLibrePresentation.test.ts',
  'canvas/src/__tests__/flightSimRuntime.test.ts',
  'canvas/src/__tests__/flightSimSourceAuthority.test.ts',
  'canvas/src/__tests__/flightSimTrainingProjection.test.ts',
  'canvas/src/__tests__/flightSimTrainingRuntime.test.ts',
  'canvas/src/__tests__/flightSimXrAgenticEcsComposition.test.ts',
  'canvas/src/__tests__/xrAgenticEcsComposition.test.ts',
  'ecs/index.js',
  'ecs/worldTick.js',
  flightPrdPath,
  flightSeedPath,
  physicsSeedPath,
  'scripts/game-flight-sim-camera-readiness.mjs',
  'scripts/check-game-flight-sim-boundary.mjs',
  'scripts/generate-game-flight-sim-optional-prop-glb.mjs',
  'scripts/lib/game-flight-sim-asset-readiness.mjs',
  'scripts/lib/game-flight-sim-boundary.mjs',
  'scripts/lib/game-flight-sim-kiro-readiness.mjs',
  'scripts/lib/game-flight-sim-network-readiness.mjs',
  'scripts/lib/game-flight-sim-offline-author-contract.mjs',
  'scripts/lib/game-flight-sim-offline-author-worker.mjs',
  'scripts/lib/game-flight-sim-offline-authoring.mjs',
  'scripts/lib/game-flight-sim-optional-prop-author.mjs',
  'scripts/lib/game-flight-sim-seed-readiness.mjs',
  'scripts/lib/game-flight-sim-surface-readiness.mjs',
  'scripts/lib/game-flight-sim-verification-readiness.mjs',
  'scripts/__tests__/game-flight-sim-boundary.test.mjs',
  'scripts/__tests__/game-flight-sim-readiness-contract.test.mjs',
  'scripts/workspace-seed-authority.mjs',
  'package.json',
  'canvas/package.json',
]
const forbiddenDependencies = [
  '@dimforge/rapier3d',
  '@dimforge/rapier3d-compat',
  'ammo.js',
  'behaviortree',
  'bitecs',
  'cannon',
  'cannon-es',
  'oimo',
  'recast-navigation',
  'recastnavigation',
  'yuka',
]
const forbiddenFeaturePatterns = [
  [/<Canvas(?:\s|>)/, 'a feature-local Canvas'],
  [/\bnew\s+(?:THREE\.)?WebGLRenderer\s*\(/, 'a feature-local renderer'],
  [/navigator\.credentials/, 'credentials access'],
  [/\bgetUserMedia\s*\(/, 'camera access'],
  [/\b(?:OpenAI|Anthropic)\b/, 'a model SDK'],
]
async function readText(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8')
}
async function listFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory)
  const entries = await readdir(absoluteDirectory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const relativePath = path.posix.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      if (['.git', '.wrangler', 'dist', 'node_modules'].includes(entry.name)) return []
      return listFiles(relativePath)
    }
    return entry.isFile() ? [relativePath] : []
  }))
  return nested.flat().sort()
}
for (const relativePath of requiredPaths) {
  try {
    await readText(relativePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Flight Sim readiness requires ${relativePath}`)
    }
    throw error
  }
}

const featurePaths = (await listFiles(flightFeatureRoot))
  .filter(relativePath => /\.(?:tsx?|mjs|json)$/.test(relativePath))
const featureSources = await Promise.all(featurePaths.map(async relativePath => ({
  relativePath,
  source: await readText(relativePath),
})))

for (const { relativePath, source } of featureSources) {
  const lineCount = source.split(/\r?\n/).length
  if (lineCount > 600) throw new Error(`${relativePath} exceeds the 600-line feature limit`)
  assertFlightSimFeatureNetworkBoundary({ relativePath, source })
  for (const [pattern, capability] of forbiddenFeaturePatterns) {
    if (pattern.test(source)) {
      throw new Error(`${relativePath} introduces forbidden Flight Sim capability: ${capability}`)
    }
  }
  for (const dependency of forbiddenDependencies) {
    if (source.includes(`'${dependency}'`) || source.includes(`"${dependency}"`)) {
      throw new Error(`${relativePath} imports forbidden Flight Sim dependency ${dependency}`)
    }
  }
}
const reasoningAttemptOwners = featureSources
  .filter(({ source }) => /\brequestReasoning\s*\(/.test(source))
  .map(({ relativePath }) => relativePath)
if (
  reasoningAttemptOwners.length !== 1
  || reasoningAttemptOwners[0] !== `${flightFeatureRoot}/flightSimSystems.ts`
) {
  throw new Error(
    'Flight Sim may expose its fail-closed inference-attempt seam only in flightSimSystems.ts',
  )
}

const featureIndexSource = await readText(`${flightFeatureRoot}/index.ts`)
requireMarkers(featureIndexSource, [
  "export * from './flightSimModel'",
  "export * from './flightSimSpatialProfile'",
  "export * from './flightSimMission'",
  "export * from './flightSimInput'",
  "export * from './flightSimRuntime'",
  "export * from './assetSpec/flightSimAssetSpec'",
  "export * from './assetSpec/flightSimAssetLoader'",
  "export * from './assetSpec/flightSimDefaultAssets'",
  "export { FlightSimMissionStage } from './FlightSimMissionStage'",
  "export { FlightSimHud } from './FlightSimHud'",
], 'Flight Sim public feature surface')

const threeOwners = featureSources
  .filter(({ source }) => /from\s+['"](?:@react-three\/fiber|three(?:\/[^'"]*)?)['"]/.test(source))
  .map(({ relativePath }) => relativePath)
if (
  threeOwners.length !== 1
  || threeOwners[0] !== `${flightFeatureRoot}/FlightSimMissionStage.tsx`
) {
  throw new Error(
    `Flight Sim Three runtime ownership must remain isolated in FlightSimMissionStage.tsx, received ${threeOwners.join(', ')}`,
  )
}

const ecsWorldOwners = featureSources
  .filter(({ source }) => /\bcreateWorld\s*\(/.test(source))
  .map(({ relativePath }) => relativePath)
if (
  ecsWorldOwners.length !== 1
  || ecsWorldOwners[0] !== `${flightFeatureRoot}/flightSimMission.ts`
) {
  throw new Error(
    `Flight Sim must create only its native ECS mission World, received ${ecsWorldOwners.join(', ')}`,
  )
}

await assertFlightSimSurfaceReadiness({ readText, flightFeatureRoot })
const missionStageLoaderSource = await readText('canvas/src/lib/three/flightSimMissionStageLoader.ts')
requireMarkers(missionStageLoaderSource, [
  "import('@/features/game-flight-sim/FlightSimMissionStage')",
  'importWithRetry(importMissionStage',
  'retries: 2',
  'retryDelayMs: 50',
  'module.createFlightSimMissionStage(runtimeController)',
  'if (cachedPromise === requestedPromise) cachedPromise = null',
], 'shared Flight Sim mission-stage loader')
const gameplayOverlaySource = await readText('canvas/src/lib/three/ThreeGameplayOverlay.tsx')
requireMarkers(gameplayOverlaySource, [
  "from './flightSimMissionStageLoader'",
  'if (props.flightSimActive)',
  '<FlightSimMissionStageLazy',
  'actorsVisible',
  'coordinateScale={props.coordinateScale}',
  'geospatialComposite={props.geospatialComposite}',
], 'shared Three gameplay overlay')
const threeGraphSource = await readText('canvas/src/lib/three/ThreeGraph.impl.tsx')
requireMarkers(threeGraphSource, [
  "from '@/lib/three/ThreeGameplayOverlay'",
  'const flightStageActive = mode === \'xr\' && flightSimActive',
  '<ThreeGameplayMissionStage',
  'flightSimActive={flightStageActive}',
  'gameplayCoordinateScale={gameplayCoordinateScale}',
  'geospatialComposite={geospatialComposite}',
], 'shared Three renderer')
const controlsSource = await readText('canvas/src/features/three/Controls.tsx') + await readText('canvas/src/features/three/threeViewportInputOwnership.ts') + await readText('canvas/src/features/three/xrCameraPlaybackControlsRuntime.ts')
requireMarkers(controlsSource, [
  "from './useXrNativeControllerDemoCamera'",
  'useXrNativeControllerDemoCamera({',
  'flightSimActive,',
  'coordinateScale: gameplayCoordinateScale',
  'blocksProgrammaticCamera: options.blocksProgrammaticCamera !== false', 'viewportInputOwnership.blocksProgrammaticCamera',
], 'shared camera arbitration')
const seedSource = await readText(flightSeedPath)
const seed = parseFrontmatter(seedSource, flightSeedPath)
const prdSource = await readText(flightPrdPath)
const prd = parseFrontmatter(prdSource, flightPrdPath)
if (
  prd.authority_role !== 'derived implementation/proof projection'
  || prd.normative_kiro_authority !== '.kiro/specs/knowgrph-game-flight-sim/'
) {
  throw new Error('Flight Sim PRD/TAD must remain a derived projection of tracked Kiro authority')
}
requireMarkers(prdSource, [
  'derived implementation/proof projection of the normative repository-tracked Kiro source of truth',
  'root-workspace Kiro copy must remain byte-identical and is not an independent authority',
  'clean-room scanner cannot prove the absence of arbitrary derived code',
], 'Flight Sim PRD/TAD authority and clean-room boundary')
const physicsSeed = parseFrontmatter(await readText(physicsSeedPath), physicsSeedPath)
const kiroReadiness = await assertFlightSimKiroReadiness({ repositoryRoot })
await assertFlightSimCameraReadiness({ flightSeed: seed, physicsSeed, readText })

const missionSource = await readText(`${flightFeatureRoot}/flightSimMission.ts`)
  + await readText(`${flightFeatureRoot}/flightSimSystems.ts`)
  + await readText(`${flightFeatureRoot}/flightSimDecisionAdmission.ts`)
requireMarkers(missionSource, [
  "from '../../../../ecs/index.js'",
  'createFlightSimSystems({',
  "reasoningPolicy: 'forbid'",
  "'InputIntegrationSystem'",
  "'FlightModelSystem'",
  "'CollisionResolverSystem'",
  "'ObjectiveSystem'",
  "costLogOwner: 'AgenticECS.worldTick:post-systems'",
  "projectionOwner: 'captureFlightSimMission:post-commit'",
  'worldTick(tickMission.world, Object.freeze({',
  'controls: input,',
  'normalizeFlightSimInputFrame(tickInput.controls',
  'const tickMission = blockedInference ? cloneFlightSimMission(mission) : mission',
  'if (blockedInference) disposeFlightSimMission(tickMission)',
  'result.cost_logs.length !== 1',
  "result.deferred_decisions[0]?.deferred_reason !== 'inference_blocked'",
  'FLIGHT_SIM_MAX_MISSION_TICKS',
  'FLIGHT_SIM_TIMEOUT_COLLIDER_ID',
  'export function cloneFlightSimMission',
  'export function validateFlightSimMissionDecisions', 'Flight Sim completion requires the full waypoint history', 'flightSimDecisionId(runId, tick, event, suffix)',
  "cost.model !== 'none'",
  'cost.prompt_tokens !== 0',
  'cost.completion_tokens !== 0',
  'cost.cache_hits !== 0',
  'cost.estimated_cost_usd !== 0',
  'cost.incomplete !== false',
  "cost.prompt_tokens !== 'unknown'",
  "cost.completion_tokens !== 'unknown'",
  "cost.error !== 'blocked_inference'",
  'return FLIGHT_SIM_ZERO_COST_LOG',
], 'native Flight Sim ECS mission')

const modelSource = await readText(`${flightFeatureRoot}/flightSimModel.ts`)
requireMarkers(modelSource, [
  'export const FLIGHT_SIM_FIXED_STEP_SECONDS = 1 / 60',
  'export const FLIGHT_SIM_MAX_MISSION_TICKS = 60 * 90', 'export const FLIGHT_SIM_MAX_PERSISTED_RUN_ID',
  'export const FLIGHT_SIM_MISSION_ENTITY_REF',
  'export const FLIGHT_SIM_NEUTRAL_INPUT: FlightSimTickInput = Object.freeze({',
  'export function stageFlightSimInputPatch(',
  "model: 'none'",
  'prompt_tokens: 0',
  'completion_tokens: 0',
  'cache_hits: 0',
  'estimated_cost_usd: 0',
  'incomplete: false',
  'return Object.freeze({',
  'exactKeys(payload, eventPayloadKeys',
  'Flight Sim Decision decisionId is not canonical', 'Flight Sim Decision producedAt is not canonical',
], 'immutable Flight Sim model')
const runtimeSource = await readText(`${flightFeatureRoot}/flightSimRuntime.ts`)
  + await readText(`${flightFeatureRoot}/flightSimRuntimeCore.ts`)
  + await readText(`${flightFeatureRoot}/flightSimRuntimeState.ts`)
requireMarkers(runtimeSource, [
  'export type FlightSimAdvanceRequest = Readonly<{',
  'input: FlightSimTickInput',
  'const captured = capturedInput()',
  'const request = Object.freeze({',
  'input: captured.input,',
  'throttleSetpoint: captured.throttleSetpoint,',
  'const workingMission = cloneFlightSimMission(activeMission)',
  'tickFlightSimMission(',
  'mission !== activeMission || generation !== request.generation',
  'const failedCapture = captureFlightSimMission(workingMission)',
  'mission = workingMission',
  'return stageMissionInput(input)',
  'return stageMissionInput(stageFlightSimInputPatch(FLIGHT_SIM_NEUTRAL_INPUT, {',
  'createFlightSimPendingDecisionIndex(freezeFlightSimDecision)',
  'pendingDecisions.discardRun(runId)',
  'tickQueue.then(() => advanceCurrentMission(request))',
  'await priorRestoration', 'flightSimSurfaceOpenTail.then(performOpen)',
  'performFlightSimSurfaceOpen(operationOptions, expectedGeneration)',
  'readFlightSimDefaultAssetLoadReport()',
  'suspendAuthoredRuntime()',
  'restoreDurableChatStreamTransportOwnership()',
  'restoreWorkspaceSeedSyncOwnership()',
  'readFlightSimDecisionStore().hydrationBlocked', 'reportFlightSimDecisionLoadFailure(hydrated.runtimeError)',
  'defaultRuntime.resetPersistence()',
  'export async function persistFlightSimPendingDecisions',
  'const decisions = [...defaultRuntime.read().pendingDecisions]',
  'queueFlightSimDecisions(decisions)',
  'const saved = await persistPendingFlightSimDecisions(options)',
  "saved.status === 'saved' && decisions.length > 0",
  'defaultRuntime.acknowledgeDecisions(decisions.map(item => item.decisionId))',
], 'fixed-input Flight Sim runtime')
const pendingDecisionSource = await readText(`${flightFeatureRoot}/flightSimPendingDecisions.ts`)
requireMarkers(pendingDecisionSource, [
  'const flightStateIdByRun = new Map<number, string>()',
  'if (previousId) pending.delete(previousId)',
  'discardRun(runId)',
], 'bounded pending Flight Decisions')
const inputSource = await readText(`${flightFeatureRoot}/flightSimInput.ts`) + await readText(`${flightFeatureRoot}/flightSimMotionControlAdapter.ts`)
requireMarkers(inputSource, [
  'consumeInput()',
  "window.addEventListener('blur', onBlur)",
  "document.addEventListener('visibilitychange', onVisibilityChange)",
  'shouldRequestPointerLock?.() === false', "yaw: digital(codes.has('KeyQ'), codes.has('KeyE'))", 'yaw: input.modifier ? -input.moveX : 0',
], 'Flight input cancellation')
const simulationClockSource = await readText(
  `${flightFeatureRoot}/flightSimSimulationClock.ts`,
)
requireMarkers(simulationClockSource, [
  'export function createFlightSimSimulationClock',
  'if (disposed || running || !requested || scheduled) return',
  'lastStartedAt + options.minimumStepIntervalMs - now()',
  '.then(options.runStep)',
  'if (scheduled) cancelScheduled(scheduled.handle)',
], 'serialized Flight Sim simulation clock')

const spatialProfileSource = await readText(`${flightFeatureRoot}/flightSimSpatialProfile.ts`)
requireMarkers(spatialProfileSource, [
  "from '@/features/three/xrCanonicalSceneSpatialSource'",
  'resolveXrCanonicalSceneProjection',
  'resolveXrCanonicalSceneSpatialSource',
  'export function createFlightSimSpatialProfile',
  'export function readFlightSimXrSpatialProfile',
  'export function resolveFlightSimAabbMotion',
  "'flight-sim:boundary-west'",
  "'flight-sim:boundary-ceiling'",
  'startedOverlapping?.penetration',
], 'canonical XR Flight Sim spatial profile')
const routeGuidanceSource = await readText(
  `${flightFeatureRoot}/flightSimRouteGuidance.ts`,
)
requireMarkers(routeGuidanceSource, [
  'export function projectFlightSimRouteGuidance(',
  'flightSimHeadingDegrees(flight.aircraft.yaw)',
  'headingErrorDegrees: normalizeHeadingErrorDegrees(',
  "label: 'LAND'",
  "if (!objective) return 'COURSE COMPLETE'",
], 'shared Flight route and course-director guidance')
const hudSource = await readText(`${flightFeatureRoot}/FlightSimHud.tsx`)
requireMarkers(hudSource, [
  'data-kg-flight-sim-pitch',
  'data-kg-flight-sim-roll',
  'data-kg-flight-sim-save-status', 'data-kg-flight-sim-effective-save-status',
  'data-kg-flight-sim-course-director="hud"',
  'grid min-w-0 grid-cols-3', 'disabled={!flightControlsEnabled}',
  "'Retry save'",
], 'Flight HUD readiness')
const cameraPanelSource = await readText('canvas/src/features/strybldr/cameraPanelSurfaceRuntime.ts')
requireMarkers(cameraPanelSource, [
  "state.canvas3dMode === 'xr'",
  'if (state.floatingPanelOpen) return true',
], 'shared Camera companion continuity')

await assertFlightSimSeedReadiness({
  seed,
  flightSeedPath,
  physicsSeedPath,
  readText,
})

const seedAuthoritySource = await readText('scripts/workspace-seed-authority.mjs')
const projectionStart = seedAuthoritySource.indexOf('AGENTIC_WORKSPACE_SEED_PROJECTION_INVENTORY')
const projectionEnd = seedAuthoritySource.indexOf('])', projectionStart)
const projectionInventory = seedAuthoritySource.slice(projectionStart, projectionEnd + 2)
if (
  projectionStart < 0
  || !projectionInventory.includes('PHYSICS_SEED_BASENAME')
  || projectionInventory.includes('FLIGHT_SEED_BASENAME')
) {
  throw new Error('Flight Sim must remain local-only until a separate protected Agentic projection')
}

const assetReadiness = await assertFlightSimAssetReadiness({ repositoryRoot })
const assetReadinessSource = await readText('scripts/lib/game-flight-sim-asset-readiness.mjs')
requireMarkers(assetReadinessSource, [
  'export async function assertTrackedFlightSimAsset(repositoryRoot, relativePath)',
  'throw new Error(`${relativePath} must be git-tracked`)',
  'export async function assertFlightSimAssetReadiness({ repositoryRoot })',
], 'Flight Sim committed-local asset tracking gate')
if (
  assetReadinessSource.includes('KG_FLIGHT_SIM_ALLOW_UNTRACKED_ASSET_CANDIDATE')
  || assetReadinessSource.includes('allowUntracked')
) {
  throw new Error('Flight Sim runtime readiness must not permit an untracked asset bypass')
}

const decisionStoreSource = await readText(`${flightFeatureRoot}/flightSimDecisionStore.ts`)
requireMarkers(decisionStoreSource, [
  "from '@/features/workspace-fs/workspaceDecisionStore'",
  "'/game-flight-sim/mission-1-decisions.md'",
  'validateDecisions: validateFlightSimDecisions',
], 'Flight Sim Decision-store wrapper')
const genericDecisionStoreSource = await readText(
  'canvas/src/features/workspace-fs/workspaceDecisionStore.ts',
)
requireMarkers(genericDecisionStoreSource, [
  "from '../../../../ecs/decisionDocument.js'",
  'const pending = new Map<string, TDecision>()',
  'let mutationQueue: Promise<WorkspaceDecisionStoreSnapshot> | null = null',
  'if (snapshot.hydrationBlocked) return publish({})',
  'verification.persistedCount !== 0',
  'verification.idempotentCount !== batch.length',
  'Decision save rollback read-back mismatch',
], 'generic browser-local Decision store')
if (/from\s+['"]node:|persistDecisions|persistDecision\s*\(/.test(genericDecisionStoreSource)) {
  throw new Error('generic Workspace Decision persistence must remain browser-safe')
}

const contractModule = await import(pathToFileURL(
  path.join(repositoryRoot, `${flightFeatureRoot}/flightSimMcpContract.mjs`),
).href)
if (
  contractModule.FLIGHT_SIM_MCP_SCHEMA !== 'knowgrph-flight-sim-mcp/v1'
  || JSON.stringify(contractModule.FLIGHT_SIM_WEB_MCP_TOOL_IDS) !== JSON.stringify({
    inspect: 'inspect_local_flight_sim',
    control: 'control_local_flight_sim',
  })
  || JSON.stringify(contractModule.FLIGHT_SIM_INVOCATION_COMMANDS) !== JSON.stringify({
    control: '/flight.sim',
  })
  || JSON.stringify(contractModule.FLIGHT_SIM_INVOCATION_BINDINGS) !== JSON.stringify({
    canvas: '@canvas',
  })
  || JSON.stringify(contractModule.FLIGHT_SIM_INVOCATION_SEMANTICS) !== JSON.stringify({
    flight: '#flight',
  })
) {
  throw new Error('Flight Sim must retain one strict native invocation tuple and two WebMCP ids')
}

const agentReadyModule = await import(pathToFileURL(
  path.join(repositoryRoot, 'canvas/src/features/agent-ready/flightSimAgentReadyContract.mjs'),
).href)
const agentReadyContracts = agentReadyModule.buildFlightSimAgentReadyToolContracts({
  buildWebName: name => `knowgrph.${name}`,
  readOnlyAnnotations: Object.freeze({ readOnlyHint: true }),
  mutationAnnotations: Object.freeze({ readOnlyHint: false }),
})
if (
  agentReadyContracts.length !== 2
  || JSON.stringify(agentReadyContracts.map(contract => contract.webName)) !== JSON.stringify([
    'knowgrph.inspect_local_flight_sim',
    'knowgrph.control_local_flight_sim',
  ])
) {
  throw new Error('Flight Sim must expose exactly two browser-local Agent Ready tools')
}
const webMcpRuntimeSource = await readText('canvas/src/features/agent-ready/webMcpRuntime.ts')
requireMarkers(webMcpRuntimeSource, [
  'FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS',
  '...FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS',
], 'browser WebMCP registry')
const flightMcpRuntimeSource = await readText(`${flightFeatureRoot}/flightSimMcpRuntime.ts`)
requireMarkers(flightMcpRuntimeSource, [
  'persistFlightSimPendingDecisions',
  'const saved = await persistFlightSimPendingDecisions(',
  'fence ? { signal: fence.signal } : {}',
], 'Flight Sim MCP save facade')
if (/\bpersistPendingFlightSimDecisions\b/.test(flightMcpRuntimeSource)) {
  throw new Error('Flight Sim MCP must save through the core runtime acknowledgement facade')
}

const serverSourcePaths = [
  ...(await listFiles('mcp')),
  ...(await listFiles('cloudflare/workers/knowgrph-mcp')),
].filter(relativePath => (
  /\.(?:js|mjs|cjs|ts|tsx|json)$/.test(relativePath)
  && !relativePath.includes('/__tests__/')
  && !relativePath.includes('/__pbt__/')
))
for (const relativePath of serverSourcePaths) {
  const source = await readText(relativePath)
  if (
    source.includes('inspect_local_flight_sim')
    || source.includes('control_local_flight_sim')
    || source.includes('/flight.sim')
  ) {
    throw new Error(`Flight Sim must not register a stdio or HTTP tool in ${relativePath}`)
  }
}

const rootPackage = JSON.parse(await readText('package.json'))
const canvasPackage = JSON.parse(await readText('canvas/package.json'))
const boundaryCommand = rootPackage.scripts?.['game-flight-sim:boundary'] || ''
requireOrderedMarkers(boundaryCommand, [
  'node --test ./scripts/__tests__/game-flight-sim-boundary.test.mjs',
  'node ./scripts/check-game-flight-sim-boundary.mjs',
], 'Flight Sim tracked clean-room boundary command')
const prebuildCommand = canvasPackage.scripts?.prebuild || ''
if (!prebuildCommand.startsWith('npm --prefix .. run game-flight-sim:boundary && ')) {
  throw new Error('Canvas builds must begin with the tracked Flight Sim no-copy boundary')
}
const dependencies = {
  ...rootPackage.dependencies,
  ...rootPackage.devDependencies,
  ...canvasPackage.dependencies,
  ...canvasPackage.devDependencies,
}
for (const dependency of forbiddenDependencies) {
  if (Object.hasOwn(dependencies, dependency)) {
    throw new Error(`Flight Sim must not add external engine dependency ${dependency}`)
  }
}

const sourceTestCommand = canvasPackage.scripts?.['test:smoke:game-flight-sim:source'] || ''
requireMarkers(sourceTestCommand, [
  '--test-concurrency=1',
  'src/__tests__/flightSim*.test.ts',
], 'Flight Sim focused source-test command')
if (/--test-concurrency=(?!1\b)/.test(sourceTestCommand)) {
  throw new Error('Flight Sim focused source tests must run serially')
}
const xrCompositionTestSource = await readText(
  'canvas/src/__tests__/flightSimXrAgenticEcsComposition.test.ts',
)
requireMarkers(xrCompositionTestSource, [
  "from './xrAgenticEcsComposition.test'",
  'testXrAgenticEcsCompositionBoundaryRemainsExplicit',
  "test(\n  'Flight Sim retains the explicit XR and Agentic ECS composition boundary'",
], 'Flight Sim XR/Agentic ECS focused wrapper')

await assertFlightSimVerificationReadiness({ readText })

const sourceTestPaths = (await listFiles('canvas/src/__tests__'))
  .filter(relativePath => /\/flightSim.*\.test\.ts$/.test(relativePath))
if (sourceTestPaths.length < 3) {
  throw new Error('Flight Sim requires focused source tests for runtime, persistence, and invocation authority')
}
const propertyReadiness = await assertFlightSimPropertyReadiness({ readText, listFiles })

console.log(
  `OK flight-sim source readiness (${featurePaths.length} feature files, ${sourceTestPaths.length} focused test files, ${propertyReadiness.propertyCount} properties/${propertyReadiness.generatedCaseCount} generated cases, ${assetReadiness.dependencies.externalClosureCount} licensed Flight dependencies, Kiro ${kiroReadiness.files.length}-file SHA-256 ${kiroReadiness.sha256} with workspace projection ${kiroReadiness.projection.checked ? 'byte-matched' : 'absent (portable)'}, 1 optional local GLB, browser-only MCP pair)`,
)
