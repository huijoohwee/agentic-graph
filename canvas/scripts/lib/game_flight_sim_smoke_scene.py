from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


FLIGHT_MISSION_NODE = "kg_flight_sim_mission"
FLIGHT_AIRCRAFT_NODE = "kg_flight_sim_aircraft"
FLIGHT_AIRCRAFT_ORIENTATION_NODE = "kg_flight_sim_aircraft_model_orientation"
FLIGHT_ASSET_NODE = "kg_xr_procedural_airplane"
FLIGHT_OPTIONAL_BEACON_NODE = "kg_flight_sim_optional_beacon"
FLIGHT_OPTIONAL_BEACON_PATH = (
    "canvas/src/features/game-flight-sim/assetSpec/fallbacks/"
    "optional-beacon.glb"
)
FLIGHT_OPTIONAL_BEACON_SHA256 = (
    "be41f87bb745ba35c439336d932dd69c34223d26e117443a3c8556e44fce70cd"
)
AUTHORED_XR_NODES = {
    "kg_graph_xr_stage",
    "kg_xr_native_controller_demo",
    "kg_xr_stage_preset_singapore",
    "kg_xr_playground_treasure",
}
CANONICAL_XR_TERRAIN_NODE = "kg_xr_native_terrain_singapore"
FORBIDDEN_SCENE_PREFIXES = ("kg_game_fps", "kg_xr_empty_world")


def read_and_pin_authored_physics_baseline(
    page: Page,
    expected_source_sha256: str,
) -> dict[str, Any]:
    return page.evaluate(
        """
        async expectedSourceSha256 => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const physics = await window.__kgFlightSimBrowserProof.importModule('xrPhysicsRuntime')
          const controller = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerDemoRuntime')
          const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
          const catalog = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraCatalog')
          const presentation = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerPresentation')
          const state = store.useGraphStore.getState()
          const blob = await state.captureThreeGltfSnapshot()
          if (!blob) return { ready: false }
          const gltf = JSON.parse(await blob.text())
          const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : []
          const roots = Array.from(document.querySelectorAll(
            '[data-kg-xr-scene-media-drop="1"]',
          ))
          const rootCanvases = roots.flatMap(
            root => Array.from(root.querySelectorAll('canvas')),
          )
          const documentCanvases = Array.from(
            document.querySelectorAll('canvas'),
          )
          const rendererCanvases = documentCanvases.filter(
            canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
          )
          const auxiliaryCanvases = documentCanvases.filter(
            canvas => !rendererCanvases.includes(canvas),
          )
          const auxiliaryCanvasesLocalOnly = auxiliaryCanvases.every(
            canvas => Boolean(canvas.closest(
              '[data-kg-motion-control-preview="local-only"], .monaco-editor',
            )),
          )
          const namedNodeCounts = nodes.reduce((counts, node) => {
            const name = String(node?.name || '').trim()
            if (name) counts[name] = (counts[name] || 0) + 1
            return counts
          }, {})
          const identityNodeNames = [
            'kg_graph_xr_stage',
            'kg_xr_native_controller_demo',
            'kg_xr_stage_preset_singapore',
            'kg_xr_playground_treasure',
            'kg_xr_native_terrain_singapore',
          ].sort()
          const nodeIdentity = identityNodeNames.map(name => {
            const node = nodes.find(candidate => candidate.name === name)
            return {
              name,
              translation: node?.translation || null,
              rotation: node?.rotation || null,
              scale: node?.scale || null,
              matrix: node?.matrix || null,
              stageId: node?.extras?.stageId ?? null,
              terrainId: node?.extras?.terrainId ?? null,
              stageScale: node?.extras?.stageScale ?? null,
            }
          })
          const nativeController = controller.readXrNativeControllerDemo()
          const nativeFrame =
            controller.readSharedXrNativeControllerDemoFrame()
          const physicsRuntime = physics.readXrPhysicsRuntime()
          const workspacePreset =
            state.graphData?.metadata?.canvasWorkspacePreset || {}
          const cameraAuthoritySignature = JSON.stringify({
            modes: [...catalog.XR_NATIVE_CONTROLLER_CAMERA_MODES],
            defaultMode: catalog.XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
          })
          const authoredSceneSignature = JSON.stringify(nodeIdentity)
          const atmosphereTerrainSignature = JSON.stringify({
            skyColor: presentation.XR_NATIVE_CONTROLLER_SKY_COLOR,
            fogColor: presentation.XR_NATIVE_CONTROLLER_FOG_COLOR,
            terrainId: nativeController.terrainId,
            terrainNode: nodeIdentity.find(
              node => node.name === 'kg_xr_native_terrain_singapore',
            ),
          })
          const controllerAuthoritySignature = JSON.stringify({
            schema: nativeController.schema,
            terrainId: nativeController.terrainId,
            mode: nativeController.mode,
            followCamera: nativeController.followCamera,
          })
          const canvas = rootCanvases[0] || null
          const requiredNodeNames = identityNodeNames.filter(
            name => namedNodeCounts[name] === 1,
          )
          const ready = roots.length === 1
            && rootCanvases.length === 1
            && rendererCanvases.length === 1
            && rendererCanvases[0] === canvas
            && auxiliaryCanvasesLocalOnly
            && requiredNodeNames.length === identityNodeNames.length
            && state.canvasRenderMode === '3d'
            && state.canvas3dMode === 'xr'
            && workspacePreset.canvasSurfaceMode === 'xr'
            && String(state.markdownDocumentName || '')
              .endsWith('knowgrph-physics-playground-demo.md')
            && nativeController.phase === 'running'
            && nativeFrame.phase === 'running'
            && nativeFrame.stepCount > 0
            && nativeFrame.bodies.length > 0
            && nativeController.terrainId === 'singapore'
            && nativeController.followCamera === true
            && ['stopped', 'playing', 'paused'].includes(physicsRuntime.phase)
            && physicsRuntime.world?.schema === 'knowgrph-xr-physics-world/v1'
          if (ready) {
            window.__kgFlightSimCanvas = canvas
            window.__kgFlightSimBaselineSceneIdentity = {
              authoredSceneSignature,
              atmosphereTerrainSignature,
              cameraAuthoritySignature,
              controllerAuthoritySignature,
              sourceSha256: expectedSourceSha256,
            }
          }
          return {
            ready,
            documentName: state.markdownDocumentName,
            renderMode: state.canvasRenderMode,
            canvas3dMode: state.canvas3dMode,
            surfaceMode: workspacePreset.canvasSurfaceMode || '',
            rootCount: roots.length,
            rootCanvasCount: rootCanvases.length,
            documentCanvasCount: documentCanvases.length,
            rendererCanvasCount: rendererCanvases.length,
            auxiliaryCanvasCount: auxiliaryCanvases.length,
            auxiliaryCanvasesLocalOnly,
            canvasIdentityCaptured:
              ready && window.__kgFlightSimCanvas === canvas,
            requiredNodeNames,
            authoredSceneSignature,
            atmosphereTerrainSignature,
            camera: {
              mode: camera.readXrNativeControllerCamera().mode,
              authoritySignature: cameraAuthoritySignature,
            },
            controller: {
              schema: nativeController.schema,
              phase: nativeController.phase,
              mode: nativeController.mode,
              followCamera: nativeController.followCamera,
              terrainId: nativeController.terrainId,
              stepCount: nativeFrame.stepCount,
              bodyCount: nativeFrame.bodies.length,
            },
            physics: {
              phase: physicsRuntime.phase,
              schema: physicsRuntime.world?.schema || '',
              bodyCount: physicsRuntime.world?.bodies?.length || 0,
              staticColliderCount: physicsRuntime.staticColliderCount,
            },
          }
        }
        """,
        expected_source_sha256,
    )


def read_flight_scene(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const controller = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerDemoRuntime')
          const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
          const catalog = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraCatalog')
          const presentation = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerPresentation')
          const blob = await store.useGraphStore.getState().captureThreeGltfSnapshot()
          if (!blob) return { ready: false }
          const gltf = JSON.parse(await blob.text())
          const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : []
          const roots = Array.from(
            document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]'),
          )
          const canvases = roots.flatMap(
            root => Array.from(root.querySelectorAll('canvas')),
          )
          const documentCanvases = Array.from(
            document.querySelectorAll('canvas'),
          )
          const rendererCanvases = documentCanvases.filter(
            canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
          )
          const auxiliaryCanvases = documentCanvases.filter(
            canvas => !rendererCanvases.includes(canvas),
          )
          const auxiliaryCanvasesLocalOnly = auxiliaryCanvases.every(
            canvas => Boolean(canvas.closest(
              '[data-kg-motion-control-preview="local-only"], .monaco-editor',
            )),
          )
          const missionIndex = nodes.findIndex(
            node => node.name === 'kg_flight_sim_mission',
          )
          const missionNode = missionIndex >= 0 ? nodes[missionIndex] : null
          const pending = Array.isArray(missionNode?.children)
            ? [...missionNode.children]
            : []
          const descendants = []
          const visited = new Set()
          while (pending.length > 0) {
            const index = pending.shift()
            if (!Number.isInteger(index) || visited.has(index) || !nodes[index]) continue
            visited.add(index)
            descendants.push(nodes[index])
            if (Array.isArray(nodes[index].children)) {
              pending.push(...nodes[index].children)
            }
          }
          const namedNodeCounts = nodes.reduce((counts, node) => {
            const name = String(node?.name || '').trim()
            if (name) counts[name] = (counts[name] || 0) + 1
            return counts
          }, {})
          const optionalBeaconNode = descendants.find(
            node => node?.name === 'kg_flight_sim_optional_beacon',
          )
          const aircraftOrientationNode = descendants.find(
            node => node?.name === 'kg_flight_sim_aircraft_model_orientation',
          )
          const optionalBeaconNodes = descendants.filter(
            node => String(node?.name || '').startsWith(
              'kg_flight_sim_optional_beacon',
            ),
          )
          const visibleWaypointCount = Object.entries(namedNodeCounts)
            .filter(([name, count]) => (
              name.startsWith('kg_flight-sim_waypoint_')
              && count > 0
            )).length
          const visibleLandingPadCount =
            namedNodeCounts.kg_flight_sim_landing_pad || 0
          const authoredTransforms = [
            'kg_graph_xr_stage',
            'kg_xr_native_controller_demo',
            'kg_xr_stage_preset_singapore',
            'kg_xr_playground_treasure',
            'kg_xr_native_terrain_singapore',
          ].sort().map(name => {
            const node = nodes.find(candidate => candidate.name === name)
            return {
              name,
              translation: node?.translation || null,
              rotation: node?.rotation || null,
              scale: node?.scale || null,
              matrix: node?.matrix || null,
              stageId: node?.extras?.stageId ?? null,
              terrainId: node?.extras?.terrainId ?? null,
              stageScale: node?.extras?.stageScale ?? null,
            }
          })
          const nativeController = controller.readXrNativeControllerDemo()
          const baselineIdentity =
            window.__kgFlightSimBaselineSceneIdentity || {}
          const authoredSceneSignature = JSON.stringify(authoredTransforms)
          const atmosphereTerrainSignature = JSON.stringify({
            skyColor: presentation.XR_NATIVE_CONTROLLER_SKY_COLOR,
            fogColor: presentation.XR_NATIVE_CONTROLLER_FOG_COLOR,
            terrainId: nativeController.terrainId,
            terrainNode: authoredTransforms.find(
              node => node.name === 'kg_xr_native_terrain_singapore',
            ),
          })
          const cameraAuthoritySignature = JSON.stringify({
            modes: [...catalog.XR_NATIVE_CONTROLLER_CAMERA_MODES],
            defaultMode: catalog.XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
          })
          const controllerAuthoritySignature = JSON.stringify({
            schema: nativeController.schema,
            terrainId: nativeController.terrainId,
            mode: nativeController.mode,
            followCamera: nativeController.followCamera,
          })
          return {
            ready: true,
            rootCount: roots.length,
            canvasCount: canvases.length,
            documentCanvasCount: documentCanvases.length,
            rendererCanvasCount: rendererCanvases.length,
            auxiliaryCanvasCount: auxiliaryCanvases.length,
            auxiliaryCanvasesLocalOnly,
            canvasIdentityCaptured: Boolean(window.__kgFlightSimCanvas),
            canvasStable: roots.length === 1
              && canvases.length === 1
              && rendererCanvases.length === 1
              && rendererCanvases[0] === canvases[0]
              && auxiliaryCanvasesLocalOnly
              && window.__kgFlightSimCanvas === canvases[0],
            root: {
              documentLoaded: roots[0]?.getAttribute('data-kg-xr-document-loaded') || '',
              flightStage: roots[0]?.getAttribute('data-kg-flight-sim-stage') || '',
              flightSurface: roots[0]?.getAttribute('data-kg-flight-sim-surface') || '',
              authoredRetained: roots[0]?.getAttribute('data-kg-authored-xr-scene-retained') || '',
              emptyWorld: roots[0]?.getAttribute('data-kg-xr-empty-world') || '',
            },
            names: Object.keys(namedNodeCounts).sort(),
            namedNodeCounts,
            visibleWaypointCount,
            visibleLandingPadCount,
            authoredSceneSignature,
            baselineAuthoredSceneSignature:
              baselineIdentity.authoredSceneSignature || null,
            authoredSceneStable:
              Boolean(baselineIdentity.authoredSceneSignature)
              && baselineIdentity.authoredSceneSignature
                === authoredSceneSignature,
            atmosphereTerrainSignature,
            baselineAtmosphereTerrainSignature:
              baselineIdentity.atmosphereTerrainSignature || null,
            atmosphereTerrainStable:
              Boolean(baselineIdentity.atmosphereTerrainSignature)
              && baselineIdentity.atmosphereTerrainSignature
                === atmosphereTerrainSignature,
            camera: {
              mode: camera.readXrNativeControllerCamera().mode,
              authoritySignature: cameraAuthoritySignature,
              baselineAuthoritySignature:
                baselineIdentity.cameraAuthoritySignature || null,
              authorityStable:
                Boolean(baselineIdentity.cameraAuthoritySignature)
                && baselineIdentity.cameraAuthoritySignature
                  === cameraAuthoritySignature,
            },
            controller: {
              phase: nativeController.phase,
              mode: nativeController.mode,
              terrainId: nativeController.terrainId,
              authoritySignature: controllerAuthoritySignature,
              baselineAuthoritySignature:
                baselineIdentity.controllerAuthoritySignature || null,
              authorityStable:
                Boolean(baselineIdentity.controllerAuthoritySignature)
                && baselineIdentity.controllerAuthoritySignature
                  === controllerAuthoritySignature,
            },
            mission: {
              actorOnly: missionNode?.extras?.actorOnly === true,
              descendantNames: descendants
                .map(node => String(node?.name || '').trim())
                .filter(Boolean)
                .sort(),
              unnamedDescendantCount: descendants
                .filter(node => !String(node?.name || '').trim()).length,
              lightDescendantCount: descendants.filter(
                node => Number.isInteger(
                  node?.extensions?.KHR_lights_punctual?.light,
                ),
              ).length,
            },
            aircraftOrientation: {
              matrix: aircraftOrientationNode?.matrix || null,
              rotation: aircraftOrientationNode?.rotation || null,
              flightForward:
                aircraftOrientationNode?.extras?.flightForward || null,
              proceduralForward:
                aircraftOrientationNode?.extras?.proceduralForward || null,
            },
            optionalBeacon: {
              assetKind: optionalBeaconNode?.extras?.assetKind ?? null,
              assetPath: optionalBeaconNode?.extras?.assetPath ?? null,
              assetSha256: optionalBeaconNode?.extras?.assetSha256 ?? null,
              opaque: optionalBeaconNode?.extras?.opaque === true,
              meshDescendantCount: optionalBeaconNodes.filter(
                node => Number.isInteger(node?.mesh),
              ).length,
              partNames: optionalBeaconNodes
                .map(node => String(node?.name || '').trim())
                .filter(name => (
                  name
                  && name !== 'kg_flight_sim_optional_beacon'
                ))
                .sort(),
            },
          }
        }
        """
    )


def assert_authored_scene(scene: dict[str, Any]) -> None:
    if scene.get("ready") is not True:
        raise AssertionError(f"Three scene snapshot was unavailable: {scene}")
    if (
        scene.get("rootCount") != 1
        or scene.get("canvasCount") != 1
        or scene.get("rendererCanvasCount") != 1
        or scene.get("auxiliaryCanvasesLocalOnly") is not True
    ):
        raise AssertionError(f"expected one shared authored XR Canvas: {scene}")
    if (
        scene.get("canvasIdentityCaptured") is not True
        or scene.get("canvasStable") is not True
    ):
        raise AssertionError("Flight Sim replaced the shared authored XR Canvas")
    if scene.get("authoredSceneStable") is not True:
        raise AssertionError("Flight Sim changed the authored XR scene identity")
    if scene.get("atmosphereTerrainStable") is not True:
        raise AssertionError("Flight Sim changed the authored atmosphere or terrain")
    camera = scene.get("camera") or {}
    if camera.get("authorityStable") is not True:
        raise AssertionError("Flight Sim replaced the Physics camera catalog")
    controller = scene.get("controller") or {}
    if controller.get("authorityStable") is not True:
        raise AssertionError("Flight Sim changed the authored Physics controller")
    names = set(scene.get("names") or [])
    missing = sorted(AUTHORED_XR_NODES - names)
    if missing:
        raise AssertionError(f"authored XR nodes were missing: {missing}")
    counts = scene.get("namedNodeCounts") or {}
    if counts.get(CANONICAL_XR_TERRAIN_NODE) != 1:
        raise AssertionError("Flight Sim did not retain exactly one canonical XR terrain")
    forbidden = sorted(
        name
        for name in names
        if any(name.startswith(prefix) for prefix in FORBIDDEN_SCENE_PREFIXES)
    )
    if forbidden:
        raise AssertionError(f"fallback or sibling gameplay scene mounted: {forbidden}")


def assert_active_flight_scene(
    scene: dict[str, Any],
    *,
    completed_waypoint_count: int = 0,
    waypoint_count: int = 3,
) -> None:
    assert_authored_scene(scene)
    root = scene.get("root") or {}
    if root != {
        "documentLoaded": "1",
        "flightStage": "active",
        "flightSurface": "xr",
        "authoredRetained": "1",
        "emptyWorld": "",
    }:
        raise AssertionError(f"Flight Sim XR surface contract was not active: {root}")
    counts = scene.get("namedNodeCounts") or {}
    expected_once = (
        FLIGHT_MISSION_NODE,
        FLIGHT_AIRCRAFT_NODE,
        FLIGHT_AIRCRAFT_ORIENTATION_NODE,
        FLIGHT_ASSET_NODE,
        FLIGHT_OPTIONAL_BEACON_NODE,
    )
    if any(counts.get(name) != 1 for name in expected_once):
        raise AssertionError(f"Flight actor-only stage was duplicated or missing: {counts}")
    orientation = scene.get("aircraftOrientation") or {}
    matrix = orientation.get("matrix")
    rotation = orientation.get("rotation")
    procedural_forward = orientation.get("proceduralForward")
    flight_forward = orientation.get("flightForward")
    if (
        (
            (not isinstance(rotation, list) or len(rotation) != 4)
            and (not isinstance(matrix, list) or len(matrix) != 16)
        )
        or procedural_forward != [0, -1, 0]
        or flight_forward != [0, 0, -1]
    ):
        raise AssertionError(
            "Flight aircraft model orientation contract was missing: "
            f"{orientation}"
        )
    vx, vy, vz = (float(value) for value in procedural_forward)
    if isinstance(rotation, list) and len(rotation) == 4:
        qx, qy, qz, qw = (float(value) for value in rotation)
        tx = 2 * (qy * vz - qz * vy)
        ty = 2 * (qz * vx - qx * vz)
        tz = 2 * (qx * vy - qy * vx)
        rendered_forward = [
            vx + qw * tx + qy * tz - qz * ty,
            vy + qw * ty + qz * tx - qx * tz,
            vz + qw * tz + qx * ty - qy * tx,
        ]
    else:
        values = [float(value) for value in matrix]
        rendered_forward = [
            values[0] * vx + values[4] * vy + values[8] * vz,
            values[1] * vx + values[5] * vy + values[9] * vz,
            values[2] * vx + values[6] * vy + values[10] * vz,
        ]
    if any(
        abs(actual - expected) > 1e-6
        for actual, expected in zip(rendered_forward, flight_forward)
    ):
        raise AssertionError(
            "Flight aircraft nose did not align with model/camera forward: "
            f"rendered={rendered_forward} expected={flight_forward}"
        )
    optional_beacon = scene.get("optionalBeacon") or {}
    if (
        optional_beacon.get("assetKind") != "glb-fallback"
        or optional_beacon.get("assetPath") != FLIGHT_OPTIONAL_BEACON_PATH
        or optional_beacon.get("assetSha256")
        != FLIGHT_OPTIONAL_BEACON_SHA256
        or optional_beacon.get("opaque") is not True
        or int(optional_beacon.get("meshDescendantCount") or 0) < 1
        or not optional_beacon.get("partNames")
    ):
        raise AssertionError(
            "Flight optional beacon did not retain its admitted rendered GLB "
            f"identity: {optional_beacon}"
        )
    waypoint_names = [
        name for name in counts if name.startswith("kg_flight-sim_waypoint_")
    ]
    landing_pad_name = "kg_flight_sim_landing_pad"
    expected_landing_pad_count = 1 if completed_waypoint_count >= waypoint_count else 0
    if counts.get(landing_pad_name, 0) != expected_landing_pad_count:
        raise AssertionError(
            "Flight landing-pad visibility did not match route progress: "
            f"count={counts.get(landing_pad_name, 0)}, "
            f"completed={completed_waypoint_count}/{waypoint_count}"
        )
    expected_visible_waypoints = max(
        0,
        waypoint_count - completed_waypoint_count,
    )
    exact_waypoint_visibility = all(
        sum(
            name.startswith(f"kg_flight-sim_waypoint_{index}_")
            for name in waypoint_names
        )
        == (1 if index > completed_waypoint_count else 0)
        for index in range(1, waypoint_count + 1)
    )
    if (
        len(waypoint_names) != expected_visible_waypoints
        or any(counts[name] != 1 for name in waypoint_names)
        or not exact_waypoint_visibility
    ):
        raise AssertionError(f"Flight waypoint actors were not exact: {waypoint_names}")
    mission = scene.get("mission") or {}
    if mission.get("actorOnly") is not True or mission.get("lightDescendantCount") != 0:
        raise AssertionError(f"Flight mission mounted a world or light owner: {mission}")
    unexpected = sorted(
        name
        for name in mission.get("descendantNames") or []
        if name not in {
            FLIGHT_AIRCRAFT_NODE,
            FLIGHT_AIRCRAFT_ORIENTATION_NODE,
            FLIGHT_ASSET_NODE,
        }
        and not name.startswith("kg_xr_airplane_")
        and not name.startswith("kg_flight_sim_optional_beacon")
        and not name.startswith("kg_flight-sim_waypoint_")
        and name != landing_pad_name
    )
    if unexpected:
        raise AssertionError(
            f"Flight mission subtree contained non-actor scene nodes: {unexpected}"
        )
