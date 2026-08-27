import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from typing import Iterable, Optional, Sequence, Set

from .common import read_json, sha256_text, slugify, utc_now_iso, write_json, write_text
from .agent_definition_registry import DEFAULT_AGENT_DEFINITION_ID, resolve_agent_definition
from .superagent_contracts import (
    ERROR_CONFIG,
    ERROR_FATAL,
    ERROR_RETRYABLE,
    HarnessError,
    JsonDict,
    RICH_MEDIA_SURFACE_ROUTE,
    RunBudget,
    StepRecord,
    TaskSpec,
    ToolRegistry,
    TraceWriter,
)
from .superagent_plan import DEFAULT_SUPERAGENT_PROVIDER_MODE, build_agent_contracts, build_plan, parse_goal_contract
from .superagent_proof_manifest import ensure_harness_proof_manifest_artifact, write_harness_proof_manifest
from .superagent_renderers import render_final_report
from .superagent_tools import build_default_tool_registry
from .superagent_utils import build_run_id, default_output_dir, load_goal_text, read_trace_events, summarize_payload

class SuperAgentHarness:
    def __init__(
        self,
        *,
        input_path: Optional[str],
        output_dir: str,
        goal_text: str,
        run_id: str,
        budget: RunBudget,
        agent_definition_id: str = DEFAULT_AGENT_DEFINITION_ID,
        provider_mode: str = DEFAULT_SUPERAGENT_PROVIDER_MODE,
        resume: bool = False,
        stop_after_step: int = 0,
        fail_once_tools: Optional[Iterable[str]] = None,
    ) -> None:
        self.input_path = os.path.abspath(input_path) if input_path else ""
        self.output_dir = os.path.abspath(output_dir)
        self.goal_text = goal_text
        self.run_id = slugify(run_id)
        self.budget = budget
        self.agent_definition = resolve_agent_definition(agent_definition_id)
        self.agent_definition_id = str(self.agent_definition["id"])
        self.provider_mode = provider_mode
        self.resume = resume
        self.stop_after_step = max(0, int(stop_after_step or 0))
        self.fail_once_tools: Set[str] = set(fail_once_tools or [])
        self.failed_once_tools: Set[str] = set()
        self.started_monotonic = time.monotonic()

        self.artifacts_dir = os.path.join(self.output_dir, "artifacts")
        self.state_path = os.path.join(self.output_dir, "state.json")
        self.trace_path = os.path.join(self.output_dir, "trace.jsonl")
        self.report_path = os.path.join(self.output_dir, "final-report.md")
        self.proof_manifest_path = os.path.join(self.output_dir, "harness-proof.json")
        self.goal_path = os.path.join(self.output_dir, "goal.json")
        self.registry = build_default_tool_registry(self)
        if not resume and os.path.exists(self.trace_path):
            os.remove(self.trace_path)
        self.trace = TraceWriter(self.trace_path)

        if resume:
            self.state = self._load_state()
            self.run_id = str(self.state.get("run", {}).get("run_id") or self.run_id)
            self.failed_once_tools = set(self.state.get("memory", {}).get("failed_once_tools") or [])
        else:
            self.state = self._new_state()
            self._persist_goal()
            self._save_state()

    def run(self) -> JsonDict:
        self.trace.record(
            "run.start",
            {
                "run_id": self.run_id,
                "resume": self.resume,
                "provider_mode": self.provider_mode,
                "agent_definition_id": self.agent_definition_id,
                "budget": asdict(self.budget),
            },
        )
        self.state["run"]["status"] = "running"
        self.state["run"]["started_at"] = self.state["run"].get("started_at") or utc_now_iso()
        self.state["run"]["updated_at"] = utc_now_iso()
        self._save_state()

        while True:
            if self._wall_time_exhausted():
                return self._terminate("blocked", "budget_wall_time_exhausted")
            if int(self.state["run"].get("step_count") or 0) >= self.budget.max_steps:
                return self._terminate("blocked", "budget_max_steps_exhausted")

            next_task = self._next_ready_task()
            if not next_task:
                if self._all_tasks_completed():
                    return self._terminate("completed", "acceptance_criteria_passed")
                return self._terminate("blocked", "no_ready_task_with_unfinished_dependencies")

            self._dispatch_task(next_task)

            completed_count = len(self.state.get("completed_task_ids") or [])
            if self.stop_after_step and completed_count >= self.stop_after_step:
                return self._terminate("interrupted", "stop_after_step_checkpoint")

    def _new_state(self) -> JsonDict:
        goal_hash = sha256_text(self.goal_text)[:16]
        tasks = build_plan(self.provider_mode, self.agent_definition_id)
        agents = build_agent_contracts(self.provider_mode, self.agent_definition_id)
        return {
            "run": {
                "run_id": self.run_id,
                "status": "created",
                "started_at": "",
                "ended_at": "",
                "updated_at": utc_now_iso(),
                "active_plan_version": "plan-v1",
                "goal_hash": goal_hash,
                "input_path": self.input_path,
                "provider_mode": self.provider_mode,
                "agent_definition_id": self.agent_definition_id,
                "agent_invocation": self.agent_definition["invocation"],
                "agent_definition_version": self.agent_definition["version"],
                "step_count": 0,
                "termination_reason": "",
                "budget": asdict(self.budget),
            },
            "goal": asdict(parse_goal_contract(self.goal_text)),
            "agent_definition": self.agent_definition,
            "agents": [asdict(agent) for agent in agents],
            "plan": [asdict(task) for task in tasks],
            "tool_registry": self.registry.describe(),
            "completed_task_ids": [],
            "artifacts": [],
            "steps": [],
            "memory": {
                "observations": {},
                "attempts_by_task": {},
                "failed_once_tools": [],
                "recovery_events": [],
            },
            "verification": {
                "passed": False,
                "checks": [],
            },
        }

    def _load_state(self) -> JsonDict:
        if not os.path.exists(self.state_path):
            raise HarnessError(f"Cannot resume: state file not found at {self.state_path}", ERROR_CONFIG)
        loaded = read_json(self.state_path)
        if not isinstance(loaded, dict):
            raise HarnessError(f"Cannot resume: state file is not an object at {self.state_path}", ERROR_CONFIG)
        return loaded

    def _persist_goal(self) -> None:
        write_json(
            self.goal_path,
            {
                "run_id": self.run_id,
                "goal_hash": sha256_text(self.goal_text),
                "goal": parse_goal_contract(self.goal_text).__dict__,
                "raw_goal": self.goal_text,
            },
        )

    def _save_state(self) -> None:
        os.makedirs(self.output_dir, exist_ok=True)
        memory = self.state.setdefault("memory", {})
        memory["failed_once_tools"] = sorted(self.failed_once_tools)
        self.state["run"]["updated_at"] = utc_now_iso()
        write_json(self.state_path, self.state)

    def _wall_time_exhausted(self) -> bool:
        return (time.monotonic() - self.started_monotonic) >= float(self.budget.max_wall_seconds)

    def _next_ready_task(self) -> Optional[TaskSpec]:
        completed = set(self.state.get("completed_task_ids") or [])
        for task_dict in self.state.get("plan") or []:
            task = TaskSpec(**task_dict)
            if task.task_id in completed:
                continue
            if all(dep in completed for dep in task.depends_on):
                return task
        return None

    def _all_tasks_completed(self) -> bool:
        completed = set(self.state.get("completed_task_ids") or [])
        planned = {str(task.get("task_id")) for task in self.state.get("plan") or [] if isinstance(task, dict)}
        return bool(planned) and planned.issubset(completed)

    def _dispatch_task(self, task: TaskSpec) -> None:
        attempts = self.state.setdefault("memory", {}).setdefault("attempts_by_task", {})
        current_attempt = int(attempts.get(task.task_id) or 0) + 1
        attempts[task.task_id] = current_attempt
        step_id = f"{task.task_id}:{current_attempt}"
        started_at = utc_now_iso()
        payload = self._build_tool_payload(task, step_id)
        step = StepRecord(
            step_id=step_id,
            task_id=task.task_id,
            agent_id=task.agent_id,
            tool_name=task.tool_name,
            status="running",
            started_at=started_at,
            attempt=current_attempt,
            input_summary=summarize_payload(payload),
        )
        self.trace.record(
            "task.dispatch",
            {
                "run_id": self.run_id,
                "step_id": step_id,
                "task_id": task.task_id,
                "agent_id": task.agent_id,
                "tool_name": task.tool_name,
                "attempt": current_attempt,
                "depends_on": task.depends_on,
            },
        )
        self.trace.record(
            "tool.call",
            {
                "run_id": self.run_id,
                "step_id": step_id,
                "tool_name": task.tool_name,
                "input_summary": step.input_summary,
            },
        )

        try:
            if task.tool_name in self.fail_once_tools and task.tool_name not in self.failed_once_tools:
                self.failed_once_tools.add(task.tool_name)
                raise HarnessError(
                    f"Injected one-time failure for {task.tool_name}",
                    ERROR_RETRYABLE,
                    {"tool": task.tool_name, "injected": True},
                )
            observation = self.registry.call(task.tool_name, payload)
            step.status = "completed"
            step.ended_at = utc_now_iso()
            step.output_summary = summarize_payload(observation)
            self._record_observation(task, step, observation)
            self.trace.record(
                "tool.observation",
                {
                    "run_id": self.run_id,
                    "step_id": step_id,
                    "tool_name": task.tool_name,
                    "observation_summary": step.output_summary,
                },
            )
            self.trace.record(
                "step.complete",
                {
                    "run_id": self.run_id,
                    "step_id": step_id,
                    "task_id": task.task_id,
                    "agent_id": task.agent_id,
                    "status": step.status,
                },
            )
            self.state.setdefault("completed_task_ids", []).append(task.task_id)
            self.state.setdefault("steps", []).append(asdict(step))
            self.state["run"]["step_count"] = int(self.state["run"].get("step_count") or 0) + 1
            self._save_state()
            return
        except HarnessError as error:
            step.status = "failed"
            step.ended_at = utc_now_iso()
            step.error = {"kind": error.kind, "message": error.message, "detail": error.detail}
            self.state.setdefault("steps", []).append(asdict(step))
            self.state["run"]["step_count"] = int(self.state["run"].get("step_count") or 0) + 1
            self.trace.record(
                "step.error",
                {
                    "run_id": self.run_id,
                    "step_id": step_id,
                    "task_id": task.task_id,
                    "agent_id": task.agent_id,
                    "error": step.error,
                },
            )
            if error.kind == ERROR_RETRYABLE and current_attempt <= min(task.max_retries, self.budget.max_retries_per_task):
                recovery_event = {
                    "task_id": task.task_id,
                    "step_id": step_id,
                    "agent_id": task.agent_id,
                    "tool_name": task.tool_name,
                    "attempt": current_attempt,
                    "next_attempt": current_attempt + 1,
                    "strategy": "bounded_retry",
                    "error": step.error,
                }
                self.state.setdefault("memory", {}).setdefault("recovery_events", []).append(recovery_event)
                self.trace.record("recovery.retry", {"run_id": self.run_id, **recovery_event})
                self._save_state()
                return
            self._save_state()
            raise

    def _build_tool_payload(self, task: TaskSpec, step_id: str) -> JsonDict:
        memory = self.state.setdefault("memory", {}).setdefault("observations", {})
        common = {
            "run_id": self.run_id,
            "step_id": step_id,
            "output_dir": self.output_dir,
            "artifacts_dir": self.artifacts_dir,
            "state": self.state,
            "tool_count": len(self.registry.describe()),
            "tool_inventory": self.registry.describe(),
            "goal_text": self.goal_text,
        }
        if task.tool_name == "workspace.inspect":
            return {
                **common,
                "input_path": self.input_path or str(self.state.get("run", {}).get("input_path") or ""),
                "goal_text": self.goal_text,
            }
        if task.tool_name == "research.scout":
            return {**common, "inspection": memory.get("inspect_goal") or {}}
        if task.tool_name == "skill.select":
            return {**common, "inspection": memory.get("inspect_goal") or {}}
        if task.tool_name == "code.write_and_run":
            return {
                **common,
                "inspection": memory.get("inspect_goal") or {},
                "research_result": memory.get("research_goal") or {},
            }
        if task.tool_name == "text.generate.mock":
            return {
                **common,
                "inspection": memory.get("inspect_goal") or {},
                "skill_result": memory.get("select_skills") or {},
                "research_result": memory.get("research_goal") or {},
                "code_result": memory.get("code_sandbox") or {},
            }
        if task.tool_name == "image.generate.mock":
            return {**common, "text_plan": memory.get("generate_text") or {}}
        if task.tool_name in {"video.generate.mock", "video.generate.byteplus_modelark_placeholder"}:
            return {
                **common,
                "text_plan": memory.get("generate_text") or {},
                "image_result": memory.get("generate_image") or {},
            }
        if task.tool_name == "canvas.write":
            return {
                **common,
                "inspection": memory.get("inspect_goal") or {},
                "skill_result": memory.get("select_skills") or {},
                "research_result": memory.get("research_goal") or {},
                "code_result": memory.get("code_sandbox") or {},
                "text_plan": memory.get("generate_text") or {},
                "image_result": memory.get("generate_image") or {},
                "video_result": memory.get("generate_video") or {},
            }
        if task.tool_name == "judge.verify":
            return {**common, "canvas_result": memory.get("compose_canvas") or {}}
        if task.tool_name == "artifact.export_report":
            return {**common, "verification": memory.get("verify_outputs") or {}}
        raise HarnessError(f"No payload builder for tool {task.tool_name}", ERROR_FATAL)

    def _record_observation(self, task: TaskSpec, step: StepRecord, observation: JsonDict) -> None:
        observations = self.state.setdefault("memory", {}).setdefault("observations", {})
        observations[task.task_id] = observation
        for artifact in observation.get("artifacts") or []:
            if not isinstance(artifact, dict):
                continue
            normalized = {
                "artifact_id": str(artifact.get("artifact_id") or f"{task.task_id}:artifact"),
                "kind": str(artifact.get("kind") or "artifact"),
                "path": str(artifact.get("path") or ""),
                "media_type": str(artifact.get("media_type") or "application/octet-stream"),
                "source_step_id": str(artifact.get("source_step_id") or step.step_id),
                "metadata": artifact.get("metadata") if isinstance(artifact.get("metadata"), dict) else {},
            }
            if normalized["path"]:
                self.state.setdefault("artifacts", []).append(normalized)
        if task.task_id == "verify_outputs":
            verification = observation.get("verification")
            if isinstance(verification, dict):
                self.state["verification"] = verification

    def _terminate(self, status: str, reason: str) -> JsonDict:
        self.state["run"]["status"] = status
        self.state["run"]["ended_at"] = utc_now_iso()
        self.state["run"]["termination_reason"] = reason
        ensure_harness_proof_manifest_artifact(self.state, self.proof_manifest_path)
        if any(
            isinstance(artifact, dict) and artifact.get("artifact_id") == "final_report"
            for artifact in (self.state.get("artifacts") or [])
        ):
            write_text(
                self.report_path,
                render_final_report(
                    state=self.state,
                    verification=self.state.get("verification") if isinstance(self.state.get("verification"), dict) else {},
                    output_dir=self.output_dir,
                ),
            )
        self._save_state()
        self.trace.record("run.terminate", {"run_id": self.run_id, "status": status, "termination_reason": reason, "artifact_count": len(self.state.get("artifacts") or []), "completed_task_ids": self.state.get("completed_task_ids") or [], "verification": self.state.get("verification") or {}})
        write_harness_proof_manifest(state=self.state, output_dir=self.output_dir, trace_path=self.trace_path, report_path=self.report_path, proof_manifest_path=self.proof_manifest_path, surface_route=RICH_MEDIA_SURFACE_ROUTE)
        return self.state


def run_harness(
    *,
    input_path: Optional[str],
    output_dir: str,
    goal_text: str,
    run_id: str,
    budget: Optional[RunBudget] = None,
    agent_definition_id: str = DEFAULT_AGENT_DEFINITION_ID,
    provider_mode: str = DEFAULT_SUPERAGENT_PROVIDER_MODE,
    resume: bool = False,
    stop_after_step: int = 0,
    fail_once_tools: Optional[Iterable[str]] = None,
) -> JsonDict:
    harness = SuperAgentHarness(
        input_path=input_path,
        output_dir=output_dir,
        goal_text=goal_text,
        run_id=run_id,
        budget=budget or RunBudget(),
        agent_definition_id=agent_definition_id,
        provider_mode=provider_mode,
        resume=resume,
        stop_after_step=stop_after_step,
        fail_once_tools=fail_once_tools,
    )
    return harness.run()


def main(argv: Optional[Sequence[str]] = None, *, base_dir: Optional[str] = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Knowgrph Codex-compatible super-agent harness.")
    parser.add_argument("--input", default="", help="Path to a markdown or text brief. Required unless --resume is used.")
    parser.add_argument("--goal-file", default="", help="Path to the goal contract. Defaults to ./goal when present.")
    parser.add_argument("--output-dir", default="", help="Directory for state, trace, and artifacts.")
    parser.add_argument("--run-id", default="", help="Stable run id. Defaults to a timestamped id.")
    parser.add_argument(
        "--agent-definition",
        default=DEFAULT_AGENT_DEFINITION_ID,
        help="Agent definition id or slash invocation, for example agent.sme-care or /sme-care-agent.",
    )
    parser.add_argument(
        "--provider-mode",
        default=DEFAULT_SUPERAGENT_PROVIDER_MODE,
        choices=[DEFAULT_SUPERAGENT_PROVIDER_MODE, "mock"],
        help="Media provider mode. Defaults to a BytePlus ModelArk placeholder; mock remains deterministic.",
    )
    parser.add_argument("--resume", action="store_true", help="Resume from output-dir/state.json.")
    parser.add_argument("--stop-after-step", type=int, default=0, help="Checkpoint after N completed tasks, then stop as interrupted.")
    parser.add_argument("--fail-once", action="append", default=[], help="Inject one retryable failure for the named tool.")
    parser.add_argument("--max-steps", type=int, default=80, help="Maximum recorded steps.")
    parser.add_argument("--max-retries", type=int, default=2, help="Maximum retries per task.")
    parser.add_argument("--max-wall-seconds", type=int, default=900, help="Maximum wall time.")
    parser.add_argument("--print-summary", action="store_true", help="Print a compact JSON summary.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    root = os.path.abspath(base_dir or os.getcwd())
    goal_text = load_goal_text(str(args.goal_file or ""), root)
    run_id = build_run_id(str(args.input or ""), goal_text, str(args.run_id or ""))
    output_dir = os.path.abspath(str(args.output_dir or "") or default_output_dir(root, run_id))
    if args.resume and not args.output_dir:
        print("--resume requires --output-dir", file=sys.stderr)
        return 2
    if not args.resume and not str(args.input or "").strip():
        print("--input is required unless --resume is used", file=sys.stderr)
        return 2
    if args.resume:
        state = read_json(os.path.join(output_dir, "state.json"))
        if isinstance(state, dict):
            run_id = str(state.get("run", {}).get("run_id") or run_id)
            args.agent_definition = str(state.get("run", {}).get("agent_definition_id") or args.agent_definition)

    try:
        state = run_harness(
            input_path=str(args.input or "") or None,
            output_dir=output_dir,
            goal_text=goal_text,
            run_id=run_id,
            agent_definition_id=str(args.agent_definition),
            budget=RunBudget(
                max_steps=int(args.max_steps),
                max_retries_per_task=int(args.max_retries),
                max_wall_seconds=int(args.max_wall_seconds),
            ),
            provider_mode=str(args.provider_mode),
            resume=bool(args.resume),
            stop_after_step=int(args.stop_after_step or 0),
            fail_once_tools=list(args.fail_once or []),
        )
    except HarnessError as error:
        print(f"superagent: {error.kind}: {error.message}", file=sys.stderr)
        if error.detail:
            print(json.dumps(error.detail, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1

    summary = {
        "run_id": state.get("run", {}).get("run_id"),
        "status": state.get("run", {}).get("status"),
        "termination_reason": state.get("run", {}).get("termination_reason"),
        "output_dir": output_dir,
        "trace": os.path.join(output_dir, "trace.jsonl"),
        "state": os.path.join(output_dir, "state.json"),
        "report": os.path.join(output_dir, "final-report.md"),
        "verification_passed": bool(state.get("verification", {}).get("passed")),
        "artifact_count": len(state.get("artifacts") or []),
    }
    if args.print_summary or True:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["status"] in {"completed", "interrupted"} else 3


if __name__ == "__main__":
    raise SystemExit(main())
