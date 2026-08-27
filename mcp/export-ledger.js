import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ExportPublishError,
  createExportIdentity,
  createExportPublishError,
} from "./export-publish-contract.js";
import { acquireExportIdentityLock } from "./export-identity-lock.js";

export const FLEET_LEDGER_SCHEMA = "agenticgraph-export-fleet/v1";
export const FLEET_LEDGER_ENV = "AGENTICGRAPH_EXPORT_FLEET_PATH";
export const FLEET_LEDGER_GENESIS_HASH = "0".repeat(64);
export const FLEET_LEDGER_START_MARKER = "<!-- agenticgraph-export-ledger:start -->";
export const FLEET_LEDGER_TEMPLATE = `---
title: "AgenticGraph External Export Fleet Ledger"
schema: "${FLEET_LEDGER_SCHEMA}"
---

# AgenticGraph External Export Fleet Ledger

This append-only ledger records provider artifact identities for stable in-place
\`export.publish\` updates. Each machine entry hashes its canonical payload and
the prior entry hash. Do not edit entries by hand.

${FLEET_LEDGER_START_MARKER}
`;

const moduleRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryLinePattern = /^<!-- agenticgraph-export-ledger:entry (\{.*\}) -->$/;
const hashPattern = /^[0-9a-f]{64}$/;
const allowedEntryKeys = Object.freeze([
  "schema",
  "sequence",
  "timestamp",
  "identity_key",
  "artifact_id",
  "provider",
  "kind",
  "status",
  "fallback_used",
  "source_sha256",
  "api_calls",
  "estimated_cost_usd",
  "doc_id",
  "url",
  "error_code",
  "previous_hash",
  "entry_hash",
]);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";

function ledgerError(code, message, options = {}) {
  return createExportPublishError(code, message, options);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalFleetEntryJson(entry) {
  return JSON.stringify(canonicalize(entry));
}

function hashFleetEntryPayload(entry) {
  return createHash("sha256").update(canonicalFleetEntryJson(entry)).digest("hex");
}

function validatedUrl(value) {
  const raw = text(value);
  if (!raw || raw.length > 2048) throw new Error("url must be a bounded HTTPS URL");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("url must use HTTPS without embedded user credentials");
  }
  for (const key of parsed.searchParams.keys()) {
    if (/^(?:access_token|api_key|key|sig|signature|token|code|password|secret)$/i.test(key)) {
      throw new Error(`url must not contain credential query parameter ${key}`);
    }
  }
  return parsed.toString();
}

function validatedTimestamp(value) {
  const raw = text(value);
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== raw) {
    throw new Error("timestamp must be a canonical ISO-8601 UTC timestamp");
  }
  return raw;
}

function validateStoredEntry(entry, expected) {
  if (!isRecord(entry)) throw new Error("entry must be an object");
  const unknown = Object.keys(entry).filter((key) => !allowedEntryKeys.includes(key));
  if (unknown.length > 0) throw new Error(`entry contains unsupported fields: ${unknown.sort().join(", ")}`);
  if (entry.schema !== FLEET_LEDGER_SCHEMA) throw new Error(`entry schema must be ${FLEET_LEDGER_SCHEMA}`);
  if (!Number.isInteger(entry.sequence) || entry.sequence !== expected.sequence) {
    throw new Error(`entry sequence must be ${expected.sequence}`);
  }
  validatedTimestamp(entry.timestamp);
  const identity = createExportIdentity(entry);
  if (entry.identity_key !== identity.key) throw new Error("entry identity_key does not match its artifact/provider/kind tuple");
  if (!text(entry.artifact_id) || entry.artifact_id !== identity.artifact_id) throw new Error("entry artifact_id is invalid");
  if (!hashPattern.test(text(entry.source_sha256))) throw new Error("entry source_sha256 must be a lowercase SHA-256 digest");
  if (entry.status !== "success" && entry.status !== "failure") throw new Error("entry status must be success or failure");
  if (typeof entry.fallback_used !== "boolean") throw new Error("entry fallback_used must be a boolean");
  if (!Number.isInteger(entry.api_calls) || entry.api_calls < 0) throw new Error("entry api_calls must be a non-negative integer");
  if (!Number.isFinite(entry.estimated_cost_usd) || entry.estimated_cost_usd < 0) {
    throw new Error("entry estimated_cost_usd must be a non-negative number");
  }
  if (entry.previous_hash !== expected.previousHash) throw new Error("entry previous_hash does not match the prior entry");
  if (!hashPattern.test(text(entry.entry_hash))) throw new Error("entry entry_hash must be a lowercase SHA-256 digest");
  if (entry.status === "success") {
    if (!text(entry.doc_id) || entry.doc_id.length > 512) throw new Error("successful entry requires a bounded doc_id");
    validatedUrl(entry.url);
    if (Object.hasOwn(entry, "error_code")) throw new Error("successful entry must not contain error_code");
  } else {
    if (!text(entry.error_code) || entry.error_code.length > 128) throw new Error("failure entry requires a bounded error_code");
    if (Object.hasOwn(entry, "doc_id") || Object.hasOwn(entry, "url")) {
      throw new Error("failure entry must not contain doc_id or url");
    }
  }
  const { entry_hash: ignored, ...payload } = entry;
  if (hashFleetEntryPayload(payload) !== entry.entry_hash) throw new Error("entry hash verification failed");
  return Object.freeze({ ...entry });
}

export function parseAndVerifyFleetLedger(source, label = "FLEET.md") {
  const normalized = String(source || "").replace(/\r\n?/g, "\n");
  const firstMarker = normalized.indexOf(FLEET_LEDGER_START_MARKER);
  if (firstMarker < 0 || normalized.indexOf(FLEET_LEDGER_START_MARKER, firstMarker + 1) >= 0) {
    throw ledgerError("LEDGER_CORRUPT", `${label} must contain exactly one export ledger start marker.`);
  }
  const expectedPrelude = FLEET_LEDGER_TEMPLATE.trimEnd();
  const actualPrelude = normalized.slice(0, firstMarker + FLEET_LEDGER_START_MARKER.length);
  if (actualPrelude !== expectedPrelude) {
    throw ledgerError("LEDGER_CORRUPT", `${label} has a modified export ledger header or start marker.`);
  }
  const markerLineEnd = normalized.indexOf("\n", firstMarker);
  if (markerLineEnd >= 0 && markerLineEnd !== firstMarker + FLEET_LEDGER_START_MARKER.length) {
    throw ledgerError("LEDGER_CORRUPT", `${label} has unexpected content on its export ledger marker line.`);
  }
  const tail = markerLineEnd < 0 ? "" : normalized.slice(markerLineEnd + 1);
  const entries = [];
  let previousHash = FLEET_LEDGER_GENESIS_HASH;
  try {
    for (const [index, line] of tail.split("\n").entries()) {
      if (!line.trim()) continue;
      const match = line.match(entryLinePattern);
      if (!match) throw new Error(`unexpected content after ledger marker on data line ${index + 1}`);
      const rawEntry = JSON.parse(match[1]);
      const entry = validateStoredEntry(rawEntry, { sequence: entries.length + 1, previousHash });
      entries.push(entry);
      previousHash = entry.entry_hash;
    }
  } catch (cause) {
    if (cause instanceof ExportPublishError) throw cause;
    throw ledgerError("LEDGER_CORRUPT", `${label} failed hash-chain verification: ${cause.message}.`, { cause });
  }
  return Object.freeze({
    schema: FLEET_LEDGER_SCHEMA,
    entry_count: entries.length,
    head_hash: previousHash,
    entries: Object.freeze(entries),
  });
}

export function resolveFleetLedgerPath(options = {}) {
  const env = options.env ?? process.env;
  const selected = text(options.ledgerPath) || text(env[FLEET_LEDGER_ENV]);
  return selected ? path.resolve(selected) : path.resolve(options.repoRoot ?? moduleRepoRoot, "FLEET.md");
}

export async function readFleetLedger(options = {}) {
  const ledgerPath = resolveFleetLedgerPath(options);
  try {
    const verified = parseAndVerifyFleetLedger(await fs.readFile(ledgerPath, "utf8"), ledgerPath);
    return Object.freeze({ ...verified, ledger_path: ledgerPath });
  } catch (error) {
    if (error instanceof ExportPublishError) throw error;
    throw ledgerError("LEDGER_CORRUPT", `Unable to read export ledger ${ledgerPath}.`, { cause: error });
  }
}

export const verifyFleetLedger = readFleetLedger;

async function ensureLedgerFile(ledgerPath) {
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  try {
    const handle = await fs.open(ledgerPath, "wx", 0o600);
    try {
      await handle.writeFile(FLEET_LEDGER_TEMPLATE, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

export function resolveFleetLedgerLockRoot(ledgerPath) {
  return path.join(path.dirname(path.resolve(ledgerPath)), ".agenticgraph-export-ledger-locks-v1");
}

export async function acquireFleetLedgerLock(ledgerPath, options = {}) {
  const resolvedLedgerPath = path.resolve(ledgerPath);
  return acquireExportIdentityLock({
    identityKey: `fleet-ledger:${resolvedLedgerPath}`,
    publicationNamespace: resolvedLedgerPath,
  }, {
    lockRoot: options.ledgerLockRoot ?? resolveFleetLedgerLockRoot(resolvedLedgerPath),
    timeoutMs: options.lockTimeoutMs,
    retryMs: options.lockRetryMs,
    staleMs: options.lockStaleMs,
    hostname: options.lockHostname,
    isProcessAlive: options.lockIsProcessAlive,
    pid: options.lockPid,
    now: options.lockNow,
  });
}

function buildPendingEntry(input, verified, options) {
  if (!isRecord(input)) throw new TypeError("Fleet ledger entry must be an object.");
  const identity = createExportIdentity(input);
  const status = input.status;
  const timestamp = options.timestamp ?? new Date().toISOString();
  const payload = {
    schema: FLEET_LEDGER_SCHEMA,
    sequence: verified.entry_count + 1,
    timestamp,
    identity_key: identity.key,
    artifact_id: identity.artifact_id,
    provider: identity.provider,
    kind: identity.kind,
    status,
    fallback_used: input.fallback_used === true,
    source_sha256: text(input.source_sha256),
    api_calls: input.api_calls ?? 0,
    estimated_cost_usd: input.estimated_cost_usd ?? 0,
    previous_hash: verified.head_hash,
  };
  if (status === "success") {
    payload.doc_id = text(input.doc_id);
    payload.url = validatedUrl(input.url);
  } else if (status === "failure") {
    if (Object.hasOwn(input, "doc_id") || Object.hasOwn(input, "url")) {
      throw new TypeError("Failure ledger input must not contain doc_id or url.");
    }
    payload.error_code = text(input.error_code);
  } else {
    throw new TypeError("Fleet ledger entry status must be success or failure.");
  }
  return { ...payload, entry_hash: hashFleetEntryPayload(payload) };
}

export async function appendFleetExportEntry(input, options = {}) {
  const ledgerPath = resolveFleetLedgerPath(options);
  let releaseLock;
  try {
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    releaseLock = await acquireFleetLedgerLock(ledgerPath, options);
    await ensureLedgerFile(ledgerPath);
    const verified = parseAndVerifyFleetLedger(await fs.readFile(ledgerPath, "utf8"), ledgerPath);
    const entry = buildPendingEntry(input, verified, options);
    validateStoredEntry(entry, { sequence: verified.entry_count + 1, previousHash: verified.head_hash });
    const handle = await fs.open(ledgerPath, "a", 0o600);
    try {
      await handle.writeFile(`<!-- agenticgraph-export-ledger:entry ${canonicalFleetEntryJson(entry)} -->\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return Object.freeze(entry);
  } catch (error) {
    if (error instanceof ExportPublishError) throw error;
    throw ledgerError("LEDGER_WRITE_FAILED", `Failed to append export ledger ${ledgerPath}.`, { cause: error });
  } finally {
    if (releaseLock) {
      try {
        await releaseLock();
      } catch {
        // A surviving lock intentionally forces subsequent writers to fail closed.
      }
    }
  }
}

export function findLatestSuccessfulExportInEntries(entries, identityInput) {
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array.");
  const identity = createExportIdentity(identityInput);
  return entries.findLast((entry) => entry.status === "success" && entry.identity_key === identity.key) ?? null;
}

export async function findLatestSuccessfulExport(identityInput, options = {}) {
  const ledger = await readFleetLedger(options);
  return findLatestSuccessfulExportInEntries(ledger.entries, identityInput);
}
