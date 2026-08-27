import os

CONFIG_ROOT_REL = os.path.join("data", "config")
GRAPHRAG_CONFIG_REL = os.path.join(CONFIG_ROOT_REL, "graphrag", "config.yaml")
UNIVERSAL_ORCHESTRATOR_CONFIG_REL = os.path.join(
    CONFIG_ROOT_REL,
    "orchestrator",
    "knowgrph-universal-orchestrator-config.yaml",
)
UNIVERSAL_SCHEMA_CONFIG_REL = os.path.join(
    CONFIG_ROOT_REL,
    "schema",
    "knowgrph-universal-schema-config.jsonld",
)


def repo_path(base_dir: str, rel_path: str) -> str:
    return os.path.join(base_dir, rel_path)
