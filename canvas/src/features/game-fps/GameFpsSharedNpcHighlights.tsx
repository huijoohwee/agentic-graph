import React from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { GAME_FPS_NPC_IDS, type GameFpsNpcSnapshot } from './gameFpsModel'
import { readGameFpsSnapshot } from './gameFpsRuntime'
import { readGameModeSnapshot, subscribeGameModeSnapshot } from './gameModeRuntime'
import {
  readXrSharedAssetGameplayNpcControl,
  subscribeXrSharedAssetControlRuntime,
} from '@/features/three/xrSharedAssetControlRuntime'

const readSelectedNpcId = () => GAME_FPS_NPC_IDS.find(id => readXrSharedAssetGameplayNpcControl(id).selected) || ''
const readGameModeActive = () => readGameModeSnapshot().active

type HighlightRef = React.MutableRefObject<Mesh | null>

// Active gameplay supplies its already-rendered pose. Inactive XR shows the
// canonical NPC location without starting or advancing a gameplay simulation.
export function applyGameFpsNpcSelectionHighlight(
  highlight: Mesh,
  npc: GameFpsNpcSnapshot | undefined,
  renderedNpc?: Mesh | null,
): void {
  highlight.visible = !!npc && npc.health > 0 && Number.isFinite(npc.health)
    && Number.isFinite(npc.x) && Number.isFinite(npc.z)
    && renderedNpc !== null && renderedNpc?.visible !== false
  highlight.userData.kgXrSharedAssetTarget = highlight.visible ? npc!.id : ''
  highlight.userData.kgXrSharedAssetSelected = highlight.visible
  if (!highlight.visible) return
  if (renderedNpc) {
    highlight.position.copy(renderedNpc.position)
    highlight.quaternion.copy(renderedNpc.quaternion)
    highlight.scale.copy(renderedNpc.scale)
  } else {
    highlight.position.set(npc!.x, 0.9, npc!.z)
    highlight.quaternion.identity()
    highlight.scale.set(1, Math.max(0.12, npc!.health / 100), 1)
  }
}

function NpcHighlightMesh({ npcId, highlightRef }: { npcId: string; highlightRef: HighlightRef }) {
  return (
    <mesh
      ref={highlightRef}
      name={`agentic_os_game_fps_npc_shared_highlight_${npcId}`}
      visible={false}
      renderOrder={10}
      userData={{ kgXrHighlightNpcId: npcId, kgXrStageHighlightTarget: 'npc-selected', kgXrTimelineHighlight: 'npc-selected' }}
    >
      <capsuleGeometry args={[0.52, 0.9, 4, 8]} />
      <meshBasicMaterial color="#facc15" wireframe transparent opacity={0.8} depthWrite={false} />
    </mesh>
  )
}

function InactiveNpcHighlight({ npcId }: { npcId: string }) {
  const highlightRef = React.useRef<Mesh | null>(null)
  useFrame(() => {
    const highlight = highlightRef.current
    if (highlight) applyGameFpsNpcSelectionHighlight(highlight, readGameFpsSnapshot().npcs.find(npc => npc.id === npcId))
  })
  return <NpcHighlightMesh npcId={npcId} highlightRef={highlightRef} />
}

export function GameFpsSharedNpcHighlights({ highlightRef }: { highlightRef?: HighlightRef }) {
  const npcId = React.useSyncExternalStore(subscribeXrSharedAssetControlRuntime, readSelectedNpcId, readSelectedNpcId)
  const gameplayActive = React.useSyncExternalStore(subscribeGameModeSnapshot, readGameModeActive, readGameModeActive)
  // Active gameplay owns updates in its existing NPC loop. Only the inactive
  // stage mounts a frame callback, and neither stage allocates an unselected mesh.
  if (!npcId || gameplayActive !== !!highlightRef) return null
  return <group name="agentic_os_game_fps_shared_npc_highlights">{
    highlightRef ? <NpcHighlightMesh npcId={npcId} highlightRef={highlightRef} /> : <InactiveNpcHighlight npcId={npcId} />
  }</group>
}
