// Responsibility: session-scoped Vite runtime lifecycle - launch, inspection, ownership validation, stop, and turn-end handoff of one session Apex service.
import { randomUUID } from "node:crypto";
import path from "node:path";

import { resolveCanonicalCandidate, resolveOwnershipCandidate, SHA_PATTERN, sha256 } from "./local-runtime-candidate-lib.mjs";
import {
  APEX_PORT,
  assertPortsUnclaimed,
  createDependencies,
  launchService,
  LOCAL_RUNTIME_HOST,
  normalizeOptions,
  readJson,
  runtimeLocations,
  SESSION_RUNTIME_SCHEMA,
  stopRecordedServices,
  writeJsonAtomic,
} from "./local-runtime-supervisor-lib.mjs";

export async function startSessionRuntime(options = {}, dependencies = {}) {
  const deps = createDependencies(dependencies);
  const normalized = normalizeOptions(options, { requireSession: true });
  const candidate = resolveCanonicalCandidate(normalized, deps, { verifyProtected: false });
  const locations = runtimeLocations(candidate.workspaceRoot);
  const releaseLock = deps.acquireLock(locations.lockPath);
  try {
    const existingSession = readJson(locations.sessionStatePath);
    if (existingSession) {
      return inspectSessionRuntimeState(existingSession, candidate, normalized, locations, deps);
    }
    const canonicalState = readJson(locations.statePath);
    if (canonicalState) {
      await stopRecordedServices(canonicalState, candidate, locations, deps);
      deps.removeFile(locations.statePath);
      deps.removeFile(locations.tokenPath);
    }
    assertPortsUnclaimed(deps);
    return await launchSessionRuntime(candidate, normalized, locations, deps);
  } finally {
    releaseLock();
  }
}

export async function readSessionRuntimeStatus(options = {}, dependencies = {}) {
  const deps = createDependencies(dependencies);
  const normalized = normalizeOptions(options, { requireSession: true });
  const candidate = resolveCanonicalCandidate(normalized, deps, { verifyProtected: false });
  const locations = runtimeLocations(candidate.workspaceRoot);
  const state = readJson(locations.sessionStatePath);
  return state
    ? inspectSessionRuntimeState(state, candidate, normalized, locations, deps)
    : stoppedSessionProjection(candidate, normalized.sessionId);
}

export async function stopSessionRuntime(options = {}, dependencies = {}) {
  const deps = createDependencies(dependencies);
  const normalized = normalizeOptions(options, { requireSession: true });
  const candidate = resolveOwnershipCandidate(normalized, deps);
  const locations = runtimeLocations(candidate.workspaceRoot);
  const releaseLock = deps.acquireLock(locations.lockPath);
  try {
    const state = readJson(locations.sessionStatePath);
    if (!state) return stoppedSessionProjection(candidate, normalized.sessionId);
    const stopped = await stopSessionRuntimeState(state, candidate, normalized, locations, deps);
    deps.removeFile(locations.sessionStatePath);
    deps.removeFile(locations.sessionTokenPath);
    return { ...stopped, status: "session-stopped" };
  } finally {
    releaseLock();
  }
}


export function validateOwnedSessionService({ state, processEvidence, token, candidate, sessionId }) {
  const service = state?.service;
  validateSessionStateIdentity({ state, token, sessionId });
  if (!service || !Number.isInteger(service.supervisorPid) || service.supervisorPid <= 0) {
    throw new Error("Session runtime state has no valid supervisor PID.");
  }
  if (!processEvidence || processEvidence.pid !== service.listenerPid) {
    throw new Error("Session Vite listener PID no longer matches recorded ownership.");
  }
  if (processEvidence.processGroupId !== service.supervisorPid) {
    throw new Error("Session Vite listener no longer belongs to its recorded process group.");
  }
  if (processEvidence.processStartedAt !== service.processStartedAt) {
    throw new Error("Session Vite process start identity changed.");
  }
  if (!service.listenerCwd || path.resolve(processEvidence.cwd || "") !== path.resolve(service.listenerCwd)) {
    throw new Error("Session Vite working directory changed.");
  }
  if (path.resolve(processEvidence.gitCommonDir || "") !== path.resolve(candidate.agenticGraph.gitCommonDir)) {
    throw new Error("Session Vite listener belongs to an unrelated repository.");
  }
  if (!String(processEvidence.command || "").includes(service.commandMarker)) {
    throw new Error("Session Vite listener command does not match its runtime owner.");
  }
  if (!String(processEvidence.listenerEnvironment || "").includes(`AGENTIC_SESSION_RUNTIME_TOKEN=${token}`)) {
    throw new Error("Session Vite ownership token is missing or changed.");
  }
  if (!String(processEvidence.listenerEnvironment || "").includes(`AGENTIC_SESSION_ID=${sessionId}`)) {
    throw new Error("Session Vite process session identity is missing or changed.");
  }
  if (!String(processEvidence.listenerEnvironment || "").includes(`AGENTIC_OS_SOURCE_REVISION=${state.source?.revision}`)) {
    throw new Error("Session Vite source revision evidence is missing or changed.");
  }
  if (!String(processEvidence.listenerEnvironment || "").includes(
    `AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION=${state.agenticCanvasOs?.revision}`,
  )) {
    throw new Error("Session Vite Agentic Canvas OS revision evidence is missing or changed.");
  }
  return true;
}

function validateSessionStateIdentity({ state, token, sessionId }) {
  if (state?.schema !== SESSION_RUNTIME_SCHEMA || state.status !== "session-dev") {
    throw new Error("Session runtime state has an unsupported schema or status.");
  }
  if (!sessionId || state.sessionId !== sessionId) {
    throw new Error("Session runtime belongs to another session.");
  }
  if (!SHA_PATTERN.test(String(state.source?.revision || "")) ||
      !SHA_PATTERN.test(String(state.agenticCanvasOs?.revision || ""))) {
    throw new Error("Session runtime state lacks exact source revisions.");
  }
  if (sha256(token) !== state.ownershipTokenDigest) {
    throw new Error("Session Vite ownership token digest does not match local state.");
  }
}


async function launchSessionRuntime(candidate, options, locations, deps) {
  deps.mkdir(locations.runtimeRoot);
  const token = randomUUID();
  deps.writePrivateFile(locations.sessionTokenPath, `${token}\n`);
  const environment = {
    ...process.env,
    AGENTIC_SESSION_ID: options.sessionId,
    AGENTIC_SESSION_RUNTIME_TOKEN: token,
    AGENTIC_OS_SOURCE_REVISION: candidate.agenticGraph.headSha,
    AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT: path.join(candidate.agenticCanvasOsRoot, "catalog", "dictionaries"),
    AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION: candidate.agenticCanvasOs.headSha,
    VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: path.join(candidate.agenticCanvasOsRoot, "catalog", "dictionaries"),
  };
  try {
    const service = await launchService({
      name: "session-apex",
      port: APEX_PORT,
      commandMarker: "node_modules/.bin/vite",
      command: ["npm", ["run", "dev:apex", "--", "--host", LOCAL_RUNTIME_HOST, "--port", String(APEX_PORT), "--strictPort"]],
      healthUrl: `http://${LOCAL_RUNTIME_HOST}:${APEX_PORT}/`,
      logPath: locations.sessionApexLogPath,
    }, candidate, environment, options.timeoutMs, deps);
    const state = {
      schema: SESSION_RUNTIME_SCHEMA,
      status: "session-dev",
      ready: false,
      sessionId: options.sessionId,
      source: { repository: "huijoohwee/agentic-graph", revision: candidate.agenticGraph.headSha },
      agenticCanvasOs: { repository: "huijoohwee/agentic-os", revision: candidate.agenticCanvasOs.headSha },
      host: LOCAL_RUNTIME_HOST,
      ports: { apex: APEX_PORT },
      service,
      ownershipTokenDigest: sha256(token),
      startedAt: deps.now().toISOString(),
      verifiedAt: deps.now().toISOString(),
    };
    writeJsonAtomic(locations.sessionStatePath, state, deps);
    return projectSessionState(state);
  } catch (error) {
    deps.removeFile(locations.sessionTokenPath);
    throw error;
  }
}

async function inspectSessionRuntimeState(state, candidate, options, locations, deps) {
  const token = deps.readPrivateFile(locations.sessionTokenPath).trim();
  const listenerPid = deps.readListenerPid(APEX_PORT);
  const processEvidence = listenerPid ? deps.inspectListenerProcess(listenerPid) : null;
  validateOwnedSessionService({ state, processEvidence, token, candidate, sessionId: options.sessionId });
  if (state.source.revision !== candidate.agenticGraph.headSha ||
      state.agenticCanvasOs.revision !== candidate.agenticCanvasOs.headSha) {
    throw new Error("Session Vite revisions no longer match canonical main.");
  }
  const httpStatus = await deps.readHttpStatus(`http://${LOCAL_RUNTIME_HOST}:${APEX_PORT}/`);
  if (httpStatus !== 200) throw new Error("Session Vite HTTP readiness is unavailable.");
  return projectSessionState({ ...state, verifiedAt: deps.now().toISOString() });
}

async function stopSessionRuntimeState(state, candidate, options, locations, deps) {
  const token = deps.readPrivateFile(locations.sessionTokenPath).trim();
  validateSessionStateIdentity({ state, token, sessionId: options.sessionId });
  const listenerPid = deps.readListenerPid(APEX_PORT);
  if (listenerPid) {
    const processEvidence = deps.inspectListenerProcess(listenerPid);
    validateOwnedSessionService({ state, processEvidence, token, candidate, sessionId: options.sessionId });
    deps.stopProcessGroup(state.service.supervisorPid);
    await deps.waitForPortRelease(APEX_PORT, 10_000);
  }
  return projectSessionState(state);
}

export async function stopOwnedSessionRuntimeLocked(candidate, options, locations, deps) {
  const state = readJson(locations.sessionStatePath);
  if (!state) return { status: "not-required", stoppedSessionRuntime: false };
  if (!options.sessionId) {
    throw new Error("A matching --session or AGENTIC_SESSION_ID is required to hand off the session Vite runtime.");
  }
  await stopSessionRuntimeState(state, candidate, options, locations, deps);
  deps.removeFile(locations.sessionStatePath);
  deps.removeFile(locations.sessionTokenPath);
  return {
    status: "session-runtime-stopped",
    stoppedSessionRuntime: true,
    sessionId: options.sessionId,
    sourceRevision: state.source.revision,
  };
}


function projectSessionState(state) {
  return {
    schema: state.schema,
    status: state.status,
    ready: false,
    sessionId: state.sessionId,
    source: state.source,
    agenticCanvasOs: state.agenticCanvasOs,
    host: state.host,
    ports: state.ports,
    service: state.service,
    ownershipTokenDigest: state.ownershipTokenDigest,
    startedAt: state.startedAt,
    verifiedAt: state.verifiedAt,
  };
}


function stoppedSessionProjection(candidate, sessionId) {
  return {
    schema: SESSION_RUNTIME_SCHEMA,
    status: "session-stopped",
    ready: false,
    sessionId,
    source: { repository: "huijoohwee/agentic-graph", revision: candidate.agenticGraph.headSha },
    agenticCanvasOs: { repository: "huijoohwee/agentic-os", revision: candidate.agenticCanvasOs.headSha },
    host: LOCAL_RUNTIME_HOST,
    ports: { apex: APEX_PORT },
  };
}
