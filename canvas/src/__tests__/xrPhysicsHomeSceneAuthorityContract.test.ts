import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveXrCanonicalSceneProjection,
  resolveXrCanonicalSceneSpatialSource,
} from '@/features/three/xrCanonicalSceneSpatialSource'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

function requireSourceMarker(source: string, marker: string, contract: string): void {
  if (!source.includes(marker)) throw new Error(`${contract}: missing ${marker}`)
}

function requireBootstrapGuardBeforeMount(source: string, mountMarker: string, contract: string): void {
  const mountIndex = source.lastIndexOf(mountMarker)
  if (mountIndex < 0) throw new Error(`${contract}: missing ${mountMarker}`)
  const enclosingCondition = source.slice(Math.max(0, mountIndex - 1_200), mountIndex)
  if (!/sourceFilesBootstrapReady\s*(?:&&|\?)/.test(enclosingCondition)) {
    throw new Error(`${contract}: ${mountMarker} must stay behind the upstream source bootstrap gate`)
  }
}

function requireStableBootstrapAdmissionBeforeMount(
  source: string,
  mountMarker: string,
  contract: string,
): void {
  const mountIndex = source.lastIndexOf(mountMarker)
  if (mountIndex < 0) throw new Error(`${contract}: missing ${mountMarker}`)
  const enclosingCondition = source.slice(Math.max(0, mountIndex - 1_200), mountIndex)
  if (!/sourceFilesBootstrapHasReachedReady\s*\?/.test(enclosingCondition)) {
    throw new Error(`${contract}: ${mountMarker} must wait for initial source authority and remain mounted across later intents`)
  }
}

function requireCentralizedBootstrapActivation(
  viewportSource: string,
  lifecycleSource: string,
  mountMarker: string,
  contract: string,
): void {
  const mountIndex = viewportSource.lastIndexOf(mountMarker)
  if (mountIndex < 0) throw new Error(`${contract}: missing ${mountMarker}`)
  const enclosingCondition = viewportSource.slice(Math.max(0, mountIndex - 1_200), mountIndex)
  if (!enclosingCondition.includes('threeCanvasSurface.mounted')) {
    throw new Error(`${contract}: ${mountMarker} must stay behind centralized mount ownership`)
  }
  for (const marker of [
    'resolveThreeCanvasSurfaceLifecycle({',
    'sourceFilesBootstrapReady,',
    'documentSwitchOwnsViewport,',
  ]) {
    requireSourceMarker(viewportSource, marker, `${contract} viewport delegation`)
  }
  for (const marker of [
    'export function shouldActivateThreeCanvasSurface',
    'input.sourceFilesBootstrapReady',
    '&& !input.documentSwitchOwnsViewport',
  ]) {
    requireSourceMarker(lifecycleSource, marker, `${contract} activation owner`)
  }
}

export function testXrPhysicsHomeSceneAuthorityRejectsFallbackVariants(): void {
  const canonicalProjection = resolveXrCanonicalSceneProjection({ physicsRunReady: true })
  if (canonicalProjection !== 'native-controller') {
    throw new Error('expected canonical xr-physics source identity to own the native controller')
  }

  const authoredProjection = resolveXrCanonicalSceneProjection({ physicsRunReady: false })
  if (authoredProjection !== 'authored') {
    throw new Error('expected non-canonical authored XR documents to retain the shared motion-reference projection')
  }

  const spatialSource = resolveXrCanonicalSceneSpatialSource({
    projection: 'native-controller',
    stageId: 'singapore',
  })
  if (spatialSource.projection !== 'native-controller'
    || spatialSource.stage.id !== 'singapore'
    || spatialSource.staticColliders.length === 0) {
    throw new Error(`expected Home to resolve the canonical Singapore native terrain, got ${JSON.stringify({
      projection: spatialSource.projection,
      stageId: spatialSource.stage.id,
      staticColliderCount: spatialSource.staticColliders.length,
    })}`)
  }

  const bootstrapSource = readSource('features', 'source-files', 'sourceFilesBootstrapReadiness.ts')
  const sourceBoundarySource = readSource('features', 'canvas', 'CanvasSourceAuthorityBoundary.tsx')
  const appSource = readSource('App.tsx')
  const bridgeSource = readSource('features', 'three', 'XrMotionReferenceRuntimeBridge.tsx')
  const startupRuntimesSource = readSource('features', 'canvas', 'CanvasStartupRuntimes.tsx')
  const canvasViewportSource = readSource('components', 'CanvasViewport.tsx')
  const threeRendererLifecycleSource = readSource('lib', 'three', 'threeRendererLifecycle.ts')
  const canonicalPhysicsStageSource = readSource('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const motionReferenceGraphStageSource = readSource('features', 'three', 'XrMotionReferenceGraphStage.tsx')
  const xrSceneStageSource = readSource('features', 'three', 'XrSceneStage.tsx')
  const sceneSource = readSource('lib', 'three', 'Scene.impl.tsx')
  const threeGraphSource = readSource('lib', 'three', 'ThreeGraph.impl.tsx')
  const gameMissionSource = readSource('features', 'game-fps', 'GameFpsMissionStage.tsx')
  const staleCompositionPath = resolve(
    process.cwd(),
    'src',
    'features',
    'game-fps',
    'gameModeSceneComposition.ts',
  )
  const staleMixedStagePath = resolve(process.cwd(), 'src', 'features', 'three', 'XrGraphStage.tsx')

  for (const marker of [
    'resolving',
    'ready',
    'error',
    'useSourceFilesBootstrapSnapshot',
    'useSourceFilesBootstrapHydrated',
    'useSourceFilesBootstrapReady',
    'useSourceFilesBootstrapHasReachedReady',
  ]) {
    requireSourceMarker(bootstrapSource, marker, 'source bootstrap must own a single explicit lifecycle')
  }
  requireSourceMarker(
    sourceBoundarySource,
    '<SourceFilesDocumentIntentProvider intentKey={intentKey}>',
    'root Canvas source authority must project route intent before descendant effects',
  )
  requireSourceMarker(
    sourceBoundarySource,
    'resolveCanvasSourceAuthorityIntent',
    'root Canvas source authority must resolve route and query source identity together',
  )
  requireSourceMarker(
    sourceBoundarySource,
    'pathname: String(location.pathname',
    'root Canvas source authority must fence direct share paths before route normalization',
  )
  requireSourceMarker(
    sourceBoundarySource,
    'failSourceFilesDocumentIntent',
    'root Canvas source authority must fail closed for malformed explicit sources',
  )
  requireSourceMarker(
    appSource,
    '<CanvasSourceAuthorityBoundary>',
    'App must fence global XR hydration and Canvas behind the route source authority',
  )

  requireSourceMarker(bridgeSource, 'useSourceFilesBootstrapReady', 'XR runtime hydration must consume source authority')
  const imperativeHydratorGuards = bridgeSource.match(/if \(!readSourceFilesBootstrapReady\(\)\) return false/g) || []
  if (imperativeHydratorGuards.length !== 2) {
    throw new Error('both imperative XR hydrators must reject unsettled source authority before mutation')
  }
  const bridgeEffectIndex = bridgeSource.indexOf('useIsomorphicLayoutEffect(() => {')
  const bridgeHydrationIndex = bridgeSource.indexOf('hydrateCanonicalXrMotionReferenceRuntime()', bridgeEffectIndex)
  if (bridgeEffectIndex < 0 || bridgeHydrationIndex < 0) {
    throw new Error('XR runtime bridge must retain its canonical hydration effect')
  }
  const bridgeGate = bridgeSource.slice(bridgeEffectIndex, bridgeHydrationIndex)
  if (!/if\s*\(\s*!sourceFilesBootstrapReady\s*\)\s*return/.test(bridgeGate)) {
    throw new Error('XR runtime bridge must reject hydration until upstream source authority is ready')
  }

  requireSourceMarker(
    canvasViewportSource,
    'data-kg-source-authority-phase=',
    'Canvas viewport must expose source authority for runtime proof',
  )
  requireCentralizedBootstrapActivation(
    canvasViewportSource,
    threeRendererLifecycleSource,
    '<ThreeGraphLazy',
    'ThreeGraph source authority',
  )
  requireBootstrapGuardBeforeMount(
    canvasViewportSource,
    '<XrNativeControllerDemoHud',
    'canonical XR HUD source authority',
  )
  requireSourceMarker(
    canvasViewportSource,
    'const gameFpsHudVisible = gameFpsActive && sourceFilesBootstrapReady',
    'Game Mode HUD source authority',
  )
  requireStableBootstrapAdmissionBeforeMount(
    startupRuntimesSource,
    '<XrPhysicsRunReadyDemoRuntime',
    'XR run-ready lifecycle source authority',
  )

  for (const marker of ['<XrNativeControllerDemoStage', '<XrNativeControllerDemoSceneAtmosphere', 'retainStage']) {
    requireSourceMarker(canonicalPhysicsStageSource, marker, 'canonical Physics stage contract')
  }
  for (const forbidden of ['XrMotionReferenceStage', 'XrPhysicsStageRuntime', 'isXrPhysicsRunReadyDemoActive']) {
    if (canonicalPhysicsStageSource.includes(forbidden)) {
      throw new Error(`canonical Physics stage must not import or construct fallback owner ${forbidden}`)
    }
  }
  for (const marker of ['<XrMotionReferenceStage', '<XrPhysicsStageRuntime']) {
    requireSourceMarker(motionReferenceGraphStageSource, marker, 'authored motion-reference stage contract')
  }
  if (motionReferenceGraphStageSource.includes('XrNativeControllerDemoStage')) {
    throw new Error('authored motion-reference stage must not import the canonical Physics constructor')
  }
  for (const marker of [
    "authority === 'native-controller'",
    '<XrCanonicalPhysicsStage',
    "authority === 'motion-reference'",
    '<XrMotionReferenceGraphStageLazy',
  ]) {
    requireSourceMarker(xrSceneStageSource, marker, 'XR selector must select one explicit lazy owner')
  }
  requireSourceMarker(sceneSource, '<XrSceneStage authority={xrGraphStageAuthority}', 'Scene must delegate to the explicit XR selector')
  requireSourceMarker(
    threeGraphSource,
    "nativeXrRunReadyDemo ? 'native-controller' : 'motion-reference'",
    'ThreeGraph source identity must decide the XR stage before construction',
  )
  if (existsSync(staleMixedStagePath)) {
    throw new Error('expected the mixed XR stage owner to be deleted rather than hidden or retained')
  }

  for (const marker of [
    'data-kg-xr-scene-authority=',
    "'native-controller'",
    "'motion-reference'",
    "'empty-world'",
  ]) {
    requireSourceMarker(threeGraphSource, marker, 'XR scene owner must be explicit at first mount')
  }

  const forbiddenLegacyMarkers = [
    'GameFpsArenaEnvironment',
    'GAME_FPS_ARENA_CLEAR_COLOR',
    'gamePresentation',
    'kg_game_fps_arena',
    'resolveGameModeSceneComposition',
  ]
  const activeSceneSources = `${threeGraphSource}\n${gameMissionSource}`
  for (const marker of forbiddenLegacyMarkers) {
    if (activeSceneSources.includes(marker)) {
      throw new Error(`expected upstream scene cleanup to remove legacy fallback marker ${marker}`)
    }
  }
  if (existsSync(staleCompositionPath)) {
    throw new Error('expected the alternate Game Mode scene-composition owner to stay deleted')
  }
}
