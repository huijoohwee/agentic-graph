import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'
import {
  readMediaCatalogMode,
  type MediaCatalogMode,
} from '@/features/command-menu/mediaCatalogModeRuntime'
import { openGameModeSurface } from '@/features/game-fps/gameModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { activateXrSceneSurface } from './xrSceneSurfaceRuntime'

export type MotionControlSurfaceTarget = 'motion-control' | 'xr-3d' | 'animation' | 'game-mode'
export type MotionControlCompanionTarget = Exclude<MotionControlSurfaceTarget, 'motion-control'>
export const MOTION_CONTROL_XR_UNAVAILABLE_MESSAGE = 'Motion Control requires XR Mode, but this document currently prevents XR activation.'
export const MOTION_CONTROL_XR_SURFACE_REQUIRED_MESSAGE = 'Open an approved XR Motion Control surface before starting capture or peer sharing.'

type MotionControlSurfaceSpec = Readonly<{
  label: string
  view: FloatingPanelView
}>

export const MOTION_CONTROL_SURFACE_CATALOG = Object.freeze({
  'motion-control': Object.freeze({ label: 'Motion Control', view: 'motionControl' }),
  'xr-3d': Object.freeze({ label: '3D for XR', view: 'media' }),
  animation: Object.freeze({ label: 'Animation', view: 'animation' }),
  'game-mode': Object.freeze({ label: 'Game Mode', view: 'gameMode' }),
} satisfies Record<MotionControlSurfaceTarget, MotionControlSurfaceSpec>)

export const MOTION_CONTROL_XR_RUNTIME_READY_VIEWS = Object.freeze([
  'motionControl',
  'skillsCommands',
  'media',
  'animation',
  'gameMode',
  'flightSim',
] satisfies readonly FloatingPanelView[])

const MOTION_CONTROL_XR_RUNTIME_READY_VIEW_SET = new Set<FloatingPanelView>(MOTION_CONTROL_XR_RUNTIME_READY_VIEWS)

export function motionControlCaptureSurfaceIsOpen(input: Readonly<{
  canvas3dMode: string
  canvasRenderMode: string
  floatingPanelOpen: boolean
  floatingPanelView: FloatingPanelView
  mediaCatalogMode: MediaCatalogMode
}>): boolean {
  if (input.canvasRenderMode !== '3d' || input.canvas3dMode !== 'xr' || !input.floatingPanelOpen) return false
  if (!MOTION_CONTROL_XR_RUNTIME_READY_VIEW_SET.has(input.floatingPanelView)) return false
  if (input.floatingPanelView !== 'media') return true
  return input.mediaCatalogMode === 'media' || input.mediaCatalogMode === 'xr-3d'
}

export function motionControlCaptureSurfaceCurrentlyOpen(): boolean {
  const state = useGraphStore.getState()
  return motionControlCaptureSurfaceIsOpen({
    canvas3dMode: state.canvas3dMode,
    canvasRenderMode: state.canvasRenderMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    mediaCatalogMode: readMediaCatalogMode(),
  })
}

export function openMotionControlSurface(target: MotionControlSurfaceTarget): boolean {
  if (target === 'game-mode') return openGameModeSurface()
  return activateXrSceneSurface({
    panelView: MOTION_CONTROL_SURFACE_CATALOG[target].view,
    openPanel: true,
    timeline: true,
  })
}
