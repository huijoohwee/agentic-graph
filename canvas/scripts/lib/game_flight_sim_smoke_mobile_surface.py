from __future__ import annotations

import time
from typing import Any

from playwright.sync_api import Page


MOBILE_TOUCH_OCCLUDER_CLOSE_LIMIT = 3


def _read_pitch_touch_surface(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const flight = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const state = store.useGraphStore.getState()
          const flightSnapshot = flight.readFlightSimSnapshot()
          const hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
          const control = Array.from(hud?.querySelectorAll('button') || [])
            .find(element => String(element.textContent || '').trim() === 'Pitch ▲')
          const describe = element => {
            if (!(element instanceof Element)) return null
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return {
              tag: element.tagName,
              role: element.getAttribute('role') || '',
              ariaLabel: element.getAttribute('aria-label') || '',
              title: element.getAttribute('title') || '',
              text: String(element.textContent || '')
                .replace(/\\s+/g, ' ')
                .trim()
                .slice(0, 160),
              className: String(element.className || '').slice(0, 240),
              dataIdentity: {
                floatingPanelRoot:
                  element.getAttribute('data-kg-floating-panel-root') || '',
                flightHud:
                  element.getAttribute('data-kg-flight-sim-hud') || '',
              },
              rect: {
                left: Number(rect.left.toFixed(2)),
                top: Number(rect.top.toFixed(2)),
                right: Number(rect.right.toFixed(2)),
                bottom: Number(rect.bottom.toFixed(2)),
                width: Number(rect.width.toFixed(2)),
                height: Number(rect.height.toFixed(2)),
              },
              style: {
                display: style.display,
                pointerEvents: style.pointerEvents,
                position: style.position,
                visibility: style.visibility,
                zIndex: style.zIndex,
              },
            }
          }
          if (!(control instanceof HTMLButtonElement)) {
            return {
              controlPresent: false,
              controlOwnsPoint: false,
              graphState: {
                floatingPanelOpen: state.floatingPanelOpen,
                floatingPanelView: state.floatingPanelView,
                workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
                workspaceViewMode: state.workspaceViewMode,
              },
              runtime: {
                active: flightSnapshot.active,
                phase: flightSnapshot.phase,
                revision: flightSnapshot.revision,
                runId: flightSnapshot.runId,
                tick: flightSnapshot.tick,
              },
            }
          }
          const rect = control.getBoundingClientRect()
          const center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          }
          const topHit = document.elementFromPoint(center.x, center.y)
          const workspaceMain = topHit instanceof Element
            ? topHit.closest('main[aria-label="Markdown Editor and Viewer"]')
            : null
          const workspaceShell = topHit instanceof Element
            ? topHit.closest('[aria-label="Workspace editor overlay shell"]')
            : null
          const workspaceOwner = workspaceMain || workspaceShell
          const floatingPanelOwner = topHit instanceof Element
            ? topHit.closest('[data-kg-floating-panel-root="true"]')
            : null
          const owner = workspaceOwner || floatingPanelOwner
          return {
            center,
            control: describe(control),
            controlEnabled: !control.disabled,
            controlOwnsPoint:
              topHit === control || Boolean(topHit && control.contains(topHit)),
            controlPresent: true,
            graphState: {
              floatingPanelOpen: state.floatingPanelOpen,
              floatingPanelView: state.floatingPanelView,
              workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
              workspaceViewMode: state.workspaceViewMode,
            },
            owner: describe(owner),
            ownerKind: workspaceOwner
              ? 'workspace-editor'
              : floatingPanelOwner
                ? 'floating-panel'
                : null,
            runtime: {
              active: flightSnapshot.active,
              phase: flightSnapshot.phase,
              revision: flightSnapshot.revision,
              runId: flightSnapshot.runId,
              tick: flightSnapshot.tick,
            },
            topHit: describe(topHit),
          }
        }
        """
    )


def _wait_for_occluder_close(
    page: Page,
    owner_kind: str,
    run_id: int,
) -> dict[str, Any]:
    deadline = time.monotonic() + 5
    last = _read_pitch_touch_surface(page)
    while time.monotonic() < deadline:
        last = _read_pitch_touch_surface(page)
        graph_state = last.get("graphState") or {}
        closed = (
            owner_kind == "workspace-editor"
            and graph_state.get("workspaceViewMode") == "canvas"
            and graph_state.get("workspaceCanvasPaneOpen") is False
        ) or (
            owner_kind == "floating-panel"
            and graph_state.get("floatingPanelOpen") is False
        )
        owner_left_top = last.get("ownerKind") != owner_kind
        if (
            closed
            and owner_left_top
            and last.get("controlPresent") is True
            and last.get("controlEnabled") is True
            and (last.get("runtime") or {}).get("active") is True
            and (last.get("runtime") or {}).get("runId") == run_id
        ):
            return last
        page.wait_for_timeout(50)
    raise AssertionError(
        f"mobile Flight touch occluder did not close: "
        f"owner={owner_kind}, surface={last}"
    )


def _close_mobile_touch_occluders(page: Page) -> dict[str, Any]:
    transitions: list[dict[str, Any]] = []
    for _ in range(MOBILE_TOUCH_OCCLUDER_CLOSE_LIMIT):
        before = _read_pitch_touch_surface(page)
        if (
            before.get("controlOwnsPoint") is True
            and (before.get("runtime") or {}).get("active") is True
        ):
            return {"final": before, "transitions": transitions}
        owner_kind = str(before.get("ownerKind") or "")
        if owner_kind == "workspace-editor":
            owner = page.locator(
                '[aria-label="Workspace editor overlay shell"]'
            ).first
            close_button = owner.locator(
                'main[aria-label="Markdown Editor and Viewer"] '
                'button[title="Close"]'
            )
        elif owner_kind == "floating-panel":
            owner = page.locator(
                '[data-kg-floating-panel-root="true"]'
            ).first
            close_button = owner.locator('button[title="Close"]')
        else:
            raise AssertionError(
                f"mobile Pitch Up center had an unsupported topmost owner: "
                f"{before}"
            )
        if close_button.count() != 1 or not close_button.first.is_visible():
            raise AssertionError(
                f"mobile Flight touch occluder exposed no exact Close action: "
                f"owner={owner_kind}, count={close_button.count()}, "
                f"surface={before}"
            )
        close_button.first.click(timeout=5_000)
        after = _wait_for_occluder_close(
            page,
            owner_kind,
            int((before.get("runtime") or {}).get("runId") or 0),
        )
        transitions.append({
            "owner": owner_kind,
            "before": before,
            "after": after,
        })
    final = _read_pitch_touch_surface(page)
    if (
        final.get("controlOwnsPoint") is not True
        or (final.get("runtime") or {}).get("active") is not True
    ):
        raise AssertionError(
            f"mobile Pitch Up center remained occluded after "
            f"{MOBILE_TOUCH_OCCLUDER_CLOSE_LIMIT} exact Close actions: "
            f"transitions={transitions}, final={final}"
        )
    return {"final": final, "transitions": transitions}


def prepare_mobile_flight_touch_surface(
    page: Page,
    *,
    close_occluders: bool,
) -> dict[str, Any]:
    if close_occluders:
        return _close_mobile_touch_occluders(page)
    return {
        "final": _read_pitch_touch_surface(page),
        "transitions": [],
    }
