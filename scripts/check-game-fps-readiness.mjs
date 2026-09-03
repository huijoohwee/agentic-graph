import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { load as loadYaml } from 'js-yaml'
import {
  assertRapierIndependentDependencyBoundary,
  assertRapierIndependentPhysicsSourceBoundary,
} from './lib/rapier-independence-boundary.mjs'
import {
  CITY_SIM_OVERLAY_AUTHORITY,
  CITY_SIM_SEED_RELATIVE_PATH,
  FLIGHT_SEED_RELATIVE_PATH,
  PHYSICS_SEED_RELATIVE_PATH,
} from './workspace-seed-authority.mjs'

const root = process.cwd()
const requiredPaths = [
  'canvas/src/features/physics/planarPhysicsTypes.ts',
  'canvas/src/features/physics/planarPhysicsGeometry.ts',
  'canvas/src/features/physics/planarPhysicsEngine.ts',
  'canvas/src/features/physics/spatialPhysicsTypes.ts',
  'canvas/src/features/physics/spatialPhysicsGeometry.ts',
  'canvas/src/features/physics/spatialPhysicsStep.ts',
  'canvas/src/features/physics/spatialPhysicsEngine.ts',
  'canvas/src/features/three/xrSpatialPhysicsAdapter.ts',
  'canvas/src/features/game-fps/gameFpsModel.ts',
  'canvas/src/features/game-fps/gameFpsMission.ts',
  'canvas/src/features/game-fps/gameFpsNpcPolicy.ts',
  'canvas/src/features/game-fps/gameFpsRuntime.ts',
  'canvas/src/features/game-fps/gameFpsSimulationClock.ts',
  'canvas/src/features/game-fps/gameFpsDecisionStore.ts',
  'canvas/src/features/workspace-fs/workspaceDecisionStore.ts',
  'canvas/src/features/game-fps/gameModeRuntime.ts',
  'canvas/src/features/game-fps/gameModeXrSpatialProfile.ts',
  'canvas/src/features/game-fps/gameModeMcpContract.mjs',
  'canvas/src/features/game-fps/gameModeMcpRuntime.ts',
  'canvas/src/features/game-fps/GameModeFloatingPanelView.tsx',
  'canvas/src/features/game-fps/GameFpsMissionStage.tsx',
  'canvas/src/features/game-fps/GameFpsHud.tsx',
  'canvas/scripts/source-authority-test-bootstrap.mjs',
  'canvas/src/features/canvas/CanvasDocDeepLinkRuntime.tsx',
  'canvas/src/features/canvas/CanvasSourceAuthorityBoundary.tsx',
  'canvas/src/features/canvas/CanvasStartupRuntimes.tsx',
  'canvas/src/features/source-files/sourceFilesBootstrapReadiness.ts',
  'canvas/src/features/source-files/SourceFilesPersistenceBootstrap.tsx',
  'canvas/src/features/three/XrMotionReferenceRuntimeBridge.tsx',
  'canvas/src/features/three/XrCanonicalPhysicsStage.tsx',
  'canvas/src/features/three/XrMotionReferenceGraphStage.tsx',
  'canvas/src/features/three/XrSceneStage.tsx',
  'canvas/src/features/three/useXrStageMotionControlCleanup.ts',
  'canvas/src/components/CanvasViewport.tsx',
  'canvas/src/lib/three/threeRendererLifecycle.ts',
  'canvas/src/features/workspace-fs/workspaceFsMutationTransaction.ts',
  'canvas/src/features/workspace-fs/workspaceRunReadyDemos.ts',
  'canvas/src/features/three/xrCanonicalSceneSpatialSource.ts',
  'canvas/src/features/three/xrSceneSurfaceRuntime.ts',
  'canvas/src/features/three/toolbarXrScenePanelRouting.ts',
  'canvas/src/lib/canvas/canvasSurfaceOwnershipRuntime.ts',
  'canvas/src/__tests__/gameFpsMissionCore.test.ts',
  'canvas/src/__tests__/gameFpsRuntimeConcurrency.test.ts',
  'canvas/src/__tests__/gameModeRuntime.test.ts',
  'canvas/src/__tests__/gameModeMotionInputRuntime.test.ts',
  'canvas/src/__tests__/gameModePersistenceRuntime.test.ts',
  'canvas/src/__tests__/gameModeSpatialSourceRuntime.test.ts',
  'canvas/src/__tests__/gameModeSourceAuthority.test.ts',
  'canvas/src/__tests__/canvasSurfaceGameDeparture.test.ts',
  'canvas/src/__tests__/canvasXrSharedSurfaceOwnership.test.ts',
  'docs/workspace-seeds/agentic-graph-physics-playground-demo.md',
  'docs/documents/agentic-graph-game-fps-prd-tad.md',
  'docs/documents/agentic-graph-game-fps-runtime-readiness.md',
  'docs/documents/agentic-graph-native-physics-engines-prd-tad.md',
  'ecs/decisionDocument.js',
]
const forbiddenDependencies = [
  'bitecs',
  'behaviortree',
  'recast-navigation',
  'recastnavigation',
  'yuka',
]
const forbiddenRuntimePatterns = [
  [/\bfetch\s*\(/, 'fetch'],
  [/\bWebSocket\s*\(/, 'WebSocket'],
  [/navigator\.credentials/, 'navigator.credentials'],
  [/getUserMedia\s*\(/, 'getUserMedia'],
  [/requestReasoning\s*\(/, 'requestReasoning'],
]

async function text(relPath) {
  return readFile(path.join(root, relPath), 'utf8')
}

async function listProductionSourceFiles(absDir) {
  const entries = await readdir(absDir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const absPath = path.join(absDir, entry.name)
    if (entry.isDirectory()) return listProductionSourceFiles(absPath)
    if (!entry.isFile()) return []
    const relPath = path.relative(root, absPath).split(path.sep).join('/')
    if (!/\.(?:jsx?|mjs|py|tsx?)$/.test(relPath)
      || /(?:^|\/)(?:__pbt__|__tests__|fixtures|test|tests)(?:\/|$)/.test(relPath)
      || /\.test\.[^.]+$/.test(relPath)) return []
    return [relPath]
  }))
  return nested.flat()
}

async function listMarkdownFiles(absDir) {
  const entries = await readdir(absDir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const absPath = path.join(absDir, entry.name)
    if (entry.isDirectory()) return listMarkdownFiles(absPath)
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) return []
    return [path.relative(root, absPath).split(path.sep).join('/')]
  }))
  return nested.flat()
}

function parseFrontmatter(markdown, relPath) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
  if (!match) throw new Error(`${relPath} must begin with YAML frontmatter`)
  return loadYaml(match[1])
}

for (const relPath of requiredPaths) await text(relPath)
await Promise.all([
  assertRapierIndependentDependencyBoundary(root),
  assertRapierIndependentPhysicsSourceBoundary(root),
])

const forbiddenStandaloneSourcePaths = [
  'canvas/src/features/canvas/GameFpsRunReadyDemoRuntime.tsx',
  'canvas/src/features/game-fps/gameModeSceneComposition.ts',
  'canvas/src/features/three/XrGraphStage.tsx',
  'canvas/src/__tests__/gameFpsPersistedSeed.test.ts',
  'canvas/src/__tests__/gameFpsRunReadyContract.test.ts',
  'canvas/src/tests/subsetGameFpsSmoke.ts',
  'docs/workspace-seeds/agentic-graph-game-fps-demo.md',
]
for (const relPath of forbiddenStandaloneSourcePaths) {
  try {
    await stat(path.join(root, relPath))
    throw new Error(`the deleted standalone or mixed XR source owner must remain absent: ${relPath}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const standaloneRouteOwners = [
  ['canvas/src/features/canvas/CanvasStartupRuntimes.tsx', /GameFpsRunReadyDemoRuntime/],
  ['canvas/src/features/workspace-fs/workspaceRunReadyDemos.ts', /GAME_FPS_(?:RUN_READY_DEMO_ID|DEMO_)|isGameFpsRunReadyDemoActive|agentic-graph-game-fps-demo\.md/],
  ['canvas/src/components/CanvasViewport.tsx', /isGameFpsRunReadyDemoActive|gameFpsRunReadyDemo/],
  ['canvas/src/pages/Canvas.tsx', /isGameFpsRunReadyDemoActive|gameFpsRunReadyDemo|data-kg-game-fps-run-ready/],
  ['canvas/package.json', /"(?:predev|dev):game-fps"|VITE_AGENTIC_OS_RUN_READY_DEMO=game-fps|gameFpsPersistedSeed|subsetGameFpsSmoke/],
  ['canvas/src/tests/registry/postParserCases7.ts', /gameFpsRunReadyContract|canvas\.gameFps\.runReady|activeSourceSkipsDocsMirror/],
  ['package.json', /"demo:game-fps"/],
]
for (const [relPath, pattern] of standaloneRouteOwners) {
  if (pattern.test(await text(relPath))) {
    throw new Error(`standalone Game Mode source authority returned in ${relPath}`)
  }
}

const authorityExecutableRoots = [
  'canvas/src',
  'canvas/scripts',
  'ecs',
  'mcp',
]
const authorityExecutablePaths = (await Promise.all(authorityExecutableRoots.map(async relPath => {
  const absPath = path.join(root, relPath)
  try {
    if ((await stat(absPath)).isDirectory()) return listProductionSourceFiles(absPath)
  } catch {
    // Optional runtime roots do not weaken the required Canvas source scan.
  }
  return []
}))).flat().sort()
const authorityExecutableSources = await Promise.all(authorityExecutablePaths.map(async relPath => ({
  relPath,
  source: await text(relPath),
})))
const authorityConfigSources = await Promise.all(['package.json', 'canvas/package.json'].map(async relPath => ({
  relPath,
  source: await text(relPath),
})))
const deletedStandaloneMarkers = [
  [/\bGameFpsArenaEnvironment\b/, 'GameFpsArenaEnvironment'],
  [/\bGAME_FPS_ARENA_CLEAR_COLOR\b/, 'GAME_FPS_ARENA_CLEAR_COLOR'],
  [/\bgameModeSceneComposition\b/, 'gameModeSceneComposition'],
  [/\bGameFpsRunReadyDemoRuntime\b/, 'GameFpsRunReadyDemoRuntime'],
  [/\bGAME_FPS_RUN_READY_DEMO_ID\b/, 'GAME_FPS_RUN_READY_DEMO_ID'],
  [/\bisGameFpsRunReadyDemoActive\b/, 'isGameFpsRunReadyDemoActive'],
  [/\bgameFpsRunReadyDemo\b/, 'gameFpsRunReadyDemo'],
  [/data-kg-game-fps-run-ready/, 'data-kg-game-fps-run-ready'],
  [/agentic-graph-game-fps-demo\.md/, 'agentic-graph-game-fps-demo.md'],
  [/VITE_AGENTIC_OS_RUN_READY_DEMO\s*(?:=|\|\|=|:)\s*['"]?game-fps\b/, 'game-fps run-ready selector'],
  [/"(?:demo|dev|predev):game-fps"/, 'standalone Game FPS package script'],
]
for (const { relPath, source } of [...authorityExecutableSources, ...authorityConfigSources]) {
  for (const [pattern, marker] of deletedStandaloneMarkers) {
    if (pattern.test(source)) {
      throw new Error(`deleted standalone Game Mode marker ${marker} returned in ${relPath}`)
    }
  }
}

const canvasPackage = JSON.parse(await text('canvas/package.json'))
const dependencies = { ...canvasPackage.dependencies, ...canvasPackage.devDependencies }
for (const dependency of forbiddenDependencies) {
  if (Object.hasOwn(dependencies, dependency)) {
    throw new Error(`Game FPS must not add ${dependency}`)
  }
}

const featureDir = path.join(root, 'canvas/src/features/game-fps')
const featureFiles = (await readdir(featureDir)).filter(name => /\.(?:tsx?|mjs)$/.test(name)).sort()
const featureSources = await Promise.all(featureFiles.map(async name => ({
  name,
  source: await readFile(path.join(featureDir, name), 'utf8'),
})))
for (const { name, source } of featureSources) {
  if (source.split(/\r?\n/).length > 600) throw new Error(`${name} exceeds 600 lines`)
  if (/<Canvas(?:\s|>)/.test(source)) throw new Error(`${name} must reuse the existing Three Canvas`)
  if (/arena|fallback/i.test(`${name}\n${source}`)) {
    throw new Error(`${name} contains forbidden alternate scene ownership`)
  }
  for (const [pattern, label] of forbiddenRuntimePatterns) {
    if (pattern.test(source)) throw new Error(`${name} contains forbidden runtime capability ${label}`)
  }
}

const gameThreeOwners = featureSources
  .filter(({ source }) => /@react-three\/fiber|from ['"]three['"]/.test(source))
  .map(({ name }) => name)
if (gameThreeOwners.length !== 1 || gameThreeOwners[0] !== 'GameFpsMissionStage.tsx') {
  throw new Error(`Game FPS Three ownership must be actor-only in GameFpsMissionStage.tsx, received ${gameThreeOwners.join(', ')}`)
}

const productionSources = authorityExecutableSources.filter(({ relPath }) => relPath.startsWith('canvas/src/'))
const gameAwarePattern = /\b(?:GameFpsMissionStage|gameFpsActive|gameMode\.active|readGameModeSnapshot|subscribeGameModeSnapshot)\b|from\s+['"][^'"]*(?:features\/game-fps|\/game-fps\/|\.\/game(?:Fps|Mode))/
const threePresentationPattern = /@react-three\/fiber|from\s+['"]three(?:\/|['"])|<(?:Canvas|primitive|group|mesh|ambientLight|directionalLight|hemisphereLight|pointLight|spotLight|Environment|Sky|Stars|[A-Za-z][A-Za-z0-9]*Geometry)\b/
const gameAwareThreeOwners = productionSources
  .filter(({ source }) => gameAwarePattern.test(source) && threePresentationPattern.test(source))
  .map(({ relPath }) => relPath)
const expectedGameAwareThreeOwners = [
  'canvas/src/features/game-fps/GameFpsMissionStage.tsx',
  'canvas/src/lib/three/ThreeGraph.impl.tsx',
]
if (JSON.stringify(gameAwareThreeOwners) !== JSON.stringify(expectedGameAwareThreeOwners)) {
  throw new Error(`Game-aware Three ownership must remain renderer mount plus actor-only stage, received ${gameAwareThreeOwners.join(', ')}`)
}
const missionStageSource = featureSources.find(({ name }) => name === 'GameFpsMissionStage.tsx')?.source || ''
const simulationClockSource = featureSources.find(({ name }) => name === 'gameFpsSimulationClock.ts')?.source || ''
const modelSource = featureSources.find(({ name }) => name === 'gameFpsModel.ts')?.source || ''
const decisionStoreSource = await text('canvas/src/features/workspace-fs/workspaceDecisionStore.ts')
const missionStageTags = [...missionStageSource.matchAll(/^\s*<([a-z][A-Za-z0-9]*)\b/gm)].map(match => match[1])
const missionStageComponentTags = [...missionStageSource.matchAll(/^\s*<([A-Z][A-Za-z0-9]*)\b/gm)].map(match => match[1])
const allowedMissionStageTags = ['group', 'mesh', 'capsuleGeometry', 'meshStandardMaterial']
if (missionStageTags.length !== allowedMissionStageTags.length
  || missionStageTags.some(tag => !allowedMissionStageTags.includes(tag))
  || missionStageComponentTags.length > 0) {
  throw new Error(`Game FPS stage must contain only its actor root and NPC mesh template, received ${[...missionStageTags, ...missionStageComponentTags].join(', ')}`)
}
if (!modelSource.includes('export const GAME_FPS_FIXED_STEP_SECONDS = 1 / 60')
  || !missionStageSource.includes('window.setInterval(clock.requestStep, SIMULATION_CLOCK_INTERVAL_MS)')
  || !missionStageSource.includes('window.clearInterval(timer)')
  || !missionStageSource.includes('clock.dispose()')
  || !missionStageSource.includes('bindGameFpsSimulationInputQueue(clock.queueInputStep)')
  || !missionStageSource.includes('advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)')
  || missionStageSource.includes('advanceGameModeSimulationBy(deltaSeconds)')
  || !missionStageSource.includes('minimumStepIntervalMs: SIMULATION_CLOCK_INTERVAL_MS')
  || !missionStageSource.includes('onStepError: reportGameModeSimulationFailure')
  || !missionStageSource.includes('isMotionControlPoseTracked(pose)')
  || !simulationClockSource.includes('lastStepStartedAt + options.minimumStepIntervalMs - now()')
  || !simulationClockSource.includes('queueInputStep: requestStep')) {
  throw new Error('Game Mode must retain one fixed, disposable, input-queued simulation clock with visible failures')
}
if (!missionStageSource.includes('readGameModeSnapshot().simulationStatus')
  || missionStageSource.includes('subscribeGameModeSnapshot')
  || missionStageSource.includes('useSyncExternalStore')) {
  throw new Error('Game Mode simulation gating must read the runtime owner without a render-loop subscription')
}
if (!missionStageSource.includes('readyFrameCountRef.current >= READY_FRAME_COUNT')
  || !missionStageSource.includes('deltaSeconds <= GAME_FPS_MAX_FRAME_SECONDS')) {
  throw new Error('Game Mode browser readiness must wait for a settled retained-Canvas frame pump')
}
if (!decisionStoreSource.includes("from '../../../../ecs/decisionDocument.js'")
  || /from\s+['"]node:|persistDecisions|persistDecision\s*\(/.test(decisionStoreSource)
  || !decisionStoreSource.includes('verification.persistedCount !== 0')) {
  throw new Error('Game Mode Decisions must retain the canonical browser-safe merge and verified read-back owner')
}

const physicsSeedPath = PHYSICS_SEED_RELATIVE_PATH
const physicsSeedSource = await text(physicsSeedPath)
const physicsSeed = parseFrontmatter(physicsSeedSource, physicsSeedPath)
if (physicsSeed?.run_ready_demo?.id !== 'xr-physics') {
  throw new Error('the canonical source seed must remain xr-physics')
}
if (physicsSeed?.game_mode?.invocation !== '/game.mode @canvas #gameplay operation=open'
  || physicsSeed?.game_mode?.operation_invocations?.start !== '/game.mode @canvas #gameplay operation=start'
  || physicsSeed?.game_mode?.inspect_tool !== 'agentic-graph.inspect_local_game_mode'
  || physicsSeed?.game_mode?.control_tool !== 'agentic-graph.control_local_game_mode') {
  throw new Error('the Physics source must declare explicit Game Mode overlay invocation and browser WebMCP ownership')
}
if (physicsSeed?.run_ready_demo?.canonical_source_file !== `/${physicsSeedPath}`
  || physicsSeed?.home_apex?.source_authority !== `/${physicsSeedPath}`
  || physicsSeed?.game_mode?.source_authority !== `/${physicsSeedPath}`) {
  throw new Error('the Physics source must remain the single Home Apex, XR Physics, and Game Mode source authority')
}

const workspaceSeedPaths = (await listMarkdownFiles(path.join(root, 'docs/workspace-seeds'))).sort()
const gameOrPhysicsDemoIdPattern = /(?:^|-)(?:game-(?:fps|mode)|(?:fps|mode)-game|xr-physics|physics-(?:xr|playground))(?:-|$)/
const flightOverlaySeedPath = FLIGHT_SEED_RELATIVE_PATH
const cityOverlaySeedPath = CITY_SIM_SEED_RELATIVE_PATH
for (const relPath of workspaceSeedPaths) {
  if (relPath === physicsSeedPath) continue
  const source = await text(relPath)
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) continue
  const frontmatter = loadYaml(match[1])
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) continue
  const runReadyDemo = frontmatter.run_ready_demo
  const runReadyId = String(
    runReadyDemo && typeof runReadyDemo === 'object' && !Array.isArray(runReadyDemo)
      ? runReadyDemo.id || ''
      : '',
  ).trim().toLowerCase().replace(/[_\s]+/g, '-')
  const surfaceMode = String(frontmatter.kgCanvasSurfaceMode || '').trim().toLowerCase()
  const threeMode = String(frontmatter.kgCanvas3dMode || '').trim().toLowerCase()
  const declaresStandaloneXrWorld = Boolean(runReadyId) && (surfaceMode === 'xr' || threeMode === 'xr')
  const sharedXrScene = frontmatter.shared_xr_scene
  const declaresCanonicalFlightOverlay = relPath === flightOverlaySeedPath
    && runReadyId === 'flight-sim'
    && sharedXrScene
    && typeof sharedXrScene === 'object'
    && !Array.isArray(sharedXrScene)
    && sharedXrScene.source_authority === `/${physicsSeedPath}`
    && sharedXrScene.world_ownership === 'overlay-only'
  const cityRuntime = frontmatter.city_runtime
  const declaresCanonicalCityOverlay = relPath === cityOverlaySeedPath
    && runReadyId === CITY_SIM_OVERLAY_AUTHORITY.id
    && cityRuntime
    && typeof cityRuntime === 'object'
    && !Array.isArray(cityRuntime)
    && cityRuntime.world_ownership === CITY_SIM_OVERLAY_AUTHORITY.worldOwnership
    && cityRuntime.surface_owner === CITY_SIM_OVERLAY_AUTHORITY.surfaceOwner
    && cityRuntime.renderer_rule === CITY_SIM_OVERLAY_AUTHORITY.rendererRule
  const declaresGameOrHomeAuthority = Object.hasOwn(frontmatter, 'game_mode')
    || Object.hasOwn(frontmatter, 'game_mode_xr_fidelity_status')
    || Object.hasOwn(frontmatter, 'home_apex')
    || Object.hasOwn(frontmatter, 'native_controller_demo')
  const pathLooksLikeAlternateAuthority = gameOrPhysicsDemoIdPattern.test(
    path.basename(relPath, path.extname(relPath)).toLowerCase().replace(/[_\s]+/g, '-'),
  )
  if (gameOrPhysicsDemoIdPattern.test(runReadyId)
    || (declaresStandaloneXrWorld
      && !declaresCanonicalFlightOverlay
      && !declaresCanonicalCityOverlay)
    || declaresGameOrHomeAuthority
    || pathLooksLikeAlternateAuthority) {
    throw new Error(`alternate standalone Game Mode/XR Physics source authority is forbidden: ${relPath}`)
  }
}

const xrPhysicsAuthorityPattern = /\bXR_PHYSICS_RUN_READY_DEMO_ID\b|['"]xr-physics['"]|agentic-graph-physics-playground-demo\.md/
const xrPhysicsThreeOwners = productionSources
  .filter(({ source }) => xrPhysicsAuthorityPattern.test(source) && threePresentationPattern.test(source))
  .map(({ relPath }) => relPath)
if (xrPhysicsThreeOwners.length > 0) {
  throw new Error(`XR Physics identity must not create another Three world owner, received ${xrPhysicsThreeOwners.join(', ')}`)
}

async function resolveAgenticCanvasOsDocsRoot() {
  const configured = String(process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT || '').trim()
  if (configured) {
    const resolved = path.resolve(configured)
    try {
      if ((await stat(resolved)).isDirectory()) return resolved
    } catch {
      // The configured source is mandatory when provided.
    }
    throw new Error(`AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT is not a readable directory: ${resolved}`)
  }
  const visited = new Set()
  let cursor = root
  while (true) {
    for (const candidate of [
      path.join(cursor, 'agentic-canvas-os', 'docs'),
      path.join(path.dirname(cursor), 'agentic-canvas-os', 'docs'),
    ]) {
      if (visited.has(candidate)) continue
      visited.add(candidate)
      try {
        if ((await stat(candidate)).isDirectory()) return candidate
      } catch {
        // Keep walking toward a shared workspace root.
      }
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) return null
    cursor = parent
  }
}

const agenticCanvasOsDocsRoot = await resolveAgenticCanvasOsDocsRoot()
if (agenticCanvasOsDocsRoot) {
  const projectedPhysicsSeedPath = path.join(
    agenticCanvasOsDocsRoot,
    'workspace-seeds',
    'agentic-graph-physics-playground-demo.md',
  )
  const projectedPhysicsSeedSource = await readFile(projectedPhysicsSeedPath, 'utf8')
  if (projectedPhysicsSeedSource !== physicsSeedSource) {
    throw new Error(`Physics source bytes differ from the Agentic Canvas OS projection: ${projectedPhysicsSeedPath}`)
  }
}

const threeGraph = await text('canvas/src/lib/three/ThreeGraph.impl.tsx')
const threeGameplayOverlay = await text('canvas/src/lib/three/ThreeGameplayOverlay.tsx')
const gameSourceTestCommand = String(canvasPackage.scripts?.['test:smoke:game-fps:source'] || '')
if (!gameSourceTestCommand.includes('--import ./scripts/source-authority-test-bootstrap.mjs')
  || !gameSourceTestCommand.includes('--test-concurrency=1')) {
  throw new Error('Game Mode source validation must preload settled source authority and run its mutable runtime serially')
}
const sourceAuthorityLifecycle = await text('canvas/src/features/source-files/sourceFilesBootstrapReadiness.ts')
const sourceAuthorityBootstrap = await text('canvas/src/features/source-files/SourceFilesPersistenceBootstrap.tsx')
const canvasStartupRuntimes = await text('canvas/src/features/canvas/CanvasStartupRuntimes.tsx')
const canvasSourceAuthorityBoundary = await text('canvas/src/features/canvas/CanvasSourceAuthorityBoundary.tsx')
const appSource = await text('canvas/src/App.tsx')
const xrRuntimeBridge = await text('canvas/src/features/three/XrMotionReferenceRuntimeBridge.tsx')
const xrCanonicalPhysicsStage = await text('canvas/src/features/three/XrCanonicalPhysicsStage.tsx')
const xrMotionReferenceGraphStage = await text('canvas/src/features/three/XrMotionReferenceGraphStage.tsx')
const canvasViewport = await text('canvas/src/components/CanvasViewport.tsx')
const threeRendererLifecycle = await text('canvas/src/lib/three/threeRendererLifecycle.ts')
const deepLinkRuntime = await text('canvas/src/features/canvas/CanvasDocDeepLinkRuntime.tsx')
const persistedWorkspaceFs = await text('canvas/src/features/workspace-fs/workspaceFsPersisted.ts')
const threeGraphImmersiveMedia = await text('canvas/src/lib/three/ThreeGraphImmersiveMedia.tsx')
const sourceAuthorityLifecycleMarkers = [
  "export type SourceFilesBootstrapPhase = 'resolving' | 'ready' | 'error'",
  "type: 'begin-document-intent'",
  "type: 'complete-document-intent'",
  "type: 'fail-document-intent'",
  'hasReachedReady',
  "if (current.documentIntent?.key !== normalizedKey) return current",
  "state.basePhase === 'error'",
]
const missingSourceAuthorityLifecycleMarkers = sourceAuthorityLifecycleMarkers.filter(
  marker => !sourceAuthorityLifecycle.includes(marker),
)
if (missingSourceAuthorityLifecycleMarkers.length > 0
  || !sourceAuthorityBootstrap.includes('beginSourceFilesDocumentIntent(documentIntentKey)')
  || !sourceAuthorityBootstrap.includes('completeSourceFilesBootstrap()')
  || !sourceAuthorityBootstrap.includes('failSourceFilesBootstrap(error)')) {
  throw new Error(`XR source authority must retain one fail-closed base plus keyed document transaction; missing ${missingSourceAuthorityLifecycleMarkers.join(', ') || 'bootstrap terminal ownership'}`)
}
if (!canvasViewport.includes("const sourceFilesBootstrapReady = sourceFilesBootstrap.phase === 'ready'")
  || !canvasViewport.includes('data-kg-source-authority-phase={sourceFilesBootstrap.phase}')
  || !canvasViewport.includes('resolveThreeCanvasSurfaceLifecycle({')
  || !canvasViewport.includes('sourceFilesBootstrapReady,')
  || !canvasViewport.includes('documentSwitchOwnsViewport,')
  || !threeRendererLifecycle.includes('input.sourceFilesBootstrapReady')
  || !threeRendererLifecycle.includes('&& !input.documentSwitchOwnsViewport')
  || !canvasViewport.includes('sourceFilesBootstrapReady && xrPhysicsRunReadyDemo')
  || !canvasViewport.includes('const gameFpsHudVisible = gameFpsActive && sourceFilesBootstrapReady')
  || !canvasStartupRuntimes.includes('useSourceFilesBootstrapHasReachedReady')
  || !canvasStartupRuntimes.includes('{sourceFilesBootstrapHasReachedReady ? <>')
  || canvasStartupRuntimes.includes('{sourceFilesBootstrapReady ? <>')
  || !canvasStartupRuntimes.includes('<XrPhysicsRunReadyDemoRuntime />')
  || !xrRuntimeBridge.includes('if (!sourceFilesBootstrapReady) return')
  || (xrRuntimeBridge.match(/if \(!readSourceFilesBootstrapReady\(\)\) return false/g) || []).length !== 2
  || !canvasSourceAuthorityBoundary.includes('<SourceFilesDocumentIntentProvider intentKey={intentKey}>')
  || !canvasSourceAuthorityBoundary.includes('resolveCanvasSourceAuthorityIntent')
  || !canvasSourceAuthorityBoundary.includes('pathname: String(location.pathname')
  || !canvasSourceAuthorityBoundary.includes('failSourceFilesDocumentIntent')
  || !appSource.includes('<CanvasSourceAuthorityBoundary>')
  || !appSource.includes('<XrMotionReferenceRuntimeBridge />')) {
  throw new Error('Three, Game Mode, HUD, and hydration must remain fenced by settled source authority while mounted run-ready lifecycle owners survive later document intents')
}
const xrGraphStageAuthority = threeGraph.match(/const xrGraphStageAuthority = mode === 'xr'[\s\S]*?const xrSceneAuthority/)?.[0] || ''
if (!/xrPhysicsRuntimeRunReadyDemo\s*\? 'native-controller'\s*: 'motion-reference'/.test(xrGraphStageAuthority)
  || !threeGraph.includes('resolveThreeGraphXrSceneAuthority({ mode, immersiveMediaActive: immersiveMediaStageActive, xrGraphStageAuthority, hasGlbAsset, hasSpatialCaptureManifest, hasXrEmptyWorld })')
  || !threeGraphImmersiveMedia.includes("if (input.immersiveMediaActive) return 'immersive-media'")
  || !threeGraphImmersiveMedia.includes('if (input.xrGraphStageAuthority) return input.xrGraphStageAuthority')
  || !threeGraphImmersiveMedia.includes("return input.hasXrEmptyWorld ? 'empty-world' : undefined")
  || !threeGraph.includes("const hasXrEmptyWorld = mode === 'xr' && !xrDocumentLoaded && !xrPhysicsRuntimeRunReadyDemo && !immersiveMediaStageActive")
  || !threeGraph.includes('xrGraphStageAuthority={xrGraphStageAuthority}')
  || (threeGraph.match(/data-kg-xr-scene-authority=\{xrSceneAuthority\}/g) || []).length !== 2) {
  throw new Error('canonical XR Physics must first mount native-controller; authored motion-reference and settled empty-world must remain disjoint')
}
if (!xrCanonicalPhysicsStage.includes('<XrNativeControllerDemoStage')
  || xrCanonicalPhysicsStage.includes('XrMotionReferenceStage')
  || xrCanonicalPhysicsStage.includes('XrPhysicsStageRuntime')
  || !xrMotionReferenceGraphStage.includes('<XrMotionReferenceStage')
  || xrMotionReferenceGraphStage.includes('XrNativeControllerDemoStage')
  || !threeGraph.includes("xrPhysicsRuntimeRunReadyDemo ? 'native-controller' : 'motion-reference'")
  || !deepLinkRuntime.includes('createWorkspaceFsMutationTransaction(fs)')
  || !deepLinkRuntime.includes('cancelIntent: () => {')
  || !deepLinkRuntime.includes('mirrorToHost: false')
  || !deepLinkRuntime.includes('...removedSourcePaths')
  || !persistedWorkspaceFs.includes('options?.mirrorToHost !== false && isWorkspaceDocsBackedMirrorPath(p)')) {
  throw new Error('canonical XR source activation must unmount hidden duplicate stages and roll back stale local-only imports across every persisted source owner')
}
const stageMounts = threeGameplayOverlay.match(/<GameFpsMissionStageLazy\b/g)?.length ?? 0
if (stageMounts !== 1) throw new Error(`expected one Game FPS stage mount, received ${stageMounts}`)
if (!threeGameplayOverlay.includes('if (props.gameFpsActive)')
  || !threeGameplayOverlay.includes('return <GameFpsMissionStageLazy coordinateScale={props.coordinateScale} />')) {
  throw new Error('Game-conditioned Three mounts must remain actor-only in the shared gameplay projection')
}
if (!threeGraph.includes('{!gameFpsStageActive ? <ControlsLazy')) {
  throw new Error('Game FPS must suppress the shared OrbitControls owner')
}
const xrWorldPlacement = threeGraph.match(/<XrWorldPlacement\b[\s\S]*?<\/XrWorldPlacement>/)?.[0] || ''
const authoredWorldTargets = ['SceneLazy', 'GlbAssetModel', 'SpatialCaptureManifestStage']
const missingPauseTargets = authoredWorldTargets.filter(component => {
  const mount = xrWorldPlacement.match(new RegExp(`<${component}\\b[\\s\\S]*?\\n\\s*/>`))?.[0] || ''
  return !mount.includes('paused={authoredWorldPaused}')
})
const spatialCaptureMount = xrWorldPlacement.match(/<SpatialCaptureManifestStage\b[\s\S]*?\n\s*\/>/)?.[0] || ''
if (!xrWorldPlacement.includes('{gameplayStage}')
  || !threeGraph.includes('const authoredWorldPaused = resolveAuthoredWorldPaused(paused, gameplayOverlayActive)')
  || missingPauseTargets.length > 0
  || !spatialCaptureMount.includes('dimmed={paused}')
  || (xrWorldPlacement.match(/paused=\{authoredWorldPaused\}/g) || []).length !== authoredWorldTargets.length) {
  throw new Error(`XR Game Mode must freeze every retained authored-world branch; missing ${missingPauseTargets.join(',') || 'exact pause ownership'}`)
}

console.log(`OK game-mode source contract (${featureFiles.length} feature modules, one Physics source plus explicit authored-XR overlay)`)
