from typing import List

from .agent_definition_registry import (
    DEFAULT_AGENT_DEFINITION_ID,
    resolve_agent_definition,
    resolve_agent_profile,
)
from .superagent_contracts import AgentContract, GoalSpec, TaskSpec


DEFAULT_SUPERAGENT_PROVIDER_MODE = "byteplus-modelark"


def resolve_video_tool_name(provider_mode: str = DEFAULT_SUPERAGENT_PROVIDER_MODE) -> str:
    normalized = str(provider_mode or DEFAULT_SUPERAGENT_PROVIDER_MODE).strip().lower()
    return "video.generate.mock" if normalized == "mock" else "video.generate.byteplus_modelark_placeholder"


def _resolve_tool_name(tool_name: str, provider_mode: str) -> str:
    return resolve_video_tool_name(provider_mode) if tool_name == "video.generate" else tool_name


def build_agent_contracts(
    provider_mode: str = DEFAULT_SUPERAGENT_PROVIDER_MODE,
    agent_definition_id: str = DEFAULT_AGENT_DEFINITION_ID,
) -> List[AgentContract]:
    definition = resolve_agent_definition(agent_definition_id)
    profile = resolve_agent_profile(definition)
    return [
        AgentContract(
            str(role["id"]),
            str(role["responsibility"]),
            [_resolve_tool_name(str(tool), provider_mode) for tool in role.get("tools") or []],
            "run",
            f"{definition['id']} artifacts owned by {role['id']}",
            f"{role['id']} completion recorded",
        )
        for role in profile.get("roles") or []
    ]


def build_plan(
    provider_mode: str = DEFAULT_SUPERAGENT_PROVIDER_MODE,
    agent_definition_id: str = DEFAULT_AGENT_DEFINITION_ID,
) -> List[TaskSpec]:
    definition = resolve_agent_definition(agent_definition_id)
    profile = resolve_agent_profile(definition)
    return [
        TaskSpec(
            str(task["id"]),
            str(task["label"]),
            str(task["role"]),
            _resolve_tool_name(str(task["tool"]), provider_mode),
            [str(dependency) for dependency in task.get("dependsOn") or []],
            terminal=bool(task.get("terminal")),
        )
        for task in profile.get("tasks") or []
    ]


def parse_goal_contract(goal_text: str) -> GoalSpec:
    constraints: List[str] = []
    output_contract: List[str] = []
    quality_bar: List[str] = []
    stop_rules: List[str] = []
    for line in goal_text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("- "):
            continue
        item = stripped[2:].strip()
        lower = item.lower()
        if "must" in lower or "do not" in lower or "forbid" in lower or "neutral" in lower:
            constraints.append(item)
        if "artifact" in lower or "report" in lower or "canvas" in lower or "trace" in lower:
            output_contract.append(item)
        if "verify" in lower or "validation" in lower or "test" in lower or "quality" in lower:
            quality_bar.append(item)
        if "stop" in lower or "terminate" in lower or "complete only when" in lower:
            stop_rules.append(item)
    return GoalSpec(
        intent="Build and run a Codex-compatible SuperAgent harness for research, code, and creation tasks with rich media canvas output.",
        constraints=constraints[:12],
        output_contract=output_contract[:12],
        quality_bar=quality_bar[:12],
        stop_rules=stop_rules[:12]
        or [
            "Stop when acceptance criteria pass.",
            "Stop when an irrecoverable blocker is recorded.",
            "Stop when configured budgets are exhausted.",
        ],
    )
