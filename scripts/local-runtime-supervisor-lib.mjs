// Responsibility: local runtime supervisor infrastructure - constants, options, locations, state files, dependency wiring, service launch and teardown, locks, and process/port/http evidence.
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { resolveAgenticCanvasOsDocsRoot } from "../mcp/agentic-canvas-os-docs-runtime.js";
import { setTimeout as delay } from "node:timers/promises";

import { sha256, verifyProtectedChecks } from "./local-runtime-candidate-lib.mjs";

export const LOCAL_RUNTIME_SCHEMA = "agentic-local-runtime-readiness/v1";
export const SESSION_RUNTIME_SCHEMA = "agentic-session-runtime/v1";
export const LOCAL_RUNTIME_HOST = "127.0.0.1";
export const APEX_PORT = 5173;
export const STORAGE_PORT = 8787;
export const DEFAULT_TIMEOUT_MS = 120_000;

export function validateOwnedService({ service, processEvidence, token, tokenDigest, candidate }) {
  if (!service || !Number.isInteger(service.supervisorPid) || service.supervisorPid <= 0) {
    throw new Error("Runtime service state has no valid supervisor PID.");
  }
  if (!processEvidence || !Number.isInteger(processEvidence.pid) || processEvidence.pid <= 0) {
    throw new Error(`${service.name} listener process is unavailable.`);
  }
  if (processEvidence.processGroupId !== service.supervisorPid) {
    throw new Error(`${service.name} listener no longer belongs to its recorded process group.`);
  }
  if (path.resolve(processEvidence.gitCommonDir || "") !== path.resolve(candidate.agenticGraph.gitCommonDir)) {
    throw new Error(`${service.name} listener belongs to an unrelated repository.`);
  }
  if (!String(processEvidence.command || "").includes(service.commandMarker)) {
    throw new Error(`${service.name} listener command does not match its runtime owner.`);
  }
  if (!String(processEvidence.listenerEnvironment || "").includes(`AGENTIC_LOCAL_RUNTIME_TOKEN=${token}`)) {
    throw new Error(`${service.name} process ownership token is missing or changed.`);
  }
  if (sha256(token) !== tokenDigest) throw new Error("Runtime ownership token digest does not match local state.");
  return true;
}


export async function launchService(spec, candidate, environment, timeoutMs, deps) {
  const logFd = deps.openLog(spec.logPath);
  let child;
  try {
    child = deps.spawnService({ cwd: candidate.agenticGraph.root, env: environment, command: spec.command[0], args: spec.command[1], logFd });
  } finally {
    deps.closeLog(logFd);
  }
  if (!Number.isInteger(child.pid) || child.pid <= 0) throw new Error(`${spec.name} did not return a valid supervisor PID.`);
  child.unref?.();
  try {
    const httpStatus = await deps.waitForHttp(spec.healthUrl, timeoutMs);
    const listenerPid = deps.readListenerPid(spec.port);
    if (!listenerPid) throw new Error(`${spec.name} responded without an observable listener PID.`);
    const processEvidence = deps.inspectListenerProcess(listenerPid);
    return {
      name: spec.name,
      port: spec.port,
      supervisorPid: child.pid,
      listenerPid,
      commandMarker: spec.commandMarker,
      logPath: spec.logPath,
      healthUrl: spec.healthUrl,
      httpStatus,
      processStartedAt: processEvidence.processStartedAt,
      listenerCwd: processEvidence.cwd,
    };
  } catch (error) {
    deps.stopProcessGroup(child.pid);
    throw error;
  }
}


export async function stopRecordedServices(state, candidate, locations, deps) {
  if (state?.schema !== LOCAL_RUNTIME_SCHEMA) throw new Error("Local runtime state has an unsupported schema.");
  if (!state.services?.storage || !state.services?.apex) throw new Error("Local runtime state is missing a required service.");
  const token = deps.readPrivateFile(locations.tokenPath).trim();
  const owned = [];
  for (const service of Object.values(state.services)) {
    const listenerPid = deps.readListenerPid(service.port);
    if (!listenerPid) continue;
    const processEvidence = deps.inspectListenerProcess(listenerPid);
    validateOwnedService({ service, processEvidence, token, tokenDigest: state.ownershipTokenDigest, candidate });
    owned.push(service);
  }
  for (const service of owned) deps.stopProcessGroup(service.supervisorPid);
  await Promise.all(owned.map(service => deps.waitForPortRelease(service.port, 10_000)));
}


export function assertPortsUnclaimed(deps) {
  for (const port of [APEX_PORT, STORAGE_PORT]) {
    assertPortUnclaimed(port, deps);
  }
}

function assertPortUnclaimed(port, deps) {
  const pids = deps.readListenerPids(port);
  if (pids.length) throw new Error(`Port ${port} is owned by unmanaged PID ${pids.join(", ")}; refusing takeover.`);
}


export function runtimeLocations(workspaceRoot) {
  // Retained on-disk identity lets the migrated owner verify and stop its prior token-owned services.
  const runtimeRoot = path.join(workspaceRoot, ".runtime-state", "agentic-canvas-os", "agentic-graph-local-runtime");
  return {
    runtimeRoot,
    statePath: path.join(runtimeRoot, "readiness.json"),
    reviewCandidatePath: path.join(runtimeRoot, "review-candidate.json"),
    tokenPath: path.join(runtimeRoot, "owner.token"),
    lockPath: path.join(runtimeRoot, "supervisor.lock"),
    apexLogPath: path.join(runtimeRoot, "apex.log"),
    storageLogPath: path.join(runtimeRoot, "storage.log"),
    sessionStatePath: path.join(runtimeRoot, "session-runtime.json"),
    sessionTokenPath: path.join(runtimeRoot, "session-owner.token"),
    sessionApexLogPath: path.join(runtimeRoot, "session-apex.log"),
  };
}


export function normalizeOptions(options, { requireSession = false } = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) throw new Error("--timeout-ms must be from 1000 to 300000.");
  const sessionId = String(options.sessionId || "").trim();
  if (requireSession && !sessionId) throw new Error("A stable --session or AGENTIC_SESSION_ID is required.");
  if (sessionId && (!/^[A-Za-z0-9._:-]+$/.test(sessionId) || sessionId.length > 200)) {
    throw new Error("Session id must use 1-200 safe identifier characters.");
  }
  return {
    repository: String(options.repository || "").trim() ? path.resolve(options.repository) : "",
    agenticCanvasOsRoot: options.agenticCanvasOsRoot ? path.resolve(options.agenticCanvasOsRoot)
      : path.resolve(resolveAgenticCanvasOsDocsRoot({ rootDir: options.repository || process.cwd() }), "../.."),
    timeoutMs,
    sessionId,
  };
}


export function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeJsonAtomic(filePath, value, deps) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  deps.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  deps.renameFile(temporaryPath, filePath);
}


export function createDependencies(overrides) {
  return {
    gitText: (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }),
    verifyProtectedChecks,
    mkdir: directory => mkdirSync(directory, { recursive: true }),
    openLog: logPath => openSync(logPath, "a"),
    closeLog: closeSync,
    writeFile: (filePath, text) => writeFileSync(filePath, text, "utf8"),
    renameFile: renameSync,
    writePrivateFile: (filePath, text) => { writeFileSync(filePath, text, { encoding: "utf8", mode: 0o600 }); chmodSync(filePath, 0o600); },
    readPrivateFile: filePath => readFileSync(filePath, "utf8"),
    removeFile: filePath => { if (existsSync(filePath)) rmSync(filePath); },
    runCommand: ({ cwd, env, command, args }) => execFileSync(command, args, { cwd, env, encoding: "utf8" }),
    spawnService: ({ cwd, env, command, args, logFd }) => spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", logFd, logFd] }),
    readListenerPid,
    readListenerPids,
    inspectListenerProcess,
    readHttpStatus,
    waitForHttp,
    waitForPortRelease,
    stopProcessGroup: pid => { try { process.kill(-pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; } },
    acquireLock,
    now: () => new Date(),
    ...overrides,
  };
}

function readListenerPid(port) {
  const pids = readListenerPids(port);
  if (pids.length > 1) throw new Error(`Port ${port} has multiple listener PIDs: ${pids.join(", ")}.`);
  return pids[0] || null;
}

function readListenerPids(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim();
    return [...new Set(output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))];
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
}

function inspectListenerProcess(pid) {
  const cwdOutput = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  const cwd = cwdOutput.split("\n").find(line => line.startsWith("n"))?.slice(1).trim() || "";
  if (!cwd) throw new Error(`Unable to resolve listener PID ${pid} working directory.`);
  return {
    pid,
    cwd,
    processGroupId: Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim()),
    processStartedAt: execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim(),
    command: execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim(),
    listenerEnvironment: execFileSync("ps", ["eww", "-p", String(pid), "-o", "command="], { encoding: "utf8" }),
    gitCommonDir: path.resolve(cwd, execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()),
  };
}


export function acquireLock(lockPath) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const owner = readJson(lockPath);
    try {
      process.kill(Number(owner?.pid), 0);
      throw new Error(`Local runtime supervisor lock is held by active PID ${owner?.pid}.`);
    } catch (ownerError) {
      if (ownerError?.code !== "ESRCH") throw ownerError;
      unlinkSync(lockPath);
      descriptor = openSync(lockPath, "wx");
    }
  }
  writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
  closeSync(descriptor);
  return () => { if (existsSync(lockPath)) unlinkSync(lockPath); };
}


async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await readHttpStatus(url);
    if (status === 200) return status;
    await delay(250);
  }
  throw new Error(`Local runtime did not become ready within ${timeoutMs} ms at ${url}.`);
}

async function readHttpStatus(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
    return response.status;
  } catch {
    return null;
  }
}

async function waitForPortRelease(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!readListenerPid(port)) return;
    await delay(100);
  }
  throw new Error(`Local runtime port ${port} did not stop within ${timeoutMs} ms.`);
}
