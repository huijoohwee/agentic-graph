from __future__ import annotations

import json
import math
import os
from pathlib import Path
import subprocess

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright
from PIL import Image


BASE_URL = os.environ.get("AG_RICH_MEDIA_SMOKE_BASE_URL", "http://localhost:4175").rstrip("/")
TARGET_URL = f"{BASE_URL}/__smoke__/rich-media"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
SCREENSHOT_PATH = OUTPUT_DIR / "rich-media-browser-smoke.png"
CATALOG_PREVIEW_SCREENSHOT_PATH = OUTPUT_DIR / "rich-media-catalog-preview-browser-smoke.png"
CATALOG_PREVIEW_TIMING_PATH = OUTPUT_DIR / "rich-media-catalog-preview-timing.json"
CATALOG_PREVIEW_TIMING_SCHEMA = "rich-media-catalog-preview-timing/v1"
CATALOG_PREVIEW_TIMING_VALIDATOR_PATH = (
    Path(__file__).resolve().parent / "validate_rich_media_catalog_preview_timing.mjs"
)
FIXTURE_MANIFEST_PATH = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "features"
    / "testing"
    / "richMediaBrowserSmokeFixtures.json"
)
CATALOG_VIDEO_FIXTURE = json.loads(FIXTURE_MANIFEST_PATH.read_text(encoding="utf-8"))["catalogVideo"]
CATALOG_PREVIEW_READY_BUDGET_MS = max(
    1,
    int(os.environ.get("AG_MEDIA_PREVIEW_READY_BUDGET_MS", "500")),
)
ASYNC_SURFACE_READY_TIMEOUT_MS = 15_000


def assert_canvas_has_visual_content(canvas, artifact_name: str) -> None:
    artifact_path = OUTPUT_DIR / artifact_name
    canvas.screenshot(path=str(artifact_path))
    with Image.open(artifact_path).convert("RGB") as image:
        channel_spread = [high - low for low, high in image.getextrema()]
    if max(channel_spread) < 16:
        raise AssertionError(f"expected rendered WebGL content in {artifact_name}, got channel spread {channel_spread}")


def install_window_open_probe(page) -> None:
    page.evaluate(
        """
        () => {
          window.__kgRichMediaSmokeOpened = []
          window.open = (...args) => {
            window.__kgRichMediaSmokeOpened.push(String(args[0] || ''))
            return null
          }
        }
        """
    )


def install_fullscreen_probe(page) -> None:
    page.evaluate(
        """
        () => {
          let fullscreenTarget = null
          Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => fullscreenTarget,
          })
          HTMLElement.prototype.requestFullscreen = function () {
            fullscreenTarget = this
            document.dispatchEvent(new Event('fullscreenchange'))
            return Promise.resolve()
          }
          document.exitFullscreen = function () {
            fullscreenTarget = null
            document.dispatchEvent(new Event('fullscreenchange'))
            return Promise.resolve()
          }
        }
        """
    )


def click_panel_inset(page, panel_selector: str, target_selector: str, *, inset_x: float = 24, inset_y: float = 24) -> None:
    panel = page.locator(panel_selector).first
    target = page.locator(f"{panel_selector} {target_selector}").first
    expect(panel).to_be_visible()
    expect(target).to_be_visible()
    panel.scroll_into_view_if_needed()
    box = target.bounding_box()
    if not box:
        raise AssertionError(f"expected bounding box for {panel_selector} {target_selector}")
    target.click(
        position={
            "x": min(inset_x, max(8.0, box["width"] - 8.0)),
            "y": min(inset_y, max(8.0, box["height"] - 8.0)),
        }
    )


def open_text_edit_input(page):
    panel_selector = '[data-kg-smoke-panel="text-edit"]'
    display = page.locator(f'{panel_selector} [data-kg-card-inline-edit="1"]').first
    input_locator = page.locator(f'{panel_selector} [data-kg-card-inline-edit-input="1"]').first
    expect(display).to_be_visible()

    activation_steps = (
        lambda: display.click(timeout=5000),
        lambda: display.dblclick(timeout=5000),
        lambda: display.focus(),
    )
    for activate in activation_steps:
        try:
            activate()
            if activate == activation_steps[-1]:
                page.keyboard.press("Enter")
            input_locator.wait_for(state="visible", timeout=5000)
            return input_locator
        except PlaywrightTimeoutError:
            continue

    raise AssertionError("expected rich media text edit panel to reveal the inline editor surface")


def assert_catalog_preview_parent_placement(page, kind: str) -> None:
    page.locator(f'[data-kg-smoke-open-{kind}-preview="1"]').click()
    preview = page.locator(f'[data-kg-media-catalog-preview-kind="{kind}"]').first
    active_item = preview.locator('[data-kg-media-catalog-preview-item-active="1"]').first
    panel = active_item.locator('[data-kg-rich-media-panel="1"]').first
    media = active_item.locator("video" if kind == "video" else "img").first
    expect(preview).to_be_visible()
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-placement", "legacy-lightbox")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-preload-count", "1")
    expect(preview).to_have_attribute(
        "data-kg-media-catalog-preview-preload-kinds", "video" if kind == "image" else "image"
    )
    expect(preview.locator('[data-kg-media-catalog-preview-preload="1"]')).to_have_count(1)
    expect(panel).to_be_visible()
    expect(panel).to_have_attribute("data-kg-overlay-placement-owner", "parent")
    expect(media).to_be_visible()
    panel_box = panel.bounding_box()
    media_box = media.bounding_box()
    if not panel_box or panel_box["width"] < 900 or panel_box["height"] < 600:
        raise AssertionError(f"expected {kind} Rich Media Panel to reuse the previous lightbox size, got {panel_box}")
    if not media_box or media_box["width"] < 840 or media_box["height"] < 520:
        raise AssertionError(f"expected {kind} media to fill the shared Rich Media Panel, got {media_box}")
    expect(page.locator('[data-kg-media-lightbox="1"]')).to_have_count(0)
    fullscreen_button = preview.locator('[data-kg-media-catalog-preview-fullscreen="1"]')
    expect(fullscreen_button).to_be_visible()
    expect(fullscreen_button).to_have_attribute("aria-label", "Enter fullscreen")
    expect(fullscreen_button).to_have_attribute("aria-pressed", "false")
    fullscreen_button.click()
    expect(fullscreen_button).to_have_attribute("aria-label", "Exit fullscreen")
    expect(fullscreen_button).to_have_attribute("aria-pressed", "true")
    if page.evaluate("() => document.fullscreenElement?.getAttribute('data-kg-media-catalog-preview')") != "1":
        raise AssertionError(f"expected {kind} fullscreen action to target the expanded Rich Media Panel preview")
    fullscreen_button.click()
    expect(fullscreen_button).to_have_attribute("aria-label", "Enter fullscreen")
    expect(fullscreen_button).to_have_attribute("aria-pressed", "false")
    if page.evaluate("() => document.fullscreenElement") is not None:
        raise AssertionError(f"expected {kind} fullscreen exit action to clear the fullscreen target")
    if kind == "video":
        preview.screenshot(path=str(CATALOG_PREVIEW_SCREENSHOT_PATH))
    preview.locator('[data-kg-media-catalog-preview-close="1"]').click()
    expect(preview).to_have_count(0)
    expect(page.locator('[data-kg-media-catalog-preview-preload="1"]')).to_have_count(0)


def wait_for_image_ready(page, image, timeout_ms: int) -> None:
    element = image.element_handle()
    if element is None:
        raise AssertionError("expected image element for media-ready timing")
    try:
        page.wait_for_function(
            "element => element.complete && element.naturalWidth > 0",
            arg=element,
            timeout=timeout_ms,
        )
    except PlaywrightTimeoutError as error:
        state = image.evaluate(
            "element => ({ complete: element.complete, connected: element.isConnected, naturalWidth: element.naturalWidth, src: element.currentSrc || element.src })"
        )
        raise AssertionError(f"expected image ready within {timeout_ms}ms, got {state}") from error


def wait_for_video_metadata(page, video, timeout_ms: int) -> None:
    element = video.element_handle()
    if element is None:
        raise AssertionError("expected video element for media-ready timing")
    try:
        page.wait_for_function(
            "element => element.readyState >= element.HAVE_METADATA",
            arg=element,
            timeout=timeout_ms,
        )
    except PlaywrightTimeoutError as error:
        state = video.evaluate(
            "element => ({ connected: element.isConnected, errorCode: element.error?.code || null, networkState: element.networkState, readyState: element.readyState, src: element.currentSrc || element.src })"
        )
        raise AssertionError(f"expected video metadata ready within {timeout_ms}ms, got {state}") from error


def assert_video_metadata_identity(video, label: str) -> dict[str, float]:
    metadata = video.evaluate(
        "element => ({ durationSeconds: element.duration, height: element.videoHeight, width: element.videoWidth })"
    )
    duration_seconds = float(metadata["durationSeconds"])
    expected_duration_seconds = float(CATALOG_VIDEO_FIXTURE["durationSeconds"])
    duration_tolerance_seconds = float(CATALOG_VIDEO_FIXTURE["durationToleranceSeconds"])
    expected_width = int(CATALOG_VIDEO_FIXTURE["width"])
    expected_height = int(CATALOG_VIDEO_FIXTURE["height"])
    if int(metadata["width"]) != expected_width or int(metadata["height"]) != expected_height:
        raise AssertionError(
            f"expected {label} dimensions {expected_width}x{expected_height}, "
            f"got {metadata['width']}x{metadata['height']}"
        )
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise AssertionError(f"expected {label} finite positive duration, got {duration_seconds}")
    if abs(duration_seconds - expected_duration_seconds) > duration_tolerance_seconds:
        raise AssertionError(
            f"expected {label} duration {expected_duration_seconds:.3f}s +/- {duration_tolerance_seconds:.3f}s, "
            f"got {duration_seconds:.3f}s"
        )
    return {
        "durationSeconds": round(duration_seconds, 6),
        "height": int(metadata["height"]),
        "width": int(metadata["width"]),
    }


def arm_catalog_preview_promotion_timing(preview, target_id: str, button_selector: str, kind: str) -> None:
    preview.evaluate(
        """
        (element, args) => {
          const target = element.querySelector(`[data-kg-media-catalog-preview-deck-item="${args.targetId}"]`)
          const button = element.querySelector(args.buttonSelector)
          const media = target?.querySelector(args.kind === 'video' ? 'video' : 'img')
          if (!(target instanceof HTMLElement) || !(button instanceof HTMLButtonElement) || !media) {
            throw new Error(`cannot arm ${args.kind} preview promotion timing`)
          }
          window.__kgMediaPromotion = null
          let clickedAt = -1
          button.addEventListener('click', () => {
            clickedAt = performance.now()
          }, { capture: true, once: true })
          const observer = new MutationObserver(() => {
            if (clickedAt < 0 || target.getAttribute('data-kg-media-catalog-preview-item-active') !== '1') return
            const promotedMedia = target.querySelector(args.kind === 'video' ? 'video' : 'img')
            window.__kgMediaPromotion = {
              complete: args.kind === 'image' ? promotedMedia?.complete === true : undefined,
              elapsedMs: performance.now() - clickedAt,
              haveMetadata: args.kind === 'video' ? promotedMedia?.HAVE_METADATA : undefined,
              naturalWidth: args.kind === 'image' ? promotedMedia?.naturalWidth : undefined,
              readyState: args.kind === 'video' ? promotedMedia?.readyState : undefined,
              sameNode: promotedMedia === media,
            }
            observer.disconnect()
          })
          observer.observe(target, {
            attributes: true,
            attributeFilter: ['data-kg-media-catalog-preview-item-active'],
          })
        }
        """,
        {"buttonSelector": button_selector, "kind": kind, "targetId": target_id},
    )


def read_catalog_preview_promotion_timing(page, kind: str) -> float:
    page.wait_for_function("() => window.__kgMediaPromotion !== null", timeout=5000)
    result = page.evaluate("() => window.__kgMediaPromotion")
    if not isinstance(result, dict) or result.get("sameNode") is not True:
        raise AssertionError(f"expected {kind} promotion to preserve the preloaded DOM node, got {result}")
    if kind == "video":
        if int(result.get("readyState") or 0) < int(result.get("haveMetadata") or 1):
            raise AssertionError(f"expected promoted video metadata to remain ready, got {result}")
    elif result.get("complete") is not True or int(result.get("naturalWidth") or 0) <= 0:
        raise AssertionError(f"expected promoted image pixels to remain ready, got {result}")
    elapsed_ms = float(result.get("elapsedMs") or 0)
    if elapsed_ms > CATALOG_PREVIEW_READY_BUDGET_MS:
        raise AssertionError(
            f"expected preloaded {kind} promotion within {CATALOG_PREVIEW_READY_BUDGET_MS}ms, got {elapsed_ms:.1f}ms"
        )
    return elapsed_ms


def assert_catalog_preview_arrow_navigation(page) -> dict[str, object]:
    cold_started_at = float(page.evaluate("() => performance.now()"))
    page.locator('[data-kg-smoke-open-image-preview="1"]').click()
    preview = page.locator('[data-kg-media-catalog-preview="1"]').first
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "image")
    visible_image = preview.locator('[data-kg-media-catalog-preview-item-active="1"] img').first
    wait_for_image_ready(page, visible_image, 5000)
    cold_ready_ms = float(page.evaluate("startedAt => performance.now() - startedAt", cold_started_at))
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-count", "2")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-touch-navigation", "horizontal-swipe")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-preload-count", "1")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-preload-kinds", "video")
    preloaded_video = preview.locator('[data-kg-media-catalog-preview-preload-kind="video"] video').first
    wait_for_video_metadata(page, preloaded_video, 5000)
    preload_state = preloaded_video.evaluate(
        "element => ({ autoplay: element.autoplay, loop: element.loop, preload: element.preload })"
    )
    if preload_state != {"autoplay": False, "loop": False, "preload": "metadata"}:
        raise AssertionError(f"expected adjacent video to remain metadata-only, got {preload_state}")
    preloaded_video_metadata = assert_video_metadata_identity(preloaded_video, "preloaded video")

    previous_button = preview.locator('[data-kg-media-catalog-preview-previous="1"]')
    next_button = preview.locator('[data-kg-media-catalog-preview-next="1"]')
    expect(previous_button).to_be_visible()
    expect(next_button).to_be_visible()
    arm_catalog_preview_promotion_timing(
        preview,
        "smoke-video",
        '[data-kg-media-catalog-preview-next="1"]',
        "video",
    )
    next_button.click()
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "video")
    visible_video = preview.locator('[data-kg-media-catalog-preview-item-active="1"] video').first
    video_ready_ms = read_catalog_preview_promotion_timing(page, "video")
    visible_video_metadata = assert_video_metadata_identity(visible_video, "visible video")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-preload-kinds", "image")
    preloaded_image = preview.locator('[data-kg-media-catalog-preview-preload-kind="image"] img').first
    wait_for_image_ready(page, preloaded_image, 5000)
    arm_catalog_preview_promotion_timing(
        preview,
        "smoke-image",
        '[data-kg-media-catalog-preview-previous="1"]',
        "image",
    )
    previous_button.click()
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "image")
    preloaded_ready_ms = read_catalog_preview_promotion_timing(page, "image")
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-preload-kinds", "video")

    def swipe(start_x: int, start_y: int, end_x: int, end_y: int) -> None:
        preview.evaluate(
            """
            (element, points) => {
              const dispatch = (type, x, y, field) => {
                const event = new Event(type, { bubbles: true, cancelable: true })
                Object.defineProperty(event, field, { value: [{ clientX: x, clientY: y }] })
                element.dispatchEvent(event)
              }
              dispatch('touchstart', points.startX, points.startY, 'touches')
              dispatch('touchend', points.endX, points.endY, 'changedTouches')
            }
            """,
            {"startX": start_x, "startY": start_y, "endX": end_x, "endY": end_y},
        )

    swipe(700, 300, 300, 310)
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "video")
    swipe(300, 300, 700, 310)
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "image")
    swipe(500, 200, 510, 500)
    expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", "image")

    for key, expected_kind in (
        ("ArrowRight", "video"),
        ("ArrowDown", "image"),
        ("ArrowLeft", "video"),
        ("ArrowUp", "image"),
    ):
        page.keyboard.press(key)
        expect(preview).to_have_attribute("data-kg-media-catalog-preview-kind", expected_kind)
        expect(preview.locator(f'[data-kg-media-catalog-preview-item-active="1"] {"video" if expected_kind == "video" else "img"}').first).to_be_visible()

    preview.locator('[data-kg-media-catalog-preview-close="1"]').click()
    expect(preview).to_have_count(0)
    expect(page.locator('[data-kg-media-catalog-preview-preload="1"]')).to_have_count(0)
    return {
        "budgetMs": float(CATALOG_PREVIEW_READY_BUDGET_MS),
        "fixture": {
            "path": CATALOG_VIDEO_FIXTURE["path"],
            "sha256": CATALOG_VIDEO_FIXTURE["sha256"],
            "sizeBytes": CATALOG_VIDEO_FIXTURE["sizeBytes"],
        },
        "image": {
            "criterion": "complete && naturalWidth > 0",
            "coldOpenReadyMs": round(cold_ready_ms, 3),
            "preloadedTransitionReadyMs": round(preloaded_ready_ms, 3),
        },
        "video": {
            "criterion": "readyState >= HAVE_METADATA",
            "metadata": {
                "expected": {
                    "durationSeconds": CATALOG_VIDEO_FIXTURE["durationSeconds"],
                    "durationToleranceSeconds": CATALOG_VIDEO_FIXTURE["durationToleranceSeconds"],
                    "height": CATALOG_VIDEO_FIXTURE["height"],
                    "width": CATALOG_VIDEO_FIXTURE["width"],
                },
                "preloaded": preloaded_video_metadata,
                "visible": visible_video_metadata,
            },
            "preloadedTransitionReadyMs": round(video_ready_ms, 3),
        },
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 2200})
        try:
            page.goto(TARGET_URL, wait_until="domcontentloaded")
            page.wait_for_selector('[data-kg-rich-media-smoke-page="1"]')
            install_window_open_probe(page)
            install_fullscreen_probe(page)

            preview_surface = page.locator(
                '[data-kg-smoke-panel="text-preview"] [data-kg-rich-media-markdown-preview="1"]'
            ).first
            expect(preview_surface).to_be_visible()
            expect(page.locator('[data-kg-smoke-panel="text-preview"] table')).to_have_count(
                1,
                timeout=ASYNC_SURFACE_READY_TIMEOUT_MS,
            )

            edit_input = open_text_edit_input(page)
            edit_input.fill("## Browser updated\n\nRuntime edit OK.")
            page.locator("body").click(position={"x": 8, "y": 8})
            expect(page.locator('[data-kg-smoke-edit-value="1"]')).to_contain_text("Browser updated")

            expect(page.locator('[data-kg-smoke-panel="iframe-srcdoc"] [data-kg-rich-media-embedded-preview="1"]')).to_be_visible()
            expect(
                page.frame_locator('[data-kg-smoke-panel="iframe-srcdoc"] iframe').locator('[data-kg-smoke-inline-srcdoc="1"]')
            ).to_contain_text("Inline SrcDoc Smoke")

            expect(page.locator('[data-kg-smoke-panel="iframe-snapshot"] [data-kg-webpage-snapshot="1"]')).to_be_visible()

            overlay_link = page.locator('[data-kg-smoke-panel="iframe-open-overlay"] a[aria-label="Click To Open Overlay"]').first
            expect(overlay_link).to_be_visible()
            overlay_link.click()
            opened_urls = page.evaluate("() => window.__kgRichMediaSmokeOpened")
            if "https://example.com/rich-media-open" not in opened_urls:
                raise AssertionError(f"expected click-to-open overlay to capture the target url, got {opened_urls}")

            image_panel = page.locator('[data-kg-smoke-panel="image-zoom"] [data-kg-rich-media-zoom-pan-viewport="1"]').first
            expect(image_panel).to_be_visible()
            expect(page.locator('[data-kg-smoke-panel="image-zoom"] img')).to_have_count(1)
            image_panel.hover()
            page.mouse.wheel(0, -320)

            image_threejs_surfaces = (
                ("image-threejs-raster", "raster", "png"),
                ("image-threejs-card-jpg", "raster", "jpg"),
                ("image-threejs-svg", "svg", "svg"),
                ("storyboard-widget", "svg", "svg"),
            )
            for panel_id, source_kind, source_format in image_threejs_surfaces:
                expect(page.locator(f'[data-kg-smoke-panel="{panel_id}"]')).to_have_attribute(
                    "data-kg-image-threejs-smoke-format", source_format
                )
                three_surface = page.locator(
                    f'[data-kg-smoke-panel="{panel_id}"] [data-kg-image-threejs-surface="1"]'
                ).first
                expect(three_surface).to_be_visible()
                expect(three_surface).to_have_attribute("data-kg-image-threejs-source-kind", source_kind)
                expect(three_surface).to_have_attribute("data-kg-image-threejs-load-state", "ready")
                canvas = three_surface.locator("canvas").first
                expect(canvas).to_have_count(1)
                assert_canvas_has_visual_content(canvas, f"{panel_id}.png")
                expect(
                    page.locator(f'[data-kg-smoke-panel="{panel_id}"] [data-kg-image-threejs-fallback="1"]')
                ).to_have_count(0)

            expect(
                page.locator('[data-kg-smoke-panel="image-threejs-card-jpg"] [data-kg-image-threejs-card-surface="1"]')
            ).to_have_count(1)

            fallback_panel = page.locator('[data-kg-smoke-panel="image-threejs-fallback"]')
            expect(fallback_panel).to_have_attribute("data-kg-image-threejs-smoke-format", "svg-fallback")
            fallback_image = fallback_panel.locator('[data-kg-image-threejs-fallback="1"]').first
            expect(fallback_image).to_be_visible()
            expect(fallback_panel.locator('[data-kg-image-threejs-surface="1"]')).to_have_count(0)
            if not fallback_image.evaluate("image => image.complete && image.naturalWidth > 0"):
                raise AssertionError("expected original SVG image fallback to load after Three.js geometry rejection")

            expect(page.locator('[data-kg-smoke-panel="video-inline"] [data-kg-rich-media-zoom-pan-viewport="1"]')).to_be_visible()
            expect(
                page.frame_locator('[data-kg-smoke-panel="video-inline"] iframe').locator('[data-kg-smoke-video-srcdoc="1"]')
            ).to_contain_text("Video HTML Fallback")

            expect(page.locator('[data-kg-smoke-panel="audio"] audio')).to_have_count(1)

            flow_header = page.locator('[data-kg-smoke-panel="storyboard-widget"] [data-kg-rich-media-storyboard-widget-header="1"]').first
            resize_handle = page.locator('[data-kg-smoke-panel="storyboard-widget"] [data-kg-rich-media-resize-handle="1"]').first
            expect(flow_header).to_be_visible()
            expect(resize_handle).to_be_visible()
            expect(page.locator('[data-kg-smoke-flow-size="1"]')).to_contain_text("320x220")

            timing = assert_catalog_preview_arrow_navigation(page)
            assert_catalog_preview_parent_placement(page, "image")
            assert_catalog_preview_parent_placement(page, "video")

            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            CATALOG_PREVIEW_TIMING_PATH.write_text(
                json.dumps({"schema": CATALOG_PREVIEW_TIMING_SCHEMA, "status": "passed", **timing}, indent=2) + "\n",
                encoding="utf-8",
            )
            subprocess.run(
                ["node", str(CATALOG_PREVIEW_TIMING_VALIDATOR_PATH), str(CATALOG_PREVIEW_TIMING_PATH)],
                check=True,
            )
            print(f"OK rich-media-browser-smoke {TARGET_URL}")
            print(
                "Catalog preview ready timing: "
                f"image-cold={timing['image']['coldOpenReadyMs']:.1f}ms "
                f"image-preloaded={timing['image']['preloadedTransitionReadyMs']:.1f}ms "
                f"video-preloaded={timing['video']['preloadedTransitionReadyMs']:.1f}ms "
                f"video-metadata={timing['video']['metadata']['visible']['width']}x"
                f"{timing['video']['metadata']['visible']['height']}@"
                f"{timing['video']['metadata']['visible']['durationSeconds']:.3f}s "
                f"budget={timing['budgetMs']:.0f}ms"
            )
            print(f"Screenshot: {SCREENSHOT_PATH}")
            print(f"Catalog preview screenshot: {CATALOG_PREVIEW_SCREENSHOT_PATH}")
            print(f"Catalog preview timing: {CATALOG_PREVIEW_TIMING_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
