import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Mesh } from 'three'

import {
  readXrV2ImmersiveSession,
  subscribeXrV2ImmersiveSession,
} from './xrV2ImmersiveSessionRuntime'
import {
  createXrV2SavedAssetImmersiveRenderGate,
  readXrV2SavedAssetPresentation,
  subscribeXrV2SavedAssetPresentation,
  type XrV2SavedAssetImmersiveRenderGate,
} from './xrV2SavedAssetPresentationRuntime'
import { createXrV2SavedAssetThreePresentation } from './xrV2SavedAssetThreePresentation'

export function XrV2SavedAssetImmersiveSurface() {
  const presentation = React.useSyncExternalStore(
    subscribeXrV2SavedAssetPresentation,
    readXrV2SavedAssetPresentation,
    readXrV2SavedAssetPresentation,
  )
  const immersive = React.useSyncExternalStore(
    subscribeXrV2ImmersiveSession,
    readXrV2ImmersiveSession,
    readXrV2ImmersiveSession,
  )
  const { clock, gl } = useThree()
  const meshRef = React.useRef<Mesh | null>(null)
  const gateRef = React.useRef<XrV2SavedAssetImmersiveRenderGate | null>(null)
  const surface = React.useMemo(() => (
    presentation.selected
      ? createXrV2SavedAssetThreePresentation(presentation.selected)
      : null
  ), [presentation.selected])

  useFrame(state => {
    if (immersive.phase === 'active') surface?.advance(state.clock.elapsedTime * 1_000)
  })

  React.useEffect(() => {
    if (!surface || immersive.phase !== 'active') return undefined
    surface.start(clock.elapsedTime * 1_000)
    return () => surface.stop()
  }, [clock, immersive.phase, surface])

  React.useEffect(() => () => {
    surface?.release()
    surface?.geometry.dispose()
    surface?.material.dispose()
    surface?.texture.dispose()
  }, [surface])

  React.useEffect(() => {
    gateRef.current?.release()
    gateRef.current = null
    const selected = presentation.selected
    if (!selected || !surface || immersive.phase !== 'active' || !immersive.mode) return undefined
    const gate = createXrV2SavedAssetImmersiveRenderGate({
      resource: selected,
      mode: immersive.mode,
      baselineRenderFrame: gl.info.render.frame,
    })
    gateRef.current = gate
    return () => {
      gate.release()
      if (gateRef.current === gate) gateRef.current = null
    }
  }, [gl.info.render, immersive.mode, immersive.phase, presentation.selected, surface])

  const observeActualRender = React.useCallback(() => {
    const mesh = meshRef.current
    const frame = surface?.readFrame()
    if (!frame) return
    gateRef.current?.observe({
      selectedAssetId: readXrV2SavedAssetPresentation().selected?.asset.asset_id || null,
      mode: immersive.phase === 'active' ? immersive.mode : null,
      canvasConnected: gl.domElement.isConnected,
      textureBound: Boolean(mesh && surface && mesh.material === surface.material
        && surface.material.map === surface.texture),
      renderFrame: gl.info.render.frame,
      frameIndex: frame.frameIndex,
      capturedAtMs: frame.capturedAtMs,
    })
  }, [gl, immersive.mode, immersive.phase, surface])

  if (!presentation.selected || !surface || immersive.phase !== 'active') return null
  return (
    <mesh
      ref={meshRef}
      name={`kg_xr_v2_saved_asset:${presentation.selected.asset.asset_id}`}
      geometry={surface.geometry}
      material={surface.material}
      position={[0, 1.35, -2]}
      dispose={null}
      onBeforeRender={observeActualRender}
      userData={{
        schema: 'agenticgraph-xr-v2-saved-asset-immersive-surface/v1',
        assetId: presentation.selected.asset.asset_id,
        sourceMetadata: presentation.selected.asset.metadata,
        depthDisplaced: surface.depthDisplaced,
      }}
    />
  )
}
