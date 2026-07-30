from __future__ import annotations

from typing import Any

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_camera_tracking import (
    poll,
    pose_changed,
)


def read_navigation_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const camera = await window.__kgFlightSimBrowserProof.importModule('flightSimCameraRuntime')
          const source = await window.__kgFlightSimBrowserProof.importModule('cameraSourceMcpRuntime')
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const panel = document.querySelector(
            '[data-kg-flight-sim-floating-panel="1"]',
          )
          const hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
          const navigation = panel?.querySelector(
            '[data-kg-flight-sim-navigation="ready"]',
          )
          const pose = store.useGraphStore.getState().captureThreeCameraPose()
          const snapshot = flight.readFlightSimSnapshot()
          const view = camera.readFlightSimCameraSnapshot()
          let forwardAlignment = null
          if (pose) {
            const sight = {
              x: pose.target.x - pose.position.x,
              y: pose.target.y - pose.position.y,
              z: pose.target.z - pose.position.z,
            }
            const sightLength = Math.hypot(sight.x, sight.y, sight.z)
            const horizontal = Math.cos(snapshot.aircraft.pitch)
            const aircraftForward = {
              x: -Math.sin(snapshot.aircraft.yaw) * horizontal,
              y: Math.sin(snapshot.aircraft.pitch),
              z: -Math.cos(snapshot.aircraft.yaw) * horizontal,
            }
            forwardAlignment = sightLength > 0
              ? (
                  sight.x * aircraftForward.x
                  + sight.y * aircraftForward.y
                  + sight.z * aircraftForward.z
                ) / sightLength
              : null
          }
          return {
            camera: view,
            source: source.inspectLocalCameraSource(),
            flight: snapshot,
            pose,
            forwardAlignment,
            panelView: panel?.getAttribute('data-kg-flight-sim-camera-view') || '',
            hudView: hud?.getAttribute('data-kg-flight-sim-camera-view') || '',
            navigationStatus:
              navigation?.getAttribute('data-kg-flight-sim-navigation') || '',
            routePointCount: navigation?.querySelectorAll(
              '[data-kg-flight-sim-route-point]',
            ).length || 0,
            activeRoutePointCount: navigation?.querySelectorAll(
              '[data-kg-flight-sim-route-state="active"]',
            ).length || 0,
            objectiveDistance: Number(
              navigation?.getAttribute('data-kg-flight-sim-objective-distance'),
            ),
            objectiveBearing: Number(
              navigation?.getAttribute('data-kg-flight-sim-objective-bearing'),
            ),
            canvasCount: document.querySelectorAll(
              '[data-kg-xr-scene-media-drop="1"] canvas',
            ).length,
          }
        }
        """
    )


def view_ready(
    value: dict[str, Any],
    expected_view: str,
    prior_pose: dict[str, Any] | None = None,
) -> bool:
    pose_is_distinct = prior_pose is None or pose_changed(
        prior_pose,
        value.get("pose"),
        minimum_distance=0.25,
    )
    alignment = value.get("forwardAlignment")
    return (
        value.get("camera", {}).get("view") == expected_view
        and value.get("panelView") == expected_view
        and value.get("hudView") == expected_view
        and value.get("source", {}).get("selected") == "fixed-follow"
        and value.get("source", {}).get("effectiveOwner") == "fixed-follow"
        and value.get("pose") is not None
        and isinstance(alignment, (int, float))
        and alignment > 0.2
        and pose_is_distinct
    )


def verify_flight_navigation_runtime(page: Page) -> dict[str, Any]:
    initial = poll(
        page,
        lambda: read_navigation_state(page),
        lambda value: view_ready(value, "chase"),
        label="initial Chase Flight camera view",
    )
    distance = initial.get("objectiveDistance")
    bearing = initial.get("objectiveBearing")
    if (
        initial.get("navigationStatus") != "ready"
        or initial.get("routePointCount") != 5
        or initial.get("activeRoutePointCount") != 1
        or not isinstance(distance, (int, float))
        or distance <= 0
        or not isinstance(bearing, (int, float))
        or bearing < 0
        or bearing >= 360
        or initial.get("canvasCount") != 1
        or initial.get("flight", {}).get("runtimeError") is not None
    ):
        raise AssertionError(
            "local Flight navigation inset did not project the authored route: "
            f"{initial}"
        )

    page.locator(
        '[data-kg-flight-sim-floating-panel="1"] '
        '[data-kg-flight-sim-camera-option="cockpit"]'
    ).click()
    cockpit = poll(
        page,
        lambda: read_navigation_state(page),
        lambda value: view_ready(value, "cockpit", initial.get("pose")),
        label="Cockpit Flight camera view",
    )

    page.keyboard.press("KeyC")
    survey = poll(
        page,
        lambda: read_navigation_state(page),
        lambda value: (
            view_ready(value, "survey", cockpit.get("pose"))
            and value.get("flight", {}).get("tick", 0)
            > cockpit.get("flight", {}).get("tick", 0)
        ),
        label="C-key Survey Flight camera view",
    )

    page.locator(
        '[data-kg-flight-sim-floating-panel="1"] '
        '[data-kg-flight-sim-camera-option="chase"]'
    ).click()
    restored = poll(
        page,
        lambda: read_navigation_state(page),
        lambda value: view_ready(value, "chase", survey.get("pose")),
        label="restored Chase Flight camera view",
    )
    return {
        "views": ["chase", "cockpit", "survey"],
        "buttonSelection": "cockpit",
        "keyboardCycle": "survey",
        "restored": restored["camera"]["view"],
        "routePointCount": initial["routePointCount"],
        "activeRoutePointCount": initial["activeRoutePointCount"],
        "objectiveDistance": distance,
        "objectiveBearing": bearing,
        "forwardAlignment": {
            "chase": initial["forwardAlignment"],
            "cockpit": cockpit["forwardAlignment"],
            "survey": survey["forwardAlignment"],
            "restored": restored["forwardAlignment"],
        },
        "sharedCameraSourceRetained": True,
        "singleCanvasRetained": restored["canvasCount"] == 1,
        "tickBefore": initial["flight"]["tick"],
        "tickAfter": restored["flight"]["tick"],
    }
