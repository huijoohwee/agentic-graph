import json
import os
from typing import Any, Dict, List

from .common import utc_now_iso, write_json
from .superagent_contracts import SUPERAGENT_TASK_CAPABILITIES, SUPERAGENT_TASK_LEVELS
from .superagent_responsive import required_responsive_proof_class_ids, responsive_evidence_from_checks


JsonDict = Dict[str, Any]


def _read_trace_events(trace_path: str) -> List[JsonDict]:
    events: List[JsonDict] = []
    try:
      with open(trace_path, "r", encoding="utf-8") as f:
          for line in f:
              raw = line.strip()
              if not raw:
                  continue
              try:
                  parsed = json.loads(raw)
              except json.JSONDecodeError:
                  continue
              if isinstance(parsed, dict):
                  events.append(parsed)
    except FileNotFoundError:
        return []
    return events


def _count_by_key(items: List[JsonDict], key: str, fallback: str = "") -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in items:
        name = str(item.get(key) or fallback)
        if not name:
            continue
        counts[name] = counts.get(name, 0) + 1
    return counts


def _upsert_artifact(state: JsonDict, artifact: JsonDict) -> None:
    artifact_id = str(artifact.get("artifact_id") or "").strip()
    if not artifact_id:
        return
    artifacts = state.setdefault("artifacts", [])
    for idx, existing in enumerate(artifacts):
        if isinstance(existing, dict) and str(existing.get("artifact_id") or "").strip() == artifact_id:
            artifacts[idx] = artifact
            return
    artifacts.append(artifact)


def ensure_harness_proof_manifest_artifact(state: JsonDict, proof_manifest_path: str) -> None:
    report_artifact = next(
        (
            artifact
            for artifact in (state.get("artifacts") or [])
            if isinstance(artifact, dict) and artifact.get("artifact_id") == "final_report"
        ),
        None,
    )
    _upsert_artifact(state, {
        "artifact_id": "harness_proof_manifest",
        "kind": "proof",
        "path": proof_manifest_path,
        "media_type": "application/json",
        "source_step_id": str((report_artifact or {}).get("source_step_id") or "run.terminate"),
        "metadata": {"schema_version": "knowgrph.superagent.proof.v1"},
    })


def render_harness_proof_manifest_report_lines(artifacts: List[JsonDict], output_dir: str) -> List[str]:
    proof_artifact = next(
        (
            artifact
            for artifact in artifacts
            if isinstance(artifact, dict) and artifact.get("artifact_id") == "harness_proof_manifest"
        ),
        None,
    )
    if not proof_artifact:
        return ["", "## Proof Manifest", "", "- Pending until run termination"]
    proof_path = str(proof_artifact.get("path") or "")
    proof_display = os.path.relpath(proof_path, output_dir) if proof_path and os.path.isabs(proof_path) else proof_path
    return ["", "## Proof Manifest", "", f"- `{proof_display}`"]


def write_harness_proof_manifest(**kwargs: Any) -> None:
    write_json(kwargs["proof_manifest_path"], build_harness_proof_manifest(**kwargs))


def build_harness_proof_manifest(
    *,
    state: JsonDict,
    output_dir: str,
    trace_path: str,
    report_path: str,
    proof_manifest_path: str,
    surface_route: str,
) -> JsonDict:
    run = state.get("run") if isinstance(state.get("run"), dict) else {}
    goal = state.get("goal") if isinstance(state.get("goal"), dict) else {}
    agents = [agent for agent in (state.get("agents") or []) if isinstance(agent, dict)]
    plan = [task for task in (state.get("plan") or []) if isinstance(task, dict)]
    steps = [step for step in (state.get("steps") or []) if isinstance(step, dict)]
    artifacts = [artifact for artifact in (state.get("artifacts") or []) if isinstance(artifact, dict)]
    verification = state.get("verification") if isinstance(state.get("verification"), dict) else {}
    memory = state.get("memory") if isinstance(state.get("memory"), dict) else {}
    trace_events = _read_trace_events(trace_path) if os.path.exists(trace_path) else []
    verification_checks = verification.get("checks") if isinstance(verification.get("checks"), list) else []
    artifact_manifest = []
    for artifact in artifacts:
        path = str(artifact.get("path") or "")
        artifact_manifest.append({
            "artifact_id": artifact.get("artifact_id"),
            "kind": artifact.get("kind"),
            "media_type": artifact.get("media_type"),
            "path": os.path.relpath(path, output_dir) if path and os.path.isabs(path) else path,
            "source_step_id": artifact.get("source_step_id"),
            "exists": bool(path and os.path.exists(path)),
        })

    return {
        "schema_version": "knowgrph.superagent.proof.v1",
        "generated_at": utc_now_iso(),
        "run": {
            "run_id": run.get("run_id"),
            "status": run.get("status"),
            "termination_reason": run.get("termination_reason"),
            "provider_mode": run.get("provider_mode"),
            "step_count": run.get("step_count"),
            "budget": run.get("budget"),
            "goal_hash": run.get("goal_hash"),
        },
        "harness_contract": {
            "goal": goal,
            "stop_rules": goal.get("stop_rules") if isinstance(goal.get("stop_rules"), list) else [],
            "codex_integration": {
                "anchored_on": "OpenAI Codex",
                "cli": "python3 -m knowgrph_parser superagent --input <brief.md> --output-dir <run-output-dir>",
                "mcp_tool": "knowgrph.superagent.run",
                "surface_route": surface_route,
            },
            "capabilities": {
                "task_capabilities": SUPERAGENT_TASK_CAPABILITIES,
                "task_levels": SUPERAGENT_TASK_LEVELS,
                "message_gateway": ["CLI", "local MCP knowgrph.superagent.run"],
                "memory": "state.json observations, trace.jsonl events, proof manifest, recovery events",
                "sandbox": "generated code executes in the run artifact directory with bounded timeout and no shell invocation",
                "tools": [str(tool.get("name") or "") for tool in (state.get("tool_registry") or []) if isinstance(tool, dict)],
                "skills": "registry-backed capability lanes and frontmatter skill hints selected by skill.select",
                "subagents": [str(agent.get("agent_id") or "") for agent in agents],
                "copy_policy": "DeerFlow-inspired concepts only; no copied code, prompts, topology, skill packs, memory layout, or renderer ownership.",
            },
            "orchestration": {
                "agents": agents,
                "tool_by_agent": {
                    str(agent.get("agent_id") or ""): list(agent.get("allowed_tools") or [])
                    for agent in agents
                    if str(agent.get("agent_id") or "")
                },
                "plan_dependencies": {
                    str(task.get("task_id") or ""): [str(dep) for dep in (task.get("depends_on") or [])]
                    for task in plan
                    if str(task.get("task_id") or "")
                },
                "terminal_tasks": [str(task.get("task_id") or "") for task in plan if task.get("terminal") is True],
            },
            "recovery": {
                "max_retries_per_task": (run.get("budget") or {}).get("max_retries_per_task")
                if isinstance(run.get("budget"), dict)
                else None,
                "strategy": "bounded retry for retryable tool errors, checkpoint state before retry",
            },
            "responsive": {
                "strategy": "mobile-first",
                "proof_class_ids": required_responsive_proof_class_ids(),
                "metadata_owner": "canvas graph layout + workspace frontmatter",
            },
        },
        "evidence": {
            "completed_task_ids": [str(task_id) for task_id in (state.get("completed_task_ids") or [])],
            "step_status_counts": _count_by_key(steps, "status", "unknown"),
            "trace_event_counts": _count_by_key(trace_events, "event"),
            "verification": {
                "passed": bool(verification.get("passed")),
                "checked_at": verification.get("checked_at"),
                "check_count": len(verification_checks),
                "checks": verification_checks,
            },
            "responsive": responsive_evidence_from_checks(verification_checks),
            "recovery_events": [event for event in (memory.get("recovery_events") or []) if isinstance(event, dict)],
            "capability_evidence": {
                "skill": {
                    "completed": "select_skills" in (state.get("completed_task_ids") or []),
                    "artifacts": [artifact.get("artifact_id") for artifact in artifacts if artifact.get("kind") == "skill"],
                },
                "research": {
                    "completed": "research_goal" in (state.get("completed_task_ids") or []),
                    "artifacts": [artifact.get("artifact_id") for artifact in artifacts if artifact.get("kind") == "research"],
                },
                "code": {
                    "completed": "code_sandbox" in (state.get("completed_task_ids") or []),
                    "artifacts": [artifact.get("artifact_id") for artifact in artifacts if artifact.get("kind") in {"code", "sandbox"}],
                },
                "create": {
                    "completed": "compose_canvas" in (state.get("completed_task_ids") or []),
                    "artifacts": [artifact.get("artifact_id") for artifact in artifacts if artifact.get("kind") in {"text", "image", "video", "canvas", "workspace"}],
                },
            },
            "artifacts": artifact_manifest,
            "files": {
                "state": os.path.relpath(os.path.join(output_dir, "state.json"), output_dir),
                "trace": os.path.relpath(trace_path, output_dir),
                "report": os.path.relpath(report_path, output_dir),
                "proof_manifest": os.path.relpath(proof_manifest_path, output_dir),
            },
        },
    }
