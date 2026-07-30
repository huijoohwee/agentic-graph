import React from 'react'
import { CanvasStartupDebugRuntime } from '@/features/canvas/CanvasStartupDebugRuntime'
import { CanvasStartupSsotBridgeRuntime } from '@/features/canvas/CanvasStartupSsotBridgeRuntime'
import { SourceFilesPersistenceBootstrap } from '@/features/source-files/SourceFilesPersistenceBootstrap'
import { useSourceFilesBootstrapHasReachedReady } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { XrPhysicsRunReadyDemoRuntime } from '@/features/canvas/XrPhysicsRunReadyDemoRuntime'
import { FlightSimRunReadyDemoRuntime } from '@/features/canvas/FlightSimRunReadyDemoRuntime'
import { CitySimRunReadyDemoRuntime } from '@/features/canvas/CitySimRunReadyDemoRuntime'

export function CanvasStartupRuntimes() {
  const sourceFilesBootstrapHasReachedReady = useSourceFilesBootstrapHasReachedReady()
  return (
    <>
      <CanvasStartupDebugRuntime />
      <SourceFilesPersistenceBootstrap />
      <CanvasStartupSsotBridgeRuntime />
      <FlightSimRunReadyDemoRuntime />
      {sourceFilesBootstrapHasReachedReady ? <>
        <XrPhysicsRunReadyDemoRuntime />
        <CitySimRunReadyDemoRuntime />
      </> : null}
    </>
  )
}
