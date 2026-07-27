from __future__ import annotations

import time
from typing import Any

from playwright.sync_api import Page


GEO_XR_VIEW_CASES = (
    ("2d", "2d-classic", "planar", "classic"),
    ("2d-modern", "2d-modern", "planar", "modern"),
    ("3d", "3d-classic", "volumetric", "classic"),
    ("3d-modern", "3d-modern", "volumetric", "modern"),
)


def _select_view(page: Page, view_mode: str) -> None:
    page.evaluate(
        """
        async viewMode => {
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule('gympgrphStore')
          gympgrph.useGympgrphStore.getState().setGeospatialViewMode(viewMode)
        }
        """,
        view_mode,
    )


def _read_view(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const graph = await window.__kgFlightSimBrowserProof.importModule(
            'graphStore',
          )
          const camera = await window.__kgFlightSimBrowserProof.importModule(
            'flightSimCameraRuntime',
          )
          const cameraSource = await window.__kgFlightSimBrowserProof.importModule(
            'xrNativeControllerCameraRuntime',
          )
          const blob = await graph.useGraphStore.getState()
            .captureThreeGltfSnapshot()
          const gltf = blob ? JSON.parse(await blob.text()) : null
          const nodes = Array.isArray(gltf?.nodes) ? gltf.nodes : []
          const presentationNodes = nodes.filter(
            node => node?.name === 'kg_geo_xr_environment_presentation',
          )
          const terrainNodes = nodes.filter(
            node => node?.name === 'kg_xr_native_terrain_singapore',
          )
          const host = document.querySelector(
            '[data-kg-geospatial-render-policy="shared-xr-stage"]',
          )
          const rendererCanvases = Array.from(
            document.querySelectorAll('canvas'),
          ).filter(
            canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
          )
          const rendererCanvas = rendererCanvases[0] || null
          const pose = graph.useGraphStore.getState().captureThreeCameraPose()
          return {
            hostView: host?.getAttribute(
              'data-kg-geospatial-xr-stage-view',
            ) || '',
            projectionOwner: host?.getAttribute(
              'data-kg-geospatial-projection-owner',
            ) || '',
            worldSvgCount: host?.querySelectorAll('figure svg').length ?? -1,
            mapLibreCanvasCount: host?.querySelectorAll(
              '[aria-label="2D geospatial map host"] canvas, '
              + '[aria-label="3D geospatial map host"] canvas',
            ).length ?? -1,
            rendererCanvasCount: rendererCanvases.length,
            canvasStable: Boolean(rendererCanvas)
              && rendererCanvas === window.__kgFlightSimCanvas,
            terrainCount: terrainNodes.length,
            presentationCount: presentationNodes.length,
            presentation: presentationNodes[0]?.extras?.presentation || '',
            dimension: presentationNodes[0]?.extras?.dimension || '',
            theme: presentationNodes[0]?.extras?.theme || '',
            cameraPreference: camera.readFlightSimCameraSnapshot().view,
            cameraSource: cameraSource.readXrNativeControllerCamera().mode,
            pose,
          }
        }
        """
    )


def _wait_for_view(
    page: Page,
    *,
    expected_view: str,
    expected_presentation: str,
) -> dict[str, Any]:
    deadline = time.monotonic() + 20
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = _read_view(page)
        if (
            last.get("hostView") == expected_view
            and last.get("presentation") == expected_presentation
            and isinstance(last.get("pose"), dict)
        ):
            return last
        page.wait_for_timeout(100)
    raise AssertionError(
        "timed out waiting for Geo+XR presentation "
        f"{expected_presentation}: {last}"
    )


def verify_geo_xr_four_view_presentation(page: Page) -> dict[str, Any]:
    baseline_camera = page.evaluate(
        """
        async () => {
          const camera = await window.__kgFlightSimBrowserProof.importModule(
            'flightSimCameraRuntime',
          )
          const cameraSource = await window.__kgFlightSimBrowserProof.importModule(
            'xrNativeControllerCameraRuntime',
          )
          const cameraSourceMode = cameraSource
            .readXrNativeControllerCamera().mode
          cameraSource.selectXrNativeControllerCameraMode('free-orbit')
          return {
            cameraPreference: camera.readFlightSimCameraSnapshot().view,
            cameraSourceMode,
          }
        }
        """
    )
    baseline_camera_preference = baseline_camera["cameraPreference"]
    page.wait_for_timeout(100)
    results: list[dict[str, Any]] = []
    try:
        for view_mode, presentation, dimension, theme in GEO_XR_VIEW_CASES:
            _select_view(page, view_mode)
            observed = _wait_for_view(
                page,
                expected_view=view_mode,
                expected_presentation=presentation,
            )
            exact_contract = {
                "projectionOwner": "shared-r3f-stage",
                "worldSvgCount": 0,
                "mapLibreCanvasCount": 0,
                "rendererCanvasCount": 1,
                "canvasStable": True,
                "terrainCount": 1,
                "presentationCount": 1,
                "dimension": dimension,
                "theme": theme,
                "cameraPreference": baseline_camera_preference,
                "cameraSource": "free-orbit",
            }
            for key, expected in exact_contract.items():
                if observed.get(key) != expected:
                    raise AssertionError(
                        f"Geo+XR {presentation} violated {key}: "
                        f"expected={expected!r} observed={observed}"
                    )
            pose = observed["pose"]
            position = pose["position"]
            target = pose["target"]
            horizontal_offset = (
                (float(position["x"]) - float(target["x"])) ** 2
                + (float(position["z"]) - float(target["z"])) ** 2
            ) ** 0.5
            if dimension == "planar":
                quaternion = pose["quaternion"]
                camera_screen_up_z = 2 * (
                    float(quaternion["y"]) * float(quaternion["z"])
                    + float(quaternion["x"]) * float(quaternion["w"])
                )
                if (
                    horizontal_offset > 0.001
                    or position["y"] <= target["y"]
                    or camera_screen_up_z > -0.99
                ):
                    raise AssertionError(
                        f"Geo+XR {presentation} was not north-up top-down: {pose}"
                    )
            elif horizontal_offset <= 0.001:
                raise AssertionError(
                    f"Geo+XR {presentation} collapsed to planar framing: {pose}"
                )
            results.append(observed)
    finally:
        page.evaluate(
            """
            cameraSourceMode => window.__kgFlightSimBrowserProof
              .importModule('xrNativeControllerCameraRuntime')
              .then(cameraSource => cameraSource
                .selectXrNativeControllerCameraMode(cameraSourceMode))
            """,
            baseline_camera["cameraSourceMode"],
        )
    if len({result["presentation"] for result in results}) != 4:
        raise AssertionError(f"Geo+XR presentations collapsed: {results}")
    return {
        "baselineCameraPreference": baseline_camera_preference,
        "baselineCameraSource": baseline_camera["cameraSourceMode"],
        "views": results,
    }
