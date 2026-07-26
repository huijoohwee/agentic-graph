from __future__ import annotations

from typing import Any

from playwright.sync_api import Page, expect


def verify_motion_control_panel_handoff(page: Page) -> dict[str, Any]:
    before = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          return flight.readFlightSimSnapshot()
        }
        """
    )
    opened = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const motionSurface = await window.__kgFlightSimBrowserProof.importModule('motionControlSurfaceRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const ok = motionSurface.openMotionControlSurface('motion-control')
          return {
            ok,
            flight: flight.readFlightSimSnapshot(),
            floatingPanelView: store.useGraphStore.getState().floatingPanelView,
            captureSurfaceOpen: motionSurface.motionControlCaptureSurfaceCurrentlyOpen(),
          }
        }
        """
    )
    if (
        opened.get("ok") is not True
        or opened.get("floatingPanelView") != "motionControl"
        or opened.get("captureSurfaceOpen") is not True
        or opened["flight"].get("active") is not True
        or opened["flight"].get("runId") != before.get("runId")
    ):
        raise AssertionError(
            "opening Motion Control did not preserve the active Flight run: "
            f"before={before}, opened={opened}"
        )
    expect(
        page.locator(
            '[data-kg-flight-training-motion-controls="connected-handoff"]'
        )
    ).to_be_visible(timeout=10_000)

    returned = page.evaluate(
        """
        async () => {
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const motionSurface = await window.__kgFlightSimBrowserProof.importModule('motionControlSurfaceRuntime')
          const xrSurface = await window.__kgFlightSimBrowserProof.importModule('xrSceneSurfaceRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const ok = xrSurface.activateXrSceneSurface({
            panelView: 'flightSim',
            openPanel: true,
            timeline: true,
          })
          return {
            ok,
            flight: flight.readFlightSimSnapshot(),
            floatingPanelView: store.useGraphStore.getState().floatingPanelView,
            captureSurfaceOpen: motionSurface.motionControlCaptureSurfaceCurrentlyOpen(),
          }
        }
        """
    )
    if (
        returned.get("ok") is not True
        or returned.get("floatingPanelView") != "flightSim"
        or returned.get("captureSurfaceOpen") is not True
        or returned["flight"].get("active") is not True
        or returned["flight"].get("runId") != before.get("runId")
    ):
        raise AssertionError(
            "returning to Flight did not preserve Motion Control capture ownership: "
            f"before={before}, returned={returned}"
        )
    status = page.locator('[data-kg-flight-sim-motion-control]')
    expect(status).to_be_visible(timeout=10_000)
    if status.get_attribute("data-kg-flight-sim-motion-pose") != "waiting":
        raise AssertionError("Flight did not publish the waiting-for-pose status")
    return {
        "runId": before["runId"],
        "flightPreservedWhileMotionPanelOpen": True,
        "captureSurfacePreservedAfterFlightReturn": True,
        "opened": opened,
        "returned": returned,
    }
