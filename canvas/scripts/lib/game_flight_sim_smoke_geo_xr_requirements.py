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


def _has_viewport_scoped_regional_poi_rendering(last: dict[str, Any]) -> bool:
    source_ids = last.get("environmentPoiIds") or []
    rendered_ids = last.get("renderedEnvironmentPoiIds") or []
    if not isinstance(source_ids, list) or not isinstance(rendered_ids, list):
        return False
    if not all(
        isinstance(identity, str) and bool(identity)
        for identity in [*source_ids, *rendered_ids]
    ):
        return False
    source_set = set(source_ids)
    rendered_set = set(rendered_ids)
    return (
        len(source_set) == len(source_ids)
        and len(rendered_set) == len(rendered_ids)
        and bool(source_set)
        and rendered_set.issubset(source_set)
    )


def _identities(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) and bool(item.strip()) for item in value) and len(set(value)) == len(value)


def authored_environment_checks(last: dict[str, Any]) -> dict[str, bool]:
    stage = last.get("authoredEnvironmentStage") or {}
    stage_id, size = stage.get("id"), stage.get("sizeMeters")
    valid_size = isinstance(size, list) and len(size) == 2 and all(
        type(value) in (int, float) and math.isfinite(value) and value > 0 for value in size
    )
    authored = last.get("authoredEnvironmentSubjects") or []
    authored_ids = [subject.get("id") for subject in authored if isinstance(subject, dict)]
    source_ids, rendered_ids = last.get("environmentSubjectIds"), last.get("renderedEnvironmentSubjectIds")
    expected_pois, source_pois, rendered_pois = stage.get("poiIds"), last.get("environmentPoiIds"), last.get("renderedEnvironmentPoiIds")
    bounds = last.get("environmentPresentationBounds")
    valid_bounds = isinstance(bounds, list) and len(bounds) == 2 and all(
        isinstance(point, list) and len(point) == 2 and all(type(value) in (int, float) and math.isfinite(value) for value in point)
        and abs(point[0]) <= 180 and abs(point[1]) < 90 for point in bounds
    )
    return {
        "environmentId": isinstance(stage_id, str) and bool(stage_id) and stage_id == stage.get("resolvedId") == last.get("environmentId"),
        "environmentPresentationBounds": valid_bounds and bounds[0][0] < bounds[1][0] and bounds[0][1] < bounds[1][1],
        "environmentSourceFeatures": type(stage.get("surfaceCount")) is int and stage["surfaceCount"] > 0 and last.get("environmentSourceFeatures") == stage["surfaceCount"],
        "environment.stageFootprintAuthoredMeters": bool(valid_size and _has_authored_environment_surface(
            last, surface_id=f"{stage_id}:footprint", base_height_meters=0, height_meters=0.08,
            width_meters=size[0], depth_meters=size[1], require_viewport_bounds=True,
        )),
        "environment.authoredSubjectIds": _identities(authored_ids) and len(authored_ids) == len(authored)
        and _identities(source_ids) and set(source_ids) == set(authored_ids),
        "renderedEnvironmentSubjectIds": _identities(rendered_ids) and _identities(authored_ids)
        and (bool(rendered_ids) if authored_ids else not rendered_ids) and set(rendered_ids).issubset(authored_ids),
        "environment.authoredPoiIds": _identities(expected_pois) and _identities(source_pois) and source_pois == sorted(expected_pois),
        "environment.renderedAuthoredPoiSubset": _identities(rendered_pois) and _identities(expected_pois) and set(rendered_pois).issubset(expected_pois),
    }


def regional_environment_checks(last: dict[str, Any]) -> dict[str, bool]:
    return {
        "environment.regionalId": last.get("environmentId") == "singapore",
        "environment.regionalPresentationBounds": last.get("environmentPresentationBounds") == [[103.605, 1.158], [104.09, 1.48]],
        "environment.regionalSourceFeatures": (last.get("environmentSourceFeatures") or 0) >= 10,
        "environment.regionalStageFootprintAuthoredMeters": _has_authored_environment_surface(
            last, surface_id="singapore:footprint", base_height_meters=0, height_meters=0.08,
            width_meters=32, depth_meters=24, require_viewport_bounds=True,
        ),
        "environment.majorPoiGeographicMeters": _has_authored_environment_surface(
            last, surface_id="marina-bay-sands:tower-2", base_height_meters=0, height_meters=193,
            width_meters=71.82, depth_meters=76.45,
        ),
        "environment.majorPoiIds": _identities(last.get("environmentPoiIds")) and bool(last.get("environmentPoiIds"))
        and last["environmentPoiIds"] == sorted(last["environmentPoiIds"]),
        "environment.renderedMajorPoiSubset": _has_viewport_scoped_regional_poi_rendering(last),
    }


def unmet_view_requirements(
    last: dict[str, Any],
    *,
    expected_provider_host: str,
    expected_view: str,
    expected_projection: str,
    expected_style_url: str,
    require_visual_layout: bool,
    require_regional_scene: bool = False,
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
            "stage-footprint",
        }.union({"subject"} if last.get("authoredEnvironmentSubjects") else set()).issubset(set(layout.get("environmentUnoccludedKinds") or [])),
        "layout.environmentExtrusionContractExact": layout.get(
            "environmentExtrusionContractExact",
        )
        is True,
        "layout.cameraPadding": bool(layout.get("cameraPadding")),
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
        "aircraftGeometryType": last.get("aircraftGeometryType") == "Point",
        "aircraftImagesReady": last.get("aircraftImagesReady") is True,
        "aircraftImagePixelWidth": (last.get("aircraftImagePixelWidth") or 0)
        >= 40,
        **authored_environment_checks(last),
        "environmentLayersReady": last.get("environmentLayersReady") is True,
        "environment.selectedSubjectsDirectMeters": last.get("selectedEnvironmentSubjectsExact") is True,
        "environment.sourcePassThrough": last.get("environmentSourceExactlyMatchesOverlay") is True,
        "renderedEnvironmentKinds": (
            {"stage-footprint"}
            | ({"subject"} if last.get("authoredEnvironmentSubjects") else set())
            | ({"poi"} if last.get("renderedEnvironmentPoiIds") else set())
        ).issubset(set(last.get("renderedEnvironmentKinds") or [])),
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
    if require_regional_scene:
        checks.update(regional_environment_checks(last))
        if require_visual_layout:
            checks["layout.geographyBoundaryStatus"] = layout.get("geographyBoundaryStatus") == "not-rendered"
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
    require_regional_scene: bool = False,
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
            require_regional_scene=require_regional_scene,
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
        require_regional_scene=require_regional_scene,
    )
    raise AssertionError(
        "timed out waiting for native MapLibre Geo+XR view "
        f"{expected_view}/{expected_projection}/{expected_style_url}; "
        f"unmet={unmet}: {last}"
    )
