from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


AUTHORED_XR_NODES = {
    "agentic_os_graph_xr_stage",
    "agentic_os_xr_native_controller_demo",
    "agentic_os_xr_stage_preset_singapore",
    "agentic_os_xr_playground_treasure",
}
CANONICAL_XR_TERRAIN_NODE = "agentic_os_xr_native_terrain_singapore"
FORBIDDEN_XR_ROOT_NODES = {
    "agentic_os_game_fps_arena",
    "agentic_os_xr_empty_world",
    "agentic_os_xr_empty_world_stage",
    "agentic_os_xr_motion_reference_stage",
}
GAME_MISSION_NODE = "agentic_os_game_fps_mission"
GAME_NPC_NODES = {
    "agentic_os_game_fps_npc_npc-scout",
    "agentic_os_game_fps_npc_npc-west",
    "agentic_os_game_fps_npc_npc-east",
    "agentic_os_game_fps_npc_npc-guard",
}
GAME_NODES = {GAME_MISSION_NODE, *GAME_NPC_NODES}


def read_xr_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const runtime = await import('/src/features/three/xrNativeControllerDemoRuntime.ts')
          return {
            snapshot: runtime.readXrNativeControllerDemo(),
            frame: runtime.readSharedXrNativeControllerDemoFrame(),
          }
        }
        """
    )


def assert_stable_renderer_canvas(page: Page) -> None:
    state = page.evaluate(
        """
        () => {
          const roots = Array.from(document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]'))
          const canvases = roots.flatMap(root => Array.from(root.querySelectorAll('canvas')))
          return {
            rootCount: roots.length,
            count: canvases.length,
            same: canvases.length === 1 && window.__kgGameModeXrShareCanvas === canvases[0],
          }
        }
        """
    )
    if state != {"rootCount": 1, "count": 1, "same": True}:
        raise AssertionError(f"shared XR/Game Mode renderer canvas was not stable: {state}")


def install_restored_frame_capture(page: Page) -> None:
    page.evaluate(
        """
        async () => {
          const runtime = await import('/src/features/three/xrNativeControllerDemoRuntime.ts')
          window.__kgGameModeXrRestoredFrame = null
          const unsubscribe = runtime.subscribeXrNativeControllerDemo(() => {
            if (runtime.readXrNativeControllerDemo().phase !== 'running') return
            window.__kgGameModeXrRestoredFrame = JSON.parse(JSON.stringify(
              runtime.readSharedXrNativeControllerDemoFrame(),
            ))
            unsubscribe()
          })
          window.__kgGameModeXrRestoredFrameCancel = unsubscribe
        }
        """
    )


def read_scene_contract(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const store = await import('/src/hooks/useGraphStore.ts')
          const blob = await store.useGraphStore.getState().captureThreeGltfSnapshot()
          if (!blob) return { ready: false, names: [] }
          const gltf = JSON.parse(await blob.text())
          const root = document.querySelector('[data-kg-xr-scene-media-drop="1"]')
          const canvas = root?.querySelector('canvas')
          const nodes = gltf.nodes || []
          const nativeStage = nodes.find(node => node.name === 'agentic_os_xr_native_controller_demo')
          const missionIndex = nodes.findIndex(node => node.name === 'agentic_os_game_fps_mission')
          const gameStage = missionIndex >= 0 ? nodes[missionIndex] : undefined
          const missionDirectChildIndices = Array.isArray(gameStage?.children) ? gameStage.children : []
          const missionDescendantIndices = []
          const pendingMissionIndices = [...missionDirectChildIndices]
          const visitedMissionIndices = new Set()
          while (pendingMissionIndices.length > 0) {
            const index = pendingMissionIndices.shift()
            if (!Number.isInteger(index) || visitedMissionIndices.has(index) || !nodes[index]) continue
            visitedMissionIndices.add(index)
            missionDescendantIndices.push(index)
            const children = Array.isArray(nodes[index].children) ? nodes[index].children : []
            pendingMissionIndices.push(...children)
          }
          const missionDescendants = missionDescendantIndices.map(index => nodes[index])
          const namedNodeCounts = nodes.reduce((counts, node) => {
            const name = String(node?.name || '').trim()
            if (name) counts[name] = (counts[name] || 0) + 1
            return counts
          }, {})
          const authoredNodeTransforms = Array.from(new Set([
            'agentic_os_graph_xr_stage',
            'agentic_os_xr_native_controller_demo',
            'agentic_os_xr_stage_preset_singapore',
            'agentic_os_xr_playground_treasure',
          ])).sort().map(name => {
            const node = nodes.find(candidate => candidate.name === name)
            return {
              name,
              translation: node?.translation || null,
              rotation: node?.rotation || null,
              scale: node?.scale || null,
              matrix: node?.matrix || null,
              identityExtras: {
                stageScale: node?.extras?.stageScale ?? null,
                stageId: node?.extras?.stageId ?? null,
              },
            }
          })
          return {
            ready: true,
            names: Array.from(new Set(nodes.map(node => String(node.name || '')).filter(Boolean))).sort(),
            nodeCount: nodes.length,
            namedNodeCounts,
            unnamedNodeCount: nodes.filter(node => !String(node?.name || '').trim()).length,
            lightNodeCount: nodes.filter(
              node => Number.isInteger(node?.extensions?.KHR_lights_punctual?.light),
            ).length,
            meshNodeCount: nodes.filter(node => Number.isInteger(node?.mesh)).length,
            retained: root?.getAttribute('data-kg-authored-xr-scene-retained') || '',
            presentation: root?.getAttribute('data-kg-game-mode-scene') || '',
            documentLoaded: root?.getAttribute('data-kg-xr-document-loaded') || '',
            emptyWorld: root?.getAttribute('data-kg-xr-empty-world') || '',
            cameraFov: canvas?.getAttribute('data-kg-game-fps-camera-fov') || '',
            spatialProfile: canvas?.getAttribute('data-kg-game-fps-spatial-profile') || '',
            nativeStageScale: Number(nativeStage?.extras?.stageScale || 0),
            gameStageScale: Number(gameStage?.extras?.coordinateScale || 0),
            authoredSceneSignature: JSON.stringify(authoredNodeTransforms),
            missionSubtree: {
              directChildCount: missionDirectChildIndices.length,
              directChildNames: missionDirectChildIndices
                .map(index => String(nodes[index]?.name || ''))
                .filter(Boolean)
                .sort(),
              descendantCount: missionDescendants.length,
              descendantNames: missionDescendants
                .map(node => String(node?.name || ''))
                .filter(Boolean)
                .sort(),
              unnamedDescendantCount: missionDescendants
                .filter(node => !String(node?.name || '').trim()).length,
              lightDescendantCount: missionDescendants
                .filter(node => Number.isInteger(node?.extensions?.KHR_lights_punctual?.light)).length,
              meshDescendantCount: missionDescendants
                .filter(node => Number.isInteger(node?.mesh)).length,
            },
          }
        }
        """
    )


def assert_authored_scene_identity(
    baseline: dict[str, Any],
    current: dict[str, Any],
    *,
    context: str,
) -> None:
    baseline_signature = baseline.get("authoredSceneSignature")
    current_signature = current.get("authoredSceneSignature")
    if (
        not isinstance(baseline_signature, str)
        or not baseline_signature
        or baseline_signature != current_signature
    ):
        raise AssertionError(f"authored XR scene identity changed during {context}")


def assert_game_scene_delta(
    baseline: dict[str, Any],
    active: dict[str, Any],
    *,
    context: str,
) -> dict[str, object]:
    baseline_counts = baseline.get("namedNodeCounts") or {}
    active_counts = active.get("namedNodeCounts") or {}
    if not isinstance(baseline_counts, dict) or not isinstance(active_counts, dict):
        raise AssertionError(f"Game Mode scene delta was unavailable during {context}")
    all_names = set(baseline_counts) | set(active_counts)
    named_delta = {
        name: int(active_counts.get(name, 0)) - int(baseline_counts.get(name, 0))
        for name in all_names
        if int(active_counts.get(name, 0)) != int(baseline_counts.get(name, 0))
    }
    expected_named_delta = {name: 1 for name in GAME_NODES}
    node_delta = int(active.get("nodeCount", -1)) - int(baseline.get("nodeCount", -1))
    unnamed_delta = int(active.get("unnamedNodeCount", -1)) - int(
        baseline.get("unnamedNodeCount", -1)
    )
    light_delta = int(active.get("lightNodeCount", -1)) - int(
        baseline.get("lightNodeCount", -1)
    )
    mesh_delta = int(active.get("meshNodeCount", -1)) - int(
        baseline.get("meshNodeCount", -1)
    )
    if (
        named_delta != expected_named_delta
        or node_delta != len(GAME_NODES)
        or unnamed_delta != 0
        or light_delta != 0
        or mesh_delta != len(GAME_NPC_NODES)
    ):
        raise AssertionError(
            f"Game Mode scene delta during {context} contained a sibling environment, light, "
            "unnamed node, duplicate actor, or non-mission variant: "
            f"named={named_delta}, nodes={node_delta}, unnamed={unnamed_delta}, "
            f"lights={light_delta}, meshes={mesh_delta}"
        )
    return {
        "gameMissionOverlayActorsOnly": True,
        "gameActivationAddedEnvironment": False,
        "gameActivationAddedLights": False,
        "unexpectedGameActivationNodes": [],
    }


def assert_game_overlay_subtree(contract: dict[str, Any]) -> None:
    subtree = contract.get("missionSubtree") or {}
    expected_names = sorted(GAME_NPC_NODES)
    if (
        subtree.get("directChildCount") != len(expected_names)
        or subtree.get("directChildNames") != expected_names
        or subtree.get("descendantCount") != len(expected_names)
        or subtree.get("descendantNames") != expected_names
        or subtree.get("unnamedDescendantCount") != 0
        or subtree.get("lightDescendantCount") != 0
        or subtree.get("meshDescendantCount") != len(expected_names)
    ):
        raise AssertionError(
            "Game Mode mission subtree contained an environment, light, unnamed node, "
            f"or non-NPC variant: {subtree}"
        )


def assert_scene_contract(contract: dict[str, Any], *, game_active: bool) -> None:
    if contract.get("ready") is not True:
        raise AssertionError(f"Three scene snapshot was unavailable: {contract}")
    names = set(contract.get("names") or [])
    forbidden_roots = sorted(
        name
        for name in names
        if name in FORBIDDEN_XR_ROOT_NODES
        or name.startswith("agentic_os_game_fps_arena")
        or name.startswith("agentic_os_xr_empty_world")
    )
    if forbidden_roots:
        raise AssertionError(
            "canonical XR physics scene mounted a fallback or legacy root: "
            f"{forbidden_roots}"
        )
    if contract.get("emptyWorld"):
        raise AssertionError(
            "canonical XR physics scene published the source-free empty-world DOM state"
        )
    if contract.get("documentLoaded") != "1":
        raise AssertionError(
            "canonical XR physics scene did not publish the loaded source document"
        )
    if contract.get("presentation") == "arena":
        raise AssertionError(
            "canonical XR physics scene published the legacy arena presentation"
        )
    named_counts = contract.get("namedNodeCounts") or {}
    if named_counts.get(CANONICAL_XR_TERRAIN_NODE) != 1:
        raise AssertionError(
            "canonical XR physics scene must contain exactly one native controller terrain: "
            f"{named_counts.get(CANONICAL_XR_TERRAIN_NODE, 0)}"
        )
    missing_xr = sorted(AUTHORED_XR_NODES - names)
    if missing_xr:
        raise AssertionError(f"authored XR scene nodes were missing: {missing_xr}")
    if not game_active:
        unexpected_game = sorted(GAME_NODES & names)
        if unexpected_game:
            raise AssertionError(f"Game Mode overlay mounted while inactive: {unexpected_game}")
        return
    missing_game = sorted(GAME_NODES - names)
    if missing_game:
        raise AssertionError(f"Game Mode overlay nodes were missing: {missing_game}")
    assert_game_overlay_subtree(contract)
    if contract.get("retained") != "1" or contract.get("presentation") != "xr-authored":
        raise AssertionError(f"XR Game Mode did not report authored-scene composition: {contract}")
    if contract.get("spatialProfile") != "xr-authored":
        raise AssertionError(f"XR Game Mode did not reuse the authored collision profile: {contract}")
    if not contract.get("nativeStageScale") or contract.get("gameStageScale") != contract.get("nativeStageScale"):
        raise AssertionError(f"XR Game Mode did not share authored-stage coordinates: {contract}")
    if not str(contract.get("cameraFov") or "").strip():
        raise AssertionError("Game Mode first-person camera did not publish its framing contract")
