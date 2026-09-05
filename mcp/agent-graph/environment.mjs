const RETIRED_ENVIRONMENT_PREFIX = "AGENTIC_OS_KNOWLEDGE_GRAPH_";

export const RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS = Object.freeze([
  "HOST_ROOT",
  "ALLOWED_ROOTS",
  "OUTPUT_ROOT",
  "PDF_TIMEOUT_MS",
  "PDF_MAX_OUTPUT_BYTES",
  "REPOSITORY_HOSTS",
  "ALLOW_PRIVATE_REPOSITORY_NETWORK",
].map((suffix) => `${RETIRED_ENVIRONMENT_PREFIX}${suffix}`));

export function findRetiredAgentGraphEnvironmentKeys(env = {}) {
  return RETIRED_AGENT_GRAPH_ENVIRONMENT_KEYS.filter((key) => Object.hasOwn(env, key));
}

export function retiredAgentGraphEnvironmentMessage(keys) {
  return `Retired agent-graph environment configuration is present: ${keys.join(", ")}. Use AGENTIC_OS_AGENT_GRAPH_* keys.`;
}

export function assertNoRetiredAgentGraphEnvironment(env = {}) {
  const keys = findRetiredAgentGraphEnvironmentKeys(env);
  if (keys.length === 0) return;
  const error = new Error(retiredAgentGraphEnvironmentMessage(keys));
  error.name = "AgentGraphEnvironmentError";
  error.code = "retired_environment";
  error.keys = keys;
  throw error;
}
