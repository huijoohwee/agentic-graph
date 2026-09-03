import { constants as fileSystemConstants, promises as nodeFileSystem } from "node:fs";
import path from "node:path";

import { createCostLog, validateCostLog } from "../contracts/cost-log.schema.js";
import { persistDecisions as persistKgcDecisions } from "../ecs/decisionPersistence.js";
import { hydrateKgcDocument as hydrateDocument } from "../ecs/hydration.js";
import { worldTick as advanceWorld } from "../ecs/index.js";
import { decisionRecordsEqual, normalizeDecisionRecord } from "../ecs/kgcNodeContract.js";
import { disposeWorld as disposeEcsWorld } from "../ecs/world.js";
import {
  ECS_EXECUTION_BOUNDARY,
  ECS_SCOPE,
  ECS_SESSION_BINDING,
  ECS_SOURCE_BINDING,
  isEcsToolName,
} from "./ecs-tool-contract.js";
import { createEcsSessionStore } from "./ecs-session-store.js";
import {
  publicDeferredReason,
  publicKgcErrorCode,
  publicSessionErrorCode,
  publicTickErrorCode,
} from "./ecs-public-errors.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs";

const ACTION_SPECS = Object.freeze({
  [AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart]: Object.freeze({
    allowedKeys: Object.freeze(["kgcPath", "scope", "binding"]),
    requiredKey: "kgcPath",
    binding: ECS_SOURCE_BINDING,
  }),
  [AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick]: Object.freeze({
    allowedKeys: Object.freeze(["sessionId", "input", "scope", "binding"]),
    requiredKey: "sessionId",
    binding: ECS_SESSION_BINDING,
  }),
  [AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist]: Object.freeze({
    allowedKeys: Object.freeze(["sessionId", "scope", "binding"]),
    requiredKey: "sessionId",
    binding: ECS_SESSION_BINDING,
  }),
});

function success(details = {}) {
  return { ok: true, execution_boundary: ECS_EXECUTION_BOUNDARY, ...details };
}

function failure(errorCode, message, details = {}) {
  return { ok: false, errorCode, message, execution_boundary: ECS_EXECUTION_BOUNDARY, ...details };
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

function sanitizedKgcFailure(errorCode, phase) {
  return failure(
    publicKgcErrorCode(
      errorCode,
      phase === "hydration" ? "ECS_HYDRATION_FAILED" : "ECS_DECISION_WRITE_FAILED",
    ),
    phase === "hydration"
      ? "KGC hydration failed validation"
      : "KGC Decision persistence failed validation",
  );
}

function sanitizedSessionFailure(errorCode) {
  const code = publicSessionErrorCode(errorCode, "ECS_SESSION_NOT_FOUND");
  return failure(
    code,
    code === "ECS_SESSION_DISPOSE_FAILED"
      ? "ECS session disposal failed"
      : "ECS session is unavailable",
  );
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isInsideRoot(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath));
}

function fileIdentity(fileStats) {
  return {
    device: Number(fileStats.dev),
    inode: Number(fileStats.ino),
  };
}

function fileIdentitiesEqual(left, right) {
  return Boolean(
    left
    && right
    && left.device === right.device
    && left.inode === right.inode,
  );
}

function isFileIdentity(value) {
  return isPlainObject(value)
    && Number.isSafeInteger(value.device)
    && value.device >= 0
    && Number.isSafeInteger(value.inode)
    && value.inode >= 0;
}

async function readBoundKgcMarkdown(resolvedPath, fileSystem) {
  if (typeof fileSystem.open !== "function") {
    throw new Error("safe KGC reads require file-handle support");
  }
  const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
  const handle = await fileSystem.open(
    resolvedPath.absolutePath,
    fileSystemConstants.O_RDONLY | noFollow,
  );
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || !fileIdentitiesEqual(fileIdentity(stats), resolvedPath.fileIdentity)) {
      throw new Error("the KGC source changed during session start");
    }
    return await handle.readFile({ encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

export async function resolveSafeKgcMarkdownPath(kgcPath, {
  rootDir,
  fileSystem = nodeFileSystem,
} = {}) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") {
    return failure("ECS_ROOT_REQUIRED", "A configured repository root is required");
  }
  if (typeof kgcPath !== "string" || kgcPath.trim() === "") {
    return failure("ECS_INVALID_KGC_PATH", "kgcPath must be a non-empty repository-relative path");
  }
  if (path.isAbsolute(kgcPath)) {
    return failure("ECS_ABSOLUTE_KGC_PATH_FORBIDDEN", "kgcPath must be repository-relative");
  }
  if (path.extname(kgcPath) !== ".md") {
    return failure("ECS_KGC_MARKDOWN_REQUIRED", "kgcPath must identify a .md file");
  }

  const configuredRoot = path.resolve(rootDir);
  const lexicalCandidate = path.resolve(configuredRoot, kgcPath);
  if (!isInsideRoot(configuredRoot, lexicalCandidate)) {
    return failure("ECS_KGC_PATH_OUTSIDE_ROOT", "kgcPath must remain inside the configured repository root");
  }

  try {
    const canonicalRoot = await fileSystem.realpath(configuredRoot);
    const canonicalPath = await fileSystem.realpath(lexicalCandidate);
    if (!isInsideRoot(canonicalRoot, canonicalPath)) {
      return failure("ECS_KGC_SYMLINK_ESCAPE", "kgcPath resolves outside the configured repository root");
    }
    if (path.extname(canonicalPath) !== ".md") {
      return failure(
        "ECS_KGC_MARKDOWN_REQUIRED",
        "kgcPath must resolve to a .md file",
      );
    }
    const fileStats = await fileSystem.stat(canonicalPath);
    if (!fileStats.isFile()) {
      return failure("ECS_KGC_FILE_REQUIRED", "kgcPath must identify an existing regular file");
    }
    const reboundPath = await fileSystem.realpath(canonicalPath);
    if (reboundPath !== canonicalPath || !isInsideRoot(canonicalRoot, reboundPath)) {
      return failure(
        "ECS_KGC_SYMLINK_ESCAPE",
        "kgcPath changed or escaped during source validation",
      );
    }
    return success({
      absolutePath: canonicalPath,
      fileIdentity: fileIdentity(fileStats),
      relativePath: path.relative(canonicalRoot, canonicalPath).split(path.sep).join("/"),
    });
  } catch {
    return failure(
      "ECS_KGC_PATH_UNREADABLE",
      "kgcPath could not be resolved to an existing Markdown file",
    );
  }
}

function validateInvocation(toolName, args) {
  const spec = ACTION_SPECS[toolName];
  if (!spec || !isEcsToolName(toolName)) {
    return failure("ECS_UNKNOWN_TOOL", `Unknown ECS tool: ${String(toolName)}`);
  }
  if (!isPlainObject(args)) {
    return failure("ECS_INVALID_ARGUMENTS", "ECS tool arguments must be a plain object");
  }
  const unknownKeys = Object.keys(args).filter((key) => !spec.allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    return failure("ECS_INVALID_ARGUMENTS", `Unsupported ECS argument: ${unknownKeys.sort().join(", ")}`);
  }
  if (Object.hasOwn(args, "scope") && args.scope !== ECS_SCOPE) {
    return failure("ECS_UNKNOWN_SCOPE", `scope must be ${ECS_SCOPE}`);
  }
  if (Object.hasOwn(args, "binding") && args.binding !== spec.binding) {
    return failure("ECS_UNKNOWN_BINDING", `binding must be ${spec.binding}`);
  }
  if (typeof args[spec.requiredKey] !== "string" || args[spec.requiredKey].trim() === "") {
    return failure("ECS_INVALID_ARGUMENTS", `${spec.requiredKey} must be a non-empty string`);
  }
  if (toolName !== AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart && args[spec.requiredKey].trim() !== args[spec.requiredKey]) {
    return failure("ECS_INVALID_ARGUMENTS", "sessionId must not contain surrounding whitespace");
  }
  if (Object.hasOwn(args, "input") && !isPlainObject(args.input)) {
    return failure("ECS_INVALID_ARGUMENTS", "input must be a plain object when provided");
  }
  return success();
}

function cloneDecision(decision) {
  return structuredClone(decision);
}

function sanitizeDeferredDecisions(deferredDecisions) {
  return deferredDecisions.map((deferred) => {
    if (!isPlainObject(deferred)) {
      throw new TypeError("deferred Decision must be an object");
    }
    const reason = publicDeferredReason(deferred.deferred_reason);
    return {
      ...(typeof deferred.decisionId === "string" ? { decisionId: deferred.decisionId } : {}),
      ...(typeof deferred.requestId === "string" ? { requestId: deferred.requestId } : {}),
      status: "deferred",
      deferred_reason: reason,
    };
  });
}

function normalizeCostLogs(costLogs) {
  return costLogs.map((costLog) => {
    const validation = validateCostLog(costLog);
    if (!validation.valid) throw new TypeError("invalid Cost_Log");
    return createCostLog(costLog);
  });
}

function normalizeTickResult(tickResult) {
  if (!isPlainObject(tickResult) || typeof tickResult.ok !== "boolean") {
    return failure("ECS_INVALID_TICK_RESULT", "World_Tick returned no structured result with an ok flag");
  }
  for (const fieldName of ["decisions", "deferred_decisions", "cost_logs"]) {
    if (!Array.isArray(tickResult[fieldName])) {
      return failure("ECS_INVALID_TICK_RESULT", `World_Tick ${fieldName} must be an array`);
    }
  }
  try {
    return success({
      tickResult: {
        ok: tickResult.ok,
        ...(typeof tickResult.errorCode === "string" ? { errorCode: tickResult.errorCode } : {}),
        ...(Number.isSafeInteger(tickResult.failingSystemIndex)
          ? { failingSystemIndex: tickResult.failingSystemIndex }
          : {}),
        decisions: structuredClone(tickResult.decisions),
        deferred_decisions: sanitizeDeferredDecisions(tickResult.deferred_decisions),
        cost_logs: normalizeCostLogs(tickResult.cost_logs),
      },
    });
  } catch {
    return failure("ECS_INVALID_TICK_RESULT", "World_Tick returned invalid structured data");
  }
}

function retainCompletedDecisions(session, decisions) {
  if (!Array.isArray(decisions)) {
    return failure("ECS_INVALID_TICK_RESULT", "World_Tick decisions must be an array");
  }
  try {
    const normalizedDecisions = decisions.map((decision, index) =>
      normalizeDecisionRecord(decision, `decisions[${index}]`)
    );
    const pendingById = new Map(
      session.pendingDecisions.map((decision) => [decision.decisionId, decision]),
    );
    const additions = [];
    for (const decision of normalizedDecisions) {
      const existing = pendingById.get(decision.decisionId);
      if (existing) {
        if (!decisionRecordsEqual(existing, decision)) {
          return failure(
            "ECS_DECISION_ID_CONFLICT",
            `decisionId ${decision.decisionId} conflicts with a pending Decision`,
          );
        }
        continue;
      }
      pendingById.set(decision.decisionId, decision);
      additions.push(decision);
    }
    for (const decision of additions) {
      session.pendingDecisions.push(decision);
      session.pendingDecisionIds.add(decision.decisionId);
    }
    return success({ decisions: normalizedDecisions });
  } catch (error) {
    return failure(
      publicTickErrorCode(error?.code, "ECS_INVALID_TICK_RESULT"),
      "World_Tick returned an invalid Decision",
    );
  }
}

export function createEcsRuntime({
  rootDir,
  fileSystem = nodeFileSystem,
  hydrateKgcDocument = hydrateDocument,
  worldTick = advanceWorld,
  persistDecisions = persistKgcDecisions,
  disposeWorld = disposeEcsWorld,
  sessionStore,
  sessionTtlMs,
  maxSessions,
  hydrationOptions,
} = {}) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") {
    throw new TypeError("createEcsRuntime requires rootDir");
  }
  const store = sessionStore ?? createEcsSessionStore({
    ttlMs: sessionTtlMs,
    maxSessions,
    onDispose: (session) => disposeWorld(session.world),
    isActive: (session) => session.busy,
  });

  async function startSession(args) {
    const resolvedPath = await resolveSafeKgcMarkdownPath(args.kgcPath, { rootDir, fileSystem });
    if (!resolvedPath.ok) return resolvedPath;

    let markdownText;
    try {
      markdownText = await readBoundKgcMarkdown(resolvedPath, fileSystem);
    } catch {
      return failure("ECS_KGC_READ_FAILED", "Could not read the validated KGC Markdown file");
    }

    let hydrated;
    try {
      hydrated = await hydrateKgcDocument(markdownText, hydrationOptions);
    } catch (error) {
      return sanitizedKgcFailure(error?.code, "hydration");
    }
    if (!hydrated?.ok || !hydrated.world) {
      return sanitizedKgcFailure(hydrated?.errorCode, "hydration");
    }

    const session = {
      busy: false,
      decisionIndex: hydrated.decisionIndex,
      fileIdentity: resolvedPath.fileIdentity,
      kgcPath: resolvedPath.absolutePath,
      kgcRelativePath: resolvedPath.relativePath,
      pendingDecisionIds: new Set(),
      pendingDecisions: [],
      tickCount: 0,
      world: hydrated.world,
    };
    const created = store.create(session);
    if (!created.ok) {
      let disposalError = null;
      try {
        if (disposeWorld(hydrated.world) === false) disposalError = "hydrated World disposal was rejected";
      } catch (error) {
        disposalError = errorMessage(error);
      }
      if (disposalError) return sanitizedSessionFailure("ECS_SESSION_DISPOSE_FAILED");
      return sanitizedSessionFailure(created.errorCode);
    }
    return success({
      sessionId: created.sessionId,
      kgcPath: resolvedPath.relativePath,
      hydratedDecisionCount: hydrated.decisionIndex instanceof Map ? hydrated.decisionIndex.size : 0,
      pendingDecisionCount: 0,
    });
  }

  async function tickSession(args) {
    const lookup = store.get(args.sessionId);
    if (!lookup.ok) return sanitizedSessionFailure(lookup.errorCode);
    const session = lookup.session;
    if (session.busy) return failure("ECS_SESSION_BUSY", `ECS session ${args.sessionId} is already executing`);
    session.busy = true;
    try {
      const rawTickResult = await worldTick(session.world, structuredClone(args.input ?? {}));
      const normalized = normalizeTickResult(rawTickResult);
      if (!normalized.ok) return normalized;
      const tickResult = normalized.tickResult;
      session.tickCount += 1;
      const retained = retainCompletedDecisions(session, tickResult.decisions);
      if (!retained.ok) {
        return failure(
          publicTickErrorCode(retained.errorCode, "ECS_INVALID_TICK_RESULT"),
          "World_Tick returned an invalid Decision",
          {
            sessionId: args.sessionId,
            tickCount: session.tickCount,
            tickCommitted: true,
            deferred_decisions: tickResult.deferred_decisions,
            cost_logs: tickResult.cost_logs,
            pendingDecisionCount: session.pendingDecisions.length,
          },
        );
      }
      const resultDetails = {
        sessionId: args.sessionId,
        tickCount: session.tickCount,
        decisions: structuredClone(retained.decisions),
        deferred_decisions: tickResult.deferred_decisions,
        cost_logs: tickResult.cost_logs,
        pendingDecisionCount: session.pendingDecisions.length,
      };
      if (tickResult.ok === false) {
        return failure(
          publicTickErrorCode(tickResult.errorCode, "ECS_TICK_FAILED"),
          "World_Tick failed",
          {
            ...resultDetails,
            ...(Number.isSafeInteger(tickResult.failingSystemIndex) && tickResult.failingSystemIndex >= 0
              ? {
                  failingSystemIndex: tickResult.failingSystemIndex,
                  failingSystemName: `system-${tickResult.failingSystemIndex}`,
                }
              : {}),
          },
        );
      }
      return success(resultDetails);
    } catch {
      return failure("ECS_TICK_FAILED", "World_Tick failed", {
        sessionId: args.sessionId,
        pendingDecisionCount: session.pendingDecisions.length,
      });
    } finally {
      session.busy = false;
    }
  }

  async function persistSessionDecisions(args) {
    const lookup = store.get(args.sessionId);
    if (!lookup.ok) return sanitizedSessionFailure(lookup.errorCode);
    const session = lookup.session;
    if (session.busy) return failure("ECS_SESSION_BUSY", `ECS session ${args.sessionId} is already executing`);
    session.busy = true;
    try {
      if (session.pendingDecisions.length === 0) {
        const closed = store.close(args.sessionId, "empty");
        if (!closed.ok) {
          return failure(
            publicSessionErrorCode(closed.errorCode, "ECS_SESSION_DISPOSE_FAILED"),
            "ECS session disposal failed",
            {
            sessionId: args.sessionId,
            retainedDecisionCount: 0,
            sessionRetained: true,
            },
          );
        }
        return success({
          sessionId: args.sessionId,
          persistedCount: 0,
          idempotentCount: 0,
          sessionClosed: true,
        });
      }

      const pendingDecisions = session.pendingDecisions.map(cloneDecision);
      let persistenceResult;
      try {
        persistenceResult = await persistDecisions(session.kgcPath, pendingDecisions, {
          expectedCanonicalPath: session.kgcPath,
          expectedFileIdentity: session.fileIdentity,
          fileSystem,
          rootDir,
        });
      } catch {
        return failure("ECS_DECISION_WRITE_FAILED", "Decision persistence failed", {
          sessionId: args.sessionId,
          retainedDecisionCount: session.pendingDecisions.length,
          sessionRetained: true,
        });
      }
      if (!persistenceResult?.ok) {
        return {
          ...sanitizedKgcFailure(persistenceResult?.errorCode, "persistence"),
          ...{
            sessionId: args.sessionId,
            retainedDecisionCount: session.pendingDecisions.length,
            sessionRetained: true,
          },
        };
      }

      const persistedCount = Number(persistenceResult.persistedCount ?? 0);
      const idempotentCount = Number(persistenceResult.idempotentCount ?? 0);
      if (
        !Number.isSafeInteger(persistedCount)
        || persistedCount < 0
        || !Number.isSafeInteger(idempotentCount)
        || idempotentCount < 0
        || persistedCount + idempotentCount !== pendingDecisions.length
      ) {
        return failure("ECS_DECISION_PERSIST_INCOMPLETE", "Not every pending Decision was persisted", {
          sessionId: args.sessionId,
          retainedDecisionCount: session.pendingDecisions.length,
          sessionRetained: true,
        });
      }
      if (Object.hasOwn(persistenceResult, "fileIdentity")) {
        if (!isFileIdentity(persistenceResult.fileIdentity)) {
          return failure("ECS_DECISION_PERSIST_INCOMPLETE", "Decision persistence returned invalid file identity", {
            sessionId: args.sessionId,
            retainedDecisionCount: session.pendingDecisions.length,
            sessionRetained: true,
          });
        }
        session.fileIdentity = structuredClone(persistenceResult.fileIdentity);
      }

      const closed = store.close(args.sessionId, "persisted");
      if (!closed.ok) {
        return failure(
          publicSessionErrorCode(closed.errorCode, "ECS_SESSION_DISPOSE_FAILED"),
          "ECS session disposal failed",
          {
          sessionId: args.sessionId,
          retainedDecisionCount: session.pendingDecisions.length,
          sessionRetained: true,
          },
        );
      }
      session.pendingDecisions.length = 0;
      session.pendingDecisionIds.clear();
      return success({
        sessionId: args.sessionId,
        persistedCount,
        idempotentCount,
        sessionClosed: true,
      });
    } finally {
      session.busy = false;
    }
  }

  async function run(toolName, args = {}) {
    try {
      const validation = validateInvocation(toolName, args);
      if (!validation.ok) return validation;
      if (toolName === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart) return await startSession(args);
      if (toolName === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick) return await tickSession(args);
      return await persistSessionDecisions(args);
    } catch {
      return failure("ECS_RUNTIME_FAILED", "ECS runtime failed");
    }
  }

  return Object.freeze({ run });
}
