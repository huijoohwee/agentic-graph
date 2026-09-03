import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { decodeBoundedUtf8 } from "./implementation-run-evidence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESS_CLI = path.join(__dirname, "implementation-run-managed-process-cli.js");
const MAX_EXECUTABLE_BYTES = 256 * 1024 * 1024;
const MAX_PROCESS_ARG_BYTES = 128 * 1024;
const MAX_PROCESS_ENV_BYTES = 256 * 1024;
const MAX_PROCESS_CONFIG_BYTES = 256 * 1024;
const STDIO_DRAIN_GRACE_MS = 2000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export function processGroupAlive(pgid) {
  if (process.platform === "win32" || !Number.isInteger(pgid) || pgid < 1) return false;
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

export async function processMarker(pid) {
  if (!pidAlive(pid)) return "";
  try {
    const { execFile } = await import("node:child_process");
    const result = await new Promise((resolve, reject) => execFile("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 5000, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    const started = String(result).trim();
    return started ? `${pid}:${started}` : "";
  } catch { return ""; }
}

async function digestFile(filePath, maximumBytes = MAX_EXECUTABLE_BYTES) {
  const handle = await fs.open(filePath, "r");
  const hash = crypto.createHash("sha256");
  let total = 0;
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maximumBytes) throw new Error(`Executable exceeds the ${maximumBytes}-byte proof limit: ${filePath}`);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally { await handle.close(); }
  return { size: total, sha256: hash.digest("hex") };
}

export async function fileProof(candidate) {
  const resolved = await fs.realpath(candidate);
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(`${candidate} is not a regular file.`);
  const content = await digestFile(resolved);
  return { path: resolved, device: String(stat.dev), inode: String(stat.ino), mode: stat.mode, size: content.size, sha256: content.sha256 };
}

export async function assertFileProof(proof) {
  if (!proof?.path || !Number.isInteger(proof.size) || !/^[a-f0-9]{64}$/.test(proof.sha256 || "")) throw new Error(`File proof is incomplete: ${proof?.role || "unknown"}`);
  const resolved = await fs.realpath(proof.path);
  const stat = await fs.stat(resolved);
  const content = await digestFile(resolved);
  if (resolved !== proof.path || !stat.isFile() || String(stat.dev) !== proof.device || String(stat.ino) !== proof.inode || stat.mode !== proof.mode || content.size !== proof.size || content.sha256 !== proof.sha256) {
    throw new Error(`File identity or content changed after preflight: ${proof.role || proof.path}`);
  }
}

export async function executableProof(candidate) {
  const proof = await fileProof(candidate);
  await fs.access(proof.path, fsConstants.X_OK);
  return proof;
}

export async function assertExecutableProof(proof) {
  await assertFileProof(proof);
  await fs.access(proof.path, fsConstants.X_OK);
}

async function terminateExact(pid, marker, signal) {
  if (!marker || await processMarker(pid) !== marker) return false;
  try { process.kill(process.platform === "win32" ? pid : -pid, signal); } catch {
    try { process.kill(pid, signal); } catch { /* already stopped */ }
  }
  return true;
}

async function waitDead(pid, marker, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const current = await processMarker(pid);
    if (!current || current !== marker) return true;
    await delay(25);
  }
  return !(await processMarker(pid));
}

export async function cleanupManagedProcesses(state) {
  const entries = Object.values(state.activeProcesses || {});
  let indeterminate = false;
  for (const entry of entries) {
    const managerMarker = await processMarker(entry.managerPid);
    const childMarker = await processMarker(entry.childPid);
    if (managerMarker && managerMarker !== entry.managerMarker) { indeterminate = true; continue; }
    if (childMarker && childMarker !== entry.childMarker) { indeterminate = true; continue; }
    if (entry.status === "starting" && !entry.childPid && !managerMarker) { indeterminate = true; continue; }
    if (!childMarker && entry.childPgid && processGroupAlive(entry.childPgid)) return { ok: false, code: "descendant_identity_unproven", message: `Managed ${entry.phase} leader exited while its process group remains; manual cleanup is required.` };
    if (childMarker) try { process.kill(-entry.childPgid, "SIGTERM"); } catch { await terminateExact(entry.childPid, entry.childMarker, "SIGTERM"); }
    if (managerMarker) await terminateExact(entry.managerPid, entry.managerMarker, "SIGTERM");
  }
  if (indeterminate) return { ok: false, code: "process_identity_unproven", message: "A managed child PID was reused or command launch stopped in an indeterminate window; automatic relaunch is unsafe." };
  await delay(entries.length ? 100 : 0);
  for (const entry of entries) {
    if (entry.childMarker && !await waitDead(entry.childPid, entry.childMarker, 1900)) await terminateExact(entry.childPid, entry.childMarker, "SIGKILL");
    if (entry.childPgid && processGroupAlive(entry.childPgid)) try { process.kill(-entry.childPgid, "SIGKILL"); } catch { /* checked below */ }
    if (entry.managerMarker && !await waitDead(entry.managerPid, entry.managerMarker, 1900)) await terminateExact(entry.managerPid, entry.managerMarker, "SIGKILL");
  }
  for (const entry of entries) {
    if ((entry.childPgid && processGroupAlive(entry.childPgid)) || (entry.childMarker && await processMarker(entry.childPid) === entry.childMarker) || (entry.managerMarker && await processMarker(entry.managerPid) === entry.managerMarker)) {
      return { ok: false, code: "process_cleanup_failed", message: `Managed ${entry.phase} process group could not be proven stopped.` };
    }
  }
  return { ok: true, count: entries.length };
}

export async function runManagedProcess({ store, rootDir, runId, token, phase, executable, argv, cwd, env, timeoutMs, maxOutputBytes, proof, spawnImpl = spawn, shouldContinue = async () => true }) {
  if (!Array.isArray(argv) || Buffer.byteLength(JSON.stringify(argv)) > MAX_PROCESS_ARG_BYTES || Buffer.byteLength(JSON.stringify(env || {})) > MAX_PROCESS_ENV_BYTES) throw Object.assign(new Error("Managed process argv or environment exceeds its explicit spawn-input bound."), { code: "PROCESS_INPUT_TOO_LARGE" });
  await assertExecutableProof(proof);
  const operationId = `op_${crypto.randomUUID().replaceAll("-", "")}`;
  const config = { schema: "agentic-graph-managed-process/v1", operationId, phase, executable, argv, cwd, timeoutMs, proof };
  const configText = `${JSON.stringify(config)}\n`;
  if (Buffer.byteLength(configText) > MAX_PROCESS_CONFIG_BYTES) throw Object.assign(new Error("Managed process configuration exceeds its explicit byte bound."), { code: "PROCESS_INPUT_TOO_LARGE" });
  const configDigest = crypto.createHash("sha256").update(configText).digest("hex");
  const configPath = await store.writeArtifact(runId, `process-${operationId}.json`, configText, { supervisorToken: token });
  const managerEnv = { ...env, AGENTIC_OS_PROCESS_TOKEN: token };
  const manager = spawnImpl(process.execPath, [PROCESS_CLI, "--root", rootDir, "--run", runId, "--operation", operationId, "--config", configPath, "--digest", configDigest], {
    cwd, env: managerEnv, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let terminationResult = null;
  const termination = new Promise((resolve) => {
    const finish = (result) => { terminationResult ||= result; resolve(terminationResult); };
    if (manager.exitCode !== null || manager.signalCode !== null) finish({ code: manager.exitCode, signal: manager.signalCode });
    else { manager.once("exit", (code, signal) => finish({ code, signal })); manager.once("error", (error) => finish({ code: null, signal: null, error })); }
  });
  const closed = new Promise((resolve) => {
    const finish = (result) => resolve(result);
    manager.once("close", (code, signal) => finish({ code, signal }));
    manager.once("error", (error) => finish({ code: null, signal: null, error }));
  });
  const output = [];
  let outputBytes = 0;
  let outputTruncated = false;
  const truncationMarker = "\n…[bounded output truncated]\n";
  const outputLimit = Math.max(0, Number(maxOutputBytes) || 0);
  const boundedMarker = decodeBoundedUtf8(Buffer.from(truncationMarker), outputLimit);
  const captureLimit = Math.max(0, outputLimit - Buffer.byteLength(boundedMarker));
  const capture = (stream, label) => stream?.on("data", (chunk) => {
    const remaining = Math.max(0, captureLimit - outputBytes);
    if (!remaining) { outputTruncated = true; return; }
    const bounded = Buffer.from(chunk).subarray(0, remaining);
    outputBytes += bounded.length;
    output.push({ stream: label, value: Buffer.from(bounded) });
    if (bounded.length < Buffer.byteLength(chunk)) outputTruncated = true;
  });
  capture(manager.stdout, "stdout"); capture(manager.stderr, "stderr");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Managed ${phase} process did not spawn.`)), 5000);
    manager.once("spawn", () => { clearTimeout(timer); resolve(); });
    manager.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  const deadline = Date.now() + 10000;
  let registered;
  while (Date.now() < deadline) {
    const current = await store.read(runId);
    if (current.supervisor?.token !== token) throw Object.assign(new Error("Supervisor ownership was fenced while registering a managed process."), { code: "SUPERVISOR_FENCED" });
    registered = current.activeProcesses?.[operationId];
    if (registered?.status === "registered") break;
    if (terminationResult || manager.exitCode !== null || manager.signalCode !== null) throw new Error(`Managed ${phase} process exited before registration.`);
    await delay(20);
  }
  if (!registered || registered.managerPid !== manager.pid || registered.managerMarker !== await processMarker(manager.pid)) throw new Error(`Managed ${phase} process failed its durable registration handshake.`);
  await store.update(runId, { eventType: "process.authorized", eventData: { operationId, phase } }, (current) => {
    if (current.supervisor?.token !== token || current.activeProcesses?.[operationId]?.managerMarker !== registered.managerMarker) throw Object.assign(new Error("Managed process authorization was fenced."), { code: "SUPERVISOR_FENCED" });
    current.activeProcesses[operationId].status = "authorized";
    current.activeProcesses[operationId].authorizedAt = new Date().toISOString();
    return current;
  });
  let interrupted = false;
  let timedOut = false;
  const poll = setInterval(async () => {
    try {
      if (!await shouldContinue()) {
        interrupted = true;
        await terminateExact(manager.pid, registered.managerMarker, "SIGTERM");
      }
    } catch {
      interrupted = true;
      await terminateExact(manager.pid, registered.managerMarker, "SIGTERM");
    }
  }, 100);
  const timer = setTimeout(async () => {
    interrupted = true;
    timedOut = true;
    await terminateExact(manager.pid, registered.managerMarker, "SIGTERM");
  }, timeoutMs);
  const terminated = await termination;
  const drain = await Promise.race([closed.then((exit) => ({ exit })), delay(STDIO_DRAIN_GRACE_MS).then(() => ({ timeout: true }))]);
  if (drain.timeout) { outputTruncated = true; manager.stdout?.destroy(); manager.stderr?.destroy(); }
  const exit = drain.exit || { ...terminated, error: Object.assign(new Error("Managed process stdio did not close within its bounded drain grace."), { code: "PROCESS_STDIO_DRAIN_TIMEOUT" }) };
  clearInterval(poll); clearTimeout(timer);
  const latest = await store.read(runId);
  const active = latest.activeProcesses?.[operationId];
  let groupCleanupFailed = false;
  if (active?.childPgid && processGroupAlive(active.childPgid)) {
    try { process.kill(-active.childPgid, "SIGTERM"); } catch { /* checked after grace */ }
    await delay(100);
    if (processGroupAlive(active.childPgid)) try { process.kill(-active.childPgid, "SIGKILL"); } catch { /* checked below */ }
    await delay(100);
    groupCleanupFailed = processGroupAlive(active.childPgid);
  }
  if (latest.supervisor?.token === token && active && !groupCleanupFailed) {
    await store.update(runId, { eventType: "process.completed", eventData: { operationId, phase, code: exit.code, signal: exit.signal } }, (current) => {
      if (current.supervisor?.token !== token) throw Object.assign(new Error("Managed process completion was fenced."), { code: "SUPERVISOR_FENCED" });
      delete current.activeProcesses?.[operationId];
      return current;
    });
  }
  const stdoutBuffer = Buffer.concat(output.filter((entry) => entry.stream === "stdout").map((entry) => entry.value));
  const stderrBuffer = Buffer.concat(output.filter((entry) => entry.stream === "stderr").map((entry) => entry.value));
  const stdout = decodeBoundedUtf8(stdoutBuffer, captureLimit);
  const stderrBudget = Math.max(0, captureLimit - Buffer.byteLength(stdout));
  const stderrBase = decodeBoundedUtf8(stderrBuffer, stderrBudget);
  if (Buffer.byteLength(stdout) + Buffer.byteLength(stderrBase) < stdoutBuffer.length + stderrBuffer.length) outputTruncated = true;
  const stderr = `${stderrBase}${outputTruncated ? boundedMarker : ""}`;
  outputBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr);
  const errorCode = groupCleanupFailed ? "PROCESS_GROUP_CLEANUP_FAILED" : exit.error?.code || null;
  return { ok: exit.code === 0 && !interrupted && !errorCode, code: exit.code, signal: exit.signal, stdout, stderr, outputBytes, outputTruncated, interrupted, timedOut, errorCode, message: groupCleanupFailed ? "Managed process group could not be proven stopped." : exit.error?.message || "" };
}
