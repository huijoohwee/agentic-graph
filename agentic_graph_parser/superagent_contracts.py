import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .common import utc_now_iso

JsonDict = Dict[str, Any]

ERROR_RETRYABLE = "retryable"
ERROR_REPLAN = "recoverable_by_replan"
ERROR_CONFIG = "blocked_by_configuration"
ERROR_FATAL = "fatal"
RICH_MEDIA_SURFACE_ROUTE = (
    "MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> "
    "Balanced 16:9 (1920x1080) Layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges"
)
SUPERAGENT_TASK_CAPABILITIES = ["research", "code", "create"]
SUPERAGENT_TASK_LEVELS = ["quick_triage", "bounded_compile", "deep_research", "parallel_build"]
BALANCED_LAYOUT_ID = "balanced-16x9"
BALANCED_LAYOUT_FRAME = {
    "id": BALANCED_LAYOUT_ID,
    "label": "Balanced 16:9",
    "width": 1920,
    "height": 1080,
    "aspectRatio": "16:9",
    "centroid": {"x": 960, "y": 540, "tolerance": 1},
}
BALANCED_WIDGET_LAYOUT = {
    "text-plan": {
        "x": 160,
        "y": 326,
        "width": 360,
        "height": 250,
        "role": "textWidget",
        "xIndex": -1,
        "yIndex": -1,
        "zIndex": 0,
    },
    "image-reference": {
        "x": 780,
        "y": 326,
        "width": 360,
        "height": 250,
        "role": "imageWidget",
        "xIndex": 0,
        "yIndex": -1,
        "zIndex": 0,
    },
    "video-storyboard": {
        "x": 1400,
        "y": 326,
        "width": 360,
        "height": 250,
        "role": "videoWidget",
        "xIndex": 1,
        "yIndex": -1,
        "zIndex": 0,
    },
    "rich-media-panel": {
        "x": 700,
        "y": 660,
        "width": 520,
        "height": 292,
        "role": "richMediaPanel",
        "xIndex": 0,
        "yIndex": 1,
        "zIndex": 1,
    },
    "goal": {"x": 60, "y": 40, "width": 260, "height": 96, "role": "provenance", "xIndex": -2, "yIndex": -2, "zIndex": -1},
    "brief": {"x": 420, "y": 40, "width": 280, "height": 96, "role": "brief", "xIndex": -1, "yIndex": -2, "zIndex": -1},
    "skill-selector": {"x": 760, "y": 40, "width": 260, "height": 96, "role": "skillSelector", "xIndex": 0, "yIndex": -2, "zIndex": -1},
    "research-scout": {"x": 1100, "y": 40, "width": 300, "height": 96, "role": "research", "xIndex": 1, "yIndex": -2, "zIndex": -1},
    "code-sandbox": {"x": 1440, "y": 40, "width": 300, "height": 96, "role": "codeSandbox", "xIndex": 2, "yIndex": -2, "zIndex": -1},
    "verification": {"x": 160, "y": 800, "width": 360, "height": 140, "role": "verification", "xIndex": -1, "yIndex": 2, "zIndex": 0},
    "report": {"x": 1400, "y": 800, "width": 360, "height": 140, "role": "report", "xIndex": 1, "yIndex": 2, "zIndex": 0},
}
RICH_MEDIA_PANEL_EDGE_IDS = {"e-text-panel", "e-image-panel", "e-video-panel"}
RICH_MEDIA_PANEL_EDGE_LANES = {"e-text-panel": -1, "e-image-panel": 0, "e-video-panel": 1}


@dataclass
class HarnessError(Exception):
    message: str
    kind: str = ERROR_FATAL
    detail: JsonDict = field(default_factory=dict)

    def __str__(self) -> str:
        return self.message


@dataclass
class ArtifactRecord:
    artifact_id: str
    kind: str
    path: str
    media_type: str
    source_step_id: str
    metadata: JsonDict = field(default_factory=dict)


@dataclass
class StepRecord:
    step_id: str
    task_id: str
    agent_id: str
    tool_name: str
    status: str
    started_at: str
    ended_at: Optional[str] = None
    attempt: int = 1
    input_summary: JsonDict = field(default_factory=dict)
    output_summary: JsonDict = field(default_factory=dict)
    error: Optional[JsonDict] = None


@dataclass
class AgentContract:
    agent_id: str
    role: str
    allowed_tools: List[str]
    memory_scope: str
    artifact_responsibility: str
    completion_signal: str


@dataclass
class TaskSpec:
    task_id: str
    label: str
    agent_id: str
    tool_name: str
    depends_on: List[str] = field(default_factory=list)
    max_retries: int = 2
    terminal: bool = False


@dataclass
class RunBudget:
    max_steps: int = 80
    max_retries_per_task: int = 2
    max_wall_seconds: int = 900
    max_concurrent_workers: int = 3


@dataclass
class GoalSpec:
    intent: str
    constraints: List[str]
    output_contract: List[str]
    quality_bar: List[str]
    stop_rules: List[str]


@dataclass
class ToolDefinition:
    name: str
    description: str
    required: Dict[str, str]
    optional: Dict[str, str]
    timeout_seconds: int
    retryable_error_kinds: List[str]
    handler: Callable[[JsonDict], JsonDict]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise HarnessError(f"Duplicate tool registration: {tool.name}", ERROR_FATAL)
        self._tools[tool.name] = tool

    def describe(self) -> List[JsonDict]:
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "required": tool.required,
                "optional": tool.optional,
                "timeout_seconds": tool.timeout_seconds,
                "retryable_error_kinds": tool.retryable_error_kinds,
            }
            for tool in self._tools.values()
        ]

    def call(self, name: str, payload: JsonDict) -> JsonDict:
        tool = self._tools.get(name)
        if not tool:
            raise HarnessError(f"Unknown tool: {name}", ERROR_FATAL)
        self._validate_payload(tool, payload)
        return tool.handler(payload)

    def _validate_payload(self, tool: ToolDefinition, payload: JsonDict) -> None:
        if not isinstance(payload, dict):
            raise HarnessError(f"Tool {tool.name} payload must be an object", ERROR_FATAL)
        for key, type_name in tool.required.items():
            if key not in payload:
                raise HarnessError(
                    f"Tool {tool.name} missing required input: {key}",
                    ERROR_FATAL,
                    {"tool": tool.name, "field": key},
                )
            if not _matches_json_type(payload[key], type_name):
                raise HarnessError(
                    f"Tool {tool.name} input {key} must be {type_name}",
                    ERROR_FATAL,
                    {"tool": tool.name, "field": key, "expected": type_name},
                )


class TraceWriter:
    def __init__(self, trace_path: str) -> None:
        self.trace_path = trace_path
        os.makedirs(os.path.dirname(trace_path), exist_ok=True)

    def record(self, event: str, payload: JsonDict) -> None:
        row = {
            "ts": utc_now_iso(),
            "event": event,
            **payload,
        }
        with open(self.trace_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _matches_json_type(value: Any, type_name: str) -> bool:
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "object":
        return isinstance(value, dict)
    if type_name == "array":
        return isinstance(value, list)
    if type_name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if type_name == "boolean":
        return isinstance(value, bool)
    return True
