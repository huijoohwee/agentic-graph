import html
import json
import os
import re
from dataclasses import asdict
from typing import Any, List, Optional, Tuple

try:
    import yaml
except Exception:  # pragma: no cover - exercised only when optional dependency is absent.
    yaml = None

from .common import sha256_text
from .superagent_contracts import (
    ArtifactRecord,
    BALANCED_LAYOUT_FRAME,
    BALANCED_LAYOUT_ID,
    BALANCED_WIDGET_LAYOUT,
    JsonDict,
    RICH_MEDIA_PANEL_EDGE_LANES,
    RICH_MEDIA_PANEL_EDGE_IDS,
    RICH_MEDIA_SURFACE_ROUTE,
    SUPERAGENT_TASK_CAPABILITIES,
    SUPERAGENT_TASK_LEVELS,
)
from .superagent_proof_manifest import render_harness_proof_manifest_report_lines
from .superagent_responsive import build_responsive_layout_metadata, render_responsive_frontmatter_lines
from .superagent_utils import clip_sentence, normalize_space

def split_frontmatter(text: str) -> Tuple[JsonDict, str]:
    raw = text.replace("\r\n", "\n").replace("\r", "\n")
    match = re.match(r"^\s*---\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$", raw)
    if not match:
        return {}, raw
    fm_text, body = match.group(1), match.group(2)
    if yaml is None:
        return {}, body
    try:
        parsed = yaml.safe_load(fm_text) or {}
        return parsed if isinstance(parsed, dict) else {}, body
    except Exception:
        return {}, body


def infer_title(frontmatter: JsonDict, body: str, input_path: str) -> str:
    title = frontmatter.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return os.path.splitext(os.path.basename(input_path))[0] or "Untitled brief"


def derive_scenes(frontmatter: JsonDict, body: str) -> List[JsonDict]:
    input_fields = frontmatter.get("inputs") if isinstance(frontmatter.get("inputs"), dict) else {}
    source_candidates = [
        input_fields.get("script") if isinstance(input_fields.get("script"), str) else "",
        input_fields.get("theme") if isinstance(input_fields.get("theme"), str) else "",
        body,
    ]
    source = "\n".join([s for s in source_candidates if s and s.strip()]).strip()
    lines = [normalize_space(line) for line in source.splitlines() if normalize_space(line)]
    scene_lines = [line for line in lines if len(line) > 12]
    if not scene_lines:
        paragraphs = [normalize_space(p) for p in re.split(r"\n\s*\n", body) if normalize_space(p)]
        scene_lines = paragraphs
    if not scene_lines:
        scene_lines = ["A neutral concept moves from brief to generated media on a canvas."]
    scene_lines = scene_lines[:6]

    scenes: List[JsonDict] = []
    for index, line in enumerate(scene_lines, start=1):
        title = extract_scene_title(line, index)
        scenes.append({"title": title, "summary": clip_sentence(line, 300), "source": line})
    return scenes


def extract_scene_title(line: str, index: int) -> str:
    normalized = normalize_space(line)
    if " — " in normalized:
        candidate = normalized.split(" — ", 1)[0]
    elif " - " in normalized:
        candidate = normalized.split(" - ", 1)[0]
    elif ":" in normalized and normalized.index(":") < 50:
        candidate = normalized.split(":", 1)[0]
    else:
        words = normalized.split()
        candidate = " ".join(words[:5])
    candidate = candidate.strip(" #.-")
    return candidate or f"Scene {index}"


def render_scene_plan_markdown(plan: JsonDict) -> str:
    lines = [f"# Rich Media Plan: {plan.get('title') or 'Untitled'}", "", f"Provider: `{plan.get('provider')}`", ""]
    scenes = plan.get("scenes") if isinstance(plan.get("scenes"), list) else []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        lines.extend(
            [
                f"## {scene.get('title') or scene.get('scene_id')}",
                "",
                f"Caption: {scene.get('caption') or ''}",
                "",
                f"Narration: {scene.get('narration') or ''}",
                "",
                f"Image prompt: {scene.get('image_prompt') or ''}",
                "",
                f"Video prompt: {scene.get('video_prompt') or ''}",
                "",
                *([f"Transition prompt: {scene.get('transition_prompt') or ''}", ""] if str(scene.get("transition_prompt") or "").strip() else []),
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def first_scene_value(plan: JsonDict, key: str) -> str:
    scenes = plan.get("scenes") if isinstance(plan.get("scenes"), list) else []
    if scenes and isinstance(scenes[0], dict):
        return str(scenes[0].get(key) or "")
    return ""


def build_text_widget_output(plan: JsonDict, text_plan_path: str) -> str:
    title = str(plan.get("title") or "Rich media plan")
    scenes = [scene for scene in (plan.get("scenes") or []) if isinstance(scene, dict)]
    lines = [f"# {title}", "", f"Generated {len(scenes)} scene(s) for text, image, and video orchestration."]
    for scene in scenes[:4]:
        caption = str(scene.get("caption") or scene.get("summary") or "")
        lines.append(f"- {caption}")
    if text_plan_path:
        lines.extend(["", f"Scene plan artifact: `{text_plan_path}`"])
    return "\n".join(lines).strip()


def render_text_output_src_doc(plan: JsonDict) -> str:
    title = html.escape(str(plan.get("title") or "Rich media plan"))
    scenes = [scene for scene in (plan.get("scenes") or []) if isinstance(scene, dict)]
    items = []
    for scene in scenes[:4]:
        label = html.escape(str(scene.get("title") or scene.get("scene_id") or "Scene"))
        body = html.escape(clip_sentence(str(scene.get("summary") or scene.get("caption") or ""), 180))
        items.append(f"<li><strong>{label}</strong><span>{body}</span></li>")
    return (
        "<article>"
        f"<h1>{title}</h1>"
        "<p>Deterministic super-agent text output for the Rich Media Panel.</p>"
        f"<ol>{''.join(items)}</ol>"
        "</article>"
    )


def yaml_inline_string(value: str) -> str:
    return json.dumps(str(value or ""), ensure_ascii=False)


def yaml_typed_string(key: str, value: str) -> str:
    return f"{{key: {key}, type: string, value: {yaml_inline_string(value)}}}"


def render_workspace_flow_markdown(
    *,
    run_id: str,
    title: str,
    text_output: str,
    text_output_src_doc: str,
    text_prompt: str,
    image_prompt: str,
    image_url: str,
    video_prompt: str,
    video_url: str,
    source_name: str,
    source_hash: str,
) -> str:
    def flow_position_line(node_id: str) -> str:
        layout = balanced_layout_entry(node_id)
        return f'      position: {{key: position, type: object, value: {{x: {int(layout["x"])}, y: {int(layout["y"])}}}}}'

    def flow_visual_lines(node_id: str) -> List[str]:
        layout = balanced_layout_entry(node_id)
        return [
            f'      layoutFrame: {{key: layoutFrame, type: string, value: "{BALANCED_LAYOUT_ID}"}}',
            f'      "visual:width": {{key: visual:width, type: number, value: {int(layout["width"])}}}',
            f'      "visual:height": {{key: visual:height, type: number, value: {int(layout["height"])}}}',
            f'      "visual:xIndex": {{key: visual:xIndex, type: number, value: {int(layout.get("xIndex") or 0)}}}',
            f'      "visual:yIndex": {{key: visual:yIndex, type: number, value: {int(layout.get("yIndex") or 0)}}}',
            f'      "visual:zIndex": {{key: visual:zIndex, type: number, value: {int(layout.get("zIndex") or 0)}}}',
            f'      layoutRole: {{key: layoutRole, type: string, value: "{str(layout["role"])}"}}',
        ]

    lines = [
        "---",
        'kgCanvasSurfaceMode: "2d"',
        'kgCanvas2dRenderer: "storyboard"',
        'kgDocumentSemanticMode: "document"',
        "kgFrontmatterModeEnabled: true",
        f"kgSuperAgentRunId: {yaml_inline_string(run_id)}",
        f"kgSuperAgentSurfaceRoute: {yaml_inline_string(RICH_MEDIA_SURFACE_ROUTE)}",
        "kgSuperAgentCapabilities:",
        *[f"  - {yaml_inline_string(capability)}" for capability in SUPERAGENT_TASK_CAPABILITIES],
        "kgSuperAgentTaskLevels:",
        *[f"  - {yaml_inline_string(level)}" for level in SUPERAGENT_TASK_LEVELS],
        "kgSuperAgentMessageGateway: \"CLI or knowgrph.superagent.run local MCP\"",
        "kgSuperAgentSandbox: \"bounded generated-code execution inside run artifacts\"",
        "kgSuperAgentLayout:",
        f"  id: {yaml_inline_string(BALANCED_LAYOUT_ID)}",
        "  label: \"Balanced 16:9\"",
        "  width: 1920",
        "  height: 1080",
        "  aspectRatio: \"16:9\"",
        *render_responsive_frontmatter_lines(),
        "frontmatterFlowSettings:",
        "  direction: LR",
        "  edgeType: smoothstep",
        "  balancedViewportPreset: widgetFrontmatter",
        "  balancedHeroRowCount: 3",
        "  balancedHeroRowGapScale: 0.76",
        "  balancedPanelOffsetScale: 0.96",
        "flow:",
        "  direction: LR",
        "  edgeType: smoothstep",
        "  nodes:",
        '    - id: {key: id, type: string, value: "w-text-plan"}',
        '      type: {key: type, type: string, value: "TextGeneration"}',
        '      label: {key: label, type: string, value: "Generated Text Plan"}',
        flow_position_line("text-plan"),
        *flow_visual_lines("text-plan"),
        '      handles: {key: handles, type: object, value: {target: ["prompt_in"], source: ["text_out"]}}',
        '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "textGeneration"}',
        f"      prompt: {yaml_typed_string('prompt', text_prompt)}",
        f"      output: {yaml_typed_string('output', text_output)}",
        f"      outputSrcDoc: {yaml_typed_string('outputSrcDoc', text_output_src_doc)}",
        '    - id: {key: id, type: string, value: "w-image-reference"}',
        '      type: {key: type, type: string, value: "ImageGeneration"}',
        '      label: {key: label, type: string, value: "Generated Reference Image"}',
        flow_position_line("image-reference"),
        *flow_visual_lines("image-reference"),
        '      handles: {key: handles, type: object, value: {target: ["reference_image"], source: ["imageUrl"]}}',
        '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "imageGeneration"}',
        f"      prompt: {yaml_typed_string('prompt', image_prompt)}",
        f"      imageUrl: {yaml_typed_string('imageUrl', image_url)}",
        '    - id: {key: id, type: string, value: "w-video-storyboard"}',
        '      type: {key: type, type: string, value: "VideoGeneration"}',
        '      label: {key: label, type: string, value: "Generated Storyboard Video"}',
        flow_position_line("video-storyboard"),
        *flow_visual_lines("video-storyboard"),
        '      handles: {key: handles, type: object, value: {target: ["reference_image"], source: ["videoUrl"]}}',
        '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "videoGeneration"}',
        f"      prompt: {yaml_typed_string('prompt', video_prompt)}",
        f"      videoUrl: {yaml_typed_string('videoUrl', video_url)}",
        '    - id: {key: id, type: string, value: "p-rich-media"}',
        '      type: {key: type, type: string, value: "RichMediaPanel"}',
        '      label: {key: label, type: string, value: "Rich Media Panel"}',
        flow_position_line("rich-media-panel"),
        *flow_visual_lines("rich-media-panel"),
        '      handles: {key: handles, type: object, value: {target: ["output","imageUrl","videoUrl"], source: []}}',
        '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}',
        '      richMediaActiveTab: {key: richMediaActiveTab, type: string, value: "auto"}',
        "  edges:",
        f'    - {{ id: e-text-panel, source: w-text-plan, sourceHandle: text_out, target: p-rich-media, targetHandle: output, animated: true, layoutRoute: "{BALANCED_LAYOUT_ID}:fan-in-readable", layoutLane: -1 }}',
        f'    - {{ id: e-image-panel, source: w-image-reference, sourceHandle: imageUrl, target: p-rich-media, targetHandle: imageUrl, animated: true, layoutRoute: "{BALANCED_LAYOUT_ID}:fan-in-readable", layoutLane: 0 }}',
        f'    - {{ id: e-video-panel, source: w-video-storyboard, sourceHandle: videoUrl, target: p-rich-media, targetHandle: videoUrl, animated: true, layoutRoute: "{BALANCED_LAYOUT_ID}:fan-in-readable", layoutLane: 1 }}',
        "---",
        "",
        f"# {title}",
        "",
        "This file is a generated Knowgrph frontmatter-flow workspace for the rich media pipeline.",
        "",
        f"- Run id: `{run_id}`",
        f"- Source: `{source_name}`",
        f"- Source hash: `{source_hash}`",
        f"- Surface route: `{RICH_MEDIA_SURFACE_ROUTE}`",
        "- Harness lanes: `SkillSelector`, `ResearchAgent`, `CodeWorker`, `TextGeneration`, `ImageGeneration`, `VideoGeneration`, `RichMediaPanel`",
        "- Message gateway: `CLI` or `knowgrph.superagent.run` local MCP",
        "- Sandbox: generated code executes inside the run artifact directory before media creation",
        "",
    ]
    return "\n".join(lines)


def render_mock_image_svg(*, title: str, scene_title: str, prompt: str, palette: Tuple[str, str]) -> str:
    safe_title = html.escape(clip_sentence(title, 80))
    safe_scene = html.escape(clip_sentence(scene_title, 80))
    safe_prompt = html.escape(clip_sentence(prompt, 180))
    bg, accent = palette
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="{safe_title}">
  <defs>
    <linearGradient id="kg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="{bg}"/>
      <stop offset="1" stop-color="#f7f4ea"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#kg)"/>
  <rect x="72" y="72" width="1136" height="576" rx="22" fill="rgba(255,255,255,0.72)" stroke="{accent}" stroke-width="8"/>
  <circle cx="1040" cy="180" r="82" fill="{accent}" opacity="0.86"/>
  <path d="M120 560 C280 420 380 470 520 350 S820 280 1160 520" fill="none" stroke="{accent}" stroke-width="20" opacity="0.45"/>
  <text x="120" y="170" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#172026">{safe_scene}</text>
  <foreignObject x="120" y="220" width="980" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 30px; line-height: 1.28; color: #172026;">{safe_prompt}</div>
  </foreignObject>
  <text x="120" y="620" font-family="Arial, sans-serif" font-size="24" fill="#44515a">deterministic mock image artifact</text>
</svg>
"""


def render_mock_video_html(video_plan: JsonDict) -> str:
    scenes = [s for s in (video_plan.get("scenes") or []) if isinstance(s, dict)]
    title = html.escape(str(video_plan.get("title") or "Storyboard video"))
    blocks = []
    for index, scene in enumerate(scenes[:6], start=1):
        blocks.append(
            f"""<section class="scene" style="--i:{index}">
  <strong>{html.escape(str(scene.get("title") or f"Scene {index}"))}</strong>
  <p>{html.escape(clip_sentence(str(scene.get("video_prompt") or scene.get("summary") or ""), 220))}</p>
</section>"""
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    body {{ margin: 0; min-height: 100vh; background: #101820; color: #f8f5ef; font-family: Arial, sans-serif; display: grid; place-items: center; }}
    main {{ width: min(440px, 92vw); aspect-ratio: 9 / 16; background: #1f3142; border: 1px solid #5fb3a4; overflow: hidden; position: relative; box-shadow: 0 22px 80px rgba(0,0,0,.35); }}
    h1 {{ font-size: 22px; line-height: 1.1; margin: 20px; position: relative; z-index: 2; }}
    .scene {{ position: absolute; inset: 80px 20px 32px; padding: 20px; border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.10); opacity: 0; transform: translateY(24px); animation: show 18s infinite; animation-delay: calc((var(--i) - 1) * 3s); }}
    .scene strong {{ display: block; font-size: 24px; margin-bottom: 12px; }}
    .scene p {{ font-size: 18px; line-height: 1.35; }}
    main::before {{ content: ""; position: absolute; width: 360px; height: 360px; border-radius: 999px; background: #79d2c0; filter: blur(18px); opacity: .35; left: -80px; top: 260px; animation: drift 9s infinite alternate; }}
    @keyframes show {{ 0%, 12% {{ opacity: 0; transform: translateY(24px); }} 16%, 30% {{ opacity: 1; transform: translateY(0); }} 36%, 100% {{ opacity: 0; transform: translateY(-18px); }} }}
    @keyframes drift {{ from {{ transform: translateX(0) scale(1); }} to {{ transform: translateX(140px) scale(1.2); }} }}
  </style>
</head>
<body>
  <main aria-label="Mock video storyboard">
    <h1>{title}</h1>
    {''.join(blocks)}
  </main>
</body>
</html>
"""


def render_canvas_preview_html(graph: JsonDict) -> str:
    nodes = [n for n in graph.get("nodes", []) if isinstance(n, dict)]
    cards = []
    for node in nodes:
        props = node.get("properties") if isinstance(node.get("properties"), dict) else {}
        media = str(props.get("imageUrl") or props.get("videoUrl") or props.get("outputPath") or "")
        media_link = f'<a href="{html.escape(media)}">{html.escape(os.path.basename(media))}</a>' if media else ""
        cards.append(
            f"""<article>
  <h2>{html.escape(str(node.get("label") or node.get("id") or ""))}</h2>
  <p>{html.escape(str(node.get("type") or ""))}</p>
  {media_link}
</article>"""
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Super-agent Canvas Preview</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #162026; background: #f5f3ec; }}
    main {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; padding: 16px; }}
    article {{ min-height: 120px; border: 1px solid #8ba49b; background: #fffdf8; padding: 14px; }}
    h1 {{ font-size: 24px; margin: 16px 16px 0; }}
    h2 {{ font-size: 17px; margin: 0 0 8px; }}
    p {{ color: #4c5b60; }}
  </style>
</head>
<body>
  <h1>Super-agent Canvas Preview</h1>
  <main>{''.join(cards)}</main>
</body>
</html>
"""


def render_final_report(*, state: JsonDict, verification: JsonDict, output_dir: str) -> str:
    run = state.get("run") if isinstance(state.get("run"), dict) else {}
    artifacts = [a for a in (state.get("artifacts") or []) if isinstance(a, dict)]
    recovery_events = state.get("memory", {}).get("recovery_events", []) if isinstance(state.get("memory"), dict) else []
    verification_payload = verification.get("verification") if isinstance(verification.get("verification"), dict) else verification
    lines = [
        "# Super-Agent Harness Run Report",
        "",
        f"- Run id: `{run.get('run_id')}`",
        f"- Status: `{run.get('status')}`",
        f"- Termination: `{run.get('termination_reason')}`",
        f"- Provider mode: `{run.get('provider_mode')}`",
        f"- Step count: `{run.get('step_count')}`",
        f"- Verification passed: `{bool(verification_payload.get('passed'))}`",
        f"- App surface route: `{RICH_MEDIA_SURFACE_ROUTE}`",
        "",
        "## Completed Tasks",
        "",
    ]
    for task_id in state.get("completed_task_ids") or []:
        lines.append(f"- `{task_id}`")
    lines.extend(["", "## Artifacts", ""])
    for artifact in artifacts:
        path = str(artifact.get("path") or "")
        display = os.path.relpath(path, output_dir) if path and os.path.isabs(path) else path
        lines.append(f"- `{artifact.get('kind')}` `{artifact.get('artifact_id')}`: `{display}`")
    lines.extend(["", "## Verification Checks", ""])
    checks = verification_payload.get("checks") if isinstance(verification_payload.get("checks"), list) else []
    for check in checks:
        if not isinstance(check, dict):
            continue
        mark = "pass" if check.get("passed") else "fail"
        lines.append(f"- `{mark}` `{check.get('id')}`")
    lines.extend(render_harness_proof_manifest_report_lines(artifacts, output_dir))
    lines.extend(["", "## Recovery Events", ""])
    if recovery_events:
        for event in recovery_events:
            if isinstance(event, dict):
                lines.append(f"- `{event.get('strategy')}` for `{event.get('task_id')}` after attempt `{event.get('attempt')}`")
    else:
        lines.append("- None")
    lines.extend(
        [
            "",
            "## Rerun",
            "",
            "```bash",
            "python3 -m knowgrph_parser superagent --input <brief.md> --output-dir <run-output-dir>",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def graph_node(node_id: str, label: str, node_type: str, x: int, y: int, properties: JsonDict) -> JsonDict:
    return {
        "id": node_id,
        "label": label,
        "type": node_type,
        "x": x,
        "y": y,
        "properties": properties,
        "metadata": {"provenance": {"generatedBy": "superagent_harness"}},
    }


def graph_edge(
    edge_id: str,
    source: str,
    target: str,
    label: str,
    source_handle: str = "",
    target_handle: str = "",
) -> JsonDict:
    edge: JsonDict = {"id": edge_id, "source": source, "target": target, "label": label, "type": "provenance", "properties": {}}
    if source_handle:
        edge["sourceHandle"] = source_handle
        edge["properties"]["sourcePort"] = source_handle
    if target_handle:
        edge["targetHandle"] = target_handle
        edge["properties"]["targetPort"] = target_handle
    return edge


def artifact_record(
    artifact_id: str,
    kind: str,
    path: str,
    media_type: str,
    source_step_id: str,
    metadata: Optional[JsonDict] = None,
) -> JsonDict:
    return asdict(ArtifactRecord(artifact_id, kind, path, media_type, source_step_id, metadata or {}))


def artifact_path_by_id(observation: JsonDict, artifact_id: str) -> str:
    for artifact in observation.get("artifacts") or []:
        if isinstance(artifact, dict) and artifact.get("artifact_id") == artifact_id:
            return str(artifact.get("path") or "")
    return ""


def balanced_layout_entry(node_id: str) -> JsonDict:
    raw = BALANCED_WIDGET_LAYOUT.get(node_id) or {"x": 0, "y": 0, "width": 320, "height": 180, "role": "node"}
    return dict(raw)


def balanced_layout_props(node_id: str, properties: JsonDict) -> JsonDict:
    layout = balanced_layout_entry(node_id)
    next_props = dict(properties)
    next_props.setdefault("layoutFrame", BALANCED_LAYOUT_ID)
    next_props.setdefault("layoutRole", str(layout.get("role") or "node"))
    next_props.setdefault("visual:width", int(layout.get("width") or 320))
    next_props.setdefault("visual:height", int(layout.get("height") or 180))
    next_props.setdefault("visual:xIndex", int(layout.get("xIndex") or 0))
    next_props.setdefault("visual:yIndex", int(layout.get("yIndex") or 0))
    next_props.setdefault("visual:zIndex", int(layout.get("zIndex") or 0))
    return next_props


def balanced_layout_centroid() -> JsonDict:
    node_ids = ["text-plan", "image-reference", "video-storyboard", "rich-media-panel"]
    centers = []
    for node_id in node_ids:
        layout = balanced_layout_entry(node_id)
        centers.append({
            "id": node_id,
            "x": float(layout["x"]) + float(layout["width"]) / 2,
            "y": float(layout["y"]) + float(layout["height"]) / 2,
        })
    return {
        "x": round(sum(center["x"] for center in centers) / len(centers), 2),
        "y": round(sum(center["y"] for center in centers) / len(centers), 2),
        "target": dict(BALANCED_LAYOUT_FRAME["centroid"]),
        "nodeIds": node_ids,
    }


def balanced_layout_metadata() -> JsonDict:
    return {
        "frame": dict(BALANCED_LAYOUT_FRAME),
        "nodes": {node_id: dict(layout) for node_id, layout in BALANCED_WIDGET_LAYOUT.items()},
        "centroid": balanced_layout_centroid(),
        "responsive": build_responsive_layout_metadata(),
        "edgeRouting": {
            "strategy": "fan-in-readable",
            "sourceAnchor": "bottom",
            "targetAnchor": "top",
            "edgeIds": sorted(RICH_MEDIA_PANEL_EDGE_IDS),
            "lanes": dict(RICH_MEDIA_PANEL_EDGE_LANES),
            "avoidWidgetContent": True,
        },
    }
