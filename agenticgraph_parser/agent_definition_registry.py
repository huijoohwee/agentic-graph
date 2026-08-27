import json
import os
from typing import Any, Dict, List

from .superagent_contracts import ERROR_CONFIG, HarnessError


AGENT_DEFINITION_REGISTRY_SCHEMA = "knowgrph.agent-definition-registry/v1"
DEFAULT_AGENT_DEFINITION_ID = "agent.video"


def _registry_path() -> str:
    return os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            os.pardir,
            "data",
            "config",
            "agents",
            "agent-definitions.json",
        )
    )


def invocation_for_agent_id(agent_id: str) -> str:
    normalized = str(agent_id or "").strip().lower()
    if not normalized.startswith("agent."):
        return ""
    domain = normalized[len("agent.") :]
    if not domain or any(not (part and part.replace("-", "").isalnum()) for part in [domain]):
        return ""
    return f"/{domain}-agent"


def agent_id_for_invocation(invocation: str) -> str:
    token = str(invocation or "").strip().lower().split(" ", 1)[0]
    if not token.startswith("/") or not token.endswith("-agent"):
        return ""
    domain = token[1 : -len("-agent")]
    return f"agent.{domain}" if domain else ""


def load_agent_definition_registry() -> Dict[str, Any]:
    try:
        with open(_registry_path(), "r", encoding="utf-8") as handle:
            document = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise HarnessError(
            "Agent definition registry is unavailable",
            ERROR_CONFIG,
            {"reason": str(error)},
        ) from error
    if not isinstance(document, dict) or document.get("schemaVersion") != AGENT_DEFINITION_REGISTRY_SCHEMA:
        raise HarnessError("Agent definition registry schema is invalid", ERROR_CONFIG)
    if not isinstance(document.get("profiles"), dict) or not isinstance(document.get("agents"), list):
        raise HarnessError("Agent definition registry is incomplete", ERROR_CONFIG)
    return document


def list_agent_definitions() -> List[Dict[str, Any]]:
    document = load_agent_definition_registry()
    return [
        {**definition, "invocation": invocation_for_agent_id(str(definition.get("id") or ""))}
        for definition in document["agents"]
        if isinstance(definition, dict)
    ]


def resolve_agent_definition(selector: str) -> Dict[str, Any]:
    normalized = str(selector or DEFAULT_AGENT_DEFINITION_ID).strip().lower()
    agent_id = agent_id_for_invocation(normalized) if normalized.startswith("/") else normalized
    for definition in list_agent_definitions():
        if definition.get("id") == agent_id:
            return definition
    raise HarnessError(
        f"Unknown agent definition: {selector}",
        ERROR_CONFIG,
        {"agent_definition_id": agent_id, "known": [item["id"] for item in list_agent_definitions()]},
    )


def resolve_agent_profile(definition: Dict[str, Any]) -> Dict[str, Any]:
    document = load_agent_definition_registry()
    profile_id = str(definition.get("planProfile") or "")
    profile = document["profiles"].get(profile_id)
    if not isinstance(profile, dict):
        raise HarnessError(f"Unknown agent plan profile: {profile_id}", ERROR_CONFIG)
    return profile
