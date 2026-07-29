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
  React.useLayoutEffect(() => {
    if (!resolveFlightSimSurfacePreloadIntent(args)) return
    // Begin the async chunks in the source-selection commit, before passive
    // effects can trail the layout-owned document launch and its frame budget.
    // Activation still owns admission, awaiting, retry, and failure handling.
    void Promise.allSettled([
      preloadGeospatialMapRuntime(),
      loadCanvasViewportGeospatialOverlay(),
      preloadFlightSimMissionStage(readFlightSimStageRuntimeController()),
    ])
  }, [args.activePath, args.sourceFiles])
}
