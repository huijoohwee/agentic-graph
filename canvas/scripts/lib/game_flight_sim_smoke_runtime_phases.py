from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Page, expect

from lib.game_flight_sim_smoke_camera import verify_flight_camera_runtime
from lib.game_flight_sim_smoke_deadlines import verify_flight_deadline_contracts
from lib.game_flight_sim_smoke_geo_xr import verify_geo_xr_four_view_presentation
from lib.game_flight_sim_smoke_ledger import BrowserVerificationLedger
from lib.game_flight_sim_smoke_lifecycle import (
    verify_blur_lifecycle,
    verify_initial_ready_hold,
    verify_stop_start_lifecycle,
    verify_surface_failure_paths,
)
from lib.game_flight_sim_smoke_mobile import (
    verify_mobile_flight_hud,
    verify_mobile_touch_interaction,
)
from lib.game_flight_sim_smoke_motion_control import (
    verify_motion_control_panel_handoff,
)
from lib.game_flight_sim_smoke_navigation import (
    verify_flight_navigation_runtime,
)
from lib.game_flight_sim_smoke_mission import complete_authored_flight_mission
from lib.game_flight_sim_smoke_scene import (
    FLIGHT_OPTIONAL_BEACON_PATH,
    FLIGHT_OPTIONAL_BEACON_SHA256,
    assert_active_flight_scene,
    read_flight_scene,
)
from lib.game_flight_sim_smoke_source import (
    apply_and_verify_exact_authored_source,
    prepare_authored_physics_surface,
)
from lib.game_flight_sim_smoke_source_selection import (
    prepare_source_files_selection_surface,
)
from lib.game_flight_sim_smoke_throttle import (
    FLIGHT_THROTTLE_PROOF_TARGET,
    assert_staged_throttle_response,
    is_committed_throttle_target,
)
from lib.game_flight_sim_smoke_bootstrap import prepare_stable_candidate_page
from lib.game_flight_sim_smoke_web_mcp import (
    control_flight_via_web_mcp,
    verify_flight_exit,
    verify_flight_web_mcp,
)


def poll(
    page: Page,
    read: Callable[[], Any],
    accepted: Callable[[Any], bool],
    *,
    label: str,
    timeout_ms: int = 30_000,
) -> Any:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: Any = None
    while time.monotonic() < deadline:
        last_value = read()
        if accepted(last_value):
            return last_value
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last_value}")


def read_runtime(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          return runtime.readFlightSimSnapshot()
        }
        """
    )


def position_distance(left: list[float], right: list[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right)) ** 0.5


def aircraft_airspeed(snapshot: dict[str, Any]) -> float:
    velocity = snapshot["aircraft"]["velocity"]
    return sum(float(component) ** 2 for component in velocity) ** 0.5


def run_flight_runtime_verifications(
    page: Page,
    *,
    expected_branch: str,
    expected_head: str,
    expected_source_sha256: str,
    first_frame_limit_ms: int,
    ledger: BrowserVerificationLedger,
    reset_observed_errors: Callable[[], None],
    screenshot_path: Path,
    target_url: str,
    web_mcp_calls: list[dict[str, Any]],
    websocket_probe_url: str,
    websocket_probe_events: list[str],
    websocket_probe_route_hits: list[str],
) -> dict[str, Any]:
    state: dict[str, Any] = {}

    def source_apply() -> dict[str, Any]:
        prepare_stable_candidate_page(page, target_url)
        prepare_source_files_selection_surface(page)
        physics_baseline = prepare_authored_physics_surface(page)
        # Flight/Geo transport evidence begins from the stable, visible
        # Physics XR baseline after optional Editor Workspace bootstrap settles.
        reset_observed_errors()
        source_application, source = apply_and_verify_exact_authored_source(page)
        hud = page.locator('[data-kg-flight-sim-hud="1"]').first
        expect(hud).to_be_visible(timeout=120_000)
        page.wait_for_selector(
            'canvas[data-kg-flight-sim-first-frame="1"]',
            timeout=120_000,
        )
        runtime_identity = page.evaluate(
            """
            async () => {
              const identity = await window.__kgFlightSimBrowserProof.importModule('knowgrphRuntimeIdentity')
              return identity.getKnowgrphRuntimeIdentity()
            }
            """
        )
        if (
            runtime_identity.get("knowgrphRevision") != expected_head
            or runtime_identity.get("branch") != expected_branch
        ):
            raise AssertionError(
                "browser runtime identity does not match candidate checkout: "
                f"expected={expected_branch}@{expected_head}, "
                f"actual={runtime_identity}"
            )
        if (
            source.get("sha256") != expected_source_sha256
            or source.get("authoredSeedSha256") != expected_source_sha256
            or source.get("workspaceSourceSha256") != expected_source_sha256
        ):
            raise AssertionError(
                "disk, bundled, and WorkspaceFs source identities diverged: "
                f"{source}"
            )
        return {
            "hud": hud,
            "physicsBaseline": physics_baseline,
            "runtimeIdentity": runtime_identity,
            "source": source,
            "sourceApplication": source_application,
        }

    def playable_frame() -> dict[str, Any]:
        proof = page.evaluate(
            """
            () => {
              const proof = window.__kgFlightSimFirstFrameProof
              if (!proof) return null
              const end = Number(proof.firstFrameAtMs)
              const start = Number(proof.startedAtMs)
              return {
                className: String(proof.firstFrameClassName || ''),
                startMs: start,
                endMs: end,
                durationMs: end - start,
                preExisting: Boolean(proof.preExisting),
                surface: String(proof.firstFrameSurface || ''),
              }
            }
            """
        )
        if (
            not isinstance(proof, dict)
            or proof.get("durationMs") is None
            or proof["durationMs"] < 0
            or proof["durationMs"] != proof["durationMs"]
            or proof["durationMs"] > first_frame_limit_ms
            or proof.get("preExisting") is True
            or proof.get("surface") != "maplibre"
            or "maplibregl-canvas" not in str(proof.get("className") or "")
        ):
            raise AssertionError(
                "Flight first playable frame was not newly produced within "
                f"the source-apply deadline: {proof}"
            )
        initial, ready_held = verify_initial_ready_hold(page)
        initial_airspeed = aircraft_airspeed(initial)
        if initial["aircraft"]["position"][1] <= 0 or initial_airspeed <= 0:
            raise AssertionError(
                "Flight first playable frame is not airborne-capable: "
                f"{initial['aircraft']}"
            )
        return {
            "firstFrame": proof,
            "initial": initial,
            "initialAirspeed": initial_airspeed,
            "readyHeld": ready_held,
        }

    def authored_scene() -> dict[str, Any]:
        scene = poll(
            page,
            lambda: read_flight_scene(page),
            lambda value: (
                value.get("visualProjection") == "maplibre"
                and (value.get("mapOverlay") or {}).get("layersReady") is True
                and (value.get("optionalBeacon") or {}).get("assetPath")
                == FLIGHT_OPTIONAL_BEACON_PATH
                and (value.get("optionalBeacon") or {}).get("assetSha256")
                == FLIGHT_OPTIONAL_BEACON_SHA256
                and (value.get("optionalBeacon") or {}).get("opaque") is True
                and int(
                    (value.get("optionalBeacon") or {}).get(
                        "meshDescendantCount"
                    )
                    or 0
                )
                >= 1
            ),
            label="MapLibre Flight projection and transparent runtime Canvas",
            timeout_ms=120_000,
        )
        assert_active_flight_scene(scene)
        return scene

    state["source"] = ledger.verify("Source Files apply", source_apply)
    state["deadlines"] = ledger.verify(
        "runtime deadline contracts",
        lambda: verify_flight_deadline_contracts(
            page,
            websocket_probe_url=websocket_probe_url,
            websocket_probe_events=websocket_probe_events,
            websocket_probe_route_hits=websocket_probe_route_hits,
        ),
        depends_on=("Source Files apply",),
    )
    state["playable"] = ledger.verify(
        "first playable frame",
        playable_frame,
        depends_on=("runtime deadline contracts",),
    )
    state["activeScene"] = ledger.verify(
        "transparent Flight runtime Canvas",
        authored_scene,
        depends_on=("first playable frame",),
    )
    state["geoXrPresentation"] = ledger.verify(
        "Geo+XR four-view presentation",
        lambda: verify_geo_xr_four_view_presentation(page),
        depends_on=("transparent Flight runtime Canvas",),
    )
    state["webMcp"] = ledger.verify(
        "strict browser WebMCP",
        lambda: verify_flight_web_mcp(
            page,
            state["playable"]["initial"],
        ),
        depends_on=("Geo+XR four-view presentation",),
    )
    if state["webMcp"]:
        web_mcp_calls.extend(state["webMcp"]["calls"])
    state["stopStart"] = ledger.verify(
        "stop and Start lifecycle",
        lambda: verify_stop_start_lifecycle(page, web_mcp_calls),
        depends_on=("strict browser WebMCP",),
    )
    state["motionControl"] = ledger.verify(
        "Motion Control panel handoff",
        lambda: verify_motion_control_panel_handoff(page),
        depends_on=("stop and Start lifecycle",),
    )

    def desktop_input() -> dict[str, Any]:
        initial = state["playable"]["initial"]
        hud = state["source"]["hud"]
        page.keyboard.down("KeyW")
        page.keyboard.down("KeyD")
        try:
            moved = poll(
                page,
                lambda: read_runtime(page),
                lambda value: value.get("phase") == "flying"
                and value.get("tick", 0) > initial["tick"]
                and abs(value["aircraft"]["pitch"]) > 0.001
                and abs(value["aircraft"]["roll"]) > 0.001
                and position_distance(
                    value["aircraft"]["position"],
                    initial["aircraft"]["position"],
                ) > 0.01,
                label="desktop Flight input",
            )
        finally:
            page.keyboard.up("KeyD")
            page.keyboard.up("KeyW")
        hud_pitch = float(
            hud.get_attribute("data-kg-flight-sim-pitch") or "nan"
        )
        hud_roll = float(
            hud.get_attribute("data-kg-flight-sim-roll") or "nan"
        )
        telemetry = read_runtime(page)
        if (
            not all(value == value for value in (hud_pitch, hud_roll))
            or abs(hud_pitch - telemetry["aircraft"]["pitch"]) > 0.01
            or abs(hud_roll - telemetry["aircraft"]["roll"]) > 0.01
        ):
            raise AssertionError(
                "Flight HUD pitch/roll telemetry did not track the aircraft: "
                f"hud={[hud_pitch, hud_roll]}, "
                f"runtime={[telemetry['aircraft']['pitch'], telemetry['aircraft']['roll']]}"
            )
        return {"moved": moved, "hudPitch": hud_pitch, "hudRoll": hud_roll}

    state["desktop"] = ledger.verify(
        "desktop playable input and HUD telemetry",
        desktop_input,
        depends_on=("Motion Control panel handoff",),
    )
    state["blur"] = ledger.verify(
        "blur lifecycle",
        lambda: verify_blur_lifecycle(page, web_mcp_calls),
        depends_on=("desktop playable input and HUD telemetry",),
    )

    def throttle_restart() -> dict[str, Any]:
        previous_throttle = float(
            read_runtime(page)["aircraft"]["throttle"]
        )
        throttle = control_flight_via_web_mcp(
            page,
            "/flight.sim @canvas #flight operation=throttle "
            f"throttle={FLIGHT_THROTTLE_PROOF_TARGET}",
            web_mcp_calls,
        )
        staged_snapshot = assert_staged_throttle_response(
            throttle,
            previous_throttle,
        )
        committed_throttle = poll(
            page,
            lambda: read_runtime(page),
            lambda value: is_committed_throttle_target(
                value,
                staged_snapshot,
            ),
            label="Flight throttle target on a committed World_Tick",
        )
        restarted_result = control_flight_via_web_mcp(
            page,
            "/flight.sim @canvas #flight operation=restart",
            web_mcp_calls,
        )
        restarted = restarted_result["flight"]["flightSim"]
        if (
            restarted_result.get("ok") is not True
            or restarted["phase"] != "ready"
            or restarted["tick"] != 0
            or restarted["runId"] <= state["desktop"]["moved"]["runId"]
        ):
            raise AssertionError(
                f"Flight restart was not fresh: {restarted_result}"
            )
        page.keyboard.down("KeyW")
        try:
            replayed = poll(
                page,
                lambda: read_runtime(page),
                lambda value: value.get("phase") == "flying"
                and value.get("tick", 0) > 0,
                label="post-restart Flight input",
            )
        finally:
            page.keyboard.up("KeyW")
        return {
            "replayed": replayed,
            "restarted": restarted,
            "throttle": throttle,
            "committedThrottle": committed_throttle,
        }

    state["restart"] = ledger.verify(
        "strict throttle and restart",
        throttle_restart,
        depends_on=("blur lifecycle",),
    )
    state["navigation"] = ledger.verify(
        "Flight camera views and local navigation",
        lambda: verify_flight_navigation_runtime(page),
        depends_on=("strict throttle and restart",),
    )

    def camera_round_trip() -> dict[str, Any]:
        camera = verify_flight_camera_runtime(page)
        advanced = poll(
            page,
            lambda: read_runtime(page),
            lambda value: value.get("active") is True
            and value.get("phase") == "flying"
            and value.get("tick", 0) > camera["returned"]["tickAfterResume"],
            label="Flight ticks after camera-source transition",
        )
        hud = state["source"]["hud"]
        expect(hud).to_have_attribute(
            "data-kg-flight-sim-phase",
            "flying",
            timeout=10_000,
        )
        if float(hud.get_attribute("data-kg-flight-sim-airspeed") or "0") <= 0:
            raise AssertionError("Flight HUD did not publish live airspeed")
        envelope_status = hud.get_attribute("data-kg-flight-sim-envelope") or ""
        if envelope_status not in {
            "instrument-uncertain",
            "stall-risk",
            "pitch-limit",
            "bank-limit",
            "low-energy",
            "high-energy",
            "on-target",
        }:
            raise AssertionError(f"Flight HUD published invalid envelope status: {envelope_status}")
        control_authority = float(
            hud.get_attribute("data-kg-flight-sim-control-authority") or "-1"
        )
        if control_authority < 0.3 or control_authority > 1:
            raise AssertionError(
                f"Flight HUD published invalid control authority: {control_authority}"
            )
        target_speed = hud.get_attribute("data-kg-flight-sim-target-speed") or ""
        if target_speed != "8:22":
            raise AssertionError(f"Flight HUD target-speed projection drifted: {target_speed}")
        return {
            "advanced": advanced,
            "camera": camera,
            "envelope": {
                "status": envelope_status,
                "controlAuthority": control_authority,
                "targetSpeed": target_speed,
            },
        }

    state["camera"] = ledger.verify(
        "Timeline camera round-trip",
        camera_round_trip,
        depends_on=("Flight camera views and local navigation",),
    )
    state["mobileHud"] = ledger.verify(
        "mobile HUD",
        lambda: verify_mobile_flight_hud(page),
        depends_on=("Timeline camera round-trip",),
    )
    state["touch"] = ledger.verify(
        "mobile touch control",
        lambda: verify_mobile_touch_interaction(page),
        depends_on=("mobile HUD",),
    )
    state["mission"] = ledger.verify(
        "ordered mission completion",
        lambda: complete_authored_flight_mission(
            page,
            expected_run_id=state["touch"]["runId"],
        ),
        depends_on=("mobile touch control",),
    )

    def final_scene() -> dict[str, Any]:
        mission = state["mission"]
        scene = poll(
            page,
            lambda: read_flight_scene(page),
            lambda value: (
                (value.get("mapOverlay") or {}).get(
                    "pendingWaypointCount"
                ) == 0
                and (value.get("mapOverlay") or {}).get(
                    "activeLandingCount"
                ) == 1
            ),
            label="post-mission MapLibre Flight projection",
        )
        assert_active_flight_scene(
            scene,
            completed_waypoint_count=mission["waypointIndex"],
            waypoint_count=mission["waypointCount"],
        )
        if (
            scene["visibleSceneSignature"]
            != state["activeScene"]["visibleSceneSignature"]
        ):
            raise AssertionError(
                "suppressed R3F scene contract changed across the Flight lifecycle"
            )
        page.screenshot(path=str(screenshot_path), full_page=False)
        return scene

    state["finalScene"] = ledger.verify(
        "Geo+XR Flight layer after mission",
        final_scene,
        depends_on=(
            "transparent Flight runtime Canvas",
            "ordered mission completion",
        ),
    )
    state["exit"] = ledger.verify(
        "Exit lifecycle and World disposal",
        lambda: verify_flight_exit(
            page,
            web_mcp_calls,
            state["source"]["sourceApplication"]["priorSurface"],
        ),
        depends_on=("Geo+XR Flight layer after mission",),
    )
    state["surfaceFailures"] = ledger.verify(
        "surface failure restoration",
        lambda: verify_surface_failure_paths(page),
        depends_on=("Exit lifecycle and World disposal",),
    )
    return state
