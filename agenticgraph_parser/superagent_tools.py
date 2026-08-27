import json
import os
import subprocess
import sys
from typing import Any, List, Optional, Tuple

from .common import read_text, sha256_text, utc_now_iso, write_json, write_text
from .superagent_contracts import (
    BALANCED_LAYOUT_ID,
    ERROR_CONFIG,
    ERROR_FATAL,
    ERROR_RETRYABLE,
    HarnessError,
    JsonDict,
    RICH_MEDIA_PANEL_EDGE_LANES,
    RICH_MEDIA_PANEL_EDGE_IDS,
    RICH_MEDIA_SURFACE_ROUTE,
    SUPERAGENT_TASK_CAPABILITIES,
    ToolDefinition,
    ToolRegistry,
)
from .superagent_utils import clip_sentence, color_pair_from_text, normalize_space
from .superagent_verifier import tool_judge_verify
from .superagent_renderers import (
    artifact_path_by_id,
    artifact_record,
    balanced_layout_entry,
    balanced_layout_metadata,
    balanced_layout_props,
    build_text_widget_output,
    derive_scenes,
    first_scene_value,
    graph_edge,
    graph_node,
    infer_title,
    render_canvas_preview_html,
    render_final_report,
    render_mock_image_svg,
    render_mock_video_html,
    render_scene_plan_markdown,
    render_text_output_src_doc,
    render_workspace_flow_markdown,
    split_frontmatter,
)

def build_default_tool_registry(harness: Any) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolDefinition(
            "workspace.inspect",
            "Read a user-provided brief and extract neutral goal/input metadata.",
            {"input_path": "string", "goal_text": "string", "output_dir": "string", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [],
            tool_workspace_inspect,
        )
    )
    registry.register(
        ToolDefinition(
            "text.generate.mock",
            "Create deterministic text, scene, caption, and media prompt artifacts.",
            {
                "inspection": "object",
                "skill_result": "object",
                "research_result": "object",
                "code_result": "object",
                "artifacts_dir": "string",
                "run_id": "string",
                "step_id": "string",
            },
            {},
            30,
            [ERROR_RETRYABLE],
            tool_text_generate_mock,
        )
    )
    registry.register(
        ToolDefinition(
            "research.scout",
            "Create a source-grounded research pack from the input brief and frontmatter evidence.",
            {"inspection": "object", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_research_scout,
        )
    )
    registry.register(
        ToolDefinition(
            "skill.select",
            "Select registry-backed capability lanes and frontmatter skill hints for the current run.",
            {"inspection": "object", "goal_text": "string", "tool_inventory": "array", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_skill_select,
        )
    )
    registry.register(
        ToolDefinition(
            "code.write_and_run",
            "Write deterministic code and execute it in a bounded local sandbox artifact directory.",
            {"inspection": "object", "research_result": "object", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_code_write_and_run,
        )
    )
    registry.register(
        ToolDefinition(
            "image.generate.mock",
            "Create a deterministic SVG reference frame.",
            {"text_plan": "object", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_image_generate_mock,
        )
    )
    registry.register(
        ToolDefinition(
            "video.generate.mock",
            "Create a deterministic HTML storyboard standing in for video output.",
            {"text_plan": "object", "image_result": "object", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_video_generate_mock,
        )
    )
    registry.register(
        ToolDefinition(
            "video.generate.byteplus_modelark_placeholder",
            "Record a minimal BytePlus ModelArk media-generation placeholder and emit deterministic local video output.",
            {"text_plan": "object", "image_result": "object", "artifacts_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [ERROR_RETRYABLE],
            tool_video_generate_byteplus_modelark_placeholder,
        )
    )
    registry.register(
        ToolDefinition(
            "canvas.write",
            "Compose rich media GraphData and a lightweight canvas preview.",
            {
                "inspection": "object",
                "skill_result": "object",
                "research_result": "object",
                "code_result": "object",
                "text_plan": "object",
                "image_result": "object",
                "video_result": "object",
                "artifacts_dir": "string",
                "run_id": "string",
                "step_id": "string",
                "state": "object",
            },
            {},
            30,
            [ERROR_RETRYABLE],
            tool_canvas_write,
        )
    )
    registry.register(
        ToolDefinition(
            "judge.verify",
            "Run deterministic validation against artifacts, trace, and graph topology.",
            {"canvas_result": "object", "state": "object", "output_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [],
            tool_judge_verify,
        )
    )
    registry.register(
        ToolDefinition(
            "artifact.export_report",
            "Write the final report with run, trace, artifact, recovery, and termination evidence.",
            {"verification": "object", "state": "object", "output_dir": "string", "run_id": "string", "step_id": "string"},
            {},
            30,
            [],
            tool_export_report,
        )
    )
    return registry


def tool_workspace_inspect(payload: JsonDict) -> JsonDict:
    input_path = os.path.abspath(str(payload.get("input_path") or ""))
    if not input_path:
        raise HarnessError("Missing input path for workspace inspection", ERROR_CONFIG)
    if not os.path.exists(input_path):
        raise HarnessError(f"Input brief does not exist: {input_path}", ERROR_CONFIG)
    if not os.path.isfile(input_path):
        raise HarnessError(f"Input path must be a file: {input_path}", ERROR_CONFIG)

    text = read_text(input_path)
    frontmatter, body = split_frontmatter(text)
    title = infer_title(frontmatter, body, input_path)
    source_name = os.path.basename(input_path)
    source_hash = sha256_text(text)
    artifact_path = os.path.join(str(payload["artifacts_dir"]), "input", "brief.md")
    write_text(artifact_path, text)

    return {
        "title": title,
        "source_name": source_name,
        "source_hash": source_hash,
        "input_path": input_path,
        "frontmatter": frontmatter,
        "body": body,
        "brief_text": text,
        "tool_count": int(payload.get("tool_count") or 0),
        "artifacts": [
            artifact_record(
                "input_brief",
                "brief",
                artifact_path,
                "text/markdown; charset=utf-8",
                str(payload["step_id"]),
                {"source_name": source_name, "source_hash": source_hash},
            )
        ],
    }


def semantic_skill_id(value: str) -> str:
    normalized = normalize_space(value).lower()
    chars: List[str] = []
    previous_was_sep = False
    for char in normalized:
        if char.isalnum():
            chars.append(char)
            previous_was_sep = False
        elif not previous_was_sep:
            chars.append("_")
            previous_was_sep = True
    return "".join(chars).strip("_") or "skill"


def capability_for_tool_name(tool_name: str) -> str:
    if tool_name.startswith("research."):
        return "research"
    if tool_name.startswith("code."):
        return "code"
    if tool_name.startswith(("text.", "image.", "video.", "canvas.")):
        return "create"
    if tool_name.startswith("workspace."):
        return "inspect"
    if tool_name.startswith("judge."):
        return "verify"
    if tool_name.startswith("artifact."):
        return "report"
    if tool_name.startswith("skill."):
        return "skill"
    return "tool"


def requested_capabilities(goal_text: str, inspection: JsonDict) -> List[str]:
    frontmatter = inspection.get("frontmatter") if isinstance(inspection.get("frontmatter"), dict) else {}
    body = str(inspection.get("body") or "")
    searchable = f"{goal_text} {body} {json.dumps(frontmatter, ensure_ascii=False, sort_keys=True)}".lower()
    requested = [capability for capability in SUPERAGENT_TASK_CAPABILITIES if capability in searchable]
    if requested:
        return requested
    return list(SUPERAGENT_TASK_CAPABILITIES)


def frontmatter_skill_hints(frontmatter: JsonDict) -> List[JsonDict]:
    hints: List[JsonDict] = []
    for key in ["skills", "skillCatalog", "kgSuperAgentSkills", "capabilities"]:
        raw = frontmatter.get(key)
        entries: List[Any] = []
        if isinstance(raw, list):
            entries = raw
        elif isinstance(raw, dict):
            entries = [{"id": name, **value} if isinstance(value, dict) else {"id": name, "purpose": value} for name, value in raw.items()]
        for index, entry in enumerate(entries, start=1):
            if isinstance(entry, dict):
                entry_id = str(entry.get("id") or entry.get("name") or f"{key}_{index}")
                purpose = str(entry.get("purpose") or entry.get("description") or entry_id)
                kind = str(entry.get("kind") or "frontmatter_skill")
            else:
                entry_id = str(entry or f"{key}_{index}")
                purpose = entry_id
                kind = "frontmatter_skill"
            hints.append({
                "id": semantic_skill_id(entry_id),
                "kind": kind,
                "owner": f"input.frontmatter.{key}",
                "purpose": clip_sentence(purpose, 220),
                "capability": "user_provided",
            })
    return hints


def registry_skill_candidates(tool_inventory: List[JsonDict], requested: List[str]) -> List[JsonDict]:
    requested_set = set(requested)
    support_capabilities = {"inspect", "skill", "verify", "report"}
    candidates: List[JsonDict] = []
    for tool in tool_inventory:
        if not isinstance(tool, dict):
            continue
        tool_name = str(tool.get("name") or "").strip()
        if not tool_name:
            continue
        capability = capability_for_tool_name(tool_name)
        if capability not in requested_set and capability not in support_capabilities:
            continue
        description = normalize_space(str(tool.get("description") or tool_name))
        candidates.append({
            "id": f"tool_{semantic_skill_id(tool_name)}",
            "kind": "tool_skill",
            "owner": f"tool_registry.{tool_name}",
            "purpose": clip_sentence(description, 220),
            "capability": capability,
            "required_inputs": list(tool.get("required") or []),
        })
    return candidates


def tool_skill_select(payload: JsonDict) -> JsonDict:
    inspection = payload.get("inspection") if isinstance(payload.get("inspection"), dict) else {}
    goal_text = normalize_space(str(payload.get("goal_text") or ""))
    title = str(inspection.get("title") or "Untitled brief")
    source_name = str(inspection.get("source_name") or "input")
    frontmatter = inspection.get("frontmatter") if isinstance(inspection.get("frontmatter"), dict) else {}
    tool_inventory = payload.get("tool_inventory") if isinstance(payload.get("tool_inventory"), list) else []
    requested = requested_capabilities(goal_text, inspection)
    catalog = frontmatter_skill_hints(frontmatter) + registry_skill_candidates(tool_inventory, requested)
    selected = [
        {
            **skill,
            "selection_reason": f"Selected for {title} from {source_name} using {skill.get('owner')}",
        }
        for skill in catalog
    ]
    skill_dir = os.path.join(str(payload["artifacts_dir"]), "skills")
    skill_json_path = os.path.join(skill_dir, "selected-skills.json")
    skill_md_path = os.path.join(skill_dir, "selected-skills.md")
    manifest = {
        "schema_version": "knowgrph.superagent.selected-skills.v1",
        "run_id": str(payload["run_id"]),
        "title": title,
        "goal_summary": clip_sentence(goal_text, 320),
        "source": {"name": source_name, "hash": str(inspection.get("source_hash") or "")},
        "requested_capabilities": requested,
        "selected": selected,
    }
    lines = [
        f"# Selected Skills: {title}",
        "",
        f"- Source: `{source_name}`",
        f"- Selected skills: `{len(selected)}`",
        "",
        "## Skills",
        "",
    ]
    for skill in selected:
        lines.append(f"- `{skill['id']}` ({skill['kind']}): {skill['purpose']} Owner: `{skill['owner']}`")
    write_json(skill_json_path, manifest)
    write_text(skill_md_path, "\n".join(lines).rstrip() + "\n")
    return {
        "skills": manifest,
        "artifacts": [
            artifact_record("selected_skills_json", "skill", skill_json_path, "application/json", str(payload["step_id"])),
            artifact_record("selected_skills_markdown", "skill", skill_md_path, "text/markdown; charset=utf-8", str(payload["step_id"])),
        ],
    }


def tool_research_scout(payload: JsonDict) -> JsonDict:
    inspection = payload.get("inspection") if isinstance(payload.get("inspection"), dict) else {}
    frontmatter = inspection.get("frontmatter") if isinstance(inspection.get("frontmatter"), dict) else {}
    body = str(inspection.get("body") or "")
    title = str(inspection.get("title") or "Untitled brief")
    evidence: List[JsonDict] = []

    for key in sorted(frontmatter.keys())[:12]:
        value = frontmatter.get(key)
        if isinstance(value, (dict, list)):
            value_text = json.dumps(value, ensure_ascii=False, sort_keys=True)
        else:
            value_text = str(value)
        evidence.append({
            "id": f"frontmatter:{key}",
            "kind": "frontmatter",
            "key": key,
            "value": clip_sentence(value_text, 260),
            "confidence": "high",
            "source": str(inspection.get("source_name") or "input"),
        })

    body_lines = [normalize_space(line) for line in body.splitlines() if normalize_space(line)]
    headings = [line.lstrip("# ").strip() for line in body_lines if line.startswith("#")]
    paragraphs = [line for line in body_lines if not line.startswith("#") and len(line) > 20]
    for index, line in enumerate((headings + paragraphs)[:8], start=1):
        evidence.append({
            "id": f"body:{index}",
            "kind": "body",
            "key": f"body_{index}",
            "value": clip_sentence(line, 260),
            "confidence": "medium" if line in paragraphs else "high",
            "source": str(inspection.get("source_name") or "input"),
        })

    if not evidence:
        evidence.append({
            "id": "fallback:brief",
            "kind": "fallback",
            "key": "brief",
            "value": clip_sentence(str(inspection.get("brief_text") or title), 260),
            "confidence": "low",
            "source": str(inspection.get("source_name") or "input"),
        })

    research_dir = os.path.join(str(payload["artifacts_dir"]), "research")
    research_json_path = os.path.join(research_dir, "research-pack.json")
    research_md_path = os.path.join(research_dir, "research-pack.md")
    pack = {
        "schema_version": "knowgrph.superagent.research-pack.v1",
        "run_id": str(payload["run_id"]),
        "title": title,
        "source": {
            "name": str(inspection.get("source_name") or ""),
            "hash": str(inspection.get("source_hash") or ""),
        },
        "summary": f"Source-grounded research pack for {title} with {len(evidence)} evidence item(s).",
        "evidence": evidence,
    }
    lines = [
        f"# Research Pack: {title}",
        "",
        f"- Source: `{pack['source']['name']}`",
        f"- Evidence items: `{len(evidence)}`",
        "",
        "## Evidence",
        "",
    ]
    for item in evidence:
        lines.append(f"- `{item['id']}` {item['value']}")
    write_json(research_json_path, pack)
    write_text(research_md_path, "\n".join(lines).rstrip() + "\n")
    return {
        "research": pack,
        "artifacts": [
            artifact_record("research_pack_json", "research", research_json_path, "application/json", str(payload["step_id"])),
            artifact_record("research_pack_markdown", "research", research_md_path, "text/markdown; charset=utf-8", str(payload["step_id"])),
        ],
    }


def tool_code_write_and_run(payload: JsonDict) -> JsonDict:
    inspection = payload.get("inspection") if isinstance(payload.get("inspection"), dict) else {}
    research_result = payload.get("research_result") if isinstance(payload.get("research_result"), dict) else {}
    research = research_result.get("research") if isinstance(research_result.get("research"), dict) else {}
    evidence = research.get("evidence") if isinstance(research.get("evidence"), list) else []
    title = str(inspection.get("title") or research.get("title") or "Untitled brief")
    code_dir = os.path.join(str(payload["artifacts_dir"]), "code")
    sandbox_dir = os.path.join(str(payload["artifacts_dir"]), "sandbox")
    code_path = os.path.join(code_dir, "generated_summary.py")
    result_path = os.path.join(sandbox_dir, "sandbox-result.json")
    summary = {
        "schema_version": "knowgrph.superagent.generated-code-summary.v1",
        "run_id": str(payload["run_id"]),
        "title": title,
        "source_hash": str(inspection.get("source_hash") or ""),
        "evidence_count": len(evidence),
        "capabilities": SUPERAGENT_TASK_CAPABILITIES,
    }
    code = (
        "import json\n\n"
        f"SUMMARY = {json.dumps(summary, ensure_ascii=False, sort_keys=True)}\n\n"
        "if __name__ == \"__main__\":\n"
        "    print(json.dumps(SUMMARY, sort_keys=True))\n"
    )
    write_text(code_path, code)
    try:
        result = subprocess.run(
            [sys.executable, code_path],
            cwd=code_dir,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        sandbox = {
            "schema_version": "knowgrph.superagent.sandbox-result.v1",
            "run_id": str(payload["run_id"]),
            "code_path": code_path,
            "cwd": code_dir,
            "argv": [sys.executable, code_path],
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "passed": result.returncode == 0,
            "timeout_seconds": 5,
        }
    except subprocess.TimeoutExpired as error:
        sandbox = {
            "schema_version": "knowgrph.superagent.sandbox-result.v1",
            "run_id": str(payload["run_id"]),
            "code_path": code_path,
            "cwd": code_dir,
            "argv": [sys.executable, code_path],
            "returncode": None,
            "stdout": (error.stdout or "").strip() if isinstance(error.stdout, str) else "",
            "stderr": (error.stderr or "").strip() if isinstance(error.stderr, str) else "",
            "passed": False,
            "timeout_seconds": 5,
            "timeout": True,
        }
    write_json(result_path, sandbox)
    if not sandbox.get("passed"):
        raise HarnessError("Generated code sandbox execution failed", ERROR_RETRYABLE, sandbox)
    return {
        "code": {
            "path": code_path,
            "language": "python",
            "sandbox_result_path": result_path,
            "sandbox": sandbox,
        },
        "artifacts": [
            artifact_record("code_generated_summary_py", "code", code_path, "text/x-python; charset=utf-8", str(payload["step_id"])),
            artifact_record("code_sandbox_result", "sandbox", result_path, "application/json", str(payload["step_id"])),
        ],
    }


def tool_text_generate_mock(payload: JsonDict) -> JsonDict:
    inspection = payload.get("inspection") if isinstance(payload.get("inspection"), dict) else {}
    skill_result = payload.get("skill_result") if isinstance(payload.get("skill_result"), dict) else {}
    research_result = payload.get("research_result") if isinstance(payload.get("research_result"), dict) else {}
    code_result = payload.get("code_result") if isinstance(payload.get("code_result"), dict) else {}
    frontmatter = inspection.get("frontmatter") if isinstance(inspection.get("frontmatter"), dict) else {}
    body = str(inspection.get("body") or "")
    title = str(inspection.get("title") or "Untitled brief")
    scenes = derive_scenes(frontmatter, body)
    prompts = []
    for index, scene in enumerate(scenes, start=1):
        prompt_source = normalize_space(scene.get("source") or scene.get("summary") or title)
        previous_scene = scenes[index - 2] if index > 1 and isinstance(scenes[index - 2], dict) else None
        previous_title = str(previous_scene.get("title") or f"Scene {index - 1}") if previous_scene else ""
        transition_prompt = (
            f"Smooth visual transition from {previous_title} to {scene['title']}: "
            f"{clip_sentence(str(previous_scene.get('summary') or previous_scene.get('source') or ''), 140)} -> "
            f"{clip_sentence(prompt_source, 140)}"
            if previous_scene
            else ""
        )
        prompts.append(
            {
                "scene_id": f"scene-{index}",
                "title": scene["title"],
                "summary": scene["summary"],
                "caption": f"{scene['title']}: {clip_sentence(scene['summary'], 96)}",
                "narration": clip_sentence(prompt_source, 220),
                "image_prompt": f"Reference frame for {scene['title']}: {clip_sentence(prompt_source, 280)}",
                "video_prompt": f"Short motion sequence for {scene['title']}: {clip_sentence(prompt_source, 340)}",
                "transition_prompt": transition_prompt,
            }
        )

    text_dir = os.path.join(str(payload["artifacts_dir"]), "text")
    plan_json_path = os.path.join(text_dir, "scene-plan.json")
    plan_md_path = os.path.join(text_dir, "scene-plan.md")
    plan = {
        "title": title,
        "provider": "deterministic-mock",
        "scenes": prompts,
        "source_hash": str(inspection.get("source_hash") or ""),
        "skill_summary": {
            "selected": [
                str(skill.get("id") or "")
                for skill in (((skill_result.get("skills") or {}).get("selected") or []) if isinstance(skill_result.get("skills"), dict) else [])
                if isinstance(skill, dict)
            ],
            "artifact_path": artifact_path_by_id(skill_result, "selected_skills_json"),
        },
        "research_summary": str((research_result.get("research") or {}).get("summary") or ""),
        "code_summary": {
            "path": str((code_result.get("code") or {}).get("path") or ""),
            "sandbox_passed": bool(((code_result.get("code") or {}).get("sandbox") or {}).get("passed")),
        },
    }
    write_json(plan_json_path, plan)
    write_text(plan_md_path, render_scene_plan_markdown(plan))
    return {
        "plan": plan,
        "artifacts": [
            artifact_record("text_scene_plan_json", "text", plan_json_path, "application/json", str(payload["step_id"])),
            artifact_record("text_scene_plan_markdown", "text", plan_md_path, "text/markdown; charset=utf-8", str(payload["step_id"])),
        ],
    }


def tool_image_generate_mock(payload: JsonDict) -> JsonDict:
    text_plan = payload.get("text_plan") if isinstance(payload.get("text_plan"), dict) else {}
    plan = text_plan.get("plan") if isinstance(text_plan.get("plan"), dict) else {}
    scenes = plan.get("scenes") if isinstance(plan.get("scenes"), list) else []
    if not scenes:
        raise HarnessError("Cannot generate image: text plan contains no scenes", ERROR_RETRYABLE)
    scene = scenes[0] if isinstance(scenes[0], dict) else {}
    title = str(plan.get("title") or "Rich media plan")
    prompt = str(scene.get("image_prompt") or scene.get("summary") or title)
    image_dir = os.path.join(str(payload["artifacts_dir"]), "image")
    image_path = os.path.join(image_dir, "reference-frame.svg")
    palette = color_pair_from_text(prompt)
    write_text(image_path, render_mock_image_svg(title=title, scene_title=str(scene.get("title") or "Scene"), prompt=prompt, palette=palette))
    return {
        "image": {
            "path": image_path,
            "media_kind": "image",
            "mime_type": "image/svg+xml",
            "prompt": prompt,
            "model": "deterministic-mock-image",
        },
        "artifacts": [
            artifact_record(
                "image_reference_frame",
                "image",
                image_path,
                "image/svg+xml",
                str(payload["step_id"]),
                {"prompt_hash": sha256_text(prompt)[:16]},
            )
        ],
    }


def tool_video_generate_mock(payload: JsonDict) -> JsonDict:
    text_plan = payload.get("text_plan") if isinstance(payload.get("text_plan"), dict) else {}
    image_result = payload.get("image_result") if isinstance(payload.get("image_result"), dict) else {}
    plan = text_plan.get("plan") if isinstance(text_plan.get("plan"), dict) else {}
    scenes = plan.get("scenes") if isinstance(plan.get("scenes"), list) else []
    if not scenes:
        raise HarnessError("Cannot generate video: text plan contains no scenes", ERROR_RETRYABLE)
    image = image_result.get("image") if isinstance(image_result.get("image"), dict) else {}
    video_dir = os.path.join(str(payload["artifacts_dir"]), "video")
    video_html_path = os.path.join(video_dir, "storyboard-video.html")
    video_json_path = os.path.join(video_dir, "storyboard-video.json")
    video_plan = {
        "title": str(plan.get("title") or "Rich media plan"),
        "provider": "deterministic-mock",
        "duration_seconds": max(6, min(18, len(scenes) * 4)),
        "reference_image": str(image.get("path") or ""),
        "scenes": scenes,
    }
    write_json(video_json_path, video_plan)
    write_text(video_html_path, render_mock_video_html(video_plan))
    return {
        "video": {
            "path": video_html_path,
            "url": video_html_path,
            "manifest_path": video_json_path,
            "media_kind": "video",
            "mime_type": "text/html; charset=utf-8",
            "provider": "deterministic-mock",
            "provider_mode_resolved": "mock",
            "provider_status": "completed",
            "model": "deterministic-mock-video",
            "duration_seconds": video_plan["duration_seconds"],
            "reference_image": video_plan["reference_image"],
        },
        "artifacts": [
            artifact_record("video_storyboard_html", "video", video_html_path, "text/html; charset=utf-8", str(payload["step_id"])),
            artifact_record("video_storyboard_manifest", "video", video_json_path, "application/json", str(payload["step_id"])),
        ],
    }


def tool_video_generate_byteplus_modelark_placeholder(payload: JsonDict) -> JsonDict:
    result = tool_video_generate_mock(payload)
    video = result.get("video") if isinstance(result.get("video"), dict) else {}
    if video:
        video["requested_provider_mode"] = "byteplus-modelark"
        video["provider"] = "byteplus-modelark"
        video["provider_mode_resolved"] = "byteplus-modelark"
        video["provider_status"] = "placeholder"
        video["model"] = "operator-selected-modelark-video-model"
        video["remote_mcp_server"] = "byteplus-modelark-media"
        video["placeholder"] = True
    for artifact in result.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        metadata = artifact.get("metadata") if isinstance(artifact.get("metadata"), dict) else {}
        metadata.update({
            "requested_provider_mode": "byteplus-modelark",
            "provider_mode_resolved": "byteplus-modelark",
            "remote_mcp_server": "byteplus-modelark-media",
            "placeholder": True,
        })
        artifact["metadata"] = metadata
    return result


def tool_canvas_write(payload: JsonDict) -> JsonDict:
    run_id = str(payload["run_id"])
    step_id = str(payload["step_id"])
    inspection = payload.get("inspection") if isinstance(payload.get("inspection"), dict) else {}
    skill_result = payload.get("skill_result") if isinstance(payload.get("skill_result"), dict) else {}
    research_result = payload.get("research_result") if isinstance(payload.get("research_result"), dict) else {}
    code_result = payload.get("code_result") if isinstance(payload.get("code_result"), dict) else {}
    text_plan = payload.get("text_plan") if isinstance(payload.get("text_plan"), dict) else {}
    image_result = payload.get("image_result") if isinstance(payload.get("image_result"), dict) else {}
    video_result = payload.get("video_result") if isinstance(payload.get("video_result"), dict) else {}
    plan = text_plan.get("plan") if isinstance(text_plan.get("plan"), dict) else {}
    skills = skill_result.get("skills") if isinstance(skill_result.get("skills"), dict) else {}
    research = research_result.get("research") if isinstance(research_result.get("research"), dict) else {}
    code = code_result.get("code") if isinstance(code_result.get("code"), dict) else {}
    sandbox = code.get("sandbox") if isinstance(code.get("sandbox"), dict) else {}
    image = image_result.get("image") if isinstance(image_result.get("image"), dict) else {}
    video = video_result.get("video") if isinstance(video_result.get("video"), dict) else {}
    requested_provider_mode = str(payload.get("state", {}).get("run", {}).get("provider_mode") or "mock")
    resolved_provider_mode = str(video.get("provider_mode_resolved") or requested_provider_mode or "mock")
    video_url = str(video.get("url") or video.get("path") or "")
    video_output_path = str(video.get("manifest_path") or video.get("path") or "")
    artifacts_dir = str(payload["artifacts_dir"])
    canvas_dir = os.path.join(artifacts_dir, "canvas")
    workspace_dir = os.path.join(artifacts_dir, "workspace")
    graph_path = os.path.join(canvas_dir, "canvas.graph.json")
    preview_path = os.path.join(canvas_dir, "canvas-preview.html")
    workspace_path = os.path.join(workspace_dir, "rich-media-flow.md")
    text_plan_path = artifact_path_by_id(text_plan, "text_scene_plan_markdown")
    text_output = build_text_widget_output(plan, text_plan_path)
    text_output_src_doc = render_text_output_src_doc(plan)
    layout = balanced_layout_metadata()

    nodes = [
        graph_node(
            "goal",
            "Goal",
            "Goal",
            int(balanced_layout_entry("goal")["x"]),
            int(balanced_layout_entry("goal")["y"]),
            balanced_layout_props("goal", {
                "runId": run_id,
                "goalHash": str(payload.get("state", {}).get("run", {}).get("goal_hash") or ""),
                "surfaceRoute": RICH_MEDIA_SURFACE_ROUTE,
            }),
        ),
        graph_node(
            "brief",
            str(inspection.get("title") or "Input brief"),
            "Brief",
            int(balanced_layout_entry("brief")["x"]),
            int(balanced_layout_entry("brief")["y"]),
            balanced_layout_props(
                "brief",
                {"sourceName": str(inspection.get("source_name") or ""), "sourceHash": str(inspection.get("source_hash") or "")},
            ),
        ),
        graph_node(
            "skill-selector",
            "Selected skills",
            "SkillSelector",
            int(balanced_layout_entry("skill-selector")["x"]),
            int(balanced_layout_entry("skill-selector")["y"]),
            balanced_layout_props(
                "skill-selector",
                {
                    "artifactPath": artifact_path_by_id(skill_result, "selected_skills_json"),
                    "selectedCount": len(skills.get("selected") if isinstance(skills.get("selected"), list) else []),
                    "handles": {"target": ["brief"], "source": ["selected_skills"]},
                },
            ),
        ),
        graph_node(
            "research-scout",
            "Research pack",
            "ResearchAgent",
            int(balanced_layout_entry("research-scout")["x"]),
            int(balanced_layout_entry("research-scout")["y"]),
            balanced_layout_props(
                "research-scout",
                {
                    "artifactPath": artifact_path_by_id(research_result, "research_pack_json"),
                    "evidenceCount": len(research.get("evidence") if isinstance(research.get("evidence"), list) else []),
                    "summary": str(research.get("summary") or ""),
                    "handles": {"target": ["brief"], "source": ["research_pack"]},
                },
            ),
        ),
        graph_node(
            "code-sandbox",
            "Code sandbox",
            "CodeWorker",
            int(balanced_layout_entry("code-sandbox")["x"]),
            int(balanced_layout_entry("code-sandbox")["y"]),
            balanced_layout_props(
                "code-sandbox",
                {
                    "artifactPath": str(code.get("path") or ""),
                    "sandboxResultPath": str(code.get("sandbox_result_path") or ""),
                    "sandboxPassed": bool(sandbox.get("passed")),
                    "handles": {"target": ["research_pack"], "source": ["code_result"]},
                },
            ),
        ),
        graph_node(
            "text-plan",
            "Scene plan",
            "TextGeneration",
            int(balanced_layout_entry("text-plan")["x"]),
            int(balanced_layout_entry("text-plan")["y"]),
            balanced_layout_props("text-plan", {
                "mediaKind": "text",
                "outputPath": text_plan_path,
                "output": text_output,
                "outputSrcDoc": text_output_src_doc,
                "flow:widgetFormId": "textGeneration",
                "handles": {"target": ["prompt_in"], "source": ["text_out"]},
                "sceneCount": len(plan.get("scenes") if isinstance(plan.get("scenes"), list) else []),
            }),
        ),
        graph_node(
            "image-reference",
            "Reference image",
            "ImageGeneration",
            int(balanced_layout_entry("image-reference")["x"]),
            int(balanced_layout_entry("image-reference")["y"]),
            balanced_layout_props("image-reference", {
                "mediaKind": "image",
                "imageUrl": str(image.get("path") or ""),
                "outputPath": str(image.get("path") or ""),
                "flow:widgetFormId": "imageGeneration",
                "handles": {"target": ["reference_image"], "source": ["imageUrl"]},
            }),
        ),
        graph_node(
            "video-storyboard",
            "Storyboard video",
            "VideoGeneration",
            int(balanced_layout_entry("video-storyboard")["x"]),
            int(balanced_layout_entry("video-storyboard")["y"]),
            balanced_layout_props("video-storyboard", {
                "mediaKind": "video",
                "videoUrl": video_url,
                "outputPath": video_output_path,
                "referenceImage": str(video.get("reference_image") or ""),
                "durationSeconds": int(video.get("duration_seconds") or 0),
                "provider": str(video.get("provider") or ""),
                "providerModeResolved": resolved_provider_mode,
                "providerStatus": str(video.get("provider_status") or "completed"),
                "videoId": video.get("video_id"),
                "flow:widgetFormId": "videoGeneration",
                "handles": {"target": ["reference_image"], "source": ["videoUrl"]},
            }),
        ),
        graph_node(
            "rich-media-panel",
            "Rich Media Panel",
            "RichMediaPanel",
            int(balanced_layout_entry("rich-media-panel")["x"]),
            int(balanced_layout_entry("rich-media-panel")["y"]),
            balanced_layout_props("rich-media-panel", {
                "mediaKind": "rich-media-panel",
                "richMediaActiveTab": "auto",
                "flow:widgetFormId": "richMediaPanel",
                "handles": {"target": ["output", "imageUrl", "videoUrl"], "source": []},
                "surfaceRoute": RICH_MEDIA_SURFACE_ROUTE,
            }),
        ),
        graph_node(
            "verification",
            "Verification",
            "Judge",
            int(balanced_layout_entry("verification")["x"]),
            int(balanced_layout_entry("verification")["y"]),
            balanced_layout_props("verification", {"status": "pending", "generatedByStepId": step_id}),
        ),
        graph_node(
            "report",
            "Final report",
            "Report",
            int(balanced_layout_entry("report")["x"]),
            int(balanced_layout_entry("report")["y"]),
            balanced_layout_props("report", {"outputPath": "final-report.md"}),
        ),
    ]
    edges = [
        graph_edge("e-goal-brief", "goal", "brief", "constrains"),
        graph_edge("e-brief-skill", "brief", "skill-selector", "selects_skills", "", "brief"),
        graph_edge("e-skill-research", "skill-selector", "research-scout", "guides_research", "selected_skills", "skill_context"),
        graph_edge("e-brief-research", "brief", "research-scout", "researches", "", "brief"),
        graph_edge("e-research-code", "research-scout", "code-sandbox", "codes", "research_pack", "research_pack"),
        graph_edge("e-code-text", "code-sandbox", "text-plan", "sandbox_result", "code_result", "prompt_in"),
        graph_edge("e-research-text", "research-scout", "text-plan", "research_context", "research_pack", "prompt_in"),
        graph_edge("e-brief-text", "brief", "text-plan", "generates_text"),
        graph_edge("e-text-image", "text-plan", "image-reference", "image_prompt", "text_out", "reference_image"),
        graph_edge("e-image-video", "image-reference", "video-storyboard", "reference_image", "imageUrl", "reference_image"),
        graph_edge("e-text-video", "text-plan", "video-storyboard", "video_prompt", "text_out", "prompt_in"),
        graph_edge("e-text-panel", "text-plan", "rich-media-panel", "panel_text", "text_out", "output"),
        graph_edge("e-image-panel", "image-reference", "rich-media-panel", "panel_image", "imageUrl", "imageUrl"),
        graph_edge("e-video-panel", "video-storyboard", "rich-media-panel", "panel_video", "videoUrl", "videoUrl"),
        graph_edge("e-video-verification", "video-storyboard", "verification", "verifies"),
        graph_edge("e-panel-verification", "rich-media-panel", "verification", "verifies_panel"),
        graph_edge("e-canvas-report", "verification", "report", "summarizes"),
    ]
    for edge in edges:
        if edge.get("id") in RICH_MEDIA_PANEL_EDGE_IDS:
            edge_id = str(edge.get("id") or "")
            edge.setdefault("properties", {})["layoutRoute"] = {
                "frame": BALANCED_LAYOUT_ID,
                "strategy": "fan-in-readable",
                "sourceAnchor": "bottom",
                "targetAnchor": "top",
                "laneIndex": int(RICH_MEDIA_PANEL_EDGE_LANES.get(edge_id, 0)),
                "avoidWidgetContent": True,
            }
    graph = {
        "type": "Graph",
        "metadata": {
            "kind": "superagent-rich-media-canvas",
            "runId": run_id,
            "sourceName": str(inspection.get("source_name") or ""),
            "generatedAt": utc_now_iso(),
            "providerMode": resolved_provider_mode,
            "providerModeRequested": requested_provider_mode,
            "surfaceRoute": RICH_MEDIA_SURFACE_ROUTE,
            "layout": layout,
            "workspaceArtifact": workspace_path,
            "capabilities": SUPERAGENT_TASK_CAPABILITIES,
            "provenance": {"sourceStepId": step_id},
        },
        "nodes": nodes,
        "edges": edges,
    }
    write_json(graph_path, graph)
    write_text(preview_path, render_canvas_preview_html(graph))
    write_text(
        workspace_path,
        render_workspace_flow_markdown(
            run_id=run_id,
            title=str(plan.get("title") or inspection.get("title") or "Rich media flow"),
            text_output=text_output,
            text_output_src_doc=text_output_src_doc,
            text_prompt=first_scene_value(plan, "video_prompt") or first_scene_value(plan, "summary") or str(plan.get("title") or ""),
            image_prompt=str(image.get("prompt") or first_scene_value(plan, "image_prompt") or ""),
            image_url=str(image.get("path") or ""),
            video_prompt=first_scene_value(plan, "video_prompt") or "",
            video_url=video_url,
            source_name=str(inspection.get("source_name") or ""),
            source_hash=str(inspection.get("source_hash") or ""),
        ),
    )
    return {
        "canvas": {
            "path": graph_path,
            "preview_path": preview_path,
            "workspace_path": workspace_path,
            "graph": graph,
        },
        "artifacts": [
            artifact_record("canvas_graph", "canvas", graph_path, "application/json", step_id),
            artifact_record("canvas_preview", "canvas", preview_path, "text/html; charset=utf-8", step_id),
            artifact_record("workspace_rich_media_flow", "workspace", workspace_path, "text/markdown; charset=utf-8", step_id),
        ],
    }


def tool_export_report(payload: JsonDict) -> JsonDict:
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    output_dir = str(payload["output_dir"])
    report_path = os.path.join(output_dir, "final-report.md")
    verification = payload.get("verification") if isinstance(payload.get("verification"), dict) else {}
    write_text(report_path, render_final_report(state=state, verification=verification, output_dir=output_dir))
    return {
        "report": {"path": report_path},
        "artifacts": [
            artifact_record("final_report", "report", report_path, "text/markdown; charset=utf-8", str(payload["step_id"]))
        ],
    }
