import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8')
}

export function testXrSceneSurfaceOwnershipSourceBoundaries() {
  const toolbar = readSource('lib/toolbar/ToolbarToolMenu.impl.tsx')
  const toolbarRouting = readSource('features/three/toolbarXrScenePanelRouting.ts')
  const surfaceRuntime = readSource('features/three/xrSceneSurfaceRuntime.ts')
  const rendererSelect = readSource('components/toolbar/Canvas2dRendererSelect.tsx')
  const frontmatter = readSource('features/parsers/canvasFrontmatterPreset.ts')
  const physicsRuntime = readSource('features/canvas/XrPhysicsRunReadyDemoRuntime.tsx')
  const canvasSlice = readSource('hooks/store/canvasSlice.ts')
  const surfaceOwnership = readSource('lib/canvas/canvasSurfaceOwnershipRuntime.ts')
  if (!['media', 'animation', 'motionControl', 'gameMode', 'flightSim', 'cityBuilder', 'camera'].every(view => surfaceRuntime.includes(`'${view}'`))
    || !surfaceRuntime.includes('activateCanvasGraphSurfaceMode')
    || !surfaceRuntime.includes("input.floatingPanelView === 'skillsCommands'")
    || !surfaceRuntime.includes('registerXrSceneGameplayMode')
    || surfaceRuntime.includes('XR_GAMEPLAY_SURFACE_IDS')
    || surfaceRuntime.includes('gameplayExitHandlers')
    || !toolbar.includes('routeToolbarXrScenePanel({ view, canvasRenderMode, canvas3dMode })')
    || !toolbarRouting.includes('XR_SCENE_FLOATING_PANEL_VIEWS.find')
    || !toolbarRouting.includes('activateXrSceneSurface({ panelView })')
    || /set(?:Canvas|Floating|Bottom|Media)/.test(toolbarRouting)) {
    throw new Error('expected one shared XR scene-surface owner for all six companion panels and City Builder')
  }
  const transitionInterceptionCount = canvasSlice.match(/interceptSharedXrSurfaceTransition\(/g)?.length ?? 0
  if (!surfaceRuntime.includes('registerSharedXrActivationHandler(() => activateXrSceneSurface())')
    || !surfaceOwnership.includes('export function requestSharedXrSurfaceActivation()')
    || !surfaceOwnership.includes('export function interceptSharedXrSurfaceTransition(')
    || transitionInterceptionCount !== 2
    || !canvasSlice.includes('{ canvasRenderMode: m }')
    || !canvasSlice.includes('{ canvas3dMode: normalizeCanvas3dMode(mode) }')
    || !surfaceOwnership.includes("canvasRenderMode !== '3d' || canvas3dMode !== 'xr'")
    || !surfaceOwnership.includes('requestSharedXrSurfaceActivation()')) {
    throw new Error('expected both raw Canvas store setters to route XR entry through the registered shared owner and transaction gate')
  }
  const canvasXrSelectionStart = rendererSelect.indexOf("if (mode === 'xr') {")
  const canvasPlain3dSelectionStart = rendererSelect.indexOf('if (!state.floatingPanelOpen)', canvasXrSelectionStart)
  const canvasXrSelection = canvasXrSelectionStart >= 0 && canvasPlain3dSelectionStart > canvasXrSelectionStart
    ? rendererSelect.slice(canvasXrSelectionStart, canvasPlain3dSelectionStart)
    : ''
  if (!canvasXrSelection.includes('resolveXrSurfaceEntryPanelView(current)')
    || !canvasXrSelection.includes("activateXrSceneSurface({ panelView, openPanel: true, timeline: true })")
    || /set(?:Canvas|Floating|Bottom|Media)/.test(canvasXrSelection)) {
    throw new Error('expected Canvas View XR selection to invoke the shared scene owner without a raw surface setter variant')
  }
  const frontmatterXrStart = frontmatter.indexOf(
    'const activateSharedXrSurface = (): boolean => {',
  )
  const frontmatterXrEnd = frontmatter.indexOf(
    'if (!sharedXrSurfaceRouted) {',
    frontmatterXrStart,
  )
  const frontmatterXrSelection = frontmatterXrStart >= 0 && frontmatterXrEnd > frontmatterXrStart
    ? frontmatter.slice(frontmatterXrStart, frontmatterXrEnd)
    : ''
  if (!frontmatter.includes('xrSceneSurfaceRuntime')
    || !frontmatter.includes('XR_SCENE_FLOATING_PANEL_VIEWS.find')
    || !frontmatter.includes('const sharedXrSurfaceRouted = sharedXrSurfaceRequested || sharedXrPanelRequested')
    || !frontmatterXrSelection.includes('activateXrSceneSurface({')
    || !frontmatterXrSelection.includes(
      'requestCanvasFrontmatterGeospatialSurface(',
    )
    || !frontmatterXrSelection.includes(
      'afterCommit: activateSharedXrSurface',
    )
    || /setCanvas(?:RenderMode|3dMode)/.test(frontmatterXrSelection)) {
    throw new Error('expected XR frontmatter presets to await canonical Geo ownership before invoking the shared scene owner')
  }
  const sharedSceneConsumers = {
    Media: 'features/three/xrSceneMcpRuntime.ts',
    Animation: 'features/three/xrAnimationMcpRuntime.ts',
    'Motion Control': 'features/three/motionControlSurfaceRuntime.ts',
    'Game Mode': 'features/game-fps/gameModeRuntime.ts',
    'Flight Sim': 'features/game-flight-sim/flightSimSurfacePresentationRuntime.ts',
    Camera: 'features/strybldr/cameraMcpRuntime.ts',
  } as const
  for (const [label, relativePath] of Object.entries(sharedSceneConsumers)) {
    const runtimeSource = readSource(relativePath)
    if (!runtimeSource.includes('xrSceneSurfaceRuntime') || !runtimeSource.includes('activateXrSceneSurface')) {
      throw new Error(`expected ${label} activation to reuse xrSceneSurfaceRuntime.ts`)
    }
    if (label === 'Camera' && !runtimeSource.includes("panelView: 'camera'")) {
      throw new Error('expected Camera activation to leave Game ownership through the shared Camera panel route')
    }
  }
  if (
    !physicsRuntime.includes(
      'activateXrSceneSurface({ preserveGameplay: !dedicatedDemo })',
    )
    || !physicsRuntime.includes('if (\n        activatesXrSurface')
    || physicsRuntime.includes("setCanvas3dMode('xr')")
  ) {
    throw new Error('expected the XR run-ready bootstrap to reuse the shared scene-surface activation owner without replacing an already-active Flight surface')
  }
  const panelProjectionSources = {
    Media: 'features/command-menu/MediaCatalogPanelView.tsx',
    'Media XR': 'features/command-menu/XrMediaLibraryPanel.tsx',
    Animation: 'features/three/XrAnimationFloatingPanelView.tsx',
    'Motion Control': 'features/three/MotionControlFloatingPanelView.tsx',
    'Game Mode': 'features/game-fps/GameModeFloatingPanelView.tsx',
    'Flight Sim': 'features/game-flight-sim/FlightSimFloatingPanelView.tsx',
    Camera: 'features/strybldr/StrybldrCameraFloatingPanelView.tsx',
  } as const
  for (const [label, relativePath] of Object.entries(panelProjectionSources)) {
    const panelSource = readSource(relativePath)
    if (/@react-three\/fiber|<Canvas(?:\s|>)|new\s+(?:THREE\.)?Scene\s*\(|<(?:Scene|XrCanonicalPhysicsStage|XrMotionReferenceGraphStage|GameFpsMissionStage)(?:\s|>)/.test(panelSource)) {
      throw new Error(`expected ${label} panel to project controls only, never own a Three scene or R3F Canvas`)
    }
  }
  const cameraMotion = readSource('features/three/XrCameraMotionSection.tsx')
  const simulationWorkbenchStart = cameraMotion.indexOf('const openSimulationWorkbench')
  const simulationWorkbenchEnd = cameraMotion.indexOf('\n  const ', simulationWorkbenchStart + 1)
  const simulationWorkbench = simulationWorkbenchStart >= 0 && simulationWorkbenchEnd > simulationWorkbenchStart
    ? cameraMotion.slice(simulationWorkbenchStart, simulationWorkbenchEnd)
    : ''
  if (!simulationWorkbench.includes('activateXrSceneSurface')
    || /set(?:Canvas|Floating|Bottom|Media)/.test(simulationWorkbench)) {
    throw new Error('expected the Media workbench launcher to forbid raw Canvas/FloatingPanel/Timeline setter variants')
  }
}
