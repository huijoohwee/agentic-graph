from __future__ import annotations

import math
import time
from typing import Any, Callable

from playwright.sync_api import Page


def _has_authored_environment_surface(
    last: dict[str, Any],
    *,
    surface_id: str,
    base_height_meters: float,
    height_meters: float,
    width_meters: float,
    depth_meters: float,
    require_viewport_bounds: bool = False,
) -> bool:
    surfaces = last.get("environmentSurfaceMeters") or []
    surface = next(
        (
            candidate
            for candidate in surfaces
            if isinstance(candidate, dict)
            and candidate.get("id") == surface_id
        ),
        None,
    )
    if not isinstance(surface, dict):
        return False

    def close(key: str, expected: float, tolerance: float = 0.12) -> bool:
        value = surface.get(key)
        return isinstance(value, (int, float)) and math.isclose(
            float(value), expected, abs_tol=tolerance,
        )

    return (
        close("baseHeightMeters", base_height_meters, tolerance=0.01)
        and close("heightMeters", height_meters, tolerance=0.01)
        and close("widthMeters", width_meters)
        and close("depthMeters", depth_meters)
        and (
            not require_viewport_bounds
            or surface.get("viewportBounded") is True
        )
    )


def unmet_view_requirements(
    last: dict[str, Any],
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool,
) -> list[str]:
    layout = last.get("layoutOcclusion") or {}
    pitch = float(last.get("pitch") or 0)
    map_pointer_hit = (
        layout.get("mapPointerHit")
        if require_visual_layout
        else last.get("mapPointerHit")
    )
    layout_checks = {
        "layout.viewport": layout.get("viewport") == {
            "width": 1100,
            "height": 962,
        },
        "layout.sourceFilesVisible": layout.get("sourceFilesVisible") is True,
        "layout.workspacePaneVisible": layout.get("workspacePaneVisible") is True,
        "layout.floatingPanelVisible": layout.get("floatingPanelVisible") is True,
        "layout.floatingPanelView": layout.get("floatingPanelView")
        == "flightSim",
        "layout.aircraftOutlineContractExact": layout.get(
            "aircraftOutlineContractExact",
        )
        is True,
        "layout.routeUnoccluded": layout.get("routeUnoccluded") is True,
        "layout.aircraftUnoccluded": layout.get("aircraftUnoccluded") is True,
        "layout.environmentUnoccludedKinds": {
            "poi",
            "stage-footprint",
            "subject",
        }.issubset(set(layout.get("environmentUnoccludedKinds") or [])),
        "layout.environmentExtrusionVisible": layout.get(
            "environmentExtrusionVisible",
        )
        is True,
        "layout.environmentExtrusionContractExact": layout.get(
            "environmentExtrusionContractExact",
        )
        is True,
        "layout.cameraPadding": bool(layout.get("cameraPadding")),
        "layout.geographyBoundaryStatus": layout.get(
            "geographyBoundaryStatus",
        )
        == "not-rendered",
    }
    checks = {
        "flightActive": last.get("flightActive") is True,
        "hudVisible": last.get("hudVisible") is True,
        "geospatialEnabled": last.get("geospatialEnabled") is True,
        "geospatialPreferenceEnabled": (
            last.get("geospatialPreferenceEnabled") is True
        ),
        "viewMode": last.get("viewMode") == expected_view,
        "styleUrl": last.get("styleUrl") == expected_style_url,
        "styleFingerprint": expected_provider_host
        in str(last.get("styleFingerprint") or ""),
        "projection": last.get("projection") == expected_projection,
        "mapLibreCanvasCount": last.get("mapLibreCanvasCount", 0) == 1,
        "visibleMapLibreCanvasCount": last.get("visibleMapLibreCanvasCount", 0)
        == 1,
        "geoXrSurfaceCount": last.get("geoXrSurfaceCount") == 1,
        "threeCanvasOwnerCount": last.get("threeCanvasOwnerCount", 0) == 1,
        "threeCanvasActiveCount": last.get("threeCanvasActiveCount") == 1,
        "threeCanvasInactiveCount": last.get("threeCanvasInactiveCount") == 0,
        "rendererPointerTransparent": last.get("rendererPointerTransparent")
        is True,
        "rendererSurfaceVisible": last.get("rendererSurfaceVisible") is True,
        "flightLayersReady": last.get("flightLayersReady") is True,
        "flightLayersTopmost": last.get("flightLayersTopmost") is True,
        "aircraftLayerType": last.get("aircraftLayerType") == "symbol",
        "aircraftGeometryType": last.get("aircraftGeometryType") == "Polygon",
        "aircraftImagesReady": last.get("aircraftImagesReady") is True,
        "aircraftImagePixelWidth": (last.get("aircraftImagePixelWidth") or 0)
        >= 40,
        "environmentId": last.get("environmentId") == "singapore",
        "environmentPresentationBounds": last.get("environmentPresentationBounds")
        == [[103.605, 1.158], [104.09, 1.48]],
        "environmentLayersReady": last.get("environmentLayersReady") is True,
        "environmentSourceFeatures": (last.get("environmentSourceFeatures") or 0)
        >= 10,
        "environment.stageFootprintAuthoredMeters": _has_authored_environment_surface(
            last,
            surface_id="singapore:footprint",
            base_height_meters=0,
            height_meters=0.08,
            width_meters=32,
            depth_meters=24,
            require_viewport_bounds=True,
        ),
        "environment.majorPoiGeographicMeters": _has_authored_environment_surface(
            last,
            surface_id="marina-bay-sands:tower-2",
            base_height_meters=0,
            height_meters=193,
            width_meters=71.82,
            depth_meters=76.45,
        ),
        "environment.majorPoiIds": last.get("environmentPoiIds")
        == ["gardens-by-the-bay", "marina-bay-sands", "singapore-flyer"],
        "environment.renderedMajorPoiIds": last.get("renderedEnvironmentPoiIds")
        == ["gardens-by-the-bay", "marina-bay-sands", "singapore-flyer"],
        "environment.selectedSubjectsDirectMeters": last.get(
            "selectedEnvironmentSubjectsExact"
        )
        is True,
        "environment.sourcePassThrough": last.get(
            "environmentSourceExactlyMatchesOverlay"
        )
        is True,
        "renderedEnvironmentKinds": {
            "poi",
            "stage-footprint",
            "subject",
        }.issubset(set(last.get("renderedEnvironmentKinds") or [])),
        "renderedEnvironmentSubjectIds": any(
            "vehicle-" in str(subject_id)
            for subject_id in last.get("renderedEnvironmentSubjectIds") or []
        ),
        "flightSourceFeatures": (last.get("flightSourceFeatures") or 0) >= 7,
        "objectiveGuideFeatureCount": last.get("objectiveGuideFeatureCount") == 1,
        "renderedKinds": set(last.get("renderedKinds") or [])
        == {"aircraft", "objective-guide", "route", "route-point"},
        "routeInViewport": last.get("routeInViewport") is True,
        "routeScreenSpan": max(
            float((last.get("routeScreenSpan") or {}).get("x") or 0),
            float((last.get("routeScreenSpan") or {}).get("y") or 0),
        )
        >= 80,
        "aircraftInViewport": last.get("aircraftInViewport") is True,
        "pitch": pitch >= 22 if expected_view.startswith("3d") else abs(pitch) < 0.01,
        "mapPointerHit": bool(map_pointer_hit),
    }
    if require_visual_layout:
        checks.update(layout_checks)
    return [name for name, passed in checks.items() if not passed]


def wait_for_view(
    page: Page,
    *,
    read_view: Callable[[Page], dict[str, Any]],
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool = False,
) -> dict[str, Any]:
    deadline = time.monotonic() + 30
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = read_view(page)
        unmet = unmet_view_requirements(
            last,
            expected_provider_host=expected_provider_host,
            expected_view=expected_view,
            expected_projection=expected_projection,
            expected_style_url=expected_style_url,
            require_visual_layout=require_visual_layout,
        )
        if not unmet:
            return last
        page.wait_for_timeout(100)
    unmet = unmet_view_requirements(
        last,
        expected_provider_host=expected_provider_host,
        expected_view=expected_view,
        expected_projection=expected_projection,
        expected_style_url=expected_style_url,
        require_visual_layout=require_visual_layout,
    )
    raise AssertionError(
        "timed out waiting for native MapLibre Geo+XR view "
        f"{expected_view}/{expected_projection}/{expected_style_url}; "
        f"unmet={unmet}: {last}"
    )
