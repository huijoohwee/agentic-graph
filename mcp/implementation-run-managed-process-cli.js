#!/usr/bin/env node
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import process from "node:process";

import { assertExecutableProof, processGroupAlive, processMarker } from "./implementation-run-managed-process.js";
import { ImplementationRunStore } from "./implementation-run-store.js";

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1] || "";
const rootDir = value("--root");
const runId = value("--run");
const operationId = value("--operation");
const configPath = value("--config");
const expectedDigest = value("--digest");
const token = process.env.AGENTIC_OS_PROCESS_TOKEN || "";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const store = new ImplementationRunStore({ rootDir });
let child = null;
let stopRequested = false;
let terminatingPid = null;

async function terminateChild() {
  if (child?.pid && terminatingPid !== child.pid) {
    terminatingPid = child.pid;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* stopped */ } }
    const timer = setTimeout(() => {
      if (child?.exitCode === null && child?.signalCode === null) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* stopped */ }
    }, 1500);
    timer.unref?.();
  }
}
async function requestStop() { stopRequested = true; await terminateChild(); }
process.on("SIGTERM", requestStop);
process.on("SIGINT", requestStop);

async function update(eventType, mutate) {
  return store.update(runId, { eventType, eventData: { operationId } }, (state) => {
    if (!token || state.supervisor?.token !== token) throw new Error("Managed process owner is fenced.");
    return mutate(state);
  });
}

async function main() {
  const configText = await fs.readFile(configPath, "utf8");
  if (crypto.createHash("sha256").update(configText).digest("hex") !== expectedDigest) throw new Error("Managed process configuration digest mismatch.");
  const config = JSON.parse(configText);
  if (config.schema !== "agentic-graph-managed-process/v1" || config.operationId !== operationId || !Array.isArray(config.argv)) throw new Error("Managed process configuration is invalid.");
  await assertExecutableProof(config.proof);
  const managerMarker = await processMarker(process.pid);
  if (!managerMarker) throw new Error("Managed process identity is unavailable.");
  await update("process.registered", (state) => {
    state.activeProcesses ||= {};
    if (state.activeProcesses[operationId]) throw new Error("Managed process operation is already registered.");
    state.activeProcesses[operationId] = { operationId, phase: config.phase, status: "registered", managerPid: process.pid, managerMarker, childPid: null, childMarker: null, registeredAt: new Date().toISOString() };
    return state;
  });
  const authorizationDeadline = Date.now() + 10000;
  while (Date.now() < authorizationDeadline) {
    const state = await store.read(runId);
    const entry = state.activeProcesses?.[operationId];
    if (state.supervisor?.token !== token || entry?.managerMarker !== managerMarker) return;
    if (entry.status === "authorized") break;
    await delay(20);
  }
  let state = await store.read(runId);
  if (state.activeProcesses?.[operationId]?.status !== "authorized") throw new Error("Managed process authorization timed out.");
  await update("process.starting", (current) => { current.activeProcesses[operationId].status = "starting"; return current; });
  await delay(50);
  if (stopRequested) {
    await update("process.start_aborted", (current) => { current.activeProcesses[operationId].status = "exited"; current.activeProcesses[operationId].exitCode = 143; return current; }).catch(() => undefined);
    process.exitCode = 143;
    return;
  }
  const childEnv = { ...process.env };
  delete childEnv.AGENTIC_OS_PROCESS_TOKEN;
  child = spawn(config.executable, config.argv, { cwd: config.cwd, env: childEnv, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  const childExit = new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve({ code: child.exitCode, signal: child.signalCode });
    else { child.once("exit", (code, signal) => resolve({ code, signal })); child.once("error", (error) => resolve({ code: null, signal: null, error })); }
  });
  const childClose = new Promise((resolve) => { child.once("close", (code, signal) => resolve({ code, signal })); child.once("error", (error) => resolve({ code: null, signal: null, error })); });
  if (stopRequested) await terminateChild();
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  if (stopRequested) await terminateChild();
  const childMarker = await processMarker(child.pid);
  if (!childMarker && child.exitCode === null && child.signalCode === null) { await requestStop(); throw new Error("Managed command identity is unavailable."); }
  await update("process.running", (current) => {
    const entry = current.activeProcesses[operationId];
    entry.status = childMarker ? "running" : "exited"; entry.childPid = child.pid; entry.childPgid = process.platform === "win32" ? null : child.pid; entry.childMarker = childMarker || null; entry.startedAt = new Date().toISOString();
    return current;
  });
  const monitor = setInterval(async () => {
    try {
      state = await store.read(runId);
      const entry = state.activeProcesses?.[operationId];
      const supervisorMarker = await processMarker(state.supervisor?.pid);
      if (state.supervisor?.token !== token || state.supervisor?.status !== "active" || entry?.managerMarker !== managerMarker || !supervisorMarker || supervisorMarker !== state.supervisor?.processMarker) await requestStop();
    } catch { await requestStop(); }
  }, 100);
  const timeout = setTimeout(requestStop, config.timeoutMs);
  await childExit;
  const result = await childClose;
  if (processGroupAlive(child.pid)) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* checked after grace */ }
    await delay(100);
    if (processGroupAlive(child.pid)) try { process.kill(-child.pid, "SIGKILL"); } catch { /* checked below */ }
    await delay(100);
    if (processGroupAlive(child.pid)) throw Object.assign(new Error("Managed command process group could not be proven stopped."), { code: "PROCESS_GROUP_CLEANUP_FAILED" });
  }
  clearInterval(monitor); clearTimeout(timeout);
  await update("process.exited", (current) => {
    const entry = current.activeProcesses?.[operationId];
    if (entry) { entry.status = "exited"; entry.exitCode = result.code; entry.exitSignal = result.signal; entry.exitedAt = new Date().toISOString(); }
    return current;
  }).catch(() => undefined);
  process.exitCode = Number.isInteger(result.code) ? result.code : 1;
}

main().catch((error) => { process.stderr.write(`managed process failed: ${error.message}\n`); process.exitCode = 1; });
