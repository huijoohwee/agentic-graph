import React from 'react'
import {
  loadCanvasViewportGeospatialOverlay,
} from '@/components/canvasViewportGeospatialOverlayLoader'
import { preloadGeospatialMapRuntime } from '@/features/geospatial/gympgrphBridge'
import {
  FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import type { SourceFile } from '@/hooks/store/store-types/core'
import {
  preloadFlightSimMissionStage,
} from '@/lib/three/flightSimMissionStageLoader'
import {
  readFlightSimStageRuntimeController,
} from './flightSimRuntime'

function isFlightSimSeedPath(value: unknown): boolean {
  const path = String(value || '').replace(/\\/g, '/')
  return path === FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME
    || path.endsWith(`/${FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME}`)
}

export function resolveFlightSimSurfacePreloadIntent(args: Readonly<{
  activePath: string | null
  sourceFiles: readonly Pick<SourceFile, 'name' | 'source'>[]
}>): boolean {
  return isFlightSimSeedPath(args.activePath)
    || args.sourceFiles.some(file => (
      isFlightSimSeedPath(file.name)
      || isFlightSimSeedPath(file.source?.path)
    ))
}

export function useFlightSimSurfacePreload(args: Readonly<{
  activePath: string | null
  sourceFiles: readonly Pick<SourceFile, 'name' | 'source'>[]
}>): void {
  React.useEffect(() => {
    if (!resolveFlightSimSurfacePreloadIntent(args)) return
    // Activation owns admission and retry; these speculative loads only remove
    // cold module work from the authored source-to-first-frame budget.
    void Promise.allSettled([
      preloadGeospatialMapRuntime(),
      loadCanvasViewportGeospatialOverlay(),
      preloadFlightSimMissionStage(readFlightSimStageRuntimeController()),
    ])
  }, [args.activePath, args.sourceFiles])
}
