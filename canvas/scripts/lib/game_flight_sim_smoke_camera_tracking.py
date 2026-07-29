from __future__ import annotations

import time
from typing import Any, Callable

from playwright.sync_api import Page


def read_camera_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const source = await window.__kgFlightSimBrowserProof.importModule('cameraSourceMcpRuntime')
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const motion = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const geo = await window.__kgFlightSimBrowserProof.importModule('gympgrphStore')
          const graphState = store.useGraphStore.getState()
          const motionRuntime = motion.readXrMotionReferenceRuntime()
          const canvas = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"] canvas',
          )
          const map = geo.readActiveMapLibreMap()
          const center = map?.getCenter?.()
          return {
            source: source.inspectLocalCameraSource(),
            flight: flight.readFlightSimSnapshot(),
            overlay: geo.readFlightGeoOverlay(),
            viewMode: geo.useGympgrphStore.getState().geospatialViewMode,
            timeline: {
              cameraMarks: motionRuntime.plan.camera.length,
              dirty: motionRuntime.dirty,
              documentKey: graphState.timelineTransportDocumentKey,
              playheadSeconds: motionRuntime.playheadSeconds,
              playing: graphState.timelineTransportPlaying,
              position: graphState.timelineTransportPosition,
              sceneKey: motionRuntime.sceneKey,
            },
            canvasMode: {
              renderMode: graphState.canvasRenderMode,
              threeMode: graphState.canvas3dMode,
            },
            mapCamera: map && center
              ? {
                  bearing: map.getBearing(),
                  center: { lng: center.lng, lat: center.lat },
                  pitch: map.getPitch(),
                  projection: map.getProjection()?.type || '',
                  zoom: map.getZoom(),
                }
              : null,
            pose: graphState.captureThreeCameraPose(),
            pointerLocked: document.pointerLockElement === canvas,
            pointerState: canvas?.dataset.kgFlightSimPointerLock || '',
            pointerLockError:
              canvas?.dataset.kgFlightSimPointerLockError || '',
            pointerLockContract: window.__kgFlightSimPointerLockHarness
              ? {
                  mode: window.__kgFlightSimPointerLockHarness.mode,
                  nativeError:
                    window.__kgFlightSimPointerLockHarness.nativeError,
                }
              : { mode: 'native', nativeError: null },
            panelView: graphState.floatingPanelView,
          }
        }
        """
    )


def poll(
    page: Page,
    read: Callable[[], dict[str, Any]],
    accepted: Callable[[dict[str, Any]], bool],
    *,
    label: str,
    timeout_ms: int = 15_000,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last_value = read()
        if accepted(last_value):
            return last_value
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last_value}")


def select_camera_via_catalog(
    page: Page,
    camera_id: str,
) -> dict[str, Any]:
    started = time.monotonic()
    result = page.evaluate(
        """
        async cameraId => {
          const camera = await window.__kgFlightSimBrowserProof.importModule('cameraMcpRuntime')
          return camera.controlLocalCamera({
            invocation:
              `/camera.select @camera #camera camera=${cameraId}`,
          })
        }
        """,
        camera_id,
    )
    state = poll(
        page,
        lambda: read_camera_state(page),
        lambda value: (
            value.get("mapCamera") is not None
            and value["source"]["selected"] == camera_id
            and value["source"]["effectiveOwner"] == camera_id
            and (
                camera_id != "fixed-follow"
                or fixed_map_camera_matches_overlay(value)
            )
        ),
        label=f"{camera_id} Camera catalog selection",
        timeout_ms=1_000,
    )
    observed_ms = (time.monotonic() - started) * 1_000
    result_source = (result.get("camera") or {}).get("source") or {}
    if (
        result.get("ok") is not True
        or result.get("action") != "select"
        or result.get("elapsedMs", -1) < 0
        or result.get("elapsedMs", 1_001) > 1_000
        or result.get("deadlineMs") != 1_000
        or result_source.get("selected") != camera_id
        or result_source.get("effectiveOwner") != camera_id
        or observed_ms > 1_000
    ):
        raise AssertionError(
            f"Camera catalog selection failed for {camera_id}: "
            f"result={result} state={state} observedMs={observed_ms}"
        )
    return {
        "cameraId": camera_id,
        "invocation":
            f"/camera.select @camera #camera camera={camera_id}",
        "observedMs": observed_ms,
        "result": result,
        "state": state,
    }


def vector_distance(
    left: dict[str, float],
    right: dict[str, float],
) -> float:
    return sum(
        (float(left[axis]) - float(right[axis])) ** 2
        for axis in ("x", "y", "z")
    ) ** 0.5


def pose_changed(
    left: dict[str, Any] | None,
    right: dict[str, Any] | None,
    *,
    minimum_distance: float = 1,
) -> bool:
    if not left or not right:
        return False
    return (
        vector_distance(left["position"], right["position"]) > minimum_distance
        and vector_distance(left["target"], right["target"]) > minimum_distance
    )


def map_coordinate_distance(
    left: dict[str, float],
    right: dict[str, float],
) -> float:
    return (
        (float(left["lng"]) - float(right["lng"])) ** 2
        + (float(left["lat"]) - float(right["lat"])) ** 2
    ) ** 0.5


def map_camera_changed(
    left: dict[str, Any] | None,
    right: dict[str, Any] | None,
    *,
    minimum_coordinate_distance: float = 1e-8,
) -> bool:
    if not left or not right:
        return False
    return (
        map_coordinate_distance(left["center"], right["center"])
        > minimum_coordinate_distance
        or abs(float(left["bearing"]) - float(right["bearing"])) > 0.01
        or abs(float(left["pitch"]) - float(right["pitch"])) > 0.01
        or abs(float(left["zoom"]) - float(right["zoom"])) > 0.01
    )


def _degrees_apart(left: float, right: float) -> float:
    return abs((float(left) - float(right) + 180) % 360 - 180)


def fixed_map_camera_matches_overlay(value: dict[str, Any]) -> bool:
    camera = value.get("mapCamera")
    overlay = value.get("overlay") or {}
    overlay_camera = overlay.get("camera") or {}
    if not camera or not overlay.get("active"):
        return False
    if overlay_camera.get("effectiveOwner") != "fixed-follow":
        return False
    presets = {
        "chase": {"pitch": 48, "zoom": 15.5},
        "cockpit": {"pitch": 68, "zoom": 17},
        "survey": {"pitch": 22, "zoom": 14.25},
    }
    view = overlay_camera.get("view")
    preset = presets.get(view)
    center = overlay_camera.get("centerCoordinate")
    aircraft = overlay.get("aircraft") or {}
    if not preset or not isinstance(center, list) or len(center) != 2:
        return False
    mode_3d = value.get("viewMode") in {"3d", "3d-modern"}
    expected_bearing = (
        float(aircraft.get("headingDegrees", 0))
        if mode_3d and view != "survey" else 0
    )
    expected_pitch = preset["pitch"] if mode_3d else 0
    return (
        map_coordinate_distance(
            camera["center"],
            {"lng": center[0], "lat": center[1]},
        ) < 1e-7
        and _degrees_apart(camera["bearing"], expected_bearing) < 0.05
        and abs(float(camera["pitch"]) - expected_pitch) < 0.05
        and abs(float(camera["zoom"]) - preset["zoom"]) < 0.05
    )


def timeline_map_camera_matches_overlay(value: dict[str, Any]) -> bool:
    camera = value.get("mapCamera")
    timeline = ((value.get("overlay") or {}).get("camera") or {}).get(
        "timeline"
    )
    if not camera or not timeline:
        return False
    center = timeline.get("centerCoordinate")
    return (
        isinstance(center, list)
        and len(center) == 2
        and map_coordinate_distance(
            camera["center"],
            {"lng": center[0], "lat": center[1]},
        ) < 1e-7
        and _degrees_apart(
            camera["bearing"],
            timeline["bearingDegrees"],
        ) < 0.05
        and abs(float(camera["pitch"]) - float(timeline["pitchDegrees"]))
        < 0.05
        and abs(float(camera["zoom"]) - float(timeline["zoom"])) < 0.05
    )


def read_fixed_follow_state(page: Page) -> dict[str, Any]:
    return read_camera_state(page)


def verify_live_fixed_follow_tracking(
    page: Page,
) -> tuple[dict[str, Any], dict[str, Any]]:
    fresh_run = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          flight.restartFlightSim()
          return flight.startFlightSim()
        }
        """
    )
    page.keyboard.down("KeyW")
    try:
        live_start = poll(
            page,
            lambda: read_fixed_follow_state(page),
            lambda value: (
                value.get("mapCamera") is not None
                and value["source"]["selected"] == "fixed-follow"
                and value["source"]["effectiveOwner"] == "fixed-follow"
                and value["flight"]["phase"] == "flying"
                and value["flight"]["tick"] > fresh_run["tick"]
                and fixed_map_camera_matches_overlay(value)
            ),
            label="first running fixed-follow sample",
        )
        live_end = poll(
            page,
            lambda: read_fixed_follow_state(page),
            lambda value: (
                value.get("pose") is not None
                and value["source"]["effectiveOwner"] == "fixed-follow"
                and value["flight"]["phase"] == "flying"
                and value["flight"]["tick"] >= live_start["flight"]["tick"] + 8
                and map_camera_changed(
                    live_start["mapCamera"],
                    value["mapCamera"],
                )
                and fixed_map_camera_matches_overlay(value)
            ),
            label="second running fixed-follow sample",
        )
    finally:
        page.keyboard.up("KeyW")
    return live_start, live_end


def _start_flying(page: Page, label: str) -> dict[str, Any]:
    started = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          flight.restartFlightSim()
          return flight.startFlightSim()
        }
        """
    )
    page.keyboard.down("KeyW")
    try:
        return poll(
            page,
            lambda: read_camera_state(page),
            lambda value: (
                value["flight"]["phase"] == "flying"
                and value["flight"]["tick"] > started["tick"]
            ),
            label=label,
        )
    finally:
        page.keyboard.up("KeyW")


def _install_pointer_lock_contract_harness(
    page: Page,
    native_error: str,
) -> dict[str, Any]:
    return page.evaluate(
        """
        nativeError => {
          const canvas = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"] canvas',
          )
          if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Flight canvas is unavailable for pointer lock')
          }
          const requestDescriptor = Object.getOwnPropertyDescriptor(
            canvas,
            'requestPointerLock',
          )
          const exitDescriptor = Object.getOwnPropertyDescriptor(
            document,
            'exitPointerLock',
          )
          const elementDescriptor = Object.getOwnPropertyDescriptor(
            document,
            'pointerLockElement',
          )
          let lockedElement = null
          const restore = (target, key, descriptor) => {
            if (descriptor) Object.defineProperty(target, key, descriptor)
            else delete target[key]
          }
          Object.defineProperty(document, 'pointerLockElement', {
            configurable: true,
            get: () => lockedElement,
          })
          Object.defineProperty(canvas, 'requestPointerLock', {
            configurable: true,
            value: async () => {
              lockedElement = canvas
              document.dispatchEvent(new Event('pointerlockchange'))
            },
          })
          Object.defineProperty(document, 'exitPointerLock', {
            configurable: true,
            value: async () => {
              lockedElement = null
              document.dispatchEvent(new Event('pointerlockchange'))
            },
          })
          window.__kgFlightSimPointerLockHarness = {
            mode: 'automation-contract-harness',
            nativeError,
            restore: () => {
              lockedElement = null
              restore(canvas, 'requestPointerLock', requestDescriptor)
              restore(document, 'exitPointerLock', exitDescriptor)
              restore(document, 'pointerLockElement', elementDescriptor)
              delete window.__kgFlightSimPointerLockHarness
            },
          }
          return {
            mode: window.__kgFlightSimPointerLockHarness.mode,
            nativeError,
          }
        }
        """,
        native_error,
    )


def hit_tested_map_canvas_point(page: Page) -> dict[str, float]:
    canvas = page.locator(
        '[data-kg-flight-geospatial-overlay="active"] '
        'canvas.maplibregl-canvas'
    ).first
    canvas.scroll_into_view_if_needed()
    point = canvas.evaluate(
        """
        canvas => {
          const rect = canvas.getBoundingClientRect()
          const ratios = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]
          for (const ratioY of ratios) {
            for (const ratioX of ratios) {
              const x = rect.left + rect.width * ratioX
              const y = rect.top + rect.height * ratioY
              if (document.elementFromPoint(x, y) === canvas) {
                return { x, y }
              }
            }
          }
          return null
        }
        """
    )
    if not point:
        raise AssertionError(
            "MapLibre canvas exposed no hit-testable interaction point"
        )
    return {
        "x": float(point["x"]),
        "y": float(point["y"]),
    }


def verify_map_pointer_drag(page: Page) -> dict[str, Any]:
    point = hit_tested_map_canvas_point(page)
    before = page.evaluate(
        """
        async () => {
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
            'gympgrphStore',
          )
          return gympgrph.readActiveMapLibreMap?.()
            ?.getCenter?.()
            ?.toArray?.() || null
        }
        """
    )
    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.move(point["x"] + 72, point["y"] + 28, steps=8)
    page.mouse.up()
    after = poll(
        page,
        lambda: {
            "center": page.evaluate(
                """
                async () => {
                  const gympgrph = await window.__kgFlightSimBrowserProof.importModule(
                    'gympgrphStore',
                  )
                  return gympgrph.readActiveMapLibreMap?.()
                    ?.getCenter?.()
                    ?.toArray?.() || null
                }
                """
            )
        },
        lambda value: (
            isinstance(before, list)
            and isinstance(value.get("center"), list)
            and sum(
                abs(float(left) - float(right))
                for left, right in zip(before, value["center"])
            ) > 1e-6
        ),
        label="MapLibre pointer drag",
    )
    return {
        "hitPoint": point,
        "centerBefore": before,
        "centerAfter": after["center"],
    }


def _click_flight_pointer_capture(page: Page) -> None:
    capture = page.get_by_label("Capture flight pointer", exact=True)
    capture.wait_for(state="visible", timeout=15_000)
    capture.click(timeout=15_000)


def _lock_flight_canvas(page: Page) -> dict[str, Any]:
    _click_flight_pointer_capture(page)
    native = poll(
        page,
        lambda: read_camera_state(page),
        lambda value: (
            value["pointerLocked"] is True
            or (
                value["pointerState"] == "unavailable"
                and bool(value["pointerLockError"])
            )
        ),
        label="native Flight canvas pointer capture result",
        timeout_ms=1_000,
    )
    if native["pointerLocked"] is True:
        return native
    native_error = native["pointerLockError"]
    if not native_error.startswith(
        "WrongDocumentError: The root document of this element "
        "is not valid for pointer lock."
    ):
        raise AssertionError(
            f"Flight pointer capture failed outside the automation host "
            f"contract: {native}"
        )
    _install_pointer_lock_contract_harness(page, native_error)
    _click_flight_pointer_capture(page)
    return poll(
        page,
        lambda: read_camera_state(page),
        lambda value: (
            value["pointerLocked"] is True
            and value["pointerState"] == "locked"
        ),
        label="Flight canvas pointer capture",
    )


def verify_camera_pointer_transitions(page: Page) -> dict[str, Any]:
    fixed_selection = select_camera_via_catalog(page, "fixed-follow")
    _start_flying(page, "Flight run before Fixed Follow pointer release")
    fixed_locked = _lock_flight_canvas(page)
    fixed_release = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const canvas = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"] canvas',
          )
          const before = flight.readFlightSimSnapshot()
          const released = new Promise(resolve => {
            const timeout = window.setTimeout(
              () => resolve('timeout'),
              1_000,
            )
            document.addEventListener('pointerlockchange', () => {
              window.clearTimeout(timeout)
              resolve('released')
            }, { once: true })
          })
          await document.exitPointerLock()
          const event = await released
          return {
            event,
            before,
            after: flight.readFlightSimSnapshot(),
            pointerLocked: document.pointerLockElement === canvas,
            pointerState: canvas?.dataset.kgFlightSimPointerLock || '',
          }
        }
        """
    )
    if (
        fixed_release["event"] != "released"
        or fixed_release["pointerLocked"] is not False
        or fixed_release["pointerState"] != "released"
        or fixed_release["after"]["phase"] != "stopped"
        or fixed_release["after"]["tick"] != fixed_release["before"]["tick"]
        or fixed_release["after"]["aircraft"]
        != fixed_release["before"]["aircraft"]
    ):
        raise AssertionError(
            f"Fixed Follow pointer release did not pause unchanged: "
            f"{fixed_release}"
        )

    select_camera_via_catalog(page, "fixed-follow")
    _start_flying(page, "Flight run before Free Orbit pointer-lock exit")
    free_locked = _lock_flight_canvas(page)
    free_transition = page.evaluate(
        """
        async () => {
          const camera = await window.__kgFlightSimBrowserProof.importModule('cameraMcpRuntime')
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const canvas = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"] canvas',
          )
          const before = flight.readFlightSimSnapshot()
          const released = new Promise(resolve => {
            const timeout = window.setTimeout(
              () => resolve('timeout'),
              1_000,
            )
            document.addEventListener('pointerlockchange', () => {
              window.clearTimeout(timeout)
              resolve('released')
            }, { once: true })
          })
          const result = camera.controlLocalCamera({
            invocation:
              '/camera.select @camera #camera camera=free-orbit',
          })
          await document.exitPointerLock()
          const event = await released
          const after = flight.readFlightSimSnapshot()
          await new Promise(resolve => window.setTimeout(resolve, 120))
          return {
            event,
            result,
            before,
            after,
            later: flight.readFlightSimSnapshot(),
            pointerLocked: document.pointerLockElement === canvas,
            pointerState: canvas?.dataset.kgFlightSimPointerLock || '',
          }
        }
        """
    )
    result = free_transition["result"]
    if (
        free_transition["event"] != "released"
        or result.get("ok") is not True
        or result.get("elapsedMs", 1_001) > 1_000
        or (result.get("camera") or {}).get("source", {}).get("selected")
        != "free-orbit"
        or free_transition["pointerLocked"] is not False
        or free_transition["pointerState"] != "released"
        or free_transition["after"]["phase"] != "flying"
        or free_transition["after"]["tick"]
        != free_transition["before"]["tick"]
        or free_transition["after"]["aircraft"]
        != free_transition["before"]["aircraft"]
        or free_transition["later"]["phase"] != "flying"
        or free_transition["later"]["tick"]
        <= free_transition["after"]["tick"]
    ):
        raise AssertionError(
            f"Free Orbit pointer-lock exit did not preserve the run: "
            f"{free_transition}"
        )
    return {
        "fixedFollow": {
            "selection": fixed_selection,
            "locked": fixed_locked,
            "released": fixed_release,
        },
        "freeOrbit": {
            "locked": free_locked,
            "transition": free_transition,
        },
        "pointerLockContract": page.evaluate(
            """
            () => {
              const harness = window.__kgFlightSimPointerLockHarness
              if (!harness) return { mode: 'native', nativeError: null }
              const evidence = {
                mode: harness.mode,
                nativeError: harness.nativeError,
              }
              harness.restore()
              return evidence
            }
            """
        ),
    }
