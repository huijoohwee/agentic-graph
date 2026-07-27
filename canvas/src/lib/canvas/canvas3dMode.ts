import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config'
import type { GraphSchema } from '@/lib/graph/schema'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

export const CANVAS_SURFACE_MODE_IDS = ['2d', '3d', 'xr', 'geo-xr', 'voxel', 'geospatial'] as const

export type CanvasSurfaceModeId = (typeof CANVAS_SURFACE_MODE_IDS)[number]

export const CANVAS_GRAPH_SURFACE_MODE_IDS = ['2d', '3d', 'xr', 'voxel'] as const

export type CanvasGraphSurfaceModeId = (typeof CANVAS_GRAPH_SURFACE_MODE_IDS)[number]

export type CanvasSurfaceModeSpec = {
  id: CanvasSurfaceModeId
  title: string
  label: string
}

const CANVAS_SURFACE_MODE_SPECS: Record<CanvasSurfaceModeId, CanvasSurfaceModeSpec> = {
  '2d': { id: '2d', title: '2D Mode', label: '2D' },
  '3d': { id: '3d', title: '3D Mode', label: '3D' },
  xr: { id: 'xr', title: 'XR Mode', label: 'XR' },
  'geo-xr': { id: 'geo-xr', title: 'Geo+XR Mode', label: 'Geo+XR' },
  voxel: { id: 'voxel', title: 'Voxel Mode', label: 'Voxel' },
  geospatial: { id: 'geospatial', title: 'Geospatial Mode', label: 'Geo' },
}

export function getCanvasSurfaceModeSpec(id: CanvasSurfaceModeId): CanvasSurfaceModeSpec {
  return CANVAS_SURFACE_MODE_SPECS[id]
}

export function listCanvasSurfaceModeSpecs(): readonly CanvasSurfaceModeSpec[]
export function listCanvasSurfaceModeSpecs<T extends CanvasSurfaceModeId>(ids: readonly T[]): ReadonlyArray<CanvasSurfaceModeSpec & { id: T }>
export function listCanvasSurfaceModeSpecs(ids: readonly CanvasSurfaceModeId[] = CANVAS_SURFACE_MODE_IDS): readonly CanvasSurfaceModeSpec[] {
  return ids.map(id => CANVAS_SURFACE_MODE_SPECS[id])
}

type VoxelModeApplicabilityArgs = {
  canvas2dRenderer: Canvas2dRendererId
  documentSemanticMode: string
  frontmatterModeEnabled: boolean
  multiDimTableModeEnabled: boolean
  geospatialEnabled?: boolean
  schema: GraphSchema | null | undefined
}

export type VoxelModeInapplicableReason = 'renderer' | 'semantic' | 'layout' | 'geospatial' | null

export type CanvasSurfaceModeDisabledCopy = {
  reason: string
  hint?: string
} | null

export type CanvasSurfaceModeApplicabilityArgs = VoxelModeApplicabilityArgs & {
  layoutMode?: string | null
}

export type CanvasSurfaceModeSelectionParams = CanvasSurfaceModeApplicabilityArgs & {
  mode: CanvasSurfaceModeId
  onOpenGeospatialMode: () => void
  onExitGeospatialMode?: () => void
  setCanvas2dRenderer: (id: Canvas2dRendererId) => void
  setCanvasRenderMode: (mode: '2d' | '3d') => void
  setCanvas3dMode: (mode: Canvas3dModeId) => void
  setSchema: (schema: GraphSchema) => void
}

export type CanvasGraphSurfaceModeActivationParams = Pick<CanvasSurfaceModeSelectionParams, 'setCanvasRenderMode' | 'setCanvas3dMode'> & {
  mode: Canvas3dModeId
}

export function activateCanvasGraphSurfaceMode(params: CanvasGraphSurfaceModeActivationParams): void {
  params.setCanvas3dMode(params.mode)
  params.setCanvasRenderMode('3d')
}

export function normalizeCanvas3dMode(raw: unknown): Canvas3dModeId {
  if (raw === 'xr') return 'xr'
  return raw === 'voxel' ? 'voxel' : '3d'
}

export function isVoxelSemanticModeAllowed(args: Pick<VoxelModeApplicabilityArgs, 'documentSemanticMode' | 'frontmatterModeEnabled' | 'multiDimTableModeEnabled'>): boolean {
  return (
    args.frontmatterModeEnabled === true ||
    args.multiDimTableModeEnabled === true ||
    args.documentSemanticMode === 'document' ||
    args.documentSemanticMode === 'keyword'
  )
}

export function readGeospatialOverlayEnabled(): boolean {
  return readGeospatialOverlayEnabledPreference()
}

export function getVoxelModeInapplicableReason(args: VoxelModeApplicabilityArgs): VoxelModeInapplicableReason {
  if ((args.geospatialEnabled ?? readGeospatialOverlayEnabled()) === true) return 'geospatial'
  if (args.canvas2dRenderer !== 'flowchart') return 'renderer'
  if (!isVoxelSemanticModeAllowed(args)) return 'semantic'
  if (args.schema?.layout?.mode !== 'block') return 'layout'
  return null
}

export function getVoxelModeDisabledCopy(reason: VoxelModeInapplicableReason): CanvasSurfaceModeDisabledCopy {
  if (reason === 'geospatial') {
    return {
      reason: 'Disabled in Geospatial Mode',
      hint: 'Switch to Document Mode to enable',
    }
  }
  if (reason === 'renderer') {
    return {
      reason: 'Requires 2D Mode: Flowchart renderer',
      hint: 'Switch renderer to Flowchart',
    }
  }
  if (reason === 'semantic') {
    return {
      reason: 'Voxel Mode requires Document/Keyword, Frontmatter, or Multi-dimensional Table mode',
      hint: 'Enable one semantic mode, then retry',
    }
  }
  if (reason === 'layout') {
    return {
      reason: 'Voxel Mode is disabled in Radial Layout',
      hint: 'Set layout mode to Block',
    }
  }
  return null
}

export function getCanvasSurfaceModeDisabledCopy(
  args: CanvasSurfaceModeApplicabilityArgs,
  mode: CanvasSurfaceModeId,
): CanvasSurfaceModeDisabledCopy {
  const geospatialEnabled = (args.geospatialEnabled ?? readGeospatialOverlayEnabled()) === true
  if (mode === '2d') {
    return null
  }
  if (mode === '3d' || mode === 'xr') {
    if (geospatialEnabled) {
      return {
        reason: 'Disabled in Geospatial Mode',
        hint: 'Switch to Document Mode to enable',
      }
    }
    if ((args.layoutMode ?? args.schema?.layout?.mode) === 'radial') {
      return {
        reason: `${mode === 'xr' ? 'XR' : '3D'} Mode is disabled in Radial Layout`,
        hint: 'Switch layout mode to Block',
      }
    }
    return null
  }
  if (mode === 'geo-xr') {
    return (args.layoutMode ?? args.schema?.layout?.mode) === 'radial'
      ? {
        reason: 'Geo+XR Mode is disabled in Radial Layout',
        hint: 'Switch layout mode to Block',
      }
      : null
  }
  if (!args.schema) {
    return {
      reason: 'Graph schema is not ready yet',
      hint: 'Wait for graph initialization, then retry',
    }
  }
  return getVoxelModeDisabledCopy(getVoxelModeInapplicableReason(args))
}

export function isVoxelModeApplicable(args: VoxelModeApplicabilityArgs): boolean {
  return getVoxelModeInapplicableReason(args) === null
}

export function resolveCanvas3dMode(args: VoxelModeApplicabilityArgs & { requested: Canvas3dModeId }): Canvas3dModeId {
  if (args.requested === 'voxel' && !isVoxelModeApplicable(args)) return '3d'
  return args.requested
}

export function isCanvasSurfaceModeSelectable(args: CanvasSurfaceModeApplicabilityArgs, mode: CanvasSurfaceModeId): boolean {
  return getCanvasSurfaceModeDisabledCopy(args, mode) === null
}

export function applyCanvasSurfaceModeSelection(params: CanvasSurfaceModeSelectionParams): boolean {
  const {
    mode,
    geospatialEnabled,
    onOpenGeospatialMode,
    onExitGeospatialMode,
    canvas2dRenderer,
    schema,
    setCanvas2dRenderer,
    setCanvasRenderMode,
    setCanvas3dMode,
    setSchema,
  } = params
  if (mode === '2d') {
    if (geospatialEnabled) onExitGeospatialMode?.()
    setCanvasRenderMode('2d')
    return true
  }
  if (mode === 'geospatial') {
    setCanvasRenderMode('2d')
    onOpenGeospatialMode()
    return true
  }
  if (mode === 'geo-xr') {
    if ((params.layoutMode ?? schema?.layout?.mode) === 'radial') return false
    activateCanvasGraphSurfaceMode({ mode: 'xr', setCanvas3dMode, setCanvasRenderMode })
    onOpenGeospatialMode()
    return true
  }
  if (mode === 'voxel') {
    if (geospatialEnabled) {
      onOpenGeospatialMode()
      return false
    }
    if (!schema) return false
    if (schema.layout?.mode !== 'block') {
      setSchema({
        ...schema,
        layout: {
          ...(schema.layout || {}),
          mode: 'block',
        },
      })
    }
    if (canvas2dRenderer !== 'flowchart') {
      setCanvas2dRenderer('flowchart')
    }
    activateCanvasGraphSurfaceMode({ mode: 'voxel', setCanvas3dMode, setCanvasRenderMode })
    return true
  }
  if (geospatialEnabled) {
    onOpenGeospatialMode()
    return false
  }
  if ((params.layoutMode ?? schema?.layout?.mode) === 'radial') return false
  activateCanvasGraphSurfaceMode({ mode, setCanvas3dMode, setCanvasRenderMode })
  return true
}
