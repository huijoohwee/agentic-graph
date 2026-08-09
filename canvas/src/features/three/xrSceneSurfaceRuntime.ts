import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  GameOsError,
  GameOsModeRegistry,
  type GameOsModeDeclaration,
  type GameOsModeSummary,
} from 'grph-shared/game-os/index'
import {
  activateCanvasGraphSurfaceMode,
  isCanvasSurfaceModeSelectable,
} from '@/lib/canvas/canvas3dMode'
import {
  bindCanvasSurfaceOwnershipSource,
  registerSharedXrActivationHandler,
  registerSharedXrDepartureHandler,
  runCanvasSurfaceOwnershipTransaction,
} from '@/lib/canvas/canvasSurfaceOwnershipRuntime'

export const XR_SCENE_FLOATING_PANEL_VIEWS = [
  'media',
  'animation',
  'motionControl',
  'gameMode',
  'flightSim',
  'cityBuilder',
  'camera',
] as const

export type XrSceneFloatingPanelView = (typeof XR_SCENE_FLOATING_PANEL_VIEWS)[number]
const XR_SCENE_CONTROL_PANEL_VIEWS = new Set<XrSceneFloatingPanelView>([
  'media',
  'animation',
  'motionControl',
  'camera',
])

type XrGameplayModeRegistration = Readonly<{
  declaration: GameOsModeDeclaration
  panelView: XrSceneFloatingPanelView
  preserveWhenPanelOnly: ReadonlySet<XrSceneFloatingPanelView>
}>

const gameplayModeRegistry = new GameOsModeRegistry()
const gameplayModesByPanelView = new Map<XrSceneFloatingPanelView, XrGameplayModeRegistration>()

export function isXrGameplaySurfaceView(value: string): value is XrSceneFloatingPanelView {
  const panelView = XR_SCENE_FLOATING_PANEL_VIEWS.find(candidate => candidate === value)
  return Boolean(panelView && !XR_SCENE_CONTROL_PANEL_VIEWS.has(panelView))
}

export function resolveXrSurfaceEntryPanelView(input: Readonly<{
  floatingPanelOpen: boolean
  floatingPanelView: string
}>): XrSceneFloatingPanelView | undefined {
  if (!input.floatingPanelOpen) return 'motionControl'
  if (input.floatingPanelView === 'skillsCommands') return undefined
  const scenePanelView = XR_SCENE_FLOATING_PANEL_VIEWS.find(view => view === input.floatingPanelView)
  return scenePanelView && XR_SCENE_CONTROL_PANEL_VIEWS.has(scenePanelView)
    ? scenePanelView
    : 'motionControl'
}

export type XrSceneSurfaceActivation = Readonly<{
  panelView?: XrSceneFloatingPanelView
  gameplaySurface?: XrSceneFloatingPanelView
  geospatialComposite?: boolean
  preserveGameplay?: boolean
  openPanel?: boolean
  timeline?: boolean
  beforePanelCommit?: () => void
}>

function reconcileGameplaySurface(
  selected: XrSceneFloatingPanelView | undefined,
  panelView: XrSceneFloatingPanelView | undefined,
  explicitGameplayActivation: boolean,
  preserveGameplay: boolean,
): void {
  const activeIdentity = gameplayModeRegistry.inspectSurface()?.identity
  const activeRegistration = activeIdentity
    ? Array.from(gameplayModesByPanelView.values()).find(
      registration => registration.declaration.identity === activeIdentity,
    )
    : undefined
  const selectedRegistration = selected
    ? gameplayModesByPanelView.get(selected)
    : undefined

  if (selected && !selectedRegistration) {
    throw new GameOsError(
      'surface_unavailable',
      `${selected} has no registered XR gameplay mode declaration.`,
      { panelView: selected },
    )
  }
  if (selectedRegistration?.declaration.identity === activeIdentity) return

  if (!explicitGameplayActivation && activeRegistration && panelView
    && activeRegistration.preserveWhenPanelOnly.has(panelView)) {
    return
  }
  if (selectedRegistration) {
    gameplayModeRegistry.activate(selectedRegistration.declaration.identity, {})
    return
  }
  if (preserveGameplay || !activeIdentity) return
  gameplayModeRegistry.deactivate(activeIdentity)
}

registerSharedXrDepartureHandler(() => {
  const activeIdentity = gameplayModeRegistry.inspectSurface()?.identity
  if (activeIdentity) gameplayModeRegistry.deactivate(activeIdentity)
})

export function registerXrSceneGameplayMode(
  panelView: XrSceneFloatingPanelView,
  declaration: GameOsModeDeclaration,
  options: Readonly<{
    preserveWhenPanelOnly?: readonly XrSceneFloatingPanelView[]
  }> = {},
): () => void {
  bindCanvasSurfaceOwnershipSource(listener => useGraphStore.subscribe(listener))
  if (XR_SCENE_CONTROL_PANEL_VIEWS.has(panelView)) {
    throw new Error(`${panelView} is a control panel view, not a gameplay mode surface`)
  }
  if (gameplayModesByPanelView.has(panelView)) {
    throw new Error(`${panelView} already has a registered XR gameplay mode`)
  }
  const unregisterMode = gameplayModeRegistry.registerMode(declaration)
  const registration: XrGameplayModeRegistration = Object.freeze({
    declaration,
    panelView,
    preserveWhenPanelOnly: new Set(options.preserveWhenPanelOnly || []),
  })
  gameplayModesByPanelView.set(panelView, registration)
  return () => {
    if (gameplayModesByPanelView.get(panelView) === registration) {
      unregisterMode()
      gameplayModesByPanelView.delete(panelView)
    }
  }
}

export function deactivateXrSceneGameplayMode(panelView: XrSceneFloatingPanelView): boolean {
  const registration = gameplayModesByPanelView.get(panelView)
  if (!registration) return false
  if (gameplayModeRegistry.inspectSurface()?.identity !== registration.declaration.identity) return false
  return gameplayModeRegistry.deactivate(registration.declaration.identity)
}

export function readXrSceneGameplayModeRegistry(): Readonly<{
  modes: readonly GameOsModeSummary[]
  activeIdentity: string | null
  liveOverlayCount: number
}> {
  return Object.freeze({
    modes: Object.freeze(gameplayModeRegistry.listModes()),
    activeIdentity: gameplayModeRegistry.inspectSurface()?.identity ?? null,
    liveOverlayCount: gameplayModeRegistry.liveOverlayCount,
  })
}

export function activateXrSceneSurface(
  activation: XrSceneSurfaceActivation = {},
): boolean {
  const state = useGraphStore.getState()
  const alreadyXr = state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr'
  if (!alreadyXr && !isCanvasSurfaceModeSelectable({
    canvas2dRenderer: state.canvas2dRenderer,
    documentSemanticMode: state.documentSemanticMode,
    frontmatterModeEnabled: state.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled === true,
    layoutMode: state.schema?.layout?.mode,
    schema: state.schema,
  }, activation.geospatialComposite ? 'geo-xr' : 'xr')) return false
  const previousSurface = Object.freeze({
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
  })
  const activeState = runCanvasSurfaceOwnershipTransaction(() => {
    activateCanvasGraphSurfaceMode({
      mode: 'xr',
      setCanvas3dMode: state.setCanvas3dMode,
      setCanvasRenderMode: state.setCanvasRenderMode,
    })
    const nextState = useGraphStore.getState()
    if (nextState.canvasRenderMode === '3d' && nextState.canvas3dMode === 'xr') return nextState
    nextState.setCanvas3dMode(previousSurface.canvas3dMode)
    useGraphStore.setState(previousSurface)
    return null
  })
  if (!activeState) return false

  try {
    activation.beforePanelCommit?.()
  } catch (error) {
    runCanvasSurfaceOwnershipTransaction(() => {
      activeState.setCanvas3dMode(previousSurface.canvas3dMode)
      useGraphStore.setState(previousSurface)
    })
    throw error
  }

  try {
    const explicitGameplayActivation = activation.gameplaySurface !== undefined
    const selectedGameplaySurface = activation.gameplaySurface
      || (
        activation.panelView && isXrGameplaySurfaceView(activation.panelView)
          ? activation.panelView
          : undefined
      )
    reconcileGameplaySurface(
      selectedGameplaySurface,
      activation.panelView,
      explicitGameplayActivation,
      activation.preserveGameplay === true,
    )
  } catch (error) {
    runCanvasSurfaceOwnershipTransaction(() => {
      activeState.setCanvas3dMode(previousSurface.canvas3dMode)
      useGraphStore.setState(previousSurface)
    })
    throw error
  }
  if (activation.panelView === 'media') setMediaCatalogMode('xr-3d')
  if (activation.panelView) activeState.setFloatingPanelView(activation.panelView)
  if (activation.openPanel) activeState.setFloatingPanelOpen(true)
  if (activation.timeline) {
    activeState.setBottomSurfaceTab('timeline')
    activeState.setBottomSurfaceCollapsed(false)
  }
  return true
}

registerSharedXrActivationHandler(() => activateXrSceneSurface())
