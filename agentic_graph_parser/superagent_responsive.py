from typing import List, Tuple

from .superagent_contracts import (
    BALANCED_LAYOUT_FRAME,
    BALANCED_WIDGET_LAYOUT,
    JsonDict,
    RICH_MEDIA_PANEL_EDGE_LANES,
    RICH_MEDIA_PANEL_EDGE_IDS,
)

REQUIRED_RESPONSIVE_WIDGET_IDS = ["text-plan", "image-reference", "video-storyboard", "rich-media-panel"]
RESPONSIVE_PROOF_CLASSES = [
    {
        "id": "mobile-320x640",
        "label": "Mobile baseline",
        "width": 320,
        "height": 640,
        "category": "mobile",
        "mode": "single-panel-stack",
        "safeArea": {"top": 16, "right": 12, "bottom": 20, "left": 12},
        "minHitTarget": 44,
    },
    {
        "id": "mobile-390x844",
        "label": "Large mobile",
        "width": 390,
        "height": 844,
        "category": "mobile",
        "mode": "single-panel-stack",
        "safeArea": {"top": 18, "right": 14, "bottom": 24, "left": 14},
        "minHitTarget": 44,
    },
    {
        "id": "tablet-768x1024",
        "label": "Tablet split view",
        "width": 768,
        "height": 1024,
        "category": "tablet",
        "mode": "two-column-workspace",
        "safeArea": {"top": 24, "right": 24, "bottom": 28, "left": 24},
        "minHitTarget": 44,
    },
    {
        "id": "desktop-1366x768",
        "label": "Desktop app shell",
        "width": 1366,
        "height": 768,
        "category": "desktop",
        "mode": "scaled-canvas-with-panels",
        "safeArea": {"top": 32, "right": 32, "bottom": 32, "left": 32},
        "minHitTarget": 40,
    },
    {
        "id": "wide-1920x1080",
        "label": "Wide balanced canvas",
        "width": 1920,
        "height": 1080,
        "category": "wide",
        "mode": "balanced-presentation-frame",
        "safeArea": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        "minHitTarget": 40,
    },
]


def required_responsive_proof_class_ids() -> List[str]:
    return [str(viewport["id"]) for viewport in RESPONSIVE_PROOF_CLASSES]


def build_responsive_layout_metadata() -> JsonDict:
    return {
        "sourceFrame": dict(BALANCED_LAYOUT_FRAME),
        "requiredWidgetIds": list(REQUIRED_RESPONSIVE_WIDGET_IDS),
        "requiredEdgeIds": sorted(RICH_MEDIA_PANEL_EDGE_IDS),
        "proofClasses": [_build_viewport_proof(viewport) for viewport in RESPONSIVE_PROOF_CLASSES],
    }


def render_responsive_frontmatter_lines() -> List[str]:
    lines = ["kgSuperAgentResponsive:", "  strategy: mobile-first", "  sourceFrame: balanced-16x9", "  proofClasses:"]
    for viewport in build_responsive_layout_metadata()["proofClasses"]:
        lines.extend(
            [
                f"    - id: {viewport['id']}",
                f"      width: {viewport['width']}",
                f"      height: {viewport['height']}",
                f"      category: {viewport['category']}",
                f"      mode: {viewport['mode']}",
                f"      minHitTarget: {viewport['minHitTarget']}",
                f"      panelPolicy: {viewport['panelPolicy']}",
                f"      canvasPolicy: {viewport['canvasPolicy']}",
                f"      edgePolicy: {viewport['edgePolicy']['strategy']}",
                f"      requiredWidgets: [{', '.join(REQUIRED_RESPONSIVE_WIDGET_IDS)}]",
            ]
        )
    return lines


def build_responsive_verification_checks(layout_meta: JsonDict, workspace_text: str) -> List[JsonDict]:
    responsive = layout_meta.get("responsive") if isinstance(layout_meta.get("responsive"), dict) else {}
    proof_classes = responsive.get("proofClasses") if isinstance(responsive.get("proofClasses"), list) else []
    proof_by_id = {str(proof.get("id") or ""): proof for proof in proof_classes if isinstance(proof, dict)}
    required_ids = set(required_responsive_proof_class_ids())
    checks = [
        {
            "id": "responsive:proof_classes",
            "passed": required_ids.issubset(set(proof_by_id)),
            "detail": sorted(proof_by_id),
        }
    ]
    widget_failures: List[str] = []
    edge_failures: List[str] = []
    control_failures: List[str] = []
    for proof_id in required_responsive_proof_class_ids():
        proof = proof_by_id.get(proof_id)
        if not proof:
            widget_failures.append(f"{proof_id}:missing")
            continue
        if not _controls_are_touch_safe(proof):
            control_failures.append(proof_id)
        widget_failures.extend(_widget_failures(proof))
        edge_policy = proof.get("edgePolicy") if isinstance(proof.get("edgePolicy"), dict) else {}
        edge_ids = set(edge_policy.get("reachableEdgeIds") if isinstance(edge_policy.get("reachableEdgeIds"), list) else [])
        if not bool(edge_policy.get("readable")) or not set(RICH_MEDIA_PANEL_EDGE_IDS).issubset(edge_ids):
            edge_failures.append(proof_id)
    checks.extend(
        [
            {"id": "responsive:widget_reachability", "passed": not widget_failures, "detail": widget_failures},
            {"id": "responsive:edge_reachability", "passed": not edge_failures, "detail": edge_failures},
            {"id": "responsive:touch_controls", "passed": not control_failures, "detail": control_failures},
            {
                "id": "responsive:workspace_metadata",
                "passed": _workspace_has_responsive_metadata(workspace_text),
                "detail": "kgSuperAgentResponsive",
            },
        ]
    )
    return checks


def responsive_evidence_from_checks(checks: List[JsonDict]) -> JsonDict:
    responsive_checks = [check for check in checks if str(check.get("id") or "").startswith("responsive:")]
    return {
        "passed": bool(responsive_checks) and all(bool(check.get("passed")) for check in responsive_checks),
        "proof_class_ids": required_responsive_proof_class_ids(),
        "check_count": len(responsive_checks),
        "checks": responsive_checks,
    }


def _build_viewport_proof(viewport: JsonDict) -> JsonDict:
    width = int(viewport["width"])
    height = int(viewport["height"])
    mode = str(viewport["mode"])
    proof = {
        **viewport,
        "panelPolicy": "bottom-sheet" if str(viewport["category"]) == "mobile" else "inline-or-drawer",
        "canvasPolicy": "overview-plus-focus" if str(viewport["category"]) == "mobile" else "fit-visible-graph",
        "widgets": {},
        "edgePolicy": {
            "strategy": "focus-mode-port-summary" if str(viewport["category"]) == "mobile" else "fan-in-readable",
            "readable": True,
            "anchorPolicy": "explicit-handles",
            "reachableEdgeIds": sorted(RICH_MEDIA_PANEL_EDGE_IDS),
            "laneIndexByEdgeId": dict(RICH_MEDIA_PANEL_EDGE_LANES),
            "avoidWidgetContent": True,
        },
        "controls": {
            "fitOverview": True,
            "focusPreviousNext": True,
            "panelDismiss": True,
            "safeAreaAware": True,
        },
    }
    for node_id in REQUIRED_RESPONSIVE_WIDGET_IDS:
        proof["widgets"][node_id] = _widget_viewport_policy(node_id, width, height, viewport, mode)
    return proof


def _widget_viewport_policy(node_id: str, width: int, height: int, viewport: JsonDict, mode: str) -> JsonDict:
    if mode == "single-panel-stack":
        return _single_panel_widget_policy(node_id, width, height, viewport)
    if mode == "two-column-workspace":
        return _grid_widget_policy(node_id, width, height, viewport, columns=2)
    if mode == "balanced-presentation-frame":
        return _scaled_widget_policy(node_id, width, height, viewport, preserve_source=True)
    return _scaled_widget_policy(node_id, width, height, viewport, preserve_source=False)


def _single_panel_widget_policy(node_id: str, width: int, height: int, viewport: JsonDict) -> JsonDict:
    left, top, safe_width, safe_height = _safe_box(width, height, viewport)
    toolbar = 56
    gap = 12
    y = top + toolbar + gap
    focus_height = max(240, min(560, safe_height - toolbar - (gap * 2)))
    return _widget_policy(node_id, "focus-sheet", (left, y, safe_width, focus_height), "scroll")


def _grid_widget_policy(node_id: str, width: int, height: int, viewport: JsonDict, *, columns: int) -> JsonDict:
    left, top, safe_width, safe_height = _safe_box(width, height, viewport)
    gap = 16
    index = REQUIRED_RESPONSIVE_WIDGET_IDS.index(node_id)
    col = index % columns
    row = index // columns
    cell_width = (safe_width - gap * (columns - 1)) / columns
    cell_height = (safe_height - gap) / 2
    x = left + col * (cell_width + gap)
    y = top + row * (cell_height + gap)
    return _widget_policy(node_id, "visible-grid", (x, y, cell_width, cell_height), "fit")


def _scaled_widget_policy(node_id: str, width: int, height: int, viewport: JsonDict, *, preserve_source: bool) -> JsonDict:
    if preserve_source:
        layout = BALANCED_WIDGET_LAYOUT[node_id]
        return _widget_policy(node_id, "source-frame", (layout["x"], layout["y"], layout["width"], layout["height"]), "fit")
    left, top, safe_width, safe_height = _safe_box(width, height, viewport)
    frame_w = float(BALANCED_LAYOUT_FRAME["width"])
    frame_h = float(BALANCED_LAYOUT_FRAME["height"])
    scale = min(safe_width / frame_w, safe_height / frame_h)
    x_offset = left + (safe_width - frame_w * scale) / 2
    y_offset = top + (safe_height - frame_h * scale) / 2
    layout = BALANCED_WIDGET_LAYOUT[node_id]
    rect = (
        x_offset + float(layout["x"]) * scale,
        y_offset + float(layout["y"]) * scale,
        float(layout["width"]) * scale,
        float(layout["height"]) * scale,
    )
    return _widget_policy(node_id, "scaled-frame", rect, "fit")


def _widget_policy(node_id: str, strategy: str, rect: Tuple[float, float, float, float], overflow: str) -> JsonDict:
    x, y, width, height = rect
    layout = BALANCED_WIDGET_LAYOUT[node_id]
    return {
        "reachable": True,
        "role": layout["role"],
        "index": {
            "x": int(layout.get("xIndex") or 0),
            "y": int(layout.get("yIndex") or 0),
            "z": int(layout.get("zIndex") or 0),
        },
        "strategy": strategy,
        "rect": {"x": round(x, 2), "y": round(y, 2), "width": round(width, 2), "height": round(height, 2)},
        "minSize": {"width": min(280, int(layout["width"])), "height": min(220, int(layout["height"]))},
        "overflow": overflow,
    }


def _safe_box(width: int, height: int, viewport: JsonDict) -> Tuple[float, float, float, float]:
    safe = viewport.get("safeArea") if isinstance(viewport.get("safeArea"), dict) else {}
    left = float(safe.get("left") or 0)
    top = float(safe.get("top") or 0)
    right = float(safe.get("right") or 0)
    bottom = float(safe.get("bottom") or 0)
    return left, top, max(1.0, width - left - right), max(1.0, height - top - bottom)


def _widget_failures(proof: JsonDict) -> List[str]:
    failures = []
    width = float(proof.get("width") or 0)
    height = float(proof.get("height") or 0)
    widgets = proof.get("widgets") if isinstance(proof.get("widgets"), dict) else {}
    for node_id in REQUIRED_RESPONSIVE_WIDGET_IDS:
        widget = widgets.get(node_id) if isinstance(widgets.get(node_id), dict) else {}
        rect = widget.get("rect") if isinstance(widget.get("rect"), dict) else {}
        if not widget.get("reachable"):
            failures.append(f"{proof.get('id')}:{node_id}:unreachable")
        if not _rect_inside_viewport(rect, width, height):
            failures.append(f"{proof.get('id')}:{node_id}:out-of-bounds")
    return failures


def _rect_inside_viewport(rect: JsonDict, width: float, height: float) -> bool:
    values = [rect.get("x"), rect.get("y"), rect.get("width"), rect.get("height")]
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in values):
        return False
    x, y, w, h = [float(value) for value in values]
    return x >= 0 and y >= 0 and w > 0 and h > 0 and x + w <= width + 0.01 and y + h <= height + 0.01


def _controls_are_touch_safe(proof: JsonDict) -> bool:
    controls = proof.get("controls") if isinstance(proof.get("controls"), dict) else {}
    category = str(proof.get("category") or "")
    min_hit_target = int(proof.get("minHitTarget") or 0)
    required = ["fitOverview", "focusPreviousNext", "panelDismiss", "safeAreaAware"]
    return all(bool(controls.get(key)) for key in required) and (category not in {"mobile", "tablet"} or min_hit_target >= 44)


def _workspace_has_responsive_metadata(workspace_text: str) -> bool:
    tokens = ["kgSuperAgentResponsive:", "strategy: mobile-first", "mobile-320x640", "tablet-768x1024", "wide-1920x1080"]
    return bool(workspace_text) and all(token in workspace_text for token in tokens)
