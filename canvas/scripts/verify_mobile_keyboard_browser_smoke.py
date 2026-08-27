from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("AG_MOBILE_KEYBOARD_SMOKE_BASE_URL", "http://localhost:4177").rstrip("/")
TARGET_URL = f"{BASE_URL}/__smoke__/mobile-keyboard"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
SCREENSHOT_PATH = OUTPUT_DIR / "mobile-keyboard-browser-smoke.png"
MOBILE_VIEWPORT = {"width": 390, "height": 844}
KEYBOARD_VIEWPORT = {"width": 390, "height": 520}


def assert_box_within_viewport(page, selector: str) -> None:
    assert_locator_within_viewport(page, page.locator(selector).first, selector)


def assert_locator_within_viewport(page, locator, label: str) -> None:
    viewport = page.viewport_size
    if not viewport:
        raise AssertionError("expected page viewport size")
    box = locator.bounding_box()
    if not box:
        raise AssertionError(f"expected visible bounding box for {label}")
    bottom = float(box["y"]) + float(box["height"])
    if bottom > viewport["height"]:
        raise AssertionError(f"expected {label} to remain within viewport height {viewport['height']}, got {box}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport=MOBILE_VIEWPORT)
        try:
            page.goto(TARGET_URL, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.wait_for_selector('[data-kg-mobile-keyboard-smoke-page="1"]')

            stream_button = page.locator('[data-kg-mobile-chat-stream-button="true"]').first
            expect(stream_button).to_be_visible()
            stream_button.click()
            stream_button.click()
            expect(page.locator('[data-kg-mobile-chat-stream-item]').last).to_contain_text("mobile-safe transcript")

            chat_input = page.locator('textarea[data-kg-chat-input="true"]').first
            expect(chat_input).to_be_visible()
            chat_input.click()
            page.set_viewport_size(KEYBOARD_VIEWPORT)
            page.wait_for_timeout(150)
            chat_input.scroll_into_view_if_needed()
            page.wait_for_timeout(150)

            chat_quick_bar = page.locator('[data-kg-chat-grammar-quick-bar="true"]').first
            expect(chat_quick_bar).to_be_visible()
            assert_box_within_viewport(page, '[data-kg-chat-grammar-quick-bar="true"]')
            page.locator('[data-kg-chat-grammar-quick-bar-token="/"]').first.click()
            expect(page.locator('section[aria-label="Chat slash commands"]').first).to_be_visible()
            assert_box_within_viewport(page, 'textarea[data-kg-chat-input="true"]')
            page.keyboard.press("Escape")
            page.wait_for_timeout(150)

            chat_recovery_button = page.locator('[data-kg-mobile-chat-recovery-button="true"]').first
            chat_submit_button = page.locator('[data-kg-mobile-chat-submit-button="true"]').first
            chat_status = page.locator('[data-kg-mobile-chat-proof-status="true"]').first
            expect(chat_recovery_button).to_be_visible()
            expect(chat_submit_button).to_be_visible()
            assert_box_within_viewport(page, '[data-kg-mobile-chat-recovery-button="true"]')
            assert_box_within_viewport(page, '[data-kg-mobile-chat-submit-button="true"]')
            chat_submit_button.click()
            expect(chat_status).to_contain_text("submitted:/")
            chat_recovery_button.click()
            expect(chat_status).to_contain_text("recovered:")
            assert_locator_within_viewport(page, page.locator('[data-kg-mobile-chat-stream-item]').last, "latest chat stream item")

            workspace_shell = page.locator('[data-kg-mobile-keyboard-shell="workspace"]').first
            workspace_shell.scroll_into_view_if_needed()
            workspace_host = page.locator('[data-kg-mobile-workspace-inline-host="true"] [data-start-line="1"]').first
            expect(workspace_host).to_be_visible()
            workspace_host.click(position={"x": 20, "y": 18})
            page.wait_for_timeout(250)

            workspace_quick_bar = page.locator('[data-kg-markdown-mobile-grammar-quick-bar="true"]').first
            expect(workspace_quick_bar).to_be_visible()
            workspace_quick_bar.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            assert_box_within_viewport(page, '[data-kg-markdown-mobile-grammar-quick-bar="true"]')
            page.locator('[data-kg-markdown-mobile-grammar-quick-bar-token="#"]').first.click()
            expect(page.locator('section[aria-label="Semantic commands"]').first).to_be_visible()
            page.keyboard.press("Escape")
            page.wait_for_timeout(150)
            page.locator('[data-kg-markdown-mobile-grammar-quick-bar-token="@"]').first.click()
            expect(page.locator('section[aria-label="Variable toolbar"]').first).to_be_visible()

            editor_host = page.locator('[data-kg-mobile-workspace-editor-host="true"]').first
            editor_preview = page.locator('[data-kg-mobile-workspace-editor-preview="true"]').first
            editor_host.scroll_into_view_if_needed()
            expect(editor_host).to_be_visible()
            page.wait_for_timeout(150)

            editor_quick_bar = page.locator('[data-kg-markdown-editor-grammar-quick-bar="true"]').first
            expect(editor_quick_bar).to_be_visible()
            editor_quick_bar.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            assert_box_within_viewport(page, '[data-kg-markdown-editor-grammar-quick-bar="true"]')
            expect(editor_host.locator('[data-kg-monaco-runtime-mode="deferred-touch"]').first).to_be_visible()
            monaco_touch_intent = editor_host.locator('[data-kg-monaco-touch-intent="true"]').first
            expect(monaco_touch_intent).to_be_visible()
            page.locator('[data-kg-markdown-editor-grammar-quick-bar-token="/"]').first.click()
            expect(editor_preview).to_contain_text(" /")
            page.locator('[data-kg-markdown-editor-grammar-quick-bar-token="#"]').first.click()
            expect(editor_preview).to_contain_text("/ #")
            assert_box_within_viewport(page, '[data-kg-mobile-workspace-editor-preview="true"]')
            monaco_touch_intent.locator('[data-kg-monaco-touch-intent-activate="true"]').click()
            expect(editor_host.locator('[data-kg-monaco-runtime-mode="monaco"]').first).to_be_visible()
            expect(editor_host.locator('.kg-monaco-editor-host').first).to_be_visible()

            json_editor_host = page.locator('[data-kg-mobile-workspace-json-editor-host="true"]').first
            json_editor_preview = page.locator('[data-kg-mobile-workspace-json-editor-preview="true"]').first
            json_editor_host.scroll_into_view_if_needed()
            json_editor_host.evaluate("(element) => element.scrollIntoView({ block: 'center', inline: 'nearest' })")
            expect(json_editor_host).to_be_visible()
            page.wait_for_timeout(150)
            assert_box_within_viewport(page, '[data-kg-mobile-workspace-json-editor-host="true"]')
            expect(json_editor_host.locator('[data-kg-monaco-runtime-mode="deferred-touch"]').first).to_be_visible()
            json_fallback_textarea = json_editor_host.locator('textarea[aria-label="Workspace JSON Editor Text"]').first
            expect(json_fallback_textarea).to_be_visible()
            json_fallback_textarea.click()
            json_fallback_textarea.press("End")
            json_fallback_textarea.type('\n  ,"verified": true')
            expect(json_editor_preview).to_contain_text('"verified": true')
            json_monaco_touch_intent = json_editor_host.locator('[data-kg-monaco-touch-intent="true"]').first
            expect(json_monaco_touch_intent).to_be_visible()
            json_monaco_touch_intent.locator('[data-kg-monaco-touch-intent-activate="true"]').click()
            expect(json_editor_host.locator('[data-kg-monaco-runtime-mode="monaco"]').first).to_be_visible()
            expect(json_editor_host.locator('.kg-monaco-editor-host').first).to_be_visible()

            runtime_shell = page.locator('[data-kg-mobile-keyboard-shell="runtime"]').first
            runtime_shell.scroll_into_view_if_needed()
            page.wait_for_timeout(150)

            runtime_3d_host = page.locator('[data-kg-mobile-runtime-3d-host="true"]').first
            expect(runtime_3d_host).to_be_visible()
            assert_box_within_viewport(page, '[data-kg-mobile-runtime-3d-host="true"]')
            runtime_3d_card = runtime_3d_host.locator('[data-kg-canvas-heavy-runtime-intent="3d"]').first
            expect(runtime_3d_card).to_be_visible()
            runtime_3d_card.locator('[data-kg-canvas-heavy-runtime-intent-activate="3d"]').click()
            expect(runtime_3d_host.locator('[data-kg-canvas-heavy-runtime-intent="3d"]').first).to_have_count(0)

            runtime_geo_host = page.locator('[data-kg-mobile-runtime-geo-host="true"]').first
            runtime_geo_host.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            expect(runtime_geo_host).to_be_visible()
            assert_box_within_viewport(page, '[data-kg-mobile-runtime-geo-host="true"]')
            runtime_geo_card = runtime_geo_host.locator('[data-kg-canvas-heavy-runtime-intent="geo"]').first
            expect(runtime_geo_card).to_be_visible()
            runtime_geo_card.locator('[data-kg-canvas-heavy-runtime-intent-activate="geo"]').click()
            expect(runtime_geo_host.locator('[data-kg-canvas-heavy-runtime-intent="geo"]').first).to_have_count(0)

            mermaid_host = page.locator('[data-kg-mobile-mermaid-gate-host="true"]').first
            mermaid_host.scroll_into_view_if_needed()
            mermaid_host.evaluate("(element) => element.scrollIntoView({ block: 'center', inline: 'nearest' })")
            page.wait_for_timeout(250)
            mermaid_gate = mermaid_host.locator('[data-kg-mermaid-visibility-gate="activatable"]').first
            expect(mermaid_gate).to_be_visible()
            mermaid_placeholder = mermaid_host.locator('[data-kg-mermaid-touch-placeholder="true"]').first
            expect(mermaid_placeholder).to_be_visible()
            assert_box_within_viewport(page, '[data-kg-mobile-mermaid-gate-host="true"]')
            mermaid_placeholder.locator('[data-kg-mermaid-touch-placeholder-activate="true"]').click()
            expect(mermaid_host.locator('[data-kg-mobile-mermaid-runtime="true"]').first).to_contain_text("Mermaid runtime loaded")

            schema_serialization_host = page.locator('[data-kg-mobile-schema-serialization-host="true"]').first
            schema_compact_editor = schema_serialization_host.locator('.kg-schema-editor-serialization-editor--compact').first
            schema_compact_editor.scroll_into_view_if_needed()
            schema_compact_editor.evaluate("(element) => element.scrollIntoView({ block: 'center', inline: 'nearest' })")
            page.wait_for_timeout(250)
            assert_box_within_viewport(page, '[data-kg-mobile-schema-serialization-host="true"] .kg-schema-editor-serialization-editor--compact')
            schema_touch_intent = schema_compact_editor.locator('[data-kg-monaco-touch-intent="true"]').first
            expect(schema_touch_intent).to_be_visible()
            schema_touch_intent.locator('[data-kg-monaco-touch-intent-activate="true"]').click()
            expect(schema_compact_editor.locator('[data-kg-monaco-runtime-mode="monaco"]').first).to_be_visible()
            expect(schema_compact_editor.locator('.kg-monaco-editor-host').first).to_be_visible()

            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            print(f"OK mobile-keyboard-browser-smoke {TARGET_URL}")
            print(f"Screenshot: {SCREENSHOT_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
