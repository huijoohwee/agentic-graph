import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { readStableBoundedFile } from "./bounded-file-reader.js";
import { IMPLEMENTATION_RUN_SCHEMA } from "./implementation-run-tool-contract.js";

const RUN_ID = /^ir_[a-f0-9]{24}$/;
const SECRET_KEY = /(?:authorization|credential|password|secret|token)$/i;
const MAX_EVENT_STRING = 4096;
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_INITIAL_STATE_BYTES = 512 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_ARTIFACT_BYTES = 11 * 1024 * 1024;

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stableValue(value[key]);
    return out;
  }, {});
};
export const stableJson = (value) => JSON.stringify(stableValue(value));
export const digestImplementationRunSpec = (spec) => crypto.createHash("sha256").update(stableJson(spec)).digest("hex");
export const implementationRunIdForKey = (key) => `ir_${crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 24)}`;

const redactEvent = (value, key = "") => {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactEvent(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([entryKey, entryValue]) => [entryKey, redactEvent(entryValue, entryKey)]));
  }
  return typeof value === "string" && value.length > MAX_EVENT_STRING
    ? `${value.slice(0, MAX_EVENT_STRING)}…[truncated]`
    : value;
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class ImplementationRunStore {
  constructor({
    rootDir,
    now = () => new Date(),
    stableFileReader = readStableBoundedFile,
  }) {
    this.rootDir = path.resolve(rootDir);
    this.baseDir = path.join(this.rootDir, ".knowgrph-workspace", "implementation-runs");
    this.now = now;
    this.stableFileReader = stableFileReader;
  }

  runDir(runId) {
    if (!RUN_ID.test(String(runId))) throw new Error("runId must match ir_<24 lowercase hex characters>.");
    return path.join(this.baseDir, runId);
  }

  statePath(runId) { return path.join(this.runDir(runId), "state.json"); }
  eventsDir(runId) { return path.join(this.runDir(runId), "events"); }
  eventPath(runId, revision) { return path.join(this.eventsDir(runId), `${String(revision).padStart(10, "0")}.json`); }

  async ensureBaseDirectory() {
    const workspace = path.join(this.rootDir, ".knowgrph-workspace");
    for (const directory of [workspace, this.baseDir]) {
      try { await fs.mkdir(directory, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
    }
    await this.assertBaseDirectory();
  }

  async assertBaseDirectory() {
    const rootReal = await fs.realpath(this.rootDir);
    for (const directory of [path.join(this.rootDir, ".knowgrph-workspace"), this.baseDir]) {
      await this.ensureSafeDirectory(directory);
      const real = await fs.realpath(directory);
      const relative = path.relative(rootReal, real);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Implementation-run state escapes runtime root: ${directory}`);
    }
  }

  async ensureSafeDirectory(directory) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe implementation-run directory: ${directory}`);
  }

  async writeAtomic(filePath, value, maximumBytes = MAX_STATE_BYTES) {
    const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > maximumBytes) throw Object.assign(new Error(`Durable implementation-run JSON exceeds its ${maximumBytes}-byte bound.`), { code: "DURABLE_STATE_TOO_LARGE" });
    await fs.writeFile(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(temporary, filePath);
  }

  async withLock(runId, callback) {
    await this.assertBaseDirectory();
    await this.ensureSafeDirectory(this.runDir(runId));
    const lockPath = path.join(this.runDir(runId), ".state.lock");
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        const handle = await fs.open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: this.now().toISOString() }));
          return await callback();
        } finally {
          await handle.close();
          await fs.unlink(lockPath).catch(() => undefined);
        }
      } catch (error) {
        if (error?.code !== "EEXIST" || Date.now() >= deadline) throw error;
        const lockStat = await fs.stat(lockPath).catch(() => null);
        if (lockStat && Date.now() - lockStat.mtimeMs > 30000) await fs.unlink(lockPath).catch(() => undefined);
        await delay(25);
      }
    }
  }

  async create({ spec, plan }) {
    const runId = implementationRunIdForKey(spec.idempotencyKey);
    const specDigest = digestImplementationRunSpec(spec);
    await this.ensureBaseDirectory();
    const staging = path.join(this.baseDir, `.init-${runId}-${crypto.randomUUID()}`);
    try {
      await fs.mkdir(staging, { mode: 0o700 });
      await fs.mkdir(path.join(staging, "events"), { mode: 0o700 });
      const timestamp = this.now().toISOString();
      const state = {
        schema: IMPLEMENTATION_RUN_SCHEMA,
        runId,
        revision: 1,
        specDigest,
        planDigest: digestImplementationRunSpec(plan),
        state: "queued",
        attempt: 0,
        supervisorLaunches: 0,
        automaticRestarts: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        spec,
        plan,
        supervisor: { pid: null, status: "launch_pending", heartbeatAt: null },
        activeProcesses: {},
        control: null,
        retryContext: null,
        coordination: null,
        review: { decision: "pending", note: "", decidedAt: null },
        result: null,
        error: null,
      };
      const stateText = `${JSON.stringify(state, null, 2)}\n`;
      if (Buffer.byteLength(stateText) > MAX_INITIAL_STATE_BYTES) throw Object.assign(new Error(`Initial implementation-run state exceeds its ${MAX_INITIAL_STATE_BYTES}-byte bound and reserved growth headroom.`), { code: "DURABLE_STATE_TOO_LARGE" });
      await fs.writeFile(path.join(staging, "state.json"), stateText, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await fs.writeFile(path.join(staging, "events", "0000000001.json"), `${JSON.stringify({ at: timestamp, revision: 1, type: "run.queued", data: { state: "queued" } })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await fs.rename(staging, this.runDir(runId));
      return { state, created: true };
    } catch (error) {
      await fs.unlink(path.join(staging, "state.json")).catch(() => undefined);
      await fs.unlink(path.join(staging, "events", "0000000001.json")).catch(() => undefined);
      await fs.rmdir(path.join(staging, "events")).catch(() => undefined);
      await fs.rmdir(staging).catch(() => undefined);
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
      const existing = await this.read(runId);
      if (existing.specDigest !== specDigest) {
        const conflict = new Error("idempotencyKey is already bound to a different implementation-run specification.");
        conflict.code = "IDEMPOTENCY_CONFLICT";
        throw conflict;
      }
      return { state: existing, created: false };
    }
  }

  async read(runId) {
    await this.assertBaseDirectory();
    const runDirectory = this.runDir(runId);
    await this.ensureSafeDirectory(runDirectory);
    let content;
    try {
      ({ content } = await this.stableFileReader({
        filePath: this.statePath(runId),
        containingDirectory: runDirectory,
        maximumBytes: MAX_STATE_BYTES,
      }));
    } catch (error) {
      if (error?.code === "ENOENT") throw error;
      const tooLarge = error?.code === "BOUNDED_FILE_TOO_LARGE";
      throw Object.assign(
        new Error(tooLarge
          ? `Durable implementation-run state exceeds its ${MAX_STATE_BYTES}-byte read bound: ${runId}`
          : `Unsafe or changing implementation-run state file: ${runId}`),
        { code: tooLarge ? "DURABLE_STATE_TOO_LARGE" : "DURABLE_STATE_UNSAFE" },
      );
    }
    const state = JSON.parse(content.toString("utf8"));
    if (state.schema !== IMPLEMENTATION_RUN_SCHEMA || state.runId !== runId || !Number.isInteger(state.revision)) {
      throw new Error(`Invalid durable implementation-run state: ${runId}`);
    }
    if (state.specDigest !== digestImplementationRunSpec(state.spec)) throw new Error(`Implementation-run specification digest mismatch: ${runId}`);
    if (state.planDigest !== digestImplementationRunSpec(state.plan)) throw new Error(`Implementation-run plan digest mismatch: ${runId}`);
    return state;
  }

  async update(runId, { expectedRevision, eventType, eventData = {} }, mutate) {
    return this.withLock(runId, async () => {
      const current = await this.read(runId);
      if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
        const conflict = new Error(`Run revision is ${current.revision}, not expected ${expectedRevision}.`);
        conflict.code = "REVISION_CONFLICT";
        throw conflict;
      }
      const next = await mutate(structuredClone(current));
      if (!next || next.runId !== runId || next.schema !== IMPLEMENTATION_RUN_SCHEMA) throw new Error("State update returned an invalid run record.");
      next.revision = current.revision + 1;
      next.updatedAt = this.now().toISOString();
      const event = redactEvent({ at: next.updatedAt, revision: next.revision, type: eventType, data: eventData });
      await this.ensureSafeDirectory(this.eventsDir(runId));
      await this.writeAtomic(this.eventPath(runId, next.revision), event, MAX_EVENT_BYTES);
      await this.writeAtomic(this.statePath(runId), next);
      return next;
    });
  }

  async events(runId) {
    const state = await this.read(runId);
    await this.ensureSafeDirectory(this.eventsDir(runId));
    const entries = (await fs.readdir(this.eventsDir(runId), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && /^\d{10}\.json$/.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((entry) => Number(entry.name.slice(0, 10)) <= state.revision)
      .slice(-200);
    const output = [];
    let bytes = 0;
    for (const entry of entries) {
      const filePath = path.join(this.eventsDir(runId), entry.name);
      let content;
      try {
        ({ content } = await this.stableFileReader({
          filePath,
          containingDirectory: this.eventsDir(runId),
          maximumBytes: MAX_EVENT_BYTES,
        }));
      } catch (error) {
        const tooLarge = error?.code === "BOUNDED_FILE_TOO_LARGE";
        throw Object.assign(
          new Error(tooLarge
            ? `Durable implementation-run event exceeds its ${MAX_EVENT_BYTES}-byte read bound.`
            : `Unsafe or changing implementation-run event: ${entry.name}`),
          { code: tooLarge ? "DURABLE_EVENT_TOO_LARGE" : "DURABLE_EVENT_UNSAFE" },
        );
      }
      if (bytes + content.byteLength > 1024 * 1024) break;
      bytes += content.byteLength;
      output.push(JSON.parse(content.toString("utf8")));
    }
    return output;
  }

  async writeArtifact(runId, fileName, content, { supervisorToken = "" } = {}) {
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(String(fileName))) throw new Error("Implementation-run artifact name is invalid.");
    const bytes = Buffer.isBuffer(content)
      ? content
      : Buffer.from(String(content), "utf8");
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw Object.assign(new Error(`Implementation-run artifact exceeds its ${MAX_ARTIFACT_BYTES}-byte bound.`), { code: "ARTIFACT_TOO_LARGE" });
    const write = async () => {
      await this.ensureSafeDirectory(this.runDir(runId));
      if (supervisorToken) {
        const state = await this.read(runId);
        if (state.supervisor?.token !== supervisorToken) throw Object.assign(new Error("Supervisor ownership was fenced before artifact write."), { code: "SUPERVISOR_FENCED" });
      }
      const filePath = path.join(this.runDir(runId), fileName);
      const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
      await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      try {
        await fs.link(temporary, filePath);
      } catch (error) {
        if (error?.code === "EEXIST") {
          const conflict = new Error(`Implementation-run artifact is immutable and already exists: ${fileName}`);
          conflict.code = "ARTIFACT_EXISTS";
          throw conflict;
        }
        throw error;
      } finally {
        await fs.unlink(temporary).catch(() => undefined);
      }
      return filePath;
    };
    return supervisorToken ? this.withLock(runId, write) : write();
  }

  async readArtifact(runId, fileName, {
    expectedDigest = "",
    expectedBytes,
    maximumBytes = MAX_ARTIFACT_BYTES,
    requireUtf8 = false,
  } = {}) {
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(String(fileName))) {
      throw Object.assign(
        new Error("Implementation-run artifact name is invalid."),
        { code: "ARTIFACT_NAME_INVALID" },
      );
    }
    if (
      !Number.isSafeInteger(maximumBytes)
      || maximumBytes < 1
      || maximumBytes > MAX_ARTIFACT_BYTES
    ) {
      throw new Error(`Implementation-run artifact read bound must be from 1 to ${MAX_ARTIFACT_BYTES} bytes.`);
    }
    if (
      expectedDigest
      && !/^sha256:[0-9a-f]{64}$/.test(String(expectedDigest))
    ) {
      throw new Error("Expected implementation-run artifact digest must be a lowercase sha256 identity.");
    }
    if (
      expectedBytes !== undefined
      && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
    ) {
      throw new Error("Expected implementation-run artifact bytes must be a non-negative integer.");
    }
    if (typeof requireUtf8 !== "boolean") {
      throw new Error("Implementation-run artifact UTF-8 policy must be boolean.");
    }

    await this.assertBaseDirectory();
    const runDirectory = this.runDir(runId);
    await this.ensureSafeDirectory(runDirectory);
    const filePath = path.join(runDirectory, fileName);
    let content;
    try {
      ({ content } = await this.stableFileReader({
        filePath,
        containingDirectory: runDirectory,
        maximumBytes,
      }));
    } catch (error) {
      const tooLarge = error?.code === "BOUNDED_FILE_TOO_LARGE";
      throw Object.assign(
        new Error(tooLarge
          ? `Implementation-run artifact exceeds its ${maximumBytes}-byte read bound.`
          : `Unsafe or changing implementation-run artifact: ${fileName}`),
        { code: tooLarge ? "ARTIFACT_TOO_LARGE" : "ARTIFACT_UNSAFE" },
      );
    }
    if (expectedBytes !== undefined && content.byteLength !== expectedBytes) {
      throw Object.assign(
        new Error(`Implementation-run artifact byte count does not match its receipt: ${fileName}`),
        { code: "ARTIFACT_BYTES_MISMATCH" },
      );
    }
    const digest = `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
    if (expectedDigest && digest !== expectedDigest) {
      throw Object.assign(
        new Error(`Implementation-run artifact digest does not match its receipt: ${fileName}`),
        { code: "ARTIFACT_DIGEST_MISMATCH" },
      );
    }
    let decoded;
    try {
      decoded = requireUtf8
        ? new TextDecoder("utf-8", { fatal: true }).decode(content)
        : content.toString("utf8");
    } catch {
      throw Object.assign(
        new Error(`Implementation-run artifact is not valid UTF-8: ${fileName}`),
        { code: "ARTIFACT_UTF8_INVALID" },
      );
    }
    return Object.freeze({
      artifact: fileName,
      bytes: content.byteLength,
      digest,
      content: decoded,
    });
  }

  async runIdPage({ afterRunId = "", limit = 200 } = {}) {
    if (afterRunId && !RUN_ID.test(afterRunId)) throw new Error("Implementation-run cursor is invalid.");
    const pageLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    try { await this.assertBaseDirectory(); } catch (error) {
      if (error?.code === "ENOENT") return { runIds: [], hasMore: false };
      throw error;
    }
    const candidates = [];
    const directory = await fs.opendir(this.baseDir);
    for await (const entry of directory) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !RUN_ID.test(entry.name) || (afterRunId && entry.name <= afterRunId)) continue;
      candidates.push(entry.name);
      candidates.sort();
      if (candidates.length > pageLimit + 1) candidates.pop();
    }
    return { runIds: candidates.slice(0, pageLimit), hasMore: candidates.length > pageLimit };
  }
}
