from __future__ import annotations

import json
import time
from typing import Any, Callable

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_web_mcp import control_flight_via_web_mcp


SIMULATION_STATE_KEYS = (
    "runId",
    "aircraft",
    "waypointIndex",
    "waypointCount",
    "currentWaypointId",
    "tick",
    "elapsedSeconds",
    "collisionId",
    "pendingDecisions",
    "lastCostLog",
)


def read_runtime(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          return runtime.readFlightSimSnapshot()
        }
        """
    )


def read_runtime_and_dispatch_blur(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const beforeBlur = runtime.readFlightSimSnapshot()
          window.dispatchEvent(new Event('blur'))
          return beforeBlur
        }
        """
    )


def simulation_projection(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {key: snapshot.get(key) for key in SIMULATION_STATE_KEYS}


def _canonical_projection(snapshot: dict[str, Any]) -> str:
    return json.dumps(
        simulation_projection(snapshot),
        sort_keys=True,
        separators=(",", ":"),
    )


def assert_simulation_unchanged(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    label: str,
) -> None:
    if _canonical_projection(before) != _canonical_projection(after):
        raise AssertionError(
            f"{label} mutated aircraft or mission state: "
            f"before={simulation_projection(before)}, "
            f"after={simulation_projection(after)}"
        )


def _poll(
    page: Page,
    accepted: Callable[[dict[str, Any]], bool],
    *,
    label: str,
    timeout_ms: int = 30_000,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last_value = read_runtime(page)
        if accepted(last_value):
            return last_value
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last_value}")


def verify_initial_ready_hold(
    page: Page,
) -> tuple[dict[str, Any], dict[str, Any]]:
    initial = _poll(
        page,
        lambda value: (
            value.get("active") is True
            and value.get("phase") == "ready"
            and value.get("tick") == 0
            and value.get("runtimeError") is None
        ),
        label="source-backed Flight ready-at-tick-zero activation",
        timeout_ms=120_000,
    )
    page.wait_for_timeout(350)
    held = read_runtime(page)
    if held.get("phase") != "ready" or held.get("tick") != 0:
        raise AssertionError(f"Flight did not hold ready at tick zero: {held}")
    assert_simulation_unchanged(
        initial,
        held,
        label="ready-at-tick-zero hold",
    )
    return initial, held


def verify_blur_lifecycle(
    page: Page,
    calls: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    before_blur = read_runtime_and_dispatch_blur(page)
    stopped = _poll(
        page,
        lambda value: value.get("phase") == "stopped",
        label="window-blur Flight stop",
    )
    assert_simulation_unchanged(
        before_blur,
        stopped,
        label="window-blur stop",
    )
    page.wait_for_timeout(350)
    frozen = read_runtime(page)
    if frozen.get("phase") != "stopped":
        raise AssertionError(f"window blur did not remain stopped: {frozen}")
    assert_simulation_unchanged(
        stopped,
        frozen,
        label="window-blur frozen hold",
    )
    resume_result = control_flight_via_web_mcp(
        page,
        "/flight.sim @canvas #flight operation=start",
        calls,
    )
    resumed = resume_result["flight"]["flightSim"]
    if resume_result.get("ok") is not True or resumed.get("phase") != "flying":
        raise AssertionError(f"Flight did not resume after blur: {resume_result}")
    assert_simulation_unchanged(
        stopped,
        resumed,
        label="window-blur resume",
    )
    page.keyboard.down("KeyD")
    try:
        fresh_input = _poll(
            page,
            lambda value: (
                value.get("tick", 0) > resumed.get("tick", 0)
                and abs(
                    value["aircraft"]["roll"]
                    - resumed["aircraft"]["roll"]
                ) > 0.001
            ),
            label="fresh post-blur Flight input",
        )
    finally:
        page.keyboard.up("KeyD")
    return {
        "before": before_blur,
        "stopped": stopped,
        "frozen": frozen,
        "resumed": resumed,
        "freshInput": fresh_input,
    }


def verify_stop_start_lifecycle(
    page: Page,
    calls: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    before_stop = read_runtime(page)
    stop_result = control_flight_via_web_mcp(
        page,
        "/flight.sim @canvas #flight operation=stop",
        calls,
    )
    stopped = stop_result["flight"]["flightSim"]
    if stop_result.get("ok") is not True or stopped.get("phase") != "stopped":
        raise AssertionError(f"Flight stop failed: {stop_result}")
    assert_simulation_unchanged(
        before_stop,
        stopped,
        label="explicit Flight stop",
    )
    page.wait_for_timeout(350)
    frozen = read_runtime(page)
    if frozen.get("phase") != "stopped":
        raise AssertionError(f"Flight stop did not remain stopped: {frozen}")
    assert_simulation_unchanged(
        stopped,
        frozen,
        label="explicit Flight stopped hold",
    )
    start_result = control_flight_via_web_mcp(
        page,
        "/flight.sim @canvas #flight operation=start",
        calls,
    )
    resumed = start_result["flight"]["flightSim"]
    if (
        start_result.get("ok") is not True
        or resumed.get("phase") != before_stop.get("phase")
    ):
        raise AssertionError(f"Flight start failed: {start_result}")
    assert_simulation_unchanged(
        stopped,
        resumed,
        label="explicit Flight stop-to-start",
    )
    return {
        "before": before_stop,
        "stopped": stopped,
        "frozen": frozen,
        "resumed": resumed,
    }


def verify_surface_failure_paths(page: Page) -> dict[str, Any]:
    proof = page.evaluate(
        """
        async () => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const status = await window.__kgFlightSimBrowserProof.importModule('flightSimSurfaceOwnershipStatus')
          const physics = await window.__kgFlightSimBrowserProof.importModule('xrPhysicsRuntime')
          const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
          const emptyWorkspace = { readFileText: async () => null }
          const capture = () => {
            const state = store.useGraphStore.getState()
            const physicsState = physics.readXrPhysicsRuntime()
            const canvases = Array.from(document.querySelectorAll('canvas'))
            const rendererCanvases = canvases.filter(
              canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
            )
            const auxiliaryCanvases = canvases.filter(
              canvas => !rendererCanvases.includes(canvas),
            )
            return {
              canvas: {
                canvasRenderMode: state.canvasRenderMode,
                canvas3dMode: state.canvas3dMode,
                canvasRenderModeLastFree: state.canvasRenderModeLastFree,
                canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
                floatingPanelOpen: state.floatingPanelOpen,
                floatingPanelView: state.floatingPanelView,
              },
              graph: JSON.stringify(state.graphData),
              timeline: {
                documentKey: state.timelineTransportDocumentKey,
                position: state.timelineTransportPosition,
                playing: state.timelineTransportPlaying,
                playbackRate: state.timelineTransportPlaybackRate,
              },
              physics: {
                phase: physicsState.phase,
                world: JSON.stringify(physicsState.world),
                frame: JSON.stringify(physics.readXrPhysicsRuntimeFrame()),
              },
              controller: camera.readXrNativeControllerCamera().mode,
              canvasCount: canvases.length,
              rendererCanvasCount: rendererCanvases.length,
              auxiliaryCanvasCount: auxiliaryCanvases.length,
              auxiliaryCanvasesLocalOnly: auxiliaryCanvases.every(
                canvas => Boolean(canvas.closest(
                  '[data-kg-motion-control-preview="local-only"], .monaco-editor',
                )),
              ),
              canvasStable: rendererCanvases.length === 1
                && rendererCanvases[0] === window.__kgFlightSimCanvas,
            }
          }
          physics.pauseXrPhysicsRuntime()
          store.useGraphStore.getState().setTimelineTransportState({
            playing: false,
          })
          const entryBefore = capture()
          const entrySnapshot = await runtime.openFlightSimSurface({
            openPanel: true,
            webglSupported: false,
            workspace: emptyWorkspace,
          })
          const entryFailure = status.readFlightSimSurfaceOwnershipStatus().failure
          const entryAfter = capture()

          const restorationBefore = capture()
          const entered = await runtime.openFlightSimSurface({
            openPanel: true,
            webglSupported: true,
            workspace: emptyWorkspace,
          })
          const originalSetCanvas3dMode =
            store.useGraphStore.getState().setCanvas3dMode
          store.useGraphStore.setState({
            setCanvas3dMode: () => {
              throw new Error('browser restoration injection')
            },
          })
          let restorationSnapshot
          try {
            restorationSnapshot = runtime.exitFlightSimSurface()
          } finally {
            store.useGraphStore.setState({
              setCanvas3dMode: originalSetCanvas3dMode,
            })
          }
          return {
            entry: {
              before: entryBefore,
              after: entryAfter,
              snapshot: entrySnapshot,
              failure: entryFailure,
            },
            restoration: {
              before: restorationBefore,
              after: capture(),
              entered,
              snapshot: restorationSnapshot,
              failure: status.readFlightSimSurfaceOwnershipStatus().failure,
            },
          }
        }
        """
    )
    entry = proof["entry"]
    if (
        entry["snapshot"].get("active") is not False
        or "entry did not complete" not in (
            entry["snapshot"].get("runtimeError") or ""
        ).lower()
        or (entry.get("failure") or {}).get("code")
        != "FLIGHT_SIM_SURFACE_ENTRY_FAILED"
        or entry["before"] != entry["after"]
    ):
        raise AssertionError(f"WebGL-unavailable entry was not atomic: {entry}")
    restoration = proof["restoration"]
    before = restoration["before"]
    after = restoration["after"]
    retained_keys = ("graph", "timeline", "physics", "controller")
    if (
        restoration["entered"].get("active") is not True
        or restoration["snapshot"].get("active") is not False
        or "restoration did not complete" not in (
            restoration["snapshot"].get("runtimeError") or ""
        ).lower()
        or (restoration.get("failure") or {}).get("code")
        != "FLIGHT_SIM_SURFACE_RESTORATION_FAILED"
        or any(before.get(key) != after.get(key) for key in retained_keys)
        or after.get("canvasStable") is not True
    ):
        raise AssertionError(
            f"injected restoration failure escaped its local boundary: {restoration}"
        )
    return proof
