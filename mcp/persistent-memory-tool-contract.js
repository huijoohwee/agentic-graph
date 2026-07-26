import {
  PERSISTENT_MEMORY_COMPACT_INPUT_SCHEMA,
  PERSISTENT_MEMORY_INVOKE_INPUT_SCHEMA,
  PERSISTENT_MEMORY_OUTPUT_SCHEMA,
  PERSISTENT_MEMORY_SEARCH_INPUT_SCHEMA,
  PERSISTENT_MEMORY_SEARCH_OUTPUT_SCHEMA,
  PERSISTENT_MEMORY_TOOL_NAMES,
  PERSISTENT_MEMORY_WRITE_INPUT_SCHEMA,
  PERSISTENT_SESSION_SEARCH_INPUT_SCHEMA,
  PERSISTENT_USER_PROFILE_INPUT_SCHEMA,
} from "./persistent-memory-contract.mjs";

const definition = ({
  name,
  title,
  description,
  inputSchema,
  outputSchema = PERSISTENT_MEMORY_OUTPUT_SCHEMA,
}) => ({
  name,
  title,
  description,
  inputSchema,
  outputSchema,
});

export function buildPersistentMemoryToolDefinitions({
  toolNames = PERSISTENT_MEMORY_TOOL_NAMES,
  withDefaults = (tool, annotations) => ({ ...tool, annotations }),
  readOnlyAnnotations,
  mutationAnnotations,
} = {}) {
  return [
    withDefaults(definition({
      name: toolNames.memoryWrite || toolNames.write,
      title: "Persistent Memory Write",
      description:
        "Use this when an agent needs to add, exactly replace, or explicitly remove a bounded source-backed memory with durable revision and idempotency fencing.",
      inputSchema: PERSISTENT_MEMORY_WRITE_INPUT_SCHEMA,
    }), mutationAnnotations),
    withDefaults(definition({
      name: toolNames.memoryCompact || toolNames.compact,
      title: "Persistent Memory Compact",
      description:
        "Use this when an operator needs to compact specifically named memory entries with before-and-after capacity evidence and no silent data loss.",
      inputSchema: PERSISTENT_MEMORY_COMPACT_INPUT_SCHEMA,
    }), mutationAnnotations),
    withDefaults(definition({
      name: toolNames.memorySearch || toolNames.search,
      title: "Persistent Memory Search",
      description:
        "Use this when an agent needs deterministic, cited, exact-scope memory retrieval or a revision-frozen session snapshot with zero model calls.",
      inputSchema: PERSISTENT_MEMORY_SEARCH_INPUT_SCHEMA,
      outputSchema: PERSISTENT_MEMORY_SEARCH_OUTPUT_SCHEMA,
    }), readOnlyAnnotations),
    withDefaults(definition({
      name: toolNames.sessionSearch,
      title: "Persistent Session Search",
      description:
        "Use this when an agent needs read-only cited retrieval from explicitly captured prior session evidence without automatically persisting search results.",
      inputSchema: PERSISTENT_SESSION_SEARCH_INPUT_SCHEMA,
    }), readOnlyAnnotations),
    withDefaults(definition({
      name: toolNames.userProfile,
      title: "Explicit User Profile",
      description:
        "Use this when an operator needs to inspect or explicitly manage a bounded user preference entry while rejecting secrets and unsupported inference.",
      inputSchema: PERSISTENT_USER_PROFILE_INPUT_SCHEMA,
    }), mutationAnnotations),
    withDefaults(definition({
      name: toolNames.memoryInvoke || toolNames.invoke,
      title: "Agentic Canvas OS Memory Invocation",
      description:
        "Use this when a local MCP host needs to execute one exact revision-fenced Agentic Canvas OS memory /, #, and @ tuple through the same durable memory core.",
      inputSchema: PERSISTENT_MEMORY_INVOKE_INPUT_SCHEMA,
    }), mutationAnnotations),
  ];
}
