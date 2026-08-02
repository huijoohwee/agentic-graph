import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
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
export type XrGameplaySurfaceId = Extract<
  XrSceneFloatingPanelView,
  'gameMode' | 'flightSim' | 'cityBuilder'
>

const XR_GAMEPLAY_SURFACE_IDS = new Set<XrGameplaySurfaceId>([
  'gameMode',
  'flightSim',
  'cityBuilder',
])

export function isXrGameplaySurfaceView(value: string): value is XrGameplaySurfaceId {
  return XR_GAMEPLAY_SURFACE_IDS.has(value as XrGameplaySurfaceId)
}

export function resolveXrSurfaceEntryPanelView(input: Readonly<{
  floatingPanelOpen: boolean
  floatingPanelView: string
}>): XrSceneFloatingPanelView | undefined {
  if (!input.floatingPanelOpen) return 'motionControl'
  if (input.floatingPanelView === 'skillsCommands') return undefined
  const scenePanelView = XR_SCENE_FLOATING_PANEL_VIEWS.find(view => view === input.floatingPanelView)
  return scenePanelView && !isXrGameplaySurfaceView(scenePanelView)
    ? scenePanelView
    : 'motionControl'
}

export type XrSceneSurfaceActivation = Readonly<{
  panelView?: XrSceneFloatingPanelView
  gameplaySurface?: XrGameplaySurfaceId
  geospatialComposite?: boolean
  preserveGameplay?: boolean
  openPanel?: boolean
  timeline?: boolean
  beforePanelCommit?: () => void
}>

type GameplayExitRegistration = Readonly<{
  exit: () => void
  preserveWhenPanelOnly: ReadonlySet<XrSceneFloatingPanelView>
}>

const gameplayExitHandlers = new Map<XrGameplaySurfaceId, GameplayExitRegistration>()
let lastActivatedGameplaySurface: XrGameplaySurfaceId | null = null

function exitInactiveGameplaySurfaces(
  selected: XrGameplaySurfaceId | undefined,
  panelView: XrSceneFloatingPanelView | undefined,
  explicitGameplayActivation: boolean,
): void {
  const activeSurface = lastActivatedGameplaySurface
  if (!activeSurface || activeSurface === selected) {
    if (selected) lastActivatedGameplaySurface = selected
    return
  }
  const registration = gameplayExitHandlers.get(activeSurface)
  if (!registration) {
    lastActivatedGameplaySurface = selected ?? null
    return
  }
  if (
    !explicitGameplayActivation
    && panelView
    && registration.preserveWhenPanelOnly.has(panelView)
  ) {
    return
  }
  registration.exit()
  lastActivatedGameplaySurface = selected ?? null
}

registerSharedXrDepartureHandler(() => {
  const activeSurface = lastActivatedGameplaySurface
  if (!activeSurface) return
  gameplayExitHandlers.get(activeSurface)?.exit()
  lastActivatedGameplaySurface = null
})

export function registerXrSceneGameplayExitHandler(
  surfaceId: XrGameplaySurfaceId,
  handler: () => void,
  options: Readonly<{
    preserveWhenPanelOnly?: readonly XrSceneFloatingPanelView[]
  }> = {},
): () => void {
  bindCanvasSurfaceOwnershipSource(listener => useGraphStore.subscribe(listener))
  const existing = gameplayExitHandlers.get(surfaceId)
  if (existing && existing.exit !== handler) {
    throw new Error(`${surfaceId} already has an active XR gameplay exit owner`)
  }
  const registration = Object.freeze({
    exit: handler,
    preserveWhenPanelOnly: new Set(options.preserveWhenPanelOnly || []),
  })
  gameplayExitHandlers.set(surfaceId, registration)
  return () => {
    if (gameplayExitHandlers.get(surfaceId) === registration) {
      gameplayExitHandlers.delete(surfaceId)
        if (lastActivatedGameplaySurface === surfaceId) {
          lastActivatedGameplaySurface = null
        }
    }
  }
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

  const explicitGameplayActivation = activation.gameplaySurface !== undefined
  const selectedGameplaySurface = activation.gameplaySurface
    || (
      activation.panelView && isXrGameplaySurfaceView(activation.panelView)
        ? activation.panelView
        : undefined
    )
    if (!activation.preserveGameplay) {
    exitInactiveGameplaySurfaces(
      selectedGameplaySurface,
      activation.panelView,
      explicitGameplayActivation,
    )
    } else if (selectedGameplaySurface) {
      lastActivatedGameplaySurface = selectedGameplaySurface
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
