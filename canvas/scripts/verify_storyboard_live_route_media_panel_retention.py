from __future__ import annotations
import os
from pathlib import Path
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright
BASE_URL = os.environ.get("AG_STORYBOARD_LIVE_ROUTE_BASE_URL", "http://localhost:4175").rstrip("/")
TARGET_URL = f"{BASE_URL}/"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "outputs"
SCREENSHOT_PATH = OUTPUT_DIR / "storyboard-live-route-media-panel-retention.png"
RETENTION_OBSERVATION_MS = 3000
DEFAULT_STARTER_DOC_BASENAME = "-".join(("agenticgraph", "strybldr", "starter", "template")) + ".md"
DEFAULT_STARTER_DOC_REL_PATH = Path("docs") / DEFAULT_STARTER_DOC_BASENAME
STARTER_DOC_PATH = Path(
    os.environ.get(
        "AG_STORYBOARD_LIVE_ROUTE_DOC_PATH",
        str(Path(__file__).resolve().parents[3] / "huijoohwee" / DEFAULT_STARTER_DOC_REL_PATH),
    )
)
STARTER_DOC_WORKSPACE_NAME = os.environ.get(
    "AG_STORYBOARD_LIVE_ROUTE_DOC_NAME",
    str(DEFAULT_STARTER_DOC_REL_PATH),
)
MEDIA_CASES = (
    {
        "kind": "image",
        "label": "Live route image",
        "url": "https://example.com/storyboard-live-route-image.jpg",
        "sourceKey": "live-route:image:canvas-drop",
        "targetRatioX": 0.28,
        "targetRatioY": 0.22,
        "targetNodeId": "starter-storyboard-beats-card",
    },
    {
        "kind": "video",
        "label": "Live route video",
        "url": "https://example.com/storyboard-live-route-video.mp4",
        "sourceKey": "live-route:video:canvas-drop",
        "targetRatioX": 0.72,
        "targetRatioY": 0.22,
        "targetNodeId": "starter-elements-card",
    },
)
def css_attr_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
def canonical_node_id_suffix(node_id: str) -> str:
    parts = [part.strip() for part in str(node_id or "").split("::") if part.strip()]
    return parts[-1] if parts else str(node_id or "").strip()


def rich_media_overlay_shell_selector(node_id: str) -> str:
    safe_id = css_attr_value(node_id)
    safe_suffix = css_attr_value(canonical_node_id_suffix(node_id))
    return (
        f'[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id="{safe_id}"], '
        f'[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id$="::{safe_suffix}"], '
        f'aside[data-kg-widget="{safe_id}"][data-kg-storyboard-widget-mode="1"], '
        f'aside[data-kg-widget$="::{safe_suffix}"][data-kg-storyboard-widget-mode="1"]'
    )


def _read_visible_rich_media_shell_match(page, node_id: str):
    selector = rich_media_overlay_shell_selector(node_id)
    return page.evaluate(
        """
        ({ selector, nodeId, suffix }) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          if (!candidates.length) return null
          const exact = candidates.find((el) => {
            const dataNodeId = String(el.getAttribute('data-node-id') || '').trim()
            const widgetId = String(el.getAttribute('data-kg-widget') || '').trim()
            return dataNodeId == nodeId || widgetId == nodeId
          })
          const fallback = candidates.find((el) => {
            const dataNodeId = String(el.getAttribute('data-node-id') || '').trim()
            const widgetId = String(el.getAttribute('data-kg-widget') || '').trim()
            return dataNodeId.endsWith(`::${suffix}`) || widgetId.endsWith(`::${suffix}`)
          })
          const shell = exact || fallback || null
          if (!shell) return null
          const rect = shell.getBoundingClientRect()
          return {
            nodeId: String(shell.getAttribute('data-node-id') || shell.getAttribute('data-kg-widget') || '').trim(),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            portCount: shell.querySelectorAll('[data-kg-port-handle="1"]').length,
          }
        }
        """,
        {"selector": selector, "nodeId": node_id, "suffix": canonical_node_id_suffix(node_id)},
    )


def wait_for_workspace_runtime(page) -> None:
    page.goto(TARGET_URL, wait_until="domcontentloaded")
    wait_for_workspace_runtime_ready(page)


def wait_for_workspace_runtime_ready(page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_function(
        """
        () => typeof window.agenticgraphWorkspaceCommand?.applyMarkdownDocument === 'function'
        """,
        timeout=120000,
    )


def apply_starter_markdown(page, markdown_text: str) -> None:
    result = page.evaluate(
        """
        async ({ name, text }) => {
          const command = window.agenticgraphWorkspaceCommand
          if (!command?.applyMarkdownDocument) return { ok: false, reason: 'command-unavailable' }
          const result = await command.applyMarkdownDocument({
            name,
            text,
            applyToGraph: true,
            forceApplyToGraph: true,
            applyViewPreset: true,
            canvasRenderMode: '2d',
            canvas2dRenderer: 'storyboard',
            documentSemanticMode: 'document',
            frontmatterModeEnabled: true,
            workspaceViewMode: 'canvas',
            workspaceCanvasPaneOpen: false,
          })
          return { ok: true, result }
        }
        """,
        {"name": STARTER_DOC_WORKSPACE_NAME, "text": markdown_text},
    )
    if not result.get("ok"):
        raise AssertionError(f"expected starter markdown apply to succeed, got {result}")
    page.wait_for_load_state("networkidle")
    page.wait_for_function(
        """
        () => ['starter-storyboard-beats-card', 'starter-elements-card', 'starter-runtime-gate-card'].every((nodeId) => {
          const el = document.querySelector(`article[data-node-id="${nodeId}"], [data-node-id="${nodeId}"]`)
          const rect = el?.getBoundingClientRect?.()
          return !!rect && rect.width > 0 && rect.height > 0
        })
        """,
        timeout=120000,
    )


def read_storyboard_surface_drop_point(page, target_ratio_x: float, target_ratio_y: float):
    page.wait_for_function(
        """
        () => Array.from(document.querySelectorAll('[data-kg-storyboard-widget-surface-root="storyboard"]')).some((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        """,
        timeout=30000,
    )
    point = page.evaluate(
        """
        ({ targetRatioX, targetRatioY }) => {
          const consumeAttr = '[data-kg-media-drop-consumes-canvas-drop="1"]'
          const candidateOffsets = [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06, 0.08, -0.08, 0.1, -0.1]
          for (const el of document.querySelectorAll('[data-kg-storyboard-widget-surface-root="storyboard"]')) {
            const rect = el.getBoundingClientRect()
            if (!(rect.width > 0 && rect.height > 0)) continue
            let best = null
            for (const offsetY of candidateOffsets) {
              for (const offsetX of candidateOffsets) {
                const ratioX = Math.min(0.92, Math.max(0.08, targetRatioX + offsetX))
                const ratioY = Math.min(0.92, Math.max(0.08, targetRatioY + offsetY))
                const x = rect.x + rect.width * ratioX
                const y = rect.y + rect.height * ratioY
                const hit = document.elementFromPoint(x, y)
                if (hit instanceof Element && hit.closest(consumeAttr)) continue
                const distance = Math.hypot(offsetX, offsetY)
                if (!best || distance < best.distance) {
                  best = { x, y, distance }
                }
              }
            }
            if (best) return { x: best.x, y: best.y }
          }
          return null
        }
        """,
        {"targetRatioX": target_ratio_x, "targetRatioY": target_ratio_y},
    )
    if not point:
        raise AssertionError("expected visible storyboard surface drop point on live route")
    return point


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


def dispatch_media_panel_drop(page, media_case: dict[str, object]) -> str:
    before_ids = set(read_visible_rich_media_shell_ids(page))
    target = read_storyboard_surface_drop_point(
        page,
        float(media_case["targetRatioX"]),
        float(media_case["targetRatioY"]),
    )
    client_x = float(target["x"])
    client_y = float(target["y"])
    page.evaluate(
        """
        ({ clientX, clientY, payload }) => {
          window.dispatchEvent(new CustomEvent('kg:media-pointer-drag-drop', {
            detail: {
              payload,
              clientX,
              clientY,
              startClientX: clientX - 48,
              startClientY: clientY - 48,
            },
          }))
        }
        """,
        {
            "clientX": client_x,
            "clientY": client_y,
            "payload": {
                "kind": str(media_case["kind"]),
                "label": str(media_case["label"]),
                "url": str(media_case["url"]),
                "sourceKey": str(media_case["sourceKey"]),
            },
        },
    )
    page.wait_for_function(
        """
        (beforeIds) => Array.from(document.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"], aside[data-kg-widget][data-kg-storyboard-widget-mode="1"]'))
          .map((el) => String(el.getAttribute('data-node-id') || el.getAttribute('data-kg-widget') || '').trim())
          .filter(Boolean)
          .some((id) => !beforeIds.includes(id))
        """,
        arg=list(before_ids),
        timeout=30000,
    )
    after_ids = [node_id for node_id in read_visible_rich_media_shell_ids(page) if node_id not in before_ids]
    if len(after_ids) != 1:
        raise AssertionError(
            f"expected one new live-route {str(media_case['kind'])} panel, got {after_ids}"
        )
    box = read_visible_rich_media_shell_box(page, after_ids[0])
    expect_rich_media_shell_center_near_target(
        box,
        client_x,
        client_y,
        f"{str(media_case['kind'])} initial drop",
    )
    return after_ids[0]


def click_visible_rich_media_shell(page, node_id: str) -> None:
    page.wait_for_function(
        """
        ({ selector, nodeId, suffix }) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          return candidates.some((el) => {
            const dataNodeId = String(el.getAttribute('data-node-id') || '').trim()
            const widgetId = String(el.getAttribute('data-kg-widget') || '').trim()
            return dataNodeId === nodeId
              || widgetId === nodeId
              || dataNodeId.endsWith(`::${suffix}`)
              || widgetId.endsWith(`::${suffix}`)
          })
        }
        """,
        arg={
            "selector": rich_media_overlay_shell_selector(node_id),
            "nodeId": node_id,
            "suffix": canonical_node_id_suffix(node_id),
        },
        timeout=15000,
    )
    box = read_visible_rich_media_shell_box(page, node_id)
    click_x = float(box["x"]) + min(12.0, max(1.0, float(box["width"]) / 2))
    click_y = float(box["y"]) + min(12.0, max(1.0, float(box["height"]) / 2))
    page.mouse.click(click_x, click_y, delay=50)


def expect_visible_rich_media_shell_ports(page, node_id: str) -> None:
    page.wait_for_function(
        """
        ({ selector, nodeId, suffix }) => {
          const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          return candidates.some((el) => {
            const dataNodeId = String(el.getAttribute('data-node-id') || '').trim()
            const widgetId = String(el.getAttribute('data-kg-widget') || '').trim()
            const isMatch = dataNodeId === nodeId
              || widgetId === nodeId
              || dataNodeId.endsWith(`::${suffix}`)
              || widgetId.endsWith(`::${suffix}`)
            return isMatch && el.querySelectorAll('[data-kg-port-handle="1"]').length > 0
          })
        }
        """,
        arg={
            "selector": rich_media_overlay_shell_selector(node_id),
            "nodeId": node_id,
            "suffix": canonical_node_id_suffix(node_id),
        },
        timeout=15000,
    )


def read_visible_rich_media_shell_box(page, node_id: str):
    box = _read_visible_rich_media_shell_match(page, node_id)
    if not box:
        raise AssertionError(f"expected visible Rich Media panel shell box for {node_id}")
    return box


def expect_rich_media_shell_center_near_target(box, target_x: float, target_y: float, label: str) -> None:
    center_x = float(box["x"]) + float(box["width"]) / 2
    center_y = float(box["y"]) + float(box["height"]) / 2
    distance = ((center_x - target_x) ** 2 + (center_y - target_y) ** 2) ** 0.5
    if distance > 20:
        raise AssertionError(
            f"expected live-route Rich Media panel {label} center near drop target, "
            f"target=({target_x:.1f}, {target_y:.1f}) center=({center_x:.1f}, {center_y:.1f}) distance={distance:.1f}"
        )


def click_visible_storyboard_card(page, node_id: str) -> None:
    selector = f'article[data-node-id="{css_attr_value(node_id)}"], [data-node-id="{css_attr_value(node_id)}"]'
    box = page.evaluate(
        """
        (selector) => {
          const card = Array.from(document.querySelectorAll(selector)).find((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          if (!card) return null
          const rect = card.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        """,
        selector,
    )
    if not box:
        raise AssertionError(f"expected visible Storyboard card for {node_id}")
    click_x = float(box["x"]) + min(16.0, max(2.0, float(box["width"]) / 2))
    click_y = float(box["y"]) + min(16.0, max(2.0, float(box["height"]) / 2))
    page.mouse.click(click_x, click_y, delay=50)


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


def expect_rich_media_shell_box_stable(before, after, label: str) -> None:
    for key in ("x", "y", "width", "height"):
        if abs(float(before[key]) - float(after[key])) > 0.75:
            raise AssertionError(
                f"expected live-route Rich Media panel {label} {key} to remain stable, before={before} after={after}"
            )


def read_storyboard_edge_ids(page):
    return page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-kg-overlay-edge-id], [data-kg-storyboard-canvas-edge-id]'))
          .map((el) => String(el.getAttribute('data-kg-overlay-edge-id') || el.getAttribute('data-kg-storyboard-canvas-edge-id') || '').trim())
          .filter(Boolean)
        """
    )


def read_storyboard_edge_count(page) -> int:
    return len(read_storyboard_edge_ids(page))


def expect_pending_storyboard_edge_visible(page) -> bool:
    try:
        page.wait_for_selector('[data-kg-overlay-pending-edge="true"]', state="attached", timeout=10000)
        return True
    except PlaywrightTimeoutError:
        return False


def drag_rich_media_port_to_storyboard_card(page, source_node_id: str, target_node_id: str) -> str:
    source_suffix = canonical_node_id_suffix(source_node_id)
    source_selector = (
        f'button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-node-id="{css_attr_value(source_node_id)}"], '
        f'button[data-kg-port-handle="1"][data-kg-port-dir="out"][data-kg-port-node-id$="::{css_attr_value(source_suffix)}"]'
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
        arg={"selector": source_selector, "nodeId": source_node_id, "suffix": source_suffix},
        timeout=15000,
    )
    source_box = page.evaluate(
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
        {"selector": source_selector, "nodeId": source_node_id, "suffix": source_suffix},
    )
    if not source_box:
        raise AssertionError(f"expected source port geometry for {source_node_id}")
    before_edges = set(read_storyboard_edge_ids(page))
    page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
    page.mouse.down()
    target_card_box = read_visible_storyboard_card_box(page, target_node_id)
    if target_card_box:
        target_card_x = target_card_box["x"] + target_card_box["width"] / 2
        target_card_y = target_card_box["y"] + target_card_box["height"] / 2
        preview_probe_x = source_box["x"] + source_box["width"] / 2 + (target_card_x - (source_box["x"] + source_box["width"] / 2)) * 0.35
        preview_probe_y = source_box["y"] + source_box["height"] / 2 + (target_card_y - (source_box["y"] + source_box["height"] / 2)) * 0.35
        page.mouse.move(preview_probe_x, preview_probe_y, steps=6)
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
    target_x = target_box["x"] + target_box["width"] / 2
    target_y = target_box["y"] + target_box["height"] / 2
    page.mouse.move(target_x, target_y, steps=8)
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
        raise AssertionError(f"expected one created live-route Storyboard edge, got {created_ids}")
    page.wait_for_timeout(RETENTION_OBSERVATION_MS)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_ids[0] not in retained_edges:
        raise AssertionError(f"expected created live-route Storyboard edge to remain visible, got {sorted(retained_edges)}")
    return created_ids[0]


def assert_live_route_media_panel_retention(page, node_id: str, target_node_id: str, media_kind: str) -> str:
    click_visible_storyboard_card(page, target_node_id)
    click_visible_rich_media_shell(page, node_id)
    expect_visible_rich_media_shell_ports(page, node_id)
    selected_box = read_visible_rich_media_shell_box(page, node_id)
    created_edge_id = drag_rich_media_port_to_storyboard_card(page, node_id, target_node_id)
    box_after_edge_create = read_visible_rich_media_shell_box(page, node_id)
    expect_rich_media_shell_box_stable(selected_box, box_after_edge_create, f"{media_kind} after edge create")
    click_visible_rich_media_shell(page, node_id)
    expect_visible_rich_media_shell_ports(page, node_id)
    page.wait_for_timeout(RETENTION_OBSERVATION_MS)
    retained_edges = set(read_storyboard_edge_ids(page))
    if created_edge_id not in retained_edges:
        raise AssertionError(f"expected selected/open live-route panel to retain Storyboard edge visibility, got {sorted(retained_edges)}")
    reopened_box = read_visible_rich_media_shell_box(page, node_id)
    expect_rich_media_shell_box_stable(selected_box, reopened_box, f"{media_kind} after select/open retention")
    return created_edge_id


def assert_reapply_clears_live_route_residue(
    page,
    markdown_text: str,
    created_node_id: str,
    created_edge_id: str,
    baseline_edge_count: int,
    baseline_shell_ids: set[str],
) -> None:
    apply_starter_markdown(page, markdown_text)
    assert_live_route_returns_to_baseline(
        page,
        created_node_id,
        created_edge_id,
        baseline_edge_count,
        baseline_shell_ids,
        "source reapply",
    )


def assert_live_route_returns_to_baseline(
    page,
    created_node_id: str,
    created_edge_id: str,
    baseline_edge_count: int,
    baseline_shell_ids: set[str],
    phase_label: str,
) -> None:
    try:
        page.wait_for_function(
            """
            ({ createdNodeId, createdEdgeId, baselineShellIds, baselineEdgeCount }) => {
              const visibleShellIds = Array.from(document.querySelectorAll('[data-kg-rich-media-storyboard-widget-overlay-shell="1"], aside[data-kg-widget][data-kg-storyboard-widget-mode="1"]'))
                .filter((el) => {
                  const rect = el.getBoundingClientRect()
                  return rect.width > 0 && rect.height > 0
                })
                .map((el) => String(el.getAttribute('data-node-id') || el.getAttribute('data-kg-widget') || '').trim())
                .filter(Boolean)
                .filter((id, index, ids) => ids.indexOf(id) === index)
              const visibleEdgeIds = Array.from(document.querySelectorAll('[data-kg-overlay-edge-id], [data-kg-storyboard-canvas-edge-id]'))
                .map((el) => String(el.getAttribute('data-kg-overlay-edge-id') || el.getAttribute('data-kg-storyboard-canvas-edge-id') || '').trim())
                .filter(Boolean)
              const sameShellSet = visibleShellIds.length === baselineShellIds.length
                && visibleShellIds.every((id) => baselineShellIds.includes(id))
              return !visibleShellIds.includes(createdNodeId)
                && !visibleEdgeIds.includes(createdEdgeId)
                && sameShellSet
                && visibleEdgeIds.length === baselineEdgeCount
            }
            """,
            arg={
                "createdNodeId": created_node_id,
                "createdEdgeId": created_edge_id,
                "baselineShellIds": sorted(baseline_shell_ids),
                "baselineEdgeCount": baseline_edge_count,
            },
            timeout=30000,
        )
    except Exception as error:
        visible_shell_ids = set(read_visible_rich_media_shell_ids(page))
        visible_edge_ids = set(read_storyboard_edge_ids(page))
        raise AssertionError(
            f"expected live-route {phase_label} to clear transient residue, "
            f"baselineShellIds={sorted(baseline_shell_ids)} currentShellIds={sorted(visible_shell_ids)} "
            f"createdNodeId={created_node_id} baselineEdgeCount={baseline_edge_count} "
            f"currentEdgeIds={sorted(visible_edge_ids)} createdEdgeId={created_edge_id}"
        ) from error
    visible_shell_ids = set(read_visible_rich_media_shell_ids(page))
    if visible_shell_ids != baseline_shell_ids:
        raise AssertionError(
            f"expected live-route Rich Media shells to return to baseline after {phase_label}, baseline={sorted(baseline_shell_ids)} current={sorted(visible_shell_ids)}"
        )
    visible_edge_ids = set(read_storyboard_edge_ids(page))
    if created_edge_id in visible_edge_ids:
        raise AssertionError(
            f"expected created live-route Storyboard edge to disappear after {phase_label}, got {sorted(visible_edge_ids)}"
        )
    if len(visible_edge_ids) != baseline_edge_count:
        raise AssertionError(
            f"expected live-route Storyboard edge count to return to baseline after {phase_label}, baseline={baseline_edge_count} current={len(visible_edge_ids)}"
        )


def assert_reload_keeps_live_route_cleanup(
    page,
    created_node_id: str,
    created_edge_id: str,
    baseline_edge_count: int,
    baseline_shell_ids: set[str],
) -> None:
    page.reload(wait_until="domcontentloaded")
    wait_for_workspace_runtime_ready(page)
    assert_live_route_returns_to_baseline(
        page,
        created_node_id,
        created_edge_id,
        baseline_edge_count,
        baseline_shell_ids,
        "page reload",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    markdown_text = STARTER_DOC_PATH.read_text(encoding="utf-8")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1680, "height": 1200})
            wait_for_workspace_runtime(page)
            for media_case in MEDIA_CASES:
                apply_starter_markdown(page, markdown_text)
                baseline_shell_ids = set(read_visible_rich_media_shell_ids(page))
                baseline_edge_count = read_storyboard_edge_count(page)
                node_id = dispatch_media_panel_drop(page, media_case)
                created_edge_id = assert_live_route_media_panel_retention(
                    page,
                    node_id,
                    str(media_case["targetNodeId"]),
                    str(media_case["kind"]),
                )
                assert_reapply_clears_live_route_residue(
                    page,
                    markdown_text,
                    node_id,
                    created_edge_id,
                    baseline_edge_count,
                    baseline_shell_ids,
                )
                assert_reload_keeps_live_route_cleanup(
                    page,
                    node_id,
                    created_edge_id,
                    baseline_edge_count,
                    baseline_shell_ids,
                )
            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            print(f"OK storyboard-live-route-media-panel-retention {TARGET_URL}")
            print(f"Screenshot: {SCREENSHOT_PATH}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
