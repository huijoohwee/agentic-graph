import React from 'react'
import * as THREE from 'three'
import { getVoxelLabelTexture } from '@/features/three/voxelLabelTexture'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import { XR_MOTION_REFERENCE_SELECTION_COLOR } from '@/features/three/xrMotionReferenceModel'
import {
  readXrSharedAssetControlRevision,
  readXrSharedAssetGameplayNpcControl,
  subscribeXrSharedAssetControlRuntime,
} from '@/features/three/xrSharedAssetControlRuntime'
import {
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from './gameFpsRuntime'
import type { GameFpsNpcSnapshot } from './gameFpsModel'

const NPC_HIGHLIGHT_INNER_RADIUS_METERS = 0.62
const NPC_HIGHLIGHT_OUTER_RADIUS_METERS = 0.98

function SharedNpcHighlight({ npc, sharedRevision }: {
  npc: GameFpsNpcSnapshot
  sharedRevision: number
}) {
  const sharedControl = readXrSharedAssetGameplayNpcControl(npc.id)
  const visible = sharedControl.selected && npc.health > 0
  const labelTexture = React.useMemo(() => getVoxelLabelTexture({
    text: `${npc.id} selected`,
    fontSizePx: 18,
    textColor: '#0f172a',
    bgColor: XR_MOTION_REFERENCE_SELECTION_COLOR,
    bgOpacity: 0.98,
  }), [npc.id])
  const labelAspect = labelTexture.widthPx / Math.max(1, labelTexture.heightPx)
  return (
    <group
      name={`kg_game_fps_shared_npc_highlight_${npc.id}`}
      position={[npc.x, 0.06, npc.z]}
      visible={visible}
      userData={{
        kgXrSharedAssetTarget: npc.id,
        kgXrSharedAssetSelected: visible,
        kgXrTimelineHighlight: 'npc-selected',
        kgXrStageHighlightTarget: 'npc-selected',
        sharedRevision,
      }}
    >
      <mesh
        name={`kg_game_fps_shared_npc_highlight_ring_${npc.id}`}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={THREE_RENDER_ORDER.overlays}
        userData={{
          npcId: npc.id,
          kgXrSharedAssetTarget: npc.id,
          kgXrSharedAssetSelected: visible,
          kgXrTimelineHighlight: 'npc-selected',
          kgXrStageHighlightTarget: 'npc-selected',
        }}
      >
        <ringGeometry args={[NPC_HIGHLIGHT_INNER_RADIUS_METERS, NPC_HIGHLIGHT_OUTER_RADIUS_METERS, 36]} />
        <meshBasicMaterial
          color={XR_MOTION_REFERENCE_SELECTION_COLOR}
          transparent
          opacity={0.96}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <sprite
        name={`kg_game_fps_shared_npc_highlight_label_${npc.id}`}
        position={[0, 1.45, 0]}
        scale={[Math.min(3.2, Math.max(1.3, labelAspect * 0.46)), 0.46, 1]}
        renderOrder={THREE_RENDER_ORDER.overlays}
        userData={{
          npcId: npc.id,
          kgXrSharedAssetTarget: npc.id,
          kgXrSharedAssetSelected: visible,
          kgXrTimelineHighlight: 'npc-selected',
        }}
      >
        <spriteMaterial
          map={labelTexture.texture}
          transparent
          depthTest={false}
          depthWrite={false}
          sizeAttenuation
        />
      </sprite>
    </group>
  )
}

export function GameFpsSharedNpcHighlights() {
  const mission = React.useSyncExternalStore(
    subscribeGameFpsSnapshot,
    readGameFpsSnapshot,
    readGameFpsSnapshot,
  )
  const sharedRevision = React.useSyncExternalStore(
    subscribeXrSharedAssetControlRuntime,
    readXrSharedAssetControlRevision,
    readXrSharedAssetControlRevision,
  )
  return (
    <group
      name="kg_game_fps_shared_npc_highlights"
      userData={{
        kgXrTimelineHighlight: 'npc-selected',
        npcCount: mission.npcs.length,
        sharedRevision,
      }}
    >
      {mission.npcs.map(npc => (
        <SharedNpcHighlight key={npc.id} npc={npc} sharedRevision={sharedRevision} />
      ))}
    </group>
  )
}
