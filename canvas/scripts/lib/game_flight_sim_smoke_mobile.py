from __future__ import annotations

import time
from typing import Any

from playwright.sync_api import Page
from lib.game_flight_sim_smoke_mobile_surface import (
    prepare_mobile_flight_touch_surface,
)


MOBILE_VIEWPORT = {"width": 375, "height": 812}


def verify_mobile_flight_hud(page: Page) -> dict[str, Any]:
    page.set_viewport_size(MOBILE_VIEWPORT)
    page.wait_for_timeout(250)
    interaction_surface = prepare_mobile_flight_touch_surface(
        page,
        close_occluders=True,
    )
    layout = page.evaluate(
        """
        () => {
          const hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
          const xrRoot = document.querySelector(
            '[data-kg-xr-scene-media-drop="1"]',
          )
          const canvasOwner = xrRoot?.querySelector(
            '[data-kg-three-canvas-owner="1"]',
          ) || null
          const canvas = canvasOwner?.querySelector('canvas') || null
          const header = hud?.querySelector(':scope > header') || null
          const objective = header?.querySelector(':scope > section:first-child') || null
          const telemetry = header?.querySelector(':scope > section:last-child') || null
          const directional = hud?.querySelector(
            'section[aria-label="Touch flight controls"]',
          ) || null
          const lowerControls = hud?.querySelector(':scope > section:last-child') || null
          const interactiveControls = Array.from(
            hud?.querySelectorAll('button, input, select, textarea') || [],
          )
          const text = element => String(
            element?.getAttribute('aria-label')
            || element?.textContent
            || element?.getAttribute('name')
            || element?.getAttribute('type')
            || '',
          ).replace(/\\s+/g, ' ').trim()
          const controlTargets = interactiveControls.map((element, index) => [
            `control-${index + 1}:${text(element)}`,
            element,
          ])
          const namedTargets = [
            ['xr-root', xrRoot],
            ['canvas-owner', canvasOwner],
            ['canvas', canvas],
            ['hud', hud],
            ['header', header],
            ['objective', objective],
            ['telemetry', telemetry],
            ['directional-controls', directional],
            ['lower-controls', lowerControls],
            ...controlTargets,
          ]
          const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
          }
          const roundedRect = rect => ({
            left: Number(rect.left.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
          })
          const overlapArea = (left, right) => (
            Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
            * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
          )
          const clippingIssues = element => {
            const issues = []
            const targetRect = element.getBoundingClientRect()
            let ancestor = element.parentElement
            while (ancestor) {
              const style = window.getComputedStyle(ancestor)
              const clipsX = ['auto', 'hidden', 'scroll', 'clip'].includes(style.overflowX)
              const clipsY = ['auto', 'hidden', 'scroll', 'clip'].includes(style.overflowY)
              if (clipsX || clipsY) {
                const rect = ancestor.getBoundingClientRect()
                const clipLeft = rect.left + ancestor.clientLeft
                const clipTop = rect.top + ancestor.clientTop
                const clipRight = clipLeft + ancestor.clientWidth
                const clipBottom = clipTop + ancestor.clientHeight
                if (
                  (clipsX && (targetRect.left < clipLeft - 0.5
                    || targetRect.right > clipRight + 0.5))
                  || (clipsY && (targetRect.top < clipTop - 0.5
                    || targetRect.bottom > clipBottom + 0.5))
                ) {
                  issues.push({
                    ancestor: ancestor === hud
                      ? 'hud'
                      : ancestor.tagName.toLowerCase(),
                    overflowX: style.overflowX,
                    overflowY: style.overflowY,
                  })
                }
              }
              if (ancestor === hud) break
              ancestor = ancestor.parentElement
            }
            return issues
          }
          const targets = namedTargets.map(([name, element]) => {
            if (!(element instanceof HTMLElement)) {
              return {
                name,
                present: false,
                visible: false,
                withinViewport: false,
                viewportIntersectionRatio: 0,
                clippingIssues: [],
              }
            }
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            const visible = style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number(style.opacity || '1') > 0
              && rect.width > 0
              && rect.height > 0
            const intersection = {
              left: Math.max(0, rect.left),
              top: Math.max(0, rect.top),
              right: Math.min(viewport.width, rect.right),
              bottom: Math.min(viewport.height, rect.bottom),
            }
            const intersectionArea = Math.max(0, intersection.right - intersection.left)
              * Math.max(0, intersection.bottom - intersection.top)
            const targetArea = Math.max(0, rect.width * rect.height)
            const viewportIntersectionRatio = targetArea > 0
              ? intersectionArea / targetArea
              : 0
            const withinViewport = rect.left >= -0.5
              && rect.top >= -0.5
              && rect.right <= viewport.width + 0.5
              && rect.bottom <= viewport.height + 0.5
            return {
              name,
              present: true,
              visible,
              withinViewport,
              viewportIntersectionRatio:
                Number(viewportIntersectionRatio.toFixed(4)),
              clippingIssues: clippingIssues(element),
              scrollOverflow: {
                horizontal: element.scrollWidth > element.clientWidth + 1,
                vertical: element.scrollHeight > element.clientHeight + 1,
              },
              rect: roundedRect(rect),
            }
          })
          const leafBlocks = [
            ['objective', objective],
            ['telemetry', telemetry],
            ['directional-controls', directional],
            ['lower-controls', lowerControls],
          ].filter(([, element]) => element instanceof HTMLElement)
          const pairwiseOverlaps = []
          for (let leftIndex = 0; leftIndex < leafBlocks.length; leftIndex += 1) {
            for (
              let rightIndex = leftIndex + 1;
              rightIndex < leafBlocks.length;
              rightIndex += 1
            ) {
              const [leftName, left] = leafBlocks[leftIndex]
              const [rightName, right] = leafBlocks[rightIndex]
              const area = overlapArea(
                left.getBoundingClientRect(),
                right.getBoundingClientRect(),
              )
              if (area > 0.5) {
                pairwiseOverlaps.push(`${leftName}/${rightName}`)
              }
            }
          }
          const controlOverlaps = []
          for (
            let leftIndex = 0;
            leftIndex < interactiveControls.length;
            leftIndex += 1
          ) {
            for (
              let rightIndex = leftIndex + 1;
              rightIndex < interactiveControls.length;
              rightIndex += 1
            ) {
              const area = overlapArea(
                interactiveControls[leftIndex].getBoundingClientRect(),
                interactiveControls[rightIndex].getBoundingClientRect(),
              )
              if (area > 0.5) {
                controlOverlaps.push(
                  `control-${leftIndex + 1}/control-${rightIndex + 1}`,
                )
              }
            }
          }
          const directionalControls = Array.from(
            directional?.querySelectorAll('button') || [],
          )
          return {
            viewport,
            objectiveText: text(objective),
            telemetryText: String(telemetry?.textContent || '')
              .replace(/\\s+/g, ' ')
              .trim(),
            touchLabels: directionalControls.map(
              button => String(button.textContent || '').trim(),
            ),
            controlLabels: interactiveControls.map(text),
            controlCount: interactiveControls.length,
            pairwiseOverlaps,
            controlOverlaps,
            targets,
          }
        }
        """
    )
    invalid_targets = [
        target
        for target in layout["targets"]
        if (
            target.get("present") is not True
            or target.get("visible") is not True
            or target.get("withinViewport") is not True
            or target.get("viewportIntersectionRatio") != 1
            or target.get("clippingIssues")
        )
    ]
    overflow_targets = [
        target
        for target in layout["targets"]
        if (
            target.get("name") in {"xr-root", "canvas-owner", "hud"}
            and (
                (target.get("scrollOverflow") or {}).get("horizontal") is True
                or (target.get("scrollOverflow") or {}).get("vertical") is True
            )
        )
    ]
    required_touch_labels = {
        "Pitch ▲",
        "Pitch ▼",
        "Roll ◀",
        "Roll ▶",
    }
    required_control_labels = required_touch_labels | {
        "Yaw ◀",
        "Yaw ▶",
        "range",
        "Stop",
        "Restart",
    }
    telemetry_text = str(layout.get("telemetryText") or "")
    if (
        layout.get("viewport") != MOBILE_VIEWPORT
        or invalid_targets
        or overflow_targets
        or layout.get("pairwiseOverlaps")
        or layout.get("controlOverlaps")
        or layout.get("controlCount") != len(layout.get("controlLabels") or [])
        or not str(layout.get("objectiveText") or "").strip()
        or not required_touch_labels.issubset(set(layout.get("touchLabels") or []))
        or not required_control_labels.issubset(
            set(layout.get("controlLabels") or [])
        )
        or "PIT" not in telemetry_text
        or "ROL" not in telemetry_text
        or "KTS" not in telemetry_text
        or "ALT" not in telemetry_text
        or "HDG" not in telemetry_text
        or "THR" not in telemetry_text
    ):
        raise AssertionError(
            "Flight mobile HUD escaped the 375x812 viewport: "
            f"invalid={invalid_targets}, overflow={overflow_targets}, "
            f"layout={layout}"
        )
    layout["interactionSurface"] = interaction_surface
    layout["proofScope"] = "layout-control-presence-and-topmost-hit-ownership"
    return layout


def verify_mobile_touch_interaction(page: Page) -> dict[str, Any]:
    before = page.evaluate(
        """
        async () => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          return runtime.restartFlightSim()
        }
        """
    )
    if (
        before.get("phase") != "ready"
        or before.get("tick") != 0
        or before.get("waypointIndex") != 0
    ):
        raise AssertionError(f"fresh touch mission was not ready: {before}")
    control = page.get_by_role("button", name="Pitch ▲", exact=True).first
    control.evaluate(
        """
        element => {
          window.__kgFlightSimTouchEventProof = {}
          for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
            element.addEventListener(type, event => {
              window.__kgFlightSimTouchEventProof[type] = {
                pointerType: event.pointerType,
                isTrusted: event.isTrusted,
                pointerId: event.pointerId,
              }
            }, { once: true })
          }
        }
        """
    )
    session = page.context.new_cdp_session(page)
    hit_test: dict[str, Any] = {}
    after: dict[str, Any] | None = None
    touch_active = False
    try:
        session.send(
            "Emulation.setTouchEmulationEnabled",
            {"enabled": True, "maxTouchPoints": 1},
        )
        page.wait_for_timeout(50)
        box = control.bounding_box()
        hit_test = prepare_mobile_flight_touch_surface(
            page,
            close_occluders=False,
        )["final"]
        if (
            not box
            or not control.is_enabled()
            or hit_test.get("controlEnabled") is not True
            or hit_test.get("controlOwnsPoint") is not True
        ):
            raise AssertionError(
                f"mobile Pitch Up was not the topmost touch target after "
                f"enabling touch emulation: box={box}, surface={hit_test}"
            )
        point = {
            "x": box["x"] + box["width"] / 2,
            "y": box["y"] + box["height"] / 2,
            "radiusX": 4,
            "radiusY": 4,
            "force": 1,
            "id": 41,
        }
        session.send(
            "Input.dispatchTouchEvent",
            {"type": "touchStart", "touchPoints": [point]},
        )
        touch_active = True
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            after = page.evaluate(
                """
                async () => {
                  const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
                  return runtime.readFlightSimSnapshot()
                }
                """
            )
            if (
                after.get("phase") == "flying"
                and after.get("tick", 0) > before.get("tick", 0)
                and after["aircraft"]["pitch"]
                > before["aircraft"]["pitch"] + 0.001
            ):
                break
            page.wait_for_timeout(50)
        else:
            interaction_state = page.evaluate(
                """
                async () => {
                  const input = await window.__kgFlightSimBrowserProof.importModule('flightSimInput')
                  return {
                    events: window.__kgFlightSimTouchEventProof,
                    touchInput: input.readFlightSimTouchInput(),
                  }
                }
                """
            )
            raise AssertionError(
                "Flight mobile Pitch Up touch did not advance production input: "
                f"before={before}, after={after}, hitTest={hit_test}, "
                f"interaction={interaction_state}"
            )
    finally:
        if touch_active:
            session.send(
                "Input.dispatchTouchEvent",
                {"type": "touchEnd", "touchPoints": []},
            )
        session.send(
            "Emulation.setTouchEmulationEnabled",
            {"enabled": False},
        )
        session.detach()
    released: dict[str, Any] = {}
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        released = page.evaluate(
            """
            async () => {
              const input = await window.__kgFlightSimBrowserProof.importModule('flightSimInput')
              return input.readFlightSimTouchInput()
            }
            """
        )
        if not any(abs(float(value)) > 1e-9 for value in released.values()):
            break
        page.wait_for_timeout(25)
    events = page.evaluate("window.__kgFlightSimTouchEventProof")
    if any(abs(float(value)) > 1e-9 for value in released.values()):
        raise AssertionError(
            f"Flight mobile touch input was not released: {released}"
        )
    pointer_down = (events or {}).get("pointerdown") or {}
    if (
        pointer_down.get("pointerType") != "touch"
        or pointer_down.get("isTrusted") is not True
    ):
        raise AssertionError(
            f"Flight mobile touch event provenance was invalid: {events}"
        )
    return {
        "exercised": True,
        "source": "chromium-cdp-emulated-touch",
        "control": "Pitch ▲",
        "runId": after["runId"],
        "tickBefore": before["tick"],
        "tickAfter": after["tick"],
        "pitchBefore": before["aircraft"]["pitch"],
        "pitchAfter": after["aircraft"]["pitch"],
        "positionBefore": before["aircraft"]["position"],
        "positionAfter": after["aircraft"]["position"],
        "events": events,
        "hitTest": hit_test,
        "releasedInput": released,
    }
