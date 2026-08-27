from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright

from storyboard_edge_smoke_geometry import expect_pending_storyboard_edge_visible, read_storyboard_edge_screen_endpoints


BASE_URL = os.environ.get("AG_STORYBOARD_DROP_SMOKE_BASE_URL", "http://localhost:4176").rstrip("/")
TARGET_URL = f"{BASE_URL}/?kgPath=%2F__smoke__%2Fstoryboard-rich-media-drop"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
SCREENSHOT_PATH = OUTPUT_DIR / "storyboard-rich-media-drop-browser-smoke.png"
RETENTION_OBSERVATION_MS = 3000
STORYBOARD_SMOKE_MAX_ATTEMPTS = 2


def read_smoke_state(page):
    return page.evaluate("() => window.__kgStoryboardDropSmoke || null")


def css_attr_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def canonical_node_id_suffix(node_id: str) -> str:
    parts = [part.strip() for part in str(node_id or "").split("::") if part.strip()]
    return parts[-1] if parts else str(node_id or "").strip()


def rich_media_overlay_shell_selector(node_id: str) -> str:
    safe_id = css_attr_value(node_id)
    safe_suffix = css_attr_value(canonical_node_id_suffix(node_id))
    return (
        f'[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-kg-storyboard-widget-surface="storyboard"][data-node-id="{safe_id}"], '
        f'[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-kg-storyboard-widget-surface="storyboard"][data-node-id$="::{safe_suffix}"], '
        f'aside[data-kg-widget="{safe_id}"][data-kg-storyboard-widget-mode="1"], '
        f'aside[data-kg-widget$="::{safe_suffix}"][data-kg-storyboard-widget-mode="1"]'
    )


def read_visible_rich_media_shell_ids(page):
    return page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"], aside[data-kg-widget][data-kg-storyboard-widget-mode="1"]'))
          .filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          .map((el) => String(el.getAttribute('data-node-id') || el.getAttribute('data-kg-widget') || '').trim())
          .filter(Boolean)
          .filter((id, index, ids) => ids.indexOf(id) === index)
        """
    )


def click_visible_rich_media_shell(page, node_id: str) -> None:
    selector = rich_media_overlay_shell_selector(node_id)
    clicked = page.evaluate(
        """
        (selector) => {
          const shell = Array.from(document.querySelectorAll(selector)).find((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          if (!shell) return false
          const rect = shell.getBoundingClientRect()
          shell.dispatchEvent(new MouseEvent('pointerdown', {
            bubbles: true,
            clientX: rect.x + 12,
            clientY: rect.y + 12,
          }))
          shell.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            clientX: rect.x + 12,
            clientY: rect.y + 12,
          }))
          return true
        }
        """,
        selector,
    )
    if not clicked:
        raise AssertionError(f"expected visible Rich Media panel shell for {node_id}")


def expect_visible_rich_media_shell_ports(page, node_id: str) -> None:
    selector = rich_media_overlay_shell_selector(node_id)
    page.wait_for_function(
        """
        (selector) => Array.from(document.querySelectorAll(selector)).some((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0
            && rect.height > 0
            && el.querySelectorAll('[data-kg-port-handle="1"]').length > 0
        })
        """,
        arg=selector,
        timeout=15000,
    )


def read_visible_rich_media_shell_box(page, node_id: str):
    selector = rich_media_overlay_shell_selector(node_id)
    box = page.evaluate(
        """
        (selector) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          const shell = candidates.find((el) => el.matches('aside[data-kg-widget][data-kg-storyboard-widget-mode="1"]')) || candidates[0]
          if (!shell) return null
          const rect = shell.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        """,
        selector,
    )
    if not box:
        raise AssertionError(f"expected visible Rich Media panel shell box for {node_id}")
    return box


def expect_rich_media_shell_box_stable(before, after, label: str) -> None:
    for key in ("x", "y", "width", "height"):
        if abs(float(before[key]) - float(after[key])) > 0.75:
            raise AssertionError(
                f"expected dropped Rich Media panel {label} {key} to remain stable, before={before} after={after}"
            )


def expect_rich_media_shell_center_near_target(box, target_x: float, target_y: float, label: str) -> None:
    center_x = float(box["x"]) + float(box["width"]) / 2
    center_y = float(box["y"]) + float(box["height"]) / 2
    distance = ((center_x - target_x) ** 2 + (center_y - target_y) ** 2) ** 0.5
    if distance > 20:
        raise AssertionError(f"expected dropped Rich Media panel {label} center near release point, distance={distance:.2f}, box={box}, target=({target_x:.2f}, {target_y:.2f})")


def expect_selected_rich_media_panel(page, node_id: str) -> None:
    node_suffix = canonical_node_id_suffix(node_id)
    page.wait_for_function(
        """
        ({ nodeId, nodeSuffix }) => {
          const smoke = window.__kgStoryboardDropSmoke || {}
          const selectedNodeId = String(smoke.selectedNodeId || '').trim()
          const openWidgetNodeIds = Array.isArray(smoke.openWidgetNodeIds) ? smoke.openWidgetNodeIds : []
          return (
            selectedNodeId === nodeId
            || selectedNodeId.endsWith(`::${nodeSuffix}`)
            || openWidgetNodeIds.some((id) => {
              const text = String(id || '').trim()
              return text === nodeId || text.endsWith(`::${nodeSuffix}`)
            })
          )
        }
        """,
        arg={"nodeId": node_id, "nodeSuffix": node_suffix},
        timeout=15000,
    )


def read_storyboard_card_boxes(page):
    return page.evaluate(
        """
        () => Object.fromEntries(Array.from(document.querySelectorAll('article[data-kg-storyboard-fixed-card="1"]'))
          .map((el) => {
            const id = String(el.getAttribute('data-node-id') || '').trim()
            const rect = el.getBoundingClientRect()
            return [id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]
          })
          .filter(([id]) => !!id))
        """
    )


def read_visible_storyboard_card_box(page, node_id: str):
    node_suffix = canonical_node_id_suffix(node_id)
    selector = (
        f'article[data-node-id="{css_attr_value(node_id)}"], '
        f'article[data-node-id$="::{css_attr_value(node_suffix)}"], '
        f'[data-node-id="{css_attr_value(node_id)}"], '
        f'[data-node-id$="::{css_attr_value(node_suffix)}"]'
    )
    box = page.evaluate(
        """
        ({ selector, nodeId, nodeSuffix }) => {
          const card = Array.from(document.querySelectorAll(selector)).find((el) => {
            const rect = el.getBoundingClientRect()
            if (!(rect.width > 0 && rect.height > 0)) return false
            const dataNodeId = String(el.getAttribute('data-node-id') || '').trim()
            return dataNodeId === nodeId || dataNodeId.endsWith(`::${nodeSuffix}`)
          })
          if (!card) return null
          const rect = card.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        """,
        {"selector": selector, "nodeId": node_id, "nodeSuffix": node_suffix},
    )
    return box


def read_storyboard_edge_ids(page):
    return page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-kg-overlay-edge-id], [data-kg-storyboard-canvas-edge-id]'))
          .map((el) => String(el.getAttribute('data-kg-overlay-edge-id') || el.getAttribute('data-kg-storyboard-canvas-edge-id') || '').trim())
          .filter(Boolean)
        """
    )


def expect_storyboard_card_boxes_unchanged(before, after) -> None:
    if set(before) != set(after):
        raise AssertionError(f"expected Storyboard card identity to remain stable, before={list(before)} after={list(after)}")
    for node_id, before_box in before.items():
        after_box = after[node_id]
        for key in ("x", "y", "width", "height"):
            if abs(float(before_box[key]) - float(after_box[key])) > 0.75:
                raise AssertionError(f"expected Storyboard card {node_id} {key} to remain stable, before={before_box} after={after_box}")


def apply_storyboard_pan_zoom(page) -> None:
    box = read_storyboard_surface_box(page)
    start_x, start_y = box["x"] + box["width"] * 0.24, box["y"] + box["height"] * 0.18
    page.mouse.move(start_x, start_y)
    page.mouse.down(); page.mouse.move(start_x + 32, start_y + 18, steps=3); page.mouse.move(start_x + 76, start_y + 42, steps=3); page.mouse.up()
    page.mouse.wheel(0, -420); page.wait_for_timeout(RETENTION_OBSERVATION_MS)


def drag_rich_media_port_to_storyboard_card(page, source_node_id: str, target_node_id: str) -> str:
    source_suffix = canonical_node_id_suffix(source_node_id)
    source_selector = (
        f'button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-node-id="{css_attr_value(source_node_id)}"], '
        f'button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-node-id$="::{css_attr_value(source_suffix)}"]'
    )
    source = page.locator(source_selector).first
    expect(source).to_be_visible(timeout=15000)
    page.wait_for_timeout(120)
    source_box = source.bounding_box()
    if not source_box:
        raise AssertionError(f"expected source port geometry for {source_node_id}")
    before_edges = set(read_storyboard_edge_ids(page))
    before_cards = read_storyboard_card_boxes(page)
    page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
    page.mouse.down()
    target_card_box = read_visible_storyboard_card_box(page, target_node_id)
    if target_card_box:
        target_card_x = target_card_box["x"] + target_card_box["width"] / 2
        target_card_y = target_card_box["y"] + target_card_box["height"] / 2
        preview_probe_x = source_box["x"] + source_box["width"] / 2 + (target_card_x - (source_box["x"] + source_box["width"] / 2)) * 0.35
        preview_probe_y = source_box["y"] + source_box["height"] / 2 + (target_card_y - (source_box["y"] + source_box["height"] / 2)) * 0.35
        page.mouse.move(preview_probe_x, preview_probe_y, steps=4)
        expect_pending_storyboard_edge_visible(page)
    target_suffix = canonical_node_id_suffix(target_node_id)
    target_selector = (
        f'button[data-kg-port-handle="1"][data-kg-port-dir="in"][data-kg-port-node-id="{css_attr_value(target_node_id)}"], '
        f'button[data-kg-port-handle="1"][data-kg-port-dir="in"][data-kg-port-node-id$="::{css_attr_value(target_suffix)}"]'
    )
    page.wait_for_function(
        """
        ({ selector, nodeId, suffix }) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          return candidates.some((el) => {
            const portNodeId = String(el.getAttribute('data-kg-port-node-id') || '').trim()
            return portNodeId === nodeId || portNodeId.endsWith(`::${suffix}`)
          })
        }
        """,
        arg={"selector": target_selector, "nodeId": target_node_id, "suffix": target_suffix},
        timeout=15000,
    )
    target_box = page.evaluate(
        """
        ({ selector, nodeId, suffix }) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          const exact = candidates.find((el) => String(el.getAttribute('data-kg-port-node-id') || '').trim() === nodeId)
          const fallback = candidates.find((el) => String(el.getAttribute('data-kg-port-node-id') || '').trim().endsWith(`::${suffix}`))
          const port = exact || fallback || null
          if (!port) return null
          const rect = port.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        """,
        {"selector": target_selector, "nodeId": target_node_id, "suffix": target_suffix},
    )
    if not target_box:
        page.mouse.up()
        raise AssertionError(f"expected target port geometry for {target_node_id}")
    page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=4)
    page.mouse.up()
    page.wait_for_function(
        """
        (beforeIds) => Array.from(document.querySelectorAll('[data-kg-overlay-edge-id], [data-kg-storyboard-canvas-edge-id]'))
          .map((el) => String(el.getAttribute('data-kg-overlay-edge-id') || el.getAttribute('data-kg-storyboard-canvas-edge-id') || '').trim())
          .some((id) => id && !beforeIds.includes(id))
        """,
        arg=list(before_edges),
        timeout=15000,
    )
    created_ids = [edge_id for edge_id in read_storyboard_edge_ids(page) if edge_id not in before_edges]
    if len(created_ids) != 1:
        raise AssertionError(f"expected one created Storyboard edge, got {created_ids}")
    page.wait_for_timeout(RETENTION_OBSERVATION_MS)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_ids[0] not in retained_edges:
        raise AssertionError(f"expected created Storyboard edge to remain visible, got {sorted(retained_edges)}")
    expect_storyboard_card_boxes_unchanged(before_cards, read_storyboard_card_boxes(page))
    return created_ids[0]


def assert_storyboard_edge_panel_open_retention(page, node_id: str, target_node_id: str) -> str:
    click_visible_rich_media_shell(page, node_id)
    expect_selected_rich_media_panel(page, node_id)
    expect_visible_rich_media_shell_ports(page, node_id)
    selected_box = read_visible_rich_media_shell_box(page, node_id)
    created_edge_id = drag_rich_media_port_to_storyboard_card(page, node_id, target_node_id)
    box_after_edge_create = read_visible_rich_media_shell_box(page, node_id)
    expect_rich_media_shell_box_stable(selected_box, box_after_edge_create, "after edge create")
    page.wait_for_timeout(RETENTION_OBSERVATION_MS)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_edge_id not in retained_edges:
        raise AssertionError(f"expected created Storyboard edge to remain visible after retention, got {sorted(retained_edges)}")
    click_visible_rich_media_shell(page, node_id)
    expect_selected_rich_media_panel(page, node_id)
    expect_visible_rich_media_shell_ports(page, node_id)
    page.wait_for_timeout(RETENTION_OBSERVATION_MS)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_edge_id not in retained_edges:
        raise AssertionError(f"expected selected/open dropped panel to retain Storyboard edge visibility, got {sorted(retained_edges)}")
    reopened_box = read_visible_rich_media_shell_box(page, node_id)
    expect_rich_media_shell_box_stable(selected_box, reopened_box, "after select/open retention")
    edge_endpoints_before_pan_zoom = read_storyboard_edge_screen_endpoints(page, created_edge_id)
    apply_storyboard_pan_zoom(page)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_edge_id not in retained_edges:
        raise AssertionError(f"expected selected/open dropped panel to retain Storyboard edge visibility after pan/zoom, got {sorted(retained_edges)}")
    panel_box_after_pan_zoom = read_visible_rich_media_shell_box(page, node_id)
    edge_endpoints_after_pan_zoom = read_storyboard_edge_screen_endpoints(page, created_edge_id)
    panel_delta = ((panel_box_after_pan_zoom["x"] - reopened_box["x"]) ** 2 + (panel_box_after_pan_zoom["y"] - reopened_box["y"]) ** 2) ** 0.5
    edge_delta = ((edge_endpoints_after_pan_zoom["source"]["x"] - edge_endpoints_before_pan_zoom["source"]["x"]) ** 2 + (edge_endpoints_after_pan_zoom["source"]["y"] - edge_endpoints_before_pan_zoom["source"]["y"]) ** 2) ** 0.5
    if panel_delta > 4 and edge_delta < max(2, panel_delta * 0.15):
        raise AssertionError(f"expected Storyboard edge geometry to follow Rich Media panel after pan/zoom, panel_delta={panel_delta:.2f} edge_delta={edge_delta:.2f}")
    expect_visible_rich_media_shell_ports(page, node_id)
    return created_edge_id


def load_storyboard_smoke_page(page):
    page.goto(TARGET_URL, wait_until="domcontentloaded")
    page.wait_for_selector('[data-kg-storyboard-drop-smoke-page="1"]')
    page.wait_for_function(
        """
        () => Array.from(document.querySelectorAll('[data-kg-storyboard-widget-surface-root="storyboard"]'))
          .some((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
        """,
        timeout=15000,
    )
    try:
        page.wait_for_function(
            "() => window.__kgStoryboardDropSmoke?.baselineReady === true",
            timeout=15000,
        )
    except PlaywrightTimeoutError:
        raise
    page.wait_for_function(
        """
        () => ['image', 'video'].every((kind) => {
          const el = document.querySelector(`[data-kg-storyboard-drop-smoke-source="${kind}"]`)
          const rect = el?.getBoundingClientRect?.()
          return !!rect && rect.width > 0 && rect.height > 0
        })
        """,
        timeout=15000,
    )
    canvas_surface = page.locator('[data-kg-storyboard-widget-surface-root="storyboard"]').filter(
        has=page.locator(':scope')
    ).first
    return canvas_surface


def read_storyboard_surface_box(page):
    box = page.evaluate(
        """
        () => {
          for (const el of document.querySelectorAll('[data-kg-storyboard-widget-surface-root="storyboard"]')) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
          }
          return null
        }
        """
    )
    if not box:
        raise AssertionError("expected storyboard surface bounding box")
    return box


def read_canvas_viewport_box(page):
    box = page.evaluate(
        """
        () => {
          for (const el of document.querySelectorAll('[data-kg-canvas-viewport-root="1"]')) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
          }
          return null
        }
        """
    )
    if not box:
        raise AssertionError("expected canvas viewport bounding box")
    return box


def read_smoke_source_box(page, source_kind: str):
    box = page.evaluate(
        """
        (sourceKind) => {
          for (const el of document.querySelectorAll(`[data-kg-storyboard-drop-smoke-source="${sourceKind}"]`)) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
          }
          return null
        }
        """,
        source_kind,
    )
    if not box:
        raise AssertionError(f"expected bounding box for {source_kind} source")
    return box


def read_canvas_drop_point(page, target_ratio_x: float, target_ratio_y: float):
    page.wait_for_function(
        """
        () => Array.from(document.querySelectorAll('[data-kg-canvas-viewport-root="1"]'))
          .some((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
        """,
        timeout=30000,
    )
    point = page.evaluate(
        """
        ({ targetRatioX, targetRatioY }) => {
          for (const el of document.querySelectorAll('[data-kg-media-drop-consumes-canvas-drop="1"]')) {
            el.style.pointerEvents = 'none'
          }
          for (const el of document.querySelectorAll('[data-kg-canvas-viewport-root="1"]')) {
            const rect = el.getBoundingClientRect()
            if (!(rect.width > 0 && rect.height > 0)) continue
            return {
              x: rect.x + rect.width * targetRatioX,
              y: rect.y + rect.height * targetRatioY,
            }
          }
          return null
        }
        """,
        {"targetRatioX": target_ratio_x, "targetRatioY": target_ratio_y},
    )
    if not point:
        raise AssertionError("expected an unclaimed storyboard surface drop point")
    return point


def drag_storyboard_media(page, canvas_surface, source_kind: str, target_ratio_x: float, target_ratio_y: float) -> str:
    source = page.locator(f'[data-kg-storyboard-drop-smoke-source="{source_kind}"]').first
    expect(source).to_be_visible()
    source_box = read_smoke_source_box(page, source_kind)
    source_key = f"smoke:{source_kind}:canvas-drop"
    page.evaluate("(sourceKey) => { window.__kgStoryboardDropSmokeSourceKey = sourceKey }", source_key)
    before = read_smoke_state(page) or {"dropCount": 0, "droppedNodeIds": []}
    before_count = int(before.get("dropCount", 0))
    before_ids = set(before.get("droppedNodeIds", []))
    payload = {
        "kind": source_kind,
        "label": f"Smoke {source_kind}",
        "url": (
            "data:image/svg+xml;charset=utf-8,"
            "%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20360%20203%22%3E"
            "%3Crect%20width%3D%22360%22%20height%3D%22203%22%20rx%3D%2224%22%20fill%3D%22%230f172a%22/%3E"
            "%3Crect%20x%3D%2218%22%20y%3D%2218%22%20width%3D%22324%22%20height%3D%22167%22%20rx%3D%2218%22%20fill%3D%22%2338bdf8%22/%3E"
            "%3Ctext%20x%3D%22180%22%20y%3D%22112%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2C%20Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20fill%3D%22%23082f49%22%3EStoryboard%20Smoke%20Image%3C/text%3E%3C/svg%3E"
            if source_kind == "image"
            else "https://example.com/storyboard-smoke-video.mp4"
        ),
        "sourceKey": source_key,
    }
    page.wait_for_function(
        """
        () => Array.from(document.querySelectorAll('[data-kg-canvas-viewport-root="1"]'))
          .some((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
        """,
        timeout=30000,
    )
    detail_after_dispatch = page.evaluate(
        """
        ({ payload, targetRatioX, targetRatioY, startClientX, startClientY }) => {
          let clientX = Number.NaN
          let clientY = Number.NaN
          for (const viewportRoot of document.querySelectorAll('[data-kg-canvas-viewport-root="1"]')) {
            const rect = viewportRoot.getBoundingClientRect()
            if (!(rect.width > 0 && rect.height > 0)) continue
            clientX = rect.x + rect.width * targetRatioX
            clientY = rect.y + rect.height * targetRatioY
            break
          }
          if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
            return { payload, clientX, clientY, startClientX, startClientY, noSurface: true }
          }
          const detail = { payload, clientX, clientY, startClientX, startClientY }
          window.dispatchEvent(new CustomEvent('kg:media-pointer-drag-drop', {
            detail
          }))
          return detail
        }
        """,
        {
            "payload": payload,
            "targetRatioX": target_ratio_x,
            "targetRatioY": target_ratio_y,
            "startClientX": source_box["x"] + source_box["width"] / 2,
            "startClientY": source_box["y"] + source_box["height"] / 2,
        },
    )
    target_x = detail_after_dispatch["clientX"]
    target_y = detail_after_dispatch["clientY"]
    if detail_after_dispatch.get("noSurface"):
        raise AssertionError(f"expected storyboard surface before {source_kind} drag dispatch")
    try:
        page.wait_for_function(
            "(expectedCount) => (window.__kgStoryboardDropSmoke?.dropCount || 0) >= expectedCount",
            arg=before_count + 1,
            timeout=15000,
        )
    except PlaywrightTimeoutError:
        debug_state = page.evaluate(
            """
            ({ x, y, detail }) => {
              const target = document.elementFromPoint(x, y)
              return {
                smoke: window.__kgStoryboardDropSmoke || null,
                detail,
                target: target ? {
                  tag: target.tagName,
                  className: String(target.className || '').slice(0, 160),
                  storyboardRoot: !!target.closest?.('[data-kg-storyboard-widget-surface-root="storyboard"]'),
                  consumesCanvasDrop: !!target.closest?.('[data-kg-media-drop-consumes-canvas-drop="1"]'),
                } : null,
                shells: Array.from(document.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"]')).map((el) => el.getAttribute('data-node-id')),
                richMediaNodes: (window.__AG_STORE__?.getState?.().graphData?.nodes || []).filter((node) => String(node?.type || '') === 'RichMediaPanel').map((node) => ({
                  id: node.id,
                  label: node.label,
                  mediaKind: node.properties?.mediaKind || node.properties?.media_kind || '',
                  mediaSourceKey: node.properties?.mediaSourceKey || '',
                })),
              }
            }
            """,
            {"x": target_x, "y": target_y, "detail": detail_after_dispatch},
        )
        raise AssertionError(f"drop wait timed out after {source_kind} drag: {debug_state}") from None
    after = read_smoke_state(page) or {}
    new_ids = [node_id for node_id in after.get("droppedNodeIds", []) if node_id not in before_ids]
    if len(new_ids) != 1:
        visible_shell_ids = read_visible_rich_media_shell_ids(page)
        if len(visible_shell_ids) == 1:
            return visible_shell_ids[0]
        raise AssertionError(f"expected one visible dropped node after {source_kind} drag, got graph={new_ids} shells={visible_shell_ids}")
    return new_ids[0]


def run_single_drop_attempt(browser, source_kind: str, target_ratio_x: float, target_ratio_y: float, _attempt: int):
    page = browser.new_page(viewport={"width": 1680, "height": 1200})
    try:
        canvas_surface = load_storyboard_smoke_page(page)
        read_storyboard_surface_box(page)
        node_id = drag_storyboard_media(page, canvas_surface, source_kind, target_ratio_x, target_ratio_y)
        smoke_state = read_smoke_state(page) or {}
        expected_kind = {source_kind}
        if smoke_state.get("dropCount", 0) < 1:
            raise AssertionError(f"expected at least one dropped {source_kind} node, got {smoke_state}")
        if set(smoke_state.get("droppedKinds", [])) != expected_kind:
            raise AssertionError(f"expected dropped {source_kind} kind only, got {smoke_state}")
        if node_id not in set(smoke_state.get("droppedNodeIds", [])) and node_id not in read_visible_rich_media_shell_ids(page):
            raise AssertionError(f"expected dropped {source_kind} node id to be retained, got {smoke_state}")
        panel_selector = rich_media_overlay_shell_selector(node_id)
        panel_shell = page.locator(panel_selector).first
        try:
            expect(panel_shell).to_be_visible(timeout=15000)
        except AssertionError:
            raise
        target_box = read_canvas_viewport_box(page)
        dropped_box = read_visible_rich_media_shell_box(page, node_id)
        try:
            expect_rich_media_shell_center_near_target(dropped_box, target_box["x"] + target_box["width"] * target_ratio_x, target_box["y"] + target_box["height"] * target_ratio_y, f"after {source_kind} drop")
        except AssertionError as exc:
            debug_state = page.evaluate("""(nodeId) => { const shell = document.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`); return { flowCanvasDebug: window.__flowCanvasDebug || null, shellHtml: shell?.outerHTML?.slice(0, 1000) || '', shellStyle: shell?.getAttribute('style') || '', candidates: Array.from(document.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"], aside[data-kg-widget][data-kg-storyboard-widget-mode="1"]')).map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, nodeId: el.getAttribute('data-node-id') || '', widget: el.getAttribute('data-kg-widget') || '', x: r.x, y: r.y, width: r.width, height: r.height, style: el.getAttribute('style') || '' }; }), graphNode: (window.__AG_STORE__?.getState?.().graphData?.nodes || []).find((node) => String(node?.id || '') === nodeId || String(node?.id || '').endsWith(`::${nodeId.split('::').pop()}`)) || null }; }""", node_id)
            raise AssertionError(f"{exc}; debug={debug_state}") from None
        click_visible_rich_media_shell(page, node_id)
        expect_visible_rich_media_shell_ports(page, node_id)
        page.wait_for_timeout(RETENTION_OBSERVATION_MS)
        expect(page.locator(panel_selector).first).to_be_visible(timeout=15000)
        expect_visible_rich_media_shell_ports(page, node_id)
        retained_smoke_state = read_smoke_state(page) or {}
        if node_id not in set(retained_smoke_state.get("droppedNodeIds", [])) and node_id not in read_visible_rich_media_shell_ids(page):
            raise AssertionError(f"expected dropped {source_kind} panel to remain mounted, got {retained_smoke_state}")
        if smoke_state.get("shiftedNodeIds"):
            raise AssertionError(f"expected {source_kind} drop to preserve existing authored nodes, got {smoke_state}")
        return page
    except Exception:
        page.close()
        raise


def run_single_drop(browser, source_kind: str, target_ratio_x: float, target_ratio_y: float):
    last_error: Exception | None = None
    for attempt in range(1, STORYBOARD_SMOKE_MAX_ATTEMPTS + 1):
        try:
            return run_single_drop_attempt(browser, source_kind, target_ratio_x, target_ratio_y, attempt)
        except (AssertionError, PlaywrightTimeoutError) as error:
            last_error = error
            if attempt >= STORYBOARD_SMOKE_MAX_ATTEMPTS:
                raise
    if last_error is not None:
        raise last_error
    raise AssertionError(f"expected storyboard smoke attempt to produce a page for {source_kind}")


def run_storyboard_case(
    browser,
    source_kind: str,
    target_ratio_x: float,
    target_ratio_y: float,
    target_node_id: str,
    screenshot_path: str | None = None,
) -> None:
    last_error: Exception | None = None
    for _attempt in range(1, STORYBOARD_SMOKE_MAX_ATTEMPTS + 1):
        page = None
        try:
            page = run_single_drop(browser, source_kind, target_ratio_x, target_ratio_y)
            assert_storyboard_edge_panel_open_retention(
                page,
                read_visible_rich_media_shell_ids(page)[-1],
                target_node_id,
            )
            if screenshot_path:
                page.screenshot(path=screenshot_path, full_page=True)
            page.close()
            return
        except (AssertionError, PlaywrightTimeoutError) as error:
            last_error = error
            if page is not None:
                page.close()
            if _attempt >= STORYBOARD_SMOKE_MAX_ATTEMPTS:
                raise
    if last_error is not None:
        raise last_error
    raise AssertionError(f"expected storyboard smoke case to complete for {source_kind}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            run_storyboard_case(
                browser,
                "image",
                0.35,
                0.15,
                "storyboard-card-alpha",
            )
            run_storyboard_case(
                browser,
                "video",
                0.65,
                0.15,
                "storyboard-card-beta",
                str(SCREENSHOT_PATH),
            )
            print(f"OK storyboard-rich-media-drop-browser-smoke {TARGET_URL}")
            print(f"Screenshot: {SCREENSHOT_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
