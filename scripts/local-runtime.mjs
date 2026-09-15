#!/usr/bin/env node

import {
  endLocalRuntimeTurn,
  ensureLocalRuntime,
  readLocalRuntimeStatus,
  stopLocalRuntime,
} from "./local-runtime-lib.mjs";
import {
  readSessionRuntimeStatus,
  startSessionRuntime,
  stopSessionRuntime,
} from "./local-runtime-session-lib.mjs";
import { LOCAL_RUNTIME_SCHEMA } from "./local-runtime-supervisor-lib.mjs";

const [action, ...args] = process.argv.slice(2);
const json = args.includes("--json");

try {
  if (!["ensure", "status", "stop", "turn-end", "session-start", "session-status", "session-stop"].includes(action)) usage();
  const options = {
    repository: readOption(args, "repository") || process.cwd(),
    agenticCanvasOsRoot: readOption(args, "agentic-os-root") || readOption(args, "agentic-canvas-os-root"),
    timeoutMs: Number(readOption(args, "timeout-ms") || 120_000),
    sessionId: readOption(args, "session") || process.env.AGENTIC_SESSION_ID || "",
  };
  const result = action === "ensure"
    ? await ensureLocalRuntime(options)
    : action === "status"
      ? await readLocalRuntimeStatus(options)
      : action === "stop"
        ? await stopLocalRuntime(options)
        : action === "turn-end"
          ? await endLocalRuntimeTurn(options)
          : action === "session-start"
            ? await startSessionRuntime(options)
            : action === "session-status"
              ? await readSessionRuntimeStatus(options)
              : await stopSessionRuntime(options);
  if (json) console.log(JSON.stringify(redactJsonResult(result)));
  else printHuman(result);
  if ((action === "status" || action === "turn-end") && !result.ready) process.exitCode = 1;
  if (action === "session-status" && result.status !== "session-dev") process.exitCode = 1;
} catch (error) {
  const result = {
    schema: LOCAL_RUNTIME_SCHEMA,
    status: "error",
    ready: false,
    error: { code: "local_runtime_failed", message: error instanceof Error ? error.message : String(error) },
  };
  if (json) console.log(JSON.stringify(redactJsonResult(result)));
  else console.error(result.error.message);
  process.exitCode = 1;
}

function readOption(values, name) {
  const prefix = `--${name}=`;
  const match = values.find(value => value.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function redactJsonResult(result) {
  if (!result || typeof result !== "object") return result;
  const clone = JSON.parse(JSON.stringify(result));
  redactSensitiveFields(clone);
  return clone;
}

function redactSensitiveFields(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) redactSensitiveFields(entry);
    return;
  }
  if (typeof value.sessionId === "string" && value.sessionId) value.sessionId = "[redacted]";
  if (typeof value.ownershipTokenDigest === "string" && value.ownershipTokenDigest) value.ownershipTokenDigest = "[redacted]";
  for (const nested of Object.values(value)) redactSensitiveFields(nested);
}

function printHuman(result) {
  if (result.status === "session-dev") {
    console.log(`agentic-graph session-owned Vite is available at http://${result.host}:${result.ports.apex}/.`);
    return;
  }
  if (result.status === "session-stopped") {
    console.log("agentic-graph session-owned Vite is stopped.");
    return;
  }
  if (!result.ready) {
    console.log(`agentic-graph local runtime ${result.status}.`);
    if (result.reason) console.log(result.reason);
    return;
  }
  console.log(`agentic-graph Home Apex runtime-ready at http://${result.host}:${result.ports.apex}/`);
  console.log(`agentic-graph ${result.source.revision}`);
  console.log(`Agentic Canvas OS and catalog ${result.agenticCanvasOs.revision}`);
  console.log(`Storage proxy HTTP ${result.probes.storageProxy}`);
}

function usage() {
  console.error("Usage: node scripts/local-runtime.mjs <ensure|status|stop|turn-end|session-start|session-status|session-stop> [--repository=<canonical-agentic-graph-root>] [--session=<stable-session-id>] [--timeout-ms=120000] [--json]");
  process.exit(2);
}
