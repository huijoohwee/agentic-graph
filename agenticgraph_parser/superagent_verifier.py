import os
from typing import List, Optional, Tuple

from .common import read_text, utc_now_iso, write_json
from .superagent_contracts import (
    BALANCED_LAYOUT_ID,
    BALANCED_WIDGET_LAYOUT,
    ERROR_FATAL,
    HarnessError,
    JsonDict,
    RICH_MEDIA_PANEL_EDGE_LANES,
    RICH_MEDIA_PANEL_EDGE_IDS,
    RICH_MEDIA_SURFACE_ROUTE,
    SUPERAGENT_TASK_CAPABILITIES,
)
from .superagent_plan import build_plan
from .superagent_responsive import build_responsive_verification_checks, responsive_evidence_from_checks
from .superagent_utils import read_trace_events

def tool_judge_verify(payload: JsonDict) -> JsonDict:
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    canvas_result = payload.get("canvas_result") if isinstance(payload.get("canvas_result"), dict) else {}
    canvas = canvas_result.get("canvas") if isinstance(canvas_result.get("canvas"), dict) else {}
    graph = canvas.get("graph") if isinstance(canvas.get("graph"), dict) else {}
    checks: List[JsonDict] = []

    artifacts = state.get("artifacts") if isinstance(state.get("artifacts"), list) else []
    artifact_kinds = {str(a.get("kind")) for a in artifacts if isinstance(a, dict)}
    for kind in ["brief", "skill", "research", "code", "sandbox", "text", "image", "video", "canvas", "workspace"]:
        checks.append({"id": f"artifact:{kind}", "passed": kind in artifact_kinds, "detail": f"{kind} artifact recorded"})

    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    node_types = {str(n.get("type")) for n in nodes if isinstance(n, dict)}
    flow_form_ids = {
        str((n.get("properties") or {}).get("flow:widgetFormId") or "")
        for n in nodes
        if isinstance(n, dict) and isinstance(n.get("properties"), dict)
    }
    checks.append({"id": "canvas:has_text_node", "passed": "TextGeneration" in node_types, "detail": "text node present"})
    checks.append({"id": "canvas:has_skill_node", "passed": "SkillSelector" in node_types, "detail": "skill selector node present"})
    checks.append({"id": "canvas:has_research_node", "passed": "ResearchAgent" in node_types, "detail": "research node present"})
    checks.append({"id": "canvas:has_code_node", "passed": "CodeWorker" in node_types, "detail": "code node present"})
    checks.append({"id": "canvas:has_image_node", "passed": "ImageGeneration" in node_types, "detail": "image node present"})
    checks.append({"id": "canvas:has_video_node", "passed": "VideoGeneration" in node_types, "detail": "video node present"})
    checks.append({"id": "canvas:has_rich_media_panel", "passed": "RichMediaPanel" in node_types, "detail": "Rich Media Panel node present"})
    checks.append({"id": "canvas:has_edges", "passed": len(edges) >= 8, "detail": f"{len(edges)} edges"})
    checks.append(
        {
            "id": "canvas:widget_form_ids",
            "passed": {"textGeneration", "imageGeneration", "videoGeneration", "richMediaPanel"}.issubset(flow_form_ids),
            "detail": sorted(flow_form_ids),
        }
    )
    panel_targets = {
        str(edge.get("targetHandle") or "")
        for edge in edges
        if isinstance(edge, dict) and str(edge.get("target") or "") == "rich-media-panel"
    }
    checks.append(
        {
            "id": "canvas:rich_media_panel_ports",
            "passed": {"output", "imageUrl", "videoUrl"}.issubset(panel_targets),
            "detail": sorted(panel_targets),
        }
    )
    graph_meta = graph.get("metadata") if isinstance(graph.get("metadata"), dict) else {}
    capabilities = graph_meta.get("capabilities") if isinstance(graph_meta.get("capabilities"), list) else []
    checks.append(
        {
            "id": "harness:research_code_create_capabilities",
            "passed": set(SUPERAGENT_TASK_CAPABILITIES).issubset({str(item) for item in capabilities}),
            "detail": capabilities,
        }
    )
    checks.append(
        {
            "id": "surface:route",
            "passed": str(graph.get("metadata", {}).get("surfaceRoute") if isinstance(graph.get("metadata"), dict) else "") == RICH_MEDIA_SURFACE_ROUTE,
            "detail": RICH_MEDIA_SURFACE_ROUTE,
        }
    )
    layout_meta = graph_meta.get("layout") if isinstance(graph_meta.get("layout"), dict) else {}
    frame = layout_meta.get("frame") if isinstance(layout_meta.get("frame"), dict) else {}
    required_layout_node_ids = ["text-plan", "image-reference", "video-storyboard", "rich-media-panel"]
    node_by_id = {str(node.get("id") or ""): node for node in nodes if isinstance(node, dict)}

    def node_rect(node_id: str) -> Optional[Tuple[float, float, float, float]]:
        node = node_by_id.get(node_id)
        if not node:
            return None
        props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
        x = node.get("x")
        y = node.get("y")
        w = props.get("visual:width")
        h = props.get("visual:height")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in [x, y, w, h]):
            return None
        return (float(x), float(y), float(w), float(h))

    rects = {node_id: node_rect(node_id) for node_id in required_layout_node_ids}
    frame_w = frame.get("width")
    frame_h = frame.get("height")
    frame_ok = frame.get("id") == BALANCED_LAYOUT_ID and frame_w == 1920 and frame_h == 1080 and frame.get("aspectRatio") == "16:9"
    inside_frame = True
    non_overlapping = True
    indices_ok = True
    for node_id, rect in rects.items():
        if not rect:
            inside_frame = False
            continue
        x, y, w, h = rect
        if x < 0 or y < 0 or x + w > 1920 or y + h > 1080:
            inside_frame = False
        node = node_by_id.get(node_id)
        props = node.get("properties") if isinstance(node, dict) and isinstance(node.get("properties"), dict) else {}
        layout = BALANCED_WIDGET_LAYOUT.get(node_id) or {}
        expected_indices = {
            "visual:xIndex": layout.get("xIndex"),
            "visual:yIndex": layout.get("yIndex"),
            "visual:zIndex": layout.get("zIndex"),
        }
        for key, expected in expected_indices.items():
            if expected is None:
                continue
            if props.get(key) != expected:
                indices_ok = False
    rect_items = [(node_id, rect) for node_id, rect in rects.items() if rect]
    for i in range(len(rect_items)):
        a_id, a = rect_items[i]
        ax, ay, aw, ah = a  # type: ignore[misc]
        for j in range(i + 1, len(rect_items)):
            b_id, b = rect_items[j]
            bx, by, bw, bh = b  # type: ignore[misc]
            separated = ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay
            if not separated:
                non_overlapping = False
                break
        if not non_overlapping:
            break
    centroid_ok = False
    centroid_detail: JsonDict = {}
    if len(rect_items) == len(required_layout_node_ids):
        center_x = sum(float(rect[0]) + float(rect[2]) / 2 for _, rect in rect_items) / len(rect_items)
        center_y = sum(float(rect[1]) + float(rect[3]) / 2 for _, rect in rect_items) / len(rect_items)
        target = frame.get("centroid") if isinstance(frame.get("centroid"), dict) else {}
        target_x = float(target.get("x") or 960)
        target_y = float(target.get("y") or 540)
        tolerance = float(target.get("tolerance") or 1)
        centroid_ok = abs(center_x - target_x) <= tolerance and abs(center_y - target_y) <= tolerance
        centroid_detail = {
            "x": round(center_x, 2),
            "y": round(center_y, 2),
            "target": {"x": target_x, "y": target_y, "tolerance": tolerance},
        }
    checks.append(
        {
            "id": "layout:balanced_16x9_widgets",
            "passed": bool(frame_ok and inside_frame and non_overlapping and indices_ok and centroid_ok),
            "detail": {"frame": frame, "rects": rects, "centroid": centroid_detail, "indices": indices_ok},
        }
    )
    routed_panel_edges = {
        str(edge.get("id") or ""): edge
        for edge in edges
        if isinstance(edge, dict) and str(edge.get("id") or "") in RICH_MEDIA_PANEL_EDGE_IDS
    }
    edge_routes_ok = len(routed_panel_edges) == len(RICH_MEDIA_PANEL_EDGE_IDS)
    for edge in routed_panel_edges.values():
        props = edge.get("properties") if isinstance(edge.get("properties"), dict) else {}
        route = props.get("layoutRoute") if isinstance(props.get("layoutRoute"), dict) else {}
        if route.get("frame") != BALANCED_LAYOUT_ID or route.get("strategy") != "fan-in-readable":
            edge_routes_ok = False
            break
        lane = RICH_MEDIA_PANEL_EDGE_LANES.get(str(edge.get("id") or ""))
        if lane is not None and route.get("laneIndex") != lane:
            edge_routes_ok = False
            break
        if route.get("avoidWidgetContent") is not True:
            edge_routes_ok = False
            break
    checks.append(
        {
            "id": "layout:balanced_16x9_edges",
            "passed": edge_routes_ok,
            "detail": sorted(routed_panel_edges.keys()),
        }
    )

    artifact_paths = [str(a.get("path") or "") for a in artifacts if isinstance(a, dict)]
    missing_paths = [path for path in artifact_paths if path and not os.path.exists(path)]
    checks.append({"id": "artifacts:paths_exist", "passed": not missing_paths, "detail": missing_paths[:5]})

    workspace_path = str(canvas.get("workspace_path") or "")
    if not workspace_path:
        for artifact in artifacts:
            if isinstance(artifact, dict) and artifact.get("artifact_id") == "workspace_rich_media_flow":
                workspace_path = str(artifact.get("path") or "")
                break
    workspace_text = read_text(workspace_path) if workspace_path and os.path.exists(workspace_path) else ""
    workspace_tokens = [
        'kgCanvas2dRenderer: "storyboard"',
        "TextGeneration",
        "SkillSelector",
        "ResearchAgent",
        "CodeWorker",
        "ImageGeneration",
        "VideoGeneration",
        "RichMediaPanel",
        "flow:widgetFormId",
        "richMediaPanel",
        "kgSuperAgentCapabilities:",
        "kgSuperAgentTaskLevels:",
        "kgSuperAgentMessageGateway:",
        "kgSuperAgentSandbox:",
        "kgSuperAgentLayout:",
        "frontmatterFlowSettings:",
        "balancedViewportPreset: widgetFrontmatter",
        "balancedHeroRowCount: 3",
        "position: {key: position, type: object",
        "visual:xIndex",
        "visual:yIndex",
        "visual:zIndex",
        f'layoutRoute: "{BALANCED_LAYOUT_ID}:fan-in-readable"',
        "layoutLane: 0",
        "sourceHandle: text_out",
        "targetHandle: videoUrl",
    ]
    checks.append(
        {
            "id": "workspace:frontmatter_flow_rich_media_panel",
            "passed": bool(workspace_text) and all(token in workspace_text for token in workspace_tokens),
            "detail": workspace_path,
        }
    )
    checks.extend(build_responsive_verification_checks(layout_meta, workspace_text))

    observations = state.get("memory", {}).get("observations", {}) if isinstance(state.get("memory"), dict) else {}
    code_observation = observations.get("code_sandbox") if isinstance(observations.get("code_sandbox"), dict) else {}
    code_payload = code_observation.get("code") if isinstance(code_observation.get("code"), dict) else {}
    sandbox_payload = code_payload.get("sandbox") if isinstance(code_payload.get("sandbox"), dict) else {}
    checks.append(
        {
            "id": "sandbox:generated_code_passed",
            "passed": bool(sandbox_payload.get("passed")) and int(sandbox_payload.get("returncode") or 0) == 0,
            "detail": {
                "code_path": code_payload.get("path"),
                "sandbox_result_path": code_payload.get("sandbox_result_path"),
                "returncode": sandbox_payload.get("returncode"),
            },
        }
    )

    trace_path = os.path.join(str(payload["output_dir"]), "trace.jsonl")
    trace_events = read_trace_events(trace_path)
    event_names = {str(event.get("event")) for event in trace_events}
    for event_name in ["run.start", "task.dispatch", "tool.call", "tool.observation", "step.complete"]:
        checks.append({"id": f"trace:{event_name}", "passed": event_name in event_names, "detail": event_name})

    provenance_ok = True
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        if not str(artifact.get("source_step_id") or ""):
            provenance_ok = False
            break
    checks.append({"id": "provenance:artifact_source_steps", "passed": provenance_ok, "detail": "artifact source steps recorded"})

    completed = set(state.get("completed_task_ids") if isinstance(state.get("completed_task_ids"), list) else [])
    provider_mode = str(state.get("run", {}).get("provider_mode") or "mock") if isinstance(state.get("run"), dict) else "mock"
    agent_definition_id = str(state.get("run", {}).get("agent_definition_id") or "agent.video") if isinstance(state.get("run"), dict) else "agent.video"
    expected_before_verify = {
        task.task_id for task in build_plan(provider_mode, agent_definition_id) if task.task_id not in {"verify_outputs", "synthesize_report"}
    }
    checks.append(
        {
            "id": "termination:ready_for_synthesis",
            "passed": expected_before_verify.issubset(completed),
            "detail": sorted(expected_before_verify - completed),
        }
    )

    verification = {
        "passed": all(bool(check.get("passed")) for check in checks),
        "checks": checks,
        "checked_at": utc_now_iso(),
    }
    if not verification["passed"]:
        raise HarnessError("Verification failed", ERROR_FATAL, {"checks": checks})
    responsive_path = os.path.join(str(payload["output_dir"]), "artifacts", "responsive", "responsive-proof.json")
    write_json(
        responsive_path,
        {
            "schema_version": "knowgrph.superagent.responsive-proof.v1",
            "run_id": str(payload["run_id"]),
            "checked_at": verification["checked_at"],
            "responsive": responsive_evidence_from_checks(checks),
        },
    )
    return {
        "verification": verification,
        "artifacts": [
            {
                "artifact_id": "responsive_verification",
                "kind": "proof",
                "path": responsive_path,
                "media_type": "application/json",
                "source_step_id": str(payload["step_id"]),
                "metadata": {"schema_version": "knowgrph.superagent.responsive-proof.v1"},
            }
        ],
    }
