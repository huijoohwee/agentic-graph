from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


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
              .endsWith('agentic-graph-physics-playground-demo.md')
            && nativeController.phase === 'running'
            && nativeFrame.phase === 'running'
            && nativeFrame.stepCount > 0
            && nativeFrame.bodies.length > 0
            && nativeController.terrainId === 'singapore'
            && nativeController.followCamera === true
            && ['stopped', 'playing', 'paused'].includes(physicsRuntime.phase)
            && physicsRuntime.world?.schema === 'agentic-graph-xr-physics-world/v1'
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
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule('gympgrphStore')
          const controller = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerDemoRuntime')
          const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
          const catalog = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraCatalog')
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
          const mapLibreCanvases = documentCanvases.filter(
            canvas => canvas.classList.contains('maplibregl-canvas'),
          )
          const auxiliaryCanvases = documentCanvases.filter(
            canvas => (
              !rendererCanvases.includes(canvas)
              && !mapLibreCanvases.includes(canvas)
            ),
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
          const names = Object.keys(namedNodeCounts).sort()
          const nativeVisualNames = names.filter(name => (
            name.startsWith('kg_xr_native_controller_')
            || name.startsWith('kg_xr_native_terrain_')
            || name.startsWith('kg_xr_stage_preset_')
            || name.startsWith('kg_xr_playground_')
          ))
          const flightVisualNames = names.filter(name => (
            name.startsWith('kg_flight_sim_')
            || name.startsWith('kg_flight-sim_')
          ))
          const nativeController = controller.readXrNativeControllerDemo()
          const baselineIdentity =
            window.__kgFlightSimBaselineSceneIdentity || {}
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
          const rendererCanvas = rendererCanvases[0] || null
          const contextAttributes = rendererCanvas
            ?.getContext('webgl2')
            ?.getContextAttributes?.()
            || rendererCanvas
              ?.getContext('webgl')
              ?.getContextAttributes?.()
            || null
          const map = gympgrph.readActiveMapLibreMap?.() || null
          const sourceId = 'kg-flight-sim:geo-overlay'
          const source = map?.getSource?.(sourceId) || null
          let sourceData = null
          try {
            sourceData = typeof source?.getData === 'function'
              ? await source.getData()
              : source?.serialize?.()?.data || null
          } catch {
            sourceData = null
          }
          const sourceFeatures = Array.isArray(sourceData?.features)
            ? sourceData.features
            : []
          const routePoints = sourceFeatures.filter(
            feature => feature?.properties?.kgFlightOverlayKind === 'route-point',
          )
          const mapLayersReady = [
            `${sourceId}:route`,
            `${sourceId}:objective-guide`,
            `${sourceId}:route-points`,
            `${sourceId}:aircraft-outline`,
            `${sourceId}:aircraft`,
          ].every(id => Boolean(map?.getLayer?.(id)))
          const visibleMapLibreCanvases = mapLibreCanvases.filter(canvas => {
            const rect = canvas.getBoundingClientRect()
            const style = getComputedStyle(canvas)
            return rect.width > 0
              && rect.height > 0
              && style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number(style.opacity || '1') > 0
          })
          return {
            ready: true,
            rootCount: roots.length,
            canvasCount: canvases.length,
            documentCanvasCount: documentCanvases.length,
            rendererCanvasCount: rendererCanvases.length,
            mapLibreCanvasCount: mapLibreCanvases.length,
            visibleMapLibreCanvasCount: visibleMapLibreCanvases.length,
            auxiliaryCanvasCount: auxiliaryCanvases.length,
            auxiliaryCanvasesLocalOnly,
            canvasIdentityCaptured: Boolean(window.__kgFlightSimCanvas),
            canvasStable: roots.length === 1
              && canvases.length === 1
              && rendererCanvases.length === 1
              && rendererCanvases[0] === canvases[0]
              && auxiliaryCanvasesLocalOnly
              && window.__kgFlightSimCanvas === canvases[0],
            rendererAlpha: contextAttributes?.alpha === true,
            visualProjection:
              rendererCanvas?.dataset.kgFlightSimVisualProjection || '',
            root: {
              documentLoaded: roots[0]?.getAttribute('data-kg-xr-document-loaded') || '',
              flightStage: roots[0]?.getAttribute('data-kg-flight-sim-stage') || '',
              flightSurface: roots[0]?.getAttribute('data-kg-flight-sim-surface') || '',
              authoredRetained: roots[0]?.getAttribute('data-kg-authored-xr-scene-retained') || '',
              emptyWorld: roots[0]?.getAttribute('data-kg-xr-empty-world') || '',
            },
            names,
            namedNodeCounts,
            nativeVisualNames,
            nativeVisualCount: nativeVisualNames.length,
            flightVisualNames,
            flightVisualCount: flightVisualNames.length,
            visibleSceneSignature: JSON.stringify({
              nativeVisualNames,
              flightVisualNames,
            }),
            mapOverlay: {
              active: Boolean(document.querySelector(
                '[data-kg-flight-geospatial-overlay="active"]',
              )),
              sourceFeatureCount: sourceFeatures.length,
              layersReady: mapLayersReady,
              aircraftFeatureCount: sourceFeatures.filter(
                feature => feature?.properties?.kgFlightOverlayKind === 'aircraft',
              ).length,
              routeFeatureCount: sourceFeatures.filter(
                feature => feature?.properties?.kgFlightOverlayKind === 'route',
              ).length,
              objectiveGuideFeatureCount: sourceFeatures.filter(
                feature => feature?.properties?.kgFlightOverlayKind
                  === 'objective-guide',
              ).length,
              pendingWaypointCount: routePoints.filter(feature => (
                feature?.properties?.kgFlightRouteKind === 'waypoint'
                && feature?.properties?.kgFlightRouteState !== 'visited'
              )).length,
              landingStates: routePoints
                .filter(feature => (
                  feature?.properties?.kgFlightRouteKind === 'landing'
                ))
                .map(feature => feature?.properties?.kgFlightRouteState),
            },
            exclusivePlainGeoOverlayCount: document.querySelectorAll(
              '[data-kg-flight-sim-geo-overlay="1"]',
            ).length,
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
        or scene.get("mapLibreCanvasCount") != 1
        or scene.get("visibleMapLibreCanvasCount") != 1
        or scene.get("auxiliaryCanvasesLocalOnly") is not True
    ):
        raise AssertionError(
            f"expected one MapLibre canvas and one retained Flight runtime Canvas: {scene}"
        )
    if (
        scene.get("canvasIdentityCaptured") is not True
        or scene.get("canvasStable") is not True
    ):
        raise AssertionError("Flight Sim replaced the retained runtime Canvas")
    if scene.get("rendererAlpha") is not True:
        raise AssertionError("Flight runtime Canvas was not transparent")
    if scene.get("visualProjection") != "":
        raise AssertionError("Flight runtime Canvas published a parallel visual owner")
    camera = scene.get("camera") or {}
    if camera.get("authorityStable") is not True:
        raise AssertionError("Flight Sim replaced the Physics camera catalog")
    controller = scene.get("controller") or {}
    if controller.get("authorityStable") is not True:
        raise AssertionError("Flight Sim changed the authored Physics controller")
    if scene.get("nativeVisualCount") != 0:
        raise AssertionError(
            f"native XR visuals remained visible: {scene.get('nativeVisualNames')}"
        )
    flight_visual_names = set(scene.get("flightVisualNames") or [])
    if flight_visual_names:
        raise AssertionError(
            "Geo+XR retained parallel Flight visuals outside MapLibre: "
            f"{sorted(flight_visual_names)}"
        )
    map_overlay = scene.get("mapOverlay") or {}
    if (
        map_overlay.get("active") is not True
        or map_overlay.get("layersReady") is not True
        or map_overlay.get("aircraftFeatureCount") != 1
        or map_overlay.get("routeFeatureCount") != 1
    ):
        raise AssertionError(f"MapLibre Flight projection was incomplete: {map_overlay}")
    if scene.get("exclusivePlainGeoOverlayCount") != 0:
        raise AssertionError("exclusive plain-Geo Flight overlay mounted in Geo+XR")
    names = set(scene.get("names") or [])
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
    mission_phase: str | None = None,
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
    map_overlay = scene.get("mapOverlay") or {}
    expected_landing_state = (
        "visited"
        if mission_phase == "completed"
        else "active"
        if completed_waypoint_count >= waypoint_count
        else "pending"
    )
    if map_overlay.get("landingStates") != [expected_landing_state]:
        raise AssertionError(
            "Flight landing-pad state did not match route progress: "
            f"states={map_overlay.get('landingStates')}, "
            f"completed={completed_waypoint_count}/{waypoint_count}, "
            f"phase={mission_phase}"
        )
    expected_objective_guide_count = 0 if mission_phase == "completed" else 1
    if (
        map_overlay.get("objectiveGuideFeatureCount")
        != expected_objective_guide_count
    ):
        raise AssertionError(
            "MapLibre Flight objective guide did not match mission phase: "
            f"{map_overlay}"
        )
    expected_visible_waypoints = max(
        0,
        waypoint_count - completed_waypoint_count,
    )
    if map_overlay.get("pendingWaypointCount") != expected_visible_waypoints:
        raise AssertionError(
            "MapLibre Flight waypoint projection was not exact: "
            f"{map_overlay}"
        )
