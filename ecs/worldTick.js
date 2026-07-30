import { createCostLog, validateCostLog } from "../contracts/cost-log.schema.js";
import { normalizeDecisionRecord } from "./kgcNodeContract.js";
import {
  readField,
  restoreComponent,
  setComponentValues,
  snapshotComponent,
  validateComponentValues,
  writeField,
} from "./componentStore.js";
import { queryDuringWorldTick } from "./query.js";
import {
  assertWorldEntity,
  beginWorldTick,
  endWorldTick,
  getWorldComponentStore,
  getWorldRuntimeOptions,
  getWorldSystems,
} from "./world.js";

const DEFAULT_REASONING_TIMEOUT_MS = 30_000;

function ecsError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "EcsError";
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneRecord(value, label) {
  if (!isPlainObject(value)) {
    throw ecsError("ECS_INVALID_DECISION_RECORD", `${label} must be a plain object`);
  }
  try {
    return structuredClone(value);
  } catch {
    throw ecsError("ECS_INVALID_DECISION_RECORD", `${label} must be structured-cloneable`);
  }
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === "string" && error.length > 0 ? error : "unknown ECS failure";
}

function failureResult(error, details = {}) {
  const errorCode = error?.code ?? "ECS_TICK_FAILED";
  const message = errorMessage(error);
  return {
    ok: false,
    errorCode,
    message,
    decisions: details.decisions ?? [],
    deferred_decisions: details.deferredDecisions ?? [],
    cost_logs: [],
    ...(details.failingSystemIndex === undefined
      ? {}
      : {
          failingSystemIndex: details.failingSystemIndex,
          failingSystemName: details.failingSystemName,
          failingSystemCause: message,
        }),
    error: {
      code: errorCode,
      message,
      ...(details.failingSystemIndex === undefined
        ? {}
        : {
            systemIndex: details.failingSystemIndex,
            systemName: details.failingSystemName,
            cause: message,
          }),
    },
  };
}

function stableSystemName(system, systemIndex) {
  const name = system.systemName;
  return typeof name === "string" && name.trim() === name && name.length > 0
    ? name
    : `system-${systemIndex}`;
}

function reasoningTimeoutMs(request) {
  if (!Object.hasOwn(request, "timeoutMs")) return DEFAULT_REASONING_TIMEOUT_MS;
  const value = request.timeoutMs;
  if (!Number.isInteger(value) || value < 1 || value > DEFAULT_REASONING_TIMEOUT_MS) {
    throw ecsError(
      "ECS_INVALID_REASONING_TIMEOUT",
      `reasoning timeoutMs must be an integer from 1 to ${DEFAULT_REASONING_TIMEOUT_MS}`,
    );
  }
  return value;
}

function deferRequest(request, reason, message) {
  return {
    ...request,
    status: "deferred",
    deferred_reason: reason,
    ...(message ? { deferred_message: message } : {}),
  };
}

async function invokeWithTimeout(decisionExecutor, request, input, clock) {
  const timeoutMs = reasoningTimeoutMs(request);
  const controller = new AbortController();
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort("reasoning_timeout");
      reject(
        ecsError(
          "ECS_REASONING_TIMEOUT",
          `decision executor did not return within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => decisionExecutor(request, {
        signal: controller.signal,
        input,
        requestedAt: clock(),
      })),
      timedOut,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function validateExecutorCostLog(result) {
  if (!isPlainObject(result)) {
    throw ecsError("ECS_REASONING_UNAVAILABLE", "decision executor returned no result");
  }
  if (
    Object.hasOwn(result, "cost_log") ||
    !Array.isArray(result.cost_logs) ||
    result.cost_logs.length !== 1
  ) {
    throw ecsError(
      "ECS_INVALID_REASONING_COST_LOG",
      "decision executor must return exactly one harness-owned Cost_Log in cost_logs",
    );
  }

  const [costLog] = result.cost_logs;
  const validation = validateCostLog(costLog);
  if (!validation.valid || costLog.model === "none") {
    throw ecsError(
      "ECS_INVALID_REASONING_COST_LOG",
      "decision executor returned an invalid or non-model Cost_Log",
      { validationErrors: validation.errors },
    );
  }
  return createCostLog(costLog);
}

function validateExecutorDecision(result) {
  if (result.ok === false) {
    throw ecsError("ECS_REASONING_UNAVAILABLE", "decision executor returned no decision");
  }
  if (!Object.hasOwn(result, "decision")) {
    throw ecsError("ECS_INVALID_REASONING_RESULT", "decision executor result is missing decision");
  }
  try {
    return normalizeDecisionRecord(result.decision, "reasoning decision");
  } catch {
    throw ecsError(
      "ECS_INVALID_REASONING_RESULT",
      "decision executor returned an invalid Decision",
    );
  }
}

function createSystemContext(world, systemDecisions, systemReasoningRequests, journal) {
  let active = true;
  const journaled = new Map();

  const assertActive = () => {
    if (!active) {
      throw ecsError("ECS_INACTIVE_SYSTEM_CONTEXT", "system context is no longer active");
    }
  };

  const remember = (componentName, entityId, store) => {
    let entityIds = journaled.get(store);
    if (!entityIds) {
      entityIds = new Set();
      journaled.set(store, entityIds);
    }
    if (entityIds.has(entityId)) return;
    entityIds.add(entityId);
    journal.push({ store, entityId, snapshot: snapshotComponent(store, entityId) });
  };

  const context = Object.freeze({
    query(componentNames) {
      assertActive();
      return queryDuringWorldTick(world, componentNames);
    },
    read(entityId, componentName, fieldName) {
      assertActive();
      assertWorldEntity(world, entityId);
      return readField(getWorldComponentStore(world, componentName), entityId, fieldName);
    },
    write(entityId, componentName, fieldName, value) {
      assertActive();
      assertWorldEntity(world, entityId);
      const store = getWorldComponentStore(world, componentName);
      remember(componentName, entityId, store);
      writeField(store, entityId, fieldName, value);
    },
    setComponent(entityId, componentName, values) {
      assertActive();
      assertWorldEntity(world, entityId);
      const store = getWorldComponentStore(world, componentName);
      validateComponentValues(store, values);
      remember(componentName, entityId, store);
      setComponentValues(store, entityId, values);
    },
    emitDecision(decision) {
      assertActive();
      systemDecisions.push(normalizeDecisionRecord(decision, "system decision"));
    },
    requestReasoning(request) {
      assertActive();
      const cloned = cloneRecord(request, "reasoning request");
      reasoningTimeoutMs(cloned);
      systemReasoningRequests.push(cloned);
      return systemReasoningRequests.length - 1;
    },
  });

  return {
    context,
    deactivate() {
      active = false;
    },
  };
}

function rollbackJournal(journal) {
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const entry = journal[index];
    restoreComponent(entry.store, entry.entityId, entry.snapshot);
  }
}

export async function worldTick(world, input) {
  try {
    beginWorldTick(world);
  } catch (error) {
    return failureResult(error);
  }

  const decisions = [];
  const reasoningRequests = [];

  try {
    const systems = getWorldSystems(world);
    for (let systemIndex = 0; systemIndex < systems.length; systemIndex += 1) {
      const system = systems[systemIndex];
      const systemDecisions = [];
      const systemReasoningRequests = [];
      const journal = [];
      const systemContext = createSystemContext(
        world,
        systemDecisions,
        systemReasoningRequests,
        journal,
      );

      try {
        await system(systemContext.context, input);
        decisions.push(...systemDecisions);
        reasoningRequests.push(...systemReasoningRequests);
      } catch (error) {
        rollbackJournal(journal);
        const skippedReasoning = reasoningRequests.map((request) =>
          deferRequest(request, "system_failure", "reasoning skipped after a System failure")
        );
        return failureResult(error, {
          decisions,
          deferredDecisions: skippedReasoning,
          failingSystemIndex: systemIndex,
          failingSystemName: stableSystemName(system, systemIndex),
        });
      } finally {
        systemContext.deactivate();
      }
    }

    if (reasoningRequests.length === 0) {
      return {
        ok: true,
        decisions,
        deferred_decisions: [],
        cost_logs: [
          createCostLog({
            model: "none",
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_hits: 0,
            estimated_cost_usd: 0,
          }),
        ],
      };
    }

    const { decisionExecutor, clock, reasoningPolicy } = getWorldRuntimeOptions(world);
    if (reasoningPolicy === "forbid") {
      return {
        ok: true,
        decisions,
        deferred_decisions: reasoningRequests.map((request) =>
          deferRequest(
            request,
            "inference_blocked",
            "reasoning is forbidden by the World runtime policy",
          )
        ),
        cost_logs: [{
          ...createCostLog({ model: "none" }),
          error: "blocked_inference",
        }],
      };
    }
    const deferredDecisions = [];
    const costLogs = [];

    for (const request of reasoningRequests) {
      if (!decisionExecutor) {
        deferredDecisions.push(
          deferRequest(request, "executor_unavailable", "no decision executor is configured"),
        );
        continue;
      }

      try {
        const rawResult = await invokeWithTimeout(decisionExecutor, request, input, clock);
        const costLog = validateExecutorCostLog(rawResult);
        costLogs.push(costLog);
        try {
          decisions.push(validateExecutorDecision(rawResult));
        } catch (error) {
          deferredDecisions.push(
            deferRequest(request, error?.code ?? "executor_unavailable", errorMessage(error)),
          );
        }
      } catch (error) {
        deferredDecisions.push(
          deferRequest(request, error?.code ?? "executor_unavailable", errorMessage(error)),
        );
      }
    }

    return {
      ok: true,
      decisions,
      deferred_decisions: deferredDecisions,
      cost_logs: costLogs,
    };
  } finally {
    endWorldTick(world);
  }
}
