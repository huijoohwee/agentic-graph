import React from 'react'
import { CanvasStartupDebugRuntime } from '@/features/canvas/CanvasStartupDebugRuntime'
import { CanvasStartupSsotBridgeRuntime } from '@/features/canvas/CanvasStartupSsotBridgeRuntime'
import { SourceFilesPersistenceBootstrap } from '@/features/source-files/SourceFilesPersistenceBootstrap'
import { useSourceFilesBootstrapHasReachedReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { XrPhysicsRunReadyDemoRuntime } from '@/features/canvas/XrPhysicsRunReadyDemoRuntime'
import { FlightSimRunReadyDemoRuntime } from '@/features/canvas/FlightSimRunReadyDemoRuntime'
import { CitySimRunReadyDemoRuntime } from '@/features/canvas/CitySimRunReadyDemoRuntime'
import { XrV2RunReadyDemoRuntime } from '@/features/canvas/XrV2RunReadyDemoRuntime'

export function CanvasStartupRuntimes() {
  const sourceFilesBootstrapHasReachedReady = useSourceFilesBootstrapHasReachedReady()
  return (
    <>
      <CanvasStartupDebugRuntime />
      <SourceFilesPersistenceBootstrap />
      <CanvasStartupSsotBridgeRuntime />
      <FlightSimRunReadyDemoRuntime />
      {sourceFilesBootstrapHasReachedReady ? <>
        <XrV2RunReadyDemoRuntime />
        <XrPhysicsRunReadyDemoRuntime />
        <CitySimRunReadyDemoRuntime />
      </> : null}
    </>
  )
}
