import React from 'react'
import type { Canvas3dModeId } from '@/lib/config'
import {
  readImmersiveMediaSnapshot,
  subscribeImmersiveMediaSnapshot,
} from '@/features/immersive-media/immersiveMediaRuntime'

const ImmersiveMediaStageLazy = React.lazy(() => import('@/features/immersive-media/ImmersiveMediaStage'))
const ImmersiveMediaHudLazy = React.lazy(() => import('@/features/immersive-media/ImmersiveMediaHud'))

export function useThreeGraphImmersiveMediaStageActive(
  mode: Canvas3dModeId,
  gameplayOverlayActive: boolean,
): boolean {
  const snapshot = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
  )
  return mode === 'xr' && snapshot.active && !gameplayOverlayActive
}

export function ThreeGraphImmersiveMediaStage() {
  return <ImmersiveMediaStageLazy />
}

export function ThreeGraphImmersiveMediaHud({
  geospatialComposite,
}: {
  geospatialComposite: boolean
}) {
  return (
    <React.Suspense fallback={null}>
      <ImmersiveMediaHudLazy geospatialComposite={geospatialComposite} />
    </React.Suspense>
  )
}

export function resolveThreeGraphXrSceneAuthority(input: Readonly<{
  mode: Canvas3dModeId
  immersiveMediaActive: boolean
  xrGraphStageAuthority?: string
  hasGlbAsset: boolean
  hasSpatialCaptureManifest: boolean
  hasXrEmptyWorld: boolean
}>): string | undefined {
  if (input.mode !== 'xr') return undefined
  if (input.immersiveMediaActive) return 'immersive-media'
  if (input.xrGraphStageAuthority) return input.xrGraphStageAuthority
  if (input.hasGlbAsset) return 'glb-asset'
  if (input.hasSpatialCaptureManifest) return 'spatial-capture'
  return input.hasXrEmptyWorld ? 'empty-world' : undefined
}
