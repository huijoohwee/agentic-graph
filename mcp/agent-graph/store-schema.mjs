import { sourcePartByteLimit } from "./source-sharding.mjs";

export const AGENT_GRAPH_POINTER_SCHEMA = "agentic-graph-agent-graph-pointer/v1";
export const AGENT_GRAPH_MANIFEST_SCHEMA = "agentic-graph-agent-graph-sharded-manifest/v1";
export const AGENT_GRAPH_SOURCE_SHARD_SCHEMA = "agentic-graph-agent-graph-source-shard/v1";
export const LEGACY_AGENT_GRAPH_POINTER_SCHEMA = "agentic-graph-knowledge-graph-pointer/v1";
export const LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA = "agentic-graph-knowledge-graph-sharded-manifest/v1";
export const LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA = "agentic-graph-knowledge-graph-source-shard/v1";
export const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export const MAX_POINTER_BYTES = 64 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
export const MAX_OBJECT_BYTES = 128 * 1024 * 1024;
export const agentGraphSourceShardByteLimit = value => sourcePartByteLimit(value);
