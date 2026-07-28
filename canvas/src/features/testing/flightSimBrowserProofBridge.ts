const MODULE_IMPORTERS = Object.freeze({
  cameraMcpRuntime: () => import('@/features/strybldr/cameraMcpRuntime'),
  cameraSourceMcpRuntime: () => import('@/features/strybldr/cameraSourceMcpRuntime'),
  flightSimCameraRuntime: () => import('@/features/game-flight-sim/flightSimCameraRuntime'),
  flightSimDeadlineRuntime: () => import('@/features/game-flight-sim/flightSimDeadlineRuntime'),
  flightSimInput: () => import('@/features/game-flight-sim/flightSimInput'),
  flightSimMcpRuntime: () => import('@/features/game-flight-sim/flightSimMcpRuntime'),
  flightSimModel: () => import('@/features/game-flight-sim/flightSimModel'),
  flightSimRuntime: () => import('@/features/game-flight-sim/flightSimRuntime'),
  flightSimSurfaceOwnershipStatus: () => import('@/features/game-flight-sim/flightSimSurfaceOwnershipStatus'),
  flightSimWebMcpTools: () => import('@/features/agent-ready/flightSimWebMcpTools'),
  geospatialModeBridge: () => import('@/features/geospatial/gympgrphBridge'),
  graphStore: () => import('@/hooks/useGraphStore'),
  gympgrphStore: () => import('@/lib/gympgrph/api'),
  knowgrphRuntimeIdentity: () => import('@/features/runtime-identity/knowgrphRuntimeIdentity'),
  markdownExplorerStore: () => import('@/features/markdown-explorer/store'),
  motionControlSurfaceRuntime: () => import('@/features/three/motionControlSurfaceRuntime'),
  sourceFilesBootstrapReadiness: () => import('@/features/source-files/sourceFilesBootstrapReadiness'),
  sourceFilesRuntimeMaterialization: () => import('@/features/source-files/sourceFilesRuntimeMaterialization'),
  workspaceCanonicalSeedBundle: () => import('@/features/workspace-fs/workspaceCanonicalSeedBundle'),
  workspaceFs: () => import('@/features/workspace-fs/workspaceFs'),
  workspaceRunReadyDemos: () => import('@/features/workspace-fs/workspaceRunReadyDemos'),
  xrCameraPlaybackControlsRuntime: () => import('@/features/three/xrCameraPlaybackControlsRuntime'),
  xrMotionReferenceRuntime: () => import('@/features/three/xrMotionReferenceRuntime'),
  xrMotionReferenceTimeline: () => import('@/features/three/xrMotionReferenceTimeline'),
  xrNativeControllerCameraCatalog: () => import('@/features/three/xrNativeControllerCameraCatalog'),
  xrNativeControllerCameraRuntime: () => import('@/features/three/xrNativeControllerCameraRuntime'),
  xrNativeControllerDemoRuntime: () => import('@/features/three/xrNativeControllerDemoRuntime'),
  xrNativeControllerPresentation: () => import('@/features/three/xrNativeControllerPresentation'),
  xrPhysicsRuntime: () => import('@/features/three/xrPhysicsRuntime'),
  xrSceneSurfaceRuntime: () => import('@/features/three/xrSceneSurfaceRuntime'),
})

export const FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA =
  'knowgrph-flight-sim-browser-proof-bridge/v1' as const

export type FlightSimBrowserProofModuleKey = keyof typeof MODULE_IMPORTERS

export type FlightSimBrowserProofBridge = Readonly<{
  importModule: (key: string) => Promise<unknown>
  moduleKeys: readonly FlightSimBrowserProofModuleKey[]
  schema: typeof FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA
}>

declare global {
  interface Window {
    __kgFlightSimBrowserProof?: FlightSimBrowserProofBridge
  }
}

export function installFlightSimBrowserProofBridge(): void {
  if (typeof window === 'undefined') return

  const moduleKeys = Object.freeze(
    Object.keys(MODULE_IMPORTERS) as FlightSimBrowserProofModuleKey[],
  )
  const bridge: FlightSimBrowserProofBridge = Object.freeze({
    schema: FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA,
    moduleKeys,
    async importModule(key: string): Promise<unknown> {
      if (!Object.prototype.hasOwnProperty.call(MODULE_IMPORTERS, key)) {
        throw new Error(`Unknown Flight browser proof module: ${key}`)
      }
      return MODULE_IMPORTERS[key as FlightSimBrowserProofModuleKey]()
    },
  })

  Object.defineProperty(window, '__kgFlightSimBrowserProof', {
    configurable: true,
    enumerable: false,
    value: bridge,
    writable: false,
  })
}
