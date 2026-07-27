from __future__ import annotations

from typing import Any

from playwright.sync_api import Page

from lib.game_flight_sim_smoke_camera_tracking import (
    fixed_map_camera_matches_overlay,
    map_camera_changed as _map_camera_changed,
    poll as _poll,
    read_camera_state as _read_camera_state,
    select_camera_via_catalog,
    timeline_map_camera_matches_overlay,
    verify_camera_pointer_transitions,
    verify_live_fixed_follow_tracking,
    verify_map_pointer_drag,
)


def verify_flight_camera_runtime(page: Page) -> dict[str, Any]:
    initial = _read_camera_state(page)
    expected_catalog = [
        {"id": "fixed-follow", "label": "Fixed Follow"},
        {"id": "free-orbit", "label": "Free Orbit"},
    ]
    catalog = [
        {"id": item["id"], "label": item["label"]}
        for item in initial["source"]["available"]
    ]
    if (
        initial.get("mapCamera") is None
        or initial["source"]["selected"] != "fixed-follow"
        or initial["source"]["effectiveOwner"] != "fixed-follow"
        or not fixed_map_camera_matches_overlay(initial)
        or catalog != expected_catalog
    ):
        raise AssertionError(
            f"Fresh Flight camera was not default Fixed Follow: {initial}"
        )
    live_start, live_end = verify_live_fixed_follow_tracking(page)
    pointer_transitions = verify_camera_pointer_transitions(page)

    fixed_selection = select_camera_via_catalog(page, "fixed-follow")
    free_selection = select_camera_via_catalog(page, "free-orbit")
    before = fixed_selection["state"]
    free_orbit_before_drag = free_selection["state"]
    transition_setup = {
        "fixedFollow": fixed_selection,
        "freeOrbit": free_selection,
    }
    if not free_orbit_before_drag.get("mapCamera"):
        raise AssertionError(
            f"Free Orbit did not expose the visible map camera: {transition_setup}"
        )
    map_interaction = verify_map_pointer_drag(page)
    free_orbit = _poll(
        page,
        lambda: _read_camera_state(page),
        lambda value: (
            value.get("pose") is not None
            and value["source"]["selected"] == "free-orbit"
            and value["source"]["effectiveOwner"] == "free-orbit"
            and value["flight"]["tick"] > before["flight"]["tick"]
        ),
        label="Free Orbit MapLibre interaction",
    )
    restored_selection = select_camera_via_catalog(page, "fixed-follow")
    restored = restored_selection["state"]
    timeline_operator_selection = select_camera_via_catalog(
        page,
        "free-orbit",
    )
    invalid_selection = page.evaluate(
        """
        async () => {
          const camera = await window.__kgFlightSimBrowserProof.importModule('cameraMcpRuntime')
          const before = camera.inspectLocalCamera().source
          const invalidValue = 'cinematic-flight'
          const result = camera.controlLocalCamera({
            invocation:
              `/camera.select @camera #camera camera=${invalidValue}`,
          })
          const after = camera.inspectLocalCamera().source
          return { before, after, invalidValue, result }
        }
        """
    )
    invalid_result = invalid_selection["result"]
    if (
        invalid_result.get("ok") is not False
        or invalid_result.get("errorCode")
        != "CAMERA_SOURCE_INVALID_VALUE"
        or invalid_result.get("field") != "camera"
        or invalid_result.get("token") != "camera=cinematic-flight"
        or invalid_selection["invalidValue"]
        not in invalid_result.get("message", "")
        or invalid_selection["after"]["selected"]
        != invalid_selection["before"]["selected"]
        or invalid_selection["after"]["effectiveOwner"]
        != invalid_selection["before"]["effectiveOwner"]
        or invalid_selection["after"]["selected"] != "free-orbit"
    ):
        raise AssertionError(
            "Invalid Flight camera value did not fail closed: "
            f"{invalid_selection}"
        )
    if (
        before["source"]["selected"] != "fixed-follow"
        or before["source"]["effectiveOwner"] != "fixed-follow"
        or free_orbit["source"]["available"]
        != initial["source"]["available"]
        or free_orbit_before_drag["pointerLocked"] is not False
        or free_orbit_before_drag["panelView"] != "camera"
        or free_orbit_before_drag["flight"]["active"] is not True
        or free_orbit_before_drag["flight"]["phase"] != "flying"
        or restored["source"]["available"]
        != initial["source"]["available"]
        or restored["flight"]["active"] is not True
        or timeline_operator_selection["state"]["source"]["selected"]
        != "free-orbit"
    ):
        raise AssertionError(
            "Flight camera-source transition was not isolated: "
            f"setup={transition_setup} free_orbit={free_orbit} "
            f"restored={restored}"
        )

    timeline_run = page.evaluate(
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
        _poll(
            page,
            lambda: _read_camera_state(page),
            lambda value: (
                value["flight"]["phase"] == "flying"
                and value["flight"]["tick"] > timeline_run["tick"]
            ),
            label="fresh Flight run before Timeline playback",
        )
    finally:
        page.keyboard.up("KeyW")

    timeline_setup = page.evaluate(
        """
        async () => {
          const motion = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime')
          const playback = await window.__kgFlightSimBrowserProof.importModule('xrCameraPlaybackControlsRuntime')
          const timeline = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceTimeline')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const runtime = motion.readXrMotionReferenceRuntime()
          const anchors = runtime.plan.cast.slice(0, 2)
          if (runtime.plan.camera.length !== 0) {
            return {
              ok: false,
              reason: 'authored Flight seed already contained camera marks',
              cameraMarks: runtime.plan.camera.length,
            }
          }
          if (anchors.length < 2) {
            return { ok: false, reason: 'fewer than two authored camera anchors' }
          }
          const state = store.useGraphStore.getState()
          const previousTransport = {
            documentKey: state.timelineTransportDocumentKey,
            position: state.timelineTransportPosition,
            playing: state.timelineTransportPlaying,
            playbackRate: state.timelineTransportPlaybackRate,
          }
          const endTime = Math.min(4, runtime.plan.durationSeconds)
          motion.setXrMotionReferenceCameraMark({
            timeSeconds: 0,
            anchorId: anchors[0].actorId,
            rig: 'dolly',
            easing: 'linear',
            settings: {
              angle: 'front',
              level: 'eye-level',
              shot: 'medium',
              note: '',
              orbitX: 0,
              orbitY: 0,
              sensorId: 'super-35',
              focalLengthMm: 35,
              focusDistanceMeters: 6,
              aspectRatio: '16:9',
            },
          })
          motion.setXrMotionReferenceCameraMark({
            timeSeconds: endTime,
            anchorId: anchors[1].actorId,
            rig: 'drone',
            easing: 'linear',
            settings: {
              angle: 'right-side',
              level: 'high-angle',
              shot: 'wide',
              note: '',
              orbitX: 0.5,
              orbitY: -0.4,
              sensorId: 'full-frame',
              focalLengthMm: 70,
              focusDistanceMeters: 4,
              aspectRatio: '2.39:1',
            },
          })
          const documentKey = timeline.xrMotionReferenceTimelineDocumentKey(
            state.markdownDocumentName,
          )
          motion.setXrMotionReferencePlayhead(0)
          state.setTimelineTransportState({
            documentKey,
            position: 0,
            playing: true,
          })
          playback.requestXrMotionReferenceCameraPlaybackReapply()
          return {
            ok: true,
            anchorIds: anchors.map(anchor => anchor.actorId),
            cameraMarks:
              motion.readXrMotionReferenceRuntime().plan.camera.length,
            documentKey,
            endTime,
            previousRuntime: runtime,
            previousTransport,
          }
        }
        """
    )
    if (
        timeline_setup.get("ok") is not True
        or timeline_setup.get("cameraMarks") != 2
    ):
        raise AssertionError(f"Timeline camera setup failed: {timeline_setup}")

    timeline_start = _poll(
        page,
        lambda: _read_camera_state(page),
        lambda value: value.get("mapCamera") is not None
        and value["source"]["selected"] == "free-orbit"
        and value["source"]["effectiveOwner"] == "timeline-playback"
        and timeline_map_camera_matches_overlay(value),
        label="Timeline camera ownership at the first mark",
    )
    page.evaluate(
        """
        async endTime => {
          const motion = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime')
          const playback = await window.__kgFlightSimBrowserProof.importModule('xrCameraPlaybackControlsRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          motion.setXrMotionReferencePlayhead(endTime)
          store.useGraphStore.getState().setTimelineTransportState({
            position: endTime / 60,
          })
          playback.requestXrMotionReferenceCameraPlaybackReapply()
        }
        """,
        timeline_setup["endTime"],
    )
    timeline_end = _poll(
        page,
        lambda: _read_camera_state(page),
        lambda value: (
            value.get("mapCamera") is not None
            and value["source"]["effectiveOwner"] == "timeline-playback"
            and _map_camera_changed(
                timeline_start["mapCamera"],
                value["mapCamera"],
            )
            and timeline_map_camera_matches_overlay(value)
            and value["flight"]["tick"] > timeline_start["flight"]["tick"]
        ),
        label="Timeline camera position, target, and Flight tick change",
    )

    page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          flight.stopFlightSim()
          store.useGraphStore.getState().setTimelineTransportState({
            playing: false,
          })
        }
        """
    )

    returned = _poll(
        page,
        lambda: _read_camera_state(page),
        lambda value: (
            value.get("pose") is not None
            and value["source"]["selected"] == "free-orbit"
            and value["source"]["effectiveOwner"] == "free-orbit"
            and value["flight"]["active"] is True
            and value["flight"]["phase"] == "stopped"
        ),
        label="most-recent Free Orbit owner after Timeline playback",
    )
    page.evaluate(
        """
        async cleanup => {
          const motion = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          motion.restoreXrMotionReferenceRuntimeSnapshot(
            cleanup.previousRuntime,
          )
          store.useGraphStore.getState().setTimelineTransportState(
            cleanup.previousTransport,
          )
        }
        """,
        {
            "previousRuntime": timeline_setup["previousRuntime"],
            "previousTransport": timeline_setup["previousTransport"],
        },
    )
    cleaned_up = page.evaluate(
        """
        async () => {
          const motion = await window.__kgFlightSimBrowserProof.importModule('xrMotionReferenceRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const state = store.useGraphStore.getState()
          return {
            cameraMarks:
              motion.readXrMotionReferenceRuntime().plan.camera.length,
            dirty: motion.readXrMotionReferenceRuntime().dirty,
            documentKey: state.timelineTransportDocumentKey,
            playing: state.timelineTransportPlaying,
            playbackRate: state.timelineTransportPlaybackRate,
            position: state.timelineTransportPosition,
          }
        }
        """
    )
    if cleaned_up != {
        "cameraMarks": 0,
        "dirty": timeline_setup["previousRuntime"]["dirty"],
        "documentKey": timeline_setup["previousTransport"]["documentKey"],
        "playing": timeline_setup["previousTransport"]["playing"],
        "playbackRate": timeline_setup["previousTransport"]["playbackRate"],
        "position": timeline_setup["previousTransport"]["position"],
    }:
        raise AssertionError(
            f"Timeline camera smoke state was not restored: {cleaned_up}"
        )
    resumed = page.evaluate(
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
        resumed_state = _poll(
            page,
            lambda: _read_camera_state(page),
            lambda value: (
                value["flight"]["phase"] == "flying"
                and value["flight"]["tick"] > resumed["tick"]
                and value["source"]["selected"] == "free-orbit"
                and value["source"]["effectiveOwner"] == "free-orbit"
            ),
            label="Flight ticks after Free Orbit camera return",
        )
    finally:
        page.keyboard.up("KeyW")

    return {
        "default": {
            "selected": initial["source"]["selected"],
            "effectiveOwner": initial["source"]["effectiveOwner"],
            "mapCamera": initial["mapCamera"],
        },
        "before": before["source"]["selected"],
        "during": free_orbit["source"]["selected"],
        "catalog": catalog,
        "selectionDurationsMs": {
            "fixedFollow": fixed_selection["observedMs"],
            "freeOrbit": free_selection["observedMs"],
            "restoredFixedFollow": restored_selection["observedMs"],
            "timelineFreeOrbit":
                timeline_operator_selection["observedMs"],
        },
        "selectionDeadlineMs": 1_000,
        "invalidValueResult": invalid_selection,
        "pointerLocked": free_orbit_before_drag["pointerLocked"],
        "pointerLockContract": pointer_transitions["pointerLockContract"],
        "freeOrbit": {
            "mapCameraBefore": free_orbit_before_drag["mapCamera"],
            "mapCameraAfter": free_orbit["mapCamera"],
            "mapInteraction": map_interaction,
        },
        "pointerTransitions": {
            "fixedFollow": {
                "locked":
                    pointer_transitions["fixedFollow"]["locked"][
                        "pointerState"
                    ],
                "released":
                    pointer_transitions["fixedFollow"]["released"][
                        "pointerState"
                    ],
                "tick":
                    pointer_transitions["fixedFollow"]["released"]["after"][
                        "tick"
                    ],
                "phase":
                    pointer_transitions["fixedFollow"]["released"]["after"][
                        "phase"
                    ],
            },
            "freeOrbit": {
                "locked":
                    pointer_transitions["freeOrbit"]["locked"][
                        "pointerState"
                    ],
                "released":
                    pointer_transitions["freeOrbit"]["transition"][
                        "pointerState"
                    ],
                "tickAtExit":
                    pointer_transitions["freeOrbit"]["transition"]["after"][
                        "tick"
                    ],
                "tickAfterClockContinued":
                    pointer_transitions["freeOrbit"]["transition"]["later"][
                        "tick"
                    ],
                "phase":
                    pointer_transitions["freeOrbit"]["transition"]["after"][
                        "phase"
                    ],
            },
        },
        "timeline": {
            "anchorIds": timeline_setup["anchorIds"],
            "cameraMarks": timeline_setup["cameraMarks"],
            "effectiveOwner": timeline_end["source"]["effectiveOwner"],
            "startMapCamera": timeline_start["mapCamera"],
            "endMapCamera": timeline_end["mapCamera"],
            "startOverlay": timeline_start["overlay"]["camera"]["timeline"],
            "endOverlay": timeline_end["overlay"]["camera"]["timeline"],
            "tickBefore": timeline_start["flight"]["tick"],
            "tickAfter": timeline_end["flight"]["tick"],
            "cleanedUp": cleaned_up,
        },
        "returned": {
            "selected": returned["source"]["selected"],
            "effectiveOwner": returned["source"]["effectiveOwner"],
            "mapCamera": returned["mapCamera"],
            "tickAfterResume": resumed_state["flight"]["tick"],
            "liveTracking": {
                "first": {
                    "tick": live_start["flight"]["tick"],
                    "mapCamera": live_start["mapCamera"],
                    "overlayCamera": live_start["overlay"]["camera"],
                },
                "second": {
                    "tick": live_end["flight"]["tick"],
                    "mapCamera": live_end["mapCamera"],
                    "overlayCamera": live_end["overlay"]["camera"],
                },
            },
        },
    }
