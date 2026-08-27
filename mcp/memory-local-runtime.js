import {
  addMemoryLayerMemory,
  assembleMemoryLayerPrompt,
  extractProceduralMemory,
  materializeUserModel,
} from "./memory-layer-runtime.js";
import {
  PERSISTENT_MEMORY_CONTRACT_VERSION,
  PERSISTENT_MEMORY_TOOL_NAMES,
  isPersistentMemoryToolName,
} from "./persistent-memory-contract.mjs";
import { createPersistentMemoryInvocationRuntime } from "./persistent-memory-invocation-runtime.js";
import { createPersistentMemoryRuntime } from "./persistent-memory-runtime.js";
import { createLocalPersistentMemoryStore } from "./persistent-memory-store.js";
import { AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES } from "../canvas/src/features/memory/aiAgentsMemoryLayerContract.mjs";

const LEGACY_MEMORY_TOOL_NAMES = new Set(Object.values(AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES));
const ECONOMICS = Object.freeze({
  provider: "local-deterministic",
  model_calls: 0,
  estimated_cost_usd: 0,
});

const persistentFailure = (toolName, error) => {
  const typed = /^[a-z][a-z0-9_]{0,95}$/.test(String(error?.code || ""));
  return {
    ok: false,
    contractVersion: PERSISTENT_MEMORY_CONTRACT_VERSION,
    operation: toolName,
    ...(toolName === PERSISTENT_MEMORY_TOOL_NAMES.search ? { results: [] } : {}),
    error: {
      code: typed ? error.code : "persistent_memory_failed",
      message: typed ? error.message : "The persistent-memory operation failed.",
      ...(typed && error.details && typeof error.details === "object"
        ? { details: structuredClone(error.details) }
        : {}),
      ...(typed && Number.isSafeInteger(error.currentRevision)
        ? { current_revision: error.currentRevision }
        : {}),
    },
    economics: { ...ECONOMICS },
  };
};

export function createLocalMemoryToolRuntime({
  rootDir = process.cwd(),
  env = process.env,
  now,
} = {}) {
  let persistentRuntime;
  let invocationRuntime;

  const getPersistentRuntime = () => {
    if (!persistentRuntime) {
      const store = createLocalPersistentMemoryStore({ rootDir, env, now });
      persistentRuntime = createPersistentMemoryRuntime({
        store,
        now,
        authorizationSecret: env.AGENTICGRAPH_MEMORY_APPROVAL_HMAC_KEY,
      });
    }
    return persistentRuntime;
  };

  const getInvocationRuntime = () => {
    if (!invocationRuntime) {
      invocationRuntime = createPersistentMemoryInvocationRuntime({
        rootDir,
        env,
        dispatch: (toolName, args, context) =>
          getPersistentRuntime().run(toolName, args, context),
      });
    }
    return invocationRuntime;
  };

  const legacyHandlers = Object.freeze({
    [AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES.add]: (args) =>
      addMemoryLayerMemory(args, { rootDir }),
    [AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES.assemblePrompt]: (args) =>
      assembleMemoryLayerPrompt(args),
    [AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES.extractProcedural]: (args) =>
      extractProceduralMemory(args, { rootDir }),
    [AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES.materializeUserModel]: (args) =>
      materializeUserModel(args, { rootDir }),
  });

  const supports = (toolName) =>
    LEGACY_MEMORY_TOOL_NAMES.has(toolName) || isPersistentMemoryToolName(toolName);

  async function run(toolName, args = {}) {
    if (toolName === PERSISTENT_MEMORY_TOOL_NAMES.invoke) {
      return getInvocationRuntime().run(args);
    }
    if (isPersistentMemoryToolName(toolName)) {
      try {
        return await getPersistentRuntime().run(toolName, args);
      } catch (error) {
        return persistentFailure(toolName, error);
      }
    }
    const handler = legacyHandlers[toolName];
    if (!handler) throw new Error(`Unknown memory tool: ${toolName}`);
    return handler(args);
  }

  return Object.freeze({ supports, run });
}
