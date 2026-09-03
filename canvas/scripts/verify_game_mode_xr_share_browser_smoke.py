from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, expect, sync_playwright

from lib.game_mode_xr_share_smoke_source import (
    fetch_validation_markdown,
    normalized_origin,
    parse_validation_source,
)
from lib.game_mode_xr_share_scene_contract import (
    assert_authored_scene_identity,
    assert_game_scene_delta,
    assert_scene_contract,
    assert_stable_renderer_canvas,
    install_restored_frame_capture,
    read_scene_contract,
    read_xr_state,
)
from lib.game_mode_xr_share_evidence import (
    audit_request_origins,
    build_browser_evidence,
)


BASE_URL = os.environ.get(
    "AG_GAME_MODE_XR_SHARE_SMOKE_BASE_URL",
    "http://localhost:4186",
).rstrip("/")
VALIDATION_SHARE_URL = os.environ.get("AG_GAME_MODE_VALIDATION_SHARE_URL", "").strip()
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
ACTIVE_SCREENSHOT_PATH = OUTPUT_DIR / "game-mode-xr-share-browser-smoke-active.png"
RESTORED_SCREENSHOT_PATH = OUTPUT_DIR / "game-mode-xr-share-browser-smoke-restored.png"
EVIDENCE_PATH = OUTPUT_DIR / "game-mode-xr-share-browser-smoke.json"
NAVIGATION_CONTEXT_DESTROYED_MESSAGE = (
    "Execution context was destroyed, most likely because of a navigation"
)
XR_SCENE_PANEL_PROJECTIONS = (
    ("media", '[data-kg-media-panel="1"]'),
    ("animation", '[data-kg-animation-floating-panel="1"]'),
    ("motionControl", '[data-kg-motion-control-floating-panel="1"]'),
    ("gameMode", '[data-kg-game-mode-floating-panel="1"]'),
    ("camera", '[data-kg-camera-panel-surface="floatingPanel"]'),
)


def local_chromium_executable() -> str | None:
    explicit = os.environ.get("AG_GAME_MODE_XR_SHARE_CHROMIUM_EXECUTABLE", "").strip()
    candidates = [
        Path(explicit) if explicit else None,
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def poll_evaluate(
    page: Page,
    script: str,
    predicate: Callable[[Any], bool],
    *,
    timeout_ms: int = 120_000,
    interval_ms: int = 200,
) -> Any:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: Any = None
    while time.monotonic() < deadline:
        try:
            last_value = page.evaluate(script)
        except PlaywrightError as error:
            if NAVIGATION_CONTEXT_DESTROYED_MESSAGE not in str(error):
                raise
            page.wait_for_load_state("domcontentloaded")
            continue
        if predicate(last_value):
            return last_value
        page.wait_for_timeout(interval_ms)
    raise AssertionError("timed out waiting for the expected browser runtime state")


def comparable_xr_frame(frame: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in frame.items() if key != "phase"}


def numeric_attribute(locator, name: str) -> float:
    value = locator.get_attribute(name)
    if value is None:
        raise AssertionError(f"missing {name}")
    return float(value)


def assert_game_mode_grounded_camera(page: Page) -> float:
    canvas = page.locator('canvas[data-kg-game-fps-first-frame="1"]').first
    expect(canvas).to_have_attribute("data-kg-game-fps-grounded-camera", "1")
    fov = numeric_attribute(canvas, "data-kg-game-fps-camera-fov")
    if fov < 55 or fov > 65:
        raise AssertionError(f"Game Mode inherited non-grounded XR camera optics: fov={fov}")
    return fov


def verify_panel_scene_continuity(
    page: Page,
    baseline_scene: dict[str, Any],
) -> list[str]:
    visited: list[str] = []
    for panel_view, panel_selector in XR_SCENE_PANEL_PROJECTIONS:
        trigger = page.locator(
            f'[data-kg-floating-panel-view-trigger="{panel_view}"]'
        ).first
        expect(trigger).to_be_visible(timeout=30_000)
        trigger.click()
        expect(page.locator(panel_selector).first).to_be_visible(timeout=30_000)
        assert_stable_renderer_canvas(page)
        projected_scene = read_scene_contract(page)
        assert_scene_contract(projected_scene, game_active=False)
        assert_authored_scene_identity(
            baseline_scene,
            projected_scene,
            context=f"FloatingPanel {panel_view}",
        )
        expect(page.locator('[data-kg-xr-playground-hud="1"]').first).to_have_attribute(
            "data-kg-xr-playground-phase",
            "running",
        )
        visited.append(panel_view)
    return visited


def main() -> None:
    share_url, share_token, supplied_origin = parse_validation_source(VALIDATION_SHARE_URL)
    expected_markdown_bytes = fetch_validation_markdown(share_url, supplied_origin)
    local_origin = normalized_origin(BASE_URL)
    target_url = f"{BASE_URL}/agentic-graph/?kgShare={quote(share_token, safe='')}"
    requests: list[str] = []
    console_error_count = 0
    page_error_count = 0
    failed_response_count = 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=local_chromium_executable(),
            args=["--enable-webgl", "--use-angle=swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        def on_console(message: Any) -> None:
            nonlocal console_error_count
            if message.type == "error":
                console_error_count += 1

        def on_page_error(_: Any) -> None:
            nonlocal page_error_count
            page_error_count += 1

        def on_response(response: Any) -> None:
            nonlocal failed_response_count
            if response.status >= 400:
                failed_response_count += 1

        page.on("request", lambda request: requests.append(request.url))
        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("response", on_response)

        try:
            motion_panel = page.locator('[data-kg-motion-control-floating-panel="1"]').first
            xr_hud = page.locator('[data-kg-xr-playground-hud="1"]').first
            # Let Vite finish cold dependency optimization before the one-shot deep link is consumed.
            page.goto(f"{BASE_URL}/agentic-graph/", wait_until="domcontentloaded")
            expect(motion_panel).to_be_visible(timeout=120_000)
            expect(xr_hud).to_be_visible(timeout=120_000)
            page.goto(target_url, wait_until="domcontentloaded")

            imported = poll_evaluate(
                page,
                """
                async () => {
                  const store = await import('/src/hooks/useGraphStore.ts')
                  return String(store.useGraphStore.getState().markdownDocumentText || '')
                }
                """,
                lambda value: str(value or "").encode("utf-8") == expected_markdown_bytes,
            )
            if imported.encode("utf-8") != expected_markdown_bytes:
                raise AssertionError("active Markdown bytes did not exactly match the public validation source")

            imported_identity = page.evaluate(
                """
                async () => {
                  const store = await import('/src/hooks/useGraphStore.ts')
                  const registry = await import('/src/features/workspace-fs/workspaceRunReadyDemos.ts')
                  const state = store.useGraphStore.getState()
                  return {
                    pathId: registry.resolveWorkspaceRunReadyDemoIdForDocumentPath(state.markdownDocumentName),
                    sourceId: registry.resolveWorkspaceRunReadyDemoIdForDocument(
                      state.markdownDocumentName,
                      state.markdownDocumentText,
                    ),
                  }
                }
                """
            )
            if imported_identity != {"pathId": "", "sourceId": "xr-physics"}:
                raise AssertionError(f"imported source identity was not frontmatter-owned: {imported_identity}")
            product_document_url = page.evaluate(
                """
                async targetUrl => {
                  const docs = await import('/src/features/canvas/canvasDocDeepLink.ts')
                  const link = docs.parseDocDeepLink(new URL(targetUrl).search)
                  if (!link || link.kind === 'local') return ''
                  return link.kind === 'default-remote'
                    ? docs.buildDefaultDocViewUrl(link.canonicalPath)
                    : docs.buildDocViewUrl(link.workspaceId, link.canonicalPath)
                }
                """,
                target_url,
            )
            if not product_document_url or normalized_origin(product_document_url) != supplied_origin:
                raise AssertionError("product deep-link owner did not resolve the supplied document origin")

            expect(motion_panel).to_be_visible(timeout=120_000)
            expect(xr_hud).to_be_visible(timeout=120_000)
            expect(xr_hud).to_have_attribute("data-kg-xr-playground-phase", "running")

            rocket = page.locator('[data-kg-xr-playground-select="rocket"]').first
            expect(rocket).to_be_visible()
            rocket.click()
            expect(xr_hud).to_have_attribute("data-kg-xr-playground-mode", "rocket")
            page.wait_for_timeout(250)

            initial_canvas = page.evaluate(
                """
                () => {
                  const canvases = Array.from(document.querySelectorAll('[data-kg-xr-scene-media-drop="1"] canvas'))
                  if (canvases.length !== 1) return { count: canvases.length, stored: false }
                  window.__kgGameModeXrShareCanvas = canvases[0]
                  return { count: 1, stored: true }
                }
                """
            )
            if initial_canvas != {"count": 1, "stored": True}:
                raise AssertionError(f"initial XR renderer did not expose exactly one canvas: {initial_canvas}")
            initial_scene = read_scene_contract(page)
            assert_scene_contract(initial_scene, game_active=False)

            initial_xr = read_xr_state(page)
            if initial_xr["snapshot"]["phase"] != "running" or initial_xr["snapshot"]["mode"] != "rocket":
                raise AssertionError(f"initial XR controller was not running in rocket mode: {initial_xr['snapshot']}")

            panel_scene_continuity = verify_panel_scene_continuity(page, initial_scene)
            motion_trigger = page.locator(
                '[data-kg-floating-panel-view-trigger="motionControl"]'
            ).first
            motion_trigger.click()
            expect(motion_panel).to_be_visible(timeout=30_000)
            assert_stable_renderer_canvas(page)

            open_game = page.locator('[data-kg-motion-control-open-target="game-mode"]').first
            expect(open_game).to_be_attached()
            open_game.scroll_into_view_if_needed()
            open_game.click()

            game_panel = page.locator('[data-kg-game-mode-floating-panel="1"]').first
            expect(game_panel).to_be_visible(timeout=30_000)
            expect(game_panel).to_have_attribute("data-kg-game-mode-active", "1")
            expect(page.locator('[data-kg-game-mode-surface="xr"]')).to_have_count(1)
            expect(page.locator('[data-kg-xr-playground-hud="1"]')).to_have_count(0)

            paused_xr = poll_evaluate(
                page,
                """
                async () => {
                  const runtime = await import('/src/features/three/xrNativeControllerDemoRuntime.ts')
                  return {
                    snapshot: runtime.readXrNativeControllerDemo(),
                    frame: runtime.readSharedXrNativeControllerDemoFrame(),
                  }
                }
                """,
                lambda value: value["snapshot"]["phase"] == "paused",
                timeout_ms=30_000,
            )
            if paused_xr["snapshot"]["mode"] != "rocket":
                raise AssertionError("Game Mode changed the selected XR controller mode")
            assert_stable_renderer_canvas(page)
            page.wait_for_timeout(350)
            paused_xr_later = read_xr_state(page)
            if paused_xr_later["snapshot"]["phase"] != "paused" or paused_xr_later["frame"] != paused_xr["frame"]:
                raise AssertionError("XR simulation progressed while Game Mode owned the shared Canvas")

            start_game = page.locator('[data-kg-game-mode-start="1"]').first
            expect(start_game).to_be_visible()
            start_game.click()
            expect(game_panel).to_have_attribute("data-kg-game-mode-phase", "playing", timeout=30_000)
            game_hud = page.locator('[data-kg-game-fps-hud="1"]').first
            expect(game_hud).to_have_attribute("data-kg-game-fps-phase", "playing", timeout=30_000)
            expect(page.locator('canvas[data-kg-game-fps-first-frame="1"]')).to_have_count(1, timeout=30_000)
            grounded_camera_fov = assert_game_mode_grounded_camera(page)
            expect(page.locator('[data-kg-game-fps-stage="active"]')).to_have_count(1)
            expect(page.locator('[data-kg-game-fps-stage="active"] canvas')).to_have_count(1)
            expect(page.locator('[data-kg-authored-xr-scene-retained="1"]')).to_have_count(1)
            expect(page.locator('[data-kg-game-mode-scene="xr-authored"]')).to_have_count(1)
            expect(game_hud).to_have_attribute("data-kg-game-fps-simulation", "ready")
            expect(game_hud).to_have_attribute("data-kg-game-fps-health", "100")
            expect(game_hud).to_have_attribute("data-kg-game-fps-tick", "0")
            expect(game_hud).to_have_attribute("data-kg-game-fps-pending-decisions", "0")
            if game_hud.get_attribute("data-kg-game-fps-runtime-error"):
                raise AssertionError("Game Mode HUD reported a runtime error")
            expect(page.locator('[data-kg-game-mode-runtime-error="1"]')).to_have_count(0)
            assert_stable_renderer_canvas(page)
            active_scene = read_scene_contract(page)
            assert_scene_contract(active_scene, game_active=True)
            assert_authored_scene_identity(initial_scene, active_scene, context="Game Mode")
            game_scene_delta = assert_game_scene_delta(
                initial_scene,
                active_scene,
                context="Game Mode activation",
            )

            page.wait_for_timeout(12_500)
            if (
                game_hud.get_attribute("data-kg-game-fps-simulation") != "ready"
                or game_hud.get_attribute("data-kg-game-fps-health") != "100"
                or game_hud.get_attribute("data-kg-game-fps-tick") != "0"
                or game_hud.get_attribute("data-kg-game-fps-pending-decisions") != "0"
            ):
                raise AssertionError("unattended Game Mode advanced before normalized player engagement")

            npc_rows = page.locator('[data-kg-game-mode-npc-scores="1"] > article')
            if npc_rows.count() != 4:
                raise AssertionError(f"expected four scored NPC rows, got {npc_rows.count()}")
            for row_text in npc_rows.all_inner_texts():
                if not all(action in row_text for action in ["hold", "alert", "engage", "flee"]):
                    raise AssertionError("NPC score row did not expose all four actions")

            web_mcp = page.evaluate(
                """
                async () => {
                  const tools = Array.from(navigator.modelContext?.tools || [])
                  const inspect = tools.find(tool => tool.name === 'agentic-graph.inspect_local_game_mode')
                  const control = tools.find(tool => tool.name === 'agentic-graph.control_local_game_mode')
                  if (!inspect || !control) return { registered: false }
                  const beforeStop = await inspect.execute()
                  const invalid = await control.execute({
                    invocation: '/game.mode @canvas @canvas #gameplay operation=start',
                  })
                  const stopped = await control.execute({ operation: 'stop' })
                  const strictStart = await control.execute({
                    invocation: '/game.mode @canvas #gameplay operation=start',
                  })
                  const engaged = await control.execute({ operation: 'fire' })
                  return { registered: true, beforeStop, invalid, stopped, strictStart, engaged }
                }
                """
            )
            if not web_mcp.get("registered"):
                raise AssertionError("Game Mode browser WebMCP tools were not registered")
            before_stop = web_mcp["beforeStop"]
            runtime = before_stop["runtime"]
            if (
                before_stop["schema"] != "agentic-graph-game-mode-mcp/v1"
                or before_stop["gameMode"]["surfaceMode"] != "xr"
                or before_stop["mission"]["phase"] != "playing"
                or runtime["webglSupported"] is not True
                or runtime["rendererOwner"] != "existing-r3f-canvas"
                or runtime["simulationOwner"] != "native-agentic-ecs"
                or runtime["persistenceOwner"] != "browser-local-workspace-fs"
                or runtime["npcActions"] != ["hold", "alert", "engage", "flee"]
                or runtime["hitscan"] != "normalized-slab-aabb"
                or "motion-control" not in runtime["controls"]
            ):
                raise AssertionError("Game Mode WebMCP inspection did not expose the runtime-ready contract")
            if web_mcp["invalid"].get("ok") is not False:
                raise AssertionError("Game Mode WebMCP accepted a duplicate binding token")
            if web_mcp["beforeStop"]["gameMode"]["simulationStatus"] != "ready":
                raise AssertionError("Game Mode did not remain ready before the first normalized input")

            mission_before_stop = before_stop["mission"]
            stopped_mission = web_mcp["stopped"]["game"]["mission"]
            resumed_mission = web_mcp["strictStart"]["game"]["mission"]
            if (
                web_mcp["stopped"].get("ok") is not True
                or stopped_mission["phase"] != "stopped"
                or stopped_mission["tick"] != mission_before_stop["tick"]
                or stopped_mission["player"] != mission_before_stop["player"]
            ):
                raise AssertionError("WebMCP stop did not preserve the current Game Mode mission state")
            if (
                web_mcp["strictStart"].get("ok") is not True
                or resumed_mission["phase"] != "playing"
                or resumed_mission["tick"] != mission_before_stop["tick"]
                or resumed_mission["player"] != mission_before_stop["player"]
            ):
                raise AssertionError("strict WebMCP start did not resume the stopped mission unchanged")
            if (
                web_mcp["engaged"].get("ok") is not True
                or web_mcp["engaged"]["game"]["gameMode"]["simulationStatus"] != "running"
            ):
                raise AssertionError("Game Mode WebMCP fire did not arm deterministic simulation")

            resumed_tick = resumed_mission["tick"]
            poll_evaluate(
                page,
                """
                async () => (await import('/src/features/game-fps/gameFpsRuntime.ts')).readGameFpsSnapshot().tick
                """,
                lambda value: int(value) > int(resumed_tick),
                timeout_ms=30_000,
            )
            expect(game_panel).to_have_attribute("data-kg-game-mode-phase", "playing")
            assert_stable_renderer_canvas(page)

            active_xr_later = read_xr_state(page)
            if active_xr_later["snapshot"]["phase"] != "paused" or active_xr_later["frame"] != paused_xr["frame"]:
                raise AssertionError("XR frame changed during Game Mode WebMCP lifecycle operations")

            page.screenshot(path=str(ACTIVE_SCREENSHOT_PATH), full_page=True)

            mission_before_companion = page.evaluate(
                """
                async () => (await import('/src/features/game-fps/gameFpsRuntime.ts')).readGameFpsSnapshot()
                """
            )
            motion_companion = page.locator('[data-kg-game-mode-open-companion="motion-control"]').first
            motion_companion.scroll_into_view_if_needed()
            motion_companion.click()
            expect(motion_panel).to_be_visible(timeout=30_000)
            game_target = page.locator('[data-kg-motion-control-target="game-mode"]').first
            expect(game_target).to_be_visible()
            companion_exit = page.evaluate(
                """
                async () => {
                  const gameMode = await import('/src/features/game-fps/gameModeRuntime.ts')
                  const game = await import('/src/features/game-fps/gameFpsRuntime.ts')
                  return { gameMode: gameMode.readGameModeSnapshot(), mission: game.readGameFpsSnapshot() }
                }
                """
            )
            if (
                companion_exit["gameMode"]["active"] is not False
                or companion_exit["mission"]["phase"] != "stopped"
                or companion_exit["mission"]["tick"] < mission_before_companion["tick"]
            ):
                raise AssertionError(
                    "Motion Control handoff did not stop the resumable Game Mode mission without rewinding: "
                    f"before={mission_before_companion}, after={companion_exit}"
                )
            expect(xr_hud).to_be_visible(timeout=30_000)
            expect(xr_hud).to_have_attribute("data-kg-xr-playground-phase", "running")
            motion_xr_started = read_xr_state(page)
            page.wait_for_timeout(350)
            companion_stable = page.evaluate(
                """
                async () => (await import('/src/features/game-fps/gameFpsRuntime.ts')).readGameFpsSnapshot()
                """
            )
            if companion_stable != companion_exit["mission"]:
                raise AssertionError("the stopped Game Mode mission changed while Motion Control owned the surface")
            motion_xr_later = poll_evaluate(
                page,
                """
                async () => {
                  const runtime = await import('/src/features/three/xrNativeControllerDemoRuntime.ts')
                  return {
                    snapshot: runtime.readXrNativeControllerDemo(),
                    frame: runtime.readSharedXrNativeControllerDemoFrame(),
                  }
                }
                """,
                lambda value: value["snapshot"]["phase"] == "running"
                and int(value["frame"]["stepCount"]) > int(motion_xr_started["frame"]["stepCount"]),
                timeout_ms=30_000,
            )
            reopen_game = page.locator('[data-kg-motion-control-open-target="game-mode"]').first
            reopen_game.click()
            expect(game_panel).to_be_visible(timeout=30_000)
            expect(game_panel).to_have_attribute("data-kg-game-mode-active", "1")
            expect(game_panel).to_have_attribute("data-kg-game-mode-phase", "stopped")
            reopened_mission = page.evaluate(
                """
                async () => (await import('/src/features/game-fps/gameFpsRuntime.ts')).readGameFpsSnapshot()
                """
            )
            if reopened_mission != companion_exit["mission"]:
                raise AssertionError("Motion Control did not reopen the same stopped Game Mode mission")
            assert_stable_renderer_canvas(page)

            final_paused_xr = read_xr_state(page)
            if (
                final_paused_xr["snapshot"]["phase"] != "paused"
                or int(final_paused_xr["frame"]["stepCount"]) < int(motion_xr_later["frame"]["stepCount"])
                or final_paused_xr["frame"]["mode"] != motion_xr_later["frame"]["mode"]
                or final_paused_xr["frame"]["objective"] != motion_xr_later["frame"]["objective"]
            ):
                raise AssertionError("reopened Game Mode did not pause the resumed XR owner in place")

            install_restored_frame_capture(page)
            exit_game = page.locator('[data-kg-game-mode-action="exit"]').first
            exit_game.scroll_into_view_if_needed()
            exit_game.click()
            expect(page.locator('[data-kg-game-mode-floating-panel="1"]')).to_have_count(0, timeout=30_000)
            exited_game_mode = poll_evaluate(
                page,
                """
                async () => (await import('/src/features/game-fps/gameModeRuntime.ts')).readGameModeSnapshot()
                """,
                lambda value: value["active"] is False,
                timeout_ms=30_000,
            )
            if exited_game_mode["launchStatus"] != "idle":
                raise AssertionError("Game Mode exit did not return the central launch owner to idle")
            expect(page.locator('[data-kg-game-fps-hud="1"]')).to_have_count(0, timeout=30_000)
            expect(xr_hud).to_be_visible(timeout=30_000)
            expect(xr_hud).to_have_attribute("data-kg-xr-playground-phase", "running")
            expect(xr_hud).to_have_attribute("data-kg-xr-playground-mode", "rocket")

            restored_frame = poll_evaluate(
                page,
                "() => window.__kgGameModeXrRestoredFrame || null",
                lambda value: isinstance(value, dict),
                timeout_ms=30_000,
            )
            if comparable_xr_frame(restored_frame) != comparable_xr_frame(final_paused_xr["frame"]):
                raise AssertionError("XR mode, objective, or body state was not restored exactly on Game Mode exit")
            assert_stable_renderer_canvas(page)
            restored_scene = read_scene_contract(page)
            assert_scene_contract(restored_scene, game_active=False)
            assert_authored_scene_identity(initial_scene, restored_scene, context="Game Mode exit")

            restored_step_count = int(restored_frame["stepCount"])
            progressed_frame = poll_evaluate(
                page,
                """
                async () => (await import('/src/features/three/xrNativeControllerDemoRuntime.ts')).readSharedXrNativeControllerDemoFrame()
                """,
                lambda value: int(value["stepCount"]) > restored_step_count,
                timeout_ms=30_000,
            )
            if progressed_frame["phase"] != "running" or progressed_frame["mode"] != restored_frame["mode"]:
                raise AssertionError("restored XR controller did not continue in its preserved mode")
            page.screenshot(path=str(RESTORED_SCREENSHOT_PATH), full_page=True)

            product_document_fetch_count = audit_request_origins(
                requests,
                base_url=BASE_URL,
                local_origin=local_origin,
                supplied_origin=supplied_origin,
                product_document_url=product_document_url,
            )
            if console_error_count or page_error_count or failed_response_count:
                raise AssertionError(
                    "browser errors were observed: "
                    f"console={console_error_count}, page={page_error_count}, responses={failed_response_count}"
                )

            evidence = build_browser_evidence(
                public_markdown_bytes=len(expected_markdown_bytes),
                panel_scene_continuity=panel_scene_continuity,
                game_scene_delta=game_scene_delta,
                grounded_camera_fov=grounded_camera_fov,
                restored_frame=restored_frame,
                progressed_frame=progressed_frame,
                restored_step_count=restored_step_count,
                product_document_fetch_count=product_document_fetch_count,
                console_error_count=console_error_count,
                page_error_count=page_error_count,
                failed_response_count=failed_response_count,
                active_screenshot_name=ACTIVE_SCREENSHOT_PATH.name,
                restored_screenshot_name=RESTORED_SCREENSHOT_PATH.name,
            )
            EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
            print("OK game-mode-xr-share-browser-smoke")
            print(f"Evidence: {EVIDENCE_PATH}")
            print(f"Active screenshot: {ACTIVE_SCREENSHOT_PATH}")
            print(f"Restored screenshot: {RESTORED_SCREENSHOT_PATH}")
        finally:
            try:
                page.evaluate("() => window.__kgGameModeXrRestoredFrameCancel?.()")
            except Exception:
                pass
            browser.close()


if __name__ == "__main__":
    main()
