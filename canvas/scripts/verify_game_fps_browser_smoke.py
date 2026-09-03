from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

from lib.game_mode_xr_share_scene_contract import (
    assert_game_overlay_subtree,
    assert_game_scene_delta,
    assert_scene_contract,
    read_scene_contract,
)


BASE_URL = os.environ.get("AG_GAME_FPS_SMOKE_BASE_URL", "http://localhost:4185").rstrip("/")
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
SCREENSHOT_PATH = OUTPUT_DIR / "game-fps-browser-smoke.png"
EVIDENCE_PATH = OUTPUT_DIR / "game-fps-browser-smoke.json"
PHYSICS_REQUIRED_SCENE_NODES = {
    "kg_graph_xr_stage",
    "kg_xr_native_controller_demo",
    "kg_xr_stage_preset_singapore",
    "kg_xr_playground_treasure",
}
FORBIDDEN_STANDALONE_SCENE_NAMES = {
    "kg_game_fps_arena",
    "kg_game_fps_environment",
}


def numeric_attribute(locator, name: str) -> float:
    value = locator.get_attribute(name)
    if value is None:
        raise AssertionError(f"missing {name}")
    return float(value)


def local_chromium_executable() -> str | None:
    explicit = os.environ.get("AG_GAME_FPS_CHROMIUM_EXECUTABLE", "").strip()
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


def assert_no_standalone_scene_nodes(scene: dict[str, object]) -> None:
    names = set(scene.get("names") or [])
    forbidden = sorted(
        name
        for name in names
        if name in FORBIDDEN_STANDALONE_SCENE_NAMES
        or name.startswith("kg_xr_empty_world")
    )
    if forbidden:
        raise AssertionError(f"standalone/fallback scene nodes were present: {forbidden}")


def wait_for_xr_physics_scene(page) -> dict[str, object]:
    expect(page.locator('[data-kg-xr-physics-run-ready="full-frame"]')).to_be_visible(
        timeout=120_000
    )
    expect(page.locator('[data-kg-xr-playground-hud="1"]')).to_have_attribute(
        "data-kg-xr-playground-phase", "running", timeout=120_000
    )
    scene: dict[str, object] = {"ready": False, "names": []}
    for _ in range(240):
        scene = read_scene_contract(page)
        names = set(scene.get("names") or [])
        if scene.get("ready") is True and PHYSICS_REQUIRED_SCENE_NODES <= names:
            break
        page.wait_for_timeout(500)
    assert_scene_contract(scene, game_active=False)
    assert_no_standalone_scene_nodes(scene)
    stale_game_mode = page.evaluate(
        """
        async () => {
          const mode = await import('/src/features/game-fps/gameModeRuntime.ts')
          return {
            active: mode.readGameModeSnapshot().active,
            hudCount: document.querySelectorAll('[data-kg-game-fps-hud="1"]').length,
          }
        }
        """
    )
    if stale_game_mode != {"active": False, "hudCount": 0}:
        raise AssertionError(
            f"Game Mode activated before an explicit invocation: {stale_game_mode}"
        )
    return scene


def activate_game_mode(page, *, expect_ready: bool = True) -> dict[str, object]:
    baseline_scene = wait_for_xr_physics_scene(page)
    result = page.evaluate(
        """
        async () => {
          const runtime = await import('/src/features/game-fps/gameModeMcpRuntime.ts')
          return runtime.controlLocalGameMode({
            invocation: '/game.mode @canvas #gameplay operation=start',
          })
        }
        """
    )
    launch_status = ((result or {}).get("game") or {}).get("gameMode", {}).get(
        "launchStatus"
    )
    if expect_ready and (result or {}).get("ok") is not True:
        raise AssertionError(f"explicit Game Mode invocation failed: {result}")
    if not expect_ready and launch_status not in {"ready", "error"}:
        raise AssertionError(
            f"explicit Game Mode invocation did not publish a terminal launch status: {result}"
        )
    return {"baselineScene": baseline_scene, "invocation": result}


def assert_game_fps_xr_scene(page, baseline_scene) -> dict[str, object]:
    renderer = page.evaluate(
        """
        () => {
          const roots = Array.from(document.querySelectorAll('[data-kg-xr-scene-media-drop="1"]'))
          const canvases = roots.flatMap(root => Array.from(root.querySelectorAll('canvas')))
          return { rootCount: roots.length, canvasCount: canvases.length }
        }
        """
    )
    if renderer != {"rootCount": 1, "canvasCount": 1}:
        raise AssertionError(f"Game FPS did not use exactly one authored XR Canvas: {renderer}")

    scene = read_scene_contract(page)
    assert_scene_contract(scene, game_active=True)
    assert_no_standalone_scene_nodes(scene)
    assert_game_overlay_subtree(scene)
    scene_delta = assert_game_scene_delta(
        baseline_scene,
        scene,
        context="explicit Game Mode browser-smoke activation",
    )
    return {
        "surface": "xr",
        "canvasCount": 1,
        "authoredXrSceneRetained": True,
        "gameMissionSubtreeActorsOnly": True,
        "standaloneSceneNodes": [],
        **scene_delta,
    }


def assert_game_fps_grounded_camera(page) -> float:
    canvas = page.locator('canvas[data-kg-game-fps-first-frame="1"]').first
    expect(canvas).to_have_attribute("data-kg-game-fps-grounded-camera", "1")
    fov = numeric_attribute(canvas, "data-kg-game-fps-camera-fov")
    if fov < 55 or fov > 65:
        raise AssertionError(f"Game Mode inherited non-grounded XR camera optics: fov={fov}")
    return fov


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target_url = f"{BASE_URL}/"
    local_origin = urlparse(BASE_URL).netloc
    requests: list[str] = []
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_responses: list[dict[str, object]] = []

    with sync_playwright() as playwright:
        executable = local_chromium_executable()
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=executable,
            args=["--enable-webgl", "--use-angle=swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("request", lambda request: requests.append(request.url))
        page.on(
            "response",
            lambda response: failed_responses.append(
                {"status": response.status, "url": response.url}
            )
            if response.status >= 400
            else None,
        )
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        try:
            page.goto(target_url, wait_until="domcontentloaded")
            activation = activate_game_mode(page)
            hud = page.locator('[data-kg-game-fps-hud="1"]').first
            expect(hud).to_be_visible(timeout=120_000)
            page.wait_for_selector('canvas[data-kg-game-fps-first-frame="1"]', timeout=120_000)
            grounded_camera_fov = assert_game_fps_grounded_camera(page)
            scene_evidence = assert_game_fps_xr_scene(page, activation["baselineScene"])

            initial_tick = numeric_attribute(hud, "data-kg-game-fps-tick")
            initial_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
            initial_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
            initial_ammo = numeric_attribute(hud, "data-kg-game-fps-ammo")
            expect(hud).to_have_attribute("data-kg-game-fps-enemies-alive", "4")

            page.keyboard.down("KeyW")
            page.wait_for_timeout(500)
            page.keyboard.up("KeyW")
            page.wait_for_timeout(150)
            moved_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
            moved_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
            if abs(moved_x - initial_x) < 0.001 and abs(moved_z - initial_z) < 0.001:
                raise AssertionError("W input did not move the player")
            page.wait_for_timeout(300)
            released_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
            released_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
            if abs(released_x - moved_x) > 0.02 or abs(released_z - moved_z) > 0.02:
                raise AssertionError("W key release did not neutralize desktop movement")
            page.keyboard.down("KeyW")
            page.wait_for_timeout(180)
            page.keyboard.up("KeyW")
            page.wait_for_timeout(100)
            second_cycle_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
            if abs(second_cycle_z - released_z) < 0.001:
                raise AssertionError("a second W cycle was no longer accepted after key release")

            webmcp = page.evaluate(
                """
                async () => {
                  const tools = Array.from(navigator.modelContext?.tools || [])
                  const inspect = tools.find(tool => tool.name === 'agentic-graph.inspect_local_game_mode')
                  const control = tools.find(tool => tool.name === 'agentic-graph.control_local_game_mode')
                  if (!inspect || !control) return { registered: false }
                  const snapshot = await inspect.execute()
                  const rejected = await control.execute({ invocation: '/game.mode @canvas @canvas #gameplay operation=open' })
                  return {
                    registered: true,
                    active: snapshot.gameMode.active,
                    phase: snapshot.mission.phase,
                    schema: snapshot.schema,
                    rejectedDuplicateBinding: rejected.ok === false,
                  }
                }
                """
            )
            if webmcp != {
                "registered": True,
                "active": True,
                "phase": "playing",
                "schema": "agentic-graph-game-mode-mcp/v1",
                "rejectedDuplicateBinding": True,
            }:
                raise AssertionError(f"Game Mode browser WebMCP was not runtime ready: {webmcp}")

            fire = page.locator('[data-kg-game-fps-action="fire"]').first
            expect(fire).to_be_visible()
            fire.click()
            page.wait_for_timeout(250)
            fired_ammo = numeric_attribute(hud, "data-kg-game-fps-ammo")
            if fired_ammo >= initial_ammo:
                raise AssertionError("fire did not consume ammunition in the next simulation tick")
            fire_result = hud.get_attribute("data-kg-game-fps-fire-result") or ""
            if fire_result not in {"hit", "miss"}:
                raise AssertionError(f"unexpected fire result {fire_result!r}")

            current_tick = numeric_attribute(hud, "data-kg-game-fps-tick")
            if current_tick <= initial_tick:
                raise AssertionError("simulation tick did not advance")

            page.set_viewport_size({"width": 390, "height": 844})
            touch_forward = page.locator('[data-kg-game-fps-touch="forward"]').first
            expect(touch_forward).to_be_visible()
            touch_before_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
            touch_before_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
            touch_session = page.context.new_cdp_session(page)
            touch_active = False
            try:
                touch_session.send(
                    "Emulation.setTouchEmulationEnabled",
                    {"enabled": True, "maxTouchPoints": 1},
                )
                page.wait_for_timeout(50)
                touch_box = touch_forward.bounding_box()
                if not touch_box:
                    raise AssertionError("touch forward control had no touchable bounds")
                touch_point = {
                    "x": touch_box["x"] + touch_box["width"] / 2,
                    "y": touch_box["y"] + touch_box["height"] / 2,
                    "radiusX": 4,
                    "radiusY": 4,
                    "force": 1,
                    "id": 41,
                }
                touch_session.send(
                    "Input.dispatchTouchEvent",
                    {"type": "touchStart", "touchPoints": [touch_point]},
                )
                touch_active = True
                touch_moved_x = touch_before_x
                touch_moved_z = touch_before_z
                for _ in range(12):
                    page.wait_for_timeout(25)
                    touch_moved_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
                    touch_moved_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
                    if abs(touch_moved_x - touch_before_x) >= 0.001 or abs(touch_moved_z - touch_before_z) >= 0.001:
                        break
                else:
                    raise AssertionError("touch forward input did not move the player")
                touch_session.send(
                    "Input.dispatchTouchEvent",
                    {"type": "touchEnd", "touchPoints": []},
                )
                touch_active = False
                page.wait_for_timeout(150)
                touch_released_x = numeric_attribute(hud, "data-kg-game-fps-player-x")
                touch_released_z = numeric_attribute(hud, "data-kg-game-fps-player-z")
                page.wait_for_timeout(250)
                if (
                    abs(numeric_attribute(hud, "data-kg-game-fps-player-x") - touch_released_x) > 0.02
                    or abs(numeric_attribute(hud, "data-kg-game-fps-player-z") - touch_released_z) > 0.02
                ):
                    raise AssertionError("touch release did not neutralize mobile movement")
            finally:
                if touch_active:
                    touch_session.send(
                        "Input.dispatchTouchEvent",
                        {"type": "touchEnd", "touchPoints": []},
                    )
                touch_session.send(
                    "Emulation.setTouchEmulationEnabled",
                    {"enabled": False},
                )
                touch_session.detach()

            restart = page.locator('[data-kg-game-fps-action="restart"]').first
            restart.click()
            expect(hud).to_have_attribute("data-kg-game-fps-tick", "0", timeout=30_000)
            completion = page.evaluate(
                """
                async () => {
                  const runtime = await import('/src/features/game-fps/gameFpsRuntime.ts')
                  const geometry = await import('/src/features/game-fps/gameFpsGeometry.ts')
                  const fixedStep = 1 / 60
                  const spatialMap = runtime.readGameFpsSpatialProfile().map
                  const visibleTarget = snapshot => snapshot.npcs
                    .filter(npc => npc.health > 0 && geometry.hasGameFpsLineOfSight(snapshot.player, npc, spatialMap))
                    .sort((left, right) => {
                      const leftDistance = Math.hypot(left.x - snapshot.player.x, left.z - snapshot.player.z)
                      const rightDistance = Math.hypot(right.x - snapshot.player.x, right.z - snapshot.player.z)
                      return leftDistance - rightDistance || left.id.localeCompare(right.id)
                    })[0]
                  let reloadObserved = false
                  let occlusionWaitCount = 0
                  for (let iteration = 0; iteration < 80; iteration += 1) {
                    let before = runtime.readGameFpsSnapshot()
                    if (before.phase !== 'playing') break
                    if (before.ammo === 0) {
                      reloadObserved = true
                      runtime.reloadGameFpsWeapon()
                      await runtime.advanceGameFpsBy(fixedStep)
                      before = runtime.readGameFpsSnapshot()
                    }
                    const target = visibleTarget(before)
                    if (!target) {
                      occlusionWaitCount += 1
                      await runtime.advanceGameFpsBy(0.2)
                      continue
                    }
                    const deltaX = target.x - before.player.x
                    const deltaZ = target.z - before.player.z
                    const horizontalDistance = Math.hypot(deltaX, deltaZ)
                    runtime.setGameFpsInput({
                      lookYawDelta: Math.atan2(-deltaX, -deltaZ) - before.player.yaw,
                      lookPitchDelta: Math.atan2(1.1 - 1.6, horizontalDistance) - before.player.pitch,
                    })
                    runtime.queueGameFpsFire()
                    const after = await runtime.advanceGameFpsBy(fixedStep)
                    if (!['hit', 'eliminated'].includes(after.fireResult)) {
                      throw new Error(`unexpected browser fire result ${after.fireResult}`)
                    }
                    if (after.phase === 'playing') await runtime.advanceGameFpsBy(0.2)
                  }
                  const completed = runtime.readGameFpsSnapshot()
                  return {
                    phase: completed.phase,
                    enemiesAlive: completed.enemiesAlive,
                    pendingDecisionCount: completed.pendingDecisions.length,
                    reloadObserved,
                    occlusionWaitCount,
                  }
                }
                """
            )
            if completion["phase"] != "won" or completion["enemiesAlive"] != 0:
                raise AssertionError(f"mission did not complete in browser: {completion}")
            if not completion["reloadObserved"]:
                raise AssertionError("browser completion did not exercise reload")
            expect(hud).to_have_attribute("data-kg-game-fps-phase", "won", timeout=10_000)
            save_decisions = page.locator('[data-kg-game-fps-action="save"]').first
            expect(save_decisions).to_be_visible(timeout=10_000)
            save_decisions.click()
            expect(hud).to_have_attribute("data-kg-game-fps-save-status", "saved", timeout=10_000)
            saved = page.evaluate(
                """
                async () => {
                  const store = await import('/src/features/game-fps/gameFpsDecisionStore.ts')
                  const decisions = await store.loadGameFpsSavedDecisions()
                  return {
                    count: decisions.length,
                    path: store.GAME_FPS_SAVE_PATH,
                    status: store.readGameFpsDecisionStore().status,
                  }
                }
                """
            )
            if saved["count"] <= 0 or saved["path"] != "/game-fps/mission-1-decisions.md":
                raise AssertionError(f"browser Decisions save was not readable: {saved}")

            page.reload(wait_until="domcontentloaded")
            activate_game_mode(page)
            hud = page.locator('[data-kg-game-fps-hud="1"]').first
            expect(hud).to_be_visible(timeout=120_000)
            page.wait_for_selector('canvas[data-kg-game-fps-first-frame="1"]', timeout=120_000)
            expect(hud).to_have_attribute("data-kg-game-fps-phase", "won", timeout=10_000)
            restored_phase = hud.get_attribute("data-kg-game-fps-phase")

            malformed_save = "---\ntitle: Malformed Game FPS Save\nflow:\n  nodes: [\n---\n"
            page.evaluate(
                """
                async malformed => {
                  const workspaceModule = await import('/src/features/workspace-fs/workspaceFs.ts')
                  const store = await import('/src/features/game-fps/gameFpsDecisionStore.ts')
                  const workspace = await workspaceModule.getWorkspaceFs()
                  await workspace.writeFileText(store.GAME_FPS_SAVE_PATH, malformed)
                }
                """,
                malformed_save,
            )
            page.reload(wait_until="domcontentloaded")
            activate_game_mode(page, expect_ready=False)
            hud = page.locator('[data-kg-game-fps-hud="1"]').first
            expect(hud).to_be_visible(timeout=120_000)
            expect(hud).to_have_attribute("data-kg-game-fps-save-status", "error", timeout=10_000)
            save_error = hud.get_attribute("data-kg-game-fps-save-error") or ""
            if "/game-fps/mission-1-decisions.md" not in save_error:
                raise AssertionError(f"malformed save error did not name the local path: {save_error}")
            expect(hud.get_by_role("alert")).to_contain_text("/game-fps/mission-1-decisions.md")
            reset_save = page.locator('[data-kg-game-fps-action="reset-save"]').first
            expect(reset_save).to_be_visible()
            expect(page.locator('[data-kg-game-fps-action="retry-save"]')).to_have_count(0)
            preserved = page.evaluate(
                """
                async () => {
                  const workspaceModule = await import('/src/features/workspace-fs/workspaceFs.ts')
                  const store = await import('/src/features/game-fps/gameFpsDecisionStore.ts')
                  const workspace = await workspaceModule.getWorkspaceFs()
                  return workspace.readFileText(store.GAME_FPS_SAVE_PATH)
                }
                """
            )
            if preserved != malformed_save:
                raise AssertionError("malformed browser save bytes changed before explicit reset")
            reset_save.click()
            expect(hud).to_have_attribute("data-kg-game-fps-save-status", "saved", timeout=10_000)
            expect(hud).to_have_attribute("data-kg-game-fps-phase", "playing", timeout=10_000)
            expect(hud).to_have_attribute("data-kg-game-fps-enemies-alive", "4")

            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            non_local = sorted(
                {
                    request
                    for request in requests
                    if urlparse(request).netloc and urlparse(request).netloc != local_origin
                }
            )
            local_runtime_requests = sorted(
                {
                    urlparse(request).path
                    for request in requests
                    if urlparse(request).netloc == local_origin
                    and urlparse(request).path.startswith("/__")
                }
            )
            if non_local:
                raise AssertionError(f"runtime made non-local requests: {non_local}")
            if "/__kg_fs_list" in local_runtime_requests:
                raise AssertionError("Game FPS bootstrap scanned the unrelated docs mirror")
            if console_errors or page_errors or failed_responses:
                raise AssertionError(
                    "browser errors: "
                    f"console={console_errors}, page={page_errors}, responses={failed_responses}"
                )

            evidence = {
                "targetUrl": target_url,
                "viewport": {"width": 390, "height": 844},
                "firstFrame": True,
                "activation": {
                    "source": "xr-physics",
                    "invocation": "/game.mode @canvas #gameplay operation=start",
                    "automaticGameModeBeforeInvocation": False,
                },
                "renderer": scene_evidence,
                "groundedCamera": {"fov": grounded_camera_fov},
                "movement": {"from": [initial_x, initial_z], "to": [moved_x, moved_z]},
                "desktopRelease": {
                    "releasedAt": [released_x, released_z],
                    "secondCycleZ": second_cycle_z,
                },
                "webMcp": webmcp,
                "fire": {"ammoBefore": initial_ammo, "ammoAfter": fired_ammo, "result": fire_result},
                "tick": {"before": initial_tick, "after": current_tick},
                "completion": completion,
                "save": saved,
                "reload": {"restoredPhase": restored_phase},
                "malformedSave": {
                    "error": save_error,
                    "preservedBeforeReset": preserved == malformed_save,
                    "retryHidden": True,
                    "resetPhase": hud.get_attribute("data-kg-game-fps-phase"),
                    "resetSaveStatus": hud.get_attribute("data-kg-game-fps-save-status"),
                },
                "nonLocalRequests": non_local,
                "localRuntimeRequestPaths": local_runtime_requests,
                "consoleErrors": console_errors,
                "pageErrors": page_errors,
                "failedResponses": failed_responses,
                "screenshot": str(SCREENSHOT_PATH),
            }
            EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
            print(f"OK game-fps-browser-smoke {target_url}")
            print(f"Evidence: {EVIDENCE_PATH}")
            print(f"Screenshot: {SCREENSHOT_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
